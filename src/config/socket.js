const { readStringEnv, readIntEnv } = require('./env');

function toSocketTransportList(rawValue) {
  const allowed = new Set(['websocket', 'polling']);
  const list = String(rawValue || 'websocket,polling')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => allowed.has(item));
  return list.length > 0 ? list : ['websocket', 'polling'];
}

const socketConfig = {
  transports: toSocketTransportList(readStringEnv('SOCKET_TRANSPORTS', 'websocket,polling')),
  pingInterval: readIntEnv('SOCKET_PING_INTERVAL_MS', 20000, { min: 1 }),
  pingTimeout: readIntEnv('SOCKET_PING_TIMEOUT_MS', 60000, { min: 1 }),
  connectTimeout: readIntEnv('SOCKET_CONNECT_TIMEOUT_MS', 30000, { min: 1 }),
  maxHttpBufferSize: readIntEnv('SOCKET_MAX_HTTP_BUFFER_BYTES', 1_000_000, { min: 1 }),
  disconnectGraceMs: readIntEnv('DISCONNECT_GRACE_MS', 45000, { min: 1 })
};

module.exports = {
  socketConfig
};
