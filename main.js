const { useState, useEffect, useMemo, createElement: h } = React;

const GOODS = {
  tea: { name: '茶', icon: '🍵', chip: 'chip-tea', card: 'card-tea' },
  rice: { name: '米', icon: '🌾', chip: 'chip-rice', card: 'card-rice' },
  cloth: { name: '布', icon: '🧵', chip: 'chip-cloth', card: 'card-cloth' },
};

// 2-1-1-1-2 (端牌=2塩, 中張牌=1塩)
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

// 10マス完全交互配置: 0地元 ➔ 1箱屋 ➔ 2仕入れ所 ➔ 3会所 ➔ 4街道 ➔ 5港 ➔ 6街道 ➔ 7箱屋 ➔ 8仕入れ所 ➔ 9会所
const TILES = [
  { pos: 0, name: '地元', icon: '🏡', isFacility: true, short: '納品・手当', costText: '箱数手当+納品' },
  { pos: 1, name: '箱屋', icon: '🛖', isFacility: true, short: '増設', costText: '箱増設: 1・2・3塩' },
  { pos: 2, name: '仕入れ所', icon: '🧺', isFacility: true, short: '補充強化', costText: '補充上限+1: 2塩' },
  { pos: 3, name: '会所', icon: '🏛️', isFacility: true, short: '強化', costText: '高級箱化: 2塩' },
  { pos: 4, name: '街道', icon: '🛣️', isFacility: false },
  { pos: 5, name: '港',   icon: '⚓', isFacility: true, short: '換金', costText: '木箱:素点 / 高級箱:素点+3塩🔥' },
  { pos: 6, name: '街道', icon: '🛣️', isFacility: false },
  { pos: 7, name: '箱屋', icon: '🛖', isFacility: true, short: '増設', costText: '箱増設: 1・2・3塩' },
  { pos: 8, name: '仕入れ所', icon: '🧺', isFacility: true, short: '補充強化', costText: '補充上限+1: 2塩' },
  { pos: 9, name: '会所', icon: '🏛️', isFacility: true, short: '強化', costText: '高級箱化: 2塩' },
];

const PLAYERS_DEF = [
  { name: 'あなた', color: '#c53030', isHuman: true },
  { name: 'BOT1', color: '#2b6cb0', isHuman: false },
  { name: 'BOT2', color: '#2f855a', isHuman: false },
  { name: 'BOT3', color: '#6b46c1', isHuman: false }
];

const HAND_LIMIT = 5;          // 手札5枚固定
const WIN_SCORE = 20;          // 目標20点 (充実の2〜3周回エンジンビルド！)
const BOX_COSTS = [1, 2, 3];   // 2箱目: 1塩, 3箱目: 2塩, 4箱目: 3塩 (初期1箱所持)
const FLIP_COST = 2;           // 高級箱化コスト: 2塩
const FLIP_BONUS = 3;          // 高級箱出荷ボーナス: 素点 + 3塩
const REFILL_TILES = [2, 8];   // 仕入れ所: 補充上限を強化
const REFILL_COST = 2;         // 補充上限+1のコスト
const MAX_REFILL = 3;          // 補充上限は最大3枚
const CARD_COPIES = 4;         // 各数字4枚（3色×5数字×4枚 ＝ 60枚の純粋デッキ）

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

// 3枚セットの判定 (同色のみ: ①同色順子 ②同色刻子)
function evalSet(cards) {
  if (!cards || cards.length !== 3) return null;
  const types = cards.map(c => c.type);
  const nums = cards.map(c => c.num).sort((a, b) => a - b);
  const baseSalt = cards.reduce((s, c) => s + c.salt, 0);

  // 同色のみ
  if (types[0] === types[1] && types[1] === types[2]) {
    const t = types[0];
    const g = GOODS[t];
    if (nums[0] === nums[1] && nums[1] === nums[2]) {
      return {
        name: `${g.icon}${g.name} ${nums[0]}×3 (刻子)`,
        shortName: `${g.icon}${nums[0]}×3`,
        salt: baseSalt,
        isTriplet: true,
        cards,
        type: t
      };
    }
    if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2]) {
      return {
        name: `${g.icon}${g.name} ${nums[0]}-${nums[2]} (順子)`,
        shortName: `${g.icon}${nums[0]}-${nums[2]}`,
        salt: baseSalt,
        isTriplet: false,
        cards,
        type: t
      };
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
          const patternKey = `${r.name}:s${r.salt}`;
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

function getPlayerTotalSalt(player) {
  if (!player) return 0;
  const boxesSalt = (player.boxes || []).reduce((sum, b) => sum + (b.unlocked ? (b.salt || 0) : 0), 0);
  return boxesSalt + (player.pouchSalt || 0);
}

function deductPlayerSalt(player, cost) {
  if (!player || getPlayerTotalSalt(player) < cost) return { newBoxes: player.boxes, newPouch: player.pouchSalt, success: false };
  let remaining = cost;
  let newPouch = player.pouchSalt || 0;

  if (newPouch >= remaining) {
    newPouch -= remaining;
    remaining = 0;
  } else {
    remaining -= newPouch;
    newPouch = 0;
  }

  const newBoxes = player.boxes.map(b => {
    if (remaining > 0 && b.unlocked && b.salt > 0) {
      if (b.salt >= remaining) {
        const updatedSalt = b.salt - remaining;
        remaining = 0;
        return { ...b, salt: updatedSalt };
      } else {
        remaining -= b.salt;
        return { ...b, salt: 0 };
      }
    }
    return b;
  });

  return { newBoxes, newPouch, success: true };
}

function initGame() {
  const d = createDeck();
  const players = PLAYERS_DEF.map((def, i) => ({
    id: i,
    name: def.name,
    color: def.color,
    pos: 0,
    hand: d.splice(0, HAND_LIMIT),
    boxes: [
      { unlocked: true, flipped: false, cargo: null, salt: 0 },  // 1箱目 (初期所持)
      { unlocked: false, flipped: false, cargo: null, salt: 0 }, // 2箱目 (箱屋で2塩で増設)
      { unlocked: false, flipped: false, cargo: null, salt: 0 }, // 3箱目 (箱屋で3塩で増設)
      { unlocked: false, flipped: false, cargo: null, salt: 0 }  // 4箱目 (箱屋で4塩で増設)
    ],
    pouchSalt: 0,
    score: 0,
    refillLimit: 1
  }));
  const road = Array(10).fill(null).map(() => [d.shift()]);
  return {
    deck: d,
    discard: [],
    road,
    players,
    turn: 0,
    step: 1, // 1: 移動, 3: 行動, 4: 返却
    gameOver: false,
    finalRoundTriggered: false, // 15点到達後、4番手の手番終了まで続行
    refillCount: 0,
    excessCount: 0
  };
}

function App() {
  const [state, setState] = useState(initGame);
  const [overflowSelectedIds, setOverflowSelectedIds] = useState([]);
  const [selectedHandIds, setSelectedHandIds] = useState([]);

  const p = state.players[state.turn];
  const isHuman = (state.turn === 0);
  const me = state.players[0];

  const myTotalSalt = useMemo(() => getPlayerTotalSalt(me), [me]);
  const mySets = useMemo(() => findSets(me.hand), [me.hand]);

  const unlockedBoxes = useMemo(() => me.boxes.filter(b => b.unlocked), [me.boxes]);
  const emptyBoxesCount = useMemo(() => me.boxes.filter(b => b.unlocked && !b.cargo && b.salt === 0).length, [me.boxes]);
  const loadedBoxesCount = useMemo(() => me.boxes.filter(b => b.unlocked && b.cargo).length, [me.boxes]);
  const unflippedBoxesCount = useMemo(() => me.boxes.filter(b => b.unlocked && !b.flipped).length, [me.boxes]);
  
  const nextBoxCost = useMemo(() => {
    if (unlockedBoxes.length >= 4) return null;
    return BOX_COSTS[unlockedBoxes.length - 1];
  }, [unlockedBoxes.length]);

  const selectedCards = useMemo(() => {
    return me.hand.filter(c => selectedHandIds.includes(c.id));
  }, [me.hand, selectedHandIds]);

  const selectedSetInfo = useMemo(() => {
    if (selectedCards.length !== 3) return null;
    return evalSet(selectedCards);
  }, [selectedCards]);

  // Step 1: 移動実行
  const executeMove = (cardIdx, stepVal) => {
    if (!isHuman || state.step !== 1) return;
    const card = me.hand[cardIdx];
    const nextPos = (p.pos + stepVal) % 10;
    const handAfterMove = me.hand.filter((_, idx) => idx !== cardIdx);

    const tempRoad = state.road.map((arr, i) => i === p.pos ? [...arr, card] : arr);

    // 🏡 地元（マス0）到達時: 所持している荷箱数 × 1塩 の基本手当（周回基本収入）を獲得
    const boxSalary = (nextPos === 0) ? me.boxes.filter(b => b.unlocked).length : 0;
    const newScore = me.score + boxSalary;

    // 🎴 補充元と枚数は、移動後に1枚ずつ選ぶ
    const newPlayers = state.players.map((pl, i) => i === 0 ? {
      ...pl,
      pos: nextPos,
      score: newScore,
      hand: handAfterMove
    } : pl);

    setSelectedHandIds([]);
    setState(prev => ({
      ...prev,
      road: tempRoad,
      players: newPlayers,
      finalRoundTriggered: prev.finalRoundTriggered || newScore >= WIN_SCORE,
      refillCount: 0,
      step: 5
    }));
  };

  const handleMove = (cardIdx) => {
    if (!isHuman || state.step !== 1) return;
    const card = me.hand[cardIdx];
    executeMove(cardIdx, card.num);
  };

  // 場に複数枚ある場合も、1枚だけ選んで手札に加える
  const handlePickRoadCard = (cardId) => {
    if (!isHuman || state.step !== 5) return;
    const cardsAtPosition = state.road[p.pos] || [];
    const picked = cardsAtPosition.find(card => card.id === cardId);
    if (!picked) return;

    const newRoad = state.road.map((cards, index) => index === p.pos
      ? cards.filter(card => card.id !== cardId)
      : cards);
    const newPlayers = state.players.map((pl, i) => i === 0
      ? { ...pl, hand: [...pl.hand, picked] }
      : pl);

    const nextRefillCount = state.refillCount + 1;
    setState(prev => ({
      ...prev,
      road: newRoad,
      players: newPlayers,
      refillCount: nextRefillCount,
      step: nextRefillCount >= me.refillLimit ? 3 : 5
    }));
  };

  const handleDrawDeckCard = () => {
    if (!isHuman || state.step !== 5 || state.refillCount >= me.refillLimit) return;
    const allPlayerPos = state.players.map(pl => pl.pos);
    const res = drawSafe(1, state.deck, state.discard, state.road, allPlayerPos);
    if (res.drawn.length === 0) return;

    const nextRefillCount = state.refillCount + 1;
    const newPlayers = state.players.map((pl, i) => i === 0
      ? { ...pl, hand: [...pl.hand, ...res.drawn] }
      : pl);
    setState(prev => ({
      ...prev,
      deck: res.newDeck,
      discard: res.newDiscard,
      road: res.newRoad || prev.road,
      players: newPlayers,
      refillCount: nextRefillCount,
      step: nextRefillCount >= me.refillLimit ? 3 : 5
    }));
  };

  const handleFinishRefill = () => {
    if (!isHuman || state.step !== 5 || state.refillCount < 1) return;
    setState(prev => ({ ...prev, step: 3 }));
  };

  // Step 4: 手番終了時の手札整理
  const handleConfirmExcess = () => {
    if (!isHuman || state.step !== 4) return;
    if (overflowSelectedIds.length !== state.excessCount) return;

    const returningCards = me.hand.filter(c => overflowSelectedIds.includes(c.id));
    const remainingHand = me.hand.filter(c => !overflowSelectedIds.includes(c.id));

    const newRoad = state.road.map((arr, i) => i === p.pos ? [...arr, ...returningCards] : arr);
    const newPlayers = state.players.map((pl, i) => i === 0 ? { ...pl, hand: remainingHand } : pl);

    setOverflowSelectedIds([]);
    setState(prev => ({
      ...prev,
      road: newRoad,
      players: newPlayers,
      turn: (prev.turn + 1) % 4,
      step: 1,
      gameOver: prev.finalRoundTriggered && prev.turn === 3,
      excessCount: 0
    }));
  };

  // 手札3枚を空き荷箱に積む (荷積み ➔ 【3枚即時補充！】)
  const handlePackSelectedCards = () => {
    if (!selectedSetInfo || state.step !== 3) return;
    const emptyIdx = me.boxes.findIndex(b => b.unlocked && !b.cargo && b.salt === 0);
    if (emptyIdx === -1) return;

    const ids = selectedCards.map(c => c.id);
    const remainingHand = me.hand.filter(c => !ids.includes(c.id));

    // 🎴 面子公開時の即時3枚ドロー！
    const allPlayerPos = state.players.map(pl => pl.pos);
    const drawRes = drawSafe(3, state.deck, state.discard, state.road, allPlayerPos);
    const newHand = [...remainingHand, ...drawRes.drawn];

    const newPlayers = state.players.map((pl, i) => {
      if (i !== 0) return pl;
      return {
        ...pl,
        hand: newHand,
        boxes: pl.boxes.map((b, bI) => bI === emptyIdx ? { ...b, cargo: selectedSetInfo } : b)
      };
    });

    setSelectedHandIds([]);
    setState(prev => ({
      ...prev,
      deck: drawRes.newDeck,
      discard: drawRes.newDiscard,
      road: drawRes.newRoad || prev.road,
      players: newPlayers
    }));
  };

  // 荷箱から手札に戻す (地元でのみ。箱を開ける操作)
  const handleUnpackBox = (boxIdx) => {
    if (!isHuman || state.step !== 3 || p.pos !== 0) return;
    const box = me.boxes[boxIdx];
    if (!box || !box.cargo || !box.cargo.cards) return;

    if (me.hand.length + 3 > HAND_LIMIT + 2) return;

    const returnedCards = box.cargo.cards;
    const newBoxes = me.boxes.map((b, idx) => idx === boxIdx ? { ...b, cargo: null } : b);
    const newHand = [...me.hand, ...returnedCards];

    setState(prev => ({
      ...prev,
      players: prev.players.map((pl, i) => i === 0 ? { ...pl, hand: newHand, boxes: newBoxes } : pl)
    }));
  };
  // 港で特定の荷箱だけ荷下ろし (木箱=素点, 高級箱=素点+3塩！)
  const handlePortSellBox = (boxIdx) => {
    if (!isHuman || state.step !== 3 || p.pos !== 5) return;
    const box = me.boxes[boxIdx];
    if (!box || !box.cargo) return;

    const gain = box.flipped ? (box.cargo.salt + FLIP_BONUS) : box.cargo.salt;
    const returnedCards = box.cargo.cards || [];

    const newBoxes = me.boxes.map((b, idx) => {
      if (idx === boxIdx) return { ...b, cargo: null, salt: gain };
      return b;
    });

    setState(prev => ({
      ...prev,
      discard: [...prev.discard, ...returnedCards],
      players: prev.players.map((pl, i) => i === 0 ? { ...pl, boxes: newBoxes } : pl)
    }));
  };

  // 港ですべての荷物を一括荷下ろし (木箱=素点, 高級箱=素点+3塩！)
  const handlePortSellAll = () => {
    if (!isHuman || state.step !== 3 || p.pos !== 5) return;
    let cardsToDiscard = [];

    const newBoxes = me.boxes.map(b => {
      if (b.unlocked && b.cargo) {
        const gain = b.flipped ? (b.cargo.salt + FLIP_BONUS) : b.cargo.salt;
        if (b.cargo.cards) cardsToDiscard.push(...b.cargo.cards);
        return { ...b, cargo: null, salt: gain };
      }
      return b;
    });

    setState(prev => ({
      ...prev,
      discard: [...prev.discard, ...cardsToDiscard],
      players: prev.players.map((pl, i) => i === 0 ? { ...pl, boxes: newBoxes } : pl)
    }));
  };

  // 地元で指定した箱の塩を全納品
  const handleDeliverBox = (boxIdx) => {
    if (!isHuman || state.step !== 3 || p.pos !== 0) return;
    const box = me.boxes[boxIdx];
    if (!box || !box.unlocked || box.salt <= 0) return;

    const newScore = me.score + box.salt;
    const newBoxes = me.boxes.map((b, idx) => idx === boxIdx ? { ...b, salt: 0 } : b);

    setState(prev => ({
      ...prev,
      finalRoundTriggered: prev.finalRoundTriggered || newScore >= WIN_SCORE,
      players: prev.players.map((pl, i) => i === 0 ? {
        ...pl,
        score: newScore,
        boxes: newBoxes
      } : pl)
    }));
  };

  // 地元ですべての箱の塩を一括全納品
  const handleDeliverAll = () => {
    if (!isHuman || state.step !== 3 || p.pos !== 0 || myTotalSalt <= 0) return;
    const newScore = me.score + myTotalSalt;
    const newBoxes = me.boxes.map(b => ({ ...b, salt: 0 }));

    setState(prev => ({
      ...prev,
      finalRoundTriggered: prev.finalRoundTriggered || newScore >= WIN_SCORE,
      players: prev.players.map((pl, i) => i === 0 ? {
        ...pl,
        score: newScore,
        boxes: newBoxes,
        pouchSalt: 0
      } : pl)
    }));
  };

  // 施設アクション (塩の投資・得点化)
  const handleFacility = (type) => {
    if (!isHuman || state.step !== 3) return;
    const pos = p.pos;

    // 0: 地元 (得点化 ➔ 全額納品)
    if (pos === 0 && type === 'deliver') {
      handleDeliverAll();
    }
    // 箱屋 (1, 7): 箱の増設 (2箱目=2塩, 3箱目=3塩, 4箱目=4塩)
    else if ((pos === 1 || pos === 7) && type === 'add_box') {
      if (nextBoxCost === null || myTotalSalt < nextBoxCost) return;
      const targetIdx = me.boxes.findIndex(b => !b.unlocked);
      if (targetIdx === -1) return;

      const { newBoxes, newPouch, success } = deductPlayerSalt(me, nextBoxCost);
      if (!success) return;

      newBoxes[targetIdx] = { ...newBoxes[targetIdx], unlocked: true };

      setState(prev => ({
        ...prev,
        players: prev.players.map((pl, i) => i === 0 ? {
          ...pl,
          boxes: newBoxes,
          pouchSalt: newPouch
        } : pl)
      }));
    }
    // 仕入れ所 (2, 8): 補充上限を1枚増やす (最大3枚)
    else if (REFILL_TILES.includes(pos) && type === 'upgrade_refill') {
      if (me.refillLimit >= MAX_REFILL || myTotalSalt < REFILL_COST) return;

      const { newBoxes, newPouch, success } = deductPlayerSalt(me, REFILL_COST);
      if (!success) return;

      setState(prev => ({
        ...prev,
        players: prev.players.map((pl, i) => i === 0 ? {
          ...pl,
          boxes: newBoxes,
          pouchSalt: newPouch,
          refillLimit: (pl.refillLimit || 1) + 1
        } : pl)
      }));
    }
    // 会所 (3, 9): 箱を裏返す (3塩 ➔ 特製桐箱ボーナス+2塩)
    else if ((pos === 3 || pos === 9) && type === 'flip') {
      if (myTotalSalt < FLIP_COST) return;
      const targetIdx = me.boxes.findIndex(b => b.unlocked && !b.flipped);
      if (targetIdx === -1) return;

      const { newBoxes, newPouch, success } = deductPlayerSalt(me, FLIP_COST);
      if (!success) return;

      newBoxes[targetIdx] = { ...newBoxes[targetIdx], flipped: true };

      setState(prev => ({
        ...prev,
        players: prev.players.map((pl, i) => i === 0 ? {
          ...pl,
          boxes: newBoxes,
          pouchSalt: newPouch
        } : pl)
      }));
    }
  };

  // Step 3: 手番終了
  const handleEndTurn = () => {
    if (!isHuman || state.step !== 3) return;
    setSelectedHandIds([]);
    setOverflowSelectedIds([]);
    if (me.hand.length > HAND_LIMIT) {
      setState(prev => ({
        ...prev,
        step: 4,
        excessCount: prev.players[0].hand.length - HAND_LIMIT
      }));
      return;
    }
    setState(prev => ({
      ...prev,
      turn: (prev.turn + 1) % 4,
      step: 1,
      gameOver: prev.finalRoundTriggered && prev.turn === 3
    }));
  };

  // BOT AI Loop
  useEffect(() => {
    if (state.gameOver || state.turn === 0) return;

    const timer = setTimeout(() => {
      const curr = state.players[state.turn];

      if (state.step === 1) {
        const hList = curr.hand;
        if (!hList || hList.length === 0) { setState(prev => ({ ...prev, step: 1 })); return; }

        const priorities = getCardDiscardPriorities(hList);
        const botSalt = getPlayerTotalSalt(curr);
        const hasSalt = botSalt > 0;
        const loadedBoxes = curr.boxes.filter(b => b.unlocked && b.cargo).length;
        const emptyBoxes = curr.boxes.filter(b => b.unlocked && !b.cargo && (b.salt || 0) === 0).length;
        const unflipped = curr.boxes.find(b => b.unlocked && !b.flipped);
        const unlockedCount = curr.boxes.filter(b => b.unlocked).length;

        let bestScore = -99999;
        let bestIdx = 0;

        hList.forEach((c, idx) => {
          const pInfo = priorities.find(p => p.idx === idx);
          const baseLoss = pInfo ? pInfo.loss : 50;
          const target = (curr.pos + c.num) % 10;
          const handAfterMove = hList.filter((_, handIdx) => handIdx !== idx);
          const setsAfterMove = findSets(handAfterMove).length;
          let score = (100 - baseLoss) * 0.9;

          // 箱に積める面子を作る手を、箱数に応じて評価する。
          if (setsAfterMove > 0 && emptyBoxes > 0) {
            score += setsAfterMove * 160;
            if (emptyBoxes > 1) score += 110;
          }

          if (target === 0) {
            // 地元 (0)
            if (hasSalt) {
              score += 480 + botSalt * 80;
              if (curr.score + botSalt >= WIN_SCORE) score += 35000;
            } else score -= 30;
          } else if (target === 5) {
            // 港 (5)
            if (loadedBoxes > 0) {
              const flippedLoaded = curr.boxes.filter(b => b.unlocked && b.cargo && b.flipped).length;
              score += 500 + loadedBoxes * 300 + flippedLoaded * 250;
              if (emptyBoxes >= 2 && loadedBoxes === 1) score -= 250;
              else if (emptyBoxes === 1 && loadedBoxes === 1) score -= 120;
            } else {
              score -= 50;
            }
          } else if ((target === 1 || target === 7) && unlockedCount < 4) {
            // 箱屋 (1, 7)
            const nextCost = BOX_COSTS[unlockedCount - 1];
            if (botSalt >= nextCost && curr.score < WIN_SCORE - 2) {
              score += 850 + (4 - unlockedCount) * 80;
            }
          } else if (REFILL_TILES.includes(target) && (curr.refillLimit || 1) < MAX_REFILL) {
            // 仕入れ所 (2, 8)
            if (botSalt >= REFILL_COST && curr.score < WIN_SCORE - 2) score += 720;
          } else if ((target === 3 || target === 9) && unflipped) {
            // 会所 (3, 9)
            if (botSalt >= FLIP_COST && curr.score < WIN_SCORE - 2) score += 800;
          }

          const roadStack = state.road[target] || [];
          if (roadStack.length > 0) {
            score += roadStack.length * (emptyBoxes > 1 ? 80 : (emptyBoxes > 0 ? 50 : 20));
          }

          if (loadedBoxes > 0 && !hasSalt) {
            const distToPort = (5 - target + 10) % 10;
            if (target <= 5) {
              const progressWeight = (emptyBoxes > 0 ? 25 : 75);
              score += (5 - distToPort) * (progressWeight + loadedBoxes * 30);
            }
          }
          if (hasSalt) {
            const distToHome = (10 - target) % 10;
            if (target >= 5 || target === 0) score += (10 - distToHome) * 45;
          }

          if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
          }
        });

        const c = hList[bestIdx] || hList[0];
        const nextPos = (curr.pos + c.num) % 10;
        const tempRoad = state.road.map((arr, i) => i === curr.pos ? [...arr, c] : arr);
        let hnd = curr.hand.filter((_, idx) => idx !== bestIdx);

        let newDeck = state.deck;
        let newDiscard = state.discard;
        let newRoad = tempRoad;

        // BOTの自動補充：強化済み上限まで、場札・山札を毎回選ぶ。
        const allPlayerPos = state.players.map(pl => pl.pos);
        let refillCount = 0;
        while (refillCount < (curr.refillLimit || 1)) {
          const roadCardsAtDest = newRoad[nextPos] || [];
          const fieldPick = roadCardsAtDest.reduce((best, card) => {
            const candidateSets = findSets([...hnd, card]);
            const value = candidateSets.length > 0
              ? Math.max(...candidateSets.map(set => set.info.salt))
              : 0;
            return value > best.value ? { card, value } : best;
          }, { card: null, value: -1 });
          const emptyBoxSlots = curr.boxes.filter(b => b.unlocked && !b.cargo && (b.salt || 0) === 0).length;
          if (refillCount > 0 && findSets(hnd).length >= Math.max(1, emptyBoxSlots)) break;

          const fieldCreatesSet = fieldPick.card && findSets([...hnd, fieldPick.card]).length > 0;
          if (fieldPick.card && (fieldCreatesSet || roadCardsAtDest.length >= 2)) {
            hnd = [...hnd, fieldPick.card];
            newRoad = newRoad.map((arr, i) => i === nextPos
              ? arr.filter(card => card.id !== fieldPick.card.id)
              : arr);
          } else {
            const res = drawSafe(1, newDeck, newDiscard, newRoad, [...allPlayerPos, nextPos]);
            if (res.drawn.length === 0) break;
            hnd = [...hnd, ...res.drawn];
            newDeck = res.newDeck;
            newDiscard = res.newDiscard;
            newRoad = res.newRoad || newRoad;
          }
          refillCount++;
        }

        // 行動実行 (パッキング: 高級箱には高い役を優先充填)
        let bxs = [...curr.boxes];
        let sc = curr.score;
        let pouchSalt = curr.pouchSalt || 0;
        let refillLimit = curr.refillLimit || 1;

        while (true) {
          const sets = findSets(hnd);
          const emptyIdxs = bxs
            .map((b, idx) => (b.unlocked && !b.cargo && (b.salt || 0) === 0 ? idx : -1))
            .filter(idx => idx !== -1);

          if (sets.length > 0 && emptyIdxs.length > 0) {
            const hasEmptyFlipped = emptyIdxs.some(idx => bxs[idx].flipped);
            let s;
            if (hasEmptyFlipped) {
              s = [...sets].sort((a, b) => b.info.salt - a.info.salt)[0];
              const targetBoxIdx = emptyIdxs.find(idx => bxs[idx].flipped) ?? emptyIdxs[0];
              bxs[targetBoxIdx] = { ...bxs[targetBoxIdx], cargo: { ...s.info, cards: s.trio } };
            } else {
              s = sets[0];
              const targetBoxIdx = emptyIdxs[0];
              bxs[targetBoxIdx] = { ...bxs[targetBoxIdx], cargo: { ...s.info, cards: s.trio } };
            }

            const ids = s.trio.map(card => card.id);
            hnd = hnd.filter(card => !ids.includes(card.id));

            const drawRes = drawSafe(3, newDeck, newDiscard, newRoad, allPlayerPos);
            hnd = [...hnd, ...drawRes.drawn];
            newDeck = drawRes.newDeck;
            newDiscard = drawRes.newDiscard;
            newRoad = drawRes.newRoad || newRoad;
          } else break;
        }

        // 施設アクション
        if (nextPos === 0) {
          // 地元: どの箱を空にするかを選び納品する
          let keep = 0;
          const uCount = bxs.filter(b => b.unlocked).length;
          const curTotSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0) + pouchSalt;
          if (uCount < 3 && sc < WIN_SCORE - 3) {
            const nextCost = BOX_COSTS[uCount - 1] || 1;
            if (curTotSalt >= nextCost) keep = nextCost;
          }

          let preservedSalt = 0;
          bxs = bxs.map(b => {
            if (b.unlocked && b.salt > 0) {
              if (preservedSalt < keep && (sc + curTotSalt < WIN_SCORE)) {
                preservedSalt += b.salt;
                return b;
              } else {
                sc += b.salt;
                return { ...b, salt: 0 };
              }
            }
            return b;
          });

          if (pouchSalt > 0) {
            sc += pouchSalt;
            pouchSalt = 0;
          }
        } else if (nextPos === 5) {
          // 港 (5): 荷箱の荷下ろし (木箱=素点そのまま, 高級箱=素点+3塩！)
          bxs = bxs.map(b => {
            if (b.unlocked && b.cargo) {
              const gain = b.cargo.salt + (b.flipped ? FLIP_BONUS : 0);
              if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
              return { ...b, cargo: null, salt: gain };
            }
            return b;
          });
        } else if (nextPos === 3 || nextPos === 9) {
          // 会所 (3, 9): 箱裏返し (2塩)
          const curTotSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0) + pouchSalt;
          if (curTotSalt >= FLIP_COST && sc < WIN_SCORE - 2) {
            const target = bxs.find(b => b.unlocked && !b.flipped);
            if (target) {
              target.flipped = true;
              let rem = FLIP_COST;
              if (pouchSalt >= rem) { pouchSalt -= rem; rem = 0; }
              else { rem -= pouchSalt; pouchSalt = 0; }
              bxs = bxs.map(b => {
                if (rem > 0 && b.unlocked && b.salt > 0) {
                  if (b.salt >= rem) { const sRem = b.salt - rem; rem = 0; return { ...b, salt: sRem }; }
                  else { rem -= b.salt; return { ...b, salt: 0 }; }
                }
                return b;
              });
            }
          }
        } else if (nextPos === 1 || nextPos === 7) {
          // 箱屋 (1, 7): 箱増設 (1〜3塩)
          const uCount = bxs.filter(b => b.unlocked).length;
          if (uCount < 4) {
            const nextCost = BOX_COSTS[uCount - 1];
            const curTotSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0) + pouchSalt;
            if (curTotSalt >= nextCost && sc < WIN_SCORE - 3) {
              const target = bxs.find(b => !b.unlocked);
              if (target) {
                target.unlocked = true;
                let rem = nextCost;
                if (pouchSalt >= rem) { pouchSalt -= rem; rem = 0; }
                else { rem -= pouchSalt; pouchSalt = 0; }
                bxs = bxs.map(b => {
                  if (rem > 0 && b.unlocked && b.salt > 0) {
                    if (b.salt >= rem) { const sRem = b.salt - rem; rem = 0; return { ...b, salt: sRem }; }
                    else { rem -= b.salt; return { ...b, salt: 0 }; }
                  }
                  return b;
                });
              }
            }
          }
        } else if (REFILL_TILES.includes(nextPos)) {
          // 仕入れ所: 塩2で補充上限を+1（最大3枚）
          const curTotSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0) + pouchSalt;
          if (refillLimit < MAX_REFILL && curTotSalt >= REFILL_COST) {
            refillLimit += 1;
            let rem = REFILL_COST;
            if (pouchSalt >= rem) { pouchSalt -= rem; rem = 0; }
            else { rem -= pouchSalt; pouchSalt = 0; }
            bxs = bxs.map(b => {
              if (rem > 0 && b.unlocked && b.salt > 0) {
                if (b.salt >= rem) { const sRem = b.salt - rem; rem = 0; return { ...b, salt: sRem }; }
                rem -= b.salt;
                return { ...b, salt: 0 };
              }
              return b;
            });
          }
        }

        // 行動を終えたら、余った手札を現在地に戻して5枚以下にする。
        if (hnd.length > HAND_LIMIT) {
          const excess = hnd.length - HAND_LIMIT;
          const priorities = getCardDiscardPriorities(hnd);
          const returnIds = priorities.slice(0, excess).map(item => item.card.id);
          const toReturn = hnd.filter(card => returnIds.includes(card.id));
          hnd = hnd.filter(card => !returnIds.includes(card.id));
          newRoad = newRoad.map((arr, i) => i === nextPos ? [...arr, ...toReturn] : arr);
        }

        const reachedGoal = sc >= WIN_SCORE;
        const finalRoundTriggered = state.finalRoundTriggered || reachedGoal;
        const isRoundComplete = finalRoundTriggered && state.turn === 3;
        const newPlayers = state.players.map((pl, i) => i === state.turn ? {
          ...pl,
          pos: nextPos,
          score: sc,
          pouchSalt,
          refillLimit,
          hand: hnd,
          boxes: bxs
        } : pl);

        setState(prev => ({
          ...prev,
          deck: newDeck,
          discard: newDiscard,
          road: newRoad,
          players: newPlayers,
          finalRoundTriggered,
          turn: isRoundComplete ? prev.turn : (prev.turn + 1) % 4,
          step: 1,
          gameOver: isRoundComplete
        }));
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [state.turn, state.step, state.gameOver]);

  // カード描画
  const renderCard = (card, onClick, isSelected = false, isOverflow = false) => {
    const g = GOODS[card.type] || GOODS.tea;
    return h('div', {
      key: card.id,
      onClick,
      className: `card ${g.card} ${isSelected ? 'selected' : ''} ${isOverflow ? 'overflow-selected' : ''}`
    }, [
      h('div', { className: 'card-num' }, card.num),
      h('div', { className: 'card-icon' }, g.icon),
      h('div', { className: 'card-badges-pill' }, [
        h('span', { className: 'badge-pill' }, `🧂${card.salt}`)
      ])
    ]);
  };

  // マス描画
  const renderTile = (tile) => {
    const occupants = state.players.filter(pl => pl.pos === tile.pos);
    const cardsOnTile = state.road[tile.pos] || [];
    const isCurrentPos = (p.pos === tile.pos);

    return h('div', {
      key: tile.pos,
      className: `tile ${tile.isFacility ? 'facility-tile' : ''} ${isCurrentPos ? 'current-tile' : ''}`
    }, [
      h('div', { className: 'tile-header' }, [
        h('span', { className: 'tile-num' }, tile.pos),
        h('span', { className: 'tile-name' }, `${tile.icon} ${tile.name}`)
      ]),
      tile.costText && h('div', { className: 'tile-cost-tag' }, tile.costText),
      h('div', { className: 'tile-occupants' },
        occupants.map(pl => h('span', {
          key: pl.id,
          className: 'occupant-badge',
          style: { backgroundColor: pl.color }
        }, pl.id === 0 ? '自' : `B${pl.id}`))
      ),
      h('div', { className: 'tile-cards' },
        cardsOnTile.length === 0
          ? h('span', { className: 'tile-empty' }, '空 (山札ドロー)')
          : cardsOnTile.map(c => h('span', {
              key: c.id,
              className: `tile-card-chip chip-${c.type}`
            }, `${GOODS[c.type].name}${c.num}`))
      )
    ]);
  };

  // 中央エリア（操作ハブ）
  const renderCenter = () => {
    if (!isHuman) {
      return h('div', { className: 'center-hub bot-turn' }, [
        h('div', { className: 'spinner' }),
        h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: p.color } }, `${p.name} 思考中...`),
        h('div', { style: { fontSize: '10px', color: '#718096' } }, `${TILES[p.pos].name} に滞在中`)
      ]);
    }

    // Step 1: 移動
    if (state.step === 1) {
      return h('div', { className: 'center-hub step-1' }, [
        h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#c53030' } }, '🚶【1. 移動】'),
        h('div', { style: { fontSize: '10px', color: '#4a5568' } }, '手札から1枚選んでその数字進む')
      ]);
    }

    // Step 5: 場札を1枚選択
    if (state.step === 5) {
      const cardsAtPosition = state.road[p.pos] || [];
      return h('div', { className: 'center-hub step-3' }, [
        h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#6b46c1' } }, '🎴【補充】'),
        h('div', { style: { fontSize: '10px', color: '#4a5568' } }, `あと${me.refillLimit - state.refillCount}枚まで（現在の上限${me.refillLimit}枚）。1枚ごとに補充元を選べます`),
        h('div', { style: { display: 'flex', gap: '4px', width: '100%' } }, [
          h('button', {
            onClick: handleDrawDeckCard,
            disabled: state.refillCount >= me.refillLimit,
            className: 'btn btn-primary',
            style: { flex: 1, fontSize: '10px', padding: '5px 3px' }
          }, '🂠 山札から1枚'),
          h('button', {
            onClick: handleFinishRefill,
            disabled: state.refillCount < 1,
            className: 'btn btn-secondary',
            style: { flex: 1, fontSize: '10px', padding: '5px 3px' }
          }, '補充を終了')
        ]),
        cardsAtPosition.length > 0 && h('div', { style: { fontSize: '10px', color: '#4a5568', marginTop: '2px' } }, '今いるマスの場札から1枚選ぶ（残りは場に残る）'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '5px', width: '100%' } },
          cardsAtPosition.map(card => renderCard(card, () => handlePickRoadCard(card.id)))
        )
      ]);
    }

    // Step 4: 返却（旧セーブデータ互換用）
    if (state.step === 4) {
      const needed = state.excessCount;
      const current = overflowSelectedIds.length;
      return h('div', { className: 'center-hub step-4' }, [
        h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#6b46c1' } }, '⚠️【手番終了・手札整理】'),
        h('div', { style: { fontSize: '10px', color: '#4a5568' } }, `不要な手札を ${needed} 枚選んで現在地に戻す`),
        h('button', {
          disabled: current !== needed,
          onClick: handleConfirmExcess,
          className: 'btn btn-purple',
          style: { width: '100%', fontSize: '10px', padding: '4px 6px', marginTop: '2px' }
        }, `現在地に戻す (${current}/${needed})`)
      ]);
    }

    // Step 3: 行動 (荷下ろし・荷積み・施設利用)
    if (state.step === 3) {
      const isPort = (p.pos === 5);
      const isGuild = (p.pos === 3 || p.pos === 9);
      const isBoxShop = (p.pos === 1 || p.pos === 7);
      const isRefillShop = REFILL_TILES.includes(p.pos);
      const isHome = (p.pos === 0);

      return h('div', { className: 'center-hub step-3' }, [
        h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#2b8a3e', display: 'flex', justifyContent: 'space-between', width: '100%' } }, [
          h('span', null, '⚡【行動】'),
          h('span', { style: { fontSize: '10px', color: '#4a5568' } }, `${TILES[p.pos].name}`)
        ]),

        // 施設アクションボタン
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', width: '100%' } }, [
          // 地元(0): 納品
          isHome && (
            myTotalSalt > 0 ? (
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', width: '100%' } }, [
                h('button', {
                  onClick: handleDeliverAll,
                  className: 'btn btn-success',
                  style: { width: '100%', fontSize: '11px', padding: '4px 4px', fontWeight: 'bold' }
                }, `🏡 全箱一括納品 ➔ +${myTotalSalt} 🏆`),

                me.boxes.map((b, idx) => (b.unlocked && b.salt > 0) ? (
                  h('button', {
                    key: idx,
                    onClick: () => handleDeliverBox(idx),
                    className: 'btn btn-primary',
                    style: { width: '100%', fontSize: '10px', padding: '3px 4px', background: '#0d9488' }
                  }, `📦 荷箱${idx + 1}納品 ➔ +${b.salt} 🏆`)
                ) : null)
              ])
            ) : h('div', { style: { fontSize: '10px', color: '#718096', textAlign: 'center' } }, '箱の塩: 0 (港で荷下ろしして運ぼう)')
          ),

          // 箱屋(1, 7): 箱の増設 (2箱目=2塩, 3箱目=3塩, 4箱目=4塩)
          isBoxShop && (
            unlockedBoxes.length < 4 ? (
              h('button', {
                disabled: myTotalSalt < (nextBoxCost || 1),
                onClick: () => handleFacility('add_box'),
                className: 'btn btn-purple',
                style: { width: '100%', fontSize: '10px', padding: '4px 4px' }
              }, `🛖 荷箱${unlockedBoxes.length + 1}箱目を増設 (🧂${nextBoxCost}塩)`)
            ) : h('div', { style: { fontSize: '10px', color: '#7c3aed', textAlign: 'center' } }, '📦 荷箱最大 (4箱)')
          ),

          // 仕入れ所(2, 8): 補充上限の強化
          isRefillShop && (
            me.refillLimit < MAX_REFILL ? (
              h('button', {
                disabled: myTotalSalt < REFILL_COST,
                onClick: () => handleFacility('upgrade_refill'),
                className: 'btn btn-purple',
                style: { width: '100%', fontSize: '10px', padding: '4px 4px' }
              }, `🧺 補充上限を${me.refillLimit}➜${me.refillLimit + 1}枚に強化 (🧂${REFILL_COST}塩)`)
            ) : h('div', { style: { fontSize: '10px', color: '#7c3aed', textAlign: 'center' } }, '🧺 補充上限最大 (3枚)')
          ),

          // 港(5): 荷下ろし ➔ 【荷箱が塩で埋まる！】
          isPort && (
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' } }, [
              loadedBoxesCount > 0 ? (() => {
                let totalExpectedGain = 0;
                me.boxes.forEach(b => {
                  if (b.unlocked && b.cargo) {
                    const gain = b.flipped ? (b.cargo.salt * 2) : b.cargo.salt;
                    totalExpectedGain += gain;
                  }
                });
                return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' } }, [
                  h('button', {
                    onClick: handlePortSellAll,
                    className: 'btn btn-primary',
                    style: { width: '100%', fontSize: '10px', padding: '4px 4px', fontWeight: 'bold', background: '#0284c7' }
                  }, `⚓ 全箱の荷下ろし ➔ 🧂${totalExpectedGain}塩`),
                  me.boxes.map((b, idx) => b.cargo ? (() => {
                    const gain = b.flipped ? (b.cargo.salt * 2) : b.cargo.salt;
                    const bonusNote = b.flipped ? ' (高級箱2倍🔥)' : '';
                    return h('button', {
                      key: idx,
                      onClick: () => handlePortSellBox(idx),
                      className: 'btn btn-primary',
                      style: { width: '100%', fontSize: '9px', padding: '2px 4px' }
                    }, `📦 箱${idx+1} (${b.cargo.name}) ➔ 🧂${gain}塩${bonusNote}`);
                  })() : null)
                ]);
              })() : (
                h('div', { style: { fontSize: '10px', color: '#718096', textAlign: 'center', padding: '4px' } },
                  mySets.length > 0
                    ? '💡 先に手札の役を空き荷箱に積んでから荷下ろししてください'
                    : '荷箱に荷物がありません（荷物を積んで港へ運ぼう）'
                )
              )
            ])
          ),

          // 会所(3, 9): 箱を裏返す (2塩 ➔ 高級箱化: 素点+3塩！)
          isGuild && (
            unflippedBoxesCount > 0 ? (
              h('button', {
                disabled: myTotalSalt < FLIP_COST,
                onClick: () => handleFacility('flip'),
                className: 'btn btn-success',
                style: { width: '100%', fontSize: '10px', padding: '4px 4px' }
              }, `🏛️ 木箱を高級箱に強化 (素点+3塩🔥) (🧂${FLIP_COST}塩)`)
            ) : h('div', { style: { fontSize: '10px', color: '#2b8a3e', textAlign: 'center' } }, '✨ すべての箱が高級箱です')
          )
        ]),

        // 手番終了ボタン
        h('button', {
          onClick: handleEndTurn,
          className: 'btn btn-dark',
          style: { width: '100%', fontSize: '11px', padding: '5px 4px', fontWeight: 'bold', marginTop: '2px' }
        }, '🏁 手番終了')
      ]);
    }

    return null;
  };

  if (state.gameOver) {
    const topScore = Math.max(...state.players.map(player => player.score));
    const winners = state.players.filter(player => player.score === topScore);
    const winnerLabel = winners.map(player => player.name).join('・');
    return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', gap: '12px', textAlign: 'center' } }, [
      h('h1', { style: { fontSize: '22px', color: '#2d3748' } }, winners.length > 1 ? `🤝 ${winnerLabel} の引き分け！` : `👑 ${winnerLabel} の勝利！`),
      h('p', { style: { color: '#4a5568' } }, `🏆 ${topScore} 点獲得`),
      h('button', {
        onClick: () => setState(initGame()),
        className: 'btn btn-primary',
        style: { padding: '8px 20px', fontSize: '14px' }
      }, '🔄 もう一度遊ぶ')
    ]);
  }

  return h('div', { className: 'app' }, [

    // ヘッダー
    h('header', { className: 'header' }, [
      h('div', { className: 'header-title' }, [
        h('span', null, '🏮 ナウキ運び'),
        h('span', { className: `header-turn-badge ${isHuman ? 'turn-me' : 'turn-bot'}` }, `手番: ${p.name}`)
      ]),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
        h('span', { style: { color: '#718096', fontSize: '12px' } }, `🎴 山札: ${state.deck.length}枚`),
        h('span', { className: 'header-badge' }, `🏆 目標: ${WIN_SCORE}点`),
        state.finalRoundTriggered && h('span', { className: 'header-badge', style: { background: '#fff5eb', color: '#c05621' } }, '⚠️ 最終ラウンド（P4まで）'),
        h('a', {
          href: 'dashboard.html',
          className: 'btn btn-purple',
          style: { textDecoration: 'none', fontSize: '11px', padding: '3px 8px', borderRadius: '12px' }
        }, '📊 分析・検証')
      ])
    ]),

    // プレイヤー状況スコアボード
    h('div', { className: 'players-bar' },
      state.players.map(pl => {
        const isCurrentTurn = state.turn === pl.id;
        const isMe = pl.id === 0;
        const uBoxes = pl.boxes.filter(b => b.unlocked);
        const fBoxes = pl.boxes.filter(b => b.unlocked && b.flipped);
        const plTotalSalt = getPlayerTotalSalt(pl);

        return h('div', {
          key: pl.id,
          className: `player-card ${isCurrentTurn ? 'active-turn' : ''} ${isMe ? 'is-me' : ''}`
        }, [
          h('div', { className: 'player-card-header' }, [
            h('div', { className: 'player-card-name' }, [
              h('span', { className: 'player-avatar', style: { backgroundColor: pl.color } }, isMe ? '自' : `B${pl.id}`),
              h('span', { className: 'player-name-text' }, pl.name)
            ]),
            isCurrentTurn && h('span', { className: 'turn-badge' }, '手番')
          ]),
          h('div', { className: 'player-card-body' }, [
            h('div', { className: 'player-score' }, [
              h('span', { className: 'score-icon' }, '🏆'),
              h('span', { className: 'score-val' }, pl.score),
              h('span', { className: 'score-unit' }, '点')
            ]),
            h('div', { className: 'player-info-sub' }, [
              h('span', { style: { fontWeight: 'bold', color: plTotalSalt > 0 ? '#0d9488' : '#64748b' } }, `🧂${plTotalSalt}塩`),
              h('span', null, `📦${uBoxes.length}箱 (桐箱${fBoxes.length})`)
            ])
          ])
        ]);
      })
    ),

    // 4x3 街道マップ (10マス)
    h('div', { className: 'board' }, [
      renderTile(TILES[0]), renderTile(TILES[1]), renderTile(TILES[2]), renderTile(TILES[3]),
      renderTile(TILES[9]), renderCenter(),                             renderTile(TILES[4]),
      renderTile(TILES[8]), renderTile(TILES[7]), renderTile(TILES[6]), renderTile(TILES[5])
    ]),

    // あなたの手札（5枚固定）
    h('div', { className: 'section' }, [
      h('div', { className: 'section-title' }, [
        h('span', null, `🎴 手札 (${me.hand.length}/${HAND_LIMIT}枚)`),
        isHuman && state.step === 1 && h('span', { style: { color: '#9b2c2c', fontWeight: 'bold' } }, 'カードを選んで進む'),
        isHuman && state.step === 3 && (
          selectedSetInfo ? (
            emptyBoxesCount > 0 ? (
              h('button', {
                onClick: handlePackSelectedCards,
                className: 'btn btn-success',
                style: { padding: '2px 8px', fontSize: '11px' }
              }, `📦 ${selectedSetInfo.name} を荷箱に積む`)
            ) : (
              h('span', { style: { color: '#d97706', fontSize: '11px' } }, '⚠️ 空きの荷箱（塩も荷もない箱）がありません')
            )
          ) : selectedHandIds.length === 3 ? (
            h('span', { style: { color: '#c92a2a', fontSize: '11px' } }, '⚠️ 3枚組になりません')
          ) : (
            h('span', { style: { color: '#666', fontSize: '11px' } },
              selectedHandIds.length > 0
                ? `${selectedHandIds.length}/3枚選択中`
                : (mySets.length > 0 && emptyBoxesCount > 0)
                  ? '手札3枚を選んで空き荷箱に積める'
                  : '荷下ろし・施設・手番終了'
            )
          )
        ),
        isHuman && state.step === 4 && h('span', { style: { color: '#6b46c1', fontWeight: 'bold' } }, `↩️ 戻すカードを選択 (${overflowSelectedIds.length}/${state.excessCount})`)
      ]),
      h('div', { className: 'card-row' },
        me.hand.map((c, idx) => renderCard(
          c,
          () => {
            if (isHuman && state.step === 1) {
              handleMove(idx);
            } else if (isHuman && state.step === 3) {
              if (selectedHandIds.includes(c.id)) {
                setSelectedHandIds(selectedHandIds.filter(id => id !== c.id));
              } else if (selectedHandIds.length < 3) {
                setSelectedHandIds([...selectedHandIds, c.id]);
              }
            } else if (isHuman && state.step === 4) {
              if (overflowSelectedIds.includes(c.id)) {
                setOverflowSelectedIds(overflowSelectedIds.filter(id => id !== c.id));
              } else if (overflowSelectedIds.length < state.excessCount) {
                setOverflowSelectedIds([...overflowSelectedIds, c.id]);
              }
            }
          },
          selectedHandIds.includes(c.id),
          overflowSelectedIds.includes(c.id)
        ))
      )
    ]),

    // あなたの個人ボード（荷箱タイル：荷物または塩を積載）
    h('div', { className: 'section player-board-section' }, [
      h('div', { className: 'section-title' }, [
        h('span', null, '📦 あなたの荷車・荷箱タイル'),
        h('div', { className: 'levels-badges' }, [
          h('span', { className: 'level-badge-box' }, `箱の総塩量: 🧂${myTotalSalt}塩`),
          h('span', { className: 'level-badge-guild' }, `荷箱: ${unlockedBoxes.length}/4箱 (桐箱: ${unlockedBoxes.filter(b => b.flipped).length}箱)`),
          h('span', { className: 'level-badge-guild' }, `補充上限: ${me.refillLimit}枚`),
        ])
      ]),

      h('div', { className: 'cargo-boxes-grid' },
        me.boxes.map((b, idx) => {
          if (!b.unlocked) {
            const cost = BOX_COSTS[idx - 1] || 2;
            return h('div', { key: idx, className: 'cargo-box-card box-locked' }, [
              h('div', { className: 'cargo-box-num' }, `荷箱 ${idx + 1}`),
              h('div', { className: 'cargo-box-empty-text' }, `🔒 未増設 (箱屋: 🧂${cost}塩)`)
            ]);
          }

          const cardClass = b.salt > 0
            ? 'box-salt-filled'
            : (b.flipped ? 'box-flipped' : 'box-normal');

          const badgeClass = b.flipped ? 'cargo-badge-flipped' : 'cargo-badge-normal';
          const badgeText = b.flipped ? '✨ 高級箱 (素点+3塩🔥)' : '📦 木箱 (素点出荷)';

          // ① 塩が詰まっている場合
          if (b.salt > 0) {
            const isHomeNow = (isHuman && state.step === 3 && p.pos === 0);
            return h('div', {
              key: idx,
              className: `cargo-box-card ${cardClass}`,
              style: {
                borderColor: isHomeNow ? '#10b981' : '#0d9488',
                cursor: isHomeNow ? 'pointer' : 'default',
                boxShadow: isHomeNow ? '0 0 0 2px rgba(16, 185, 129, 0.3)' : undefined
              },
              onClick: () => {
                if (isHomeNow) handleDeliverBox(idx);
              }
            }, [
              h('div', { className: 'cargo-box-header' }, [
                h('span', { className: 'cargo-box-num' }, `荷箱 ${idx + 1}`),
                h('span', { className: 'cargo-badge-salt-filled' }, `🧂 満杯 (${b.salt}塩)`)
              ]),
              h('div', { className: 'cargo-box-name', style: { fontWeight: 'bold', color: '#0f766e', fontSize: '13px' } }, `🧂 塩の満載: ${b.salt} 塩`),
              isHomeNow ? (
                h('button', {
                  onClick: (e) => { e.stopPropagation(); handleDeliverBox(idx); },
                  className: 'btn btn-success',
                  style: { width: '100%', fontSize: '10px', padding: '3px 4px', fontWeight: 'bold', marginTop: '3px' }
                }, `🏡 この箱の塩を全納品 ➔ +${b.salt} 🏆`)
              ) : (
                h('div', { style: { fontSize: '9px', color: '#0d9488' } }, '🏡 地元（マス0）で納品して得点化')
              )
            ]);
          }

          // ② 荷物が積まれている場合
          if (b.cargo) {
            const isPort = (isHuman && state.step === 3 && p.pos === 5);
            const isHome = (isHuman && state.step === 3 && p.pos === 0);
            const salePrice = b.cargo.salt + (b.flipped ? FLIP_BONUS : 0);

            return h('div', {
              key: idx,
              className: `cargo-box-card ${cardClass}`,
              style: { cursor: isHome ? 'pointer' : 'default' },
              onClick: () => {
                if (isHome) {
                  handleUnpackBox(idx);
                }
              }
            }, [
              h('div', { className: 'cargo-box-header' }, [
                h('span', { className: 'cargo-box-num' }, `荷箱 ${idx + 1}`),
                h('span', { className: badgeClass }, badgeText)
              ]),
              h('div', { className: 'cargo-box-name', style: { fontWeight: 'bold', color: '#0f172a' } }, b.cargo.name),
              h('div', { className: 'cargo-box-vals', style: { display: 'flex', gap: '4px' } }, [
                h('span', { className: 'cargo-val-pill', style: { background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: '4px', fontSize: '10px' } }, `🧂素点 ${b.cargo.salt}塩`),
                b.flipped && h('span', { className: 'cargo-val-pill', style: { background: '#fef3c7', color: '#b45309', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' } }, `高級箱+3🔥 ➔ 計${salePrice}塩`)
              ]),
              isPort ? (
                h('button', {
                  onClick: (e) => { e.stopPropagation(); handlePortSellBox(idx); },
                  className: 'btn btn-primary',
                  style: { marginTop: '3px', fontSize: '9px', padding: '3px 4px', fontWeight: 'bold' }
                }, `⚓ 荷下ろし ➔ 🧂${salePrice}塩${b.flipped ? ' (+3🔥)' : ''}`)
              ) : isHome ? (
                h('div', { style: { fontSize: '9px', color: '#64748b' } }, '🏡 地元で箱を開けて手札に戻す')
              ) : (
                h('div', { style: { fontSize: '9px', color: '#64748b' } }, '🔒 荷物入り（地元まで開封不可）')
              )
            ]);
          }

          // ③ 空き箱の場合
          return h('div', { key: idx, className: `cargo-box-card ${cardClass} box-empty` }, [
            h('div', { className: 'cargo-box-header' }, [
              h('span', { className: 'cargo-box-num' }, `荷箱 ${idx + 1}`),
              h('span', { className: badgeClass }, badgeText)
            ]),
            h('div', { className: 'cargo-box-empty-text', style: { color: '#64748b', fontSize: '11px' } }, '空き（荷物または塩を積める）')
          ]);
        })
      )
    ])

  ]);
}

ReactDOM.render(h(App), document.getElementById('root'));
