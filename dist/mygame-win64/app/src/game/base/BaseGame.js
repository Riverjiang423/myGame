class BaseGame {
  constructor() {
    this.status = 'waiting';
  }

  start() {
    this.status = 'playing';
  }

  handleAction(player, actionData) {
    throw new Error('handleAction(player, actionData) must be implemented by subclass');
  }

  getGameState() {
    throw new Error('getGameState() must be implemented by subclass');
  }
}

module.exports = {
  BaseGame
};
