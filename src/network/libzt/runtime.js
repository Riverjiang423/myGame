const fs = require('fs');
const libzt = require('./addon');
const { libztConfig } = require('../../config/libzt');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const INVALID_NODE_IDS = new Set([
  '0',
  '18446744073709551615',
  '18446744073709551614'
]);

function isNodeIdReady(nodeId) {
  const value = String(nodeId || '').trim();
  if (!value) {
    return false;
  }
  return !INVALID_NODE_IDS.has(value);
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

  let nodeId = '';
  try {
    nodeId = libzt.nodeGetId().toString();
  } catch (error) {
    nodeId = '';
  }

  const waitMs = libztConfig.waitMs;
  const joinDeadline = Date.now() + waitMs;
  let joinRc = -1;
  while (Date.now() < joinDeadline) {
    if (!isNodeIdReady(nodeId)) {
      try {
        nodeId = libzt.nodeGetId().toString();
      } catch (error) {
        nodeId = '';
      }
      await sleep(300);
      continue;
    }

    joinRc = libzt.netJoin(networkId);
    if (joinRc === 0) {
      break;
    }

    await sleep(800);
  }

  if (joinRc !== 0) {
    const nodeHint = nodeId ? ` (nodeId=${nodeId})` : '';
    throw new Error(`zts_net_join failed: ${joinRc}${nodeHint}`);
  }

  const readyDeadline = Date.now() + waitMs;
  while (Date.now() < readyDeadline) {
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
        nodeId: nodeId || libzt.nodeGetId().toString(),
        proxy
      };
      return runtime;
    }
    await sleep(800);
  }

  const nodeHint = nodeId ? ` (nodeId=${nodeId})` : '';
  throw new Error(`ZeroTier transport not ready within ${waitMs}ms${nodeHint}`);
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
