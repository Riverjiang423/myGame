class Player {
  constructor(id, name, socketId = null) {
    this.id = id;
    this.name = name;
    this.socketId = socketId;
    this.online = true;
    this.color = Player.generateDarkColor();
  }

  static generateDarkColor() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 45 + Math.floor(Math.random() * 26); // 45-70%
    const lightness = 22 + Math.floor(Math.random() * 14); // 22-35%
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }
}

module.exports = {
  Player
};
