/**
 * 『ナウキ運び』面白さ8軸評価システム (Enhanced Fun Evaluator v2)
 * ─────────────────────────────────────────────────────
 * 8つの独立軸で「面白さ」を定量評価し、最終100点満点でスコアリング。
 *
 * 【8軸】
 *  1. 🔥 接戦度 (Closeness)        — 1-2位差、逆転率、同時リーチ率
 *  2. ⚖️ 戦略多様性 (Diversity)    — 勝率ジニ係数、全戦略の実効性
 *  3. ⚡ テンポ (Pacing)           — 決着ラウンド分布、安定性
 *  4. 📦 成長・達成感 (Growth)     — 荷箱増設率、桐箱強化率
 *  5. 🧠 悩ましさ (Dilemma)        — 手番あたりの有効選択肢数、次善手との差
 *  6. 📈 ドラマ性 (Drama)          — リードチェンジ回数、逆転劇のタイミング
 *  7. 🤝 相互作用 (Interaction)    — マス上カード争奪、経路競合
 *  8. 🎯 公平性 (Fairness)         — 手番順バイアスの少なさ
 */

// ── 定数 ──────────────────────────────────────────
const CARD_TEMPLATES = {
  tea:   [{ num: 1, salt: 2 }, { num: 2, salt: 1 }, { num: 3, salt: 1 }, { num: 4, salt: 1 }, { num: 5, salt: 2 }],
  rice:  [{ num: 1, salt: 2 }, { num: 2, salt: 1 }, { num: 3, salt: 1 }, { num: 4, salt: 1 }, { num: 5, salt: 2 }],
  cloth: [{ num: 1, salt: 2 }, { num: 2, salt: 1 }, { num: 3, salt: 1 }, { num: 4, salt: 1 }, { num: 5, salt: 2 }]
};

const HAND_LIMIT  = 5;
const WIN_SCORE = 15;
const BOX_COSTS   = [2, 3, 4];
const FLIP_COST   = 3;
const WOOD_BONUS  = 0;
const FLIP_BONUS  = 2;
const BOX_TILES   = [1, 7];
const PORT_TILE   = 5;
const GUILD_TILES = [3, 9];
const REFILL_TILES = [2, 8];
const REFILL_COST = 2;
const MAX_REFILL = 3;
const CARD_COPIES = 4;

// ── ユーティリティ ────────────────────────────────
function createSeededRandom(seed) {
  let value = (Number(seed) >>> 0) || 0x6d2b79f5;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createDeck(random = Math.random) {
  const deck = [];
  let id = 1;
  ['tea', 'rice', 'cloth'].forEach(t => {
    CARD_TEMPLATES[t].forEach(tpl => {
      for (let i = 0; i < CARD_COPIES; i++) {
        deck.push({ id: id++, type: t, num: tpl.num, salt: tpl.salt });
      }
    });
  });
  return shuffle(deck, random);
}

function drawSafe(count, currentDeck, currentDiscard, road = null, excludePositions = [], random = Math.random) {
  let d = [...currentDeck];
  let disc = [...currentDiscard];
  let newRoad = road ? road.map(arr => [...arr]) : null;
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (d.length === 0) {
      if (disc.length > 0) { d = shuffle(disc, random); disc = []; }
      else if (newRoad) {
        const recycled = [];
        newRoad.forEach((arr, pos) => { if (!excludePositions.includes(pos) && arr.length > 0) { recycled.push(...arr); newRoad[pos] = []; } });
        if (recycled.length > 0) d = shuffle(recycled, random); else break;
      } else break;
    }
    if (d.length > 0) drawn.push(d.shift());
  }
  return { drawn, newDeck: d, newDiscard: disc, newRoad: newRoad || road };
}

function evalSet(cards) {
  if (!cards || cards.length !== 3) return null;
  const types = cards.map(c => c.type);
  const nums = cards.map(c => c.num).sort((a, b) => a - b);
  const baseSalt = cards.reduce((s, c) => s + c.salt, 0);
  if (types[0] === types[1] && types[1] === types[2]) {
    const t = types[0];
    if (nums[0] === nums[1] && nums[1] === nums[2])
      return { name: `${t} ${nums[0]}×3`, salt: baseSalt, isTriplet: true, cards, type: t };
    if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2])
      return { name: `${t} ${nums[0]}-${nums[2]}`, salt: baseSalt, isTriplet: false, cards, type: t };
  }
  return null;
}

function findSets(hand) {
  const list = [];
  if (!hand || hand.length < 3) return list;
  const n = hand.length;
  const seen = new Set();
  for (let i = 0; i < n - 2; i++)
    for (let j = i + 1; j < n - 1; j++)
      for (let k = j + 1; k < n; k++) {
        const trio = [hand[i], hand[j], hand[k]];
        const r = evalSet(trio);
        if (r) { const pk = `${r.name}:${r.salt}`; if (!seen.has(pk)) { seen.add(pk); list.push({ trio, info: r }); } }
      }
  return list;
}

// 手札の発展性（ターツ・対子・同一色の枚数など）を評価
function evaluateHandSynergy(hand) {
  if (!hand || hand.length === 0) return 0;
  let score = 0;
  const byType = {};
  hand.forEach(c => {
    if (!byType[c.type]) byType[c.type] = [];
    byType[c.type].push(c.num);
  });

  Object.values(byType).forEach(nums => {
    if (nums.length >= 2) {
      score += nums.length * 15;
      nums.sort((a, b) => a - b);
      for (let i = 0; i < nums.length - 1; i++) {
        const diff = nums[i + 1] - nums[i];
        if (diff === 0) score += 35;       // 対子
        else if (diff === 1) score += 40;  // 両面/連続
        else if (diff === 2) score += 20;  // カンチャン
      }
    }
  });
  return score;
}

function getCardDiscardPriorities(hand) {
  if (!hand || hand.length === 0) return [];
  const currentSets = findSets(hand);
  const currentBestValue = currentSets.length > 0 ? Math.max(...currentSets.map(s => s.info.salt)) : 0;
  const currentSynergy = evaluateHandSynergy(hand);

  return hand.map((card, idx) => {
    const rem = hand.filter((_, i) => i !== idx);
    const ns = findSets(rem);
    const nv = ns.length > 0 ? Math.max(...ns.map(s => s.info.salt)) : 0;
    const nSynergy = evaluateHandSynergy(rem);
    const setLoss = (currentBestValue - nv) * 50;
    const synLoss = (currentSynergy - nSynergy);
    return { card, idx, loss: setLoss + synLoss };
  }).sort((a, b) => a.loss - b.loss);
}

// ── 4大戦略 ──────────────────────────────────────
const STRATEGIES = {
  adaptive: {
    name: '適応型 (Adaptive)',
    shouldBuyBox:  c => c.boxes.filter(b => b.unlocked).length < 3 && c.score < WIN_SCORE - 3,
    shouldUpgradeRefill: c => c.refillLimit < MAX_REFILL && c.score < WIN_SCORE - 2,
    shouldFlipBox: c => c.score < WIN_SCORE - 2,
    getKeepAmount: c => {
      const u = c.boxes.filter(b => b.unlocked).length;
      if (c.score + (c.boxes.reduce((s, b) => s + (b.salt || 0), 0) + c.pouchSalt) >= WIN_SCORE) return 0;
      if (u < 3 && c.score < WIN_SCORE - 3) return BOX_COSTS[u - 1];
      if (c.boxes.find(b => b.unlocked && !b.flipped) && c.score < WIN_SCORE - 2) return FLIP_COST;
      return 0;
    }
  },
  moreBoxes: {
    name: '荷箱増設特化 (More Boxes)',
    shouldBuyBox:  c => c.boxes.filter(b => b.unlocked).length < 4 && c.score < WIN_SCORE - 2,
    shouldUpgradeRefill: c => c.refillLimit < MAX_REFILL && c.score < WIN_SCORE - 2,
    shouldFlipBox: c => c.boxes.filter(b => b.unlocked).length >= 3 && c.score < WIN_SCORE - 2,
    getKeepAmount: c => {
      const u = c.boxes.filter(b => b.unlocked).length;
      if (c.score + (c.boxes.reduce((s, b) => s + (b.salt || 0), 0) + c.pouchSalt) >= WIN_SCORE) return 0;
      if (u < 4 && c.score < WIN_SCORE - 2) return BOX_COSTS[u - 1];
      return 0;
    }
  },
  qualityBoxes: {
    name: '桐箱強化特化 (Quality Boxes)',
    shouldBuyBox:  c => c.boxes.filter(b => b.unlocked).length < 2 && c.score < WIN_SCORE - 2,
    shouldUpgradeRefill: c => c.refillLimit < MAX_REFILL && c.score < WIN_SCORE - 2,
    shouldFlipBox: c => c.score < WIN_SCORE - 2,
    getKeepAmount: c => {
      if (c.score + (c.boxes.reduce((s, b) => s + (b.salt || 0), 0) + c.pouchSalt) >= WIN_SCORE) return 0;
      if (c.boxes.find(b => b.unlocked && !b.flipped) && c.score < WIN_SCORE - 2) return FLIP_COST;
      return 0;
    }
  },
  fastShuttle: {
    name: '快速便 (Fast Shuttle)',
    shouldBuyBox:  c => c.boxes.filter(b => b.unlocked).length < 2 && c.score < WIN_SCORE - 3,
    shouldUpgradeRefill: () => false,
    shouldFlipBox: () => false,
    getKeepAmount: c => {
      const u = c.boxes.filter(b => b.unlocked).length;
      if (c.score + (c.boxes.reduce((s, b) => s + (b.salt || 0), 0) + c.pouchSalt) >= WIN_SCORE) return 0;
      if (u < 2 && c.score < WIN_SCORE - 3) return BOX_COSTS[u - 1];
      return 0;
    }
  }
};

// ── 拡張シミュレーション (トラッキング付き) ──────
function runTrackedMatch(stratKeys = ['adaptive', 'moreBoxes', 'qualityBoxes', 'fastShuttle'], random = Math.random) {
  const d = createDeck(random);
  const players = stratKeys.map((k, i) => {
    return {
      id: i, stratKey: k, strat: STRATEGIES[k],
      // 実ゲームと同じ条件：全員が初期手札5枚。
      pos: 0, hand: d.splice(0, HAND_LIMIT),
      boxes: [
        { unlocked: true,  flipped: false, cargo: null, salt: 0 },
        { unlocked: false, flipped: false, cargo: null, salt: 0 },
        { unlocked: false, flipped: false, cargo: null, salt: 0 },
        { unlocked: false, flipped: false, cargo: null, salt: 0 }
      ],
      pouchSalt: 0, score: 0, refillLimit: 1
    };
  });

  const road = Array(10).fill(null).map(() => [d.shift()]);
  const state = { deck: d, discard: [], road, players, turn: 0, gameOver: false, winner: null,
    finalRoundTriggered: false  // 最終ラウンドフラグ
  };

  // ── トラッキングデータ ──
  const tracking = {
    scoreHistory: players.map(() => [0]),  // [playerIdx][turnIdx] = score
    leadChanges: 0,
    lastLeader: -1,
    dilemmaScores: [],          // 各手番の「選択肢の悩ましさ」
    cardContention: 0,          // マス上カードの奪い合い回数
    pathCollisions: 0,          // 同じマスへの移動回数
    setsFormed: players.map(() => 0),
    portVisits: players.map(() => 0),
    homeVisits: players.map(() => 0),
    facilitySpendings: players.map(() => 0),
    midpointLeader: null,
    midpointRecorded: false,
  };

  let turns = 0;
  const maxTurns = 80;

  while (!state.gameOver && turns < maxTurns) {
    const curr = state.players[state.turn];
    const allPlayerPos = state.players.map(pl => pl.pos);
    const currentRound = Math.floor(turns / 4) + 1;

    if (currentRound >= 3 && !tracking.midpointRecorded) {
      tracking.midpointLeader = [...state.players].sort((a, b) => b.score - a.score)[0].id;
      tracking.midpointRecorded = true;
    }

    if (curr.hand.length === 0) {
      const res = drawSafe(HAND_LIMIT, state.deck, state.discard, state.road, allPlayerPos, random);
      curr.hand = res.drawn; state.deck = res.newDeck; state.discard = res.newDiscard;
      state.road = res.newRoad || state.road;
      if (curr.hand.length === 0) { state.turn = (state.turn + 1) % 4; turns++; continue; }
    }

    // ── 意思決定分析（軸5: 悩ましさ）──
    const priorities = getCardDiscardPriorities(curr.hand);
    const totalSalt = curr.boxes.reduce((s, b) => s + (b.salt || 0), 0) + curr.pouchSalt;
    const hasSalt = totalSalt > 0;
    const loadedBoxes = curr.boxes.filter(b => b.unlocked && b.cargo).length;
    const emptyBoxes = curr.boxes.filter(b => b.unlocked && !b.cargo && b.salt === 0).length;
    const unflipped = curr.boxes.find(b => b.unlocked && !b.flipped);
    const unlockedBoxes = curr.boxes.filter(b => b.unlocked);

    const moveScores = [];
    curr.hand.forEach((c, idx) => {
      const pInfo = priorities.find(p => p.idx === idx);
      const baseLoss = pInfo ? pInfo.loss : 50;
      const target = (curr.pos + c.num) % 10;
      const handAfterMove = curr.hand.filter((_, handIdx) => handIdx !== idx);
      const setsAfterMove = findSets(handAfterMove).length;
      let score = (100 - baseLoss) * 0.9;

      // 複数箱所持時の荷積み・面子準備
      if (setsAfterMove > 0 && emptyBoxes > 0) {
        score += setsAfterMove * 160;
        if (emptyBoxes > 1) score += 110;
      }

      // 手札の発展性（シナジー）を評価に加味
      const synAfterMove = evaluateHandSynergy(handAfterMove);
      score += synAfterMove * 1.2;

      // 施設や目的地ごとの評価
      if (target === 0) {
        // 地元
        if (hasSalt) {
          score += 480 + totalSalt * 80;
          if (curr.score + totalSalt >= WIN_SCORE) score += 35000;
        } else {
          score -= 30;
        }
      } else if (target === PORT_TILE) {
        // 港: 荷物を多く積んでいるほど高評価
        if (loadedBoxes > 0) {
          score += 500 + loadedBoxes * 250;
          // 空き箱が複数残っているのに1箱だけで港に行くのを抑制（複数箱活用を促す）
          if (emptyBoxes >= 2 && loadedBoxes === 1) score -= 180;
          else if (emptyBoxes === 1 && loadedBoxes === 1) score -= 80;
        } else {
          score -= 50;
        }
      } else if (BOX_TILES.includes(target) && unlockedBoxes.length < 4) {
        // 箱屋 (1, 7): 増設
        const cost = BOX_COSTS[unlockedBoxes.length - 1];
        if (curr.strat.shouldBuyBox(curr) && totalSalt >= cost) {
          score += 750 + (4 - unlockedBoxes.length) * 60;
        }
      } else if (REFILL_TILES.includes(target) && curr.refillLimit < MAX_REFILL) {
        // 仕入れ所 (2, 8): 補充上限強化
        if (curr.strat.shouldUpgradeRefill(curr) && totalSalt >= REFILL_COST) {
          score += 680;
        }
      } else if (GUILD_TILES.includes(target) && unflipped) {
        // 会所 (3, 9): 桐箱化
        if (curr.strat.shouldFlipBox(curr) && totalSalt >= FLIP_COST) {
          score += 700;
        }
      }

      // 街道・場札回収（空き箱が多いときはカード集めの価値が高い）
      const roadCards = state.road[target] || [];
      if (roadCards.length > 0) {
        score += roadCards.length * (emptyBoxes > 1 ? 60 : (emptyBoxes > 0 ? 40 : 15));
      }

      // 港への進行 / 地元への進行
      if (loadedBoxes > 0 && !hasSalt) {
        // 空き箱を抱えているときは急ぎすぎず仕込みを優先、満載なら港へ一直線
        const distToPort = (PORT_TILE - target + 10) % 10;
        if (target <= PORT_TILE) {
          const progressWeight = (emptyBoxes > 0 ? 30 : 65);
          score += (5 - distToPort) * (progressWeight + loadedBoxes * 20);
        }
      }
      if (hasSalt) {
        // 塩を持っている場合、帰り道の施設（7, 8, 9）に寄れるなら地元直行より寄り道を評価
        const distToHome = (10 - target) % 10;
        if (target >= PORT_TILE || target === 0) {
          score += (10 - distToHome) * 45;
        }
      }

      moveScores.push(score);
    });

    // 悩ましさスコア: 上位2手の差が小さいほど悩ましい
    if (moveScores.length >= 2) {
      const sorted = [...moveScores].sort((a, b) => b - a);
      const gap = sorted[0] - sorted[1];
      const viableOptions = sorted.filter(s => sorted[0] - s < 100).length;
      tracking.dilemmaScores.push({ gap, viableOptions });
    }

    // 最良手を選択
    let bestScore = -99999, bestIdx = 0;
    moveScores.forEach((score, idx) => { if (score > bestScore) { bestScore = score; bestIdx = idx; } });

    const chosenCard = curr.hand[bestIdx] || curr.hand[0];
    const nextPos = (curr.pos + chosenCard.num) % 10;

    // 相互作用: 目的地に他プレイヤーがいたらカウント
    const othersAtDest = state.players.filter((pl, i) => i !== state.turn && pl.pos === nextPos);
    if (othersAtDest.length > 0) tracking.pathCollisions++;

    // カード争奪: マス上にカードがあり、他プレイヤーもそこを狙えたか
    const roadCardsAtDestPre = state.road[nextPos] || [];
    if (roadCardsAtDestPre.length > 0) {
      state.players.forEach((pl, i) => {
        if (i !== state.turn && pl.hand.some(c => (pl.pos + c.num) % 10 === nextPos)) {
          tracking.cardContention++;
        }
      });
    }

    // 移動実行
    const tempRoad = state.road.map((arr, i) => i === curr.pos ? [...arr, chosenCard] : arr);
    let hnd = curr.hand.filter((_, idx) => idx !== bestIdx);
    let newDeck = state.deck, newDiscard = state.discard, newRoad = tempRoad;

    // 補充：強化済み上限まで。BOTは役・シナジーが伸びる場札を優先し、それ以外は山札を選ぶ。
    let refillCount = 0;
    while (refillCount < (curr.refillLimit || 1)) {
      const roadCardsAtDest = newRoad[nextPos] || [];
      const currentHandSets = findSets(hnd);
      const currentHandSynergy = evaluateHandSynergy(hnd);

      const fieldPick = roadCardsAtDest.reduce((best, card) => {
        const candidateSets = findSets([...hnd, card]);
        const candidateSynergy = evaluateHandSynergy([...hnd, card]);
        let val = 0;
        if (candidateSets.length > currentHandSets.length) {
          val = 100 + Math.max(...candidateSets.map(s => s.info.salt));
        } else if (candidateSynergy > currentHandSynergy) {
          val = 30 + (candidateSynergy - currentHandSynergy);
        }
        return val > best.value ? { card, value: val } : best;
      }, { card: null, value: -1 });

      const emptyBoxSlots = curr.boxes.filter(b => b.unlocked && !b.cargo && b.salt === 0).length;
      if (refillCount > 0 && findSets(hnd).length >= Math.max(1, emptyBoxSlots) && hnd.length >= HAND_LIMIT) break;

      if (fieldPick.card && fieldPick.value >= 30) {
        hnd = [...hnd, fieldPick.card];
        newRoad = newRoad.map((arr, i) => i === nextPos
          ? arr.filter(card => card.id !== fieldPick.card.id)
          : arr);
      } else {
        const res = drawSafe(1, newDeck, newDiscard, newRoad, [...allPlayerPos, nextPos], random);
        if (res.drawn.length === 0) break;
        hnd = [...hnd, ...res.drawn];
        newDeck = res.newDeck; newDiscard = res.newDiscard;
        newRoad = res.newRoad || newRoad;
      }
      refillCount++;
    }

    curr.pos = nextPos;
    curr.hand = hnd;
    state.deck = newDeck; state.discard = newDiscard; state.road = newRoad;

    // パッキング
    let bxs = [...curr.boxes];
    let refillLimit = curr.refillLimit || 1;
    while (true) {
      const sets = findSets(curr.hand);
      const emptyIdx = bxs.findIndex(b => b.unlocked && !b.cargo && b.salt === 0);
      if (sets.length > 0 && emptyIdx !== -1) {
        const s = sets[0];
        bxs[emptyIdx] = { ...bxs[emptyIdx], cargo: { ...s.info, cards: s.trio } };
        const ids = s.trio.map(c => c.id);
        curr.hand = curr.hand.filter(c => !ids.includes(c.id));
        tracking.setsFormed[state.turn]++;

        const drawRes = drawSafe(3, state.deck, state.discard, state.road, allPlayerPos, random);
        curr.hand = [...curr.hand, ...drawRes.drawn];
        state.deck = drawRes.newDeck; state.discard = drawRes.newDiscard;
        state.road = drawRes.newRoad || state.road;
      } else break;
    }

    // 施設アクション
    if (curr.pos === 0) {
      tracking.homeVisits[state.turn]++;
      const curTotSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0) + curr.pouchSalt;
      const keep = curr.strat.getKeepAmount(curr);
      const deliver = Math.max(0, curTotSalt - keep);
      curr.score += deliver;
      let rem = deliver;
      if (curr.pouchSalt >= rem) { curr.pouchSalt -= rem; rem = 0; }
      else { rem -= curr.pouchSalt; curr.pouchSalt = 0; }
      const loadedCount = bxs.filter(b => b.unlocked && b.cargo).length;
      const bulkBonusAmount = loadedCount >= 2 ? (loadedCount - 1) : 0;
      bxs = bxs.map(b => {
        if (rem > 0 && b.unlocked && b.salt > 0) {
          if (b.salt >= rem) { const sRem = b.salt - rem; rem = 0; return { ...b, salt: sRem }; }
          else { rem -= b.salt; return { ...b, salt: 0 }; }
        }
        return b;
      });
    } else if (curr.pos === PORT_TILE) {
      tracking.portVisits[state.turn]++;
      bxs = bxs.map(b => {
        if (b.unlocked && b.cargo) {
          const bonus = (b.flipped ? FLIP_BONUS : WOOD_BONUS) + (bulkBonusAmount || 0);
          const gain = b.cargo.salt + bonus;
          if (b.cargo.cards) state.discard.push(...b.cargo.cards);
          return { ...b, cargo: null, salt: gain };
        }
        return b;
      });
    } else if (GUILD_TILES.includes(curr.pos)) {
      const unflippedIdx = bxs.findIndex(b => b.unlocked && !b.flipped);
      const curTot = bxs.reduce((sum, b) => sum + (b.salt || 0), 0) + curr.pouchSalt;
      if (unflippedIdx !== -1 && curr.strat.shouldFlipBox(curr) && curTot >= FLIP_COST) {
        tracking.facilitySpendings[state.turn] += FLIP_COST;
        let needed = FLIP_COST;
        if (curr.pouchSalt >= needed) { curr.pouchSalt -= needed; needed = 0; }
        else { needed -= curr.pouchSalt; curr.pouchSalt = 0; }
        bxs = bxs.map(b => {
          if (needed > 0 && b.unlocked && b.salt > 0) {
            if (b.salt >= needed) { const rem = b.salt - needed; needed = 0; return { ...b, salt: rem }; }
            else { needed -= b.salt; return { ...b, salt: 0 }; }
          }
          return b;
        });
        bxs[unflippedIdx].flipped = true;
      }
    } else if (BOX_TILES.includes(curr.pos)) {
      const lockedIdx = bxs.findIndex(b => !b.unlocked);
      const curUnlockedCount = bxs.filter(b => b.unlocked).length;
      if (lockedIdx !== -1 && curUnlockedCount < 4 && curr.strat.shouldBuyBox(curr)) {
        const cost = BOX_COSTS[curUnlockedCount - 1];
        const curTot = bxs.reduce((sum, b) => sum + (b.salt || 0), 0) + curr.pouchSalt;
        if (curTot >= cost) {
          tracking.facilitySpendings[state.turn] += cost;
          let needed = cost;
          if (curr.pouchSalt >= needed) { curr.pouchSalt -= needed; needed = 0; }
          else { needed -= curr.pouchSalt; curr.pouchSalt = 0; }
          bxs = bxs.map(b => {
            if (needed > 0 && b.unlocked && b.salt > 0) {
              if (b.salt >= needed) { const rem = b.salt - needed; needed = 0; return { ...b, salt: rem }; }
              else { needed -= b.salt; return { ...b, salt: 0 }; }
            }
            return b;
          });
          bxs[lockedIdx].unlocked = true;
        }
      }
    } else if (REFILL_TILES.includes(curr.pos)) {
      // 仕入れ所: 塩2で補充上限を+1（最大3枚）
      const curTot = bxs.reduce((sum, b) => sum + (b.salt || 0), 0) + curr.pouchSalt;
      const wantsUpgrade = curr.strat.shouldUpgradeRefill ? curr.strat.shouldUpgradeRefill(curr) : true;
      if (refillLimit < MAX_REFILL && curTot >= REFILL_COST && wantsUpgrade) {
        tracking.facilitySpendings[state.turn] += REFILL_COST;
        refillLimit += 1;
        let needed = REFILL_COST;
        if (curr.pouchSalt >= needed) { curr.pouchSalt -= needed; needed = 0; }
        else { needed -= curr.pouchSalt; curr.pouchSalt = 0; }
        bxs = bxs.map(b => {
          if (needed > 0 && b.unlocked && b.salt > 0) {
            if (b.salt >= needed) { const rem = b.salt - needed; needed = 0; return { ...b, salt: rem }; }
            needed -= b.salt;
            return { ...b, salt: 0 };
          }
          return b;
        });
      }
    }

    // 手番の最後に手札を5枚以下へ整理し、余りは現在地の場に戻す。
    if (curr.hand.length > HAND_LIMIT) {
      const excess = curr.hand.length - HAND_LIMIT;
      const priorities = getCardDiscardPriorities(curr.hand);
      const returnIds = priorities.slice(0, excess).map(item => item.card.id);
      const toReturn = curr.hand.filter(card => returnIds.includes(card.id));
      curr.hand = curr.hand.filter(card => !returnIds.includes(card.id));
      state.road = state.road.map((arr, i) => i === curr.pos ? [...arr, ...toReturn] : arr);
    }

    curr.boxes = bxs;
    curr.refillLimit = refillLimit;

    // スコア履歴とリードチェンジ
    state.players.forEach((pl, i) => { tracking.scoreHistory[i].push(pl.score); });
    const currentLeader = [...state.players].sort((a, b) => b.score - a.score)[0].id;
    if (tracking.lastLeader !== -1 && currentLeader !== tracking.lastLeader) {
      tracking.leadChanges++;
    }
    tracking.lastLeader = currentLeader;

    if (curr.score >= WIN_SCORE && !state.finalRoundTriggered) {
      state.finalRoundTriggered = true;
    }

    // 最終ラウンド制: ラウンドの最後(P4の手番後)まで回す
    const nextTurn = (state.turn + 1) % 4;
    if (state.finalRoundTriggered && nextTurn === 0) {
      // 🔔 ラウンド完了。未納品の塩は得点にせず、通常どおり納品済み得点だけで判定する。
      state.gameOver = true;
      state.winners = state.players.filter(player => player.score === Math.max(...state.players.map(p => p.score)));
      state.winner = state.winners[0];
      break;
    }

    state.turn = nextTurn;
    turns++;
  }

  const winner = state.winner || state.players.reduce((p, c) => c.score > p.score ? c : p, state.players[0]);
  return {
    totalRounds: Math.ceil(turns / 4),
    winner,
    winners: state.winners || [winner],
    players: state.players,
    reachCount: state.players.filter(pl => pl.score >= WIN_SCORE - 3).length,
    tracking
  };
}

// ── 8軸評価関数 ──────────────────────────────────
function evaluateAll(gameCount = 3000, options = {}) {
  if (!Number.isInteger(gameCount) || gameCount <= 0) {
    throw new Error(`gameCount must be a positive integer: ${gameCount}`);
  }
  const random = typeof options.random === 'function'
    ? options.random
    : options.seed === undefined ? Math.random : createSeededRandom(options.seed);
  const silent = options.silent === true;
  const originalConsoleLog = console.log;
  if (silent) console.log = () => {};
  const stratKeys = ['adaptive', 'moreBoxes', 'qualityBoxes', 'fastShuttle'];
  const winCounts = { adaptive: 0, moreBoxes: 0, qualityBoxes: 0, fastShuttle: 0 };
  const seatWins = [0, 0, 0, 0]; // 座順別勝利

  let totalRounds = 0;
  let totalMargin1_2 = 0;
  let comebackWins = 0;
  let simultaneousReaches = 0;
  let totalFlippedBoxes = 0;
  let totalUnlockedBoxes = 0;
  let totalLeadChanges = 0;
  let totalDilemmaGap = 0;
  let totalDilemmaCount = 0;
  let totalViableOptions = 0;
  let totalCardContention = 0;
  let totalPathCollisions = 0;
  let totalSetsFormed = 0;
  let totalPortVisits = 0;
  let totalHomeVisits = 0;
  const roundList = [];
  const marginList = [];
  const leadChangeList = [];
  const dilemmaGapList = [];

  const startTime = Date.now();

  for (let g = 0; g < gameCount; g++) {
    const shuffledStrats = shuffle(stratKeys, random);
    const res = runTrackedMatch(shuffledStrats, random);
    const t = res.tracking;

    const winners = res.winners || [res.winner];
    const winShare = 1 / winners.length;
    winners.forEach(winner => {
      winCounts[winner.stratKey] += winShare;
      seatWins[winner.id] += winShare;
    });

    totalRounds += res.totalRounds;
    roundList.push(res.totalRounds);

    const sorted = [...res.players].sort((a, b) => b.score - a.score);
    const margin = sorted[0].score - sorted[1].score;
    totalMargin1_2 += margin;
    marginList.push(margin);

    if (t.midpointLeader !== null && !winners.some(winner => winner.id === t.midpointLeader)) comebackWins++;
    if (res.reachCount >= 2) simultaneousReaches++;

    res.players.forEach(pl => {
      totalFlippedBoxes += pl.boxes.filter(b => b.unlocked && b.flipped).length;
      totalUnlockedBoxes += pl.boxes.filter(b => b.unlocked).length;
    });

    totalLeadChanges += t.leadChanges;
    leadChangeList.push(t.leadChanges);

    t.dilemmaScores.forEach(d => {
      totalDilemmaGap += d.gap;
      totalViableOptions += d.viableOptions;
      totalDilemmaCount++;
    });
    if (t.dilemmaScores.length > 0) {
      dilemmaGapList.push(t.dilemmaScores.reduce((s, d) => s + d.gap, 0) / t.dilemmaScores.length);
    }

    totalCardContention += t.cardContention;
    totalPathCollisions += t.pathCollisions;

    t.setsFormed.forEach(n => totalSetsFormed += n);
    t.portVisits.forEach(n => totalPortVisits += n);
    t.homeVisits.forEach(n => totalHomeVisits += n);
  }

  const elapsed = (Date.now() - startTime) / 1000;

  // ── 指標計算 ──
  const avgRounds = totalRounds / gameCount;
  const avgMargin = totalMargin1_2 / gameCount;
  const comebackRate = (comebackWins / gameCount) * 100;
  const simReachRate = (simultaneousReaches / gameCount) * 100;
  const avgUnlockedBoxes = totalUnlockedBoxes / (gameCount * 4);
  const avgFlippedBoxes = totalFlippedBoxes / (gameCount * 4);
  const avgLeadChanges = totalLeadChanges / gameCount;
  const avgDilemmaGap = totalDilemmaCount > 0 ? totalDilemmaGap / totalDilemmaCount : 999;
  const avgViableOptions = totalDilemmaCount > 0 ? totalViableOptions / totalDilemmaCount : 1;
  const avgCardContention = totalCardContention / gameCount;
  const avgPathCollisions = totalPathCollisions / gameCount;
  const avgSetsFormed = totalSetsFormed / (gameCount * 4);
  const avgPortVisits = totalPortVisits / (gameCount * 4);
  const avgHomeVisits = totalHomeVisits / (gameCount * 4);

  const roundStdDev = Math.sqrt(roundList.reduce((acc, r) => acc + Math.pow(r - avgRounds, 2), 0) / gameCount);

  const winRates = {};
  stratKeys.forEach(k => { winRates[k] = (winCounts[k] / gameCount) * 100; });

  const seatWinRates = seatWins.map(w => (w / gameCount) * 100);
  const seatBias = Math.max(...seatWinRates) - Math.min(...seatWinRates);

  // ── ジニ係数 (戦略バランス) ──
  const rates = Object.values(winRates).sort((a, b) => a - b);
  const n = rates.length;
  const totalRate = rates.reduce((s, r) => s + r, 0);
  let giniSum = 0;
  rates.forEach((r, i) => { giniSum += (2 * (i + 1) - n - 1) * r; });
  const gini = totalRate > 0 ? giniSum / (n * totalRate) : 0;

  // ── 8軸スコアリング (各12.5点 = 100点満点) ──

  // 1. 接戦度 (12.5点)
  let scoreCloseness = 0;
  if (avgMargin <= 2.5) scoreCloseness += 5; else if (avgMargin <= 4.0) scoreCloseness += 4; else if (avgMargin <= 6.0) scoreCloseness += 3; else scoreCloseness += 1.5;
  if (comebackRate >= 35 && comebackRate <= 75) scoreCloseness += 4; else if (comebackRate >= 20) scoreCloseness += 2.5; else scoreCloseness += 1;
  if (simReachRate >= 20) scoreCloseness += 3.5; else if (simReachRate >= 10) scoreCloseness += 2.5; else if (simReachRate >= 5) scoreCloseness += 1.5; else scoreCloseness += 0.5;

  // 2. 戦略多様性 (12.5点)
  let scoreDiversity = 0;
  if (gini <= 0.05) scoreDiversity = 12.5;
  else if (gini <= 0.10) scoreDiversity = 10;
  else if (gini <= 0.15) scoreDiversity = 8;
  else if (gini <= 0.25) scoreDiversity = 5;
  else scoreDiversity = 2;

  // 3. テンポ (12.5点)
  let scorePacing = 0;
  if (avgRounds >= 10 && avgRounds <= 16) scorePacing += 7; else if (avgRounds >= 8 && avgRounds <= 20) scorePacing += 5; else scorePacing += 2;
  if (roundStdDev <= 2.5) scorePacing += 5.5; else if (roundStdDev <= 4.0) scorePacing += 4; else if (roundStdDev <= 6.0) scorePacing += 2.5; else scorePacing += 1;

  // 4. 成長・達成感 (12.5点)
  let scoreGrowth = 0;
  if (avgUnlockedBoxes >= 1.5) scoreGrowth += 5; else if (avgUnlockedBoxes >= 1.3) scoreGrowth += 4; else if (avgUnlockedBoxes >= 1.1) scoreGrowth += 3; else scoreGrowth += 1.5;
  if (avgFlippedBoxes >= 0.20) scoreGrowth += 4; else if (avgFlippedBoxes >= 0.10) scoreGrowth += 3; else if (avgFlippedBoxes >= 0.05) scoreGrowth += 2; else scoreGrowth += 1;
  if (avgSetsFormed >= 3.0) scoreGrowth += 3.5; else if (avgSetsFormed >= 2.0) scoreGrowth += 2.5; else if (avgSetsFormed >= 1.0) scoreGrowth += 1.5; else scoreGrowth += 0.5;

  // 5. 悩ましさ (12.5点)
  let scoreDilemma = 0;
  // 理想: 最善手と次善手の差が小さい(悩ましい) & 有効選択肢が多い
  if (avgDilemmaGap <= 50) scoreDilemma += 6; else if (avgDilemmaGap <= 100) scoreDilemma += 5; else if (avgDilemmaGap <= 200) scoreDilemma += 3.5; else scoreDilemma += 1.5;
  if (avgViableOptions >= 3.5) scoreDilemma += 6.5; else if (avgViableOptions >= 2.5) scoreDilemma += 5; else if (avgViableOptions >= 1.8) scoreDilemma += 3; else scoreDilemma += 1;

  // 6. ドラマ性 (12.5点)
  let scoreDrama = 0;
  if (avgLeadChanges >= 4) scoreDrama += 7; else if (avgLeadChanges >= 2.5) scoreDrama += 5.5; else if (avgLeadChanges >= 1.5) scoreDrama += 4; else scoreDrama += 2;
  // 逆転劇のタイミング（中盤リーダーが負ける率）
  const lateGameDrama = comebackRate;
  if (lateGameDrama >= 40) scoreDrama += 5.5; else if (lateGameDrama >= 25) scoreDrama += 4; else if (lateGameDrama >= 15) scoreDrama += 2.5; else scoreDrama += 1;

  // 7. 相互作用 (12.5点)
  let scoreInteraction = 0;
  if (avgCardContention >= 8) scoreInteraction += 6; else if (avgCardContention >= 4) scoreInteraction += 4.5; else if (avgCardContention >= 2) scoreInteraction += 3; else scoreInteraction += 1;
  if (avgPathCollisions >= 5) scoreInteraction += 6.5; else if (avgPathCollisions >= 3) scoreInteraction += 5; else if (avgPathCollisions >= 1) scoreInteraction += 3; else scoreInteraction += 1;

  // 8. 公平性 (12.5点)
  let scoreFairness = 0;
  if (seatBias <= 3) scoreFairness = 12.5;
  else if (seatBias <= 6) scoreFairness = 10;
  else if (seatBias <= 10) scoreFairness = 7;
  else if (seatBias <= 15) scoreFairness = 4;
  else scoreFairness = 2;

  const totalFunScore = Math.round(
    scoreCloseness + scoreDiversity + scorePacing + scoreGrowth +
    scoreDilemma + scoreDrama + scoreInteraction + scoreFairness
  );

  let grade = 'D (要改善)';
  if (totalFunScore >= 95)      grade = 'S+ (神ゲー・伝説級)';
  else if (totalFunScore >= 90) grade = 'S  (名作・完成度極高)';
  else if (totalFunScore >= 85) grade = 'A+ (極めて優秀)';
  else if (totalFunScore >= 80) grade = 'A  (高品質・良作)';
  else if (totalFunScore >= 75) grade = 'B+ (良好・わずかな改善余地)';
  else if (totalFunScore >= 70) grade = 'B  (良好)';
  else if (totalFunScore >= 60) grade = 'C  (平凡・改善推奨)';

  // ── 出力 ──────────────────────────────────────
  const bar = (val, max = 12.5) => {
    const filled = Math.round((val / max) * 20);
    return '█'.repeat(filled) + '░'.repeat(20 - filled);
  };

  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log(`║  🏆 【ナウキ運び 面白さ総合スコア】: ${String(totalFunScore).padStart(3)} / 100 点                    ║`);
  console.log(`║  🎖️  ランク: ${grade.padEnd(30)}                       ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  📊 【8軸面白さ評価 詳細スコア】');
  console.log('───────────────────────────────────────────────────────────────────────');

  const axes = [
    { label: '🔥 接戦度       ', score: scoreCloseness,  detail: `1-2位差: ${avgMargin.toFixed(1)}点 / 逆転率: ${comebackRate.toFixed(1)}% / 同時リーチ: ${simReachRate.toFixed(1)}%` },
    { label: '⚖️ 戦略多様性   ', score: scoreDiversity,  detail: `ジニ係数: ${gini.toFixed(3)} (0=完全均等)` },
    { label: '⚡ テンポ       ', score: scorePacing,     detail: `平均: ${avgRounds.toFixed(1)}巡 / 標準偏差: ±${roundStdDev.toFixed(2)}` },
    { label: '📦 成長・達成感 ', score: scoreGrowth,     detail: `荷箱: ${avgUnlockedBoxes.toFixed(2)} / 桐箱: ${avgFlippedBoxes.toFixed(2)} / 役: ${avgSetsFormed.toFixed(1)}回/人` },
    { label: '🧠 悩ましさ     ', score: scoreDilemma,    detail: `最善-次善差: ${avgDilemmaGap.toFixed(0)} / 有効選択肢: ${avgViableOptions.toFixed(1)}個/手番` },
    { label: '📈 ドラマ性     ', score: scoreDrama,      detail: `リードチェンジ: ${avgLeadChanges.toFixed(1)}回/試合` },
    { label: '🤝 相互作用     ', score: scoreInteraction, detail: `カード争奪: ${avgCardContention.toFixed(1)}回 / 経路競合: ${avgPathCollisions.toFixed(1)}回/試合` },
    { label: '🎯 公平性       ', score: scoreFairness,   detail: `座順バイアス: ${seatBias.toFixed(1)}% (最大-最小勝率差)` }
  ];

  axes.forEach(a => {
    console.log(`  ${a.label}: ${a.score.toFixed(1).padStart(5)} / 12.5  ${bar(a.score)}`);
    console.log(`                          └─ ${a.detail}`);
  });

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  🏆 【戦略別 勝率】');
  console.log('───────────────────────────────────────────────────────────────────────');
  Object.entries(winRates).forEach(([k, rate]) => {
    const barFill = '█'.repeat(Math.round(rate / 2));
    const name = STRATEGIES[k].name.padEnd(28);
    console.log(`  ${name}: ${rate.toFixed(1).padStart(5)}%  ${barFill}`);
  });

  console.log('');
  console.log('  📍 座順別勝率:');
  seatWinRates.forEach((rate, i) => {
    console.log(`    P${i + 1} (${i === 0 ? '先手' : i === 3 ? '後手' : `${i+1}番手`}): ${rate.toFixed(1).padStart(5)}%  ${'█'.repeat(Math.round(rate / 2))}`);
  });

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  📋 【ゲーム循環分析】');
  console.log('───────────────────────────────────────────────────────────────────────');
  console.log(`  🚢 平均港訪問: ${avgPortVisits.toFixed(2)}回/人 / 🏡 平均帰還: ${avgHomeVisits.toFixed(2)}回/人`);
  console.log(`  🎴 平均役完成: ${avgSetsFormed.toFixed(2)}回/人 / 🔄 平均決着: ${avgRounds.toFixed(1)}巡`);
  console.log(`  ⏱️ 実行時間: ${elapsed.toFixed(2)}秒 (${Math.round(gameCount / elapsed)} 試合/秒)`);
  console.log('');

  // ── デザイナー向け考察 ──
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  💡 【ゲームデザイナー向け考察】');
  console.log('───────────────────────────────────────────────────────────────────────');

  const insights = [];

  if (scoreCloseness >= 10) insights.push('  ✅ 接戦度が高く、最後まで勝敗が分からないスリルがある。');
  else if (scoreCloseness < 7) insights.push('  ⚠️ 接戦度が低い。勝利条件や得点機会の調整で改善可能。');

  if (scoreDiversity >= 10) insights.push('  ✅ 全戦略が拮抗し、多様なプレイスタイルが成立する。');
  else if (scoreDiversity < 7) insights.push('  ⚠️ 特定戦略に偏り。弱い戦略の強化 or 強い戦略のナーフを検討。');

  if (scorePacing >= 10) insights.push('  ✅ テンポが快適。15〜20分の理想的なプレイ時間に収まる。');
  else if (scorePacing < 7) insights.push('  ⚠️ テンポに問題。ゲーム長が不安定 or 長すぎ/短すぎ。');

  if (scoreGrowth >= 10) insights.push('  ✅ エンジンビルドの達成感が十分。荷箱・桐箱の成長が体感できる。');
  else if (scoreGrowth < 7) insights.push('  ⚠️ 成長実感が薄い。施設コストの引き下げや報酬の増加を検討。');

  if (scoreDilemma >= 10) insights.push('  ✅ 毎手番で悩ましい選択がある。意思決定の質が高い。');
  else if (scoreDilemma < 7) insights.push('  ⚠️ 最善手が明白すぎる。選択肢間のトレードオフを強化すべき。');

  if (scoreDrama >= 10) insights.push('  ✅ ドラマチックな展開が頻出。リードチェンジが自然に起こる。');
  else if (scoreDrama < 7) insights.push('  ⚠️ 展開が単調。キャッチアップ機構の導入を検討。');

  if (scoreInteraction >= 10) insights.push('  ✅ プレイヤー間の相互作用が豊か。カード争奪が戦略に深みを加える。');
  else if (scoreInteraction < 7) insights.push('  ⚠️ ソロプレイ感が強い。他プレイヤーとの絡みを増やす仕組みを検討。');

  if (scoreFairness >= 10) insights.push('  ✅ 座順の公平性が高い。先手/後手の有利不利がほぼない。');
  else if (scoreFairness < 7) insights.push('  ⚠️ 座順バイアスが大きい。後手への補償ルールを検討。');

  if (insights.length === 0) {
    insights.push('  📊 全体的にバランスの取れた設計です。');
  }
  insights.forEach(i => console.log(i));

  if (totalFunScore >= 85) {
    console.log('');
    console.log('  🌟 総評: 8軸すべてにおいて高水準。ルールのシンプルさと');
    console.log('     戦略の奥深さが見事に両立した完成度の高いゲームデザインです。');
  }

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');

  const result = {
    totalFunScore, grade,
    axes: axes.map(a => ({ label: a.label.trim(), score: a.score, detail: a.detail })),
    winRates, seatWinRates, avgRounds, roundStdDev, gini,
    avgMargin, comebackRate, simReachRate,
    avgLeadChanges, avgDilemmaGap, avgViableOptions,
    avgCardContention, avgPathCollisions,
    avgUnlockedBoxes, avgFlippedBoxes, avgSetsFormed,
    avgPortVisits, avgHomeVisits,
    seatBias, elapsed, gameCount
  };

  if (silent) console.log = originalConsoleLog;
  return result;
}

// CLIでもライブラリでも使えるようにする。
if (typeof module !== 'undefined') {
  module.exports = {
    CARD_TEMPLATES,
    STRATEGIES,
    createDeck,
    evalSet,
    findSets,
    runTrackedMatch,
    evaluateAll,
    createSeededRandom
  };
}

if (typeof require !== 'undefined' && require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
  };
  const gameCount = Number(getArg('--games', '3000'));
  const seedValue = getArg('--seed', undefined);
  const json = args.includes('--json');
  const result = evaluateAll(gameCount, { seed: seedValue, silent: json });
  if (json) console.log(JSON.stringify(result));
}
