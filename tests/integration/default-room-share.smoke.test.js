const test = require('node:test');
const assert = require('node:assert/strict');

const { getDefaultRoomShareInfo, getRecommendedEndpoint } = require('../../src/network/share/endpointService');

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

test(
  'default room and share info: roomId/recommended endpoint/share url are available after startup',
  { concurrency: false },
  async () => {
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
      const roomStore = runtime.app.locals.roomStore;
      const roomId = roomStore.getDefaultRoomId();

      assert.equal(typeof roomId, 'string');
      assert.match(roomId, /^[A-Z]{4}$/);

      const addr = runtime.getAddress();
      const shareInfo = getDefaultRoomShareInfo({
        roomId,
        protocol: 'http',
        hostHeader: `127.0.0.1:${addr.port}`
      });

      assert.equal(shareInfo.roomId, roomId);
      assert.ok(Array.isArray(shareInfo.endpoints));
      assert.equal(typeof shareInfo.recommendedReason, 'string');
      assert.ok(shareInfo.recommendedReason.length > 0);
      assert.ok(shareInfo.recommendedEndpoint);
      assert.equal(typeof shareInfo.recommendedEndpoint.url, 'string');
      assert.match(shareInfo.recommendedEndpoint.url, /^https?:\/\//);
      assert.equal(typeof shareInfo.recommendedShareUrl, 'string');
      assert.match(shareInfo.recommendedShareUrl, /\?room=[A-Z]{4}$/);
    } finally {
      if (runtime && runtime.server && runtime.server.listening) {
        await runtime.close();
      }
      restoreEnv();
    }
  }
);

test('share recommendation fallback: without zerotier endpoint, prefer LAN endpoint', () => {
  const endpoints = [
    { type: 'current', label: '当前访问地址', url: 'http://127.0.0.1:3000' },
    { type: 'lan', label: 'LAN 地址', url: 'http://192.168.1.20:3000' }
  ];

  const recommendation = getRecommendedEndpoint(endpoints);
  assert.ok(recommendation.endpoint);
  assert.equal(recommendation.endpoint.type, 'lan');
  assert.equal(typeof recommendation.reason, 'string');
  assert.match(recommendation.reason, /ZeroTier 不可用/);
});
