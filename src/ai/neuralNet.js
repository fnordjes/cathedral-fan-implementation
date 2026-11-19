// Neural-net value model + the NeuralAgent.
//
// The model is a small MLP that maps a board encoding (from the side-to-move's
// perspective) to a scalar value in [-1, 1] = expected game outcome for that
// side (+1 win, -1 loss). The NeuralAgent does a 1-ply search: it applies each
// legal move, encodes the resulting position from the OPPONENT's perspective,
// and picks the move that minimises the opponent's value (negamax 1-ply).
//
// Pure @tensorflow/tfjs has no filesystem IO handler, so we serialise the model
// to a single JSON file ourselves (topology + weight specs + base64 weights).

import tf from './tfBackend.js';
import fs from 'node:fs';
import path from 'node:path';
import { cloneState, applyMove, otherColor, hasLegalMove, scoreStock } from './moves.js';
import { INPUT_DIM, encoderForDim } from './features.js';
import { makeRng } from './rng.js';

export function createModel(inputDim = INPUT_DIM) {
  const m = tf.sequential();
  m.add(tf.layers.dense({ inputShape: [inputDim], units: 256, activation: 'relu' }));
  m.add(tf.layers.dense({ units: 128, activation: 'relu' }));
  m.add(tf.layers.dense({ units: 64, activation: 'relu' }));
  m.add(tf.layers.dense({ units: 1, activation: 'tanh' }));
  m.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
  return m;
}

const MODEL_FILE = 'model.json';

export async function saveModel(model, dir) {
  fs.mkdirSync(dir, { recursive: true });
  let artifacts;
  await model.save(
    tf.io.withSaveHandler(async (a) => {
      artifacts = a;
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    }),
  );
  const payload = {
    modelTopology: artifacts.modelTopology,
    weightSpecs: artifacts.weightSpecs,
    weightDataB64: Buffer.from(artifacts.weightData).toString('base64'),
  };
  fs.writeFileSync(path.join(dir, MODEL_FILE), JSON.stringify(payload));
}

export function modelExists(dir) {
  return fs.existsSync(path.join(dir, MODEL_FILE));
}

export async function loadModel(dir, { compile = false } = {}) {
  const payload = JSON.parse(fs.readFileSync(path.join(dir, MODEL_FILE), 'utf8'));
  const buf = Buffer.from(payload.weightDataB64, 'base64');
  const weightData = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const model = await tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: payload.modelTopology,
      weightSpecs: payload.weightSpecs,
      weightData,
    }),
  );
  if (compile) model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
  return model;
}

// The feature encoder matching a model (v1 or v2, by input size).
export function encoderFor(model) {
  return encoderForDim(model.inputs[0].shape[1]);
}

// Batch-evaluate a list of Float32Array feature vectors -> number[].
export function predictValues(model, featureList) {
  return tf.tidy(() => {
    const dim = featureList[0].length;
    const flat = new Float32Array(featureList.length * dim);
    featureList.forEach((f, i) => flat.set(f, i * dim));
    const t = tf.tensor2d(flat, [featureList.length, dim]);
    const out = model.predict(t);
    return Array.from(out.dataSync());
  });
}

// Final result of a finished game from `color`'s side: +1 win, 0 draw, -1 loss
// (fewer leftover squares wins).
function outcomeFor(state, color) {
  const mine = scoreStock(state.stock[color]);
  const theirs = scoreStock(state.stock[otherColor(color)]);
  return mine < theirs ? 1 : mine > theirs ? -1 : 0;
}

export function neuralAgent(model, { seed = 1, epsilon = 0, name = 'neural' } = {}) {
  const enc = encoderFor(model);
  const rng = makeRng(seed);
  return {
    name,
    model,
    async act(state, color, phase, moves) {
      if (phase === 'placeCathedral') return rng.pick(moves);
      if (epsilon > 0 && rng() < epsilon) return rng.pick(moves);
      const opp = otherColor(color);
      // For each move, work out who moves next. Usually the opponent, but a
      // player with no legal move is skipped, and if neither can move the game
      // is over and the exact result is known. Scores are all expressed as
      // "value for the opponent", so lower is better for us.
      const scores = new Array(moves.length);
      const feats = [];
      const featSign = []; // [moveIndex, sign] per encoded position
      moves.forEach((move, i) => {
        const next = cloneState(state);
        applyMove(next, color, move);
        if (hasLegalMove(next.board, opp, next.stock[opp])) {
          feats.push(enc(next, opp));
          featSign.push([i, 1]);
        } else if (hasLegalMove(next.board, color, next.stock[color])) {
          feats.push(enc(next, color)); // we move again: our value, negated
          featSign.push([i, -1]);
        } else {
          scores[i] = -outcomeFor(next, color); // game over: exact result
        }
      });
      const values = feats.length ? predictValues(model, feats) : [];
      featSign.forEach(([i, sign], k) => {
        scores[i] = sign * values[k];
      });
      let best = null;
      let bestScore = Infinity; // minimise opponent's value
      for (let i = 0; i < moves.length; i++) {
        const score = scores[i] + rng() * 1e-6;
        if (score < bestScore) {
          bestScore = score;
          best = moves[i];
        }
      }
      return best;
    },
  };
}

export async function loadNeuralAgent(dir, opts = {}) {
  const model = await loadModel(dir, { compile: false });
  return neuralAgent(model, opts);
}
