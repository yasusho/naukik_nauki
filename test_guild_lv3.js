const { createDeck, drawSafe, evalSet, findSets, calcPortSale, evaluateHandValue, getCardDiscardPriorities } = require('./simulate.js');

function testGuildLv3Dynamics() {
  const BOX_TILE = 6;
  const GUILD_TILE = 2;

  console.log(`\n========================================================================================`);
  console.log(`🧪 【会所Lv3 到達率＆勝率 実験】 なぜ会所Lv3は到達が少なかったのか？`);
  console.log(`========================================================================================\n`);

  // パターン1: 現行コスト (荷箱[3,5], 会所[4,7], 目標20点) + 地元で会所資金を温存するAI
  runExperiment('1. 現行コスト (荷箱[3,5] 会所[4,7] 目標20点) ＋ 地元で会所資金温存AI', {
    boxCosts: [3, 5],
    guildCosts: [4, 7],
    winScore: 20
  });

  // パターン2: 会所コスト微調整 (荷箱[3,5], 会所[3,6], 目標20点) ＋ 地元で会所資金温存AI
  runExperiment('2. 会所コスト緩和 (荷箱[3,5] 会所[3,6] 目標20点) ＋ 地元で会所資金温存AI', {
    boxCosts: [3, 5],
    guildCosts: [3, 6],
    winScore: 20
  });

  // パターン3: 会所コスト緩和 ＋ 目標25点 (拡大再生産がより活きるゲーム尺)
  runExperiment('3. 会所コスト緩和 (荷箱[3,5] 会所[3,6] 目標25点) ＋ 地元で会所資金温存AI', {
    boxCosts: [3, 5],
    guildCosts: [3, 6],
    winScore: 25
  });

  function runExperiment(title, cfg) {
    const numGames = 5000;
    const handLimit = 5;
    const boxCosts = cfg.boxCosts;
    const guildCosts = cfg.guildCosts;
    const winScore = cfg.winScore;

    const guildReach = { 1: 0, 2: 0, 3: 0 };
    const guildWins = { 1: 0, 2: 0, 3: 0 };
    const boxReach = { 1: 0, 2: 0, 3: 0 };
    const boxWins = { 1: 0, 2: 0, 3: 0 };

    const bots = [
      {
        name: '状況適応型',
        type: 'adaptive',
        chooseMove(p, s) { return smartMove(p, s, 'adaptive', boxCosts, guildCosts, winScore); },
        decideHomeKeep(p, totalSalt) {
          if (p.score + totalSalt >= winScore) return 0;
          // 次の会所(2)で強化したいなら、必要な塩を残す！
          if (p.guildLv < 3 && p.score < winScore - 8) {
            const cost = guildCosts[p.guildLv - 1];
            if (totalSalt >= cost) return cost;
          }
          return 0;
        }
      },
      {
        name: '会所特化型',
        type: 'guild',
        chooseMove(p, s) { return smartMove(p, s, 'guild', boxCosts, guildCosts, winScore); },
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
        name: '荷箱特化型',
        type: 'boxes',
        chooseMove(p, s) { return smartMove(p, s, 'boxes', boxCosts, guildCosts, winScore); },
        decideHomeKeep() { return 0; }
      },
      {
        name: '直行速攻型',
        type: 'rush',
        chooseMove(p, s) { return smartMove(p, s, 'rush', boxCosts, guildCosts, winScore); },
        decideHomeKeep() { return 0; }
      }
    ];

    function smartMove(player, state, strategy, bCosts, gCosts, wScore) {
      const hList = player.hand;
      if (!hList || hList.length === 0) return 0;
      const weights = strategy === 'rush' ? { salt: 20, tea: 1.5, rice: 1.0, cloth: 1.0 } : { salt: 14, tea: 1.2, rice: 1.2, cloth: 1.2 };
      const priorities = getCardDiscardPriorities(hList, weights);
      const totalSalt = player.boxes.reduce((s, b) => s + (b.salt || 0), 0);
      const loadedBoxes = player.boxes.filter(b => b.unlocked && b.cargo).length;
      const emptyBoxes = player.boxes.filter(b => b.unlocked && !b.cargo && b.salt === 0).length;
      const unlockedBoxes = player.boxes.filter(b => b.unlocked).length;

      const myScore = player.score;
      const isFinishing = (myScore + totalSalt >= wScore);
      const isLateGame = (myScore + totalSalt >= wScore - 6);

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
              if (unlockedBoxes >= 2 && loadedBoxes === 1 && myScore < wScore - 6) {
                score -= 25;
              }
            } else {
              score -= 50;
            }
          } else if (target === BOX_TILE && player.boxesLv < 3) {
            const cost = bCosts[player.boxesLv - 1];
            if (totalSalt >= cost) {
              if (strategy === 'boxes') score += 320;
              else if (strategy === 'adaptive' && myScore < wScore - 8) score += (player.boxesLv === 1 ? 300 : 200);
            }
          } else if (target === GUILD_TILE && player.guildLv < 3) {
            const cost = gCosts[player.guildLv - 1];
            if (totalSalt >= cost) {
              if (strategy === 'guild') score += 350;
              else if (strategy === 'adaptive' && myScore < wScore - 8) score += (player.guildLv === 1 ? 300 : 270);
            }
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
          const moveIdx = curr.bot.chooseMove(curr, state);
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

        // 施設
        if (curr.pos === 0) {
          // 地元: 会所資金を温存するか判定
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
          if (totalSalt >= cost && curr.bot.type !== 'rush') {
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
          let totalSalt = bxs.reduce((sum, b) => sum + (b.salt || 0), 0);
          if (totalSalt >= cost && curr.bot.type !== 'rush') {
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
        guildReach[p.guildLv]++;
        if (isWinner) guildWins[p.guildLv]++;
        boxReach[p.boxesLv]++;
        if (isWinner) boxWins[p.boxesLv]++;
      });
    }

    const totalInstances = numGames * 4;
    console.log(`\n📌 【${title}】`);
    console.log(`----------------------------------------------------------------------------------------`);
    console.log(` 施設・レベル      | 到達回数 (シェア)       | 勝利数     | 勝率 (Win Rate)`);
    console.log(`----------------------------------------------------------------------------------------`);
    for (let g = 1; g <= 3; g++) {
      const gShare = ((guildReach[g] / totalInstances) * 100).toFixed(1);
      const gRate = guildReach[g] > 0 ? ((guildWins[g] / guildReach[g]) * 100).toFixed(1) : '0.0';
      const label = g === 1 ? '🏛️ 会所Lv.1 (通常)' : g === 2 ? `🏛️ 会所Lv.2 (${guildCosts[0]}塩)` : `🏛️ 会所Lv.3 (${guildCosts[1]}塩 2倍!)`;
      console.log(` ${label.padEnd(16, ' ')} | ${String(guildReach[g]).padStart(6, ' ')} 回 (${gShare.padStart(5, ' ')}%)      | ${String(guildWins[g]).padStart(5, ' ')} 勝   | 🏆 ${gRate.padStart(5, ' ')}%`);
    }
    for (let b = 1; b <= 3; b++) {
      const bShare = ((boxReach[b] / totalInstances) * 100).toFixed(1);
      const bRate = boxReach[b] > 0 ? ((boxWins[b] / boxReach[b]) * 100).toFixed(1) : '0.0';
      const label = b === 1 ? '📦 荷箱Lv.1 (1枠)' : b === 2 ? `📦 荷箱Lv.2 (${boxCosts[0]}塩)` : `📦 荷箱Lv.3 (${boxCosts[1]}塩)`;
      console.log(` ${label.padEnd(16, ' ')} | ${String(boxReach[b]).padStart(6, ' ')} 回 (${bShare.padStart(5, ' ')}%)      | ${String(boxWins[b]).padStart(5, ' ')} 勝   | 🏆 ${bRate.padStart(5, ' ')}%`);
    }
    console.log(`----------------------------------------------------------------------------------------`);
  }
}

testGuildLv3Dynamics();
