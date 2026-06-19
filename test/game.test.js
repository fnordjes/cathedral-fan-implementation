import { test } from 'node:test';
import assert from 'node:assert/strict';
// NOTE: boardgame.io (v0.50) has no "type":"module", so Node treats its build
// files as CommonJS. Default-import the CJS builds and destructure (named ESM
// imports fail on Node 18).
import bgioClient from 'boardgame.io/dist/cjs/client.js';
import bgioMultiplayer from 'boardgame.io/dist/cjs/multiplayer.js';

const { Client } = bgioClient;
const { Local } = bgioMultiplayer;
import { Cathedral } from '../src/game/cathedral.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

function makeMatch() {
  const local = Local();
  const spec = { game: Cathedral, numPlayers: 2, multiplayer: local };
  const light = Client({ ...spec, playerID: '0' });
  const dark = Client({ ...spec, playerID: '1' });
  light.start();
  dark.start();
  return { light, dark };
}

test('full game flow: cathedral opening, alternating turns, validation', async () => {
  const { light, dark } = makeMatch();
  await tick();

  // Opening: Light to place the Cathedral.
  assert.equal(light.getState().ctx.phase, 'placeCathedral');
  assert.equal(light.getState().ctx.currentPlayer, '0');

  // Dark cannot act during the opening (move rejected, no state change).
  const before = JSON.stringify(dark.getState().G);
  dark.moves.placePiece('tower', 0, 0, 0, 0);
  await tick();
  assert.equal(JSON.stringify(dark.getState().G), before);

  // Light places the Cathedral at E5 (origin 4,4).
  light.moves.placeCathedral(0, 4, 4);
  await tick();
  let s = light.getState();
  assert.equal(s.G.cathedralPlaced, true);
  assert.equal(s.ctx.phase, 'main');
  assert.equal(s.ctx.currentPlayer, '1'); // Dark moves first

  // Dark places a Tower in the corner.
  dark.moves.placePiece('tower', 0, 0, 0, 0);
  await tick();
  s = dark.getState();
  assert.equal(s.ctx.currentPlayer, '0');
  assert.equal(s.G.placedCount.dark, 1);
  assert.equal(s.G.stock.dark.length, 13);

  // Illegal: Light tries to build on the Cathedral's squares -> rejected.
  const stockBefore = light.getState().G.stock.light.length;
  light.moves.placePiece('square', 0, 0, 5, 5); // overlaps cathedral cells
  await tick();
  assert.equal(light.getState().G.stock.light.length, stockBefore);
  assert.equal(light.getState().ctx.currentPlayer, '0'); // still Light's turn

  // Light makes a legal move far from everything.
  light.moves.placePiece('square', 0, 0, 0, 8);
  await tick();
  s = light.getState();
  assert.equal(s.G.placedCount.light, 1);
  assert.equal(s.ctx.currentPlayer, '1');
});

test('setup builds correct inventories', () => {
  const G = Cathedral.setup();
  assert.equal(G.stock.light.length, 14);
  assert.equal(G.stock.dark.length, 14);
  assert.equal(G.cathedralPlaced, false);
  assert.equal(G.board.cells.length, 10);
  assert.equal(G.board.cells[0].length, 10);
});
