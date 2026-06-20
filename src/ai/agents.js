// Strategy agents. Every agent implements:
//     async act(state, color, phase, legalMoves) -> chosen move
// where `state` is an AI snapshot (see moves.js) and `legalMoves` is the list
// of legal moves for `color` this turn.

import { cloneState, applyMove } from './moves.js';
import { evaluate } from './features.js';
import { makeRng } from './rng.js';

// Weight presets that produce visibly different playing styles.
export const WEIGHTS = {
  greedy: { placed: 1.0, territory: 0.5, oppSpace: 0.05 },
  aggressive: { placed: 1.3, territory: 0.3, oppSpace: 0.14 }, // choke the opponent
  spacious: { placed: 0.7, territory: 1.1, oppSpace: 0.03 }, // grab territory
};

// Picks a uniformly random legal move.
export function randomAgent(seed = 1) {
  const rng = makeRng(seed);
  return {
    name: 'random',
    async act(_s, _color, _phase, moves) {
      return rng.pick(moves);
    },
  };
}

// One-ply lookahead: apply each move on a clone and keep the best evaluation.
// `weights` selects the style. Optional epsilon does random exploration.
export function greedyAgent(weights = WEIGHTS.greedy, { seed = 1, epsilon = 0, name } = {}) {
  const rng = makeRng(seed);
  return {
    name: name || 'greedy',
    async act(state, color, phase, moves) {
      if (phase === 'placeCathedral') return rng.pick(moves); // opening is positional; keep it varied
      if (epsilon > 0 && rng() < epsilon) return rng.pick(moves);
      let best = null;
      let bestScore = -Infinity;
      for (const move of moves) {
        const next = cloneState(state);
        applyMove(next, color, move);
        const score = evaluate(next, color, weights) + rng() * 1e-6; // tiny jitter breaks ties
        if (score > bestScore) {
          bestScore = score;
          best = move;
        }
      }
      return best;
    },
  };
}

export function aggressiveAgent(opts = {}) {
  return greedyAgent(WEIGHTS.aggressive, { name: 'aggressive', ...opts });
}
export function spaciousAgent(opts = {}) {
  return greedyAgent(WEIGHTS.spacious, { name: 'spacious', ...opts });
}

// Factory by name for CLI tools. `neural` is created lazily in neuralNet.js to
// avoid importing TensorFlow unless needed.
export function makeAgent(name, opts = {}) {
  switch (name) {
    case 'random':
      return randomAgent(opts.seed ?? 1);
    case 'greedy':
      return greedyAgent(WEIGHTS.greedy, { name: 'greedy', ...opts });
    case 'aggressive':
      return aggressiveAgent(opts);
    case 'spacious':
      return spaciousAgent(opts);
    default:
      throw new Error(`unknown agent "${name}" (use random|greedy|aggressive|spacious|neural)`);
  }
}
