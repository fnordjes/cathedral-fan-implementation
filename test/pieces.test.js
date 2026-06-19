import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROSTER,
  buildInventory,
  pieceSize,
  pieceOrientations,
  baseShape,
} from '../src/game/pieces.js';

test('each colour has 14 pieces totalling 47 squares', () => {
  for (const color of ['light', 'dark']) {
    const inv = buildInventory(color);
    assert.equal(inv.length, 14);
    const squares = inv.reduce((s, p) => s + p.size, 0);
    assert.equal(squares, 47);
  }
});

test('roster counts are correct', () => {
  assert.equal(ROSTER.tavern, 2);
  assert.equal(ROSTER.stable, 2);
  assert.equal(ROSTER.inn, 2);
  assert.equal(Object.values(ROSTER).reduce((a, b) => a + b, 0), 14);
});

test('cathedral occupies 6 squares', () => {
  assert.equal(pieceSize('cathedral'), 6);
  assert.equal(baseShape('cathedral', 'light').length, 6);
});

test('orientation counts match symmetry', () => {
  // 1x1 tavern and 2x2 square have a single orientation.
  assert.equal(pieceOrientations('tavern', 'light').length, 1);
  assert.equal(pieceOrientations('square', 'light').length, 1);
  // straight bridge (I3) has 2; L-tromino inn has 4.
  assert.equal(pieceOrientations('bridge', 'light').length, 2);
  assert.equal(pieceOrientations('inn', 'light').length, 4);
  // plus-shaped infirmary has a single orientation.
  assert.equal(pieceOrientations('infirmary', 'light').length, 1);
});

test('abbey and academy are mirror-different between colours', () => {
  const norm = (cells) =>
    cells
      .map(([x, y]) => `${x},${y}`)
      .sort()
      .join('|');
  const lightAbbey = new Set(pieceOrientations('abbey', 'light').map(norm));
  const darkAbbey = pieceOrientations('abbey', 'dark').map(norm);
  // Dark abbey orientations should NOT all be reachable by rotating light abbey.
  assert.ok(darkAbbey.some((o) => !lightAbbey.has(o)));

  const lightAcad = new Set(pieceOrientations('academy', 'light').map(norm));
  const darkAcad = pieceOrientations('academy', 'dark').map(norm);
  assert.ok(darkAcad.some((o) => !lightAcad.has(o)));
});

test('non-chiral pieces are identical between colours', () => {
  const norm = (cells) => cells.map(([x, y]) => `${x},${y}`).sort().join('|');
  for (const id of ['tower', 'castle', 'infirmary', 'manor', 'square']) {
    const l = new Set(pieceOrientations(id, 'light').map(norm));
    const d = pieceOrientations(id, 'dark').map(norm);
    assert.ok(d.every((o) => l.has(o)), `${id} should match between colours`);
  }
});
