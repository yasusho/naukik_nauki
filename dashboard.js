/**
 * 『ナウキ運び』シミュレーター ダッシュボード Logic & Visualizer
 * （手札7枚固定 ＆ 荷箱3枠 ＆ 会所Lv3 2倍ロマンモデル）
 */

// ====================================================
// 1. ゲームルール＆カードデータ定義
// ====================================================

const CARD_TEMPLATES = {
  tea: [
    { num: 1, salt: 2 },
    { num: 2, salt: 1 },
    { num: 3, salt: 1 },
    { num: 4, salt: 1 },
    { num: 5, salt: 2 },
  ],
  rice: [
    { num: 1, salt: 2 },
    { num: 2, salt: 1 },
    { num: 3, salt: 1 },
    { num: 4, salt: 1 },
    { num: 5, salt: 2 },
  ],
  cloth: [
    { num: 1, salt: 2 },
    { num: 2, salt: 1 },
    { num: 3, salt: 1 },
    { num: 4, salt: 1 },
    { num: 5, salt: 2 },
  ]
};

const HAND_LIMIT = 7;

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

// 単純合計（ボーナスなし）
function evalSet(cards, tripletBonus = 0) {
  if (!cards || cards.length !== 3) return null;
  const t = cards[0].type;
  if (!cards.every(c => c.type === t)) return null;

  const nums = cards.map(c => c.num).sort((a, b) => a - b);
  const baseSalt = cards.reduce((s, c) => s + c.salt, 0);

  // 同数3枚（刻子）
  if (nums[0] === nums[1] && nums[1] === nums[2]) {
    return { name: `${t} ${nums[0]}×3 (刻子)`, salt: baseSalt + tripletBonus, isTriplet: true, cards, type: t };
  }
  // 連続3枚（順子）
  if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2]) {
    return { name: `${t} ${nums[0]}-${nums[2]} (順子)`, salt: baseSalt, isTriplet: false, cards, type: t };
  }
  return null;
}

function findSets(hand, tripletBonus = 0) {
  const list = [];
  if (!hand || hand.length < 3) return list;
  const n = hand.length;
  const seenPatterns = new Set();

  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const trio = [hand[i], hand[j], hand[k]];
        const r = evalSet(trio, tripletBonus);
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

function calcPortSaleDynamic(cargoSalt, guildLv, config) {
  if (guildLv === 1) return cargoSalt;
  if (guildLv === 2) return cargoSalt + (config.guildBonusLv2 || 2);
  if (config.guildLv3Mode === 'double') return cargoSalt * 2;
  if (config.guildLv3Mode === 'flat6') return cargoSalt + 6;
  return cargoSalt + 4; // default flat4
}

function evaluateHandValue(hand, weights = { salt: 10, tea: 1, rice: 1, cloth: 1 }, tripletBonus = 0) {
  if (!hand || hand.length === 0) return 0;
  const sets = findSets(hand, tripletBonus);
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
    const pref = (weights[t] || 1);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const diff = Math.abs(list[i].num - list[j].num);
        if (diff === 0) value += 25 * pref;
        else if (diff === 1) value += ((list[i].num === 1 || list[j].num === 5) ? 20 : 25) * pref;
        else if (diff === 2) value += 15 * pref;
      }
    }
  });
  return value;
}

function getCardDiscardPriorities(hand, weights, tripletBonus = 0) {
  if (!hand || hand.length === 0) return [];
  const baseValue = evaluateHandValue(hand, weights, tripletBonus);
  return hand.map((c, idx) => {
    const withoutC = hand.filter((_, i) => i !== idx);
    const valAfter = evaluateHandValue(withoutC, weights, tripletBonus);
    const loss = baseValue - valAfter;
    return { card: c, idx, loss };
  }).sort((a, b) => a.loss - b.loss);
}


// ====================================================
// 2. 戦略ボット定義
// ====================================================

function createBaseStrategy(name, desc, color, weights, behavior) {
  return {
    name,
    desc,
    color,
    weights,
    chooseMove(player, state, config) {
      const hList = player.hand;
      if (!hList || hList.length === 0) return 0;

      const tripletBonus = config ? config.tripletBonus : 0;
      const winScore = config ? config.winScore : 20;
      const priorities = getCardDiscardPriorities(hList, weights, tripletBonus);
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

        if (target === 0) {
          if (hasSalt) {
            score += 180 + totalSalt * 25;
            if (player.score + totalSalt >= winScore) score += 2000;
          } else {
            score -= 20;
          }
        } else if (target === 4) {
          if (hasCargo) {
            const expectedSalt = player.boxes.reduce((s, b) => s + (b.cargo ? calcPortSaleDynamic(b.cargo.salt, player.guildLv, config) : 0), 0);
            score += 160 + expectedSalt * 15 + cargoCount * 20;
          } else {
            score -= 25;
          }
        }

        if (behavior.getTargetBonus) {
          score += behavior.getTargetBonus(target, player, state, config);
        }

        const roadStack = state.road[target] || [];
        if (roadStack.length > 0) {
          const handWithRoad = [...hList.filter((_, i) => i !== idx), ...roadStack];
          const gain = evaluateHandValue(handWithRoad, weights, tripletBonus) - evaluateHandValue(hList, weights, tripletBonus);
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

    shouldReplenishRoad(player, state, config) {
      const tripletBonus = config ? config.tripletBonus : 0;
      const roadStack = state.road[player.pos] || [];
      if (roadStack.length === 0) return false;
      const currentVal = evaluateHandValue(player.hand, weights, tripletBonus);
      const withRoadVal = evaluateHandValue([...player.hand, ...roadStack], weights, tripletBonus);
      const setsBefore = findSets(player.hand, tripletBonus).length;
      const setsAfter = findSets([...player.hand, ...roadStack], tripletBonus).length;

      if (setsAfter > setsBefore) return true;
      if (roadStack.length >= 2 && withRoadVal > currentVal) return true;
      if (roadStack.length >= 3) return true;
      return false;
    },

    chooseExcessReturns(player, excessCount, config) {
      const tripletBonus = config ? config.tripletBonus : 0;
      const priorities = getCardDiscardPriorities(player.hand, weights, tripletBonus);
      return priorities.slice(0, excessCount).map(p => p.card.id);
    }
  };
}

const AI_STRATEGIES = {
  cargo_boxes: createBaseStrategy(
    '荷箱特化型',
    '港で換金した塩を箱屋に支払い、荷箱枠を拡張。一度に大量のセットを運ぶ。',
    '#a78bfa',
    { salt: 10, tea: 1.0, rice: 1.0, cloth: 1.5 },
    {
      getTargetBonus(target, player, state, config) {
        if (target === 2 && player.boxesLv < 3) {
          const totalSalt = player.boxes.reduce((s, b) => s + (b.salt || 0), 0);
          const boxCosts = config ? config.boxCosts : [3, 5];
          const cost = boxCosts[player.boxesLv - 1];
          if (totalSalt >= cost) return 190;
          return 60;
        }
        return 0;
      }
    }
  ),

  guild_bonus: createBaseStrategy(
    '会所特化型',
    '港で換金した塩を会所に支払い、港売却レートを最大化（Lv3で2倍！）する。',
    '#34d399',
    { salt: 12, tea: 1.0, rice: 1.2, cloth: 1.2 },
    {
      getTargetBonus(target, player, state, config) {
        if (target === 6 && player.guildLv < 3) {
          const guildCosts = config ? config.guildCosts : [4, 7];
          const cost = guildCosts[player.guildLv - 1];
          const totalSalt = player.boxes.reduce((s, b) => s + (b.salt || 0), 0);
          if (totalSalt >= cost) return 195;
          return 55;
        }
        return 0;
      }
    }
  ),

  tea_rush: createBaseStrategy(
    '直行速攻型',
    '施設強化を抑え、港での換金→地元での得点化を高回転周回。',
    '#fbbf24',
    { salt: 20, tea: 1.5, rice: 1.0, cloth: 1.0 },
    {
      getTargetBonus(target, player, state) {
        const hasCargo = player.boxes.some(b => b.cargo);
        const hasSalt = player.boxes.some(b => b.salt > 0);
        if (target === 4 && hasCargo) return 140;
        if (target === 0 && hasSalt) return 150;
        return 0;
      }
    }
  ),

  adaptive: createBaseStrategy(
    '状況適応型',
    '手札の配牌や盤面状況に合わせて最適な荷箱拡張・会所強化・得点化を選択する総合AI',
    '#f43f5e',
    { salt: 12, tea: 1.2, rice: 1.2, cloth: 1.2 },
    {
      getTargetBonus(target, player, state, config) {
        const totalSalt = player.boxes.reduce((s, b) => s + (b.salt || 0), 0);
        const boxCosts = config ? config.boxCosts : [3, 5];
        const guildCosts = config ? config.guildCosts : [4, 7];
        if (target === 2 && player.boxesLv < 3 && totalSalt >= boxCosts[player.boxesLv - 1]) return 140;
        if (target === 6 && player.guildLv < 3 && totalSalt >= guildCosts[player.guildLv - 1]) return 145;
        return 0;
      }
    }
  ),

  random: {
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
    hand: d.splice(0, HAND_LIMIT),
    boxes: [
      { unlocked: true, cargo: null, salt: 0 },
      { unlocked: false, cargo: null, salt: 0 },
      { unlocked: false, cargo: null, salt: 0 }
    ],
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

    // 1. 移動 (Step 1)
    if (curr.hand.length === 0) {
      const res = drawSafe(1, state.deck, state.discard);
      state.deck = res.newDeck;
      state.discard = res.newDiscard;
      const topCard = res.drawn[0] || { num: 1, type: 'tea', salt: 2 };
      const nextPos = (curr.pos + topCard.num) % 8;
      state.road[curr.pos].push(topCard);
      curr.pos = nextPos;
    } else {
      const moveIdx = bot.chooseMove(curr, state, config);
      const chosenCard = curr.hand[moveIdx] || curr.hand[0];
      const nextPos = (curr.pos + chosenCard.num) % 8;
      state.road[curr.pos].push(chosenCard);
      curr.hand = curr.hand.filter((_, i) => i !== moveIdx);
      curr.pos = nextPos;
    }

    // 2. 補充 (Step 2)
    const wantRoad = bot.shouldReplenishRoad(curr, state, config);
    const roadCards = state.road[curr.pos] || [];

    if (wantRoad && roadCards.length > 0) {
      const combined = [...curr.hand, ...roadCards];
      state.road[curr.pos] = [];

      if (combined.length > HAND_LIMIT) {
        const excessCount = combined.length - HAND_LIMIT;
        curr.hand = combined;
        const returnIds = bot.chooseExcessReturns(curr, excessCount, config);
        const toReturn = curr.hand.filter(c => returnIds.includes(c.id));
        curr.hand = curr.hand.filter(c => !returnIds.includes(c.id));
        state.road[curr.pos] = toReturn;
      } else {
        curr.hand = combined;
      }
    } else {
      const needed = Math.max(0, HAND_LIMIT - curr.hand.length);
      const res = drawSafe(needed, state.deck, state.discard);
      curr.hand = [...curr.hand, ...res.drawn];
      state.deck = res.newDeck;
      state.discard = res.newDiscard;
    }

    // 3. 行動（施設 & 荷積み）
    let bxs = curr.boxes;
    let sc = curr.score;
    let newDiscard = state.discard;

    // 地元(0): 換金された塩を得点化
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
    // 港(4): セット売却・換金
    else if (curr.pos === 4) {
      bxs = bxs.map(b => {
        if (b.unlocked && b.cargo) {
          const gain = calcPortSaleDynamic(b.cargo.salt, curr.guildLv, config);
          if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
          return { ...b, cargo: null, salt: (b.salt || 0) + gain };
        }
        return b;
      });
    }
    // 箱屋(2): 換金済み塩 3/5 を支払って荷箱拡張
    else if (curr.pos === 2 && curr.boxesLv < 3) {
      const cost = config.boxCosts[curr.boxesLv - 1];
      let totalSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0);
      if (totalSalt >= cost) {
        let rem = cost;
        bxs = bxs.map((b, idx) => {
          let updated = { ...b };
          if (idx === curr.boxesLv) updated.unlocked = true;
          if (updated.salt > 0 && rem > 0) {
            const spend = Math.min(updated.salt, rem);
            rem -= spend;
            updated.salt -= spend;
          }
          return updated;
        });
        curr.boxesLv += 1;
      }
    }
    // 会所(6): 換金済み塩 4/7 を支払って強化
    else if (curr.pos === 6 && curr.guildLv < 3) {
      const cost = config.guildCosts[curr.guildLv - 1];
      const totalSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0);
      if (totalSalt >= cost) {
        let rem = cost;
        bxs = bxs.map(b => {
          if (b.salt > 0 && rem > 0) {
            const spend = Math.min(b.salt, rem);
            rem -= spend;
            return { ...b, salt: b.salt - spend };
          }
          return b;
        });
        curr.guildLv += 1;
      }
    }

    // 荷箱にセットを積む
    while (true) {
      const sets = findSets(curr.hand, config.tripletBonus);
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

const PLAYER_COLORS = ['#a78bfa', '#34d399', '#fbbf24', '#f43f5e'];

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
      labels: Array.from({ length: 40 }, (_, i) => `${i + 5}巡`),
      datasets: [{
        label: '試合数',
        data: Array(40).fill(0),
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
        { label: '荷箱枠Lv (最大3)', data: [1.7, 1.7, 1.7, 1.7], backgroundColor: '#a78bfa', borderRadius: 4 },
        { label: '会所Lv (最大3)', data: [1.6, 1.6, 1.6, 1.6], backgroundColor: '#34d399', borderRadius: 4 }
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
      return wins > 0 ? (latestStats.winnerBoxesLevels[i] / wins).toFixed(2) : 1.00;
    });
    charts.facility.data.datasets[1].data = latestBots.map((_, i) => {
      const wins = latestStats.winsByPlayer[i];
      return wins > 0 ? (latestStats.winnerGuildLevels[i] / wins).toFixed(2) : 1.00;
    });
  } else {
    charts.facility.data.datasets[0].data = latestStats.boxesLevels.map(v => (v / latestTotalGames).toFixed(2));
    charts.facility.data.datasets[1].data = latestStats.guildLevels.map(v => (v / latestTotalGames).toFixed(2));
  }
  charts.facility.update();
}

// プリセット適用
function applyPreset(presetKey) {
  const presets = {
    four_builds: ['cargo_boxes', 'guild_bonus', 'tea_rush', 'adaptive'],
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
  const boxCosts = [
    parseInt(document.getElementById('boxCostLv2').value, 10),
    parseInt(document.getElementById('boxCostLv3').value, 10)
  ];
  const guildCosts = [
    parseInt(document.getElementById('guildCostLv2').value, 10),
    parseInt(document.getElementById('guildCostLv3').value, 10)
  ];
  const guildBonusLv2 = parseInt(document.getElementById('guildBonusLv2').value, 10);
  const guildLv3Mode = document.getElementById('guildLv3Mode').value;
  const tripletBonus = parseInt(document.getElementById('tripletBonus').value, 10);

  const config = {
    winScore,
    handLimit: HAND_LIMIT,
    boxCosts,
    guildCosts,
    guildBonusLv2,
    guildLv3Mode,
    tripletBonus
  };

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
    boxesLevels: [0, 0, 0, 0],
    guildLevels: [0, 0, 0, 0],
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

      const winnerP = res.finalPlayers[wId];
      stats.winnerBoxesLevels[wId] += winnerP.boxesLv;
      stats.winnerGuildLevels[wId] += winnerP.guildLv;

      res.finalPlayers.forEach((p, idx) => {
        stats.scoresByPlayer[idx].push(p.score);
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

  const totalWins = stats.winsByPlayer.reduce((a, b) => a + b, 0);
  const totalWinBoxLv = (stats.winnerBoxesLevels.reduce((a, b) => a + b, 0) / totalWins).toFixed(2);
  const totalWinGuildLv = (stats.winnerGuildLevels.reduce((a, b) => a + b, 0) / totalWins).toFixed(2);

  document.getElementById('kpiAvgRounds').textContent = `${avgRounds} 巡`;
  document.getElementById('kpiMedianRounds').textContent = `中央値: ${medianRounds} 巡 (最速 ${minRounds} / 最遅 ${maxRounds})`;
  document.getElementById('kpiSimSpeed').textContent = `${gamesPerSec} 試合/秒`;
  document.getElementById('kpiTotalTime').textContent = `合計時間: ${elapsedSec} 秒 (${totalGames.toLocaleString()} 試合)`;
  if (document.getElementById('kpiTotalWinHandLv')) document.getElementById('kpiTotalWinHandLv').textContent = `7枚固定`;
  document.getElementById('kpiTotalWinBoxLv').textContent = `Lv.${totalWinBoxLv}`;
  document.getElementById('kpiTotalWinGuildLv').textContent = `Lv.${totalWinGuildLv}`;

  document.getElementById('progressContainer').style.display = 'none';

  charts.winRate.data.labels = bots.map((b, i) => `P${i + 1} (${b.name})`);
  charts.winRate.data.datasets[0].data = stats.winsByPlayer.map(w => ((w / totalGames) * 100).toFixed(1));
  charts.winRate.update();

  charts.turnBias.data.datasets[0].data = stats.winsByPlayer.map(w => ((w / totalGames) * 100).toFixed(1));
  charts.turnBias.update();

  const minR = Math.max(1, minRounds - 2);
  const maxR = Math.min(60, maxRounds + 2);
  const distLabels = [];
  const distData = [];
  for (let r = minR; r <= maxR; r++) {
    distLabels.push(`${r}巡`);
    distData.push(stats.roundFreq[r] || 0);
  }
  charts.roundDist.data.labels = distLabels;
  charts.roundDist.data.datasets[0].data = distData;
  charts.roundDist.update();

  updateFacilityChartData();

  const tbody = document.getElementById('resultsTableBody');
  tbody.innerHTML = '';

  const tableData = bots.map((bot, i) => {
    const wins = stats.winsByPlayer[i];
    const rate = ((wins / totalGames) * 100).toFixed(1);
    const scores = stats.scoresByPlayer[i];
    const avgScore = (scores.reduce((a, b) => a + b, 0) / totalGames).toFixed(1);
    const maxScore = Math.max(...scores);
    const winBoxLv = wins > 0 ? (stats.winnerBoxesLevels[i] / wins).toFixed(2) : '-';
    const winGuildLv = wins > 0 ? (stats.winnerGuildLevels[i] / wins).toFixed(2) : '-';
    const allBoxLv = (stats.boxesLevels[i] / totalGames).toFixed(2);
    const allGuildLv = (stats.guildLevels[i] / totalGames).toFixed(2);

    return { id: i + 1, name: bot.name, wins, rate, avgScore, maxScore, winBoxLv, winGuildLv, allBoxLv, allGuildLv };
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
      <td style="color: #94a3b8; font-weight: bold; background: rgba(148, 163, 184, 0.08);">7枚固定</td>
      <td style="color: #a78bfa; font-weight: bold; background: rgba(167, 139, 250, 0.08);">Lv.${row.winBoxLv}</td>
      <td style="color: #34d399; font-weight: bold; background: rgba(52, 211, 153, 0.08);">Lv.${row.winGuildLv}</td>
      <td style="color: #94a3b8; font-size: 11px;">📦${row.allBoxLv} 🏛️${row.allGuildLv}</td>
    `;
    tbody.appendChild(tr);
  });

  const btnRun = document.getElementById('btnRun');
  btnRun.disabled = false;
  isSimulating = false;
}

window.addEventListener('DOMContentLoaded', () => {
  initCharts();

  const toggleBtns = document.querySelectorAll('.facility-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      facilityChartMode = btn.dataset.mode;
      updateFacilityChartData();
    });
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
    });
  });

  document.getElementById('btnRun').addEventListener('click', runSimulation);

  setTimeout(runSimulation, 200);
});
