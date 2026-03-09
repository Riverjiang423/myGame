function registerGameHandlers(socket, {
  roomStore,
  TexasHoldem,
  MinesweeperGame,
  getOnlinePlayers,
  getMinesweeperConfig,
  parsePokerBetLimits,
  emitGameState,
  broadcastRoomUpdate
}) {
  socket.on('start_game', async (gameType) => {
    const roomId = socket.data.roomId;
    const requesterId = socket.data.playerId;
    if (!roomId || !requesterId || !roomStore.hasRoom(roomId)) {
      return;
    }

    const room = roomStore.getRoom(roomId);
    if (requesterId !== room.ownerId) {
      socket.emit('action_error', { message: '只有房主可以开始游戏' });
      return;
    }

    const targetType = typeof gameType === 'string' ? gameType : gameType && gameType.type;
    if (!targetType || room.selectedGame !== targetType) {
      socket.emit('action_error', { message: '请先选择游戏类型' });
      return;
    }

    const players = getOnlinePlayers(room);
    if (targetType === 'minesweeper') {
      if (players.length < 1) {
        socket.emit('action_error', { message: '房间人数不足，至少需要1人才能开始扫雷' });
        return;
      }
    } else if (targetType === 'poker') {
      if (players.length < 2 || players.length > 9) {
        socket.emit('action_error', { message: '德州扑克要求游戏人数为2-9人' });
        return;
      }
    }

    const unreadyPlayers = players
      .filter((player) => player.id !== room.ownerId && !room.readyPlayerIds.has(player.id))
      .map((player) => player.name);

    if (unreadyPlayers.length > 0) {
      socket.emit('action_error', { message: `玩家${unreadyPlayers.join('、')}没有准备` });
      return;
    }

    if (targetType === 'minesweeper') {
      const config = getMinesweeperConfig(gameType);
      room.setGame(new MinesweeperGame(config.width, config.height, config.mineCount));
      await emitGameState(room, 'game_started');
      broadcastRoomUpdate(room);
      return;
    }

    if (targetType === 'poker') {
      const limitPayload = gameType && typeof gameType === 'object' ? gameType.pokerBetLimits : null;
      const limits = parsePokerBetLimits(limitPayload || room.pokerBetLimits);
      if (!limits) {
        socket.emit('action_error', { message: '押注上下限设置无效' });
        return;
      }
      room.pokerBetLimits = limits;

      const pokerPlayers = players.map((p) => ({ id: p.id, name: p.name }));
      const pokerGame = new TexasHoldem(pokerPlayers, { betLimits: limits });
      pokerGame.start();
      room.setGame(pokerGame);
      await emitGameState(room, 'game_started');
      broadcastRoomUpdate(room);
    }
  });

  socket.on('set_poker_bet_limits', (limitsPayload) => {
    const roomId = socket.data.roomId;
    const requesterId = socket.data.playerId;
    if (!roomId || !requesterId || !roomStore.hasRoom(roomId)) {
      return;
    }

    const room = roomStore.getRoom(roomId);
    if (requesterId !== room.ownerId) {
      socket.emit('action_error', { message: '只有房主可以设置押注上下限' });
      return;
    }
    if (room.selectedGame !== 'poker') {
      socket.emit('action_error', { message: '请先选择德州扑克' });
      return;
    }
    if (room.currentGame) {
      socket.emit('action_error', { message: '游戏开始后不可修改押注上下限' });
      return;
    }

    const limits = parsePokerBetLimits(limitsPayload);
    if (!limits) {
      socket.emit('action_error', { message: '押注上下限设置无效' });
      return;
    }

    room.pokerBetLimits = limits;
    broadcastRoomUpdate(room);
  });

  socket.on('select_game', (gameType) => {
    const roomId = socket.data.roomId;
    const requesterId = socket.data.playerId;
    if (!roomId || !requesterId || !roomStore.hasRoom(roomId)) {
      return;
    }

    const room = roomStore.getRoom(roomId);
    if (requesterId !== room.ownerId) {
      socket.emit('action_error', { message: '只有房主可以选择游戏' });
      return;
    }

    if (gameType !== 'minesweeper' && gameType !== 'poker') {
      socket.emit('action_error', { message: '不支持的游戏类型' });
      return;
    }

    if (!room.currentGame && room.selectedGame === gameType) {
      return;
    }

    room.selectGame(gameType);
    broadcastRoomUpdate(room);
  });

  socket.on('room_ready_toggle', () => {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId || !roomStore.hasRoom(roomId)) {
      return;
    }

    const room = roomStore.getRoom(roomId);
    const player = room.players.get(playerId);
    if (!player || player.online === false) {
      return;
    }

    if (playerId === room.ownerId) {
      socket.emit('action_error', { message: '房主无需准备，请直接开始游戏' });
      return;
    }

    if (!room.selectedGame) {
      socket.emit('action_error', { message: '请等待房主先选择游戏' });
      return;
    }

    room.toggleReady(playerId);
    broadcastRoomUpdate(room);
  });

  socket.on('game_action', (actionData) => {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId || !roomStore.hasRoom(roomId)) {
      return;
    }

    const room = roomStore.getRoom(roomId);
    const player = room.players.get(playerId);
    if (!player || player.online === false || !room.currentGame) {
      return;
    }

    if (room.currentGame.status === 'ended') {
      return;
    }

    const prevGameStatus = room.currentGame.status;
    try {
      room.currentGame.handleAction(player, actionData);
    } catch (error) {
      socket.emit('action_error', {
        message: error.message
      });
      return;
    }

    emitGameState(room, 'game_state_update');
    if (room.currentGame.status !== prevGameStatus) {
      broadcastRoomUpdate(room);
    }
  });

  socket.on('minesweeper_post_game_action', async (actionType) => {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId || !roomStore.hasRoom(roomId)) {
      return;
    }

    const room = roomStore.getRoom(roomId);
    if (playerId !== room.ownerId) {
      socket.emit('action_error', { message: '只有房主可以进行结算后操作' });
      return;
    }

    if (!(room.currentGame instanceof MinesweeperGame) || room.currentGame.status !== 'ended') {
      socket.emit('action_error', { message: '当前不在扫雷结算阶段' });
      return;
    }

    if (actionType === 'restart') {
      const width = room.currentGame.width;
      const height = room.currentGame.height;
      const mineCount = room.currentGame.mineCount;
      room.setGame(new MinesweeperGame(width, height, mineCount));
      await emitGameState(room, 'game_started');
      broadcastRoomUpdate(room);
      return;
    }

    if (actionType === 'new_round') {
      room.currentGame = null;
      room.selectedGame = null;
      room.readyPlayerIds.clear();
      broadcastRoomUpdate(room);
      return;
    }

    socket.emit('action_error', { message: '不支持的结算操作' });
  });
}

module.exports = {
  registerGameHandlers
};
