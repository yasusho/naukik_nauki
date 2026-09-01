const { useState, useEffect, useMemo, createElement: h } = React;

const GOODS = {
  tea: { name: '茶', icon: '🍵', chip: 'chip-tea', card: 'card-tea' },
  rice: { name: '米', icon: '🌾', chip: 'chip-rice', card: 'card-rice' },
  cloth: { name: '布', icon: '🧵', chip: 'chip-cloth', card: 'card-cloth' },
};

const CARD_TEMPLATES = {
  tea: [
    { num: 1, salt: 2, porter: 0, pack: 0 },
    { num: 2, salt: 1, porter: 1, pack: 0 },
    { num: 3, salt: 1, porter: 0, pack: 0 },
    { num: 4, salt: 1, porter: 0, pack: 1 },
    { num: 5, salt: 2, porter: 0, pack: 0 },
  ],
  rice: [
    { num: 1, salt: 0, porter: 2, pack: 0 },
    { num: 2, salt: 1, porter: 1, pack: 0 },
    { num: 3, salt: 0, porter: 1, pack: 0 },
    { num: 4, salt: 0, porter: 1, pack: 1 },
    { num: 5, salt: 0, porter: 2, pack: 0 },
  ],
  cloth: [
    { num: 1, salt: 0, porter: 0, pack: 2 },
    { num: 2, salt: 1, porter: 0, pack: 1 },
    { num: 3, salt: 0, porter: 0, pack: 1 },
    { num: 4, salt: 0, porter: 1, pack: 1 },
    { num: 5, salt: 0, porter: 0, pack: 2 },
  ]
};

const TILES = [
  { pos: 0, name: '地元', icon: '🏡', isFacility: true, short: '納品' },
  { pos: 1, name: '街道', icon: '🛣️', isFacility: false },
  { pos: 2, name: '箱屋', icon: '🛖', isFacility: true, short: '拡張' },
  { pos: 3, name: '山道', icon: '⛰️', isFacility: false },
  { pos: 4, name: '港', icon: '⚓', isFacility: true, short: '売却' },
  { pos: 5, name: '街道', icon: '🛣️', isFacility: false },
  { pos: 6, name: '会所', icon: '🏛️', isFacility: true, short: '強化' },
  { pos: 7, name: '街道', icon: '🛣️', isFacility: false },
];

const PLAYERS_DEF = [
  { name: 'あなた', color: '#c53030', isHuman: true },
  { name: 'BOT1', color: '#2b6cb0', isHuman: false },
  { name: 'BOT2', color: '#2f855a', isHuman: false },
  { name: 'BOT3', color: '#6b46c1', isHuman: false }
];

const HAND_LIMITS = [5, 6, 7];
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
      name: `${GOODS[t].icon}${GOODS[t].name} ${nums[0]}×3`,
      shortName: `${GOODS[t].icon}${nums[0]}×3`,
      salt,
      porter,
      pack,
      cards,
      type: t
    };
  }
  if (nums[0] + 1 === nums[1] && nums[1] + 1 === nums[2]) {
    return {
      name: `${GOODS[t].icon}${GOODS[t].name} ${nums[0]}-${nums[2]}`,
      shortName: `${GOODS[t].icon}${nums[0]}-${nums[2]}`,
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
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const trio = [hand[i], hand[j], hand[k]];
        const r = evalSet(trio);
        if (r) {
          const key = trio.map(c => c.id).sort().join('-');
          if (!list.some(x => x.key === key)) list.push({ trio, info: r, key });
        }
      }
    }
  }
  return list;
}

function initGame() {
  const d = createDeck();
  const players = PLAYERS_DEF.map((def, i) => ({
    id: i,
    ...def,
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
    step: 1, // 1: 移動, 2: 行動＆補充, 4: 返却
    facilityUsed: false,
    gameOver: false,
    excessCount: 0
  };
}

function App() {
  const [state, setState] = useState(initGame);
  const [overflowSelectedIds, setOverflowSelectedIds] = useState([]);

  const p = state.players[state.turn];
  const isHuman = (state.turn === 0);
  const me = state.players[0];
  const myHandLimit = HAND_LIMITS[me.handLimitLv - 1];

  const mySets = useMemo(() => findSets(me.hand), [me.hand]);
  const availablePorter = useMemo(() => me.boxes.reduce((sum, b) => sum + (b.cargo ? b.cargo.porter : 0), 0), [me.boxes]);
  const availablePack = useMemo(() => me.boxes.reduce((sum, b) => sum + (b.cargo ? b.cargo.pack : 0), 0), [me.boxes]);

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

    setState(prev => ({
      ...prev,
      road: newRoad,
      players: newPlayers,
      step: 2,
      facilityUsed: false
    }));
  };

  // 荷箱にセットを置く
  const handlePackSet = (setObj) => {
    const emptyIdx = me.boxes.findIndex(b => b.unlocked && !b.cargo && b.salt === 0);
    if (emptyIdx === -1 || !setObj) return;

    const ids = setObj.trio.map(c => c.id);
    const remainingHand = me.hand.filter(c => !ids.includes(c.id));

    const newPlayers = state.players.map((pl, i) => {
      if (i !== 0) return pl;
      return {
        ...pl,
        hand: remainingHand,
        boxes: pl.boxes.map((b, bI) => bI === emptyIdx ? { ...b, cargo: setObj.info } : b)
      };
    });

    setState(prev => ({ ...prev, players: newPlayers }));
  };

  // 港での個別売却
  const handlePortSellBox = (boxIdx) => {
    const box = me.boxes[boxIdx];
    if (!isHuman || p.pos !== 4 || !box || !box.cargo) return;
    const bonus = me.guildLv === 1 ? 0 : me.guildLv === 2 ? 2 : 4;
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
    if (!isHuman || state.step !== 2) return;
    const pos = p.pos;

    // 0: 地元
    if (pos === 0 && !state.facilityUsed) {
      let gain = 0;
      const newBoxes = me.boxes.map(b => {
        if (!b.unlocked) return b;
        gain += (b.salt || 0);
        return { ...b, salt: 0 };
      });
      const newScore = me.score + gain;
      setState(prev => ({
        ...prev,
        facilityUsed: true,
        gameOver: newScore >= WIN_SCORE,
        players: prev.players.map((pl, i) => i === 0 ? { ...pl, score: newScore, boxes: newBoxes } : pl)
      }));
    }
    // 2: 箱屋
    else if (pos === 2 && !state.facilityUsed) {
      if (type === 'handLimit' && me.handLimitLv < 3) {
        const cost = me.handLimitLv === 1 ? 3 : 5;
        if (availablePorter < cost) return;
        let rem = cost;
        const returnedCards = [];
        const newBoxes = me.boxes.map(b => {
          if (b.cargo && rem > 0) {
            rem -= b.cargo.porter;
            if (b.cargo.cards) returnedCards.push(...b.cargo.cards);
            return { ...b, cargo: null };
          }
          return b;
        });
        setState(prev => ({
          ...prev,
          discard: [...prev.discard, ...returnedCards],
          facilityUsed: true,
          players: prev.players.map((pl, i) => i === 0 ? { ...pl, handLimitLv: pl.handLimitLv + 1, boxes: newBoxes } : pl)
        }));
      } else if (type === 'boxes' && me.boxesLv < 3) {
        const cost = me.boxesLv === 1 ? 3 : 5;
        if (availablePack < cost) return;
        let rem = cost;
        const returnedCards = [];
        const newBoxes = me.boxes.map((b, idx) => {
          if (idx === me.boxesLv) return { ...b, unlocked: true };
          if (b.cargo && rem > 0) {
            rem -= b.cargo.pack;
            if (b.cargo.cards) returnedCards.push(...b.cargo.cards);
            return { ...b, cargo: null };
          }
          return b;
        });
        setState(prev => ({
          ...prev,
          discard: [...prev.discard, ...returnedCards],
          facilityUsed: true,
          players: prev.players.map((pl, i) => i === 0 ? { ...pl, boxesLv: pl.boxesLv + 1, boxes: newBoxes } : pl)
        }));
      }
    }
    // 6: 会所
    else if (pos === 6 && type === 'guild' && me.guildLv < 3 && !state.facilityUsed) {
      const reqP = me.guildLv === 1 ? 1 : 3;
      const reqK = me.guildLv === 1 ? 1 : 3;
      if (availablePorter < reqP || availablePack < reqK) return;
      let remP = reqP;
      let remK = reqK;
      const returnedCards = [];
      const newBoxes = me.boxes.map(b => {
        if (b.cargo && (remP > 0 || remK > 0)) {
          remP -= b.cargo.porter;
          remK -= b.cargo.pack;
          if (b.cargo.cards) returnedCards.push(...b.cargo.cards);
          return { ...b, cargo: null };
        }
        return b;
      });
      setState(prev => ({
        ...prev,
        discard: [...prev.discard, ...returnedCards],
        facilityUsed: true,
        players: prev.players.map((pl, i) => i === 0 ? { ...pl, guildLv: pl.guildLv + 1, boxes: newBoxes } : pl)
      }));
    }
  };

  // 補充
  const handleReplenishDeck = () => {
    if (!isHuman || state.step !== 2) return;
    const needed = myHandLimit - me.hand.length;
    const res = drawSafe(needed, state.deck, state.discard);

    const newPlayers = state.players.map((pl, i) => i === 0 ? {
      ...pl,
      hand: [...pl.hand, ...res.drawn]
    } : pl);

    setState(prev => ({
      ...prev,
      deck: res.newDeck,
      discard: res.newDiscard,
      players: newPlayers,
      turn: 1,
      step: 1,
      facilityUsed: false
    }));
  };

  const handleReplenishRoad = () => {
    if (!isHuman || state.step !== 2) return;
    const roadCards = state.road[p.pos] || [];
    const combinedHand = [...me.hand, ...roadCards];
    const newRoad = state.road.map((arr, i) => i === p.pos ? [] : arr);

    if (combinedHand.length < myHandLimit) {
      const needed = myHandLimit - combinedHand.length;
      const res = drawSafe(needed, state.deck, state.discard);
      const newPlayers = state.players.map((pl, i) => i === 0 ? {
        ...pl,
        hand: [...combinedHand, ...res.drawn]
      } : pl);
      setState(prev => ({
        ...prev,
        deck: res.newDeck,
        discard: res.newDiscard,
        road: newRoad,
        players: newPlayers,
        turn: 1,
        step: 1,
        facilityUsed: false
      }));
    } else if (combinedHand.length > myHandLimit) {
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
        turn: 1,
        step: 1,
        facilityUsed: false
      }));
    }
  };

  // Step 4: 返却確定
  const handleConfirmExcess = () => {
    if (!isHuman || state.step !== 4 || overflowSelectedIds.length !== state.excessCount) return;
    const returned = me.hand.filter(c => overflowSelectedIds.includes(c.id));
    const finalHand = me.hand.filter(c => !overflowSelectedIds.includes(c.id));
    const newRoad = state.road.map((arr, i) => i === p.pos ? [...arr, ...returned] : arr);

    const newPlayers = state.players.map((pl, i) => i === 0 ? { ...pl, hand: finalHand } : pl);
    setOverflowSelectedIds([]);

    setState(prev => ({
      ...prev,
      road: newRoad,
      players: newPlayers,
      turn: 1,
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
        let bestIdx = 0;
        let bestVal = -999;
        hList.forEach((c, idx) => {
          const target = (curr.pos + c.num) % 8;
          let v = c.num;
          if (target === 0 && curr.boxes.some(b => b.salt > 0)) v += 120;
          if (target === 4 && curr.boxes.some(b => b.cargo)) v += 80;
          if (target === 2 && (curr.handLimitLv < 3 || curr.boxesLv < 3)) v += 30;
          if (target === 6 && curr.guildLv < 3) v += 30;
          const roadStack = state.road[target] || [];
          if (roadStack.length >= 2) v += 15;
          if (v > bestVal) { bestVal = v; bestIdx = idx; }
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

        // 0: 地元
        if (curr.pos === 0) {
          bxs = bxs.map(b => {
            if (b.salt > 0) sc += b.salt;
            return { ...b, cargo: null, salt: 0 };
          });
        }
        // 4: 港
        else if (curr.pos === 4) {
          const bonus = curr.guildLv === 1 ? 0 : curr.guildLv === 2 ? 2 : 4;
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
            const cost = curr.handLimitLv === 1 ? 3 : 5;
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
            const cost = curr.boxesLv === 1 ? 3 : 5;
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
          const reqP = me.guildLv === 1 ? 1 : 3;
          const reqK = me.guildLv === 1 ? 1 : 3;
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

        // セットを置く
        const sets = findSets(hnd);
        const emptyIdx = bxs.findIndex(b => b.unlocked && !b.cargo && b.salt === 0);
        if (sets.length > 0 && emptyIdx !== -1) {
          const chosen = sets[0];
          const ids = chosen.trio.map(c => c.id);
          hnd = hnd.filter(c => !ids.includes(c.id));
          bxs[emptyIdx] = { ...bxs[emptyIdx], cargo: chosen.info };
        }

        // BOT補充
        let newRoad = state.road;
        let newDeck = state.deck;
        const roadStack = state.road[curr.pos] || [];

        if (roadStack.length >= 2) {
          const combined = [...hnd, ...roadStack];
          newRoad = state.road.map((arr, i) => i === curr.pos ? [] : arr);

          if (combined.length < botHandLimit) {
            const res = drawSafe(botHandLimit - combined.length, newDeck, newDiscard);
            hnd = [...combined, ...res.drawn];
            newDeck = res.newDeck;
            newDiscard = res.newDiscard;
          } else if (combined.length > botHandLimit) {
            const excess = combined.length - botHandLimit;
            const toReturn = combined.splice(0, excess);
            hnd = combined;
            newRoad = state.road.map((arr, i) => i === curr.pos ? toReturn : arr);
          } else {
            hnd = combined;
          }
        } else {
          const res = drawSafe(botHandLimit - hnd.length, newDeck, newDiscard);
          hnd = [...hnd, ...res.drawn];
          newDeck = res.newDeck;
          newDiscard = res.newDiscard;
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
          step: 1
        }));
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [state.turn, state.step, state.gameOver]);

  // カード描画
  const renderCard = (c, onClick, isSelected = false) => {
    const meta = GOODS[c.type];
    return h('button', {
      key: c.id,
      onClick,
      className: `card ${meta.card} ${isSelected ? 'selected' : ''}`
    }, [
      h('div', { className: 'card-top' }, [
        h('span', { className: 'card-num' }, c.num),
        h('span', { className: 'card-icon-main' }, meta.icon)
      ]),
      h('div', { className: 'card-res-container' }, [
        c.salt > 0 && h('span', { className: 'res-pill res-salt' }, `🧂${c.salt}`),
        c.porter > 0 && h('span', { className: 'res-pill res-porter' }, `🛞${c.porter}`),
        c.pack > 0 && h('span', { className: 'res-pill res-pack' }, `📦${c.pack}`)
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

      h('div', { className: 'tile-players' },
        playersHere.map(pl => h('div', {
          key: pl.id,
          className: 'player-dot',
          style: { backgroundColor: pl.color }
        }, pl.id === 0 ? '自' : `B${pl.id}`))
      ),

      // 落ちているカード表示
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
        h('div', { style: { fontSize: '13px', fontWeight: 'bold', color: '#9b2c2c' } }, '🎯【移動】'),
        h('div', { style: { fontSize: '11px', color: '#4a5568' } }, '手札を選んで進む')
      ]);
    }

    // Step 2: 行動 ＆ 補充
    if (state.step === 2) {
      const roadCount = (state.road[p.pos] || []).length;
      const hasEmptyBox = me.boxes.some(b => b.unlocked && !b.cargo && b.salt === 0);

      return h('div', { className: 'center-hub step-2' }, [
        h('div', { className: 'center-actions' }, [
          // セットを置く
          mySets.length > 0 && hasEmptyBox && (
            h('div', { style: { display: 'flex', gap: '3px', flexDirection: 'column' } },
              mySets.map(s => h('button', {
                key: s.key,
                onClick: () => handlePackSet(s),
                className: 'btn btn-success',
                style: { width: '100%', fontSize: '10px', padding: '3px 6px' }
              }, `📦 ${s.info.name} を積む`))
            )
          ),

          // 施設アクション
          p.pos === 0 && (
            me.boxes.some(b => b.salt > 0) && !state.facilityUsed ? (
              h('button', {
                onClick: () => handleFacility(),
                className: 'btn btn-danger',
                style: { width: '100%', fontSize: '10px', padding: '4px 6px' }
              }, `🏡 🧂得点化 (+${me.boxes.reduce((s,b)=>s+b.salt,0)} 🏆)`)
            ) : null
          ),

          p.pos === 2 && !state.facilityUsed && (
            h('div', { style: { display: 'flex', gap: '3px', width: '100%' } }, [
              me.handLimitLv < 3 && h('button', {
                disabled: availablePorter < (me.handLimitLv === 1 ? 3 : 5),
                onClick: () => handleFacility('handLimit'),
                className: 'btn btn-warning',
                style: { flex: 1, fontSize: '9px', padding: '4px 2px' }
              }, `🎴上限+1(🛞${me.handLimitLv === 1 ? 3 : 5})`),
              me.boxesLv < 3 && h('button', {
                disabled: availablePack < (me.boxesLv === 1 ? 3 : 5),
                onClick: () => handleFacility('boxes'),
                className: 'btn btn-purple',
                style: { flex: 1, fontSize: '9px', padding: '4px 2px' }
              }, `📦枠+1(📦${me.boxesLv === 1 ? 3 : 5})`)
            ])
          ),

          p.pos === 4 && me.boxes.some(b => b.cargo) && (
            h('div', { style: { display: 'flex', gap: '3px', flexDirection: 'column' } },
              me.boxes.map((b, idx) => b.cargo ? h('button', {
                key: idx,
                onClick: () => handlePortSellBox(idx),
                className: 'btn btn-primary',
                style: { width: '100%', fontSize: '10px', padding: '3px 6px' }
              }, `⚓ 箱${idx+1} (${b.cargo.shortName || b.cargo.name}) 売却`) : null)
            )
          ),

          p.pos === 6 && !state.facilityUsed && me.guildLv < 3 && (
            h('button', {
              disabled: availablePorter < (me.guildLv === 1 ? 1 : 3) || availablePack < (me.guildLv === 1 ? 1 : 3),
              onClick: () => handleFacility('guild'),
              className: 'btn btn-success',
              style: { width: '100%', fontSize: '10px', padding: '4px 6px' }
            }, `🏛️ 会所Lv+1 (🛞${me.guildLv===1?1:3}+📦${me.guildLv===1?1:3})`)
          )
        ]),

        // 補充
        h('div', { style: { display: 'flex', gap: '4px', width: '100%' } }, [
          h('button', {
            onClick: handleReplenishDeck,
            className: 'btn btn-primary',
            style: { flex: 1, fontSize: '10px', padding: '5px 2px' }
          }, `① 🎴 山札引く`),
          h('button', {
            onClick: handleReplenishRoad,
            className: 'btn btn-purple',
            style: { flex: 1, fontSize: '10px', padding: '5px 2px' }
          }, `② 🖐️ 全回収(${roadCount})`)
        ])
      ]);
    }

    // Step 4: 返却
    if (state.step === 4) {
      return h('div', { className: 'center-hub step-4' }, [
        h('div', { style: { fontSize: '11px', fontWeight: 'bold', color: '#6b46c1' } }, `↩️ ${overflowSelectedIds.length}/${state.excessCount}枚 選択中`),
        h('button', {
          disabled: overflowSelectedIds.length !== state.excessCount,
          onClick: handleConfirmExcess,
          className: 'btn btn-purple',
          style: { width: '100%' }
        }, '戻すのを確定')
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

  return h('div', { className: 'app' }, [

    // ヘッダー
    h('header', { className: 'header' }, [
      h('div', { className: 'header-title' }, [
        h('span', null, '🏮 『ナウキ』運び'),
        h('span', { className: `header-turn-badge ${isHuman ? 'turn-me' : 'turn-bot'}` }, `手番: ${p.name}`)
      ]),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
        h('span', { style: { color: '#718096', fontSize: '12px' } }, `🎴 山札: ${state.deck.length}枚`),
        h('span', { className: 'header-badge' }, `🏆 目標: ${WIN_SCORE}点`)
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
        isHuman && state.step === 4 && h('span', { style: { color: '#6b46c1', fontWeight: 'bold' } }, `↩️ 戻すカードを選択 (${overflowSelectedIds.length}/${state.excessCount})`)
      ]),
      h('div', { className: 'card-row' },
        me.hand.map((c, idx) => renderCard(
          c,
          () => {
            if (isHuman && state.step === 1) handleMove(idx);
            else if (isHuman && state.step === 4) {
              if (overflowSelectedIds.includes(c.id)) {
                setOverflowSelectedIds(overflowSelectedIds.filter(id => id !== c.id));
              } else if (overflowSelectedIds.length < state.excessCount) {
                setOverflowSelectedIds([...overflowSelectedIds, c.id]);
              }
            }
          },
          overflowSelectedIds.includes(c.id)
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
      h('div', { className: 'boxes-row' },
        me.boxes.map((b, idx) => h('div', {
          key: idx,
          className: `box ${!b.unlocked ? 'locked' : b.cargo ? 'has-cargo' : b.salt > 0 ? 'has-salt' : ''}`
        }, [
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' } }, [
            h('span', null, `📦 箱${idx + 1}`),
            b.salt > 0 && h('span', { style: { color: '#2b6cb0' } }, `🧂×${b.salt}`)
          ]),
          !b.unlocked ? (
            h('span', { style: { textAlign: 'center', margin: 'auto 0', color: '#a0aec0' } }, '🔒 未解放')
          ) : b.cargo ? (
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', margin: 'auto 0' } }, [
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                h('span', { style: { fontWeight: 'bold' } }, b.cargo.name),
                isHuman && state.step === 2 && p.pos === 4 && h('button', {
                  onClick: () => handlePortSellBox(idx),
                  className: 'btn btn-primary',
                  style: { padding: '2px 6px', fontSize: '10px' }
                }, '⚓ 売却')
              ]),
              h('div', { style: { fontSize: '10px', color: '#4a5568' } }, [
                b.cargo.salt > 0 && `🧂${b.cargo.salt} `,
                b.cargo.porter > 0 && `🛞${b.cargo.porter} `,
                b.cargo.pack > 0 && `📦${b.cargo.pack} `
              ])
            ])
          ) : b.salt > 0 ? (
            h('span', { style: { fontSize: '10px', color: '#2b6cb0', fontWeight: 'bold', margin: 'auto 0' } }, '🏡 地元で得点化')
          ) : (
            h('span', { style: { textAlign: 'center', color: '#a0aec0', margin: 'auto 0' } }, '📦 空き')
          )
        ]))
      )
    ])

  ]);
}

ReactDOM.render(h(App), document.getElementById('root'));
