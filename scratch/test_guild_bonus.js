const fs = require('fs');
const code = fs.readFileSync('fun_evaluator.js', 'utf8');
const path = require('path');

const candidates = [
  { name: '現状: 会所コスト2塩 / ボーナス+3塩', flipCost: 2, flipBonus: 3 },
  { name: '等価投資: 会所コスト3塩 / ボーナス+3塩 (1回で元が取れる)', flipCost: 3, flipBonus: 3 },
  { name: '中庸: 会所コスト2塩 / ボーナス+2塩 (1回で元が取れる)', flipCost: 2, flipBonus: 2 },
  { name: '重め投資: 会所コスト3塩 / ボーナス+2塩 (2回出荷で黒字化)', flipCost: 3, flipBonus: 2 },
  { name: '低コスト低リターン: 会所コスト1塩 / ボーナス+2塩', flipCost: 1, flipBonus: 2 },
];

for (const c of candidates) {
  let modified = code.replace(/const BOX_COSTS\s*=\s*\[[^\]]+\];/, `const BOX_COSTS = [1, 3, 7];`);
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
