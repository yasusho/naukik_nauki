/**
 * 『ナウキ運び』面白さ評価システム (Game Fun & Balance Evaluator)
 * ※純粋デッキ・スリムルール・完全荷箱積載輸送モデル
 */

const CARD_TEMPLATES = {
  tea: [
    { num: 1, salt: 2 }, { num: 2, salt: 1 }, { num: 3, salt: 1 }, { num: 4, salt: 1 }, { num: 5, salt: 2 },
  ],
  rice: [
    { num: 1, salt: 2 }, { num: 2, salt: 1 }, { num: 3, salt: 1 }, { num: 4, salt: 1 }, { num: 5, salt: 2 },
  ],
  cloth: [
    { num: 1, salt: 2 }, { num: 2, salt: 1 }, { num: 3, salt: 1 }, { num: 4, salt: 1 }, { num: 5, salt: 2 },
  ]
};

const HAND_LIMIT = 5;
const WIN_SCORE = 15;          // 目標15点
const BOX_COSTS = [2, 2, 2];   // 2箱目=2塩, 3箱目=2塩, 4箱目=2塩 (初期1箱所持)
const FLIP_COST = 2;           // 桐箱化=2塩 (2塩均一！)
const WOOD_BONUS = 0;          // 木箱出荷: 素点そのまま！
const FLIP_BONUS = 2;          // 特製桐箱高級出荷: 素点 + 2塩！

const BOX_TILES = [1, 7];
const PORT_TILE = 5;
const GUILD_TILES = [3, 9];
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
        } else break;
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

  // 同色のみ (①同色刻子 ②同色順子)
  if (types[0] === types[1] && types[1] === types[2]) {
    const t = types[0];
    if (nums[0] === nums[1] && nums[1] === nums[2]) {
      return { name: `${t} ${nums[0]}×3 (刻子)`, salt: baseSalt, isTriplet: true, cards, type: t };
    }
    if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2]) {
      return { name: `${t} ${nums[0]}-${nums[2]} (順子)`, salt: baseSalt, isTriplet: false, cards, type: t };
    }
  }

  return null;
}

function findSets(hand) {
  const list = [];
  if (!hand || hand.length < 3) return list;
  const n = hand.length;
  const seen = new Set();
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const trio = [hand[i], hand[j], hand[k]];
        const r = evalSet(trio);
        if (r) {
          const patternKey = `${r.name}:s${r.salt}`;
          if (!seen.has(patternKey)) {
            seen.add(patternKey);
            list.push({ trio, info: r });
          }
        }
      }
    }
  }
  return list;
}

function getCardDiscardPriorities(hand) {
  if (!hand || hand.length === 0) return [];
  const currentSets = findSets(hand);
  const currentBestValue = currentSets.length > 0 ? Math.max(...currentSets.map(s => s.info.salt)) : 0;
  return hand.map((card, idx) => {
    const remainingHand = hand.filter((_, i) => i !== idx);
    const newSets = findSets(remainingHand);
    const newBestValue = newSets.length > 0 ? Math.max(...newSets.map(s => s.info.salt)) : 0;
    const loss = currentBestValue - newBestValue;
    return { card, idx, loss };
  }).sort((a, b) => a.loss - b.loss);
}

// 4大戦略 (初期1箱・スリムモデル)
const STRATEGIES = {
  adaptive: {
    name: '適応型 (Adaptive)',
    shouldBuyBox: (curr) => curr.boxes.filter(b => b.unlocked).length < 3 && curr.score < WIN_SCORE - 3,
    shouldFlipBox: (curr) => curr.score < WIN_SCORE - 2,
    getKeepAmount: (curr) => {
      const u = curr.boxes.filter(b => b.unlocked).length;
      if (u < 3 && curr.score < WIN_SCORE - 3) return BOX_COSTS[u - 1];
      const unflipped = curr.boxes.find(b => b.unlocked && !b.flipped);
      if (unflipped && curr.score < WIN_SCORE - 2) return FLIP_COST;
      return 0;
    }
  },
  moreBoxes: {
    name: '荷箱増設特化 (More Boxes)',
    shouldBuyBox: (curr) => curr.boxes.filter(b => b.unlocked).length < 4 && curr.score < WIN_SCORE - 2,
    shouldFlipBox: (curr) => curr.boxes.filter(b => b.unlocked).length >= 3 && curr.score < WIN_SCORE - 2,
    getKeepAmount: (curr) => {
      const u = curr.boxes.filter(b => b.unlocked).length;
      if (u < 4 && curr.score < WIN_SCORE - 2) return BOX_COSTS[u - 1];
      return 0;
    }
  },
  qualityBoxes: {
    name: '桐箱強化特化 (Quality Boxes)',
    shouldBuyBox: (curr) => curr.boxes.filter(b => b.unlocked).length < 2 && curr.score < WIN_SCORE - 2,
    shouldFlipBox: (curr) => curr.score < WIN_SCORE - 2,
    getKeepAmount: (curr) => {
      const unflipped = curr.boxes.find(b => b.unlocked && !b.flipped);
      if (unflipped && curr.score < WIN_SCORE - 2) return FLIP_COST;
      return 0;
    }
  },
  fastShuttle: {
    name: '快速便・ピストン輸送 (Fast Shuttle)',
    shouldBuyBox: (curr) => curr.boxes.filter(b => b.unlocked).length < 2 && curr.score < WIN_SCORE - 3,
    shouldFlipBox: (curr) => false,
    getKeepAmount: (curr) => {
      const u = curr.boxes.filter(b => b.unlocked).length;
      if (u < 2 && curr.score < WIN_SCORE - 3) return BOX_COSTS[u - 1];
      return 0;
    }
  }
};

function runEvaluationMatch(stratKeys = ['adaptive', 'moreBoxes', 'qualityBoxes', 'fastShuttle']) {
  const d = createDeck();
  const players = stratKeys.map((k, i) => ({
    id: i,
    stratKey: k,
    strat: STRATEGIES[k],
    pos: 0,
    hand: d.splice(0, HAND_LIMIT),
    boxes: [
      { unlocked: true, flipped: false, cargo: null, salt: 0 },  // 1箱目のみ初期所持
      { unlocked: false, flipped: false, cargo: null, salt: 0 }, // 2箱目
      { unlocked: false, flipped: false, cargo: null, salt: 0 }, // 3箱目
      { unlocked: false, flipped: false, cargo: null, salt: 0 }  // 4箱目
    ],
    pouchSalt: 0,
    score: 0
  }));

  const road = Array(10).fill(null).map(() => [d.shift()]);
  const state = {
    deck: d,
    discard: [],
    road,
    players,
    turn: 0,
    step: 1,
    gameOver: false,
    winner: null,
    totalRounds: 0,
    leaderAtMidpoint: null,
    midpointRecorded: false,
    reachCountAtEndgame: 0
  };

  let turns = 0;
  const maxTurns = 80;

  while (!state.gameOver && turns < maxTurns) {
    const curr = state.players[state.turn];
    const allPlayerPos = state.players.map(pl => pl.pos);

    const currentRound = Math.floor(turns / 4) + 1;
    if (currentRound >= 3 && !state.midpointRecorded) {
      const topPl = [...state.players].sort((a, b) => b.score - a.score)[0];
      state.leaderAtMidpoint = topPl.id;
      state.midpointRecorded = true;
    }

    if (curr.hand.length === 0) {
      const res = drawSafe(HAND_LIMIT, state.deck, state.discard, state.road, allPlayerPos);
      curr.hand = res.drawn;
      state.deck = res.newDeck;
      state.discard = res.newDiscard;
      state.road = res.newRoad || state.road;
      if (curr.hand.length === 0) {
        state.turn = (state.turn + 1) % 4;
        turns++;
        continue;
      }
    }

    // Step 1: 移動決定
    const priorities = getCardDiscardPriorities(curr.hand);
    const totalSalt = curr.boxes.reduce((s, b) => s + (b.salt || 0), 0) + curr.pouchSalt;
    const hasSalt = totalSalt > 0;
    const loadedBoxes = curr.boxes.filter(b => b.unlocked && b.cargo).length;
    const emptyBoxes = curr.boxes.filter(b => b.unlocked && !b.cargo && b.salt === 0).length;
    const unflipped = curr.boxes.find(b => b.unlocked && !b.flipped);
    const unlockedBoxes = curr.boxes.filter(b => b.unlocked);

    let bestScore = -99999;
    let bestIdx = 0;

    curr.hand.forEach((c, idx) => {
      const pInfo = priorities.find(p => p.idx === idx);
      const baseLoss = pInfo ? pInfo.loss : 50;
      const target = (curr.pos + c.num) % 10;
      let score = (100 - baseLoss) * 0.9;

      if (target === 0) {
        if (hasSalt) {
          score += 550 + totalSalt * 80;
          if (curr.score + totalSalt >= WIN_SCORE) score += 30000;
        } else score -= 30;
      } else if (target === PORT_TILE) {
        if (loadedBoxes > 0) score += 550 + loadedBoxes * 160;
        else score -= 40;
      } else if (BOX_TILES.includes(target) && unlockedBoxes.length < 4) {
        const cost = BOX_COSTS[unlockedBoxes.length - 1];
        if (curr.strat.shouldBuyBox(curr) && totalSalt >= cost) score += 620;
      } else if (GUILD_TILES.includes(target) && unflipped) {
        if (curr.strat.shouldFlipBox(curr) && totalSalt >= FLIP_COST) score += 640;
      }

      const roadCards = state.road[target] || [];
      if (roadCards.length > 0) {
        score += roadCards.length * (emptyBoxes > 0 ? 35 : 10);
      }

      if (loadedBoxes > 0 && !hasSalt) {
        const distToPort = (PORT_TILE - target + 10) % 10;
        if (target <= PORT_TILE) score += (5 - distToPort) * 45;
      }
      if (hasSalt) {
        const distToHome = (10 - target) % 10;
        if (target >= PORT_TILE || target === 0) score += (10 - distToHome) * 50;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    const chosenCard = curr.hand[bestIdx] || curr.hand[0];
    const nextPos = (curr.pos + chosenCard.num) % 10;
    const tempRoad = state.road.map((arr, i) => i === curr.pos ? [...arr, chosenCard] : arr);
    let hnd = curr.hand.filter((_, idx) => idx !== bestIdx);

    let newDeck = state.deck;
    let newDiscard = state.discard;
    let newRoad = tempRoad;

    // Step 2: 補充
    const roadCardsAtDest = tempRoad[nextPos] || [];
    if (roadCardsAtDest.length > 0) {
      const combined = [...hnd, ...roadCardsAtDest];
      newRoad = tempRoad.map((arr, i) => i === nextPos ? [] : arr);
      hnd = combined;

      // 荷積み
      let bxs = [...curr.boxes];
      while (true) {
        const sets = findSets(hnd);
        const emptyIdx = bxs.findIndex(b => b.unlocked && !b.cargo && b.salt === 0);
        if (sets.length > 0 && emptyIdx !== -1) {
          const s = sets[0];
          bxs[emptyIdx] = { ...bxs[emptyIdx], cargo: { ...s.info, cards: s.trio } };
          const ids = s.trio.map(c => c.id);
          hnd = hnd.filter(c => !ids.includes(c.id));

          const drawRes = drawSafe(3, newDeck, newDiscard, newRoad, allPlayerPos);
          hnd = [...hnd, ...drawRes.drawn];
          newDeck = drawRes.newDeck;
          newDiscard = drawRes.newDiscard;
          newRoad = drawRes.newRoad || newRoad;
        } else break;
      }

      if (hnd.length > HAND_LIMIT) {
        const excess = hnd.length - HAND_LIMIT;
        const discPriorities = getCardDiscardPriorities(hnd);
        const returnIds = discPriorities.slice(0, excess).map(p => p.card.id);
        const toReturn = hnd.filter(c => returnIds.includes(c.id));
        hnd = hnd.filter(c => !returnIds.includes(c.id));
        newRoad = newRoad.map((arr, i) => i === nextPos ? toReturn : arr);
      }
    } else {
      const needed = Math.max(0, HAND_LIMIT - hnd.length);
      const res = drawSafe(needed, newDeck, newDiscard, newRoad, [...allPlayerPos, nextPos]);
      hnd = [...hnd, ...res.drawn];
      newDeck = res.newDeck;
      newDiscard = res.newDiscard;
      newRoad = res.newRoad || newRoad;
    }

    curr.pos = nextPos;
    curr.hand = hnd;
    state.deck = newDeck;
    state.discard = newDiscard;
    state.road = newRoad;

    // パッキング
    let bxs = [...curr.boxes];
    while (true) {
      const sets = findSets(curr.hand);
      const emptyIdx = bxs.findIndex(b => b.unlocked && !b.cargo && b.salt === 0);
      if (sets.length > 0 && emptyIdx !== -1) {
        const s = sets[0];
        bxs[emptyIdx] = { ...bxs[emptyIdx], cargo: { ...s.info, cards: s.trio } };
        const ids = s.trio.map(c => c.id);
        curr.hand = curr.hand.filter(c => !ids.includes(c.id));

        const drawRes = drawSafe(3, state.deck, state.discard, state.road, allPlayerPos);
        curr.hand = [...curr.hand, ...drawRes.drawn];
        state.deck = drawRes.newDeck;
        state.discard = drawRes.newDiscard;
        state.road = drawRes.newRoad || state.road;
      } else break;
    }

    // 施設アクション
    if (curr.pos === 0) {
      const curTotSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0) + curr.pouchSalt;
      const keep = curr.strat.getKeepAmount(curr);
      const deliver = Math.max(0, curTotSalt - keep);
      curr.score += deliver;

      let rem = deliver;
      if (curr.pouchSalt >= rem) { curr.pouchSalt -= rem; rem = 0; }
      else { rem -= curr.pouchSalt; curr.pouchSalt = 0; }
      bxs = bxs.map(b => {
        if (rem > 0 && b.unlocked && b.salt > 0) {
          if (b.salt >= rem) { const sRem = b.salt - rem; rem = 0; return { ...b, salt: sRem }; }
          else { rem -= b.salt; return { ...b, salt: 0 }; }
        }
        return b;
      });
    } else if (curr.pos === PORT_TILE) {
      // 港: 木箱は素点そのまま, 桐箱は素点+2塩
      bxs = bxs.map(b => {
        if (b.unlocked && b.cargo) {
          const bonus = b.flipped ? FLIP_BONUS : WOOD_BONUS;
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
    }

    curr.boxes = bxs;

    if (curr.score >= WIN_SCORE) {
      state.gameOver = true;
      state.winner = curr;
      break;
    }

    state.turn = (state.turn + 1) % 4;
    turns++;
  }

  state.totalRounds = Math.ceil(turns / 4);
  state.reachCountAtEndgame = state.players.filter(pl => pl.score >= WIN_SCORE - 3).length;

  return state;
}

function evaluate(gameCount = 3000) {
  const stratKeys = ['adaptive', 'moreBoxes', 'qualityBoxes', 'fastShuttle'];
  const winCounts = { adaptive: 0, moreBoxes: 0, qualityBoxes: 0, fastShuttle: 0 };

  let totalRounds = 0;
  let totalMargin1st2nd = 0;
  let comebackWins = 0;
  let simultaneousReaches = 0;
  let totalFlippedBoxes = 0;
  let totalUnlockedBoxes = 0;
  const roundList = [];

  for (let g = 0; g < gameCount; g++) {
    const shuffledStrats = [...stratKeys].sort(() => Math.random() - 0.5);
    const res = runEvaluationMatch(shuffledStrats);

    const winner = res.winner || res.players.reduce((p, c) => c.score > p.score ? c : p, res.players[0]);
    winCounts[winner.stratKey]++;

    totalRounds += res.totalRounds;
    roundList.push(res.totalRounds);

    const sortedPlayers = [...res.players].sort((a, b) => b.score - a.score);
    const margin1_2 = sortedPlayers[0].score - sortedPlayers[1].score;
    totalMargin1st2nd += margin1_2;

    if (res.leaderAtMidpoint !== null && res.leaderAtMidpoint !== winner.id) comebackWins++;
    if (res.reachCountAtEndgame >= 2) simultaneousReaches++;

    res.players.forEach(pl => {
      totalFlippedBoxes += pl.boxes.filter(b => b.unlocked && b.flipped).length;
      totalUnlockedBoxes += pl.boxes.filter(b => b.unlocked).length;
    });
  }

  const avgRounds = totalRounds / gameCount;
  const avgMargin1_2 = totalMargin1st2nd / gameCount;
  const comebackRate = (comebackWins / gameCount) * 100;
  const simultaneousReachRate = (simultaneousReaches / gameCount) * 100;

  const avgUnlockedBoxes = totalUnlockedBoxes / (gameCount * 4);
  const avgFlippedBoxes = totalFlippedBoxes / (gameCount * 4);

  const roundVariance = roundList.reduce((acc, r) => acc + Math.pow(r - avgRounds, 2), 0) / gameCount;
  const roundStdDev = Math.sqrt(roundVariance);

  const winRates = {};
  stratKeys.forEach(k => {
    winRates[k] = (winCounts[k] / gameCount) * 100;
  });

  // スコアリング (スリム版 100点満点)
  let scoreDrama = 0;
  if (avgMargin1_2 <= 3.5) scoreDrama += 9; else if (avgMargin1_2 <= 5.5) scoreDrama += 7.5; else scoreDrama += 5.0;
  if (comebackRate >= 35 && comebackRate <= 75) scoreDrama += 9; else scoreDrama += 6;
  if (simultaneousReachRate >= 15) scoreDrama += 7; else if (simultaneousReachRate >= 8) scoreDrama += 5; else scoreDrama += 3;

  let scoreDiversity = 25;
  stratKeys.forEach(k => {
    const diff = Math.abs(winRates[k] - 25);
    if (diff > 15) scoreDiversity -= 5;
    else if (diff > 10) scoreDiversity -= 3;
    else if (diff > 5) scoreDiversity -= 1.2;
  });
  scoreDiversity = Math.max(0, Math.min(25, scoreDiversity));

  let scorePacing = 0;
  if (avgRounds >= 11 && avgRounds <= 16) scorePacing += 15;
  else if (avgRounds >= 9 && avgRounds <= 19) scorePacing += 12;
  else scorePacing += 7;

  if (roundStdDev <= 3.0) scorePacing += 10;
  else if (roundStdDev <= 4.5) scorePacing += 8;
  else scorePacing += 5;

  let scoreEngine = 0;
  if (avgUnlockedBoxes >= 1.4) scoreEngine += 12; else if (avgUnlockedBoxes >= 1.2) scoreEngine += 9; else scoreEngine += 6;
  if (avgFlippedBoxes >= 0.15) scoreEngine += 13; else if (avgFlippedBoxes >= 0.08) scoreEngine += 10; else scoreEngine += 6;

  const totalFunScore = Math.round(scoreDrama + scoreDiversity + scorePacing + scoreEngine);

  let grade = 'C';
  if (totalFunScore >= 90) grade = 'S (神ゲー領域)';
  else if (totalFunScore >= 80) grade = 'A (極めて高評価・良作)';
  else if (totalFunScore >= 70) grade = 'B (良好・微調整余地あり)';

  console.log(`\n=============================================================`);
  console.log(`🏆 【面白さ総合スコア】: ${totalFunScore} / 100 点  [ ランク: ${grade} ]`);
  console.log(`=============================================================\n`);

  console.log('📊 【4大指標スコア内訳】');
  console.log(`  1. 🔥 接戦・ドラマ性         : ${scoreDrama.toFixed(1)} / 25 点 (平均1-2位差: ${avgMargin1_2.toFixed(1)}点 / 逆転劇: ${comebackRate.toFixed(1)}% / 同時リーチ: ${simultaneousReachRate.toFixed(1)}%)`);
  console.log(`  2. ⚖️ 戦略の多様性・バランス : ${scoreDiversity.toFixed(1)} / 25 点`);
  Object.entries(winRates).forEach(([k, rate]) => {
    const bar = '█'.repeat(Math.round(rate / 2));
    console.log(`     * ${STRATEGIES[k].name.padEnd(26, ' ')}: ${rate.toFixed(1).padStart(5, ' ')}%  ${bar}`);
  });
  console.log(`  3. ⚡ テンポ・収束性         : ${scorePacing.toFixed(1)} / 25 点 (平均決着: ${avgRounds.toFixed(1)}周回 / 偏差: ±${roundStdDev.toFixed(2)})`);
  console.log(`  4. 📦 成長・達成感           : ${scoreEngine.toFixed(1)} / 25 点 (平均荷箱: ${avgUnlockedBoxes.toFixed(2)}箱 / 特製桐箱: ${avgFlippedBoxes.toFixed(2)}箱)`);

  console.log('\n💡 【ゲームデザイナー向け総評・考察】');
  if (totalFunScore >= 90) {
    console.log('  ✨ 冗長なルールを削ぎ落とし、カードの素点と荷箱育成のピュアな面白さが際立つSランク設計です。');
    console.log('  ✨ 4大戦略（適応／増設／桐箱／快速便）がすべて拮抗し、初心者から熟練者まで直感的に楽しめます。');
  }
  console.log('=============================================================\n');
}

evaluate(3000);
