class Room {
  constructor(id = Room.generateRoomId()) {
    this.id = id;
    this.players = new Map();
    this.chatHistory = [];
    this.currentGame = null;
    this.ownerId = null;
    this.selectedGame = null;
    this.pokerBetLimits = { minBet: null, maxBet: null };
    this.readyPlayerIds = new Set();
  }

  static generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let roomId = '';

    for (let i = 0; i < 4; i += 1) {
      roomId += chars[Math.floor(Math.random() * chars.length)];
    }

    return roomId;
  }

  addPlayer(player) {
    this.players.set(player.id, player);
    if (!this.ownerId) {
      this.ownerId = player.id;
    }
  }

  removePlayer(playerId) {
    const removed = this.players.delete(playerId);
    this.readyPlayerIds.delete(playerId);

    if (this.ownerId === playerId) {
      const nextOwner = this.players.keys().next();
      this.ownerId = nextOwner.done ? null : nextOwner.value;
    }

    return removed;
  }

  addChat(player, message) {
    this.chatHistory.push({
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      message,
      timestamp: new Date().toISOString()
    });
  }

  setGame(gameInstance) {
    this.currentGame = gameInstance;
    this.readyPlayerIds.clear();
  }

  selectGame(gameType) {
    this.selectedGame = gameType;
    this.currentGame = null;
    if (gameType !== 'poker') {
      this.pokerBetLimits = { minBet: null, maxBet: null };
    }
    this.readyPlayerIds.clear();
  }

  toggleReady(playerId) {
    if (this.readyPlayerIds.has(playerId)) {
      this.readyPlayerIds.delete(playerId);
      return false;
    }
    this.readyPlayerIds.add(playerId);
    return true;
  }
}

module.exports = {
  Room
};
