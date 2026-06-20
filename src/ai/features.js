// Board encoding for the neural-net agent, plus the cheap evaluation used by the
// heuristic/greedy agents. Everything is from the perspective of `color`
// (the side to move / being evaluated) so a single network serves both colours.

import { BOARD_SIZE } from '../game/logic.js';
import { scoreStock, territoryCount, availableSpace, otherColor } from './moves.js';

export const N = BOARD_SIZE * BOARD_SIZE; // 100
export const NUM_PLANES = 6;
export const INPUT_DIM = NUM_PLANES * N + 2; // planes + 2 scalars

// Float32 vector: 6 binary 10x10 planes + 2 scalars (remaining stock fraction).
export function encode(state, color) {
  const opp = otherColor(color);
  const v = new Float32Array(INPUT_DIM);
  const { cells, owner } = state.board;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const i = y * BOARD_SIZE + x;
      const o = cells[y][x];
      const ow = owner[y][x];
      if (o && o.kind === 'building' && o.color === color) v[0 * N + i] = 1;
      else if (o && o.kind === 'building' && o.color === opp) v[1 * N + i] = 1;
      else if (o && o.kind === 'cathedral') v[2 * N + i] = 1;
      else if (!o && ow === color) v[3 * N + i] = 1; // my territory
      else if (!o && ow === opp) v[4 * N + i] = 1; // opp territory
      else if (!o) v[5 * N + i] = 1; // empty & unclaimed
    }
  }
  v[NUM_PLANES * N + 0] = scoreStock(state.stock[color]) / 47;
  v[NUM_PLANES * N + 1] = scoreStock(state.stock[opp]) / 47;
  return v;
}

// Cheap, fast evaluation of a state from `color`'s perspective (higher better).
// Captures and big-piece placements fall out naturally: placing/capturing
// reduces your remaining squares (or raises the opponent's), and claimed
// territory + denying the opponent space are rewarded directly.
export function evaluate(state, color, w) {
  const opp = otherColor(color);
  const myRem = scoreStock(state.stock[color]);
  const oppRem = scoreStock(state.stock[opp]);
  const placedDiff = oppRem - myRem; // we want our remaining low, theirs high
  const territoryDiff =
    territoryCount(state.board, color) - territoryCount(state.board, opp);
  const oppSpace = availableSpace(state.board, opp);
  return w.placed * placedDiff + w.territory * territoryDiff - w.oppSpace * oppSpace;
}
