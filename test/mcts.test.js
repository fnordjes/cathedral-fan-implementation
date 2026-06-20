import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mctsHeuristicAgent, mctsRolloutAgent } from '../src/ai/mcts.js';
import { initialState, cathedralMoves, buildingMoves, applyMove } from '../src/ai/moves.js';
import { playGame } from '../src/ai/simulate.js';
import { makeAgent } from '../src/ai/agents.js';

function legal(moves, chosen) {
  return moves.some(
    (m) => m.pieceId === chosen.pieceId && m.oi === chosen.oi && m.ox === chosen.ox && m.oy === chosen.oy,
  );
}

test('heuristic MCTS returns a legal move', async () => {
  const s = initialState();
  applyMove(s, 'light', cathedralMoves(s)[0]);
  const moves = buildingMoves(s, 'dark');
  const agent = mctsHeuristicAgent({ simulations: 20, seed: 1 });
  assert.ok(legal(moves, await agent.act(s, 'dark', 'main', moves)));
});

test('rollout MCTS returns a legal move', async () => {
  const s = initialState();
  applyMove(s, 'light', cathedralMoves(s)[0]);
  const moves = buildingMoves(s, 'dark');
  const agent = mctsRolloutAgent({ simulations: 15, policy: 'random', seed: 2 });
  assert.ok(legal(moves, await agent.act(s, 'dark', 'main', moves)));
});

test('a full heuristic-MCTS vs random game completes', async () => {
  const agent = mctsHeuristicAgent({ simulations: 15, seed: 3 });
  const r = await playGame(agent, makeAgent('random', { seed: 4 }));
  assert.ok(['light', 'dark', 'draw'].includes(r.winner));
  assert.ok(r.plies > 0);
});
