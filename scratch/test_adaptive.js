const fs = require('fs');
const code = fs.readFileSync('fun_evaluator.js', 'utf8');
const path = require('path');

const candidates = [
  { name: '1 ➔ 2 ➔ 4', costs: [1, 2, 4] },
  { name: '1 ➔ 2 ➔ 5', costs: [1, 2, 5] },
  { name: '1 ➔ 3 ➔ 6', costs: [1, 3, 6] },
  { name: '1 ➔ 3 ➔ 7', costs: [1, 3, 7] },
  { name: '1 ➔ 4 ➔ 8', costs: [1, 4, 8] },
];

for (const c of candidates) {
  const modified = code.replace(/const BOX_COSTS\s*=\s*\[[^\]]+\];/, `const BOX_COSTS = [${c.costs.join(', ')}];`);
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
  console.log(`  平均巡数: ${res.avgRounds.toFixed(1)}巡\n`);
}
