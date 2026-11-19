import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handwrittenModel } from '../src/ai/handwritten.js';
import { predictValues } from '../src/ai/neuralNet.js';
import { encode } from '../src/ai/features.js';
import { initialState, cathedralMoves, buildingMoves, applyMove, scoreStock, territoryCount, otherColor } from '../src/ai/moves.js';
import { makeRng } from '../src/ai/rng.js';

// Reference implementation of what the hand-written weights are meant to compute.
function expectedD(state, c, { alpha, k }) {
  const o = otherColor(c);
  const usable = (col, x, y) => state.board.cells[y][x] === null && state.board.owner[y][x] !== otherColor(col);
  const windows = (col) => {
    let n = 0;
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++)
        if (usable(col, x, y) && usable(col, x + 1, y) && usable(col, x, y + 1) && usable(col, x + 1, y + 1)) n++;
    return n;
  };
  return (
    scoreStock(state.stock[o]) - scoreStock(state.stock[c]) +
    (0.5 + k) * (territoryCount(state.board, c) - territoryCount(state.board, o)) +
    alpha * (windows(c) - windows(o))
  );
}

test('hand-written net computes tanh(D/15) for the documented D', () => {
  const opts = { alpha: 0.1, k: 0.05 };
  const model = handwrittenModel(opts);
  const rng = makeRng(7);
  const samples = [];
  for (let g = 0; g < 4; g++) {
    const s = initialState();
    applyMove(s, 'light', rng.pick(cathedralMoves(s)));
    let cur = 'dark';
    for (let ply = 0; ply < 40; ply++) {
      const ms = buildingMoves(s, cur);
      if (!ms.length) break;
      applyMove(s, cur, rng.pick(ms));
      for (const c of ['light', 'dark']) samples.push({ f: encode(s, c), d: expectedD(s, c, opts) });
      cur = otherColor(cur);
    }
  }
  const vals = predictValues(model, samples.map((x) => x.f));
  let worst = 0;
  samples.forEach((x, i) => {
    worst = Math.max(worst, Math.abs(vals[i] - Math.tanh(x.d / 15)));
  });
  assert.ok(samples.length > 50);
  assert.ok(worst < 1e-4, `max deviation ${worst}`);
});
