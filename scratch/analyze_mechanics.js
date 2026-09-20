const { runTrackedMatch: runNormalMatch } = require('../fun_evaluator');
const { runTrackedMatch: runTopMatch } = require('./eval_top_card');

function inspectDrawStats(runner, name, games = 200) {
  // Let's modify or inspect how often road pick occurs by checking match logs or tracking
  // Since we have the source code, let's see how road was interacted with
}

// Let's check a quick trace of a single game in both modes
function getGameTrace(runner) {
  let roadPicks = 0;
  let deckDraws = 0;
  // Let's see how many cards remain on road at game end
  const match = runner(undefined, () => Math.random());
  return match;
}

console.log("Ready to analyze mechanics");
