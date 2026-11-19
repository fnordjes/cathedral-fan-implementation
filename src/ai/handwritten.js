// Weight-space programming experiment: a value network whose weights are
// WRITTEN BY HAND (reasoned out, no gradients, no training data), in the exact
// architecture and file format of the trained net (neuralNet.js), so the
// existing `neural` and `mcts` agents can load it unchanged.
//
//   node src/ai/handwritten.js [--out src/ai/model-handwritten] [--alpha 0] [--k 0.05]
//                              [--v2 1 --beta 1]
//   npm run tournament -- neural greedy 60 --net src/ai/model-handwritten
//
// Input (features.js, from the side `c` being evaluated): 6 planes x 100
// cells + 2 scalars.
//   plane 0 my buildings      plane 3 my territory (empty, owned by c)
//   plane 1 opp buildings     plane 4 opp territory
//   plane 2 cathedral         plane 5 empty & unclaimed
//   x[600] = my remaining squares / 47, x[601] = opp remaining squares / 47
// Planes are one-hot per cell, so "usable by me" = p3 + p5, "by opp" = p4 + p5.
//
// What the network computes (D is in "squares", higher = better for c):
//
//   D = 47 * (x601 - x600)                      squares placed, mine vs theirs
//     + (0.5 + k) * (sum p3 - sum p4)           territory (+ k for "my usable
//                                               space - their usable space",
//                                               which reduces to the same sum)
//     + alpha * (W_me - W_opp)                  room for big pieces
//   value = tanh(D / 15)
//
// W_me = number of 2x2 windows whose 4 cells are all usable by me (same for the
// opponent). Each window is one first-layer ReLU unit: relu(sum of 4 cells - 3)
// is 1 only when all four are usable, else 0. Greedy's evaluation is linear in
// the inputs and cannot express this AND; it is the "shape fit" idea from
// docs/ai-scoring-notes.md in its simplest form (a square, and most 4-5 cell
// pieces, need compact free space).
//
// With alpha = 0 the network is greedy's formula (plus k on own space), i.e.
// the experiment's control: it should play about as well as greedy.
//
// Result (2026-11-19, 60 games each vs greedy, alternating colours):
//   alpha 0    31-24-5  +1.7 squares   (control)
//   alpha 0.1  33-20-7  +1.6
//   alpha 0.3  26-25-9  +0.6
//   alpha 1.0  29-24-7  +0.2
// The window feature did not help, so the default is alpha = 0. For
// comparison, the gradient-trained net in src/ai/model loses to greedy 2-17.
//
// v2 (extended input, features.js encodeV2: + per side and piece type the
// count left and whether it still has a legal placement) adds a shape-fit term:
//
//   D += beta * (stuck_opp - stuck_me)
//   stuck(side) = sum over piece types p of size(p) * count(p) * (1 - fits(p))
//
// i.e. squares of pieces that can no longer be placed anywhere, which count
// against the final score just like unplaced ones. Each count*(1-fits) is one
// L1 unit: relu(count - 2*fits) (count <= 2, so fits=1 gives 0, fits=0 gives
// count). The "fits" bit is computed by the encoder, not by the network.
//
// Result (2026-11-19, v2, 60 games each vs greedy): beta 0 31-24-5 +1.72
// (identical games to v1 alpha 0, as expected), beta 0.5 37-18-5 +0.73,
// beta 1 31-27-2 -0.42, beta 2 38-22-0 +0.82. No measurable gain at 1-ply,
// and ~50% slower (the fits check runs for every candidate move).
//
// Layer plan (sizes fixed by createModel: 602 (v2: 646) -> 256 -> 128 -> 64 -> 1):
//   L1 (256): unit 0 = relu(+L), unit 1 = relu(-L) where L is the linear part
//             of D; units 2..82 = my 81 windows, 83..163 = opp windows; rest 0.
//   L2 (128): unit 0 = relu(+D), unit 1 = relu(-D) (recombines L and windows).
//   L3 (64):  identity pass of the pair.
//   out:      tanh((u0 - u1) / 15) = tanh(D / 15).
// ReLU passes a signed number through as the pair (relu(x), relu(-x)).

import path from 'node:path';
import tf from './tfBackend.js';
import { createModel, saveModel } from './neuralNet.js';
import { N, NUM_PLANES, INPUT_DIM, INPUT_DIM_V2, PIECE_IDS } from './features.js';
import { pieceSize } from '../game/pieces.js';

const SIZE = 10;
const SCALE = 15;

export function buildWeights({ alpha = 0, k = 0.05, v2 = false, beta = 1 } = {}) {
  const H1 = 256, H2 = 128, H3 = 64;
  const IN = v2 ? INPUT_DIM_V2 : INPUT_DIM;
  const W1 = new Float32Array(IN * H1); // [in][out], row-major
  const b1 = new Float32Array(H1);
  const W2 = new Float32Array(H1 * H2);
  const b2 = new Float32Array(H2);
  const W3 = new Float32Array(H2 * H3);
  const b3 = new Float32Array(H3);
  const W4 = new Float32Array(H3 * 1);
  const b4 = new Float32Array(1);
  const w1 = (i, o, v) => { W1[i * H1 + o] += v; };
  const plane = (p, x, y) => p * N + y * SIZE + x;
  const MY_REM = NUM_PLANES * N, OPP_REM = NUM_PLANES * N + 1;

  // --- L1 units 0/1: the linear part L of D, as (+L, -L) ---
  const linear = [];
  linear.push([MY_REM, -47], [OPP_REM, +47]);
  for (let c = 0; c < N; c++) {
    linear.push([3 * N + c, 0.5 + k], [4 * N + c, -(0.5 + k)]);
  }
  for (const [i, v] of linear) { w1(i, 0, v); w1(i, 1, -v); }

  // --- L1 units 2..163: one unit per 2x2 window per side ---
  let unit = 2;
  const windows = { me: [], opp: [] };
  for (const [side, planes] of [['me', [3, 5]], ['opp', [4, 5]]]) {
    for (let y = 0; y < SIZE - 1; y++) {
      for (let x = 0; x < SIZE - 1; x++) {
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          for (const p of planes) w1(plane(p, x + dx, y + dy), unit, 1);
        }
        b1[unit] = -3; // fires (=1) only if all 4 cells are usable
        windows[side].push(unit++);
      }
    }
  }

  // --- v2: L1 units 164..185: copies of each piece type that cannot be placed ---
  // Input layout after the 602 v1 inputs: me counts, me fits, opp counts, opp fits.
  const stuck = { me: [], opp: [] };
  if (v2) {
    const P = PIECE_IDS.length;
    PIECE_IDS.forEach((id, j) => {
      for (const [side, off] of [['me', 0], ['opp', 2 * P]]) {
        w1(INPUT_DIM + off + j, unit, 2); // count/2 * 2 = count
        w1(INPUT_DIM + off + P + j, unit, -2); // - 2 * fits
        stuck[side].push([unit++, pieceSize(id)]);
      }
    });
  }

  // --- L2 units 0/1: D = L + alpha * (W_me - W_opp) + beta * (stuck_opp - stuck_me) ---
  const w2 = (i, o, v) => { W2[i * H2 + o] += v; };
  const toD = [[0, 1], [1, -1]];
  for (const u of windows.me) toD.push([u, alpha]);
  for (const u of windows.opp) toD.push([u, -alpha]);
  for (const [u, size] of stuck.opp) toD.push([u, beta * size]);
  for (const [u, size] of stuck.me) toD.push([u, -beta * size]);
  for (const [i, v] of toD) { w2(i, 0, v); w2(i, 1, -v); }

  // --- L3: pass the pair through; output: tanh((u0 - u1) / SCALE) ---
  W3[0 * H3 + 0] = 1;
  W3[1 * H3 + 1] = 1;
  W4[0] = 1 / SCALE;
  W4[1] = -1 / SCALE;

  return [
    tf.tensor2d(W1, [IN, H1]), tf.tensor1d(b1),
    tf.tensor2d(W2, [H1, H2]), tf.tensor1d(b2),
    tf.tensor2d(W3, [H2, H3]), tf.tensor1d(b3),
    tf.tensor2d(W4, [H3, 1]), tf.tensor1d(b4),
  ];
}

export function handwrittenModel(opts = {}) {
  const model = createModel(opts.v2 ? INPUT_DIM_V2 : INPUT_DIM);
  model.setWeights(buildWeights(opts));
  return model;
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []),
  );
  const alpha = Number(args.alpha ?? 0);
  const k = Number(args.k ?? 0.05);
  const v2 = args.v2 === '1' || args.v2 === 'true';
  const beta = Number(args.beta ?? 1);
  const out = path.resolve(process.cwd(), args.out || 'src/ai/model-handwritten');
  await saveModel(handwrittenModel({ alpha, k, v2, beta }), out);
  console.log(`Wrote hand-written value net (alpha=${alpha}, k=${k}${v2 ? `, v2, beta=${beta}` : ''}) to ${out}`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('handwritten.js')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
