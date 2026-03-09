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
    DISCONNECT_GRACE_MS: '120'
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

test('room lifecycle: owner transfer on leave and empty room cleanup on active leave', { concurrency: false }, async () => {
  const { runtime, restoreEnv } = await startTestRuntime();
  let c1 = null;
  let c2 = null;

  try {
    const address = runtime.getAddress();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const roomStore = runtime.app.locals.roomStore;
    const roomId = roomStore.getDefaultRoomId();

    c1 = await createConnectedClient(baseUrl);
    c2 = await createConnectedClient(baseUrl);

    const ownerToken = 'OWNER_A';
    const secondToken = 'PLAYER_B';

    const c1OwnerUpdate = waitForEventMatching(
      c1,
      'room_update',
      (payload) => payload && payload.id === roomId && payload.ownerId === ownerToken
    );
    c1.emit('join_room', roomId, 'OwnerUser', ownerToken);
    await c1OwnerUpdate;

    const c1TwoPlayersUpdate = waitForEventMatching(
      c1,
      'room_update',
      (payload) => payload
        && payload.id === roomId
        && Array.isArray(payload.players)
        && payload.players.some((p) => p.id === ownerToken)
        && payload.players.some((p) => p.id === secondToken)
    );
    c2.emit('join_room', roomId, 'SecondUser', secondToken);
    await c1TwoPlayersUpdate;

    const roomAfterJoin = roomStore.getRoom(roomId);
    assert.ok(roomAfterJoin);
    assert.equal(roomAfterJoin.ownerId, ownerToken);
    assert.equal(roomAfterJoin.players.size, 2);

    const leftAck = waitForEventMatching(c1, 'left_room', () => true);
    const c2OwnerTransferUpdate = waitForEventMatching(
      c2,
      'room_update',
      (payload) => payload
        && payload.id === roomId
        && payload.ownerId === secondToken
        && Array.isArray(payload.players)
        && payload.players.length === 1
        && payload.players[0].id === secondToken
    );
    c1.emit('leave_room');
    await leftAck;
    await c2OwnerTransferUpdate;

    const roomAfterOwnerLeave = roomStore.getRoom(roomId);
    assert.ok(roomAfterOwnerLeave);
    assert.equal(roomAfterOwnerLeave.ownerId, secondToken);
    assert.equal(roomAfterOwnerLeave.players.size, 1);

    const secondLeftAck = waitForEventMatching(c2, 'left_room', () => true);
    c2.emit('leave_room');
    await secondLeftAck;

    assert.equal(roomStore.hasRoom(roomId), false);
  } finally {
    await disconnectClient(c1);
    await disconnectClient(c2);
    await runtime.close();
    restoreEnv();
  }
});

test('room lifecycle: disconnect keeps room during grace period then cleans up', { concurrency: false }, async () => {
  const { runtime, restoreEnv } = await startTestRuntime();
  let c1 = null;

  try {
    const address = runtime.getAddress();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const roomStore = runtime.app.locals.roomStore;
    const roomId = roomStore.getDefaultRoomId();

    c1 = await createConnectedClient(baseUrl);
    const token = 'DISCONNECT_A';

    const joinedUpdate = waitForEventMatching(
      c1,
      'room_update',
      (payload) => payload
        && payload.id === roomId
        && Array.isArray(payload.players)
        && payload.players.some((p) => p.id === token)
    );
    c1.emit('join_room', roomId, 'DisconnectUser', token);
    await joinedUpdate;

    await disconnectClient(c1);
    c1 = null;

    await waitForCondition(() => {
      const room = roomStore.getRoom(roomId);
      return Boolean(room && room.players.has(token) && room.players.get(token).online === false);
    }, 1500, 20);

    const roomAfterDisconnect = roomStore.getRoom(roomId);
    assert.ok(roomAfterDisconnect);
    assert.ok(roomAfterDisconnect.players.has(token));
    assert.equal(roomAfterDisconnect.players.get(token).online, false);

    await waitForCondition(() => !roomStore.hasRoom(roomId), 2500, 30);
    assert.equal(roomStore.hasRoom(roomId), false);
  } finally {
    await disconnectClient(c1);
    await runtime.close();
    restoreEnv();
  }
});
