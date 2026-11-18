// Net-backed PUCT MCTS (Node only: loads the trained value network through
// TensorFlow). Kept apart from mcts.js so the browser can import the search
// without pulling in TensorFlow or node:fs.

import { mctsAgent } from './mcts.js';
import { encode } from './features.js';
import { predictValues, loadModel } from './neuralNet.js';

export function netEvaluator(model) {
  return (items) => predictValues(model, items.map((it) => encode(it.state, it.toMove)));
}

export async function loadMctsAgent(dir, opts = {}) {
  const model = await loadModel(dir, { compile: false });
  return mctsAgent({ evaluator: netEvaluator(model), name: 'mcts', ...opts });
}
