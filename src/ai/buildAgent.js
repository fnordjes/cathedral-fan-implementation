// Build any agent by name — shared by the CLI tools (tournament.js, netbot.js).
//
// Agents: random | greedy | aggressive | spacious   (pure JS, from agents.js)
//         mcts-r | mcts-h                           (MCTS, no model)
//         neural | mcts                             (need a trained model in netDir)
//
// Options: sims (MCTS simulations, default 80), rollout ('big' | 'random' |
// 'greedy', playout policy for mcts-r, default 'big').

import { makeAgent } from './agents.js';
import { loadNeuralAgent, modelExists } from './neuralNet.js';
import { mctsHeuristicAgent, mctsRolloutAgent } from './mcts.js';
import { loadMctsAgent } from './mctsNet.js';

export async function buildAgent(name, seed, netDir, { sims = 80, rollout = 'big' } = {}) {
  const simulations = Number(sims);
  if (name === 'mcts-r') return mctsRolloutAgent({ seed, simulations, policy: rollout });
  if (name === 'mcts-h') return mctsHeuristicAgent({ seed, simulations });
  if (name === 'neural' || name === 'mcts') {
    if (!modelExists(netDir)) throw new Error(`no model at ${netDir} — train one first: npm run train`);
    if (name === 'mcts') return loadMctsAgent(netDir, { seed, simulations });
    return loadNeuralAgent(netDir, { seed });
  }
  return makeAgent(name, { seed });
}
