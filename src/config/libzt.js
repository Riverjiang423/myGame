const path = require('path');
const { readStringEnv, readIntEnv, readBoolEnv } = require('./env');
const { appConfig } = require('./app');

const DEFAULT_NETWORK_ID = '154a350c867ce6c8';
const rawDllPath = readStringEnv('LIBZT_DLL_PATH', '');
const rawStoragePath = readStringEnv('LIBZT_STORAGE_PATH', '');
const allowIpsRaw = readStringEnv('LIBZT_PROXY_ALLOW_IPS', '');
const rawEnvNetworkId = process.env.LIBZT_NETWORK_ID;
const envNetworkId = typeof rawEnvNetworkId === 'string' ? rawEnvNetworkId.trim() : '';
const networkIdSource = envNetworkId ? 'env' : 'default';
const effectiveNetworkId = envNetworkId || DEFAULT_NETWORK_ID;
const hasLibztEnableOverride = process.env.LIBZT_ENABLE !== undefined
  && process.env.LIBZT_ENABLE !== null
  && String(process.env.LIBZT_ENABLE).trim() !== '';
const defaultLibztEnabled = appConfig.startMode !== 'local';
const resolvedLibztEnabled = hasLibztEnableOverride
  ? readBoolEnv('LIBZT_ENABLE', defaultLibztEnabled)
  : defaultLibztEnabled;

function maskNetworkId(networkId) {
  const value = String(networkId || '').trim();
  if (!value) {
    return '';
  }
  if (value.length <= 8) {
    return value;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

const libztConfig = {
  enabled: resolvedLibztEnabled,
  strict: readStringEnv('LIBZT_STRICT', '') === '1',
  networkId: effectiveNetworkId,
  networkIdSource,
  networkIdMasked: maskNetworkId(effectiveNetworkId),
  defaultNetworkId: DEFAULT_NETWORK_ID,
  dllPath: rawDllPath
    ? path.resolve(process.cwd(), rawDllPath)
    : path.resolve(process.cwd(), 'third_party', 'libzt', 'winx64', 'libzt.dll'),
  storagePath: rawStoragePath
    ? path.resolve(process.cwd(), rawStoragePath)
    : path.resolve(process.cwd(), 'data', 'libzt'),
  waitMs: readIntEnv('LIBZT_WAIT_MS', 30000, { min: 1 }),
  proxy: {
    enabled: readBoolEnv('LIBZT_TCP_PROXY_ENABLE', true),
    listenPort: readIntEnv('LIBZT_PROXY_PORT', appConfig.port, { min: 1 }),
    targetPort: appConfig.port,
    targetHost: readStringEnv('LIBZT_PROXY_TARGET_HOST', '127.0.0.1'),
    maxConnections: readIntEnv('LIBZT_PROXY_MAX_CONNECTIONS', 128, { min: 1 }),
    idleTimeoutMs: readIntEnv('LIBZT_PROXY_IDLE_TIMEOUT_MS', 120000, { min: 1 }),
    log: readBoolEnv('LIBZT_PROXY_LOG', false),
    allowIps: allowIpsRaw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
};

module.exports = {
  libztConfig
};
