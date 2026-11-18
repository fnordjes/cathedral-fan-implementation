// Web Worker that runs the computer opponent off the main thread, so the page
// stays responsive while it thinks.
//
// Messages in:  { id, agent, seed, state, color, phase, moves }
// Messages out: { id, move } or { id, error }
//
// One agent instance is kept per (agent, seed), so its random generator
// continues across moves of the same game like it would in a tournament.

import { makeAgent } from '../ai/agents.js';
import { mctsRolloutAgent } from '../ai/mcts.js';

// Opponents offered in the browser. Keep in sync with OPPONENTS in App.jsx.
const FACTORIES = {
  greedy: (seed) => makeAgent('greedy', { seed }),
  'mcts-r': (seed) => mctsRolloutAgent({ seed }),
};

const agents = new Map();

self.onmessage = async (e) => {
  const { id, agent, seed, state, color, phase, moves } = e.data;
  try {
    const key = `${agent}#${seed}`;
    if (!agents.has(key)) {
      const make = FACTORIES[agent];
      if (!make) throw new Error(`unknown opponent "${agent}"`);
      agents.set(key, make(seed));
    }
    const move = await agents.get(key).act(state, color, phase, moves);
    self.postMessage({ id, move });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
