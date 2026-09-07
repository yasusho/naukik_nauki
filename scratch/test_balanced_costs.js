const fs = require('fs');
const code = fs.readFileSync('fun_evaluator.js', 'utf8');
const path = require('path');

const candidates = [
  { name: '1 ➔ 3 ➔ 7 (会所2塩 / ボーナス+3)', costs: [1, 3, 7], flipCost: 2, flipBonus: 3 },
  { name: '2 ➔ 3 ➔ 5 (会所2塩 / ボーナス+3)', costs: [2, 3, 5], flipCost: 2, flipBonus: 3 },
  { name: '2 ➔ 3 ➔ 6 (会所2塩 / ボーナス+3)', costs: [2, 3, 6], flipCost: 2, flipBonus: 3 },
  { name: '2 ➔ 4 ➔ 8 (会所2塩 / ボーナス+2)', costs: [2, 4, 8], flipCost: 2, flipBonus: 2 },
  { name: '2 ➔ 4 ➔ 7 (会所2塩 / ボーナス+2)', costs: [2, 4, 7], flipCost: 2, flipBonus: 2 },
  { name: '2 ➔ 5 ➔ 9 (会所3塩 / ボーナス+3)', costs: [2, 5, 9], flipCost: 3, flipBonus: 3 },
];

for (const c of candidates) {
  let modified = code.replace(/const BOX_COSTS\s*=\s*\[[^\]]+\];/, `const BOX_COSTS = [${c.costs.join(', ')}];`);
  modified = modified.replace(/const FLIP_COST\s*=\s*\d+;/, `const FLIP_COST = ${c.flipCost};`);
  modified = modified.replace(/const FLIP_BONUS\s*=\s*\d+;/, `const FLIP_BONUS = ${c.flipBonus};`);
  const tempPath = path.resolve(__dirname, 'temp_eval.js');
  fs.writeFileSync(tempPath, modified);
  const { evaluateAll } = require(tempPath);
  const res = evaluateAll(1000, { seed: '20260902', silent: true });
  fs.unlinkSync(tempPath);
  delete require.cache[require.resolve(tempPath)];
  const wr = res.winRates;
  console.log(`=== ${c.name} ===`);
  console.log(`  総合面白さ: ${res.totalFunScore}点 (${res.grade})`);
  console.log(`  👑 適応型: ${wr['adaptive'].toFixed(1)}%`);
  console.log(`     増設特化: ${wr['moreBoxes'].toFixed(1)}% / 桐箱特化: ${wr['qualityBoxes'].toFixed(1)}% / 快速便: ${wr['fastShuttle'].toFixed(1)}%`);
  console.log(`  決着: ${res.avgRounds.toFixed(1)}巡\n`);
}
