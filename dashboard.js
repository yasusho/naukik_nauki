/**
 * 『ナウキ運び』シミュレーター ダッシュボード Logic & Visualizer
 * （同等実力ベースの4大戦略ビルド版）
 */

// ====================================================
// 1. ゲームルール＆カードデータ定義
// ====================================================

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
    return { name: `${t} ${nums[0]}×3`, salt, porter, pack, cards, type: t };
  }
  if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2]) {
    return { name: `${t} ${nums[0]}-${nums[2]}`, salt, porter, pack, cards, type: t };
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


// ====================================================
// 2. 4大戦略ビルド（同等実力ベース）
// ====================================================

/**
 * 共通の高度な思考ベース（牌効率、ルート計画、無駄のない移動）
 */
function createBaseStrategy(name, desc, color, weights, customLogic) {
  return {
    name,
    desc,
    color,
    weights,

    chooseMove(player, state, winScore) {
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
        const discardEfficiency = 100 - (pInfo ? pInfo.loss : 50);
        score += discardEfficiency * 0.9;

        // 2. 共通: 地元(0)への塩納品
        if (target === 0) {
          if (hasSalt) {
            score += 180 + totalSalt * 25;
            if (player.score + totalSalt >= winScore) score += 2000; // 勝ち確！
          } else {
            score -= 15;
          }
        }

        // 3. 共通: 港(4)での売却
        else if (target === 4) {
          if (hasCargo) {
            const bonus = player.guildLv === 1 ? 0 : player.guildLv === 2 ? 3 : 6;
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

const AI_STRATEGIES = {
  // 1. 手札拡張特化型 (HandLimit Build)
  hand_limit: createBaseStrategy(
    '手札拡張型',
    '最速で米(輪)を集め手札10枚へ拡張。後半に圧倒的面子力で勝負',
    '#38bdf8',
    { salt: 8, porter: 15, pack: 4, tea: 0.8, rice: 2.0, cloth: 0.8 },
    {
      getTargetBonus(target, player, state) {
        if (target === 2 && player.handLimitLv < 3) {
          const availablePorter = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.porter : 0), 0);
          const cost = player.handLimitLv === 1 ? 2 : 4;
          if (availablePorter >= cost) return 180; // 拡張可能なら最優先！
          return 60;
        }
        return 0;
      }
    }
  ),

  // 2. 荷箱枠特化型 (CargoBoxes Build)
  cargo_boxes: createBaseStrategy(
    '荷箱特化型',
    '最速で布(箱)を集め荷箱3枠へ拡張。一撃で10〜15点大量納品',
    '#a78bfa',
    { salt: 8, porter: 4, pack: 15, tea: 0.8, rice: 0.8, cloth: 2.0 },
    {
      getTargetBonus(target, player, state) {
        if (target === 2 && player.boxesLv < 3) {
          const availablePack = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.pack : 0), 0);
          const cost = player.boxesLv === 1 ? 2 : 4;
          if (availablePack >= cost) return 190; // 枠拡張可能なら最優先！
          return 70;
        }
        return 0;
      }
    }
  ),

  // 3. 会所ブースト型 (GuildBonus Build)
  guild_bonus: createBaseStrategy(
    '会所特化型',
    '最速で会所Lv3(+4)へ強化。港売却ボーナスで巨額の塩を生み出す',
    '#34d399',
    { salt: 10, porter: 10, pack: 10, tea: 1.0, rice: 1.5, cloth: 1.5 },
    {
      getTargetBonus(target, player, state) {
        if (target === 6 && player.guildLv < 3) {
          const reqP = player.guildLv === 1 ? 2 : 3;
          const reqK = player.guildLv === 1 ? 2 : 3;
          const availablePorter = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.porter : 0), 0);
          const availablePack = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.pack : 0), 0);
          if (availablePorter >= reqP && availablePack >= reqK) return 185; // 会所強化可能なら最優先！
          return 65;
        }
        return 0;
      }
    }
  ),

  // 4. 茶塩速攻型 (Tea Rush Build)
  tea_rush: createBaseStrategy(
    '茶塩速攻型',
    '施設強化を抑え、高塩の茶セットで港→地元の得点サイクルを高回転周回',
    '#fbbf24',
    { salt: 20, porter: 2, pack: 2, tea: 2.5, rice: 0.6, cloth: 0.6 },
    {
      getTargetBonus(target, player, state) {
        // 強化施設には寄らず、港と地元を最速でループ
        const hasCargo = player.boxes.some(b => b.cargo);
        const hasSalt = player.boxes.some(b => b.salt > 0);
        if (target === 4 && hasCargo) return 120;
        if (target === 0 && hasSalt) return 130;
        return 0;
      }
    }
  ),

  // 5. 状況適応型 (Adaptive Master)
  adaptive: createBaseStrategy(
    '状況適応型',
    '手札の配牌や盤面状況に合わせて最適な強化・得点化を選択する総合AI',
    '#f43f5e',
    { salt: 12, porter: 8, pack: 8, tea: 1.2, rice: 1.2, cloth: 1.2 },
    {
      getTargetBonus(target, player, state) {
        const availablePorter = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.porter : 0), 0);
        const availablePack = player.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.pack : 0), 0);

        if (target === 2) {
          if (player.handLimitLv === 1 && availablePorter >= 3) return 110;
          if (player.boxesLv === 1 && availablePack >= 3) return 120;
        }
        if (target === 6 && player.guildLv === 1 && availablePorter >= 2 && availablePack >= 2) {
          return 115;
        }
        return 0;
      }
    }
  ),

  // 6. ランダム型 (Random Baseline)
  random: {
    name: 'ランダム型',
    desc: '合法手から完全ランダムに選択するベースライン検証AI',
    color: '#94a3b8',
    weights: { salt: 1, porter: 1, pack: 1, tea: 1, rice: 1, cloth: 1 },
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
  }
};


// ====================================================
// 3. 1ゲームシミュレーション実行エンジン
// ====================================================

function runSingleGame(botStrategies, config) {
  const d = createDeck();
  const players = botStrategies.map((bot, i) => ({
    id: i,
    name: `P${i + 1}`,
    strategy: bot,
    pos: 0,
    hand: d.splice(0, config.initialHand),
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
    gameOver: false
  };

  let totalRounds = 0;
  const maxRounds = 120;

  while (!state.gameOver && totalRounds < maxRounds) {
    const curr = state.players[state.turn];
    const bot = curr.strategy;
    const botHandLimit = config.handLimits[curr.handLimitLv - 1];

    // 1. 移動 (Step 1)
    if (curr.hand.length === 0) {
      const res = drawSafe(1, state.deck, state.discard);
      state.deck = res.newDeck;
      state.discard = res.newDiscard;
      const topCard = res.drawn[0] || { num: 1, type: 'tea', salt: 1, porter: 0, pack: 0 };
      const nextPos = (curr.pos + topCard.num) % 8;
      state.road[curr.pos].push(topCard);
      curr.pos = nextPos;
    } else {
      const moveIdx = bot.chooseMove(curr, state, config.winScore);
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

    // 3. 行動（施設 & 荷積み）
    let bxs = curr.boxes;
    let sc = curr.score;
    let newDiscard = state.discard;

    // 地元(0)
    if (curr.pos === 0) {
      bxs = bxs.map(b => {
        if (b.salt > 0) sc += b.salt;
        return { ...b, cargo: null, salt: 0 };
      });
      if (sc >= config.winScore) {
        state.gameOver = true;
        curr.score = sc;
        curr.boxes = bxs;
        break;
      }
    }
    // 港(4)
    else if (curr.pos === 4) {
      const bonus = curr.guildLv === 1 ? 0 : curr.guildLv === 2 ? 3 : 6;
      bxs = bxs.map(b => {
        if (b.unlocked && b.cargo) {
          const gain = b.cargo.salt + bonus;
          if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
          return { ...b, cargo: null, salt: (b.salt || 0) + gain };
        }
        return b;
      });
    }
    // 箱屋(2)
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
    // 会所(6)
    else if (curr.pos === 6 && curr.guildLv < 3) {
      const reqP = curr.guildLv === 1 ? 2 : 3;
      const reqK = curr.guildLv === 1 ? 2 : 3;
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

    // 荷箱にセットを積む
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

    state.turn = (state.turn + 1) % 4;
    if (state.turn === 0) totalRounds++;
  }

  const winner = state.players.reduce((p, c) => c.score > p.score ? c : p, state.players[0]);
  return {
    winnerId: winner.id,
    rounds: totalRounds,
    finalPlayers: state.players
  };
}


// ====================================================
// 4. UI ＆ Chart.js 可視化コントローラー
// ====================================================

let charts = {};
let isSimulating = false;

const PLAYER_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24'];

function initCharts() {
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // 1. 勝率チャート (Doughnut)
  const ctxWin = document.getElementById('chartWinRate').getContext('2d');
  charts.winRate = new Chart(ctxWin, {
    type: 'doughnut',
    data: {
      labels: ['P1', 'P2', 'P3', 'P4'],
      datasets: [{
        data: [25, 25, 25, 25],
        backgroundColor: PLAYER_COLORS,
        borderWidth: 2,
        borderColor: '#1e293b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } }
      }
    }
  });

  // 2. 座順バイアス (Bar)
  const ctxBias = document.getElementById('chartTurnBias').getContext('2d');
  charts.turnBias = new Chart(ctxBias, {
    type: 'bar',
    data: {
      labels: ['1番手(先手)', '2番手', '3番手', '4番手(後手)'],
      datasets: [{
        label: '勝率 (%)',
        data: [25, 25, 25, 25],
        backgroundColor: PLAYER_COLORS,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } },
        x: { grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });

  // 3. 決着ラウンド数分布 (Line / Area)
  const ctxDist = document.getElementById('chartRoundDist').getContext('2d');
  charts.roundDist = new Chart(ctxDist, {
    type: 'line',
    data: {
      labels: Array.from({ length: 50 }, (_, i) => `${i + 10}巡`),
      datasets: [{
        label: '試合数',
        data: Array(50).fill(0),
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true },
        x: { grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });

  // 4. 施設強化レベル (Bar)
  const ctxFacility = document.getElementById('chartFacility').getContext('2d');
  charts.facility = new Chart(ctxFacility, {
    type: 'bar',
    data: {
      labels: ['P1', 'P2', 'P3', 'P4'],
      datasets: [
        { label: '手札上限Lv', data: [1.8, 1.8, 1.8, 1.8], backgroundColor: '#fbbf24', borderRadius: 4 },
        { label: '荷箱枠Lv', data: [1.7, 1.7, 1.7, 1.7], backgroundColor: '#a78bfa', borderRadius: 4 },
        { label: '会所Lv', data: [1.6, 1.6, 1.6, 1.6], backgroundColor: '#34d399', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, min: 1, max: 3, ticks: { stepSize: 0.5, callback: v => `Lv.${v}` } },
        x: { grid: { display: false } }
      },
      plugins: { legend: { position: 'top', labels: { boxWidth: 10 } } }
    }
  });
}

// 施設チャートの表示モード (winner / all)
let facilityChartMode = 'winner';
let latestStats = null;
let latestBots = null;
let latestTotalGames = 1000;

function updateFacilityChartData() {
  if (!latestStats || !charts.facility) return;
  const isWinner = facilityChartMode === 'winner';
  
  charts.facility.data.labels = latestBots.map((b, i) => `P${i + 1} (${b.name})`);

  if (isWinner) {
    charts.facility.data.datasets[0].data = latestBots.map((_, i) => {
      const wins = latestStats.winsByPlayer[i];
      return wins > 0 ? (latestStats.winnerHandLimitLevels[i] / wins).toFixed(2) : 1.00;
    });
    charts.facility.data.datasets[1].data = latestBots.map((_, i) => {
      const wins = latestStats.winsByPlayer[i];
      return wins > 0 ? (latestStats.winnerBoxesLevels[i] / wins).toFixed(2) : 1.00;
    });
    charts.facility.data.datasets[2].data = latestBots.map((_, i) => {
      const wins = latestStats.winsByPlayer[i];
      return wins > 0 ? (latestStats.winnerGuildLevels[i] / wins).toFixed(2) : 1.00;
    });
  } else {
    charts.facility.data.datasets[0].data = latestStats.handLimitLevels.map(v => (v / latestTotalGames).toFixed(2));
    charts.facility.data.datasets[1].data = latestStats.boxesLevels.map(v => (v / latestTotalGames).toFixed(2));
    charts.facility.data.datasets[2].data = latestStats.guildLevels.map(v => (v / latestTotalGames).toFixed(2));
  }
  charts.facility.update();
}

// プリセット適用
function applyPreset(presetKey) {
  const presets = {
    four_builds: ['hand_limit', 'cargo_boxes', 'guild_bonus', 'tea_rush'],
    hand_vs_rush: ['hand_limit', 'tea_rush', 'hand_limit', 'tea_rush'],
    boxes_vs_guild: ['cargo_boxes', 'guild_bonus', 'cargo_boxes', 'guild_bonus'],
    smart_vs_random: ['adaptive', 'random', 'random', 'random'],
    all_adaptive: ['adaptive', 'adaptive', 'adaptive', 'adaptive']
  };

  const choice = presets[presetKey];
  if (choice) {
    document.getElementById('p1Strategy').value = choice[0];
    document.getElementById('p2Strategy').value = choice[1];
    document.getElementById('p3Strategy').value = choice[2];
    document.getElementById('p4Strategy').value = choice[3];
  }

  document.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === presetKey);
  });
}

// シミュレーション非同期バッチ実行
async function runSimulation() {
  if (isSimulating) return;
  isSimulating = true;

  const btnRun = document.getElementById('btnRun');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');

  btnRun.disabled = true;
  progressContainer.style.display = 'flex';
  progressBar.style.width = '0%';
  progressText.textContent = '0%';

  const totalGames = parseInt(document.getElementById('numGames').value, 10);
  const winScore = parseInt(document.getElementById('winScore').value, 10);
  const initialHand = parseInt(document.getElementById('initialHand').value, 10);
  const handLimits = [
    parseInt(document.getElementById('handLimitLv1').value, 10),
    parseInt(document.getElementById('handLimitLv2').value, 10),
    parseInt(document.getElementById('handLimitLv3').value, 10)
  ];

  const config = { winScore, initialHand, handLimits };
  const botKeys = [
    document.getElementById('p1Strategy').value,
    document.getElementById('p2Strategy').value,
    document.getElementById('p3Strategy').value,
    document.getElementById('p4Strategy').value
  ];
  const bots = botKeys.map(k => AI_STRATEGIES[k]);

  const stats = {
    winsByPlayer: [0, 0, 0, 0],
    totalRounds: 0,
    roundsList: [],
    scoresByPlayer: [[], [], [], []],
    handLimitLevels: [0, 0, 0, 0],
    boxesLevels: [0, 0, 0, 0],
    guildLevels: [0, 0, 0, 0],
    // 🏆 優勝プレイヤーに特化したレベル集計
    winnerHandLimitLevels: [0, 0, 0, 0],
    winnerBoxesLevels: [0, 0, 0, 0],
    winnerGuildLevels: [0, 0, 0, 0],
    roundFreq: {}
  };

  const startTime = performance.now();
  const batchSize = Math.max(25, Math.floor(totalGames / 40));
  let completed = 0;

  async function processBatch() {
    const nextTarget = Math.min(totalGames, completed + batchSize);
    for (let i = completed; i < nextTarget; i++) {
      const res = runSingleGame(bots, config);
      const wId = res.winnerId;
      stats.winsByPlayer[wId]++;
      stats.totalRounds += res.rounds;
      stats.roundsList.push(res.rounds);
      stats.roundFreq[res.rounds] = (stats.roundFreq[res.rounds] || 0) + 1;

      // 優勝プレイヤーの施設レベルを記録
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
    completed = nextTarget;
    const pct = Math.floor((completed / totalGames) * 100);
    progressBar.style.width = `${pct}%`;
    progressText.textContent = `${completed} / ${totalGames} 試合 (${pct}%)`;

    if (completed < totalGames) {
      setTimeout(processBatch, 0);
    } else {
      finishSimulation(stats, totalGames, startTime, bots);
    }
  }

  processBatch();
}

// 完了処理と結果描画
function finishSimulation(stats, totalGames, startTime, bots) {
  latestStats = stats;
  latestBots = bots;
  latestTotalGames = totalGames;

  const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);
  const gamesPerSec = (totalGames / elapsedSec).toFixed(0);

  stats.roundsList.sort((a, b) => a - b);
  const avgRounds = (stats.totalRounds / totalGames).toFixed(1);
  const medianRounds = stats.roundsList[Math.floor(totalGames / 2)];
  const minRounds = stats.roundsList[0];
  const maxRounds = stats.roundsList[stats.roundsList.length - 1];

  // 全勝者平均レベル
  const totalWins = stats.winsByPlayer.reduce((a, b) => a + b, 0);
  const totalWinHandLv = (stats.winnerHandLimitLevels.reduce((a, b) => a + b, 0) / totalWins).toFixed(2);
  const totalWinBoxLv = (stats.winnerBoxesLevels.reduce((a, b) => a + b, 0) / totalWins).toFixed(2);
  const totalWinGuildLv = (stats.winnerGuildLevels.reduce((a, b) => a + b, 0) / totalWins).toFixed(2);

  // KPI カード更新
  document.getElementById('kpiAvgRounds').textContent = `${avgRounds} 巡`;
  document.getElementById('kpiMedianRounds').textContent = `中央値: ${medianRounds} 巡 (最速 ${minRounds} / 最遅 ${maxRounds})`;
  
  const winRates = stats.winsByPlayer.map(w => ((w / totalGames) * 100).toFixed(1));
  const maxWinRate = Math.max(...winRates);
  const topPlayerIdx = winRates.indexOf(maxWinRate.toString());
  document.getElementById('kpiTopPlayer').textContent = `P${topPlayerIdx + 1} (${bots[topPlayerIdx].name})`;
  document.getElementById('kpiTopWinRate').textContent = `勝率 ${maxWinRate}% (${stats.winsByPlayer[topPlayerIdx]}勝)`;

  document.getElementById('kpiSpeed').textContent = `${gamesPerSec} 試合/秒`;
  document.getElementById('kpiTime').textContent = `実行時間: ${elapsedSec} 秒 (${totalGames} 試合)`;

  document.getElementById('kpiWinnerLvs').textContent = `🎴${totalWinHandLv} / 📦${totalWinBoxLv} / 🏛️${totalWinGuildLv}`;

  // 1. 勝率チャート更新
  charts.winRate.data.labels = bots.map((b, i) => `P${i + 1}: ${b.name}`);
  charts.winRate.data.datasets[0].data = stats.winsByPlayer;
  charts.winRate.update();

  // 2. 座順バイアス更新
  charts.turnBias.data.datasets[0].data = winRates;
  charts.turnBias.update();

  // 3. ラウンド分布更新
  const minR = Math.max(1, minRounds - 2);
  const maxR = Math.min(80, maxRounds + 2);
  const distLabels = [];
  const distData = [];
  for (let r = minR; r <= maxR; r++) {
    distLabels.push(`${r}巡`);
    distData.push(stats.roundFreq[r] || 0);
  }
  charts.roundDist.data.labels = distLabels;
  charts.roundDist.data.datasets[0].data = distData;
  charts.roundDist.update();

  // 4. 施設レベル更新
  updateFacilityChartData();

  // テーブル更新
  const tbody = document.getElementById('statsTableBody');
  tbody.innerHTML = '';

  const avgScores = stats.scoresByPlayer.map(arr => (arr.reduce((a, b) => a + b, 0) / totalGames).toFixed(1));

  const tableData = bots.map((bot, i) => {
    const wins = stats.winsByPlayer[i];
    const rate = parseFloat(winRates[i]);
    const avgScore = avgScores[i];
    const maxScore = Math.max(...stats.scoresByPlayer[i]);

    // 勝利時の平均Lv
    const winHandLv = wins > 0 ? (stats.winnerHandLimitLevels[i] / wins).toFixed(2) : '-';
    const winBoxLv = wins > 0 ? (stats.winnerBoxesLevels[i] / wins).toFixed(2) : '-';
    const winGuildLv = wins > 0 ? (stats.winnerGuildLevels[i] / wins).toFixed(2) : '-';

    // 全体平均Lv
    const allHandLv = (stats.handLimitLevels[i] / totalGames).toFixed(2);
    const allBoxLv = (stats.boxesLevels[i] / totalGames).toFixed(2);
    const allGuildLv = (stats.guildLevels[i] / totalGames).toFixed(2);

    return { id: i + 1, name: bot.name, wins, rate, avgScore, maxScore, winHandLv, winBoxLv, winGuildLv, allHandLv, allBoxLv, allGuildLv };
  }).sort((a, b) => b.rate - a.rate);

  tableData.forEach((row, rank) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="rank-badge rank-${rank + 1}">${rank + 1}</span></td>
      <td><strong>P${row.id}</strong></td>
      <td><span style="color: ${PLAYER_COLORS[row.id - 1]}; font-weight: bold;">${row.name}</span></td>
      <td><strong>${row.wins}</strong> / ${totalGames}</td>
      <td>
        <div class="winrate-bar-container">
          <div class="winrate-bar">
            <div class="winrate-bar-fill" style="width: ${row.rate}%; background: ${PLAYER_COLORS[row.id - 1]};"></div>
          </div>
          <span style="font-weight: bold;">${row.rate}%</span>
        </div>
      </td>
      <td><strong>${row.avgScore}</strong> 点</td>
      <td style="color: #fbbf24; font-weight: bold; background: rgba(251, 191, 24, 0.08);">Lv.${row.winHandLv}</td>
      <td style="color: #a78bfa; font-weight: bold; background: rgba(167, 139, 250, 0.08);">Lv.${row.winBoxLv}</td>
      <td style="color: #34d399; font-weight: bold; background: rgba(52, 211, 153, 0.08);">Lv.${row.winGuildLv}</td>
      <td style="color: #94a3b8; font-size: 11px;">🎴${row.allHandLv} 📦${row.allBoxLv} 🏛️${row.allGuildLv}</td>
    `;
    tbody.appendChild(tr);
  });

  const btnRun = document.getElementById('btnRun');
  btnRun.disabled = false;
  isSimulating = false;
}

// 初期化
window.addEventListener('DOMContentLoaded', () => {
  initCharts();

  // 施設チャート切り替えボタンイベント
  const toggleBtns = document.querySelectorAll('.facility-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      facilityChartMode = btn.dataset.mode;
      updateFacilityChartData();
    });
  });

  // プリセットボタンイベント
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
    });
  });

  // 実行ボタンイベント
  document.getElementById('btnRun').addEventListener('click', runSimulation);

  // 初回自動実行 (1,000試合)
  setTimeout(runSimulation, 200);
});
