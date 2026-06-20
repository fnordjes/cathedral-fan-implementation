import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  cathedralMoves,
  buildingMoves,
  applyMove,
} from '../src/ai/moves.js';
import { playGame } from '../src/ai/simulate.js';
import { makeAgent } from '../src/ai/agents.js';

test('opening has legal Cathedral placements', () => {
  const s = initialState();
  const moves = cathedralMoves(s);
  assert.ok(moves.length > 0);
  assert.ok(moves.every((m) => m.kind === 'cathedral'));
});

test('after the Cathedral is placed, Dark has building moves', () => {
  const s = initialState();
  applyMove(s, 'light', cathedralMoves(s)[0]);
  const moves = buildingMoves(s, 'dark');
  assert.ok(moves.length > 0);
  assert.ok(moves.every((m) => m.kind === 'building'));
});

test('applyMove updates stock and placed count', () => {
  const s = initialState();
  applyMove(s, 'light', cathedralMoves(s)[0]);
  const before = s.stock.dark.length;
  const move = buildingMoves(s, 'dark')[0];
  applyMove(s, 'dark', move);
  assert.equal(s.stock.dark.length, before - 1);
  assert.equal(s.placedCount.dark, 1);
});

test('agents always return a move from the legal list', async () => {
  const s = initialState();
  applyMove(s, 'light', cathedralMoves(s)[0]);
  const moves = buildingMoves(s, 'dark');
  for (const name of ['random', 'greedy', 'aggressive', 'spacious']) {
    const agent = makeAgent(name, { seed: 3 });
    const chosen = await agent.act(s, 'dark', 'main', moves);
    assert.ok(moves.includes(chosen), `${name} returned a non-legal move`);
  }
});

test('a full random game completes with a valid result', async () => {
  const r = await playGame(makeAgent('random', { seed: 1 }), makeAgent('random', { seed: 2 }));
  assert.ok(['light', 'dark', 'draw'].includes(r.winner));
  assert.ok(r.plies > 0);
  for (const c of ['light', 'dark']) {
    assert.ok(r.scores[c] >= 0 && r.scores[c] <= 47);
  }
  // Winner (if any) must have the lower leftover count.
  if (r.winner === 'light') assert.ok(r.scores.light < r.scores.dark);
  if (r.winner === 'dark') assert.ok(r.scores.dark < r.scores.light);
});

test('greedy beats random over a short series', async () => {
  let greedyWins = 0;
  const N = 10;
  for (let i = 0; i < N; i++) {
    const g = makeAgent('greedy', { seed: i + 1 });
    const rnd = makeAgent('random', { seed: 100 + i });
    const gLight = i % 2 === 0;
    const r = await playGame(gLight ? g : rnd, gLight ? rnd : g);
    const gColor = gLight ? 'light' : 'dark';
    if (r.winner === gColor) greedyWins++;
  }
  assert.ok(greedyWins >= 6, `expected greedy to dominate, won ${greedyWins}/${N}`);
});
