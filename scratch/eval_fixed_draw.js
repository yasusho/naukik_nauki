const fs = require('fs');
const path = require('path');

// We will test 2 factors:
// Factor A: refillCount = 1 (Fixed 1 draw) vs refillCount = boxes.length (Box count draw)
// Factor B: market = all (pick any card) vs market = top (pick top card only)

// Let's create a modular simulator runner based on fun_evaluator.js
const funSource = fs.readFileSync(path.join(__dirname, '../fun_evaluator.js'), 'utf8');

function createEvaluator(fixedRefill = true, topCardOnly = false) {
  let code = funSource;

  if (fixedRefill) {
    // Replace maxRefill logic
    code = code.replace(
      'const maxRefill = curr.boxes.filter(b => b.unlocked).length;',
      'const maxRefill = 1; // 箱数に関係なく1枚固定'
    );
  }

  if (topCardOnly) {
    // Replace fieldPick in refill step
    code = code.replace(
      `      const fieldPick = roadCardsAtDest.reduce((best, card) => {
        const candidateSets = findSets([...hnd, card]);
        const candidateSynergy = evaluateHandSynergy([...hnd, card]);
        let val = 0;
        if (candidateSets.length > currentHandSets.length) {
          val = 100 + Math.max(...candidateSets.map(s => s.info.salt));
        } else if (candidateSynergy > currentHandSynergy) {
          val = 30 + (candidateSynergy - currentHandSynergy);
        }
        return val > best.value ? { card, value: val } : best;
      }, { card: null, value: -1 });`,
      `      const topCard = roadCardsAtDest.length > 0 ? roadCardsAtDest[roadCardsAtDest.length - 1] : null;
      let fieldPick = { card: null, value: -1 };
      if (topCard) {
        const candidateSets = findSets([...hnd, topCard]);
        const candidateSynergy = evaluateHandSynergy([...hnd, topCard]);
        let val = 0;
        if (candidateSets.length > currentHandSets.length) {
          val = 100 + Math.max(...candidateSets.map(s => s.info.salt));
        } else if (candidateSynergy > currentHandSynergy) {
          val = 30 + (candidateSynergy - currentHandSynergy);
        }
        fieldPick = { card: topCard, value: val };
      }`
    );

    code = code.replace(
      `? arr.filter(card => card.id !== fieldPick.card.id)`,
      `? arr.slice(0, -1)`
    );

    // Also replace post-cargo refill if any
    code = code.replace(
      `          const fieldPick = roadCardsAtDest.reduce((best, card) => {
            const candidateSets = findSets([...curr.hand, card]);
            const candidateSynergy = evaluateHandSynergy([...curr.hand, card]);
            let val = 0;
            if (candidateSets.length > currentHandSets.length) {
              val = 100 + Math.max(...candidateSets.map(s => s.info.salt));
            } else if (candidateSynergy > currentHandSynergy) {
              val = 30 + (candidateSynergy - currentHandSynergy);
            }
            return val > best.value ? { card, value: val } : best;
          }, { card: null, value: -1 });`,
      `          const topCard = roadCardsAtDest.length > 0 ? roadCardsAtDest[roadCardsAtDest.length - 1] : null;
          let fieldPick = { card: null, value: -1 };
          if (topCard) {
            const candidateSets = findSets([...curr.hand, topCard]);
            const candidateSynergy = evaluateHandSynergy([...curr.hand, topCard]);
            let val = 0;
            if (candidateSets.length > currentHandSets.length) {
              val = 100 + Math.max(...candidateSets.map(s => s.info.salt));
            } else if (candidateSynergy > currentHandSynergy) {
              val = 30 + (candidateSynergy - currentHandSynergy);
            }
            fieldPick = { card: topCard, value: val };
          }`
    );

    code = code.replace(
      `? arr.filter(card => card.id !== fieldPick.card.id)`,
      `? arr.slice(0, -1)`
    );
  }

  const module = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__dirname', code);
  fn(module, module.exports, require, path.join(__dirname, '..'));
  return module.exports;
}

console.log('=== 「箱数とドロー数は無関係（常に1枚補充）」ルールの検証 ===');
const fixedAllModule = createEvaluator(true, false);
const fixedTopModule = createEvaluator(true, true);

console.log('\n実行中: 固定1枚ドロー × 場札自由選択 (1000試合)...');
const resFixedAll = fixedAllModule.evaluateAll(1000, { seed: '20260902', silent: true });

console.log('実行中: 固定1枚ドロー × 場札一番上のみ (1000試合)...');
const resFixedTop = fixedTopModule.evaluateAll(1000, { seed: '20260902', silent: true });

console.log('\n================== 結果比較 ==================');
console.log(`【固定1枚ドロー・場札自由選択】: 総合 ${resFixedAll.totalFunScore}点 (${resFixedAll.grade})`);
console.log(`【固定1枚ドロー・場札一番上のみ】: 総合 ${resFixedTop.totalFunScore}点 (${resFixedTop.grade})`);

console.log('\n--- 8軸スコア比較 ---');
resFixedAll.axes.forEach((axis, i) => {
  const topAxis = resFixedTop.axes[i];
  console.log(`${axis.label.padEnd(12)}: 自由選択 ${axis.score.toFixed(1)} -> 一番上のみ ${topAxis.score.toFixed(1)} (差分: ${(topAxis.score - axis.score).toFixed(1)})`);
});

console.log('\n--- 戦略勝率比較 ---');
Object.keys(resFixedAll.winRates).forEach(strat => {
  console.log(`${strat.padEnd(15)}: 自由選択 ${resFixedAll.winRates[strat].toFixed(1)}% -> 一番上のみ ${resFixedTop.winRates[strat].toFixed(1)}%`);
});

console.log('\n--- ゲーム指標比較 ---');
console.log(`平均決着巡数    : 自由選択 ${resFixedAll.avgRounds.toFixed(2)}巡 -> 一番上のみ ${resFixedTop.avgRounds.toFixed(2)}巡`);
console.log(`1-2位点数差     : 自由選択 ${resFixedAll.avgMargin.toFixed(2)}点 -> 一番上のみ ${resFixedTop.avgMargin.toFixed(2)}点`);
console.log(`同時リーチ率    : 自由選択 ${resFixedAll.simReachRate.toFixed(1)}% -> 一番上のみ ${resFixedTop.simReachRate.toFixed(1)}%`);
console.log(`ジレンマ発生回数: 自由選択 ${resFixedAll.avgDilemmasPerGame.toFixed(1)}回 -> 一番上のみ ${resFixedTop.avgDilemmasPerGame.toFixed(1)}回`);
console.log(`座順バイアス    : 自由選択 ${resFixedAll.seatBias.toFixed(1)}% -> 一番上のみ ${resFixedTop.seatBias.toFixed(1)}%`);
console.log(`平均港訪問回数  : 自由選択 ${resFixedAll.avgPortVisits.toFixed(2)}回 -> 一番上のみ ${resFixedTop.avgPortVisits.toFixed(2)}回`);
console.log(`平均帰還回数    : 自由選択 ${resFixedAll.avgHomeVisits.toFixed(2)}回 -> 一番上のみ ${resFixedTop.avgHomeVisits.toFixed(2)}回`);
