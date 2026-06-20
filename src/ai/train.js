// Self-play trainer for the value network.
//
//   node src/ai/train.js [--iters 3] [--games 30] [--epochs 6]
//                        [--epsilon 0.25] [--opponent self|greedy] [--out src/ai/model]
//
// Each iteration plays self-play games (moves chosen by the current network with
// epsilon-greedy exploration), labels every visited position with the final game
// outcome from that side's perspective (+1 / 0 / -1), trains the network on that
// data, saves it, and reports its win-rate vs the greedy heuristic.
//
// Defaults are modest so a run finishes in a few minutes with pure-JS tfjs.
// Increase --iters/--games for a stronger net (see README).

import * as tf from '@tensorflow/tfjs';
import path from 'node:path';
import { playGame } from './simulate.js';
import { encode, INPUT_DIM } from './features.js';
import { makeAgent } from './agents.js';
import { createModel, saveModel, loadModel, modelExists, neuralAgent } from './neuralNet.js';

function parseArgs(argv) {
  const a = { iters: 3, games: 30, epochs: 6, epsilon: 0.25, opponent: 'self', out: 'src/ai/model', seed: 1, evalGames: 12 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    const v = argv[i + 1];
    if (k in a) {
      a[k] = ['out', 'opponent'].includes(k) ? v : Number(v);
      i++;
    }
  }
  return a;
}

async function collectGame(model, opts, seed) {
  const samples = [];
  const onDecision = (state, color) => samples.push({ f: encode(state, color), color });
  let light, dark;
  if (opts.opponent === 'greedy-self') {
    // Fast bootstrap: both sides are the greedy heuristic with exploration.
    // No network inference during play, so we can generate a lot of labelled
    // positions quickly to pre-train the value net toward competent play.
    light = makeAgent('greedy', { seed, epsilon: opts.epsilon });
    dark = makeAgent('greedy', { seed: seed + 7, epsilon: opts.epsilon });
  } else {
    const net = (s) => neuralAgent(model, { seed: s, epsilon: opts.epsilon });
    light = net(seed);
    dark = opts.opponent === 'greedy' ? makeAgent('greedy', { seed: seed + 7 }) : net(seed + 9999);
  }
  const r = await playGame(light, dark, { onDecision });
  const z = (color) => (r.winner === 'draw' ? 0 : r.winner === color ? 1 : -1);
  return samples.map((s) => ({ f: s.f, y: z(s.color) }));
}

async function evalVsGreedy(model, n = 12, seed = 777) {
  let win = 0, loss = 0, draw = 0;
  for (let i = 0; i < n; i++) {
    const net = neuralAgent(model, { seed: seed + i });
    const grd = makeAgent('greedy', { seed: seed + 100 + i });
    const netLight = i % 2 === 0;
    const r = await playGame(netLight ? net : grd, netLight ? grd : net);
    const netColor = netLight ? 'light' : 'dark';
    if (r.winner === 'draw') draw++;
    else if (r.winner === netColor) win++;
    else loss++;
  }
  return { win, loss, draw, n };
}

async function main() {
  const opts = parseArgs(process.argv);
  const outDir = path.resolve(process.cwd(), opts.out);
  console.log('Training config:', opts);

  let model = modelExists(outDir) ? await loadModel(outDir, { compile: true }) : createModel();
  console.log(modelExists(outDir) ? `Loaded existing model from ${outDir}` : 'Created new model');

  for (let iter = 1; iter <= opts.iters; iter++) {
    const t0 = Date.now();
    const data = [];
    for (let g = 0; g < opts.games; g++) {
      const seed = iter * 100000 + g * 31 + opts.seed;
      const samples = await collectGame(model, opts, seed);
      for (const s of samples) data.push(s);
    }

    const n = data.length;
    const X = new Float32Array(n * INPUT_DIM);
    const Y = new Float32Array(n);
    data.forEach((s, i) => {
      X.set(s.f, i * INPUT_DIM);
      Y[i] = s.y;
    });
    const xs = tf.tensor2d(X, [n, INPUT_DIM]);
    const ys = tf.tensor2d(Y, [n, 1]);
    const h = await model.fit(xs, ys, { epochs: opts.epochs, batchSize: 64, shuffle: true, verbose: 0 });
    xs.dispose();
    ys.dispose();

    await saveModel(model, outDir);
    const ev = opts.evalGames > 0 ? await evalVsGreedy(model, opts.evalGames) : null;
    const loss = h.history.loss[h.history.loss.length - 1].toFixed(4);
    console.log(
      `iter ${iter}/${opts.iters}: ${opts.games} games, ${n} samples, loss ${loss}, ` +
        `${ev ? `vs greedy ${ev.win}-${ev.loss}-${ev.draw} (W-L-D)` : 'eval skipped'} | ${(Date.now() - t0) / 1000}s`,
    );
  }

  console.log(`Done. Model saved to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
