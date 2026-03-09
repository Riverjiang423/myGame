const { Server } = require('socket.io');
const { socketConfig } = require('../../config/socket');

function createSocketServer(server) {
  return new Server(server, {
    transports: socketConfig.transports,
    pingInterval: socketConfig.pingInterval,
    pingTimeout: socketConfig.pingTimeout,
    connectTimeout: socketConfig.connectTimeout,
    maxHttpBufferSize: socketConfig.maxHttpBufferSize
  });
}

module.exports = {
  createSocketServer
};
