const test = require('node:test');
const assert = require('node:assert/strict');

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

function clearBootCaches() {
  [
    '../../src/config/app',
    '../../src/config/socket',
    '../../src/config/libzt',
    '../../src/bootstrap/app'
  ].forEach((id) => {
    delete require.cache[require.resolve(id)];
  });
}

function mockSpawn() {
  const childProcess = require('child_process');
  const originalSpawn = childProcess.spawn;
  const calls = [];

  childProcess.spawn = (...args) => {
    calls.push(args);
    return {
      unref() {}
    };
  };

  return {
    calls,
    restore() {
      childProcess.spawn = originalSpawn;
    }
  };
}

test('AUTO_OPEN_BROWSER=true triggers browser open once on ready', { concurrency: false }, async () => {
  const restoreEnv = setEnv({
    APP_START_MODE: 'local',
    AUTO_OPEN_BROWSER: '1',
    APP_DISTRIBUTION_MODE: '0',
    PORT: '0'
  });
  const spawnMock = mockSpawn();
  let runtime = null;

  try {
    clearBootCaches();
    const { startApp } = require('../../src/bootstrap/app');
    runtime = await startApp({ registerSignalHandlers: false });
    assert.equal(spawnMock.calls.length, 1);
    await runtime.close();
    runtime = null;
  } finally {
    if (runtime && runtime.server && runtime.server.listening) {
      await runtime.close();
    }
    spawnMock.restore();
    restoreEnv();
  }
});

test('AUTO_OPEN_BROWSER=false does not trigger browser open', { concurrency: false }, async () => {
  const restoreEnv = setEnv({
    APP_START_MODE: 'local',
    AUTO_OPEN_BROWSER: '0',
    APP_DISTRIBUTION_MODE: '0',
    PORT: '0'
  });
  const spawnMock = mockSpawn();
  let runtime = null;

  try {
    clearBootCaches();
    const { startApp } = require('../../src/bootstrap/app');
    runtime = await startApp({ registerSignalHandlers: false });
    assert.equal(spawnMock.calls.length, 0);
    await runtime.close();
    runtime = null;
  } finally {
    if (runtime && runtime.server && runtime.server.listening) {
      await runtime.close();
    }
    spawnMock.restore();
    restoreEnv();
  }
});

test('duplicate ready callback still opens browser only once', { concurrency: false }, async () => {
  const restoreEnv = setEnv({
    APP_START_MODE: 'local',
    AUTO_OPEN_BROWSER: '1',
    APP_DISTRIBUTION_MODE: '0',
    PORT: '0'
  });
  const spawnMock = mockSpawn();
  let runtime = null;

  try {
    clearBootCaches();
    const appModule = require('../../src/bootstrap/app');
    const originalListen = appModule.server.listen.bind(appModule.server);

    appModule.server.listen = (...args) => {
      const maybeCb = args[args.length - 1];
      if (typeof maybeCb === 'function') {
        args[args.length - 1] = () => {
          maybeCb();
          maybeCb();
        };
      }
      return originalListen(...args);
    };

    runtime = await appModule.startApp({ registerSignalHandlers: false });
    assert.equal(spawnMock.calls.length, 1);
    await runtime.close();
    runtime = null;
  } finally {
    if (runtime && runtime.server && runtime.server.listening) {
      await runtime.close();
    }
    spawnMock.restore();
    restoreEnv();
  }
});
