import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBoard,
  canPlaceCells,
  placeBuilding,
  resolveTerritory,
  hasLegalMove,
  scoreStock,
  buildInventory,
} from '../src/game/logic.js';

function darkAt(board, ...cells) {
  cells.forEach(([x, y], i) => placeBuilding(board, 'dark', 'stable', i, [[x, y]]));
}
function lightAt(board, ...cells) {
  cells.forEach(([x, y], i) => placeBuilding(board, 'light', 'tavern', i, [[x, y]]));
}

test('canPlaceCells: bounds, occupancy, territory', () => {
  const b = createBoard();
  assert.ok(canPlaceCells(b, 'light', [[0, 0], [1, 0]]));
  assert.ok(!canPlaceCells(b, 'light', [[-1, 0]])); // off board
  assert.ok(!canPlaceCells(b, 'light', [[9, 9], [10, 9]])); // off board
  placeBuilding(b, 'dark', 'tavern', 0, [[5, 5]]);
  assert.ok(!canPlaceCells(b, 'light', [[5, 5]])); // occupied
  b.owner[2][2] = 'dark';
  assert.ok(!canPlaceCells(b, 'light', [[2, 2]])); // opponent territory
  b.owner[3][3] = 'light';
  assert.ok(canPlaceCells(b, 'light', [[3, 3]])); // own territory is fine
});

test('claims an enclosed empty pocket without touching the commons', () => {
  const b = createBoard();
  darkAt(b, [1, 0], [0, 1]); // seal the (0,0) corner
  const captured = resolveTerritory(b, 'dark', false);
  assert.equal(captured.length, 0);
  assert.equal(b.owner[0][0], 'dark'); // pocket claimed
  assert.equal(b.owner[5][5], null); // commons untouched
});

test('captures a single trapped enemy building and frees its square', () => {
  const b = createBoard();
  lightAt(b, [0, 0]); // a lone light piece in the corner
  darkAt(b, [1, 0], [0, 1]); // dark seals it in
  const captured = resolveTerritory(b, 'dark', false);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].kind, 'building');
  assert.equal(captured[0].color, 'light');
  assert.equal(b.cells[0][0], null); // removed from board
  assert.equal(b.owner[0][0], 'dark'); // space claimed
});

test('does NOT capture when two enemy buildings share a pocket', () => {
  const b = createBoard();
  lightAt(b, [0, 0], [0, 1]); // two light pieces together
  darkAt(b, [1, 0], [1, 1], [0, 2]); // sealed in a pocket
  const captured = resolveTerritory(b, 'dark', false);
  assert.equal(captured.length, 0);
  assert.notEqual(b.cells[0][0], null); // both remain
  assert.notEqual(b.cells[1][0] === null, true);
  assert.equal(b.owner[0][0], 'light'); // still belongs to light (occupied)
});

test('captures the Cathedral when isolated alone', () => {
  const b = createBoard();
  b.cells[0][0] = { kind: 'cathedral' }; // synthetic single-cell for the rule path
  darkAt(b, [1, 0], [0, 1]);
  const captured = resolveTerritory(b, 'dark', false);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].kind, 'cathedral');
  assert.equal(b.cells[0][0], null);
});

test('no claiming on a first move', () => {
  const b = createBoard();
  darkAt(b, [1, 0], [0, 1]);
  const captured = resolveTerritory(b, 'dark', true);
  assert.equal(captured.length, 0);
  assert.equal(b.owner[0][0], null);
});

test('hasLegalMove: true on empty board, false on a full board', () => {
  const b = createBoard();
  assert.ok(hasLegalMove(b, 'light', buildInventory('light')));
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++) placeBuilding(b, 'dark', 'tavern', 0, [[x, y]]);
  assert.ok(!hasLegalMove(b, 'light', buildInventory('light')));
});

test('scoreStock sums piece sizes', () => {
  assert.equal(scoreStock([{ id: 'tavern' }, { id: 'square' }, { id: 'tower' }]), 1 + 4 + 5);
  assert.equal(scoreStock(buildInventory('light')), 47);
  assert.equal(scoreStock([]), 0);
});
