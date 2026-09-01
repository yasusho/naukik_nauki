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

const TILES = [
  { pos: 0, name: '地元', icon: '🏡', isFacility: true, short: '納品', costText: '1塩＝1点' },
  { pos: 1, name: '街道', icon: '🛣️', isFacility: false },
  { pos: 2, name: '箱屋', icon: '🛖', isFacility: true, short: '拡張', costText: '荷箱 3塩 / 5塩' },
  { pos: 3, name: '街道', icon: '🛣️', isFacility: false },
  { pos: 4, name: '港', icon: '⚓', isFacility: true, short: '換金', costText: '売却(Lv2:+2/Lv3:×2)' },
  { pos: 5, name: '街道', icon: '🛣️', isFacility: false },
  { pos: 6, name: '会所', icon: '🏛️', isFacility: true, short: '強化', costText: '4塩 / 7塩' },
  { pos: 7, name: '街道', icon: '🛣️', isFacility: false },
];

const PLAYERS_DEF = [
  { name: 'あなた', color: '#c53030', isHuman: true },
  { name: 'BOT1', color: '#2b6cb0', isHuman: false },
  { name: 'BOT2', color: '#2f855a', isHuman: false },
  { name: 'BOT3', color: '#6b46c1', isHuman: false }
];

const HAND_LIMIT = 7;
const WIN_SCORE = 20;
const BOX_COSTS = [3, 5];
const GUILD_COSTS = [4, 7];

function calcPortSale(cargoSalt, guildLv) {
  if (guildLv === 1) return cargoSalt;
  if (guildLv === 2) return cargoSalt + 2;
  return cargoSalt * 2; // Lv3: 2倍！
}

function getGuildRateLabel(guildLv) {
  if (guildLv === 1) return '通常';
  if (guildLv === 2) return '港+2塩';
  return '🔥港2倍!';
}

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
function evalSet(cards) {
  if (!cards || cards.length !== 3) return null;
  const t = cards[0].type;
  if (!cards.every(c => c.type === t)) return null;

  const nums = cards.map(c => c.num).sort((a, b) => a - b);
  const baseSalt = cards.reduce((s, c) => s + c.salt, 0);

  // 同数3枚（刻子）
  if (nums[0] === nums[1] && nums[1] === nums[2]) {
    return {
      name: `${GOODS[t].icon}${GOODS[t].name} ${nums[0]}×3 (刻子)`,
      shortName: `${GOODS[t].icon}${nums[0]}×3`,
      salt: baseSalt,
      isTriplet: true,
      cards,
      type: t
    };
  }
  // 連続3枚（順子）
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
          value += 25; // 対子
        } else if (diff === 1) {
          value += (list[i].num === 1 || list[j].num === 5) ? 20 : 25; // 連続
        } else if (diff === 2) {
          value += 15; // 嵌張
        }
      }
    }
  });
  return value;
}

// 不要牌の優先度算出
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

  const mySets = useMemo(() => findSets(me.hand), [me.hand]);
  
  // 換金済み塩の総保有量
  const availableSalt = useMemo(() => me.boxes.reduce((sum, b) => sum + (b.salt || 0), 0), [me.boxes]);
  // 荷物（未換金セット）の数
  const cargoCount = useMemo(() => me.boxes.filter(b => b.cargo).length, [me.boxes]);

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

  // 港での個別売却・換金
  const handlePortSellBox = (boxIdx) => {
    const box = me.boxes[boxIdx];
    if (!isHuman || state.step !== 3 || p.pos !== 4 || !box || !box.cargo) return;
    const gain = calcPortSale(box.cargo.salt, me.guildLv);
    const returnedCards = box.cargo.cards || [];

    const newBoxes = me.boxes.map((b, idx) => idx === boxIdx ? { ...b, cargo: null, salt: (b.salt || 0) + gain } : b);

    setState(prev => ({
      ...prev,
      discard: [...prev.discard, ...returnedCards],
      players: prev.players.map((pl, i) => i === 0 ? { ...pl, boxes: newBoxes } : pl)
    }));
  };

  // 施設アクション（塩を支払って強化・得点化）
  const handleFacility = (type) => {
    if (!isHuman || state.step !== 3) return;
    const pos = p.pos;

    // 0: 地元（得点化）
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
    // 2: 箱屋 (荷箱枠拡張: 港で換金した塩 3/5 を支払う)
    else if (pos === 2 && type === 'boxes' && me.boxesLv < 3) {
      const cost = BOX_COSTS[me.boxesLv - 1];
      if (availableSalt < cost) return;

      let rem = cost;
      const newBoxes = me.boxes.map((b, idx) => {
        let updated = { ...b };
        if (idx === me.boxesLv) updated.unlocked = true;
        if (updated.salt > 0 && rem > 0) {
          const spend = Math.min(updated.salt, rem);
          rem -= spend;
          updated.salt -= spend;
        }
        return updated;
      });

      setState(prev => ({
        ...prev,
        players: prev.players.map((pl, i) => i === 0 ? { ...pl, boxesLv: pl.boxesLv + 1, boxes: newBoxes } : pl)
      }));
    }
    // 6: 会所 (強化: 港で換金した塩 4/7 を支払う)
    else if (pos === 6 && type === 'guild' && me.guildLv < 3) {
      const cost = GUILD_COSTS[me.guildLv - 1];
      if (availableSalt < cost) return;

      let rem = cost;
      const newBoxes = me.boxes.map(b => {
        if (b.salt > 0 && rem > 0) {
          const spend = Math.min(b.salt, rem);
          rem -= spend;
          return { ...b, salt: b.salt - spend };
        }
        return b;
      });

      setState(prev => ({
        ...prev,
        players: prev.players.map((pl, i) => i === 0 ? { ...pl, guildLv: pl.guildLv + 1, boxes: newBoxes } : pl)
      }));
    }
  };

  // Step 2: 補充 -> Step 3（行動）へ
  const handleReplenishDeck = () => {
    if (!isHuman || state.step !== 2) return;
    const needed = Math.max(0, HAND_LIMIT - me.hand.length);
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

    const combined = [...me.hand, ...roadCards];
    const newRoad = state.road.map((arr, i) => i === p.pos ? [] : arr);

    if (combined.length > HAND_LIMIT) {
      const excess = combined.length - HAND_LIMIT;
      const newPlayers = state.players.map((pl, i) => i === 0 ? { ...pl, hand: combined } : pl);
      setOverflowSelectedIds([]);
      setState(prev => ({
        ...prev,
        road: newRoad,
        players: newPlayers,
        step: 4,
        excessCount: excess
      }));
    } else {
      const newPlayers = state.players.map((pl, i) => i === 0 ? { ...pl, hand: combined } : pl);
      setState(prev => ({
        ...prev,
        road: newRoad,
        players: newPlayers,
        step: 3
      }));
    }
  };

  // Step 4: 超過カードを現在地に戻す
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

      if (state.step === 1) {
        const hList = curr.hand;
        if (!hList || hList.length === 0) { setState(prev => ({ ...prev, step: 2 })); return; }

        const priorities = getCardDiscardPriorities(hList);
        const totalSalt = curr.boxes.reduce((s, b) => s + (b.salt || 0), 0);
        const hasSalt = totalSalt > 0;
        const hasCargo = curr.boxes.some(b => b.cargo);

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
              const expectedSalt = curr.boxes.reduce((s, b) => s + (b.cargo ? calcPortSale(b.cargo.salt, curr.guildLv) : 0), 0);
              score += 160 + expectedSalt * 15;
            } else {
              score -= 25;
            }
          } else if (target === 2 && curr.boxesLv < 3) {
            const cost = BOX_COSTS[curr.boxesLv - 1];
            if (totalSalt >= cost) score += 190;
          } else if (target === 6 && curr.guildLv < 3) {
            const cost = GUILD_COSTS[curr.guildLv - 1];
            if (totalSalt >= cost) score += (curr.guildLv === 1 ? 190 : 210);
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

        const c = hList[bestIdx] || hList[0];
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
          if (setsAfter > setsBefore || roadStack.length >= 2 || hnd.length < 4) shouldTakeRoad = true;
        }

        if (shouldTakeRoad) {
          const combined = [...hnd, ...roadStack];
          newRoad = state.road.map((arr, i) => i === curr.pos ? [] : arr);
          if (combined.length > HAND_LIMIT) {
            const excess = combined.length - HAND_LIMIT;
            const priorities = getCardDiscardPriorities(combined);
            const returnIds = priorities.slice(0, excess).map(p => p.card.id);
            const toReturn = combined.filter(c => returnIds.includes(c.id));
            hnd = combined.filter(c => !returnIds.includes(c.id));
            newRoad = state.road.map((arr, i) => i === curr.pos ? toReturn : arr);
          } else {
            hnd = combined;
          }
        } else {
          const needed = Math.max(0, HAND_LIMIT - hnd.length);
          const res = drawSafe(needed, newDeck, newDiscard);
          hnd = [...hnd, ...res.drawn];
          newDeck = res.newDeck;
          newDiscard = res.newDiscard;
        }

        // 施設アクション
        if (curr.pos === 0) {
          // 地元: 塩の得点化
          bxs = bxs.map(b => {
            if (b.salt > 0) sc += b.salt;
            return { ...b, cargo: null, salt: 0 };
          });
        } else if (curr.pos === 4) {
          // 港: セット売却・換金 (Lv2:+2, Lv3:×2)
          bxs = bxs.map(b => {
            if (b.unlocked && b.cargo) {
              const gain = calcPortSale(b.cargo.salt, curr.guildLv);
              if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
              return { ...b, cargo: null, salt: (b.salt || 0) + gain };
            }
            return b;
          });
        } else if (curr.pos === 2 && curr.boxesLv < 3) {
          // 箱屋: 換金済み塩を支払って荷箱拡張 (3/5塩)
          const cost = BOX_COSTS[curr.boxesLv - 1];
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
        } else if (curr.pos === 6 && curr.guildLv < 3) {
          // 会所: 換金済み塩 4/7 を支払って強化
          const cost = GUILD_COSTS[curr.guildLv - 1];
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

        const isWin = sc >= WIN_SCORE;
        const newPlayers = state.players.map((pl, i) => i === state.turn ? {
          ...pl,
          score: sc,
          hand: hnd,
          boxes: bxs,
          boxesLv: curr.boxesLv,
          guildLv: curr.guildLv
        } : pl);

        setState(prev => ({
          ...prev,
          deck: newDeck,
          discard: newDiscard,
          road: newRoad,
          players: newPlayers,
          turn: isWin ? prev.turn : (prev.turn + 1) % 4,
          step: 1,
          facilityUsed: false,
          gameOver: isWin
        }));
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [state.turn, state.step, state.gameOver]);

  // レンダリング補助関数
  const renderCard = (card, onClick, isSelected = false, isOverflow = false) => {
    const g = GOODS[card.type];
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
          ? h('span', { className: 'tile-empty' }, 'なし')
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
        h('div', { style: { fontSize: '10px', color: '#4a5568' } }, '下の手札から1枚選んで進む')
      ]);
    }

    // Step 2: 補充
    if (state.step === 2) {
      const roadCards = state.road[p.pos] || [];
      return h('div', { className: 'center-hub step-2' }, [
        h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#1971c2' } }, '📥【2. 補充】'),
        h('div', { style: { display: 'flex', gap: '4px', width: '100%', marginTop: '2px' } }, [
          h('button', {
            onClick: handleReplenishDeck,
            className: 'btn btn-primary',
            style: { flex: 1, fontSize: '10px', padding: '5px 2px' }
          }, `🎴 山札 (${HAND_LIMIT}枚まで)`),
          h('button', {
            disabled: roadCards.length === 0,
            onClick: handleReplenishRoad,
            className: 'btn btn-purple',
            style: { flex: 1, fontSize: '10px', padding: '5px 2px' }
          }, `🛣️ マス回収 (${roadCards.length}枚)`)
        ])
      ]);
    }

    // Step 4: 返却
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
      return h('div', { className: 'center-hub step-3' }, [
        h('div', { style: { fontSize: '12px', fontWeight: 'bold', color: '#2b8a3e', display: 'flex', justifyContent: 'space-between', width: '100%' } }, [
          h('span', null, '⚡【3. 行動】'),
          h('span', { style: { fontSize: '10px', color: '#4a5568' } }, `${TILES[p.pos].name}`)
        ]),

        // 施設利用ボタン群
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', width: '100%' } }, [
          // 地元(0)
          p.pos === 0 && (
            availableSalt > 0 ? (
              h('button', {
                onClick: () => handleFacility('deliver'),
                className: 'btn btn-success',
                style: { width: '100%', fontSize: '11px', padding: '5px 4px', fontWeight: 'bold' }
              }, `🏡 🧂得点化 (+${availableSalt} 🏆)`)
            ) : h('div', { style: { fontSize: '10px', color: '#718096', textAlign: 'center' } }, '換金した塩がありません（港で売却して運ぼう）')
          ),

          // 箱屋(2): 港で換金した塩 3/5 を支払って荷箱拡張
          p.pos === 2 && (
            me.boxesLv < 3 ? (
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', width: '100%' } }, [
                h('div', { style: { fontSize: '10px', color: availableSalt > 0 ? '#b26b00' : '#718096', fontWeight: 'bold', textAlign: 'center' } },
                  availableSalt > 0 ? `🧂 所持塩: ${availableSalt}` : `⚠️ 港で換金した塩が必要 (所持: 0)`
                ),
                h('button', {
                  disabled: availableSalt < BOX_COSTS[me.boxesLv - 1],
                  onClick: () => handleFacility('boxes'),
                  className: 'btn btn-purple',
                  style: { width: '100%', fontSize: '10px', padding: '5px 4px' }
                }, `📦 荷箱${me.boxesLv + 1}枠目を解放 (🧂${BOX_COSTS[me.boxesLv - 1]}塩)`)
              ])
            ) : h('div', { style: { fontSize: '10px', color: '#7c3aed', textAlign: 'center' } }, '📦 荷箱枠最大 (3枠)')
          ),

          // 港(4): セット売却・換金
          p.pos === 4 && (
            cargoCount > 0 ? (
              h('div', { style: { display: 'flex', gap: '3px', flexDirection: 'column', width: '100%' } }, [
                me.boxes.map((b, idx) => b.cargo ? h('button', {
                  key: idx,
                  onClick: () => handlePortSellBox(idx),
                  className: 'btn btn-primary',
                  style: { width: '100%', fontSize: '9px', padding: '3px 4px' }
                }, `⚓ 箱${idx+1} (${b.cargo.shortName || b.cargo.name}) 売却 ➔ 🧂${calcPortSale(b.cargo.salt, me.guildLv)}塩`) : null)
              ])
            ) : h('div', { style: { fontSize: '10px', color: '#718096', textAlign: 'center' } }, '荷箱に売却するセットがありません')
          ),

          // 会所(6): 港で換金した塩 4/7 を支払う
          p.pos === 6 && (
            me.guildLv < 3 ? (
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' } }, [
                h('div', { style: { fontSize: '10px', color: availableSalt > 0 ? '#2b8a3e' : '#718096', fontWeight: 'bold', textAlign: 'center' } },
                  availableSalt > 0 ? `🧂 所持塩: ${availableSalt}` : `⚠️ 港で換金した塩が必要 (所持: 0)`
                ),
                h('button', {
                  disabled: availableSalt < GUILD_COSTS[me.guildLv - 1],
                  onClick: () => handleFacility('guild'),
                  className: 'btn btn-success',
                  style: { width: '100%', fontSize: '10px', padding: '4px 6px' }
                }, me.guildLv === 1 ? `🏛️ 会所Lv2 (港+2塩) (🧂4塩)` : `🔥 会所Lv3 (港売却2倍!) (🧂7塩)`)
              ])
            ) : h('div', { style: { fontSize: '10px', color: '#2b8a3e', textAlign: 'center' } }, '🏛️ 会所Lv最大 (Lv3: 港2倍!)')
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

    // あなたの手札（7枚固定）
    h('div', { className: 'section' }, [
      h('div', { className: 'section-title' }, [
        h('span', null, `🎴 手札 (${me.hand.length}/${HAND_LIMIT}枚)`),
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
          selectedHandIds.includes(c.id),
          overflowSelectedIds.includes(c.id)
        ))
      )
    ]),

    // あなたの個人ボード（荷箱3枠 ＆ 会所レベル最大Lv3）
    h('div', { className: 'section player-board-section' }, [
      h('div', { className: 'section-title' }, [
        h('span', null, '📦 あなたの個人ボード'),
        h('div', { className: 'levels-badges' }, [
          h('span', { className: 'level-badge-box' }, `📦 荷箱枠 Lv.${me.boxesLv} (${me.boxesLv}枠 / 最大3枠)`),
          h('span', { className: 'level-badge-guild' }, `🏛️ 会所 Lv.${me.guildLv} (${getGuildRateLabel(me.guildLv)} / 最大Lv3)`),
        ])
      ]),

      h('div', { className: 'cargo-boxes-grid' },
        me.boxes.map((b, idx) => {
          if (!b.unlocked) {
            return h('div', { key: idx, className: 'cargo-box-card box-locked' }, [
              h('div', { className: 'cargo-box-num' }, `荷箱 ${idx + 1}`),
              h('div', { className: 'cargo-box-empty-text' }, `🔒 未拡張 (箱屋: 🧂${BOX_COSTS[idx - 1]}塩)`)
            ]);
          }

          if (b.salt > 0) {
            return h('div', {
              key: idx,
              className: `cargo-box-card box-has-salt`
            }, [
              h('div', { className: 'cargo-box-header' }, [
                h('span', { className: 'cargo-box-num' }, `荷箱 ${idx + 1}`),
                h('span', { className: 'cargo-badge-salt' }, `換金済み`)
              ]),
              h('div', { className: 'cargo-salt-display' }, [
                h('span', { className: 'cargo-salt-icon' }, '🧂'),
                h('span', { className: 'cargo-salt-val' }, b.salt),
                h('span', { className: 'cargo-salt-unit' }, '塩')
              ]),
              h('div', { style: { fontSize: '10px', color: '#4a5568' } }, '箱屋/会所で支払 or 地元で得点')
            ]);
          }

          if (b.cargo) {
            const isPort = (isHuman && state.step === 3 && p.pos === 4);
            const salePrice = calcPortSale(b.cargo.salt, me.guildLv);
            return h('div', {
              key: idx,
              className: `cargo-box-card box-loaded`
            }, [
              h('div', { className: 'cargo-box-header' }, [
                h('span', { className: 'cargo-box-num' }, `荷箱 ${idx + 1}`),
                h('span', { className: 'cargo-badge-res' }, `荷物`)
              ]),
              h('div', { className: 'cargo-box-name' }, b.cargo.name),
              h('div', { className: 'cargo-box-vals' }, [
                h('span', { className: 'cargo-val-pill' }, `🧂${b.cargo.salt}塩`),
                me.guildLv === 3 && h('span', { className: 'cargo-val-pill', style: { background: '#f59e0b', color: '#fff' } }, '🔥2倍')
              ]),
              isPort && h('button', {
                onClick: () => handlePortSellBox(idx),
                className: 'btn btn-primary',
                style: { marginTop: '4px', fontSize: '10px', padding: '2px 6px' }
              }, `⚓ 売却 ➔ 🧂${salePrice}塩`)
            ]);
          }

          return h('div', { key: idx, className: 'cargo-box-card box-empty' }, [
            h('div', { className: 'cargo-box-num' }, `荷箱 ${idx + 1}`),
            h('div', { className: 'cargo-box-empty-text' }, '空き')
          ]);
        })
      )
    ])

  ]);
}

ReactDOM.render(h(App), document.getElementById('root'));
