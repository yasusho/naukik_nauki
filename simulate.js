/**
 * 『ナウキ運び』バランス検証＆AI対戦シミュレーター
 * 
 * 実行方法:
 *   node simulate.js
 *   node simulate.js --games 2000 --matchup smart_vs_random
 */

const GOODS = {
  tea: { name: '茶' },
  rice: { name: '米' },
  cloth: { name: '布' },
};

// 3-1-1-1-3 (端牌=3塩, 中張牌=1塩)
const CARD_TEMPLATES = {
  tea: [
    { num: 1, salt: 3 },
    { num: 2, salt: 1 },
    { num: 3, salt: 1 },
    { num: 4, salt: 1 },
    { num: 5, salt: 3 },
  ],
  rice: [
    { num: 1, salt: 3 },
    { num: 2, salt: 1 },
    { num: 3, salt: 1 },
    { num: 4, salt: 1 },
    { num: 5, salt: 3 },
  ],
  cloth: [
    { num: 1, salt: 3 },
    { num: 2, salt: 1 },
    { num: 3, salt: 1 },
    { num: 4, salt: 1 },
    { num: 5, salt: 3 },
  ]
};

const HAND_LIMITS = [5, 7, 10];
const WIN_SCORE = 20;

function createDeck() {
  const deck = [];
  let id = 1;
  ['tea', 'rice', 'cloth'].forEach(t => {
    CARD_TEMPLATES[t].forEach(tpl => {
      for (let i = 0; i < 4; i++) {
        deck.push({ id: id++, type: t, num: tpl.num, salt: tpl.salt });
      }
    });
  });
  return deck.sort(() => Math.random() - 0.5);
}

function drawSafe(count, currentDeck, currentDiscard) {
  let d = [...currentDeck];
  let disc = [...currentDiscard];
  const drawn = [];

  for (let i = 0; i < count; i++) {
    if (d.length === 0) {
      if (disc.length > 0) {
        d = disc.sort(() => Math.random() - 0.5);
        disc = [];
      } else {
        break;
      }
    }
    if (d.length > 0) drawn.push(d.shift());
  }
  return { drawn, newDeck: d, newDiscard: disc };
}

// 刻子ボーナス +3点
function evalSet(cards) {
  if (!cards || cards.length !== 3) return null;
  const t = cards[0].type;
  if (!cards.every(c => c.type === t)) return null;

  const nums = cards.map(c => c.num).sort((a, b) => a - b);
  const baseSalt = cards.reduce((s, c) => s + c.salt, 0);

  // 同数3枚（刻子）: 基本塩 + 3塩ボーナス！
  if (nums[0] === nums[1] && nums[1] === nums[2]) {
    return {
      name: `${t} ${nums[0]}×3 (刻子)`,
      salt: baseSalt + 3,
      isTriplet: true,
      cards,
      type: t
    };
  }
  // 連続3枚（順子）: 基本塩そのまま
  if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2]) {
    return {
      name: `${t} ${nums[0]}-${nums[2]} (順子)`,
      salt: baseSalt,
      isTriplet: false,
      cards,
      type: t
    };
  }
  return null;
}

function findSets(hand) {
  const list = [];
  if (!hand || hand.length < 3) return list;
  const n = hand.length;
  const seenPatterns = new Set();

  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const trio = [hand[i], hand[j], hand[k]];
        const r = evalSet(trio);
        if (r) {
          const numsKey = trio.map(c => c.num).sort((a, b) => a - b).join(',');
          const patternKey = `${r.type}:${numsKey}:s${r.salt}`;
          if (!seenPatterns.has(patternKey)) {
            seenPatterns.add(patternKey);
            const key = trio.map(c => c.id).sort().join('-');
            list.push({ trio, info: r, key });
          }
        }
      }
    }
  }
  return list;
}

// 牌効率・手札価値評価
function evaluateHandValue(hand, weights = { salt: 10, tea: 1, rice: 1, cloth: 1 }) {
  if (!hand || hand.length === 0) return 0;
  const sets = findSets(hand);
  let value = 0;
  const usedCardIds = new Set();

  sets.forEach(s => {
    const ids = s.trio.map(c => c.id);
    if (!ids.some(id => usedCardIds.has(id))) {
      ids.forEach(id => usedCardIds.add(id));
      const typeBonus = (weights[s.info.type] || 1) * 15;
      value += 100 + typeBonus + s.info.salt * weights.salt;
    }
  });

  const remainingCards = hand.filter(c => !usedCardIds.has(c.id));
  const byType = { tea: [], rice: [], cloth: [] };
  remainingCards.forEach(c => byType[c.type].push(c));

  Object.keys(byType).forEach(t => {
    const list = byType[t].sort((a, b) => a.num - b.num);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const diff = Math.abs(list[i].num - list[j].num);
        if (diff === 0) {
          value += 30; // 対子
        } else if (diff === 1) {
          value += (list[i].num === 1 || list[j].num === 5) ? 25 : 20; // 連続
        } else if (diff === 2) {
          value += 15; // 嵌張
        }
      }
    }
  });
  return value;
}

// 不要牌の優先度算出
function getCardDiscardPriorities(hand, weights) {
  if (!hand || hand.length === 0) return [];
  const baseValue = evaluateHandValue(hand, weights);
  return hand.map((c, idx) => {
    const withoutC = hand.filter((_, i) => i !== idx);
    const valAfter = evaluateHandValue(withoutC, weights);
    const loss = baseValue - valAfter;
    return { card: c, idx, loss };
  }).sort((a, b) => a.loss - b.loss);
}

// 戦略ファクトリー
function createBaseStrategy(name, weights, behavior) {
  return {
    name,
    weights,
    chooseMove(player, state) {
      const hList = player.hand;
      if (!hList || hList.length === 0) return 0;

      const priorities = getCardDiscardPriorities(hList, weights);
      const totalSalt = player.boxes.reduce((s, b) => s + (b.salt || 0), 0);
      const hasSalt = totalSalt > 0;
      const hasCargo = player.boxes.some(b => b.cargo);
      const cargoCount = player.boxes.filter(b => b.cargo).length;

      let bestScore = -99999;
      let bestIdx = 0;

      hList.forEach((c, idx) => {
        const target = (player.pos + c.num) % 8;
        let score = 0;

        const pInfo = priorities.find(p => p.idx === idx);
        const discardEfficiency = 100 - (pInfo ? pInfo.loss : 50);
        score += discardEfficiency * 0.9;

        // 目的地の価値
        if (target === 0) {
          if (hasSalt) {
            score += 180 + totalSalt * 25;
            if (player.score + totalSalt >= WIN_SCORE) score += 2000;
          } else {
            score -= 20;
          }
        } else if (target === 4) {
          if (hasCargo) {
            const bonus = player.guildLv === 1 ? 0 : player.guildLv === 2 ? 3 : 6;
            const expectedSalt = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.salt + bonus : 0), 0);
            score += 140 + expectedSalt * 15 + cargoCount * 20;
          } else {
            score -= 25;
          }
        }

        if (behavior.getTargetBonus) {
          score += behavior.getTargetBonus(target, player, state);
        }

        const roadStack = state.road[target] || [];
        if (roadStack.length > 0) {
          const handWithRoad = [...hList.filter((_, i) => i !== idx), ...roadStack];
          const gain = evaluateHandValue(handWithRoad, weights) - evaluateHandValue(hList, weights);
          score += roadStack.length * 8 + Math.max(0, gain) * 0.4;
        }

        if (hasCargo && !hasSalt) {
          const distToPort = (4 - target + 8) % 8;
          score += (8 - distToPort) * 8;
        }
        if (hasSalt) {
          const distToHome = (8 - target) % 8;
          score += (8 - distToHome) * 12;
        }

        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });

      return bestIdx;
    },

    shouldReplenishRoad(player, state) {
      const roadStack = state.road[player.pos] || [];
      if (roadStack.length === 0) return false;
      const currentVal = evaluateHandValue(player.hand, weights);
      const withRoadVal = evaluateHandValue([...player.hand, ...roadStack], weights);
      const setsBefore = findSets(player.hand).length;
      const setsAfter = findSets([...player.hand, ...roadStack]).length;

      if (setsAfter > setsBefore) return true;
      if (roadStack.length >= 2 && withRoadVal > currentVal) return true;
      if (roadStack.length >= 3) return true;
      return false;
    },

    chooseExcessReturns(player, excessCount) {
      const priorities = getCardDiscardPriorities(player.hand, weights);
      return priorities.slice(0, excessCount).map(p => p.card.id);
    },

    decideCargoLoading(player, availableSets) {
      const emptySlots = player.boxes.filter(b => b.unlocked && !b.cargo && b.salt === 0).length;
      if (emptySlots === 0 || availableSets.length === 0) return [];
      return availableSets.slice(0, emptySlots);
    }
  };
}

// 1. 手札拡張型 (HandLimit Build)
const HandLimitBot = createBaseStrategy(
  '手札拡張型',
  { salt: 10, tea: 1.0, rice: 1.5, cloth: 1.0 },
  {
    getTargetBonus(target, player, state) {
      if (target === 2 && player.handLimitLv < 3) {
        const availableCargo = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.salt : 0), 0);
        const cost = player.handLimitLv === 1 ? 5 : 8;
        if (availableCargo >= cost) return 180;
        return 60;
      }
      return 0;
    }
  }
);

// 2. 荷箱特化型 (CargoBoxes Build)
const CargoBoxesBot = createBaseStrategy(
  '荷箱特化型',
  { salt: 10, tea: 1.0, rice: 1.0, cloth: 1.5 },
  {
    getTargetBonus(target, player, state) {
      if (target === 2 && player.boxesLv < 3) {
        const availableCargo = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.salt : 0), 0);
        const cost = player.boxesLv === 1 ? 5 : 8;
        if (availableCargo >= cost) return 190;
        return 70;
      }
      return 0;
    }
  }
);

// 3. 会所特化型 (GuildBonus Build)
const GuildBonusBot = createBaseStrategy(
  '会所特化型',
  { salt: 12, tea: 1.0, rice: 1.2, cloth: 1.2 },
  {
    getTargetBonus(target, player, state) {
      if (target === 6 && player.guildLv < 3) {
        const cost = player.guildLv === 1 ? 5 : 8;
        const availableCargo = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.salt : 0), 0);
        if (availableCargo >= cost) return 185;
        return 65;
      }
      return 0;
    }
  }
);

// 4. 直行速攻型 (Tea Rush Build)
const TeaRushBot = createBaseStrategy(
  '直行速攻型',
  { salt: 20, tea: 1.5, rice: 1.0, cloth: 1.0 },
  {
    getTargetBonus(target, player, state) {
      const hasCargo = player.boxes.some(b => b.cargo);
      const hasSalt = player.boxes.some(b => b.salt > 0);
      if (target === 4 && hasCargo) return 130;
      if (target === 0 && hasSalt) return 140;
      return 0;
    }
  }
);

// 5. 状況適応型 (Adaptive Master)
const AdaptiveBot = createBaseStrategy(
  '状況適応型',
  { salt: 12, tea: 1.2, rice: 1.2, cloth: 1.2 },
  {
    getTargetBonus(target, player, state) {
      const availableCargo = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.salt : 0), 0);
      if (target === 2) {
        if (player.handLimitLv === 1 && availableCargo >= 5) return 120;
        if (player.boxesLv === 1 && availableCargo >= 5) return 130;
      }
      if (target === 6 && player.guildLv === 1 && availableCargo >= 5) {
        return 125;
      }
      return 0;
    }
  }
);

// 6. ランダム型 (Random Baseline Bot)
const RandomBot = {
  name: 'ランダム型',
  desc: '合法手から完全ランダムに選択するベースライン検証AI',
  color: '#94a3b8',
  weights: { salt: 1, tea: 1, rice: 1, cloth: 1 },
  chooseMove(player, state) {
    if (!player.hand || player.hand.length === 0) return 0;
    return Math.floor(Math.random() * player.hand.length);
  },
  shouldReplenishRoad(player, state) {
    const roadCards = state.road[player.pos] || [];
    if (roadCards.length === 0) return false;
    return Math.random() < 0.5;
  },
  chooseExcessReturns(player, excessCount) {
    const hList = [...player.hand];
    return hList.sort(() => Math.random() - 0.5).slice(0, excessCount).map(c => c.id);
  },
  decideCargoLoading(player, availableSets) {
    const emptySlots = player.boxes.filter(b => b.unlocked && !b.cargo && b.salt === 0).length;
    if (emptySlots === 0 || availableSets.length === 0) return [];
    const shuffled = [...availableSets].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, emptySlots);
  }
};

// ----------------------------------------------------
// 1ゲーム実行エンジン
// ----------------------------------------------------
function runSingleGame(botStrategies, winScore = 20) {
  const d = createDeck();
  const players = botStrategies.map((bot, i) => ({
    id: i,
    name: `${bot.name}_${i}`,
    strategy: bot,
    pos: 0,
    hand: d.splice(0, 5),
    boxes: [
      { unlocked: true, cargo: null, salt: 0 },
      { unlocked: false, cargo: null, salt: 0 },
      { unlocked: false, cargo: null, salt: 0 }
    ],
    handLimitLv: 1,
    boxesLv: 1,
    guildLv: 1,
    score: 0
  }));

  const road = Array(8).fill(null).map(() => [d.shift()]);
  let state = {
    deck: d,
    discard: [],
    road,
    players,
    turn: 0,
    step: 1,
    facilityUsed: false,
    gameOver: false
  };

  let totalRounds = 0;
  const maxRounds = 120;

  while (!state.gameOver && totalRounds < maxRounds) {
    const curr = state.players[state.turn];
    const bot = curr.strategy;
    const botHandLimit = HAND_LIMITS[curr.handLimitLv - 1];

    // 1. 移動 (Step 1)
    if (curr.hand.length === 0) {
      const res = drawSafe(1, state.deck, state.discard);
      state.deck = res.newDeck;
      state.discard = res.newDiscard;
      const topCard = res.drawn[0] || { num: 1, type: 'tea', salt: 3 };
      const nextPos = (curr.pos + topCard.num) % 8;
      state.road[curr.pos].push(topCard);
      curr.pos = nextPos;
    } else {
      const moveIdx = bot.chooseMove(curr, state);
      const chosenCard = curr.hand[moveIdx] || curr.hand[0];
      const nextPos = (curr.pos + chosenCard.num) % 8;
      state.road[curr.pos].push(chosenCard);
      curr.hand = curr.hand.filter((_, i) => i !== moveIdx);
      curr.pos = nextPos;
    }

    // 2. 補充 (Step 2)
    const wantRoad = bot.shouldReplenishRoad(curr, state);
    const roadCards = state.road[curr.pos] || [];

    if (wantRoad && roadCards.length > 0) {
      const combined = [...curr.hand, ...roadCards];
      state.road[curr.pos] = [];

      if (combined.length > botHandLimit) {
        const excessCount = combined.length - botHandLimit;
        curr.hand = combined;
        const returnIds = bot.chooseExcessReturns(curr, excessCount);
        const toReturn = curr.hand.filter(c => returnIds.includes(c.id));
        curr.hand = curr.hand.filter(c => !returnIds.includes(c.id));
        state.road[curr.pos] = toReturn;
      } else {
        curr.hand = combined;
      }
    } else {
      const needed = Math.max(0, botHandLimit - curr.hand.length);
      const res = drawSafe(needed, state.deck, state.discard);
      curr.hand = [...curr.hand, ...res.drawn];
      state.deck = res.newDeck;
      state.discard = res.newDiscard;
    }

    // 3. 行動 (Step 3: 施設 ＆ 荷積み)
    let bxs = curr.boxes;
    let sc = curr.score;
    let newDiscard = state.discard;

    // 施設効果
    if (curr.pos === 0) {
      // 0: 地元
      bxs = bxs.map(b => {
        if (b.salt > 0) sc += b.salt;
        return { ...b, cargo: null, salt: 0 };
      });
      if (sc >= winScore) {
        state.gameOver = true;
        curr.score = sc;
        curr.boxes = bxs;
        break;
      }
    } else if (curr.pos === 4) {
      // 4: 港
      const bonus = curr.guildLv === 1 ? 0 : curr.guildLv === 2 ? 3 : 6;
      bxs = bxs.map(b => {
        if (b.unlocked && b.cargo) {
          const gain = b.cargo.salt + bonus;
          if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
          return { ...b, cargo: null, salt: (b.salt || 0) + gain };
        }
        return b;
      });
    } else if (curr.pos === 2) {
      // 2: 箱屋 (5塩/8塩)
      const availableCargo = bxs.reduce((sum, b) => sum + (b.cargo ? b.cargo.salt : 0), 0);
      if (curr.handLimitLv < 3) {
        const cost = curr.handLimitLv === 1 ? 5 : 8;
        if (availableCargo >= cost) {
          let rem = cost;
          bxs = bxs.map(b => {
            if (b.cargo && rem > 0) {
              rem -= b.cargo.salt;
              if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
              return { ...b, cargo: null };
            }
            return b;
          });
          curr.handLimitLv += 1;
        }
      }
      if (curr.boxesLv < 3) {
        const cost = curr.boxesLv === 1 ? 5 : 8;
        const updatedCargo = bxs.reduce((sum, b) => sum + (b.cargo ? b.cargo.salt : 0), 0);
        if (updatedCargo >= cost) {
          let rem = cost;
          bxs = bxs.map((b, idx) => {
            if (idx === curr.boxesLv) return { ...b, unlocked: true };
            if (b.cargo && rem > 0) {
              rem -= b.cargo.salt;
              if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
              return { ...b, cargo: null };
            }
            return b;
          });
          curr.boxesLv += 1;
        }
      }
    } else if (curr.pos === 6 && curr.guildLv < 3) {
      // 6: 会所 (5塩/8塩)
      const cost = curr.guildLv === 1 ? 5 : 8;
      const availableCargo = bxs.reduce((sum, b) => sum + (b.cargo ? b.cargo.salt : 0), 0);
      if (availableCargo >= cost) {
        let rem = cost;
        bxs = bxs.map(b => {
          if (b.cargo && rem > 0) {
            rem -= b.cargo.salt;
            if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
            return { ...b, cargo: null };
          }
          return b;
        });
        curr.guildLv += 1;
      }
    }

    // 荷箱に積む
    while (true) {
      const sets = findSets(curr.hand);
      const emptyIdx = bxs.findIndex(b => b.unlocked && !b.cargo && b.salt === 0);
      if (sets.length > 0 && emptyIdx !== -1) {
        const chosen = sets[0];
        const ids = chosen.trio.map(c => c.id);
        curr.hand = curr.hand.filter(c => !ids.includes(c.id));
        bxs[emptyIdx] = { ...bxs[emptyIdx], cargo: chosen.info };
      } else {
        break;
      }
    }

    curr.boxes = bxs;
    curr.score = sc;
    state.discard = newDiscard;

    state.turn = (state.turn + 1) % 4;
    if (state.turn === 0) totalRounds++;
  }

  let winnerId = 0;
  let maxScore = -1;
  state.players.forEach((p, idx) => {
    if (p.score > maxScore) {
      maxScore = p.score;
      winnerId = idx;
    }
  });

  return {
    winnerId,
    winnerStrategy: state.players[winnerId].strategy.name,
    rounds: totalRounds,
    finalPlayers: state.players
  };
}

// ----------------------------------------------------
// バッチシミュレーション実行＆レポート生成
// ----------------------------------------------------
function runSimulation(numGames = 1000, matchup = 'four_builds', winScore = 20) {
  console.log(`\n======================================================`);
  console.log(`🏮 『ナウキ運び』バランス検証シミュレーション (${numGames} 試合 / 目標: ${winScore}点)`);
  console.log(`   対戦カード構成: ${matchup}`);
  console.log(`======================================================\n`);

  let bots = [];
  if (matchup === 'four_builds' || matchup === 'tournament') {
    bots = [HandLimitBot, CargoBoxesBot, GuildBonusBot, TeaRushBot];
  } else if (matchup === 'hand_vs_rush') {
    bots = [HandLimitBot, TeaRushBot, HandLimitBot, TeaRushBot];
  } else if (matchup === 'boxes_vs_guild') {
    bots = [CargoBoxesBot, GuildBonusBot, CargoBoxesBot, GuildBonusBot];
  } else if (matchup === 'all_adaptive') {
    bots = [AdaptiveBot, AdaptiveBot, AdaptiveBot, AdaptiveBot];
  } else if (matchup === 'smart_vs_random') {
    bots = [AdaptiveBot, RandomBot, RandomBot, RandomBot];
  } else if (matchup === 'all_random') {
    bots = [RandomBot, RandomBot, RandomBot, RandomBot];
  } else if (matchup === 'builds_vs_random') {
    bots = [GuildBonusBot, HandLimitBot, TeaRushBot, RandomBot];
  } else {
    bots = [HandLimitBot, CargoBoxesBot, GuildBonusBot, TeaRushBot];
  }

  const stats = {
    winsByPlayer: [0, 0, 0, 0],
    winsByStrategy: {},
    totalRounds: 0,
    roundsList: [],
    scoresByPlayer: [[], [], [], []],
    handLimitLevels: [0, 0, 0, 0],
    boxesLevels: [0, 0, 0, 0],
    guildLevels: [0, 0, 0, 0],
    winnerHandLimitLevels: [0, 0, 0, 0],
    winnerBoxesLevels: [0, 0, 0, 0],
    winnerGuildLevels: [0, 0, 0, 0],
  };

  bots.forEach(b => {
    if (!stats.winsByStrategy[b.name]) stats.winsByStrategy[b.name] = { wins: 0, games: 0 };
  });

  const startTime = Date.now();

  for (let g = 0; g < numGames; g++) {
    const res = runSingleGame(bots, winScore);
    const wId = res.winnerId;
    stats.winsByPlayer[wId]++;
    stats.winsByStrategy[res.winnerStrategy].wins++;
    stats.totalRounds += res.rounds;
    stats.roundsList.push(res.rounds);

    const winnerP = res.finalPlayers[wId];
    stats.winnerHandLimitLevels[wId] += winnerP.handLimitLv;
    stats.winnerBoxesLevels[wId] += winnerP.boxesLv;
    stats.winnerGuildLevels[wId] += winnerP.guildLv;

    res.finalPlayers.forEach((p, idx) => {
      stats.scoresByPlayer[idx].push(p.score);
      stats.handLimitLevels[idx] += p.handLimitLv;
      stats.boxesLevels[idx] += p.boxesLv;
      stats.guildLevels[idx] += p.guildLv;
    });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const avgRounds = (stats.totalRounds / numGames).toFixed(1);
  stats.roundsList.sort((a, b) => a - b);
  const medianRounds = stats.roundsList[Math.floor(numGames / 2)];
  const minRounds = stats.roundsList[0];
  const maxRounds = stats.roundsList[stats.roundsList.length - 1];

  const totalWins = stats.winsByPlayer.reduce((a, b) => a + b, 0);
  const winHandLv = (stats.winnerHandLimitLevels.reduce((a, b) => a + b, 0) / totalWins).toFixed(2);
  const winBoxLv = (stats.winnerBoxesLevels.reduce((a, b) => a + b, 0) / totalWins).toFixed(2);
  const winGuildLv = (stats.winnerGuildLevels.reduce((a, b) => a + b, 0) / totalWins).toFixed(2);

  console.log(`⏱️ 実行時間: ${elapsed} 秒 (${(numGames / elapsed).toFixed(0)} 試合/秒)`);
  console.log(`🎯 決着ラウンド数: 平均 ${avgRounds} 巡 (最速: ${minRounds} 巡 / 最遅: ${maxRounds} 巡 / 中央値: ${medianRounds} 巡)`);
  console.log(`🏆 全勝者 平均施設強化: 🎴手札Lv.${winHandLv} / 📦荷箱Lv.${winBoxLv} / 🏛️会所Lv.${winGuildLv}\n`);

  console.log(`📊 【プレイヤー別成績（手番順 ＆ 🏆勝者時レベル到達度）】`);
  console.log(`-----------------------------------------------------------------------------------------`);
  console.log(`座順 | 戦略名    | 勝数 / 試合数   | 勝率   | 平均得点 | 🏆勝者手札Lv | 🏆勝者荷箱Lv | 🏆勝者会所Lv`);
  console.log(`-----------------------------------------------------------------------------------------`);
  bots.forEach((b, i) => {
    const w = stats.winsByPlayer[i];
    const rate = ((w / numGames) * 100).toFixed(1);
    const avgScore = (stats.scoresByPlayer[i].reduce((sum, s) => sum + s, 0) / numGames).toFixed(1);
    const pWinHandLv = w > 0 ? (stats.winnerHandLimitLevels[i] / w).toFixed(2) : '-';
    const pWinBoxLv = w > 0 ? (stats.winnerBoxesLevels[i] / w).toFixed(2) : '-';
    const pWinGuildLv = w > 0 ? (stats.winnerGuildLevels[i] / w).toFixed(2) : '-';
    console.log(` P${i + 1} | ${b.name.padEnd(6, ' ')} | ${String(w).padStart(4, ' ')} / ${numGames} | ${rate.padStart(5, ' ')}% | ${avgScore.padStart(6, ' ')}点 | Lv.${pWinHandLv.padEnd(8, ' ')} | Lv.${pWinBoxLv.padEnd(8, ' ')} | Lv.${pWinGuildLv}`);
  });
  console.log(`-----------------------------------------------------------------------------------------\n`);

  console.log(`🏆 【戦略別 勝率サマリー】`);
  Object.keys(stats.winsByStrategy).forEach(name => {
    const w = stats.winsByStrategy[name].wins;
    const count = bots.filter(b => b.name === name).length;
    const totalSlotGames = numGames * count;
    console.log(`  * ${name.padEnd(10, ' ')}: 勝率 ${((w / totalSlotGames) * 100).toFixed(1)}% (${w}勝 / ${totalSlotGames}プレイヤー枠)`);
  });
  console.log(`\n======================================================\n`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let numGames = 1000;
  let matchup = 'four_builds';
  let winScore = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--games' && args[i + 1]) numGames = parseInt(args[i + 1], 10);
    if (args[i] === '--matchup' && args[i + 1]) matchup = args[i + 1];
    if (args[i] === '--winScore' && args[i + 1]) winScore = parseInt(args[i + 1], 10);
  }

  runSimulation(numGames, matchup, winScore);
}

module.exports = {
  createDeck,
  drawSafe,
  evalSet,
  findSets,
  evaluateHandValue,
  getCardDiscardPriorities,
  runSingleGame,
  runSimulation,
  HAND_LIMITS,
  WIN_SCORE,
  GOODS,
  CARD_TEMPLATES
};
