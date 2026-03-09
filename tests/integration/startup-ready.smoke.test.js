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

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET' }, (res) => {
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

test('startApp smoke: can boot, become ready, serve health API, and close', { concurrency: false }, async () => {
  const restoreEnv = setEnv({
    APP_START_MODE: 'local',
    AUTO_OPEN_BROWSER: '0',
    APP_DISTRIBUTION_MODE: '0',
    PORT: '0'
  });

  let runtime = null;
  try {
    const appConfigPath = require.resolve('../../src/config/app');
    const appModulePath = require.resolve('../../src/bootstrap/app');
    delete require.cache[appConfigPath];
    delete require.cache[appModulePath];
    const { startApp } = require(appModulePath);

    runtime = await startApp({ registerSignalHandlers: false });

    const address = runtime.getAddress();
    assert.ok(address);
    assert.equal(typeof address.port, 'number');
    assert.ok(address.port > 0);

    const ping = await requestJson(`http://127.0.0.1:${address.port}/api/ping`);
    assert.equal(ping.statusCode, 200);
    assert.equal(ping.body.ok, true);

    await runtime.close();
    assert.equal(runtime.server.listening, false);
  } finally {
    if (runtime && runtime.server && runtime.server.listening) {
      await runtime.close();
    }
    restoreEnv();
  }
});
