const { createDeck, drawSafe, evalSet, findSets, calcPortSale, evaluateHandValue, getCardDiscardPriorities } = require('./simulate.js');

function analyzeWinRateByFacilityLevel(numGames = 10000) {
  const winScore = 20;
  const handLimit = 5;
  const boxCosts = [3, 5];
  const guildCosts = [4, 7];

  const BOX_TILE = 6;
  const GUILD_TILE = 2;

  const bots = [
    {
      name: '状況適応型',
      weights: { salt: 14, tea: 1.2, rice: 1.2, cloth: 1.2 },
      targetBonus(target, p, totalSalt, myScore, loadedBoxes, emptyBoxes, unlockedBoxes) {
        if (p.boxesLv < 3 && totalSalt >= boxCosts[p.boxesLv - 1] && myScore < 14) {
          if (target === BOX_TILE) return p.boxesLv === 1 ? 350 : 240;
          // マス5(箱屋の手前)への経由ボーナス
          if (target === 5 && p.pos === 4) return 200;
        }
        if (p.guildLv < 3 && totalSalt >= guildCosts[p.guildLv - 1] && myScore < 14) {
          if (target === GUILD_TILE) return p.guildLv === 1 ? 300 : 250;
          if (target === 1 && p.pos === 0) return 180;
        }
        return 0;
      }
    },
    {
      name: '荷箱特化型',
      weights: { salt: 12, tea: 1.0, rice: 1.0, cloth: 1.5 },
      targetBonus(target, p, totalSalt) {
        if (p.boxesLv < 3 && totalSalt >= boxCosts[p.boxesLv - 1]) {
          if (target === BOX_TILE) return 400;
          if (target === 5 && p.pos === 4) return 250;
        }
        return 0;
      }
    },
    {
      name: '会所特化型',
      weights: { salt: 14, tea: 1.0, rice: 1.2, cloth: 1.2 },
      targetBonus(target, p, totalSalt) {
        if (p.guildLv < 3 && totalSalt >= guildCosts[p.guildLv - 1]) {
          if (target === GUILD_TILE) return 400;
          if (target === 1 && p.pos === 0) return 250;
        }
        return 0;
      }
    },
    {
      name: '直行速攻型',
      weights: { salt: 20, tea: 1.5, rice: 1.0, cloth: 1.0 },
      targetBonus() {
        return 0;
      }
    }
  ];

  function chooseMove(player, state, bot) {
    const hList = player.hand;
    if (!hList || hList.length === 0) return 0;
    const weights = bot.weights;
    const priorities = getCardDiscardPriorities(hList, weights);
    const totalSalt = player.boxes.reduce((s, b) => s + (b.salt || 0), 0);
    const loadedBoxes = player.boxes.filter(b => b.unlocked && b.cargo).length;
    const emptyBoxes = player.boxes.filter(b => b.unlocked && !b.cargo && b.salt === 0).length;
    const unlockedBoxes = player.boxes.filter(b => b.unlocked).length;

    const myScore = player.score;
    const isFinishing = (myScore + totalSalt >= winScore);
    const isLateGame = (myScore + totalSalt >= 14);

    let bestScore = -99999;
    let bestIdx = 0;

    hList.forEach((c, idx) => {
      const target = (player.pos + c.num) % 8;
      let score = 0;

      const pInfo = priorities.find(p => p.idx === idx);
      score += (100 - (pInfo ? pInfo.loss : 50)) * 0.9;

      if (isFinishing) {
        if (target === 0) score += 6000;
        const distToHome = (8 - target) % 8;
        score += (8 - distToHome) * 40;
      } else if (isLateGame) {
        if (target === 0 && totalSalt > 0) score += 350;
      } else {
        if (target === 0) {
          if (totalSalt > 0) score += 180 + totalSalt * 25;
          else score -= 20;
        } else if (target === 4) {
          if (loadedBoxes > 0) {
            const expectedSalt = player.boxes.reduce((s, b) => s + (b.cargo ? calcPortSale(b.cargo.salt, player.guildLv) : 0), 0);
            score += 180 + expectedSalt * 18 + loadedBoxes * 30;
            if (unlockedBoxes >= 2 && loadedBoxes === 1 && myScore < 14) {
              score -= 25;
            }
          } else {
            score -= 50;
          }
        }
        if (bot.targetBonus) {
          score += bot.targetBonus(target, player, totalSalt, myScore, loadedBoxes, emptyBoxes, unlockedBoxes);
        }
      }

      const roadStack = state.road[target] || [];
      if (roadStack.length > 0) {
        const handWithRoad = [...hList.filter((_, i) => i !== idx), ...roadStack];
        const gain = evaluateHandValue(handWithRoad, weights) - evaluateHandValue(hList, weights);
        const roadBonus = (emptyBoxes > 0) ? 22 : 8;
        score += roadStack.length * roadBonus + Math.max(0, gain) * 0.5;
      }

      if (loadedBoxes > 0 && totalSalt === 0) {
        const distToPort = (4 - target + 8) % 8;
        score += (8 - distToPort) * (emptyBoxes > 0 ? 4 : 10);
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

  const boxStats = { 1: { count: 0, wins: 0 }, 2: { count: 0, wins: 0 }, 3: { count: 0, wins: 0 } };
  const guildStats = { 1: { count: 0, wins: 0 }, 2: { count: 0, wins: 0 }, 3: { count: 0, wins: 0 } };
  const matrixStats = {};
  for (let b = 1; b <= 3; b++) {
    matrixStats[b] = {};
    for (let g = 1; g <= 3; g++) {
      matrixStats[b][g] = { count: 0, wins: 0 };
    }
  }

  for (let round = 0; round < numGames; round++) {
    const shift = round % 4;
    const activeBots = [
      bots[(0 + shift) % 4],
      bots[(1 + shift) % 4],
      bots[(2 + shift) % 4],
      bots[(3 + shift) % 4]
    ];

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

      if (curr.pos === 0) {
        bxs = bxs.map(b => {
          if (b.salt > 0) sc += b.salt;
          return { ...b, cargo: null, salt: 0 };
        });
        if (sc >= winScore) {
          state.gameOver = true;
          break;
        }
      } else if (curr.pos === 4) {
        bxs = bxs.map(b => {
          if (b.unlocked && b.cargo) {
            const gain = calcPortSale(b.cargo.salt, curr.guildLv);
            if (b.cargo.cards) newDiscard.push(...b.cargo.cards);
            return { ...b, cargo: null, salt: (b.salt || 0) + gain };
          }
          return b;
        });
      } else if (curr.pos === BOX_TILE && curr.boxesLv < 3) {
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
      } else if (curr.pos === GUILD_TILE && curr.guildLv < 3) {
        const cost = guildCosts[curr.guildLv - 1];
        const totalSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0);
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

    players.forEach((p, idx) => {
      const isWinner = (idx === winnerId);
      const bLv = p.boxesLv;
      const gLv = p.guildLv;

      boxStats[bLv].count++;
      if (isWinner) boxStats[bLv].wins++;

      guildStats[gLv].count++;
      if (isWinner) guildStats[gLv].wins++;

      matrixStats[bLv][gLv].count++;
      if (isWinner) matrixStats[bLv][gLv].wins++;
    });
  }

  const totalPlayerGames = numGames * 4;

  console.log(`\n========================================================================================`);
  console.log(`📊 【施設強化レベル別 勝率＆到達度 詳細分析レポート】 (計 ${numGames} 試合 / 延べ ${totalPlayerGames} プレイヤー)`);
  console.log(`========================================================================================\n`);

  console.log(`📦 【荷箱拡張レベル別 勝率】 (1枠 ➔ 2枠 ➔ 3枠)`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(` レベル     | プレイヤー到達数 (割合)   | 勝利数     | 勝率 (勝利数 / 到達数)`);
  console.log(`----------------------------------------------------------------------------------------`);
  for (let b = 1; b <= 3; b++) {
    const st = boxStats[b];
    const reachPct = ((st.count / totalPlayerGames) * 100).toFixed(1);
    const winRate = st.count > 0 ? ((st.wins / st.count) * 100).toFixed(1) : '0.0';
    const label = b === 1 ? 'Lv.1 (1枠:初期)' : b === 2 ? 'Lv.2 (2枠:3塩)' : 'Lv.3 (3枠:5塩)';
    console.log(` ${label.padEnd(12, ' ')} | ${String(st.count).padStart(6, ' ')} 回 (${reachPct.padStart(5, ' ')}%)      | ${String(st.wins).padStart(5, ' ')} 勝   | 🏆 ${winRate.padStart(5, ' ')}%`);
  }
  console.log(`----------------------------------------------------------------------------------------\n`);

  console.log(`🏛️ 【会所強化レベル別 勝率】 (通常 ➔ +2塩 ➔ 2倍)`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(` レベル     | プレイヤー到達数 (割合)   | 勝利数     | 勝率 (勝利数 / 到達数)`);
  console.log(`----------------------------------------------------------------------------------------`);
  for (let g = 1; g <= 3; g++) {
    const st = guildStats[g];
    const reachPct = ((st.count / totalPlayerGames) * 100).toFixed(1);
    const winRate = st.count > 0 ? ((st.wins / st.count) * 100).toFixed(1) : '0.0';
    const label = g === 1 ? 'Lv.1 (通常売却)' : g === 2 ? 'Lv.2 (+2塩/4塩)' : 'Lv.3 (🔥2倍/7塩)';
    console.log(` ${label.padEnd(13, ' ')} | ${String(st.count).padStart(6, ' ')} 回 (${reachPct.padStart(5, ' ')}%)      | ${String(st.wins).padStart(5, ' ')} 勝   | 🏆 ${winRate.padStart(5, ' ')}%`);
  }
  console.log(`----------------------------------------------------------------------------------------\n`);

  console.log(`🧩 【荷箱 × 会所 組み合わせ（シナジーマトリクス）勝率表】`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(` 荷箱Lv × 会所Lv       | 到達回数 (シェア)       | 勝利数     | 勝率 (Win Rate)`);
  console.log(`----------------------------------------------------------------------------------------`);
  for (let b = 1; b <= 3; b++) {
    for (let g = 1; g <= 3; g++) {
      const st = matrixStats[b][g];
      const share = ((st.count / totalPlayerGames) * 100).toFixed(1);
      const winRate = st.count > 0 ? ((st.wins / st.count) * 100).toFixed(1) : '0.0';
      const bLabel = `📦荷箱Lv.${b}`;
      const gLabel = `🏛️会所Lv.${g}`;
      console.log(` ${bLabel} × ${gLabel} | ${String(st.count).padStart(6, ' ')} 回 (${share.padStart(5, ' ')}%)      | ${String(st.wins).padStart(5, ' ')} 勝   | 🏆 ${winRate.padStart(5, ' ')}%`);
    }
  }
  console.log(`========================================================================================\n`);
}

analyzeWinRateByFacilityLevel(10000);
