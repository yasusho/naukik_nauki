const { useState, useEffect, useMemo, createElement: h } = React;

const GOODS = {
  tea: { name: '茶', icon: '🍵', chip: 'chip-tea', card: 'card-tea' },
  rice: { name: '米', icon: '🌾', chip: 'chip-rice', card: 'card-rice' },
  cloth: { name: '布', icon: '🧵', chip: 'chip-cloth', card: 'card-cloth' },
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

const TILES = [
  { pos: 0, name: '地元', icon: '🏡', isFacility: true, short: '納品', costText: '1塩＝1点' },
  { pos: 1, name: '街道', icon: '🛣️', isFacility: false },
  { pos: 2, name: '箱屋', icon: '🛖', isFacility: true, short: '拡張', costText: '手札5/8塩 荷箱5/8塩' },
  { pos: 3, name: '街道', icon: '🛣️', isFacility: false },
  { pos: 4, name: '港', icon: '⚓', isFacility: true, short: '売却', costText: '塩＋会所(+0/+3/+6)' },
  { pos: 5, name: '街道', icon: '🛣️', isFacility: false },
  { pos: 6, name: '会所', icon: '🏛️', isFacility: true, short: '強化', costText: '5塩 / 8塩' },
  { pos: 7, name: '街道', icon: '🛣️', isFacility: false },
];

const PLAYERS_DEF = [
  { name: 'あなた', color: '#c53030', isHuman: true },
  { name: 'BOT1', color: '#2b6cb0', isHuman: false },
  { name: 'BOT2', color: '#2f855a', isHuman: false },
  { name: 'BOT3', color: '#6b46c1', isHuman: false }
];

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
      name: `${GOODS[t].icon}${GOODS[t].name} ${nums[0]}×3 (刻子)`,
      shortName: `${GOODS[t].icon}${nums[0]}×3 (刻子)`,
      salt: baseSalt + 3,
      isTriplet: true,
      cards,
      type: t
    };
  }
  // 連続3枚（順子）: 基本塩そのまま
  if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2]) {
    return {
      name: `${GOODS[t].icon}${GOODS[t].name} ${nums[0]}-${nums[2]} (順子)`,
      shortName: `${GOODS[t].icon}${nums[0]}-${nums[2]}`,
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

// 手札の評価関数（牌効率・セット期待値）
function evaluateHandValue(hand) {
  if (!hand || hand.length === 0) return 0;
  const sets = findSets(hand);
  let value = 0;
  const usedCardIds = new Set();
  sets.forEach(s => {
    const ids = s.trio.map(c => c.id);
    if (!ids.some(id => usedCardIds.has(id))) {
      ids.forEach(id => usedCardIds.add(id));
      value += 100 + s.info.salt * 15;
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
          value += 30; // 対子（刻子への期待値）
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

// 不要牌の優先度算出（手札の価値を落とさない順）
function getCardDiscardPriorities(hand) {
  if (!hand || hand.length === 0) return [];
  const baseValue = evaluateHandValue(hand);
  return hand.map((c, idx) => {
    const withoutC = hand.filter((_, i) => i !== idx);
    const valAfter = evaluateHandValue(withoutC);
    const loss = baseValue - valAfter;
    return { card: c, idx, loss };
  }).sort((a, b) => a.loss - b.loss);
}

function initGame() {
  const d = createDeck();
  const players = PLAYERS_DEF.map((def, i) => ({
    id: i,
    name: def.name,
    color: def.color,
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
  return {
    deck: d,
    discard: [],
    road,
    players,
    turn: 0,
    step: 1, // 1: 移動, 2: 補充, 3: 行動, 4: 返却
    facilityUsed: false,
    gameOver: false,
    excessCount: 0
  };
}

function App() {
  const [state, setState] = useState(initGame);
  const [overflowSelectedIds, setOverflowSelectedIds] = useState([]);
  const [selectedHandIds, setSelectedHandIds] = useState([]);
  const [selectedBoxIndices, setSelectedBoxIndices] = useState([]);

  const p = state.players[state.turn];
  const isHuman = (state.turn === 0);
  const me = state.players[0];
  const myHandLimit = HAND_LIMITS[me.handLimitLv - 1];

  const mySets = useMemo(() => findSets(me.hand), [me.hand]);
  const availableCargoSalt = useMemo(() => me.boxes.reduce((sum, b) => sum + (b.cargo ? b.cargo.salt : 0), 0), [me.boxes]);

  // 選択された荷箱のリソース
  const selectedBoxes = useMemo(() => {
    return me.boxes.filter((b, idx) => selectedBoxIndices.includes(idx) && b.cargo);
  }, [me.boxes, selectedBoxIndices]);

  const selectedCargoSalt = useMemo(() => {
    return selectedBoxes.reduce((sum, b) => sum + (b.cargo ? b.cargo.salt : 0), 0);
  }, [selectedBoxes]);

  // 荷箱選択トグル
  const toggleBoxSelection = (boxIdx) => {
    if (!isHuman || state.step !== 3) return;
    const box = me.boxes[boxIdx];
    if (!box || !box.cargo) return;
    if (selectedBoxIndices.includes(boxIdx)) {
      setSelectedBoxIndices(selectedBoxIndices.filter(i => i !== boxIdx));
    } else {
      setSelectedBoxIndices([...selectedBoxIndices, boxIdx]);
    }
  };

  // 手札で選択されたカードとセット判定
  const selectedCards = useMemo(() => {
    return me.hand.filter(c => selectedHandIds.includes(c.id));
  }, [me.hand, selectedHandIds]);

  const selectedSetInfo = useMemo(() => {
    if (selectedCards.length === 3) {
      return evalSet(selectedCards);
    }
    return null;
  }, [selectedCards]);

  // Step 1: 移動
  const handleMove = (cardIdx) => {
    if (!isHuman || state.step !== 1) return;
    const card = me.hand[cardIdx];
    const nextPos = (p.pos + card.num) % 8;

    const newRoad = state.road.map((arr, i) => i === p.pos ? [...arr, card] : arr);
    const remainingHand = me.hand.filter((_, idx) => idx !== cardIdx);

    const newPlayers = state.players.map((pl, i) => i === 0 ? {
      ...pl,
      pos: nextPos,
      hand: remainingHand
    } : pl);

    setSelectedHandIds([]);
    setState(prev => ({
      ...prev,
      road: newRoad,
      players: newPlayers,
      step: 2,
      facilityUsed: false
    }));
  };

  // 選択した手札3枚を荷箱に積む
  const handlePackSelectedCards = () => {
    if (!selectedSetInfo || state.step !== 3) return;
    const emptyIdx = me.boxes.findIndex(b => b.unlocked && !b.cargo && b.salt === 0);
    if (emptyIdx === -1) return;

    const ids = selectedCards.map(c => c.id);
    const remainingHand = me.hand.filter(c => !ids.includes(c.id));

    const newPlayers = state.players.map((pl, i) => {
      if (i !== 0) return pl;
      return {
        ...pl,
        hand: remainingHand,
        boxes: pl.boxes.map((b, bI) => bI === emptyIdx ? { ...b, cargo: selectedSetInfo } : b)
      };
    });

    setSelectedHandIds([]);
    setState(prev => ({ ...prev, players: newPlayers }));
  };

  // 港での個別売却
  const handlePortSellBox = (boxIdx) => {
    const box = me.boxes[boxIdx];
    if (!isHuman || state.step !== 3 || p.pos !== 4 || !box || !box.cargo) return;
    const bonus = me.guildLv === 1 ? 0 : me.guildLv === 2 ? 3 : 6;
    const gain = box.cargo.salt + bonus;
    const returnedCards = box.cargo.cards || [];

    const newBoxes = me.boxes.map((b, idx) => idx === boxIdx ? { ...b, cargo: null, salt: (b.salt || 0) + gain } : b);

    setState(prev => ({
      ...prev,
      discard: [...prev.discard, ...returnedCards],
      players: prev.players.map((pl, i) => i === 0 ? { ...pl, boxes: newBoxes } : pl)
    }));
  };

  // 施設アクション
  const handleFacility = (type) => {
    if (!isHuman || state.step !== 3) return;
    const pos = p.pos;

    // 0: 地元
    if (pos === 0) {
      let gain = 0;
      const newBoxes = me.boxes.map(b => {
        if (!b.unlocked) return b;
        gain += (b.salt || 0);
        return { ...b, salt: 0 };
      });
      if (gain === 0) return;
      const newScore = me.score + gain;
      setState(prev => ({
        ...prev,
        gameOver: newScore >= WIN_SCORE,
        players: prev.players.map((pl, i) => i === 0 ? { ...pl, score: newScore, boxes: newBoxes } : pl)
      }));
    }
    // 2: 箱屋 (拡張: 手札5/8塩, 荷箱5/8塩)
    else if (pos === 2) {
      const useSelected = selectedBoxIndices.length > 0;
      const saltToUse = useSelected ? selectedCargoSalt : availableCargoSalt;

      if (type === 'handLimit' && me.handLimitLv < 3) {
        const cost = me.handLimitLv === 1 ? 5 : 8;
        if (saltToUse < cost) return;

        let rem = cost;
        const returnedCards = [];
        const newBoxes = me.boxes.map((b, idx) => {
          if ((!useSelected || selectedBoxIndices.includes(idx)) && b.cargo && rem > 0) {
            rem -= b.cargo.salt;
            if (b.cargo.cards) returnedCards.push(...b.cargo.cards);
            return { ...b, cargo: null };
          }
          return b;
        });

        setSelectedBoxIndices([]);
        setState(prev => ({
          ...prev,
          discard: [...prev.discard, ...returnedCards],
          players: prev.players.map((pl, i) => i === 0 ? { ...pl, handLimitLv: pl.handLimitLv + 1, boxes: newBoxes } : pl)
        }));
      } else if (type === 'boxes' && me.boxesLv < 3) {
        const cost = me.boxesLv === 1 ? 5 : 8;
        if (saltToUse < cost) return;

        let rem = cost;
        const returnedCards = [];
        const newBoxes = me.boxes.map((b, idx) => {
          if (idx === me.boxesLv) return { ...b, unlocked: true };
          if ((!useSelected || selectedBoxIndices.includes(idx)) && b.cargo && rem > 0) {
            rem -= b.cargo.salt;
            if (b.cargo.cards) returnedCards.push(...b.cargo.cards);
            return { ...b, cargo: null };
          }
          return b;
        });

        setSelectedBoxIndices([]);
        setState(prev => ({
          ...prev,
          discard: [...prev.discard, ...returnedCards],
          players: prev.players.map((pl, i) => i === 0 ? { ...pl, boxesLv: pl.boxesLv + 1, boxes: newBoxes } : pl)
        }));
      }
    }
    // 6: 会所 (強化: 5塩/8塩)
    else if (pos === 6 && type === 'guild' && me.guildLv < 3) {
      const cost = me.guildLv === 1 ? 5 : 8;
      const useSelected = selectedBoxIndices.length > 0;
      const saltToUse = useSelected ? selectedCargoSalt : availableCargoSalt;
      if (saltToUse < cost) return;

      let rem = cost;
      const returnedCards = [];
      const newBoxes = me.boxes.map((b, idx) => {
        if ((!useSelected || selectedBoxIndices.includes(idx)) && b.cargo && rem > 0) {
          rem -= b.cargo.salt;
          if (b.cargo.cards) returnedCards.push(...b.cargo.cards);
          return { ...b, cargo: null };
        }
        return b;
      });

      setSelectedBoxIndices([]);
      setState(prev => ({
        ...prev,
        discard: [...prev.discard, ...returnedCards],
        players: prev.players.map((pl, i) => i === 0 ? { ...pl, guildLv: pl.guildLv + 1, boxes: newBoxes } : pl)
      }));
    }
  };

  // Step 2: 補充 -> Step 3（行動）へ
  const handleReplenishDeck = () => {
    if (!isHuman || state.step !== 2) return;
    const needed = Math.max(0, myHandLimit - me.hand.length);
    const res = drawSafe(needed, state.deck, state.discard);

    const newPlayers = state.players.map((pl, i) => i === 0 ? {
      ...pl,
      hand: [...pl.hand, ...res.drawn]
    } : pl);

    setSelectedHandIds([]);
    setSelectedBoxIndices([]);
    setState(prev => ({
      ...prev,
      deck: res.newDeck,
      discard: res.newDiscard,
      players: newPlayers,
      step: 3
    }));
  };

  const handleReplenishRoad = () => {
    if (!isHuman || state.step !== 2) return;
    const roadCards = state.road[p.pos] || [];
    if (roadCards.length === 0) return;
    const combinedHand = [...me.hand, ...roadCards];
    const newRoad = state.road.map((arr, i) => i === p.pos ? [] : arr);

    setSelectedHandIds([]);
    setSelectedBoxIndices([]);
    if (combinedHand.length > myHandLimit) {
      const excess = combinedHand.length - myHandLimit;
      const newPlayers = state.players.map((pl, i) => i === 0 ? { ...pl, hand: combinedHand } : pl);
      setOverflowSelectedIds([]);
      setState(prev => ({
        ...prev,
        road: newRoad,
        players: newPlayers,
        step: 4,
        excessCount: excess
      }));
    } else {
      const newPlayers = state.players.map((pl, i) => i === 0 ? { ...pl, hand: combinedHand } : pl);
      setState(prev => ({
        ...prev,
        road: newRoad,
        players: newPlayers,
        step: 3
      }));
    }
  };

  // Step 4: 返却確定 -> Step 3（行動）へ
  const handleConfirmExcess = () => {
    if (!isHuman || state.step !== 4 || overflowSelectedIds.length !== state.excessCount) return;
    const returned = me.hand.filter(c => overflowSelectedIds.includes(c.id));
    const finalHand = me.hand.filter(c => !overflowSelectedIds.includes(c.id));
    const newRoad = state.road.map((arr, i) => i === p.pos ? [...arr, ...returned] : arr);

    const newPlayers = state.players.map((pl, i) => i === 0 ? { ...pl, hand: finalHand } : pl);
    setOverflowSelectedIds([]);
    setSelectedHandIds([]);
    setSelectedBoxIndices([]);

    setState(prev => ({
      ...prev,
      road: newRoad,
      players: newPlayers,
      step: 3
    }));
  };

  // Step 3: 手番終了
  const handleEndTurn = () => {
    if (!isHuman || state.step !== 3) return;
    setSelectedHandIds([]);
    setOverflowSelectedIds([]);
    setSelectedBoxIndices([]);
    setState(prev => ({
      ...prev,
      turn: (prev.turn + 1) % 4,
      step: 1,
      facilityUsed: false
    }));
  };

  // BOT loop
  useEffect(() => {
    if (state.gameOver || state.turn === 0) return;

    const timer = setTimeout(() => {
      const curr = state.players[state.turn];
      const botHandLimit = HAND_LIMITS[curr.handLimitLv - 1];

      if (state.step === 1) {
        const hList = curr.hand;
        if (!hList || hList.length === 0) { setState(prev => ({ ...prev, step: 2 })); return; }

        const priorities = getCardDiscardPriorities(hList);
        const totalSalt = curr.boxes.reduce((s, b) => s + (b.salt || 0), 0);
        const hasSalt = totalSalt > 0;
        const hasCargo = curr.boxes.some(b => b.cargo);
        const availableCargo = curr.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.salt : 0), 0);

        let bestScore = -99999;
        let bestIdx = 0;

        hList.forEach((c, idx) => {
          const target = (curr.pos + c.num) % 8;
          let score = 0;

          const pInfo = priorities.find(p => p.idx === idx);
          const discardEfficiency = 100 - (pInfo ? pInfo.loss : 50);
          score += discardEfficiency * 0.9;

          if (target === 0) {
            if (hasSalt) {
              score += 180 + totalSalt * 25;
              if (curr.score + totalSalt >= WIN_SCORE) score += 2000;
            } else {
              score -= 20;
            }
          } else if (target === 4) {
            if (hasCargo) {
              const bonus = curr.guildLv === 1 ? 0 : curr.guildLv === 2 ? 3 : 6;
              const expectedSalt = curr.boxes.reduce((s, b) => s + (b.cargo ? b.cargo.salt + bonus : 0), 0);
              score += 140 + expectedSalt * 15;
            } else {
              score -= 25;
            }
          } else if (target === 2) {
            if (curr.handLimitLv === 1 && availableCargo >= 5) score += 140;
            else if (curr.handLimitLv === 2 && availableCargo >= 8) score += 80;
            if (curr.boxesLv === 1 && availableCargo >= 5) score += 150;
            else if (curr.boxesLv === 2 && availableCargo >= 8) score += 90;
          } else if (target === 6) {
            const cost = curr.guildLv === 1 ? 5 : 8;
            if (curr.guildLv < 3 && availableCargo >= cost) {
              score += (curr.guildLv === 1 ? 140 : 90);
            }
          }

          const roadStack = state.road[target] || [];
          if (roadStack.length > 0) {
            const handWithRoad = [...hList.filter((_, i) => i !== idx), ...roadStack];
            const gain = evaluateHandValue(handWithRoad) - evaluateHandValue(hList);
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

        const c = hList[bestIdx];
        const nextPos = (curr.pos + c.num) % 8;
        const newRoad = state.road.map((arr, i) => i === curr.pos ? [...arr, c] : arr);
        const newPlayers = state.players.map((pl, i) => i === state.turn ? {
          ...pl,
          pos: nextPos,
          hand: pl.hand.filter((_, idx) => idx !== bestIdx)
        } : pl);

        setState(prev => ({
          ...prev,
          road: newRoad,
          players: newPlayers,
          step: 2
        }));
      } else if (state.step === 2) {
        let bxs = [...curr.boxes];
        let sc = curr.score;
        let newDiscard = [...state.discard];
        let hnd = [...curr.hand];

        let newRoad = state.road;
        let newDeck = state.deck;
        const roadStack = state.road[curr.pos] || [];

        let shouldTakeRoad = false;
        if (roadStack.length > 0) {
          const setsBefore = findSets(hnd).length;
          const setsAfter = findSets([...hnd, ...roadStack]).length;
          if (setsAfter > setsBefore || roadStack.length >= 2 || hnd.length < 3) shouldTakeRoad = true;
        }

        if (shouldTakeRoad) {
          const combined = [...hnd, ...roadStack];
          newRoad = state.road.map((arr, i) => i === curr.pos ? [] : arr);
          if (combined.length > botHandLimit) {
            const excess = combined.length - botHandLimit;
            const priorities = getCardDiscardPriorities(combined);
            const returnIds = priorities.slice(0, excess).map(p => p.card.id);
            const toReturn = combined.filter(c => returnIds.includes(c.id));
            hnd = combined.filter(c => !returnIds.includes(c.id));
            newRoad = state.road.map((arr, i) => i === curr.pos ? toReturn : arr);
          } else {
            hnd = combined;
          }
        } else {
          const needed = Math.max(0, botHandLimit - hnd.length);
          const res = drawSafe(needed, newDeck, newDiscard);
          hnd = [...hnd, ...res.drawn];
          newDeck = res.newDeck;
          newDiscard = res.newDiscard;
        }

        // 施設アクション
        if (curr.pos === 0) {
          bxs = bxs.map(b => {
            if (b.salt > 0) sc += b.salt;
            return { ...b, cargo: null, salt: 0 };
          });
        } else if (curr.pos === 4) {
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

        // セットを積む
        while (true) {
          const sets = findSets(hnd);
          const emptyIdx = bxs.findIndex(b => b.unlocked && !b.cargo && b.salt === 0);
          if (sets.length > 0 && emptyIdx !== -1) {
            const chosen = sets[0];
            const ids = chosen.trio.map(c => c.id);
            hnd = hnd.filter(c => !ids.includes(c.id));
            bxs[emptyIdx] = { ...bxs[emptyIdx], cargo: chosen.info };
          } else {
            break;
          }
        }

        const nextTurn = (state.turn + 1) % 4;
        const newPlayers = state.players.map((pl, i) => i === state.turn ? {
          ...pl,
          hand: hnd,
          boxes: bxs,
          score: sc
        } : pl);

        setState(prev => ({
          ...prev,
          road: newRoad,
          deck: newDeck,
          discard: newDiscard,
          players: newPlayers,
          gameOver: sc >= WIN_SCORE,
          turn: nextTurn,
          step: 1,
          facilityUsed: false
        }));
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [state.turn, state.step, state.gameOver]);

  // カード描画
  const renderCard = (c, onClick, isSelected = false) => {
    const meta = GOODS[c.type];
    return h('div', {
      key: c.id,
      onClick: onClick,
      className: `card ${meta.card} ${isSelected ? 'selected' : ''}`
    }, [
      h('div', { className: 'card-header' }, [
        h('span', { className: 'card-num' }, c.num),
        h('span', { className: 'card-icon-main' }, meta.icon)
      ]),
      h('div', { className: 'card-res-container' }, [
        h('span', { className: 'res-pill res-salt' }, `🧂${c.salt}`)
      ])
    ]);
  };

  // タイル上のカードチップ
  const renderChip = (c, idx) => {
    const meta = GOODS[c.type];
    return h('span', {
      key: c.id || idx,
      className: `chip ${meta.chip}`
    }, `${meta.icon}${c.num}`);
  };

  // タイル描画
  const renderTile = (t) => {
    const playersHere = state.players.filter(pl => pl.pos === t.pos);
    const roadCards = state.road[t.pos] || [];
    const isCurrent = p.pos === t.pos;

    return h('div', {
      key: t.pos,
      className: `tile ${t.isFacility ? 'facility' : ''} ${isCurrent ? 'current' : ''}`
    }, [
      h('div', { className: 'tile-title' }, [
        h('span', null, `${t.icon} ${t.name}`),
        t.isFacility ? (
          h('span', { className: 'tile-badge' }, t.short)
        ) : (
          roadCards.length > 0 && h('span', { style: { fontSize: '10px', color: '#e67700', fontWeight: 'bold' } }, `🃏${roadCards.length}`)
        )
      ]),

      t.isFacility && t.costText && h('div', { className: 'tile-cost-tag' }, t.costText),

      h('div', { className: 'tile-players' },
        playersHere.map(pl => h('div', {
          key: pl.id,
          className: 'player-dot',
          style: { backgroundColor: pl.color }
        }, pl.id === 0 ? '自' : `B${pl.id}`))
      ),

      h('div', { className: 'tile-cards' },
        roadCards.length === 0 ? (
          h('span', { className: 'tile-empty' }, '-')
        ) : (
          roadCards.map((c, i) => renderChip(c, i))
        )
      )
    ]);
  };

  // マップ中央操作ハブ
  const renderCenter = () => {
    if (!isHuman) {
      return h('div', { className: 'center-hub' }, [
        h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#4a5568' } }, `🤖 ${p.name} 思考中...`),
        h('div', { style: { fontSize: '11px', color: '#718096' } }, `${TILES[p.pos].icon} ${TILES[p.pos].name}`)
      ]);
    }

    // Step 1: 移動
    if (state.step === 1) {
      return h('div', { className: 'center-hub step-1' }, [
        h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: '#9b2c2c' } }, '🎯【1. 移動】'),
        h('div', { style: { fontSize: '11px', color: '#4a5568' } }, '手札を選んで進む')
      ]);
    }

    // Step 2: 補充
    if (state.step === 2) {
      const roadCards = state.road[p.pos] || [];
      const hasRoadCards = roadCards.length > 0;
      return h('div', { className: 'center-hub step-2' }, [
        h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: '#1971c2', marginBottom: '4px' } }, '🎴【2. 手札補充】'),
        h('div', { style: { display: 'flex', gap: '6px', width: '100%' } }, [
          h('button', {
            onClick: handleReplenishDeck,
            className: 'btn btn-primary',
            style: { flex: 1, fontSize: '10px', padding: '6px 4px' }
          }, `山札引く (${state.deck.length}枚)`),
          h('button', {
            onClick: handleReplenishRoad,
            disabled: !hasRoadCards,
            className: 'btn btn-warning',
            style: { flex: 1, fontSize: '10px', padding: '6px 4px' }
          }, `マス回収 (${roadCards.length}枚)`)
        ])
      ]);
    }

    // Step 4: 超過返却
    if (state.step === 4) {
      const needed = state.excessCount;
      const current = overflowSelectedIds.length;
      return h('div', { className: 'center-hub step-4' }, [
        h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#6b46c1' } }, '⚠️【手札超過】'),
        h('div', { style: { fontSize: '10px', color: '#4a5568' } }, `不要な手札を ${needed} 枚選んで戻す`),
        h('button', {
          disabled: current !== needed,
          onClick: handleConfirmExcess,
          className: 'btn btn-purple',
          style: { width: '100%', fontSize: '10px', padding: '4px 6px', marginTop: '2px' }
        }, `現在地に戻す (${current}/${needed})`)
      ]);
    }

    // Step 3: 行動（荷箱積み＆施設利用）
    if (state.step === 3) {
      const saltToUse = selectedBoxIndices.length > 0 ? selectedCargoSalt : availableCargoSalt;
      return h('div', { className: 'center-hub step-3' }, [
        h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#2b8a3e', display: 'flex', justifyContent: 'space-between', width: '100%' } }, [
          h('span', null, '⚡【3. 行動】'),
          h('span', { style: { fontSize: '10px', color: '#4a5568' } }, `${TILES[p.pos].name}`)
        ]),

        // 施設利用ボタン群
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', width: '100%' } }, [
          p.pos === 0 && (
            me.boxes.some(b => b.salt > 0) ? (
              h('button', {
                onClick: () => handleFacility('deliver'),
                className: 'btn btn-success',
                style: { width: '100%', fontSize: '11px', padding: '5px 4px', fontWeight: 'bold' }
              }, `🏡 🧂得点化 (+${me.boxes.reduce((s,b)=>s+b.salt,0)} 🏆)`)
            ) : null
          ),

          p.pos === 2 && (
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', width: '100%' } }, [
              selectedBoxIndices.length > 0 && h('div', { style: { fontSize: '10px', color: '#b26b00', fontWeight: 'bold', textAlign: 'center' } },
                `📦 箱選択中: 🧂${selectedCargoSalt}`
              ),
              h('div', { style: { display: 'flex', gap: '3px', width: '100%' } }, [
                me.handLimitLv < 3 && h('button', {
                  disabled: saltToUse < (me.handLimitLv === 1 ? 5 : 8),
                  onClick: () => handleFacility('handLimit'),
                  className: 'btn btn-warning',
                  style: { flex: 1, fontSize: '9px', padding: '4px 2px' }
                }, selectedBoxIndices.length > 0
                  ? `選択箱で🎴上限+1(🧂${me.handLimitLv === 1 ? 5 : 8})`
                  : `🎴上限+1(🧂${me.handLimitLv === 1 ? 5 : 8})`
                ),
                me.boxesLv < 3 && h('button', {
                  disabled: saltToUse < (me.boxesLv === 1 ? 5 : 8),
                  onClick: () => handleFacility('boxes'),
                  className: 'btn btn-purple',
                  style: { flex: 1, fontSize: '9px', padding: '4px 2px' }
                }, selectedBoxIndices.length > 0
                  ? `選択箱で📦枠+1(🧂${me.boxesLv === 1 ? 5 : 8})`
                  : `📦枠+1(🧂${me.boxesLv === 1 ? 5 : 8})`
                )
              ])
            ])
          ),

          p.pos === 4 && me.boxes.some(b => b.cargo) && (
            h('div', { style: { display: 'flex', gap: '3px', flexDirection: 'column', width: '100%' } }, [
              selectedBoxIndices.length > 0 && h('button', {
                onClick: () => {
                  selectedBoxIndices.forEach(idx => handlePortSellBox(idx));
                  setSelectedBoxIndices([]);
                },
                className: 'btn btn-primary',
                style: { width: '100%', fontSize: '10px', padding: '4px 6px', fontWeight: 'bold' }
              }, `⚓ 選択した${selectedBoxIndices.length}個の箱を一括売却`),
              me.boxes.map((b, idx) => b.cargo ? h('button', {
                key: idx,
                onClick: () => handlePortSellBox(idx),
                className: 'btn btn-primary',
                style: { width: '100%', fontSize: '9px', padding: '3px 4px' }
              }, `⚓ 箱${idx+1} (${b.cargo.shortName || b.cargo.name}) 売却`) : null)
            ])
          ),

          p.pos === 6 && me.guildLv < 3 && (
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' } }, [
              selectedBoxIndices.length > 0 && h('div', { style: { fontSize: '10px', color: '#2b8a3e', fontWeight: 'bold', textAlign: 'center' } },
                `📦 箱選択中: 🧂${selectedCargoSalt}`
              ),
              h('button', {
                disabled: saltToUse < (me.guildLv === 1 ? 5 : 8),
                onClick: () => handleFacility('guild'),
                className: 'btn btn-success',
                style: { width: '100%', fontSize: '10px', padding: '4px 6px' }
              }, selectedBoxIndices.length > 0
                ? `選択箱で🏛️会所Lv+1 (🧂${me.guildLv===1?5:8})`
                : `🏛️ 会所Lv+1 (🧂${me.guildLv===1?5:8})`
              )
            ])
          )
        ]),

        // 手番終了ボタン
        h('button', {
          onClick: handleEndTurn,
          className: 'btn btn-dark',
          style: { width: '100%', fontSize: '11px', padding: '6px 4px', fontWeight: 'bold' }
        }, '🏁 手番を終了する')
      ]);
    }

    return null;
  };

  if (state.gameOver) {
    const winner = state.players.reduce((prev, curr) => (curr.score > prev.score ? curr : prev), state.players[0]);
    return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', gap: '12px', textAlign: 'center' } }, [
      h('h1', { style: { fontSize: '22px', color: '#2d3748' } }, `👑 ${winner.name} の勝利！`),
      h('p', { style: { color: '#4a5568' } }, `🏆 ${winner.score} 点獲得`),
      h('button', {
        onClick: () => setState(initGame()),
        className: 'btn btn-primary',
        style: { padding: '8px 20px', fontSize: '14px' }
      }, '🔄 もう一度遊ぶ')
    ]);
  }

  const hasEmptyBox = me.boxes.some(b => b.unlocked && !b.cargo && b.salt === 0);

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
        h('a', {
          href: 'dashboard.html',
          className: 'btn btn-purple',
          style: { textDecoration: 'none', fontSize: '11px', padding: '3px 8px', borderRadius: '12px' }
        }, '📊 分析・検証')
      ])
    ]),

    // プレイヤー状況スコアボード（あなた ＋ BOT1〜3）
    h('div', { className: 'players-bar' },
      state.players.map(pl => {
        const isCurrentTurn = state.turn === pl.id;
        const isMe = pl.id === 0;
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
              h('span', { className: 'player-pos' }, `${TILES[pl.pos].icon} ${TILES[pl.pos].name}`),
              h('span', { className: 'player-hand-cnt' }, `🎴${pl.hand.length}枚`)
            ])
          ])
        ]);
      })
    ),

    // 3x3 街道マップ（中央が操作ハブ）
    h('div', { className: 'board' }, [
      renderTile(TILES[0]), renderTile(TILES[1]), renderTile(TILES[2]),
      renderTile(TILES[7]), renderCenter(),       renderTile(TILES[3]),
      renderTile(TILES[6]), renderTile(TILES[5]), renderTile(TILES[4])
    ]),

    // あなたの手札
    h('div', { className: 'section' }, [
      h('div', { className: 'section-title' }, [
        h('span', null, `🎴 手札 (${me.hand.length}/${myHandLimit}枚)`),
        isHuman && state.step === 1 && h('span', { style: { color: '#9b2c2c', fontWeight: 'bold' } }, 'カードを選んで進む'),
        isHuman && state.step === 2 && h('span', { style: { color: '#1971c2', fontWeight: 'bold' } }, '山札を引くか、マスのカードを全回収'),
        isHuman && state.step === 3 && (
          selectedSetInfo ? (
            hasEmptyBox ? (
              h('button', {
                onClick: handlePackSelectedCards,
                className: 'btn btn-success',
                style: { padding: '2px 8px', fontSize: '11px' }
              }, `📦 ${selectedSetInfo.name} を荷箱に積む`)
            ) : (
              h('span', { style: { color: '#d97706', fontSize: '11px' } }, '⚠️ 空きの荷箱がありません')
            )
          ) : selectedHandIds.length === 3 ? (
            h('span', { style: { color: '#c92a2a', fontSize: '11px' } }, '⚠️ 3枚組になりません')
          ) : (
            h('span', { style: { color: '#666', fontSize: '11px' } },
              selectedHandIds.length > 0
                ? `${selectedHandIds.length}/3枚選択中`
                : (mySets.length > 0 && hasEmptyBox)
                  ? '手札3枚を選んで荷詰め'
                  : '荷積み・施設を行うか手番を終了'
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
          (state.step === 3 && selectedHandIds.includes(c.id)) || (state.step === 4 && overflowSelectedIds.includes(c.id))
        ))
      )
    ]),

    // 商人手帳（得点・Lv・荷箱）
    h('div', { className: 'section' }, [
      h('div', { className: 'section-title' }, [
        h('span', null, `🏆 得点: ${me.score} / ${WIN_SCORE}点`),
        h('span', { style: { fontSize: '11px', color: '#718096' } },
          `🎴上限Lv.${me.handLimitLv} | 📦枠Lv.${me.boxesLv} | 🏛️会所Lv.${me.guildLv}`
        )
      ]),
      isHuman && state.step === 3 && (p.pos === 2 || p.pos === 6 || p.pos === 4) && me.boxes.some(b => b.cargo) && h('div', { style: { fontSize: '10px', color: '#d97706', fontWeight: 'bold' } },
        '💡 荷箱をクリックして、消費・売却する面子を選択できます'
      ),
      h('div', { className: 'boxes-row' },
        me.boxes.map((b, idx) => {
          const isSelected = selectedBoxIndices.includes(idx);
          const isSelectable = isHuman && state.step === 3 && !!b.cargo;
          return h('div', {
            key: idx,
            onClick: isSelectable ? () => toggleBoxSelection(idx) : undefined,
            className: `box ${!b.unlocked ? 'locked' : b.cargo ? 'has-cargo' : b.salt > 0 ? 'has-salt' : ''} ${isSelectable ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`
          }, [
            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' } }, [
              h('span', null, `📦 箱${idx + 1}`),
              isSelected && h('span', { style: { color: '#d97706', fontSize: '10px' } }, '✓ 選択中'),
              !isSelected && b.salt > 0 && h('span', { style: { color: '#2b6cb0' } }, `🧂×${b.salt}`)
            ]),
            !b.unlocked ? (
              h('span', { style: { textAlign: 'center', margin: 'auto 0', color: '#a0aec0' } }, '🔒 未解放')
            ) : b.cargo ? (
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', margin: 'auto 0' } }, [
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                  h('span', { style: { fontWeight: 'bold' } }, b.cargo.name),
                  isHuman && state.step === 3 && p.pos === 4 && h('button', {
                    onClick: (e) => { e.stopPropagation(); handlePortSellBox(idx); },
                    className: 'btn btn-primary',
                    style: { padding: '2px 6px', fontSize: '10px' }
                  }, '⚓ 売却')
                ]),
                h('div', { style: { fontSize: '10px', color: '#4a5568' } }, [
                  `🧂${b.cargo.salt}`
                ])
              ])
            ) : b.salt > 0 ? (
              h('span', { style: { fontSize: '10px', color: '#2b6cb0', fontWeight: 'bold', margin: 'auto 0' } }, '🏡 地元で得点化')
            ) : (
              h('span', { style: { textAlign: 'center', color: '#a0aec0', margin: 'auto 0' } }, '📦 空き')
            )
          ]);
        })
      )
    ])

  ]);
}

ReactDOM.render(h(App), document.getElementById('root'));
