const { registerSessionHandlers } = require('./handlers/session.handlers');
const { registerRoomHandlers } = require('./handlers/room.handlers');
const { registerChatHandlers } = require('./handlers/chat.handlers');
const { registerGameHandlers } = require('./handlers/game.handlers');

function registerSocketHandlers({
  io,
  roomStore,
  Room,
  Player,
  TexasHoldem,
  MinesweeperGame,
  normalizeRoomId,
  normalizePlayerToken,
  attachSocketToPlayer,
  broadcastRoomUpdate,
  emitGameStateToSocket,
  getOnlinePlayers,
  getMinesweeperConfig,
  parsePokerBetLimits,
  emitGameState,
  leaveRoom,
  transferOwnerIfNeeded
}) {
  io.on('connection', (socket) => {
    registerSessionHandlers(socket, {
      roomStore,
      normalizeRoomId,
      normalizePlayerToken,
      attachSocketToPlayer,
      broadcastRoomUpdate,
      emitGameStateToSocket,
      leaveRoom
    });

    registerRoomHandlers(socket, {
      roomStore,
      Room,
      Player,
      normalizeRoomId,
      normalizePlayerToken,
      attachSocketToPlayer,
      transferOwnerIfNeeded,
      broadcastRoomUpdate,
      emitGameStateToSocket,
      leaveRoom
    });

    registerChatHandlers(socket, {
      io,
      roomStore
    });

    registerGameHandlers(socket, {
      roomStore,
      TexasHoldem,
      MinesweeperGame,
      getOnlinePlayers,
      getMinesweeperConfig,
      parsePokerBetLimits,
      emitGameState,
      broadcastRoomUpdate
    });
  });
}

module.exports = {
  registerSocketHandlers
};
