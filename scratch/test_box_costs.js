const fs = require('fs');
const code = fs.readFileSync('fun_evaluator.js', 'utf8');

const candidateCosts = [
  { name: '現状 [1, 2, 3]', costs: [1, 2, 3] },
  { name: '2の累乗 A [1, 2, 4]', costs: [1, 2, 4] },
  { name: '2の累乗 B [1, 2, 5]', costs: [1, 2, 5] },
  { name: '急上昇 [1, 3, 6]', costs: [1, 3, 6] },
  { name: '急上昇 B [1, 3, 7]', costs: [1, 3, 7] },
  { name: '本格指数 [2, 4, 8]', costs: [2, 4, 8] },
];

const path = require('path');
for (const c of candidateCosts) {
  const modified = code.replace(/const BOX_COSTS\s*=\s*\[[^\]]+\];/, `const BOX_COSTS = [${c.costs.join(', ')}];`);
  const tempPath = path.resolve(__dirname, 'temp_eval.js');
  fs.writeFileSync(tempPath, modified);
  const { evaluateAll } = require(tempPath);
  const res = evaluateAll(300, { seed: '20260902', silent: true });
  fs.unlinkSync(tempPath);
  delete require.cache[require.resolve(tempPath)];
  console.log(`=== ${c.name} ===`);
  console.log(`  総合面白さ: ${res.totalFunScore}点 (${res.grade})`);
  const wrStr = Object.entries(res.winRates).map(([k, v]) => `${k.split(' ')[0]}: ${v.toFixed(1)}%`).join(' / ');
  console.log(`  勝率: ${wrStr}`);
  console.log(`  決着巡数: ${res.avgRounds.toFixed(1)}巡\n`);
}
