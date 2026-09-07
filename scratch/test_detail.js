const fs = require('fs');
const code = fs.readFileSync('fun_evaluator.js', 'utf8');
const path = require('path');

const candidates = [
  { name: '2の累乗 [1, 2, 4]', costs: [1, 2, 4] },
  { name: '急上昇 [1, 3, 6]', costs: [1, 3, 6] },
];

for (const c of candidates) {
  const modified = code.replace(/const BOX_COSTS\s*=\s*\[[^\]]+\];/, `const BOX_COSTS = [${c.costs.join(', ')}];`);
  const tempPath = path.resolve(__dirname, 'temp_eval.js');
  fs.writeFileSync(tempPath, modified);
  const { evaluateAll } = require(tempPath);
  const res = evaluateAll(1000, { seed: '20260902', silent: true });
  fs.unlinkSync(tempPath);
  delete require.cache[require.resolve(tempPath)];
  console.log(`=== ${c.name} (1,000試合) ===`);
  console.log(`  総合点: ${res.totalFunScore}点 (${res.grade})`);
  res.axes.forEach(a => console.log(`    ${a.name}: ${a.score} / 12.5`));
  console.log('  勝率:', Object.entries(res.winRates).map(([k, v]) => `${k.split(' ')[0]}: ${v.toFixed(1)}%`).join(' / '));
  console.log(`  平均巡数: ${res.avgRounds.toFixed(1)}巡\n`);
}
