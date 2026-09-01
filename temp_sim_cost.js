/**
 * 『ナウキ運び』バランス検証＆AI対戦シミュレーター
 * 
 * 実行方法:
 *   node simulate.js
 *   node simulate.js --games 2000 --matchup smart_vs_legacy
 */

const GOODS = {
  tea: { name: '茶', saltRate: 2, porterRate: 0, packRate: 0 },
  rice: { name: '米', saltRate: 0, porterRate: 2, packRate: 0 },
  cloth: { name: '布', saltRate: 0, porterRate: 0, packRate: 2 },
};

const CARD_TEMPLATES = {
  tea: [
    { num: 1, salt: 2, porter: 1, pack: 0 },
    { num: 2, salt: 1, porter: 1, pack: 0 },
    { num: 3, salt: 1, porter: 0, pack: 0 },
    { num: 4, salt: 0, porter: 1, pack: 1 },
    { num: 5, salt: 2, porter: 0, pack: 1 },
  ],
  rice: [
    { num: 1, salt: 0, porter: 2, pack: 1 },
    { num: 2, salt: 0, porter: 1, pack: 1 },
    { num: 3, salt: 0, porter: 1, pack: 0 },
    { num: 4, salt: 1, porter: 0, pack: 1 },
    { num: 5, salt: 1, porter: 2, pack: 0 },
  ],
  cloth: [
    { num: 1, salt: 1, porter: 0, pack: 2 },
    { num: 2, salt: 1, porter: 0, pack: 1 },
    { num: 3, salt: 0, porter: 0, pack: 1 },
    { num: 4, salt: 1, porter: 1, pack: 0 },
    { num: 5, salt: 0, porter: 1, pack: 2 },
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
        deck.push({ id: id++, type: t, num: tpl.num, salt: tpl.salt, porter: tpl.porter, pack: tpl.pack });
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
      if (disc.length === 0) break;
      d = disc.sort(() => Math.random() - 0.5);
      disc = [];
    }
    if (d.length > 0) drawn.push(d.shift());
  }
  return { drawn, newDeck: d, newDiscard: disc };
}

function evalSet(cards) {
  if (!cards || cards.length !== 3) return null;
  const t = cards[0].type;
  if (!cards.every(c => c.type === t)) return null;

  const nums = cards.map(c => c.num).sort((a, b) => a - b);
  const salt = cards.reduce((s, c) => s + c.salt, 0);
  const porter = cards.reduce((s, c) => s + c.porter, 0);
  const pack = cards.reduce((s, c) => s + c.pack, 0);

  if (nums[0] === nums[1] && nums[1] === nums[2]) {
    return {
      name: `${t} ${nums[0]}×3`,
      salt,
      porter,
      pack,
      cards,
      type: t
    };
  }
  if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2]) {
    return {
      name: `${t} ${nums[0]}-${nums[2]}`,
      salt,
      porter,
      pack,
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
          const patternKey = `${r.type}:${numsKey}:s${r.salt}:p${r.porter}:k${r.pack}`;
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

// ----------------------------------------------------
// 牌効率・手札価値評価（戦略ごとの重視リソースに対応）
function evaluateHandValue(hand, weights = { salt: 10, porter: 5, pack: 5, tea: 1, rice: 1, cloth: 1 }) {
  if (!hand || hand.length === 0) return 0;
  const sets = findSets(hand);
  let value = 0;
  const usedCardIds = new Set();

  sets.forEach(s => {
    const ids = s.trio.map(c => c.id);
    if (!ids.some(id => usedCardIds.has(id))) {
      ids.forEach(id => usedCardIds.add(id));
      const typeBonus = (weights[s.info.type] || 1) * 20;
      value += 100 + typeBonus + s.info.salt * weights.salt + s.info.porter * weights.porter + s.info.pack * weights.pack;
    }
  });

  const remainingCards = hand.filter(c => !usedCardIds.has(c.id));
  const byType = { tea: [], rice: [], cloth: [] };
  remainingCards.forEach(c => byType[c.type].push(c));

  Object.keys(byType).forEach(t => {
    const list = byType[t].sort((a, b) => a.num - b.num);
    const pref = (weights[t] || 1);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const diff = Math.abs(list[i].num - list[j].num);
        if (diff === 0) value += 25 * pref;
        else if (diff === 1) value += ((list[i].num === 1 || list[j].num === 5) ? 20 : 30) * pref;
        else if (diff === 2) value += 15 * pref;
      }
    }
  });
  return value;
}

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


// ----------------------------------------------------
// 4大戦略ビルド（同等実力ベース）
// ----------------------------------------------------

function createBaseStrategy(name, weights, customLogic) {
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

        // 1. 共通: 手札効率（不要牌ほど出しやすい）
        const pInfo = priorities.find(p => p.idx === idx);
        score += (100 - (pInfo ? pInfo.loss : 50)) * 0.9;

        // 2. 共通: 地元(0)への塩納品
        if (target === 0) {
          if (hasSalt) {
            score += 180 + totalSalt * 25;
            if (player.score + totalSalt >= WIN_SCORE) score += 2000;
          } else {
            score -= 15;
          }
        }

        // 3. 共通: 港(4)での売却
        else if (target === 4) {
          if (hasCargo) {
            const bonus = [0,3,6][player.guildLv - 1];
            const expectedSalt = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.salt + bonus : 0), 0);
            score += 140 + expectedSalt * 15 + cargoCount * 30;
          } else {
            score -= 20;
          }
        }

        // 4. 戦略固有の目的地ボーナス
        score += customLogic.getTargetBonus(target, player, state);

        // 5. 共通: 街道カード回収の期待値
        const roadStack = state.road[target] || [];
        if (roadStack.length > 0) {
          const handWithRoad = [...hList.filter((_, i) => i !== idx), ...roadStack];
          const gain = evaluateHandValue(handWithRoad, weights) - evaluateHandValue(hList, weights);
          score += roadStack.length * 8 + Math.max(0, gain) * 0.4;
        }

        // 6. 共通: 進行方向のルートボーナス
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
    }
  };
}

// 1. 手札拡張特化型 (HandLimit Build)
const HandLimitBot = createBaseStrategy(
  '手札拡張型',
  { salt: 8, porter: 15, pack: 4, tea: 0.8, rice: 2.0, cloth: 0.8 },
  {
    getTargetBonus(target, player, state) {
      if (target === 2 && player.handLimitLv < 3) {
        const availablePorter = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.porter : 0), 0);
        const cost = player.handLimitLv === 1 ? 2 : 4;
        if (availablePorter >= cost) return 180;
        return 60;
      }
      return 0;
    }
  }
);

// 2. 荷箱枠特化型 (CargoBoxes Build)
const CargoBoxesBot = createBaseStrategy(
  '荷箱特化型',
  { salt: 8, porter: 4, pack: 15, tea: 0.8, rice: 0.8, cloth: 2.0 },
  {
    getTargetBonus(target, player, state) {
      if (target === 2 && player.boxesLv < 3) {
        const availablePack = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.pack : 0), 0);
        const cost = player.boxesLv === 1 ? 2 : 4;
        if (availablePack >= cost) return 190;
        return 70;
      }
      return 0;
    }
  }
);

// 3. 会所ブースト型 (GuildBonus Build)
const GuildBonusBot = createBaseStrategy(
  '会所特化型',
  { salt: 10, porter: 10, pack: 10, tea: 1.0, rice: 1.5, cloth: 1.5 },
  {
    getTargetBonus(target, player, state) {
      if (target === 6 && player.guildLv < 3) {
        const reqP = player.guildLv === 1 ? 1 : 2;
        const reqK = player.guildLv === 1 ? 1 : 2;
        const availablePorter = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.porter : 0), 0);
        const availablePack = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.pack : 0), 0);
        if (availablePorter >= reqP && availablePack >= reqK) return 185;
        return 65;
      }
      return 0;
    }
  }
);

// 4. 茶塩速攻型 (Tea Rush Build)
const TeaRushBot = createBaseStrategy(
  '茶塩速攻型',
  { salt: 20, porter: 2, pack: 2, tea: 2.5, rice: 0.6, cloth: 0.6 },
  {
    getTargetBonus(target, player, state) {
      const hasCargo = player.boxes.some(b => b.cargo);
      const hasSalt = player.boxes.some(b => b.salt > 0);
      if (target === 4 && hasCargo) return 120;
      if (target === 0 && hasSalt) return 130;
      return 0;
    }
  }
);

// 5. 状況適応型 (Adaptive Master)
const AdaptiveBot = createBaseStrategy(
  '状況適応型',
  { salt: 12, porter: 8, pack: 8, tea: 1.2, rice: 1.2, cloth: 1.2 },
  {
    getTargetBonus(target, player, state) {
      const availablePorter = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.porter : 0), 0);
      const availablePack = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.pack : 0), 0);

      if (target === 2) {
        if (player.handLimitLv === 1 && availablePorter >= 3) return 110;
        if (player.boxesLv === 1 && availablePack >= 3) return 120;
      }
      if (target === 6 && player.guildLv === 1 && availablePorter >= 1 && availablePack >= 1) {
        return 115;
      }
      return 0;
    }
  }
);


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
    gameOver: false,
    reshuffleCount: 0
  };

  let totalRounds = 0;
  const maxRounds = 120;

  while (!state.gameOver && totalRounds < maxRounds) {
    const curr = state.players[state.turn];
    const bot = curr.strategy;
    const botHandLimit = HAND_LIMITS[curr.handLimitLv - 1];

    // ----------------------------
    // 1. 移動 (Step 1)
    // ----------------------------
    if (curr.hand.length === 0) {
      const res = drawSafe(1, state.deck, state.discard);
      state.deck = res.newDeck;
      state.discard = res.newDiscard;
      const topCard = res.drawn[0] || { num: 1, type: 'tea', salt: 1, porter: 0, pack: 0 };
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

    // ----------------------------
    // 2. 補充 (Step 2)
    // ----------------------------
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

    // ----------------------------
    // 3. 行動 (Step 3: 施設 ＆ 荷積み)
    // ----------------------------
    let bxs = curr.boxes;
    let sc = curr.score;
    let newDiscard = state.discard;

    // 施設効果
    // 0: 地元
    if (curr.pos === 0) {
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
    }
    // 4: 港
    else if (curr.pos === 4) {
      const bonus = [0,3,6][curr.guildLv - 1];
      bxs = bxs.map(b => {
        if (b.unlocked && b.cargo) {
          const gain = b.cargo.salt + bonus;
          if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
          return { ...b, cargo: null, salt: (b.salt || 0) + gain };
        }
        return b;
      });
    }
    // 2: 箱屋
    else if (curr.pos === 2) {
      if (curr.handLimitLv < 3) {
        const cost = curr.handLimitLv === 1 ? 2 : 4;
        const totalPorter = bxs.reduce((sum, b) => sum + (b.cargo ? b.cargo.porter : 0), 0);
        if (totalPorter >= cost) {
          let rem = cost;
          bxs = bxs.map(b => {
            if (b.cargo && rem > 0) {
              rem -= b.cargo.porter;
              if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
              return { ...b, cargo: null };
            }
            return b;
          });
          curr.handLimitLv += 1;
        }
      }
      if (curr.boxesLv < 3) {
        const cost = curr.boxesLv === 1 ? 2 : 4;
        const totalPack = bxs.reduce((sum, b) => sum + (b.cargo ? b.cargo.pack : 0), 0);
        if (totalPack >= cost) {
          let rem = cost;
          bxs = bxs.map((b, idx) => {
            if (idx === curr.boxesLv) return { ...b, unlocked: true };
            if (b.cargo && rem > 0) {
              rem -= b.cargo.pack;
              if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
              return { ...b, cargo: null };
            }
            return b;
          });
          curr.boxesLv += 1;
        }
      }
    }
    // 6: 会所
    else if (curr.pos === 6 && curr.guildLv < 3) {
      const reqP = [2,3][curr.guildLv - 1]; const reqK = [2,3][curr.guildLv - 1];
      const totalPorter = bxs.reduce((sum, b) => sum + (b.cargo ? b.cargo.porter : 0), 0);
      const totalPack = bxs.reduce((sum, b) => sum + (b.cargo ? b.cargo.pack : 0), 0);
      if (totalPorter >= reqP && totalPack >= reqK) {
        let remP = reqP;
        let remK = reqK;
        bxs = bxs.map(b => {
          if (b.cargo && (remP > 0 || remK > 0)) {
            remP -= b.cargo.porter;
            remK -= b.cargo.pack;
            if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
            return { ...b, cargo: null };
          }
          return b;
        });
        curr.guildLv += 1;
      }
    }

    // 荷箱にセットを積む（空き枠がある限り積む）
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

    curr.score = sc;
    curr.boxes = bxs;
    state.discard = newDiscard;

    // 次の手番へ
    state.turn = (state.turn + 1) % 4;
    if (state.turn === 0) totalRounds++;
  }

  const winner = state.players.reduce((p, c) => c.score > p.score ? c : p, state.players[0]);
  return {
    winnerId: winner.id,
    winnerStrategy: winner.strategy.name,
    rounds: totalRounds,
    scores: state.players.map(p => p.score),
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
    // 4大戦略ビルドによる直接対決！
    bots = [HandLimitBot, CargoBoxesBot, GuildBonusBot, TeaRushBot];
  } else if (matchup === 'hand_vs_rush') {
    bots = [HandLimitBot, TeaRushBot, HandLimitBot, TeaRushBot];
  } else if (matchup === 'boxes_vs_guild') {
    bots = [CargoBoxesBot, GuildBonusBot, CargoBoxesBot, GuildBonusBot];
  } else if (matchup === 'all_adaptive') {
    bots = [AdaptiveBot, AdaptiveBot, AdaptiveBot, AdaptiveBot];
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

    // 勝者の施設レベルを記録
    const winnerP = res.finalPlayers[wId];
    stats.winnerHandLimitLevels[wId] += winnerP.handLimitLv;
    stats.winnerBoxesLevels[wId] += winnerP.boxesLv;
    stats.winnerGuildLevels[wId] += winnerP.guildLv;

    res.finalPlayers.forEach((p, idx) => {
      stats.scoresByPlayer[idx].push(p.score);
      stats.handLimitLevels[idx] += p.handLimitLv;
      stats.boxesLevels[idx] += p.boxesLv;
      stats.guildLevels[idx] += p.guildLv;
      stats.winsByStrategy[p.strategy.name].games++;
    });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // 集計出力
  stats.roundsList.sort((a, b) => a - b);
  const avgRounds = (stats.totalRounds / numGames).toFixed(1);
  const medianRounds = stats.roundsList[Math.floor(numGames / 2)];
  const minRounds = stats.roundsList[0];
  const maxRounds = stats.roundsList[stats.roundsList.length - 1];

  const totalWins = stats.winsByPlayer.reduce((a, b) => a + b, 0);
  const totalWinHandLv = (stats.winnerHandLimitLevels.reduce((a, b) => a + b, 0) / totalWins).toFixed(2);
  const totalWinBoxLv = (stats.winnerBoxesLevels.reduce((a, b) => a + b, 0) / totalWins).toFixed(2);
  const totalWinGuildLv = (stats.winnerGuildLevels.reduce((a, b) => a + b, 0) / totalWins).toFixed(2);

  console.log(`⏱️ 実行時間: ${elapsed} 秒 (${(numGames / elapsed).toFixed(0)} 試合/秒)`);
  console.log(`🎯 決着ラウンド数: 平均 ${avgRounds} 巡 (最速: ${minRounds} 巡 / 最遅: ${maxRounds} 巡 / 中央値: ${medianRounds} 巡)`);
  console.log(`🏆 全勝者 平均施設強化: 🎴手札Lv.${totalWinHandLv} / 📦荷箱Lv.${totalWinBoxLv} / 🏛️会所Lv.${totalWinGuildLv}\n`);

  console.log(`📊 【プレイヤー別成績（手番順 ＆ 🏆勝者時レベル到達度）】`);
  console.log(`-----------------------------------------------------------------------------------------`);
  console.log(`座順 | 戦略名    | 勝数 / 試合数   | 勝率   | 平均得点 | 🏆勝者手札Lv | 🏆勝者荷箱Lv | 🏆勝者会所Lv`);
  console.log(`-----------------------------------------------------------------------------------------`);
  for (let i = 0; i < 4; i++) {
    const wins = stats.winsByPlayer[i];
    const winRate = ((wins / numGames) * 100).toFixed(1);
    const avgScore = (stats.scoresByPlayer[i].reduce((a, b) => a + b, 0) / numGames).toFixed(1);

    const winHandLv = wins > 0 ? (stats.winnerHandLimitLevels[i] / wins).toFixed(2) : '-   ';
    const winBoxLv = wins > 0 ? (stats.winnerBoxesLevels[i] / wins).toFixed(2) : '-   ';
    const winGuildLv = wins > 0 ? (stats.winnerGuildLevels[i] / wins).toFixed(2) : '-   ';
    const botName = bots[i].name.padEnd(10);

    console.log(` P${i + 1} | ${botName} | ${wins.toString().padStart(4)} / ${numGames} | ${winRate.padStart(5)}% | ${avgScore.padStart(6)}点 | Lv.${winHandLv}      | Lv.${winBoxLv}      | Lv.${winGuildLv}`);
  }
  console.log(`-----------------------------------------------------------------------------------------\n`);

  console.log(`🏆 【戦略別 勝率サマリー】`);
  Object.keys(stats.winsByStrategy).forEach(name => {
    const s = stats.winsByStrategy[name];
    const rate = ((s.wins / s.games) * 100).toFixed(1);
    console.log(`  * ${name.padEnd(12)}: 勝率 ${rate}% (${s.wins}勝 / ${s.games}プレイヤー枠)`);
  });
  console.log(`\n======================================================\n`);
}

// コマンドライン引数処理
const args = process.argv.slice(2);
let numGames = 1000;
let matchup = 'four_builds';
let targetScore = 20;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--games' && args[i + 1]) numGames = parseInt(args[i + 1], 10);
  if (args[i] === '--matchup' && args[i + 1]) matchup = args[i + 1];
  if (args[i] === '--score' && args[i + 1]) targetScore = parseInt(args[i + 1], 10);
}

runSimulation(numGames, matchup, targetScore);
