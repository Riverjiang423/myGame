const { BaseGame } = require('./core');

class MinesweeperGame extends BaseGame {
  constructor(width, height, mineCount) {
    super();
    this.width = width;
    this.height = height;
    this.mineCount = Math.min(mineCount, width * height);
    this.board = [];
    this.#generateBoard();
  }

  #generateBoard() {
    this.board = Array.from({ length: this.height }, (_, y) =>
      Array.from({ length: this.width }, (_, x) => ({
        x,
        y,
        isMine: false,
        isRevealed: false,
        neighborMines: 0,
        flaggedBy: null
      }))
    );

    let placed = 0;
    while (placed < this.mineCount) {
      const x = Math.floor(Math.random() * this.width);
      const y = Math.floor(Math.random() * this.height);
      const cell = this.board[y][x];

      if (cell.isMine) {
        continue;
      }

      cell.isMine = true;
      placed += 1;
    }

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const cell = this.board[y][x];
        if (cell.isMine) {
          continue;
        }
        cell.neighborMines = this.#countNeighborMines(x, y);
      }
    }
  }

  #countNeighborMines(x, y) {
    let count = 0;

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }

        const nx = x + dx;
        const ny = y + dy;

        if (!this.#isInBounds(nx, ny)) {
          continue;
        }

        if (this.board[ny][nx].isMine) {
          count += 1;
        }
      }
    }

    return count;
  }

  #isInBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  #floodReveal(x, y) {
    if (!this.#isInBounds(x, y)) {
      return;
    }

    const cell = this.board[y][x];
    if (cell.isRevealed || cell.flaggedBy || cell.isMine) {
      return;
    }

    cell.isRevealed = true;

    if (cell.neighborMines > 0) {
      return;
    }

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        this.#floodReveal(x + dx, y + dy);
      }
    }
  }

  #chordReveal(x, y) {
    if (!this.#isInBounds(x, y)) {
      return;
    }

    const cell = this.board[y][x];
    if (!cell.isRevealed || cell.isMine || cell.neighborMines <= 0) {
      return;
    }

    const neighbors = [];
    let flaggedCount = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const nx = x + dx;
        const ny = y + dy;
        if (!this.#isInBounds(nx, ny)) {
          continue;
        }
        const neighbor = this.board[ny][nx];
        neighbors.push(neighbor);
        if (neighbor.flaggedBy) {
          flaggedCount += 1;
        }
      }
    }

    if (flaggedCount !== cell.neighborMines) {
      return;
    }

    for (const neighbor of neighbors) {
      if (neighbor.isRevealed || neighbor.flaggedBy) {
        continue;
      }
      if (neighbor.isMine) {
        neighbor.isRevealed = true;
        this.status = 'ended';
        return;
      }
      this.#floodReveal(neighbor.x, neighbor.y);
    }
  }

  handleAction(player, actionData) {
    if (this.status === 'ended') {
      return;
    }

    if (this.status === 'waiting') {
      this.start();
    }

    const { type, x, y } = actionData || {};
    if (!this.#isInBounds(x, y)) {
      return;
    }

    const cell = this.board[y][x];

    if (type === 'reveal') {
      if (cell.isRevealed || cell.flaggedBy) {
        return;
      }

      if (cell.isMine) {
        cell.isRevealed = true;
        this.status = 'ended';
        return;
      }

      this.#floodReveal(x, y);
      return;
    }

    if (type === 'flag') {
      if (cell.isRevealed) {
        return;
      }

      cell.flaggedBy = cell.flaggedBy ? null : player.id;
      return;
    }

    if (type === 'chord') {
      this.#chordReveal(x, y);
    }
  }

  getGameState() {
    const hideMines = this.status !== 'ended';
    const board = this.board.map((row) =>
      row.map((cell) => {
        const safeCell = {
          x: cell.x,
          y: cell.y,
          isRevealed: cell.isRevealed,
          neighborMines: cell.neighborMines,
          flaggedBy: cell.flaggedBy
        };

        if (!hideMines || cell.isRevealed) {
          safeCell.isMine = cell.isMine;
        } else {
          safeCell.isMine = false;
        }

        return safeCell;
      })
    );

    return {
      status: this.status,
      width: this.width,
      height: this.height,
      mineCount: this.mineCount,
      board
    };
  }
}

module.exports = {
  MinesweeperGame
};
