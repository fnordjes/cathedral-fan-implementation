import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createModel,
  saveModel,
  loadModel,
  predictValues,
  neuralAgent,
} from '../src/ai/neuralNet.js';
import { initialState, cathedralMoves, buildingMoves, applyMove } from '../src/ai/moves.js';
import { encode } from '../src/ai/features.js';

test('model predicts a scalar value in [-1, 1]', () => {
  const model = createModel();
  const v = predictValues(model, [encode(initialState(), 'light')]);
  assert.equal(v.length, 1);
  assert.ok(v[0] >= -1 && v[0] <= 1);
});

test('JSON save/load reproduces predictions', async () => {
  const model = createModel();
  const feat = encode(initialState(), 'dark');
  const before = predictValues(model, [feat])[0];

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cathedral-model-'));
  await saveModel(model, dir);
  const reloaded = await loadModel(dir);
  const after = predictValues(reloaded, [feat])[0];

  assert.ok(Math.abs(before - after) < 1e-5, `before ${before} != after ${after}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('neural agent returns a legal move', async () => {
  const model = createModel();
  const s = initialState();
  applyMove(s, 'light', cathedralMoves(s)[0]);
  const moves = buildingMoves(s, 'dark');
  const agent = neuralAgent(model, { seed: 1 });
  const chosen = await agent.act(s, 'dark', 'main', moves);
  assert.ok(moves.includes(chosen));
});
