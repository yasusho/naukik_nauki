#!/usr/bin/env node
/**
 * 面白さ評価の実行入口。
 * 評価ロジック本体は fun_evaluator.js に一本化し、旧コマンドも互換維持する。
 */

const { evaluateAll } = require('./fun_evaluator');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};

const gameCount = Number(getArg('--games', '3000'));
const seed = getArg('--seed', undefined);
const json = args.includes('--json');
const result = evaluateAll(gameCount, { seed, silent: json });

if (json) console.log(JSON.stringify(result));
