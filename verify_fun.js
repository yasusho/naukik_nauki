#!/usr/bin/env node
/**
 * 面白さ評価器の再現性・データ健全性チェック。
 * これは「高得点なら面白い」と断定するテストではなく、
 * 評価結果が壊れていないことと、現在ルールの基準値を同時に確認する。
 */

const assert = require('assert');
const {
  createDeck,
  evalSet,
  findSets,
  runTrackedMatch,
  evaluateAll
} = require('./fun_evaluator');

const GAMES = Number(process.env.FUN_VERIFY_GAMES || 300);
const SEED = process.env.FUN_VERIFY_SEED || '20260902';

function assertClose(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}

// カード構成と役判定の基本不変条件
const deck = createDeck(() => 0.5);
assert.strictEqual(deck.length, 60, 'デッキは60枚であること');
assert.strictEqual(new Set(deck.map(card => card.id)).size, 60, 'カードIDは一意であること');
assert.strictEqual(deck.filter(card => card.num === 1).length, 12, '数字1は12枚であること');
assert.strictEqual(deck.filter(card => card.num === 5).length, 12, '数字5は12枚であること');

const validSet = [
  { id: 1, type: 'tea', num: 1, salt: 2 },
  { id: 2, type: 'tea', num: 2, salt: 1 },
  { id: 3, type: 'tea', num: 3, salt: 1 }
];
assert.strictEqual(evalSet(validSet).salt, 4, '1-2-3は4塩であること');
assert.strictEqual(findSets(validSet).length, 1, '有効な役を1つ検出すること');

// 同じseedなら、実行時間以外の評価結果が一致すること
const first = evaluateAll(GAMES, { seed: SEED, silent: true });
const second = evaluateAll(GAMES, { seed: SEED, silent: true });
const comparable = result => {
  const copy = { ...result };
  delete copy.elapsed;
  return copy;
};
assert.deepStrictEqual(comparable(first), comparable(second), 'seed指定時の結果が再現可能であること');

assert(first.totalFunScore >= 0 && first.totalFunScore <= 100, '総合点は0〜100であること');
assert.strictEqual(first.axes.length, 8, '評価軸は8個であること');
assertClose(Object.values(first.winRates).reduce((sum, rate) => sum + rate, 0), 100, 0.0001, '戦略勝率の合計');
assertClose(first.seatWinRates.reduce((sum, rate) => sum + rate, 0), 100, 0.0001, '座順勝率の合計');
assert(first.avgRounds > 0 && first.avgRounds <= 20, '決着ラウンドが上限内であること');
assert(first.seatBias >= 0 && first.seatBias <= 100, '座順バイアスが割合内であること');

// 代表試合でも、終了判定・箱数・得点の値が破綻していないこと
for (let i = 0; i < 20; i++) {
  const match = runTrackedMatch(undefined, () => (i * 0.037) % 1);
  assert(match.winner, '各試合に勝者がいること');
  match.players.forEach(player => {
    assert(player.score >= 0, '得点が負にならないこと');
    assert(player.boxes.length === 4, '箱スロット数が4であること');
    assert(player.boxes.filter(box => box.unlocked).length >= 1, '初期箱が維持されること');
  });
}

console.log(`✅ 面白さ評価器の検証に成功: ${GAMES}試合 / seed=${SEED}`);
console.log(`   現行ルール基準値: ${first.totalFunScore}/100 (${first.grade})`);
console.log(`   改善優先度: 公平性 ${first.seatBias.toFixed(1)}% バイアス、テンポ ${first.avgRounds.toFixed(1)}巡`);
