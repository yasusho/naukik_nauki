const { evaluateAll: evalNormal } = require('../fun_evaluator');
const { evaluateAll: evalTop } = require('./eval_top_card');

console.log('=== 1000試合比較シミュレーション開始 ===');

const resNormal = evalNormal(1000, { seed: '20260902', silent: true });
const resTop = evalTop(1000, { seed: '20260902', silent: true });

console.log('\n--- 基本スコア比較 ---');
console.log(`現行（自由選択）: 総合 ${resNormal.totalFunScore}点 (${resNormal.grade})`);
console.log(`変更（一番上のみ）: 総合 ${resTop.totalFunScore}点 (${resTop.grade})`);

console.log('\n--- 8軸スコア比較 ---');
resNormal.axes.forEach((axis, i) => {
  const topAxis = resTop.axes[i];
  console.log(`${axis.label.padEnd(12)}: 現行 ${axis.score.toFixed(1)} -> 変更 ${topAxis.score.toFixed(1)} (差分: ${(topAxis.score - axis.score).toFixed(1)})`);
});

console.log('\n--- 戦略勝率比較 ---');
Object.keys(resNormal.winRates).forEach(strat => {
  console.log(`${strat.padEnd(15)}: 現行 ${resNormal.winRates[strat].toFixed(1)}% -> 変更 ${resTop.winRates[strat].toFixed(1)}%`);
});

console.log('\n--- ゲーム指標比較 ---');
console.log(`平均決着巡数    : 現行 ${resNormal.avgRounds.toFixed(2)}巡 -> 変更 ${resTop.avgRounds.toFixed(2)}巡`);
console.log(`1-2位点数差     : 現行 ${resNormal.avgMargin.toFixed(2)}点 -> 変更 ${resTop.avgMargin.toFixed(2)}点`);
console.log(`同時リーチ率    : 現行 ${resNormal.simReachRate.toFixed(1)}% -> 変更 ${resTop.simReachRate.toFixed(1)}%`);
console.log(`毎手番の選択肢数: 現行 ${resNormal.avgViableOptions.toFixed(2)}個 -> 変更 ${resTop.avgViableOptions.toFixed(2)}個`);
console.log(`ジレンマ発生回数: 現行 ${resNormal.avgDilemmasPerGame.toFixed(1)}回 -> 変更 ${resTop.avgDilemmasPerGame.toFixed(1)}回`);
console.log(`座順バイアス    : 現行 ${resNormal.seatBias.toFixed(1)}% -> 変更 ${resTop.seatBias.toFixed(1)}%`);
console.log(`平均港訪問回数  : 現行 ${resNormal.avgPortVisits.toFixed(2)}回 -> 変更 ${resTop.avgPortVisits.toFixed(2)}回`);
console.log(`平均帰還回数    : 現行 ${resNormal.avgHomeVisits.toFixed(2)}回 -> 変更 ${resTop.avgHomeVisits.toFixed(2)}回`);
