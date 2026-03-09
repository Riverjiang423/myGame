function registerChatHandlers(socket, {
  io,
  roomStore
}) {
  socket.on('chat_message', (message) => {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId || !roomStore.hasRoom(roomId)) {
      return;
    }

    const room = roomStore.getRoom(roomId);
    const player = room.players.get(playerId);
    if (!player || player.online === false || typeof message !== 'string' || !message.trim()) {
      return;
    }

    room.addChat(player, message.trim());
    io.to(room.id).emit('chat_update', room.chatHistory);
  });
}

module.exports = {
  registerChatHandlers
};
