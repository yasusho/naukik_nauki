const { createDeck, drawSafe, evalSet, findSets, calcPortSale, evaluateHandValue, getCardDiscardPriorities } = require('./simulate.js');

function testSaltPreservationAtHome() {
  const BOX_TILE = 6;
  const GUILD_TILE = 2;
  const winScore = 25;
  const numGames = 10000;
  const handLimit = 5;
  const boxCosts = [3, 5];
  const guildCosts = [3, 5];

  const bots = [
    {
      name: '状況適応型',
      weights: { salt: 16, tea: 1.2, rice: 1.2, cloth: 1.2 },
      getTargetBonus(target, p, totalSalt, myScore) {
        if (myScore + totalSalt >= winScore) {
          if (target === 0) return 8000;
          return (8 - (8 - target) % 8) * 50;
        }
        if (myScore + totalSalt >= winScore - 5 && target === 0 && totalSalt > 0) return 500;

        // 箱屋(6): 荷箱拡張
        if (target === BOX_TILE && p.boxesLv < 3 && totalSalt >= boxCosts[p.boxesLv - 1] && myScore < 16) {
          return p.boxesLv === 1 ? 320 : 200;
        }
        // 会所(2): 港レート強化
        if (target === GUILD_TILE && p.guildLv < 3 && totalSalt >= guildCosts[p.guildLv - 1] && myScore < 16) {
          return p.guildLv === 1 ? 320 : 250;
        }
        return 0;
      },
      decideHomeKeep(p, totalSalt) {
        if (p.score + totalSalt >= winScore) return 0; // 勝ち切れるなら全額納品
        if (p.guildLv < 3 && p.score < 16) {
          const cost = guildCosts[p.guildLv - 1];
          if (totalSalt >= cost) return cost; // 会所強化用にキープ
        }
        return 0;
      }
    },
    {
      name: '荷箱特化型',
      weights: { salt: 14, tea: 1.0, rice: 1.0, cloth: 1.5 },
      getTargetBonus(target, p, totalSalt, myScore) {
        if (myScore + totalSalt >= winScore && target === 0) return 8000;
        if (target === BOX_TILE && p.boxesLv < 3 && totalSalt >= boxCosts[p.boxesLv - 1]) return 350;
        return 0;
      },
      decideHomeKeep() { return 0; }
    },
    {
      name: '会所特化型',
      weights: { salt: 16, tea: 1.0, rice: 1.2, cloth: 1.2 },
      getTargetBonus(target, p, totalSalt, myScore) {
        if (myScore + totalSalt >= winScore && target === 0) return 8000;
        if (target === GUILD_TILE && p.guildLv < 3 && totalSalt >= guildCosts[p.guildLv - 1]) return 380;
        return 0;
      },
      decideHomeKeep(p, totalSalt) {
        if (p.score + totalSalt >= winScore) return 0;
        if (p.guildLv < 3) {
          const cost = guildCosts[p.guildLv - 1];
          if (totalSalt >= cost) return cost;
        }
        return 0;
      }
    },
    {
      name: '直行速攻型',
      weights: { salt: 22, tea: 1.5, rice: 1.0, cloth: 1.0 },
      getTargetBonus(target, p, totalSalt, myScore) {
        if (myScore + totalSalt >= winScore && target === 0) return 8000;
        return 0;
      },
      decideHomeKeep() { return 0; }
    }
  ];

  function chooseMove(p, s, bot) {
    const hList = p.hand;
    if (!hList || hList.length === 0) return 0;
    const priorities = getCardDiscardPriorities(hList, bot.weights);
    const totalSalt = p.boxes.reduce((sum, b) => sum + (b.salt || 0), 0);
    const loadedBoxes = p.boxes.filter(b => b.unlocked && b.cargo).length;
    const emptyBoxes = p.boxes.filter(b => b.unlocked && !b.cargo && b.salt === 0).length;

    let bestScore = -99999;
    let bestIdx = 0;

    hList.forEach((c, idx) => {
      const target = (p.pos + c.num) % 8;
      let score = 0;

      const pInfo = priorities.find(pi => pi.idx === idx);
      score += (100 - (pInfo ? pInfo.loss : 50)) * 0.9;

      if (target === 0) {
        if (totalSalt > 0) score += 180 + totalSalt * 25;
        else score -= 20;
      } else if (target === 4) {
        if (loadedBoxes > 0) {
          const expectedSalt = p.boxes.reduce((sum, b) => sum + (b.cargo ? calcPortSale(b.cargo.salt, p.guildLv) : 0), 0);
          score += 180 + expectedSalt * 18 + loadedBoxes * 30;
        } else {
          score -= 50;
        }
      }

      if (bot.getTargetBonus) {
        score += bot.getTargetBonus(target, p, totalSalt, p.score);
      }

      const roadStack = s.road[target] || [];
      if (roadStack.length > 0) {
        const handWithRoad = [...hList.filter((_, i) => i !== idx), ...roadStack];
        const gain = evaluateHandValue(handWithRoad, bot.weights) - evaluateHandValue(hList, bot.weights);
        score += roadStack.length * (emptyBoxes > 0 ? 18 : 6) + Math.max(0, gain) * 0.5;
      }

      if (loadedBoxes > 0 && totalSalt === 0) {
        const distToPort = (4 - target + 8) % 8;
        score += (8 - distToPort) * 8;
      }
      if (totalSalt > 0) {
        const distToHome = (8 - target) % 8;
        score += (8 - distToHome) * 12;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  const wins = { '状況適応型': 0, '荷箱特化型': 0, '会所特化型': 0, '直行速攻型': 0 };
  const boxReach = { 1: 0, 2: 0, 3: 0 };
  const boxWins = { 1: 0, 2: 0, 3: 0 };
  const guildReach = { 1: 0, 2: 0, 3: 0 };
  const guildWins = { 1: 0, 2: 0, 3: 0 };
  const matrixReach = { 1: { 1: 0, 2: 0, 3: 0 }, 2: { 1: 0, 2: 0, 3: 0 }, 3: { 1: 0, 2: 0, 3: 0 } };
  const matrixWins = { 1: { 1: 0, 2: 0, 3: 0 }, 2: { 1: 0, 2: 0, 3: 0 }, 3: { 1: 0, 2: 0, 3: 0 } };
  const roundsList = [];

  for (let r = 0; r < numGames; r++) {
    const shift = r % 4;
    const activeBots = [bots[(0 + shift) % 4], bots[(1 + shift) % 4], bots[(2 + shift) % 4], bots[(3 + shift) % 4]];
    const d = createDeck();
    const players = activeBots.map((b, i) => ({
      id: i,
      name: b.name,
      bot: b,
      pos: 0,
      hand: d.splice(0, handLimit),
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
    let state = { deck: d, discard: [], road, players, turn: 0, gameOver: false };
    let turns = 0;

    while (!state.gameOver && turns < 120) {
      const curr = state.players[state.turn];

      if (curr.hand.length === 0) {
        const res = drawSafe(1, state.deck, state.discard);
        state.deck = res.newDeck;
        state.discard = res.newDiscard;
        const topCard = res.drawn[0] || { num: 1, type: 'tea', salt: 2 };
        curr.pos = (curr.pos + topCard.num) % 8;
        state.road[curr.pos].push(topCard);
      } else {
        const moveIdx = chooseMove(curr, state, curr.bot);
        const chosenCard = curr.hand[moveIdx] || curr.hand[0];
        curr.pos = (curr.pos + chosenCard.num) % 8;
        state.road[curr.pos].push(chosenCard);
        curr.hand = curr.hand.filter((_, i) => i !== moveIdx);
      }

      const roadCards = state.road[curr.pos] || [];
      const emptyBoxes = curr.boxes.filter(b => b.unlocked && !b.cargo && b.salt === 0).length;
      const wantRoad = roadCards.length > 0 && (emptyBoxes > 0 || roadCards.length >= 2 || curr.hand.length < 3);

      if (wantRoad) {
        const combined = [...curr.hand, ...roadCards];
        state.road[curr.pos] = [];
        if (combined.length > handLimit) {
          const excess = combined.length - handLimit;
          const priorities = getCardDiscardPriorities(combined, { salt: 10, tea: 1, rice: 1, cloth: 1 });
          const returnIds = priorities.slice(0, excess).map(p => p.card.id);
          state.road[curr.pos] = combined.filter(c => returnIds.includes(c.id));
          curr.hand = combined.filter(c => !returnIds.includes(c.id));
        } else curr.hand = combined;
      } else {
        const needed = Math.max(0, handLimit - curr.hand.length);
        const res = drawSafe(needed, state.deck, state.discard);
        curr.hand.push(...res.drawn);
        state.deck = res.newDeck;
        state.discard = res.newDiscard;
      }

      let bxs = curr.boxes;
      let sc = curr.score;
      let newDiscard = state.discard;

      // 地元(0): 会所用の塩を計算して温存し、残りを納品
      if (curr.pos === 0) {
        const totalSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0);
        const keepCost = curr.bot.decideHomeKeep ? curr.bot.decideHomeKeep(curr, totalSalt) : 0;
        const deliverSalt = Math.max(0, totalSalt - keepCost);

        sc += deliverSalt;
        let remDeliver = deliverSalt;
        bxs = bxs.map(b => {
          if (b.salt > 0 && remDeliver > 0) {
            const spend = Math.min(b.salt, remDeliver);
            remDeliver -= spend;
            return { ...b, cargo: null, salt: b.salt - spend };
          }
          return { ...b, cargo: null };
        });

        if (sc >= winScore) {
          state.gameOver = true;
          break;
        }
      }
      // 港(4): セット売却
      else if (curr.pos === 4) {
        bxs = bxs.map(b => {
          if (b.unlocked && b.cargo) {
            const gain = calcPortSale(b.cargo.salt, curr.guildLv);
            if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
            return { ...b, cargo: null, salt: (b.salt || 0) + gain };
          }
          return b;
        });
      }
      // 箱屋(6): 荷箱拡張 (3塩 / 5塩)
      else if (curr.pos === BOX_TILE && curr.boxesLv < 3) {
        const cost = boxCosts[curr.boxesLv - 1];
        let totalSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0);
        if (totalSalt >= cost && curr.bot.name !== '直行速攻型') {
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
      // 会所(2): 港レート強化 (3塩 / 5塩)
      else if (curr.pos === GUILD_TILE && curr.guildLv < 3) {
        const cost = guildCosts[curr.guildLv - 1];
        let totalSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0);
        if (totalSalt >= cost && curr.bot.name !== '直行速攻型') {
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

      while (true) {
        const sets = findSets(curr.hand);
        const emptyIdx = bxs.findIndex(b => b.unlocked && !b.cargo && b.salt === 0);
        if (sets.length > 0 && emptyIdx !== -1) {
          const chosen = sets[0];
          const ids = chosen.trio.map(c => c.id);
          curr.hand = curr.hand.filter(c => !ids.includes(c.id));
          bxs[emptyIdx] = { ...bxs[emptyIdx], cargo: { ...chosen.info, cards: chosen.trio } };
        } else break;
      }

      curr.boxes = bxs;
      curr.score = sc;
      state.discard = newDiscard;

      state.turn = (state.turn + 1) % 4;
      if (state.turn === 0) turns++;
    }

    let winnerId = 0;
    let maxSc = -1;
    players.forEach((p, idx) => {
      if (p.score > maxSc) {
        maxSc = p.score;
        winnerId = idx;
      }
    });

    const winP = players[winnerId];
    wins[winP.name]++;
    roundsList.push(turns);

    players.forEach((p, idx) => {
      const isWinner = (idx === winnerId);
      boxReach[p.boxesLv]++;
      if (isWinner) boxWins[p.boxesLv]++;
      guildReach[p.guildLv]++;
      if (isWinner) guildWins[p.guildLv]++;
      matrixReach[p.boxesLv][p.guildLv]++;
      if (isWinner) matrixWins[p.boxesLv][p.guildLv]++;
    });
  }

  const totalInstances = numGames * 4;
  const avgRounds = (roundsList.reduce((a, b) => a + b, 0) / numGames).toFixed(1);

  console.log(`\n========================================================================================`);
  console.log(`🏆 【塩温存機能付き 新ルール トーナメント】 (計 ${numGames} 試合, 目標 ${winScore} 点, 会所/荷箱: 3/5塩, 平均 ${avgRounds} 巡)`);
  console.log(`========================================================================================`);
  console.log(` 戦略別 勝率:`);
  Object.keys(wins).forEach(k => {
    const w = wins[k];
    console.log(`   ${k.padEnd(8, ' ')} : ${String(w).padStart(5, ' ')} 勝 (${((w / numGames) * 100).toFixed(1)}%)`);
  });
  console.log(`\n 📦 荷箱拡張レベル別:`);
  for (let b = 1; b <= 3; b++) {
    const share = ((boxReach[b] / totalInstances) * 100).toFixed(1);
    const rate = ((boxWins[b] / boxReach[b]) * 100).toFixed(1);
    console.log(`   Lv.${b} : ${String(boxReach[b]).padStart(6, ' ')} 回 (${share.padStart(5, ' ')}%) | 🏆 勝率 ${rate}% (${boxWins[b]}勝)`);
  }
  console.log(`\n 🏛️ 会所強化レベル別:`);
  for (let g = 1; g <= 3; g++) {
    const share = ((guildReach[g] / totalInstances) * 100).toFixed(1);
    const rate = ((guildWins[g] / guildReach[g]) * 100).toFixed(1);
    console.log(`   Lv.${g} : ${String(guildReach[g]).padStart(6, ' ')} 回 (${share.padStart(5, ' ')}%) | 🏆 勝率 ${rate}% (${guildWins[g]}勝)`);
  }
  console.log(`\n 🧩 荷箱Lv × 会所Lv 組み合わせマトリクス:`);
  for (let b = 1; b <= 3; b++) {
    for (let g = 1; g <= 3; g++) {
      const count = matrixReach[b][g];
      const w = matrixWins[b][g];
      const share = ((count / totalInstances) * 100).toFixed(1);
      const rate = count > 0 ? ((w / count) * 100).toFixed(1) : '0.0';
      console.log(`   📦Lv.${b} × 🏛️Lv.${g} | シェア ${share.padStart(5, ' ')}% | 🏆 勝率 ${rate.padStart(5, ' ')}% (${w}勝 / ${count}回)`);
    }
  }
  console.log(`========================================================================================\n`);
}

testSaltPreservationAtHome();
