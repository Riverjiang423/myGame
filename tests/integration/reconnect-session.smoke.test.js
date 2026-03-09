const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');

function setEnv(vars) {
  const previous = {};
  Object.keys(vars).forEach((key) => {
    previous[key] = process.env[key];
    const value = vars[key];
    if (value === undefined || value === null) {
      delete process.env[key];
      return;
    }
    process.env[key] = String(value);
  });
  return () => {
    Object.keys(previous).forEach((key) => {
      if (previous[key] === undefined) {
        delete process.env[key];
        return;
      }
      process.env[key] = previous[key];
    });
  };
}

function waitForEventMatching(socket, eventName, predicate, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for socket event: ${eventName}`));
    }, timeoutMs);

    const handler = (payload) => {
      try {
        if (!predicate || predicate(payload)) {
          cleanup();
          resolve(payload);
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    function cleanup() {
      clearTimeout(timer);
      socket.off(eventName, handler);
      socket.off('connect_error', onError);
      socket.off('error', onError);
    }

    socket.on(eventName, handler);
    socket.once('connect_error', onError);
    socket.once('error', onError);
  });
}

function waitForNoEvent(socket, eventName, timeoutMs = 350) {
  return new Promise((resolve, reject) => {
    const onEvent = () => {
      cleanup();
      reject(new Error(`unexpected event received: ${eventName}`));
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
    }

    socket.on(eventName, onEvent);
  });
}

async function disconnectClient(client) {
  if (!client || client.disconnected) {
    return;
  }
  await new Promise((resolve) => {
    client.once('disconnect', () => resolve());
    client.disconnect();
  });
}

async function waitForCondition(fn, timeoutMs = 2500, stepMs = 25) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  throw new Error('condition wait timeout');
}

async function startTestRuntime() {
  const restoreEnv = setEnv({
    APP_START_MODE: 'local',
    AUTO_OPEN_BROWSER: '0',
    APP_DISTRIBUTION_MODE: '0',
    PORT: '0',
    DISCONNECT_GRACE_MS: '180'
  });

  const modulePaths = [
    '../../src/config/app',
    '../../src/config/socket',
    '../../src/bootstrap/app'
  ].map((id) => require.resolve(id));

  modulePaths.forEach((p) => {
    delete require.cache[p];
  });

  const { startApp } = require('../../src/bootstrap/app');
  const runtime = await startApp({ registerSignalHandlers: false });
  return { runtime, restoreEnv };
}

async function createConnectedClient(baseUrl) {
  const client = createClient(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000
  });
  await waitForEventMatching(client, 'connect', () => true);
  return client;
}

test('reconnect_session: reconnect succeeds within grace period', { concurrency: false }, async () => {
  const { runtime, restoreEnv } = await startTestRuntime();
  let c1 = null;
  let c2 = null;

  try {
    const address = runtime.getAddress();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const roomStore = runtime.app.locals.roomStore;
    const roomId = roomStore.getDefaultRoomId();
    const playerToken = 'RECONN_OK_A';

    c1 = await createConnectedClient(baseUrl);
    const joinUpdate = waitForEventMatching(
      c1,
      'room_update',
      (payload) => payload && payload.id === roomId && Array.isArray(payload.players)
        && payload.players.some((p) => p.id === playerToken)
    );
    c1.emit('join_room', roomId, 'ReconnectUserA', playerToken);
    await joinUpdate;

    await disconnectClient(c1);
    c1 = null;

    await waitForCondition(() => {
      const room = roomStore.getRoom(roomId);
      return Boolean(room && room.players.has(playerToken) && room.players.get(playerToken).online === false);
    }, 1200, 20);

    c2 = await createConnectedClient(baseUrl);
    const recoverUpdate = waitForEventMatching(
      c2,
      'room_update',
      (payload) => payload && payload.id === roomId && Array.isArray(payload.players)
        && payload.players.some((p) => p.id === playerToken)
    );
    c2.emit('reconnect_session', { roomId, playerToken });
    await recoverUpdate;

    const roomAfterReconnect = roomStore.getRoom(roomId);
    assert.ok(roomAfterReconnect);
    assert.equal(roomAfterReconnect.players.size, 1);
    assert.ok(roomAfterReconnect.players.has(playerToken));
    assert.equal(roomAfterReconnect.players.get(playerToken).online, true);
    assert.equal(roomAfterReconnect.players.get(playerToken).socketId, c2.id);
  } finally {
    await disconnectClient(c1);
    await disconnectClient(c2);
    await runtime.close();
    restoreEnv();
  }
});

test('reconnect_session: reconnect fails after grace period and requires new join flow', { concurrency: false }, async () => {
  const { runtime, restoreEnv } = await startTestRuntime();
  let c1 = null;
  let c2 = null;

  try {
    const address = runtime.getAddress();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const roomStore = runtime.app.locals.roomStore;
    const roomId = roomStore.getDefaultRoomId();
    const playerToken = 'RECONN_EXPIRED_A';

    c1 = await createConnectedClient(baseUrl);
    const joinUpdate = waitForEventMatching(
      c1,
      'room_update',
      (payload) => payload && payload.id === roomId && Array.isArray(payload.players)
        && payload.players.some((p) => p.id === playerToken)
    );
    c1.emit('join_room', roomId, 'ReconnectExpireUser', playerToken);
    await joinUpdate;

    await disconnectClient(c1);
    c1 = null;

    await waitForCondition(() => !roomStore.hasRoom(roomId), 3000, 30);
    assert.equal(roomStore.hasRoom(roomId), false);

    c2 = await createConnectedClient(baseUrl);
    c2.emit('reconnect_session', { roomId, playerToken });
    await waitForNoEvent(c2, 'room_update', 420);
    assert.equal(roomStore.hasRoom(roomId), false);

    const joinAsNewSession = waitForEventMatching(
      c2,
      'room_update',
      (payload) => payload
        && payload.id === roomId
        && payload.ownerId === playerToken
        && Array.isArray(payload.players)
        && payload.players.length === 1
        && payload.players[0].id === playerToken
    );
    c2.emit('join_room', roomId, 'ReconnectExpireUser', playerToken);
    await joinAsNewSession;

    const recreatedRoom = roomStore.getRoom(roomId);
    assert.ok(recreatedRoom);
    assert.equal(recreatedRoom.ownerId, playerToken);
    assert.equal(recreatedRoom.players.size, 1);
    assert.equal(recreatedRoom.players.get(playerToken).online, true);
  } finally {
    await disconnectClient(c1);
    await disconnectClient(c2);
    await runtime.close();
    restoreEnv();
  }
});
