// Build any agent by name — shared by the CLI tools (tournament.js, netbot.js).
//
// Agents: random | greedy | aggressive | spacious   (pure JS, from agents.js)
//         mcts-r | mcts-h                           (MCTS, no model)
//         neural | mcts                             (need a trained model in netDir)
//
// Options: sims (MCTS simulations, default 80), rollout ('big' | 'random' |
// 'greedy', playout policy for mcts-r, default 'big'), topK (candidate moves
// per node for mcts-r, default 5; 0 = keep all).

import { makeAgent } from './agents.js';
import { loadNeuralAgent, modelExists } from './neuralNet.js';
import { mctsHeuristicAgent, mctsRolloutAgent } from './mcts.js';
import { loadMctsAgent } from './mctsNet.js';

export async function buildAgent(name, seed, netDir, { sims = 80, rollout = 'big', topK } = {}) {
  const simulations = Number(sims);
  if (name === 'mcts-r') {
    const opts = { seed, simulations, policy: rollout };
    if (topK !== undefined) opts.topK = Number(topK) || null; // 0 => all moves
    return mctsRolloutAgent(opts);
  }
  if (name === 'mcts-h') return mctsHeuristicAgent({ seed, simulations });
  if (name === 'neural' || name === 'mcts') {
    if (!modelExists(netDir)) throw new Error(`no model at ${netDir} — train one first: npm run train`);
    if (name === 'mcts') return loadMctsAgent(netDir, { seed, simulations });
    return loadNeuralAgent(netDir, { seed });
  }
  return makeAgent(name, { seed });
}
