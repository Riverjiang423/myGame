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

function waitForSocketEvent(socket, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for socket event: ${eventName}`));
    }, timeoutMs);

    const onEvent = (payload) => {
      cleanup();
      resolve(payload);
    };
    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    function cleanup() {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      socket.off('connect_error', onError);
      socket.off('error', onError);
    }

    socket.once(eventName, onEvent);
    socket.once('connect_error', onError);
    socket.once('error', onError);
  });
}

function disconnectClient(client) {
  return new Promise((resolve) => {
    if (!client || client.disconnected) {
      resolve();
      return;
    }
    client.once('disconnect', () => resolve());
    client.disconnect();
  });
}

test('socket main path smoke: connect -> join default room -> receive room_update', { concurrency: false }, async () => {
  const restoreEnv = setEnv({
    APP_START_MODE: 'local',
    AUTO_OPEN_BROWSER: '0',
    APP_DISTRIBUTION_MODE: '0',
    PORT: '0'
  });

  let runtime = null;
  let client = null;
  try {
    const appConfigPath = require.resolve('../../src/config/app');
    const appModulePath = require.resolve('../../src/bootstrap/app');
    delete require.cache[appConfigPath];
    delete require.cache[appModulePath];
    const { startApp } = require(appModulePath);

    runtime = await startApp({ registerSignalHandlers: false });
    const roomStore = runtime.app.locals.roomStore;
    const defaultRoomId = roomStore.getDefaultRoomId();
    assert.equal(typeof defaultRoomId, 'string');
    assert.match(defaultRoomId, /^[A-Z]{4}$/);

    const address = runtime.getAddress();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    client = createClient(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000
    });

    await waitForSocketEvent(client, 'connect');

    const playerToken = 'TEST_SOCKET_PLAYER';
    const roomUpdatePromise = waitForSocketEvent(client, 'room_update');
    client.emit('join_room', defaultRoomId, 'SocketSmokeUser', playerToken);
    const roomUpdate = await roomUpdatePromise;

    assert.ok(roomUpdate);
    assert.equal(roomUpdate.id, defaultRoomId);
    assert.ok(Array.isArray(roomUpdate.players));
    assert.ok(roomUpdate.players.some((p) => p.id === playerToken));

    const room = roomStore.getRoom(defaultRoomId);
    assert.ok(room);
    assert.ok(room.players.has(playerToken));
  } finally {
    if (client) {
      await disconnectClient(client);
    }
    if (runtime && runtime.server && runtime.server.listening) {
      await runtime.close();
    }
    restoreEnv();
  }
});
