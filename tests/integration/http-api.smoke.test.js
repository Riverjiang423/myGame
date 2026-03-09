const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createExpressApp } = require('../../src/server/http/createExpressApp');
const { createRoomStore } = require('../../src/room/repository/roomStore');

function startServer(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

function stopServer(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function requestJson(urlPath, baseUrl) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${urlPath}`, { method: 'GET' }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        let body = null;
        try {
          body = JSON.parse(raw);
        } catch (error) {
          reject(new Error(`invalid json response for ${urlPath}: ${raw}`));
          return;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

test('HTTP API smoke: /api/ping and /api/network-info', async () => {
  const app = createExpressApp();
  const roomStore = createRoomStore();
  roomStore.getOrCreateDefaultRoom(() => ({ id: 'ABCD' }));
  app.locals.roomStore = roomStore;

  const { server, baseUrl } = await startServer(app);

  try {
    const ping = await requestJson('/api/ping', baseUrl);
    assert.equal(ping.statusCode, 200);
    assert.equal(ping.body.ok, true);
    assert.equal(typeof ping.body.ts, 'number');
    assert.equal(ping.headers['access-control-allow-origin'], '*');

    const networkInfo = await requestJson('/api/network-info', baseUrl);
    assert.equal(networkInfo.statusCode, 200);
    assert.equal(typeof networkInfo.body.generatedAt, 'string');
    assert.equal(networkInfo.body.roomId, 'ABCD');
    assert.equal(typeof networkInfo.body.recommendedReason, 'string');

    const endpointList = networkInfo.body.endpoints || networkInfo.body.addresses;
    assert.ok(Array.isArray(endpointList));
    if (endpointList.length > 0) {
      const first = endpointList[0];
      assert.equal(typeof first.type, 'string');
      assert.equal(typeof first.label, 'string');
      assert.equal(typeof first.url, 'string');
      assert.match(first.url, /^https?:\/\//);
    }

    if (networkInfo.body.recommendedEndpoint) {
      assert.equal(typeof networkInfo.body.recommendedEndpoint.url, 'string');
      assert.match(networkInfo.body.recommendedEndpoint.url, /^https?:\/\//);
    }

    if (networkInfo.body.recommendedShareUrl) {
      assert.match(networkInfo.body.recommendedShareUrl, /\?room=/);
    }
  } finally {
    await stopServer(server);
  }
});
