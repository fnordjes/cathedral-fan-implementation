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
import { cloneState, applyMove, otherColor } from './moves.js';
import { encode, INPUT_DIM } from './features.js';
import { makeRng } from './rng.js';

export function createModel() {
  const m = tf.sequential();
  m.add(tf.layers.dense({ inputShape: [INPUT_DIM], units: 256, activation: 'relu' }));
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

// Batch-evaluate a list of Float32Array feature vectors -> number[].
export function predictValues(model, featureList) {
  return tf.tidy(() => {
    const flat = new Float32Array(featureList.length * INPUT_DIM);
    featureList.forEach((f, i) => flat.set(f, i * INPUT_DIM));
    const t = tf.tensor2d(flat, [featureList.length, INPUT_DIM]);
    const out = model.predict(t);
    return Array.from(out.dataSync());
  });
}

export function neuralAgent(model, { seed = 1, epsilon = 0, name = 'neural' } = {}) {
  const rng = makeRng(seed);
  return {
    name,
    model,
    async act(state, color, phase, moves) {
      if (phase === 'placeCathedral') return rng.pick(moves);
      if (epsilon > 0 && rng() < epsilon) return rng.pick(moves);
      const opp = otherColor(color);
      const feats = moves.map((move) => {
        const next = cloneState(state);
        applyMove(next, color, move);
        return encode(next, opp); // value for opponent in resulting position
      });
      const values = predictValues(model, feats);
      let best = null;
      let bestScore = Infinity; // minimise opponent's value
      for (let i = 0; i < moves.length; i++) {
        const score = values[i] + rng() * 1e-6;
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
