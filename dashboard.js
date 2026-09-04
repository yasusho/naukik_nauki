/**
 * 『ナウキ運び』シミュレーター ダッシュボード Logic & Visualizer
 * （裏表2段階タイル箱モデル ＆ 手札直売＋箱ストック売却）
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

const HAND_LIMIT = 5;

// マップ定義: 0: 地元, 1/7: 箱屋, 2/8: 仕入れ所, 3/9: 会所, 5: 港 (10マス)
const BOX_TILES = [1, 7];
const PORT_TILE = 5;
const GUILD_TILES = [3, 9];
const REFILL_TILES = [2, 8];
const BOX_COSTS = [2, 3, 4];
const REFILL_COST = 2;
const MAX_REFILL = 3;

const CARD_COPIES = 4;

function createDeck() {
  const deck = [];
  let id = 1;
  ['tea', 'rice', 'cloth'].forEach(t => {
    CARD_TEMPLATES[t].forEach(tpl => {
      for (let i = 0; i < CARD_COPIES; i++) {
        deck.push({ id: id++, type: t, num: tpl.num, salt: tpl.salt });
      }
    });
  });
  return deck.sort(() => Math.random() - 0.5);
}

function drawSafe(count, currentDeck, currentDiscard, road = null, excludePositions = []) {
  let d = [...currentDeck];
  let disc = [...currentDiscard];
  let newRoad = road ? road.map(arr => [...arr]) : null;
  const drawn = [];

  for (let i = 0; i < count; i++) {
    if (d.length === 0) {
      if (disc.length > 0) {
        d = disc.sort(() => Math.random() - 0.5);
        disc = [];
      } else if (newRoad) {
        const recycled = [];
        newRoad.forEach((arr, pos) => {
          if (!excludePositions.includes(pos) && arr.length > 0) {
            recycled.push(...arr);
            newRoad[pos] = [];
          }
        });
        if (recycled.length > 0) {
          d = recycled.sort(() => Math.random() - 0.5);
        } else {
          break;
        }
      } else {
        break;
      }
    }
    if (d.length > 0) drawn.push(d.shift());
  }
  return { drawn, newDeck: d, newDiscard: disc, newRoad: newRoad || road };
}

function getPlayerTotalSalt(player) {
  if (!player) return 0;
  const boxSalt = (player.boxes || []).reduce((sum, box) => sum + (box.unlocked ? (box.salt || 0) : 0), 0);
  return boxSalt + (player.pouchSalt || 0);
}

function evalSet(cards) {
  if (!cards || cards.length !== 3) return null;
  const types = cards.map(c => c.type);
  const nums = cards.map(c => c.num).sort((a, b) => a - b);
  const baseSalt = cards.reduce((s, c) => s + c.salt, 0);

  // ① 同色判定
  if (types[0] === types[1] && types[1] === types[2]) {
    const t = types[0];
    if (nums[0] === nums[1] && nums[1] === nums[2]) {
      return { name: `${t} ${nums[0]}×3 (刻子)`, salt: baseSalt, isTriplet: true, cards, type: t };
    }
    if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2]) {
      return { name: `${t} ${nums[0]}-${nums[2]} (順子)`, salt: baseSalt, isTriplet: false, cards, type: t };
    }
    return null;
  }

  // ② 三色同刻
  if (nums[0] === nums[1] && nums[1] === nums[2]) {
    const uniqueTypes = new Set(types);
    if (uniqueTypes.size === 3) {
      return { name: `三色 ${nums[0]}×3 (三色同刻)`, salt: baseSalt, isTriplet: true, cards, type: 'tri' };
    }
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

function evaluateHandValue(hand, weights = { salt: 15, tea: 1.2, rice: 1.2, cloth: 1.2 }) {
  if (!hand || hand.length === 0) return 0;
  const sets = findSets(hand);
  let value = 0;
  const usedCardIds = new Set();
  sets.forEach(s => {
    const ids = s.trio.map(c => c.id);
    if (!ids.some(id => usedCardIds.has(id))) {
      ids.forEach(id => usedCardIds.add(id));
      const typeWeight = weights[s.info.type] || 1.0;
      value += 100 + s.info.salt * weights.salt * typeWeight;
    }
  });

  const remainingCards = hand.filter(c => !usedCardIds.has(c.id));
  const byType = { tea: [], rice: [], cloth: [] };
  remainingCards.forEach(c => byType[c.type].push(c));

  Object.keys(byType).forEach(t => {
    const list = byType[t].sort((a, b) => a - b);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const diff = Math.abs(list[i].num - list[j].num);
        if (diff === 0) {
          value += 25 * (weights[t] || 1.0);
        } else if (diff === 1) {
          value += (list[i].num === 1 || list[j].num === 5 ? 20 : 25) * (weights[t] || 1.0);
        } else if (diff === 2) {
          value += 15 * (weights[t] || 1.0);
        }
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
// 2. AI 戦略定義
// ====================================================

function createBaseStrategy(name, desc, color, weights, options = {}) {
  return {
    name,
    desc,
    color,
    weights,
    chooseMove(player, state, config) {
      if (!player.hand || player.hand.length === 0) return 0;
      const priorities = getCardDiscardPriorities(player.hand, weights);
      const loadedBoxes = player.boxes.filter(b => b.unlocked && b.cargo).length;
      const emptyBoxes = player.boxes.filter(b => b.unlocked && !b.cargo && (b.salt || 0) === 0).length;
      const handSets = findSets(player.hand).length;
      const totalSalt = getPlayerTotalSalt(player);

      let bestScore = -99999;
      let bestIdx = 0;

      player.hand.forEach((c, idx) => {
        const target = (player.pos + c.num) % 10;
        let score = 0;

        const pInfo = priorities.find(p => p.idx === idx);
        score += (100 - (pInfo ? pInfo.loss : 50)) * 0.9;

        const handAfterMove = player.hand.filter((_, handIdx) => handIdx !== idx);
        const setsAfterMove = findSets(handAfterMove).length;
        if (setsAfterMove > 0 && emptyBoxes > 0) score += setsAfterMove * 120;
        if (setsAfterMove > 0 && emptyBoxes > 1) score += 60;

        if (target === 0) {
          if (totalSalt > 0) score += 180 + totalSalt * 25;
          else score -= 20;
        } else if (target === PORT_TILE) {
          const canSell = loadedBoxes + handSets;
          if (canSell > 0) score += 180 + canSell * 35;
          else score -= 40;
        }

        if (options.getTargetBonus) {
          score += options.getTargetBonus(target, player, state, config);
        }

        const roadStack = state.road[target] || [];
        if (roadStack.length > 0) {
          score += roadStack.length * (emptyBoxes > 0 ? 25 : 6);
        }

        if ((loadedBoxes > 0 || handSets > 0) && totalSalt === 0) {
          const distToPort = (PORT_TILE - target + 10) % 10;
          score += (10 - distToPort) * 8;
        }
        if (totalSalt > 0) {
          const distToHome = (10 - target) % 10;
          score += (10 - distToHome) * 12;
        }

        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });

      return bestIdx;
    },

    shouldReplenishRoad(player, state) {
      const roadCards = state.road[player.pos] || [];
      if (roadCards.length === 0) return false;
      const emptyBoxes = player.boxes.filter(b => b.unlocked && !b.cargo).length;
      return emptyBoxes > 0 || roadCards.length >= 2 || player.hand.length < 3;
    },

    chooseExcessReturns(player, excessCount) {
      const priorities = getCardDiscardPriorities(player.hand, weights);
      return priorities.slice(0, excessCount).map(p => p.card.id);
    },

    ...options
  };
}

const AI_STRATEGIES = {
  adaptive: createBaseStrategy(
    '状況適応型',
    '既存の箱を特製箱に裏返して収入基盤を固めた後、2箱目を増設して大量輸送を狙う賢い王道スタイル。',
    '#38bdf8',
    { salt: 15, tea: 1.2, rice: 1.2, cloth: 1.2 },
    {
      shouldUpgradeRefill(player) { return player.score < WIN_SCORE - 2; },
      getTargetBonus(target, player) {
        const unflipped = player.boxes.find(b => b.unlocked && !b.flipped);
        const hasFlipped = player.boxes.some(b => b.unlocked && b.flipped);
        const unlockedCount = player.boxes.filter(b => b.unlocked).length;
        const totalSalt = getPlayerTotalSalt(player);
        if (GUILD_TILES.includes(target) && unflipped && totalSalt >= 3) return 380;
        if (BOX_TILES.includes(target) && unlockedCount < 4 && totalSalt >= 2 && (hasFlipped || totalSalt >= 5)) return 340;
        return 0;
      },
      decideHomeKeep(player) {
        const unflipped = player.boxes.some(b => b.unlocked && !b.flipped);
        if (unflipped && getPlayerTotalSalt(player) >= 3 && player.score < 14) return 3;
        return 0;
      }
    }
  ),

  cargo_boxes: createBaseStrategy(
    '箱増設型',
    '箱屋(1, 7)で荷箱を4枠まで最速で増設し、大量の荷物をストックして一網打尽に運ぶビルド。',
    '#a78bfa',
    { salt: 14, tea: 1.0, rice: 1.0, cloth: 1.5 },
    {
      shouldUpgradeRefill(player) { return player.score < WIN_SCORE - 2; },
      getTargetBonus(target, player, state, config) {
        const unlockedCount = player.boxes.filter(b => b.unlocked).length;
        const costs = (config && config.boxCosts) || BOX_COSTS;
        if (BOX_TILES.includes(target) && unlockedCount < 4 && getPlayerTotalSalt(player) >= (costs[unlockedCount - 1] || 2)) return 360;
        return 0;
      }
    }
  ),

  guild_bonus: createBaseStrategy(
    '箱裏返し型',
    '会所(3, 7)で木箱を高級箱に裏返し、売却ボーナスを最大限に活かす品質特化ビルド。',
    '#34d399',
    { salt: 16, tea: 1.0, rice: 1.2, cloth: 1.2 },
    {
      shouldUpgradeRefill(player) { return player.score < WIN_SCORE - 2; },
      getTargetBonus(target, player) {
        const unflipped = player.boxes.find(b => b.unlocked && !b.flipped);
        if (GUILD_TILES.includes(target) && unflipped && getPlayerTotalSalt(player) >= 3) return 380;
        return 0;
      }
    }
  ),

  tea_rush: createBaseStrategy(
    '手札直売型',
    '箱の強化・増設を行わず、手札の完成セットだけで港へ直行・ピストン輸送する速攻型。',
    '#fbbf24',
    { salt: 22, tea: 1.5, rice: 1.0, cloth: 1.0 },
    {
      shouldUpgradeRefill() { return false; },
      getTargetBonus() {
        return 0;
      }
    }
  ),

  random: {
    name: 'ランダム型',
    desc: '完全ランダムに選択するベースライン検証AI',
    color: '#94a3b8',
    weights: { salt: 1, tea: 1, rice: 1, cloth: 1 },
    chooseMove(player) {
      if (!player.hand || player.hand.length === 0) return 0;
      return Math.floor(Math.random() * player.hand.length);
    },
    shouldReplenishRoad(player, state) {
      const roadCards = state.road[player.pos] || [];
      return roadCards.length > 0 && Math.random() < 0.5;
    },
    chooseExcessReturns(player, excessCount) {
      const hList = [...player.hand];
      return hList.sort(() => Math.random() - 0.5).slice(0, excessCount).map(c => c.id);
    }
  }
};

// ====================================================
// 3. 1ゲームシミュレーション実行エンジン
// ====================================================

function runSingleGame(botStrategies, config) {
  const boxCosts = (config && config.boxCosts) || BOX_COSTS;
  const d = createDeck();
  const safeBots = (botStrategies || []).map(b => b || AI_STRATEGIES.adaptive);
  const players = safeBots.map((bot, i) => ({
    id: i,
    name: `P${i + 1}`,
    strategy: bot,
    pos: 0,
    hand: d.splice(0, HAND_LIMIT),
    boxes: [
      { unlocked: true, flipped: false, cargo: null, salt: 0 },
      { unlocked: false, flipped: false, cargo: null, salt: 0 },
      { unlocked: false, flipped: false, cargo: null, salt: 0 },
      { unlocked: false, flipped: false, cargo: null, salt: 0 }
    ],
    salt: 0,
    pouchSalt: 0,
    score: 0,
    refillLimit: 1
  }));

  const road = Array(10).fill(null).map(() => [d.shift()]);
  const state = {
    deck: d,
    discard: [],
    road,
    players,
    turn: 0,
    gameOver: false,
    finalRoundTriggered: false
  };

  function packToBoxes(curr) {
    while (true) {
      const sets = findSets(curr.hand);
      const emptyBox = curr.boxes.find(b => b.unlocked && !b.cargo && (b.salt || 0) === 0);
      if (sets.length > 0 && emptyBox) {
        const s = sets[0];
        emptyBox.cargo = { ...s.info, cards: s.trio };
        const usedIds = s.trio.map(c => c.id);
        curr.hand = curr.hand.filter(c => !usedIds.includes(c.id));
        const allPos = state.players.map(p => p.pos);
        const drawRes = drawSafe(3, state.deck, state.discard, state.road, allPos);
        curr.hand.push(...drawRes.drawn);
        state.deck = drawRes.newDeck;
        state.discard = drawRes.newDiscard;
      } else break;
    }
  }

  let totalRounds = 0;
  const maxRounds = 120;

  while (!state.gameOver && totalRounds < maxRounds) {
    const curr = state.players[state.turn];
    const bot = curr.strategy || AI_STRATEGIES.adaptive;

    if (curr.hand.length === 0) {
      const allPos = state.players.map(p => p.pos);
      const res = drawSafe(1, state.deck, state.discard, state.road, allPos);
      state.deck = res.newDeck;
      state.discard = res.newDiscard;
      const topCard = res.drawn[0] || { num: 1, type: 'tea', salt: 2 };
      const nextPos = (curr.pos + topCard.num) % 10;
      state.road[curr.pos].push(topCard);
      curr.pos = nextPos;
    } else {
      const moveIdx = (bot.chooseMove ? bot.chooseMove(curr, state, config) : 0) || 0;
      const chosenCard = curr.hand[moveIdx] || curr.hand[0];
      const nextPos = (curr.pos + chosenCard.num) % 10;
      state.road[curr.pos].push(chosenCard);
      curr.hand = curr.hand.filter((_, i) => i !== moveIdx);
      curr.pos = nextPos;
    }

    // 強化済み上限まで。1枚ごとに場札・山札を選び、役ができたら補充を止める。
    let refillCount = 0;
    while (refillCount < (curr.refillLimit || 1)) {
      const roadCards = state.road[curr.pos] || [];
      const fieldPick = roadCards.reduce((best, card) => {
        const value = evaluateHandValue([...curr.hand, card], curr.strategy.weights);
        return value > best.value ? { card, value } : best;
      }, { card: null, value: -1 });
      const emptyBoxSlots = curr.boxes.filter(b => b.unlocked && !b.cargo && (b.salt || 0) === 0).length;
      if (refillCount > 0 && findSets(curr.hand).length >= Math.max(1, emptyBoxSlots)) break;

      const fieldCreatesSet = fieldPick.card && findSets([...curr.hand, fieldPick.card]).length > 0;
      if (fieldPick.card && (fieldCreatesSet || roadCards.length >= 2)) {
        curr.hand.push(fieldPick.card);
        state.road[curr.pos] = roadCards.filter(card => card.id !== fieldPick.card.id);
      } else {
        const allPos = state.players.map(p => p.pos);
        const res = drawSafe(1, state.deck, state.discard, state.road, [...allPos, curr.pos]);
        if (res.drawn.length === 0) break;
        curr.hand.push(...res.drawn);
        state.deck = res.newDeck;
        state.discard = res.newDiscard;
        state.road = res.newRoad || state.road;
      }
      refillCount++;
    }
    packToBoxes(curr);

    // 手番の最後に手札を5枚以下へ整理し、余りは現在地へ戻す。
    if (curr.hand.length > HAND_LIMIT) {
      const excessCount = curr.hand.length - HAND_LIMIT;
      const returnIds = bot.chooseExcessReturns(curr, excessCount, config);
      const toReturn = curr.hand.filter(card => returnIds.includes(card.id));
      curr.hand = curr.hand.filter(card => !returnIds.includes(card.id));
      state.road[curr.pos].push(...toReturn);
    }

    const totalSalt = curr.boxes.reduce((sum, b) => sum + (b.salt || 0), 0) + (curr.pouchSalt || 0);

    if (curr.pos === 0) {
      let keep = 0;
      if (bot.decideHomeKeep) keep = bot.decideHomeKeep(curr, config);
      const deliver = Math.max(0, totalSalt - keep);
      curr.score += deliver;
      let needed = deliver;
      if (curr.pouchSalt >= needed) {
        curr.pouchSalt -= needed;
        needed = 0;
      } else {
        needed -= curr.pouchSalt;
        curr.pouchSalt = 0;
      }
      curr.boxes.forEach(b => {
        if (needed > 0 && b.unlocked && b.salt > 0) {
          if (b.salt >= needed) {
            b.salt -= needed;
            needed = 0;
          } else {
            needed -= b.salt;
            b.salt = 0;
          }
        }
      });

      if (curr.score >= config.winScore) state.finalRoundTriggered = true;
    } else if (curr.pos === PORT_TILE) {
      curr.boxes.forEach(b => {
        if (b.unlocked && b.cargo) {
          const bonus = b.flipped ? (config.flipBonus || 3) : 0;
          b.salt = b.cargo.salt + bonus;
          if (b.cargo.cards) state.discard.push(...b.cargo.cards);
          b.cargo = null;
        }
      });

      const hSets = findSets(curr.hand);
      if (hSets.length > 0) {
        const s = hSets[0];
        state.discard.push(...s.trio);
        const usedIds = s.trio.map(c => c.id);
        curr.hand = curr.hand.filter(c => !usedIds.includes(c.id));
        const allPos = state.players.map(p => p.pos);
        const drawRes = drawSafe(3, state.deck, state.discard, state.road, allPos);
        curr.hand.push(...drawRes.drawn);
        state.deck = drawRes.newDeck;
        state.discard = drawRes.newDiscard;
        const emptyBox = curr.boxes.find(b => b.unlocked && !b.cargo && (b.salt || 0) === 0);
        if (emptyBox) {
          const bonus = emptyBox.flipped ? (config.flipBonus || 3) : 0;
          emptyBox.salt = s.info.salt + bonus;
        } else {
          curr.pouchSalt = (curr.pouchSalt || 0) + s.info.salt;
        }
      }
    } else if (GUILD_TILES.includes(curr.pos)) {
      const unflipped = curr.boxes.find(b => b.unlocked && !b.flipped);
      if (unflipped && totalSalt >= config.flipCost && bot.name !== '手札直売型') {
        let needed = config.flipCost;
        if (curr.pouchSalt >= needed) {
          curr.pouchSalt -= needed;
          needed = 0;
        } else {
          needed -= curr.pouchSalt;
          curr.pouchSalt = 0;
        }
        curr.boxes.forEach(b => {
          if (needed > 0 && b.unlocked && b.salt > 0) {
            if (b.salt >= needed) {
              b.salt -= needed;
              needed = 0;
            } else {
              needed -= b.salt;
              b.salt = 0;
            }
          }
        });
        unflipped.flipped = true;
      }
    } else if (BOX_TILES.includes(curr.pos)) {
      const unlockedCount = curr.boxes.filter(b => b.unlocked).length;
      const nextCost = boxCosts[unlockedCount - 1] || 2;
      if (unlockedCount < 4 && totalSalt >= nextCost && bot.name !== '手札直売型') {
        let needed = nextCost;
        if (curr.pouchSalt >= needed) {
          curr.pouchSalt -= needed;
          needed = 0;
        } else {
          needed -= curr.pouchSalt;
          curr.pouchSalt = 0;
        }
        curr.boxes.forEach(b => {
          if (needed > 0 && b.unlocked && b.salt > 0) {
            if (b.salt >= needed) {
              b.salt -= needed;
              needed = 0;
            } else {
              needed -= b.salt;
              b.salt = 0;
            }
          }
        });
        const target = curr.boxes.find(b => !b.unlocked);
        if (target) target.unlocked = true;
      }
    } else if (REFILL_TILES.includes(curr.pos)) {
      // 仕入れ所: 塩2で補充上限を+1（最大3枚）
      const curTot = curr.boxes.reduce((sum, b) => sum + (b.salt || 0), 0) + curr.pouchSalt;
      const wantsUpgrade = bot.shouldUpgradeRefill ? bot.shouldUpgradeRefill(curr) : true;
      if ((curr.refillLimit || 1) < MAX_REFILL && curTot >= REFILL_COST && wantsUpgrade) {
        curr.refillLimit = (curr.refillLimit || 1) + 1;
        let needed = REFILL_COST;
        if (curr.pouchSalt >= needed) { curr.pouchSalt -= needed; needed = 0; }
        else { needed -= curr.pouchSalt; curr.pouchSalt = 0; }
        curr.boxes = curr.boxes.map(b => {
          if (needed > 0 && b.unlocked && b.salt > 0) {
            if (b.salt >= needed) { const rem = b.salt - needed; needed = 0; return { ...b, salt: rem }; }
            needed -= b.salt;
            return { ...b, salt: 0 };
          }
          return b;
        });
      }
    }

    packToBoxes(curr);

    const nextTurn = (state.turn + 1) % 4;
    state.gameOver = state.finalRoundTriggered && nextTurn === 0;
    state.turn = nextTurn;
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

const PLAYER_COLORS = ['#f43f5e', '#34d399', '#fbbf24', '#a78bfa'];

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
        { label: '所持箱数 (1〜3箱)', data: [1.7, 1.7, 1.7, 1.7], backgroundColor: '#a78bfa', borderRadius: 4 },
        { label: '裏返し特製箱数 (0〜3箱)', data: [1.2, 1.2, 1.2, 1.2], backgroundColor: '#34d399', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, min: 0, max: 3, ticks: { stepSize: 0.5, callback: v => `${v}箱` } },
        x: { grid: { display: false } }
      },
      plugins: { legend: { position: 'top', labels: { boxWidth: 10 } } }
    }
  });
}

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
      return wins > 0 ? (latestStats.winnerBoxesCount[i] / wins).toFixed(2) : 1.00;
    });
    charts.facility.data.datasets[1].data = latestBots.map((_, i) => {
      const wins = latestStats.winsByPlayer[i];
      return wins > 0 ? (latestStats.winnerFlippedCount[i] / wins).toFixed(2) : 0.00;
    });
  } else {
    charts.facility.data.datasets[0].data = latestStats.allBoxesCount.map(v => (v / latestTotalGames).toFixed(2));
    charts.facility.data.datasets[1].data = latestStats.allFlippedCount.map(v => (v / latestTotalGames).toFixed(2));
  }
  charts.facility.update();
}

function applyPreset(presetKey) {
  const presets = {
    four_builds: ['adaptive', 'guild_bonus', 'tea_rush', 'cargo_boxes'],
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

  const totalGames = parseInt(document.getElementById('numGames').value, 10) || 1000;
  const winScore = parseInt(document.getElementById('winScore').value, 10) || 15;
  const boxCost = parseInt(document.getElementById('boxCost').value, 10) || 2;
  const flipCost = parseInt(document.getElementById('flipCost').value, 10) || 3;
  const flipBonus = parseInt(document.getElementById('flipBonus').value, 10) || 2;

  const config = {
    winScore,
    handLimit: HAND_LIMIT,
    boxCost,
    boxCosts: [boxCost, boxCost + 1, boxCost + 2],
    flipCost,
    flipBonus
  };

  const botKeys = [
    document.getElementById('p1Strategy').value,
    document.getElementById('p2Strategy').value,
    document.getElementById('p3Strategy').value,
    document.getElementById('p4Strategy').value
  ];
  const bots = botKeys.map(k => AI_STRATEGIES[k] || AI_STRATEGIES.adaptive);

  const stats = {
    winsByPlayer: [0, 0, 0, 0],
    totalRounds: 0,
    roundsList: [],
    scoresByPlayer: [[], [], [], []],
    allBoxesCount: [0, 0, 0, 0],
    allFlippedCount: [0, 0, 0, 0],
    winnerBoxesCount: [0, 0, 0, 0],
    winnerFlippedCount: [0, 0, 0, 0],
    roundFreq: {},
    boxStats: { 1: { count: 0, wins: 0 }, 2: { count: 0, wins: 0 }, 3: { count: 0, wins: 0 } },
    flipStats: { 0: { count: 0, wins: 0 }, 1: { count: 0, wins: 0 }, 2: { count: 0, wins: 0 }, 3: { count: 0, wins: 0 } },
    matrixStats: {
      1: { 0: { count: 0, wins: 0 }, 1: { count: 0, wins: 0 } },
      2: { 0: { count: 0, wins: 0 }, 1: { count: 0, wins: 0 }, 2: { count: 0, wins: 0 } },
      3: { 0: { count: 0, wins: 0 }, 1: { count: 0, wins: 0 }, 2: { count: 0, wins: 0 }, 3: { count: 0, wins: 0 } }
    }
  };

  const startTime = performance.now();
  const batchSize = Math.max(25, Math.floor(totalGames / 30));
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
      const winUCount = winnerP.boxes.filter(b => b.unlocked).length;
      const winFCount = winnerP.boxes.filter(b => b.unlocked && b.flipped).length;
      stats.winnerBoxesCount[wId] += winUCount;
      stats.winnerFlippedCount[wId] += winFCount;

      res.finalPlayers.forEach((p, idx) => {
        const isWinner = (idx === wId);
        stats.scoresByPlayer[idx].push(p.score);
        const uCount = p.boxes.filter(b => b.unlocked).length;
        const fCount = p.boxes.filter(b => b.unlocked && b.flipped).length;
        stats.allBoxesCount[idx] += uCount;
        stats.allFlippedCount[idx] += fCount;

        stats.boxStats[uCount].count++;
        if (isWinner) stats.boxStats[uCount].wins++;
        stats.flipStats[fCount].count++;
        if (isWinner) stats.flipStats[fCount].wins++;

        if (!stats.matrixStats[uCount]) stats.matrixStats[uCount] = {};
        if (!stats.matrixStats[uCount][fCount]) stats.matrixStats[uCount][fCount] = { count: 0, wins: 0 };
        stats.matrixStats[uCount][fCount].count++;
        if (isWinner) stats.matrixStats[uCount][fCount].wins++;
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
  const gamesPerSec = (totalGames / Math.max(0.01, elapsedSec)).toFixed(0);

  stats.roundsList.sort((a, b) => a - b);
  const avgRounds = (stats.totalRounds / totalGames).toFixed(1);
  const medianRounds = stats.roundsList[Math.floor(totalGames / 2)];
  const minRounds = stats.roundsList[0];
  const maxRounds = stats.roundsList[stats.roundsList.length - 1];

  const totalWins = stats.winsByPlayer.reduce((a, b) => a + b, 0);
  const totalWinBoxCount = totalWins > 0 ? (stats.winnerBoxesCount.reduce((a, b) => a + b, 0) / totalWins).toFixed(2) : '1.00';
  const totalWinFlippedCount = totalWins > 0 ? (stats.winnerFlippedCount.reduce((a, b) => a + b, 0) / totalWins).toFixed(2) : '0.00';

  let topIdx = 0;
  let maxWins = -1;
  stats.winsByPlayer.forEach((w, idx) => {
    if (w > maxWins) {
      maxWins = w;
      topIdx = idx;
    }
  });
  const topRate = ((maxWins / totalGames) * 100).toFixed(1);

  if (document.getElementById('kpiAvgRounds')) document.getElementById('kpiAvgRounds').textContent = `${avgRounds} 巡`;
  if (document.getElementById('kpiMedianRounds')) document.getElementById('kpiMedianRounds').textContent = `中央値: ${medianRounds} 巡 (最速 ${minRounds} / 最遅 ${maxRounds})`;
  if (document.getElementById('kpiTopPlayer')) document.getElementById('kpiTopPlayer').textContent = `P${topIdx + 1} (${bots[topIdx].name})`;
  if (document.getElementById('kpiTopWinRate')) document.getElementById('kpiTopWinRate').textContent = `勝率 ${topRate}% (${maxWins}勝)`;
  if (document.getElementById('kpiWinnerLvs')) document.getElementById('kpiWinnerLvs').textContent = `📦${totalWinBoxCount}箱 / ✨特製${totalWinFlippedCount}箱`;
  if (document.getElementById('kpiSpeed')) document.getElementById('kpiSpeed').textContent = `${gamesPerSec} 試合/秒`;
  if (document.getElementById('kpiTime')) document.getElementById('kpiTime').textContent = `実行時間: ${elapsedSec} 秒 (${totalGames.toLocaleString()} 試合)`;

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

  // レベル別統計の描画
  const totalPlayerInstances = totalGames * 4;
  const boxStatsEl = document.getElementById('boxLevelStats');
  if (boxStatsEl) {
    boxStatsEl.innerHTML = '';
    const boxLabels = { 1: '1箱所持 (初期)', 2: '2箱所持 (増設)', 3: '3箱所持 (最大)' };
    for (let b = 1; b <= 3; b++) {
      const st = stats.boxStats[b];
      const reachPct = ((st.count / totalPlayerInstances) * 100).toFixed(1);
      const winRate = st.count > 0 ? ((st.wins / st.count) * 100).toFixed(1) : '0.0';
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(15,23,42,0.4); padding: 5px 8px; border-radius: 4px; font-size: 11px;';
      row.innerHTML = `
        <span><strong>${boxLabels[b]}</strong> <span style="color: #64748b;">(${reachPct}%)</span></span>
        <span style="font-weight: 800; color: #a78bfa;">🏆 勝率 ${winRate}% <span style="color: #64748b; font-size: 10px;">(${st.wins}勝)</span></span>
      `;
      boxStatsEl.appendChild(row);
    }
  }

  const guildStatsEl = document.getElementById('guildLevelStats');
  if (guildStatsEl) {
    guildStatsEl.innerHTML = '';
    const flipLabels = { 0: '特製箱 0個 (木箱のみ)', 1: '特製箱 1個 (+2塩)', 2: '特製箱 2個 (+4塩)', 3: '特製箱 3個 (+6塩)' };
    for (let f = 0; f <= 3; f++) {
      const st = stats.flipStats[f];
      const reachPct = ((st.count / totalPlayerInstances) * 100).toFixed(1);
      const winRate = st.count > 0 ? ((st.wins / st.count) * 100).toFixed(1) : '0.0';
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(15,23,42,0.4); padding: 5px 8px; border-radius: 4px; font-size: 11px;';
      row.innerHTML = `
        <span><strong>${flipLabels[f]}</strong> <span style="color: #64748b;">(${reachPct}%)</span></span>
        <span style="font-weight: 800; color: #34d399;">🏆 勝率 ${winRate}% <span style="color: #64748b; font-size: 10px;">(${st.wins}勝)</span></span>
      `;
      guildStatsEl.appendChild(row);
    }
  }

  const matrixEl = document.getElementById('synergyMatrix');
  if (matrixEl) {
    matrixEl.innerHTML = '';
    for (let b = 1; b <= 3; b++) {
      for (let f = 0; f <= b; f++) {
        const st = stats.matrixStats[b] && stats.matrixStats[b][f] ? stats.matrixStats[b][f] : { count: 0, wins: 0 };
        const share = ((st.count / totalPlayerInstances) * 100).toFixed(1);
        const winRate = st.count > 0 ? ((st.wins / st.count) * 100).toFixed(1) : '0.0';
        const cell = document.createElement('div');
        cell.className = 'matrix-cell';
        cell.innerHTML = `
          <div class="matrix-title">
            <span>📦${b}箱 × ✨特製${f}箱</span>
            <span style="color: #64748b;">${share}%</span>
          </div>
          <div class="matrix-winrate">🏆 ${winRate}%</div>
          <div class="matrix-sub">${st.wins}勝 / ${st.count}回</div>
        `;
        matrixEl.appendChild(cell);
      }
    }
  }

  const tbody = document.getElementById('statsTableBody');
  if (tbody) {
    tbody.innerHTML = '';

    const tableData = bots.map((bot, i) => {
      const wins = stats.winsByPlayer[i];
      const rate = ((wins / totalGames) * 100).toFixed(1);
      const scores = stats.scoresByPlayer[i];
      const avgScore = (scores.reduce((a, b) => a + b, 0) / totalGames).toFixed(1);
      const winBoxCount = wins > 0 ? (stats.winnerBoxesCount[i] / wins).toFixed(2) : '-';
      const winFlippedCount = wins > 0 ? (stats.winnerFlippedCount[i] / wins).toFixed(2) : '-';
      const allBoxCount = (stats.allBoxesCount[i] / totalGames).toFixed(2);
      const allFlippedCount = (stats.allFlippedCount[i] / totalGames).toFixed(2);

      return { id: i + 1, name: bot.name, wins, rate, avgScore, winBoxCount, winFlippedCount, allBoxCount, allFlippedCount };
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
        <td style="color: #94a3b8; font-weight: bold; background: rgba(148, 163, 184, 0.08);">5枚固定</td>
        <td style="color: #a78bfa; font-weight: bold; background: rgba(167, 139, 250, 0.08);">${row.winBoxCount}箱</td>
        <td style="color: #34d399; font-weight: bold; background: rgba(52, 211, 153, 0.08);">特製${row.winFlippedCount}箱</td>
        <td style="color: #94a3b8; font-size: 11px;">📦${row.allBoxCount} ✨${row.allFlippedCount}</td>
      `;
      tbody.appendChild(tr);
    });
  }

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

  setTimeout(runSimulation, 100);
});
