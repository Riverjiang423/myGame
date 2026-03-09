function registerRoomHandlers(socket, {
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
}) {
  socket.on('join_room', (roomId, playerName, playerTokenRaw) => {
    const targetRoomId = normalizeRoomId(roomId);
    const playerToken = normalizePlayerToken(playerTokenRaw, `P-${socket.id}`);

    let room;
    if (targetRoomId && roomStore.hasRoom(targetRoomId)) {
      room = roomStore.getRoom(targetRoomId);
    } else if (targetRoomId) {
      room = new Room(targetRoomId);
      roomStore.setRoom(room.id, room);
    } else {
      room = new Room();
      roomStore.setRoom(room.id, room);
    }

    const normalizedName = typeof playerName === 'string' && playerName.trim()
      ? playerName.trim()
      : `Player-${socket.id.slice(0, 4)}`;

    const existingPlayer = room.players.get(playerToken);
    if (existingPlayer) {
      if (existingPlayer.name !== normalizedName) {
        existingPlayer.name = normalizedName;
      }
      attachSocketToPlayer(socket, room, existingPlayer);
      transferOwnerIfNeeded(room, existingPlayer.id);
      broadcastRoomUpdate(room);
      emitGameStateToSocket(room, socket, 'game_state_update');
      return;
    }

    const duplicateName = Array.from(room.players.values()).find(
      (player) => player.name.toLowerCase() === normalizedName.toLowerCase() && player.id !== playerToken
    );
    if (duplicateName) {
      socket.emit('action_error', { message: '该昵称已被使用' });
      return;
    }

    const player = new Player(playerToken, normalizedName, socket.id);
    room.addPlayer(player);

    attachSocketToPlayer(socket, room, player);
    transferOwnerIfNeeded(room, player.id);
    broadcastRoomUpdate(room);
    emitGameStateToSocket(room, socket, 'game_state_update');
  });

  socket.on('leave_room', () => {
    leaveRoom(socket, 'leave');
    socket.emit('left_room');
  });
}

module.exports = {
  registerRoomHandlers
};
