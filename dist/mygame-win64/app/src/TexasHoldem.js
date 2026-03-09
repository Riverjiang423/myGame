const { BaseGame } = require('./core');
const { Deck } = require('./Deck');

class TexasHoldem extends BaseGame {
  constructor(players = [], options = {}) {
    super();
    this.players = players.map((player) => ({
      id: player.id,
      name: player.name,
      chips: 0,
      hand: [],
      isBlindParticipant: false,
      canViewHand: false,
      hasFolded: false,
      currentBet: 0,
      lastAction: null,
      hasActedThisRound: false
    }));
    this.pot = 0;
    this.communityCards = [];
    this.phase = 'waiting';
    this.currentTurnIndex = -1;
    this.currentBet = 0;
    this.deck = null;
    this.blindAmount = 20;
    this.lastRoundResult = null;
    const limits = options && options.betLimits ? options.betLimits : {};
    this.minBet = Number.isInteger(limits.minBet) && limits.minBet > 0 ? limits.minBet : null;
    this.maxBet = Number.isInteger(limits.maxBet) && limits.maxBet > 0 ? limits.maxBet : null;
  }

  start() {
    super.start();
    this.pot = 0;
    this.communityCards = [];
    this.currentBet = 0;
    this.currentTurnIndex = -1;
    this.lastRoundResult = null;

    this.players.forEach((player) => {
      player.chips = 1000;
      player.hand = [];
      player.isBlindParticipant = false;
      player.canViewHand = false;
      player.hasFolded = false;
      player.currentBet = 0;
      player.lastAction = null;
      player.hasActedThisRound = false;
    });

    this.#startBlindRound();
  }

  handleAction(player, actionData) {
    if (this.status !== 'playing' || this.phase === 'showdown' || this.phase === 'waiting') {
      return;
    }

    const actingIndex = this.players.findIndex((p) => p.id === player.id);
    if (actingIndex < 0) {
      return;
    }

    const actingPlayer = this.players[actingIndex];
    if (actingIndex !== this.currentTurnIndex || actingPlayer.hasFolded) {
      return;
    }

    if (this.phase === 'blind') {
      const actionType = actionData && actionData.type;
      if (!new Set(['fold', 'call']).has(actionType)) {
        throw new Error('Blind phase only supports fold/call');
      }

      if (actionType === 'fold') {
        actingPlayer.hasFolded = true;
        actingPlayer.lastAction = 'blind-fold';
      } else {
        if (actingPlayer.chips < this.blindAmount) {
          throw new Error('Insufficient chips to join blind pressure');
        }
        actingPlayer.chips -= this.blindAmount;
        this.pot += this.blindAmount;
        actingPlayer.isBlindParticipant = true;
        actingPlayer.lastAction = 'blind-call';
      }

      actingPlayer.hasActedThisRound = true;

      if (this.#getActivePlayers().length <= 1) {
        this.#settleAndPrepareNextHand();
        return;
      }

      if (this.#isBettingRoundComplete()) {
        const participants = this.players.filter((p) => !p.hasFolded && p.isBlindParticipant);
        if (participants.length <= 1) {
          this.#settleAndPrepareNextHand();
          return;
        }

        participants.forEach((p) => {
          p.canViewHand = true;
          p.currentBet = 0;
          p.hasActedThisRound = false;
          p.lastAction = null;
        });
        this.players
          .filter((p) => !participants.includes(p))
          .forEach((p) => {
            p.hasFolded = true;
            p.currentBet = 0;
            p.hasActedThisRound = false;
          });

        this.phase = 'pre-flop';
        this.currentBet = 0;
        this.currentTurnIndex = this.#findNextActivePlayerIndex(-1);
        return;
      }

      this.currentTurnIndex = this.#findNextActivePlayerIndex(actingIndex);
      return;
    }

    const actionType = actionData && actionData.type;
    const validTypes = new Set(['fold', 'check', 'call', 'bet', 'raise']);
    if (!validTypes.has(actionType)) {
      throw new Error(`Unsupported action type: ${actionType}`);
    }

    if (actionType === 'fold') {
      actingPlayer.hasFolded = true;
      actingPlayer.lastAction = 'fold';
      actingPlayer.hasActedThisRound = true;
    } else if (actionType === 'check') {
      const callAmount = this.currentBet - actingPlayer.currentBet;
      if (callAmount !== 0) {
        throw new Error('Cannot check when current bet is higher than player bet');
      }
      actingPlayer.lastAction = 'check';
      actingPlayer.hasActedThisRound = true;
    } else if (actionType === 'call') {
      const callAmount = this.currentBet - actingPlayer.currentBet;
      if (callAmount < 0) {
        throw new Error('Invalid call amount');
      }
      if (callAmount > actingPlayer.chips) {
        throw new Error('Insufficient chips to call');
      }
      actingPlayer.chips -= callAmount;
      actingPlayer.currentBet += callAmount;
      this.pot += callAmount;
      actingPlayer.lastAction = 'call';
      actingPlayer.hasActedThisRound = true;
    } else if (actionType === 'bet') {
      if (this.currentBet !== 0) {
        throw new Error('Cannot bet after a bet already exists, use raise');
      }
      const betAmount = Number(actionData.amount);
      if (!Number.isFinite(betAmount) || betAmount <= 0) {
        throw new Error('Bet amount must be a positive number');
      }
      this.#assertBetWithinLimits(betAmount, '下注');
      if (betAmount > actingPlayer.chips) {
        throw new Error('Insufficient chips to bet');
      }

      actingPlayer.chips -= betAmount;
      actingPlayer.currentBet += betAmount;
      this.currentBet = actingPlayer.currentBet;
      this.pot += betAmount;
      actingPlayer.lastAction = 'bet';
      this.#resetOthersActedFlag(actingPlayer.id);
      actingPlayer.hasActedThisRound = true;
    } else if (actionType === 'raise') {
      if (this.currentBet === 0) {
        throw new Error('Cannot raise without an existing bet, use bet');
      }
      const raiseAmount = Number(actionData.amount);
      if (!Number.isFinite(raiseAmount) || raiseAmount <= 0) {
        throw new Error('Raise amount must be a positive number');
      }
      this.#assertBetWithinLimits(raiseAmount, '加注');

      const callAmount = this.currentBet - actingPlayer.currentBet;
      const totalAmount = callAmount + raiseAmount;
      if (totalAmount > actingPlayer.chips) {
        throw new Error('Insufficient chips to raise');
      }

      actingPlayer.chips -= totalAmount;
      actingPlayer.currentBet += totalAmount;
      this.currentBet = actingPlayer.currentBet;
      this.pot += totalAmount;
      actingPlayer.lastAction = 'raise';
      this.#resetOthersActedFlag(actingPlayer.id);
      actingPlayer.hasActedThisRound = true;
    }

    if (this.#getActivePlayers().length <= 1) {
      this.#settleAndPrepareNextHand();
      return;
    }

    if (this.#isBettingRoundComplete()) {
      if (this.phase === 'river') {
        this.#settleAndPrepareNextHand();
        return;
      }
      this.#advancePhase();
      return;
    }

    this.currentTurnIndex = this.#findNextActivePlayerIndex(actingIndex);
  }

  getGameState(requestingPlayerId) {
    return {
      status: this.status,
      phase: this.phase,
      pot: this.pot,
      currentBet: this.currentBet,
      blindAmount: this.blindAmount,
      betLimit: {
        minBet: this.minBet,
        maxBet: this.maxBet
      },
      totalPlayers: this.players.length,
      currentTurnPlayerId: this.players[this.currentTurnIndex]
        ? this.players[this.currentTurnIndex].id
        : null,
      communityCards: [...this.communityCards],
      lastRoundResult: this.lastRoundResult,
      players: this.players.map((player) => {
        const safePlayer = {
          id: player.id,
          name: player.name,
          chips: player.chips,
          isBlindParticipant: player.isBlindParticipant,
          hasFolded: player.hasFolded,
          currentBet: player.currentBet,
          lastAction: player.lastAction
        };

        if (player.id === requestingPlayerId && player.canViewHand) {
          safePlayer.hand = [...player.hand];
        }

        return safePlayer;
      })
    };
  }

  #resetOthersActedFlag(actingPlayerId) {
    this.players.forEach((player) => {
      if (player.id !== actingPlayerId && !player.hasFolded) {
        player.hasActedThisRound = false;
      }
    });
  }

  #assertBetWithinLimits(amount, actionLabel) {
    if (this.minBet !== null && amount < this.minBet) {
      throw new Error(`${actionLabel}金额低于最小值 ${this.minBet}`);
    }
    if (this.maxBet !== null && amount > this.maxBet) {
      throw new Error(`${actionLabel}金额高于最大值 ${this.maxBet}`);
    }
  }

  #isBettingRoundComplete() {
    const activePlayers = this.#getActivePlayers();
    if (activePlayers.length <= 1) {
      return true;
    }

    return activePlayers.every(
      (player) => player.hasActedThisRound && player.currentBet === this.currentBet
    );
  }

  #advancePhase() {
    if (this.phase === 'pre-flop') {
      this.communityCards.push(this.deck.draw(), this.deck.draw(), this.deck.draw());
      this.phase = 'flop';
    } else if (this.phase === 'flop') {
      this.communityCards.push(this.deck.draw());
      this.phase = 'turn';
    } else if (this.phase === 'turn') {
      this.communityCards.push(this.deck.draw());
      this.phase = 'river';
    } else {
      return;
    }

    this.currentBet = 0;
    this.players.forEach((player) => {
      player.currentBet = 0;
      player.hasActedThisRound = false;
      player.lastAction = null;
    });
    this.currentTurnIndex = this.#findNextActivePlayerIndex(-1);
  }

  #settleAndPrepareNextHand() {
    const activePlayers = this.#getActivePlayers();
    if (activePlayers.length === 0) {
      this.lastRoundResult = null;
      this.pot = 0;
      this.phase = 'showdown';
      this.status = 'ended';
      this.currentTurnIndex = -1;
      return;
    }

    const playerResults = this.players.map((player) => {
      if (player.hasFolded) {
        return {
          id: player.id,
          name: player.name,
          handType: '已弃牌',
          bestCards: [],
          isWinner: false
        };
      }

      const best = this.#getBestHand([...player.hand, ...this.communityCards]);
      return {
        id: player.id,
        name: player.name,
        handType: best.label,
        bestCards: best.cards || [],
        isWinner: false
      };
    });

    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      winner.chips += this.pot;
      winner.lastAction = 'win';
      const winnerResult = playerResults.find((item) => item.id === winner.id);
      if (winnerResult) {
        winnerResult.isWinner = true;
      }
      this.lastRoundResult = {
        winners: [{ id: winner.id, name: winner.name }],
        handType: '单人胜出',
        payout: this.pot,
        communityCards: [...this.communityCards],
        playerResults
      };
    } else {
      const ranked = activePlayers.map((player) => {
        const best = this.#getBestHand([...player.hand, ...this.communityCards]);
        return { player, best };
      });

      let bestRanked = ranked[0];
      for (let i = 1; i < ranked.length; i += 1) {
        if (this.#compareHandRank(ranked[i].best, bestRanked.best) > 0) {
          bestRanked = ranked[i];
        }
      }

      const winners = ranked.filter((entry) => this.#compareHandRank(entry.best, bestRanked.best) === 0);
      const share = Math.floor(this.pot / winners.length);
      let remainder = this.pot - share * winners.length;

      winners.forEach((entry) => {
        let gain = share;
        if (remainder > 0) {
          gain += 1;
          remainder -= 1;
        }
        entry.player.chips += gain;
        entry.player.lastAction = 'win';
        const winnerResult = playerResults.find((item) => item.id === entry.player.id);
        if (winnerResult) {
          winnerResult.isWinner = true;
        }
      });

      this.lastRoundResult = {
        winners: winners.map((entry) => ({ id: entry.player.id, name: entry.player.name })),
        handType: bestRanked.best.label,
        payout: this.pot,
        communityCards: [...this.communityCards],
        playerResults
      };
    }

    this.pot = 0;

    const alivePlayers = this.players.filter((player) => player.chips > 0);
    if (alivePlayers.length < 2) {
      this.phase = 'showdown';
      this.status = 'ended';
      this.currentTurnIndex = -1;
      this.players.forEach((player) => {
        player.hasFolded = player.chips <= 0;
        player.currentBet = 0;
        player.hasActedThisRound = false;
        player.canViewHand = true;
      });
      return;
    }

    this.#startBlindRound();
  }

  #startBlindRound() {
    this.deck = new Deck();
    this.deck.shuffle();
    this.phase = 'blind';
    this.status = 'playing';
    this.currentBet = 0;
    this.communityCards = [];
    this.pot = 0;

    this.players.forEach((player) => {
      player.hand = [];
      player.isBlindParticipant = false;
      player.canViewHand = false;
      player.hasFolded = player.chips <= 0;
      player.currentBet = 0;
      player.hasActedThisRound = false;
      player.lastAction = null;
    });

    for (let i = 0; i < 2; i += 1) {
      this.players.forEach((player) => {
        if (!player.hasFolded) {
          player.hand.push(this.deck.draw());
        }
      });
    }

    this.currentTurnIndex = this.#findNextActivePlayerIndex(-1);
  }

  #getActivePlayers() {
    return this.players.filter((player) => !player.hasFolded);
  }

  #findNextActivePlayerIndex(fromIndex) {
    if (this.players.length === 0) {
      return -1;
    }

    for (let step = 1; step <= this.players.length; step += 1) {
      const index = (fromIndex + step + this.players.length) % this.players.length;
      if (!this.players[index].hasFolded) {
        return index;
      }
    }

    return -1;
  }

  #getBestHand(cards) {
    const combos = this.#combinations(cards, 5);
    let best = null;

    combos.forEach((combo) => {
      const rank = this.#rankFiveCards(combo);
      if (!best || this.#compareHandRank(rank, best) > 0) {
        best = rank;
      }
    });

    return best || { category: -1, kickers: [], label: '无牌型' };
  }

  #combinations(cards, size) {
    const out = [];

    const pick = (start, chosen) => {
      if (chosen.length === size) {
        out.push([...chosen]);
        return;
      }

      for (let i = start; i < cards.length; i += 1) {
        chosen.push(cards[i]);
        pick(i + 1, chosen);
        chosen.pop();
      }
    };

    pick(0, []);
    return out;
  }

  #rankFiveCards(cards) {
    const values = cards.map((card) => Number(card.value)).sort((a, b) => b - a);
    const countsByValue = new Map();
    cards.forEach((card) => {
      const value = Number(card.value);
      countsByValue.set(value, (countsByValue.get(value) || 0) + 1);
    });

    const groups = Array.from(countsByValue.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return b.value - a.value;
      });

    const isFlush = cards.every((card) => card.suit === cards[0].suit);
    const straightHigh = this.#getStraightHigh(values);
    const isStraight = straightHigh !== null;

    if (isStraight && isFlush) {
      return { category: 8, kickers: [straightHigh], label: '同花顺', cards: [...cards] };
    }

    if (groups[0].count === 4) {
      return {
        category: 7,
        kickers: [groups[0].value, groups[1].value],
        label: '四条',
        cards: [...cards]
      };
    }

    if (groups[0].count === 3 && groups[1].count === 2) {
      return {
        category: 6,
        kickers: [groups[0].value, groups[1].value],
        label: '葫芦',
        cards: [...cards]
      };
    }

    if (isFlush) {
      return { category: 5, kickers: values, label: '同花', cards: [...cards] };
    }

    if (isStraight) {
      return { category: 4, kickers: [straightHigh], label: '顺子', cards: [...cards] };
    }

    if (groups[0].count === 3) {
      const kickers = groups.slice(1).map((g) => g.value).sort((a, b) => b - a);
      return {
        category: 3,
        kickers: [groups[0].value, ...kickers],
        label: '三条',
        cards: [...cards]
      };
    }

    if (groups[0].count === 2 && groups[1].count === 2) {
      const pairValues = [groups[0].value, groups[1].value].sort((a, b) => b - a);
      const single = groups[2].value;
      return {
        category: 2,
        kickers: [...pairValues, single],
        label: '两对',
        cards: [...cards]
      };
    }

    if (groups[0].count === 2) {
      const kickers = groups.slice(1).map((g) => g.value).sort((a, b) => b - a);
      return {
        category: 1,
        kickers: [groups[0].value, ...kickers],
        label: '一对',
        cards: [...cards]
      };
    }

    return { category: 0, kickers: values, label: '高牌', cards: [...cards] };
  }

  #getStraightHigh(valuesDesc) {
    const unique = Array.from(new Set(valuesDesc)).sort((a, b) => b - a);
    if (unique.length < 5) {
      return null;
    }

    for (let i = 0; i <= unique.length - 5; i += 1) {
      const window = unique.slice(i, i + 5);
      const isRun = window.every((v, idx) => idx === 0 || v === window[idx - 1] - 1);
      if (isRun) {
        return window[0];
      }
    }

    const wheel = [14, 5, 4, 3, 2];
    const hasWheel = wheel.every((v) => unique.includes(v));
    if (hasWheel) {
      return 5;
    }

    return null;
  }

  #compareHandRank(a, b) {
    if (a.category !== b.category) {
      return a.category - b.category;
    }

    const len = Math.max(a.kickers.length, b.kickers.length);
    for (let i = 0; i < len; i += 1) {
      const av = a.kickers[i] || 0;
      const bv = b.kickers[i] || 0;
      if (av !== bv) {
        return av - bv;
      }
    }

    return 0;
  }
}

module.exports = {
  TexasHoldem
};
