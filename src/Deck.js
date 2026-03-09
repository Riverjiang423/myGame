class Deck {
  constructor() {
    this.cards = [];
    this.#initialize();
  }

  #initialize() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    this.cards = suits.flatMap((suit) =>
      ranks.map((rank, index) => ({
        suit,
        rank,
        value: index + 2
      }))
    );
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    return this;
  }

  draw() {
    return this.cards.pop();
  }
}

module.exports = {
  Deck
};
