const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

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

function mockModule(moduleId, exportsValue) {
  const modulePath = require.resolve(moduleId);
  const previous = require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue
  };
  return () => {
    if (previous) {
      require.cache[modulePath] = previous;
      return;
    }
    delete require.cache[modulePath];
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

function requestJson(baseUrl, path) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${path}`, { method: 'GET' }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(raw)
          });
        } catch (error) {
          reject(new Error(`invalid json response: ${raw}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function createConsoleCapture() {
  const logs = [];
  const warns = [];
  const errors = [];
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };

  console.log = (...args) => {
    logs.push(args.map((x) => String(x)).join(' '));
  };
  console.warn = (...args) => {
    warns.push(args.map((x) => String(x)).join(' '));
  };
  console.error = (...args) => {
    errors.push(args.map((x) => String(x)).join(' '));
  };

  return {
    logs,
    warns,
    errors,
    restore() {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    }
  };
}

test('start mode local: skips libzt init and serves HTTP', { concurrency: false }, async () => {
  const restoreEnv = setEnv({
    APP_START_MODE: 'local',
    APP_DISTRIBUTION_MODE: '0',
    AUTO_OPEN_BROWSER: '0',
    PORT: '0'
  });

  const calls = { start: 0, stop: 0 };
  const restoreRuntime = mockModule('../../src/network/libzt/runtime', {
    async startLibztRuntime() {
      calls.start += 1;
      return { enabled: true };
    },
    async stopLibztRuntime() {
      calls.stop += 1;
    }
  });

  let runtime = null;
  try {
    clearBootCaches();
    const { startApp } = require('../../src/bootstrap/app');
    runtime = await startApp({ registerSignalHandlers: false });

    const addr = runtime.getAddress();
    const ping = await requestJson(`http://127.0.0.1:${addr.port}`, '/api/ping');
    assert.equal(ping.statusCode, 200);
    assert.equal(ping.body.ok, true);

    assert.equal(calls.start, 0);
    await runtime.close();
    runtime = null;
    assert.equal(calls.stop, 1);
  } finally {
    if (runtime && runtime.server && runtime.server.listening) {
      await runtime.close();
    }
    restoreRuntime();
    restoreEnv();
  }
});

test('start mode online-preferred: libzt failure falls back and service still starts', { concurrency: false }, async () => {
  const restoreEnv = setEnv({
    APP_START_MODE: 'online-preferred',
    APP_DISTRIBUTION_MODE: '0',
    AUTO_OPEN_BROWSER: '0',
    LIBZT_STRICT: '0',
    PORT: '0'
  });

  const calls = { start: 0, stop: 0 };
  const restoreRuntime = mockModule('../../src/network/libzt/runtime', {
    async startLibztRuntime() {
      calls.start += 1;
      throw new Error('mock libzt start failed');
    },
    async stopLibztRuntime() {
      calls.stop += 1;
    }
  });

  const capture = createConsoleCapture();
  let runtime = null;
  try {
    clearBootCaches();
    const { startApp } = require('../../src/bootstrap/app');
    runtime = await startApp({ registerSignalHandlers: false });

    const addr = runtime.getAddress();
    const ping = await requestJson(`http://127.0.0.1:${addr.port}`, '/api/ping');
    assert.equal(ping.statusCode, 200);
    assert.equal(ping.body.ok, true);

    assert.equal(calls.start, 1);
    assert.ok(capture.warns.some((line) => line.includes('已回退到本地模式')));
    await runtime.close();
    runtime = null;
    assert.equal(calls.stop, 1);
  } finally {
    if (runtime && runtime.server && runtime.server.listening) {
      await runtime.close();
    }
    capture.restore();
    restoreRuntime();
    restoreEnv();
  }
});

test('start mode online-preferred: libzt success keeps startup healthy', { concurrency: false }, async () => {
  const restoreEnv = setEnv({
    APP_START_MODE: 'online-preferred',
    APP_DISTRIBUTION_MODE: '0',
    AUTO_OPEN_BROWSER: '0',
    PORT: '0'
  });

  const calls = { start: 0, stop: 0 };
  const restoreRuntime = mockModule('../../src/network/libzt/runtime', {
    async startLibztRuntime() {
      calls.start += 1;
      return {
        enabled: true,
        nodeId: 'node-mock',
        networkIdMasked: '8056...0001',
        networkIdSource: 'default',
        proxy: { enabled: false }
      };
    },
    async stopLibztRuntime() {
      calls.stop += 1;
    }
  });

  let runtime = null;
  try {
    clearBootCaches();
    const { startApp } = require('../../src/bootstrap/app');
    runtime = await startApp({ registerSignalHandlers: false });

    const addr = runtime.getAddress();
    const ping = await requestJson(`http://127.0.0.1:${addr.port}`, '/api/ping');
    assert.equal(ping.statusCode, 200);
    assert.equal(ping.body.ok, true);

    assert.equal(calls.start, 1);
    await runtime.close();
    runtime = null;
    assert.equal(calls.stop, 1);
  } finally {
    if (runtime && runtime.server && runtime.server.listening) {
      await runtime.close();
    }
    restoreRuntime();
    restoreEnv();
  }
});

test('start mode online-required: libzt failure exits startup', { concurrency: false }, async () => {
  const restoreEnv = setEnv({
    APP_START_MODE: 'online-required',
    APP_DISTRIBUTION_MODE: '0',
    AUTO_OPEN_BROWSER: '0',
    LIBZT_STRICT: '0',
    PORT: '0'
  });

  const calls = { start: 0, stop: 0 };
  const restoreRuntime = mockModule('../../src/network/libzt/runtime', {
    async startLibztRuntime() {
      calls.start += 1;
      throw new Error('mock required start failed');
    },
    async stopLibztRuntime() {
      calls.stop += 1;
    }
  });

  const capture = createConsoleCapture();
  const originalExit = process.exit;
  process.exit = (code) => {
    throw new Error(`TEST_PROCESS_EXIT_${code}`);
  };

  try {
    clearBootCaches();
    const { startApp } = require('../../src/bootstrap/app');

    await assert.rejects(
      () => startApp({ registerSignalHandlers: false }),
      /TEST_PROCESS_EXIT_1/
    );

    assert.equal(calls.start, 1);
    assert.ok(capture.errors.some((line) => line.includes('启动终止')));
    assert.equal(calls.stop, 0);
  } finally {
    process.exit = originalExit;
    capture.restore();
    restoreRuntime();
    restoreEnv();
  }
});
