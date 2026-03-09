function registerSessionHandlers(socket, {
  roomStore,
  normalizeRoomId,
  normalizePlayerToken,
  attachSocketToPlayer,
  broadcastRoomUpdate,
  emitGameStateToSocket,
  leaveRoom
}) {
  function findPlayerInAnyRoom(playerId) {
    for (const room of roomStore.getAllRooms()) {
      const player = room.players.get(playerId);
      if (player) {
        return { room, player };
      }
    }
    return null;
  }

  socket.on('client_rtt_ping', (clientTimestamp, ack) => {
    if (typeof ack === 'function') {
      ack({
        serverTimestamp: Date.now(),
        clientTimestamp: Number.isFinite(Number(clientTimestamp)) ? Number(clientTimestamp) : null
      });
    }
  });

  socket.on('reconnect_session', (payload) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const playerToken = normalizePlayerToken(payload.playerToken);
    if (!playerToken) {
      return;
    }

    const roomId = normalizeRoomId(payload.roomId);
    const scoped = roomId && roomStore.hasRoom(roomId)
      ? { room: roomStore.getRoom(roomId), player: roomStore.getRoom(roomId).players.get(playerToken) }
      : findPlayerInAnyRoom(playerToken);

    if (!scoped || !scoped.room || !scoped.player) {
      return;
    }

    const { room, player } = scoped;
    attachSocketToPlayer(socket, room, player);
    broadcastRoomUpdate(room);
    emitGameStateToSocket(room, socket, 'game_state_update');
  });

  socket.on('disconnect', () => {
    leaveRoom(socket, 'disconnect');
  });
}

module.exports = {
  registerSessionHandlers
};
