const fs = require('fs');
const libzt = require('./addon');
const { libztConfig } = require('../../config/libzt');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let runtime = null;

async function startLibztRuntime() {
  if (runtime) {
    return runtime;
  }

  if (!libztConfig.enabled) {
    runtime = {
      enabled: false
    };
    return runtime;
  }

  const dllPath = libztConfig.dllPath;
  const networkId = libztConfig.networkId;
  if (!networkId) {
    throw new Error('LIBZT_NETWORK_ID is required when LIBZT_ENABLE=1');
  }
  if (!fs.existsSync(dllPath)) {
    throw new Error(`libzt.dll not found: ${dllPath}`);
  }

  try {
    libzt.load(dllPath);
  } catch (error) {
    throw new Error(
      `Failed to load libzt native addon. Build it first with "npm run build:libzt". ${error.message}`
    );
  }

  const startRc = libzt.nodeStart();
  if (startRc !== 0) {
    throw new Error(`zts_node_start failed: ${startRc}`);
  }

  const joinRc = libzt.netJoin(networkId);
  if (joinRc !== 0) {
    throw new Error(`zts_net_join failed: ${joinRc}`);
  }

  const waitMs = libztConfig.waitMs;
  const begin = Date.now();
  while (Date.now() - begin < waitMs) {
    if (libzt.netTransportIsReady(networkId)) {
      const proxyEnabled = libztConfig.proxy.enabled;
      let proxy = null;
      if (proxyEnabled) {
        const listenPort = libztConfig.proxy.listenPort;
        const targetPort = libztConfig.proxy.targetPort;
        const targetHost = libztConfig.proxy.targetHost;
        const maxConnections = libztConfig.proxy.maxConnections;
        const idleTimeoutMs = libztConfig.proxy.idleTimeoutMs;
        const log = libztConfig.proxy.log;
        const allowIps = libztConfig.proxy.allowIps;
        const proxyStartRc = libzt.startTcpProxy({
          listenPort,
          targetPort,
          targetHost,
          maxConnections,
          idleTimeoutMs,
          log,
          allowIps
        });
        proxy = {
          enabled: Boolean(proxyStartRc),
          listenPort,
          targetHost,
          targetPort,
          maxConnections,
          idleTimeoutMs,
          allowIps
        };
      }

      runtime = {
        enabled: true,
        networkId,
        networkIdSource: libztConfig.networkIdSource,
        networkIdMasked: libztConfig.networkIdMasked,
        nodeId: libzt.nodeGetId().toString(),
        proxy
      };
      return runtime;
    }
    await sleep(800);
  }

  throw new Error(`ZeroTier transport not ready within ${waitMs}ms`);
}

async function stopLibztRuntime() {
  if (!runtime || !runtime.enabled) {
    return;
  }

  try {
    if (runtime.proxy && runtime.proxy.enabled) {
      libzt.stopTcpProxy();
    }
  } catch (error) {
    // ignore cleanup error
  }

  try {
    libzt.nodeStop();
  } catch (error) {
    // ignore cleanup error
  }

  try {
    libzt.unload();
  } catch (error) {
    // ignore cleanup error
  }

  runtime = null;
}

function getLibztState() {
  return runtime;
}

module.exports = {
  startLibztRuntime,
  stopLibztRuntime,
  getLibztState
};
