// Monte Carlo Tree Search (PUCT) with pluggable leaf evaluation.
//
// MCTS grows a search tree, spending more simulations on promising lines than a
// 1-ply agent can. Three leaf-evaluation modes are supported:
//
//   * net      — value network for priors + leaf value (the AlphaZero-style
//                approach you asked for; only as strong as the net, slow under
//                pure-JS tfjs).
//   * heuristic— the greedy evaluation for priors + leaf value (no model).
//   * rollout  — classic Monte Carlo: play each leaf out to the end with a fast
//                policy and use the real result. Immune to static-eval
//                "search pathology", so it reliably matches/beats greedy given
//                enough simulations.
//
// All modes share one negamax tree over the two colours; Cathedral's turn-skip
// and exact terminal scoring are handled when children are created/rolled out.

import {
  cloneState,
  applyMove,
  buildingMoves,
  otherColor,
  hasLegalMove,
  scoreStock,
} from './moves.js';
import { canPlaceCells, BOARD_SIZE } from '../game/logic.js';
import { pieceOrientations } from '../game/pieces.js';
import { encode, evaluate } from './features.js';
import { predictValues, loadModel } from './neuralNet.js';
import { WEIGHTS } from './agents.js';
import { makeRng } from './rng.js';

// Sample ONE legal move cheaply (random piece/orientation/origin with retries),
// falling back to full enumeration only if sampling fails. Keeps random
// rollouts fast — enumerating every legal move each ply would be far too slow.
function sampleLegalMove(state, color, rng) {
  const stock = state.stock[color];
  if (!stock.length) return null;
  for (let t = 0; t < 40; t++) {
    const p = stock[rng.int(stock.length)];
    const orients = pieceOrientations(p.id, color);
    const oi = rng.int(orients.length);
    const shape = orients[oi];
    let maxX = 0;
    let maxY = 0;
    for (const [x, y] of shape) {
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const ox = rng.int(BOARD_SIZE - maxX);
    const oy = rng.int(BOARD_SIZE - maxY);
    const cells = shape.map(([x, y]) => [x + ox, y + oy]);
    if (canPlaceCells(state.board, color, cells)) {
      return { kind: 'building', pieceId: p.id, instance: p.instance, oi, ox, oy, cells };
    }
  }
  const all = buildingMoves(state, color);
  return all.length ? all[rng.int(all.length)] : null;
}

export function netEvaluator(model) {
  return (items) => predictValues(model, items.map((it) => encode(it.state, it.toMove)));
}
export function heuristicEvaluator(weights = WEIGHTS.greedy, scale = 15) {
  return (items) => items.map((it) => Math.tanh(evaluate(it.state, it.toMove, weights) / scale));
}

function nextMover(state, justMoved) {
  const opp = otherColor(justMoved);
  if (hasLegalMove(state.board, opp, state.stock[opp])) return opp;
  if (hasLegalMove(state.board, justMoved, state.stock[justMoved])) return justMoved;
  return null;
}
function terminalValue(state, perspective) {
  const light = scoreStock(state.stock.light);
  const dark = scoreStock(state.stock.dark);
  if (light === dark) return 0;
  return (light < dark ? 'light' : 'dark') === perspective ? 1 : -1;
}
function softmax(xs, tau) {
  const m = Math.max(...xs);
  const exps = xs.map((x) => Math.exp((x - m) / tau));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}
function makeNode(state, toMove, terminal) {
  return { state, toMove, terminal, expanded: false };
}

// Play `state` (with `toMove` to move) to the end and return the result from
// `toMove`'s perspective. policy: 'random' (fast) or 'greedy' (stronger).
function rollout(state, toMove, policy, rng) {
  const s = cloneState(state);
  let cur = toMove;
  for (let plies = 0; plies < 400; plies++) {
    let move;
    if (policy === 'greedy') {
      const moves = buildingMoves(s, cur);
      if (moves.length) {
        let best = -Infinity;
        move = moves[0];
        for (const m of moves) {
          const cs = cloneState(s);
          applyMove(cs, cur, m);
          const v = evaluate(cs, cur, WEIGHTS.greedy);
          if (v > best) {
            best = v;
            move = m;
          }
        }
      }
    } else {
      move = sampleLegalMove(s, cur, rng);
    }
    if (move) applyMove(s, cur, move);
    const opp = otherColor(cur);
    if (hasLegalMove(s.board, opp, s.stock[opp])) cur = opp;
    else if (!hasLegalMove(s.board, cur, s.stock[cur])) break;
  }
  return terminalValue(s, toMove);
}

function expand(node, cfg) {
  const moves = buildingMoves(node.state, node.toMove);
  const meta = moves.map((m) => {
    const cs = cloneState(node.state);
    applyMove(cs, node.toMove, m);
    const nm = nextMover(cs, node.toMove);
    return { state: cs, toMove: nm, terminal: nm === null };
  });

  let leafValue;
  if (cfg.rolloutPolicy) {
    node.P = new Array(moves.length).fill(1 / moves.length); // uniform priors
    node.childVal = null;
    leafValue = rollout(node.state, node.toMove, cfg.rolloutPolicy, cfg.rng);
  } else {
    const items = [];
    const idx = [];
    meta.forEach((c, i) => {
      if (!c.terminal) {
        idx.push(i);
        items.push({ state: c.state, toMove: c.toMove });
      }
    });
    const vals = items.length ? cfg.evaluator(items) : [];
    const childVal = meta.map((c, i) => {
      if (c.terminal) return terminalValue(c.state, node.toMove);
      const v = vals[idx.indexOf(i)];
      return (c.toMove === node.toMove ? 1 : -1) * v;
    });
    node.P = softmax(childVal, cfg.priorTau);
    node.childVal = childVal; // static 1-ply values, used as fallback at selection
    leafValue = Math.max(...childVal);
  }

  node.moves = moves;
  node.meta = meta;
  node.N = new Array(moves.length).fill(0);
  node.W = new Array(moves.length).fill(0);
  node.children = new Array(moves.length).fill(null);
  node.totalN = 0;
  node.expanded = true;
  return leafValue;
}

function selectEdge(node, cPuct) {
  const sqrtTot = Math.sqrt(Math.max(1, node.totalN));
  let best = 0;
  let bestScore = -Infinity;
  for (let a = 0; a < node.moves.length; a++) {
    const q = node.N[a] > 0 ? node.W[a] / node.N[a] : 0;
    const u = cPuct * node.P[a] * (sqrtTot / (1 + node.N[a]));
    const score = q + u;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

function runSimulation(root, cfg) {
  const path = [];
  let node = root;
  let v;
  let leafToMove;
  for (;;) {
    if (node.terminal) {
      leafToMove = 'light';
      v = terminalValue(node.state, 'light');
      break;
    }
    if (!node.expanded) {
      v = expand(node, cfg);
      leafToMove = node.toMove;
      break;
    }
    const a = selectEdge(node, cfg.cPuct);
    path.push([node, a]);
    if (node.children[a] === null) {
      const c = node.meta[a];
      node.children[a] = makeNode(c.state, c.terminal ? 'light' : c.toMove, c.terminal);
      node = node.children[a];
      continue;
    }
    node = node.children[a];
  }
  for (const [n, a] of path) {
    n.N[a] += 1;
    n.totalN += 1;
    n.W[a] += n.toMove === leafToMove ? v : -v;
  }
}

export function mctsAgent({
  evaluator = null,
  rolloutPolicy = null,
  simulations = 80,
  cPuct = 1.5,
  priorTau = 0.4,
  seed = 1,
  name = 'mcts',
} = {}) {
  const rng = makeRng(seed);
  const cfg = { evaluator, rolloutPolicy, cPuct, priorTau, rng };
  return {
    name,
    async act(state, color, phase, moves) {
      if (phase === 'placeCathedral') return rng.pick(moves);
      const root = makeNode(cloneState(state), color, false);
      for (let i = 0; i < simulations; i++) runSimulation(root, cfg);
      if (!root.expanded) return rng.pick(moves);
      // Select by mean value (Q) of visited moves, falling back to the static
      // 1-ply value for unvisited ones. Robust when simulations << branching
      // factor (true for Cathedral): every move is ranked, and search only
      // overrides moves it actually explored.
      let bestA = 0;
      let bestScore = -Infinity;
      for (let a = 0; a < root.moves.length; a++) {
        const score =
          root.N[a] > 0 ? root.W[a] / root.N[a] : root.childVal ? root.childVal[a] : -Infinity;
        if (score > bestScore) {
          bestScore = score;
          bestA = a;
        }
      }
      const chosen = root.moves[bestA];
      return (
        moves.find(
          (m) => m.pieceId === chosen.pieceId && m.oi === chosen.oi && m.ox === chosen.ox && m.oy === chosen.oy,
        ) || chosen
      );
    },
  };
}

// Net-backed PUCT MCTS (loads the trained value network).
export async function loadMctsAgent(dir, opts = {}) {
  const model = await loadModel(dir, { compile: false });
  return mctsAgent({ evaluator: netEvaluator(model), name: 'mcts', ...opts });
}
// Heuristic-backed PUCT MCTS (no model).
export function mctsHeuristicAgent(opts = {}) {
  return mctsAgent({ evaluator: heuristicEvaluator(WEIGHTS.greedy), name: 'mcts-h', ...opts });
}
// Classic rollout MCTS (no model). policy: 'random' (default) or 'greedy'.
export function mctsRolloutAgent({ policy = 'random', ...opts } = {}) {
  return mctsAgent({ rolloutPolicy: policy, name: 'mcts-r', ...opts });
}
