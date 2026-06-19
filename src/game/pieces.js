// Cathedral piece definitions and geometry helpers.
//
// Coordinates are [col, row] = [x, y] with y increasing downward.
// Each colour owns 14 building pieces (47 squares total) plus the shared,
// neutral Cathedral (6 squares).
//
// Physical Cathedral pieces are 3-D buildings: they can be ROTATED but never
// flipped over. That is why the Abbey and Academy come as mirror-image pairs,
// one chirality per colour. So every piece has at most 4 orientations
// (rotations only) and the Abbey/Academy base shape differs by colour.

// ---- Base shapes (as used by the LIGHT player) -----------------------------

const BASE_SHAPES = {
  tavern: [[0, 0]], // 1
  stable: [[0, 0], [1, 0]], // 2  domino
  inn: [[0, 0], [0, 1], [1, 1]], // 3  L-tromino
  bridge: [[0, 0], [0, 1], [0, 2]], // 3  I-tromino
  square: [[0, 0], [1, 0], [0, 1], [1, 1]], // 4  O
  manor: [[0, 0], [1, 0], [2, 0], [1, 1]], // 4  T
  abbey: [[1, 0], [2, 0], [0, 1], [1, 1]], // 4  S (light)
  academy: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]], // 5  F (light)
  infirmary: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], // 5  plus / X
  castle: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]], // 5  U
  tower: [[2, 0], [1, 1], [2, 1], [0, 2], [1, 2]], // 5  W (staircase)
};

// Abbey and Academy are mirror images for the dark player.
const DARK_SHAPES = {
  abbey: [[0, 0], [1, 0], [1, 1], [2, 1]], // Z (mirror of light S)
  academy: [[0, 0], [1, 0], [1, 1], [2, 1], [1, 2]], // F-mirror
};

// The neutral Cathedral piece (a cross / crucifix of 6 squares).
const CATHEDRAL_SHAPE = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [1, 3]];

// Per-colour roster: id -> count.
export const ROSTER = {
  tavern: 2,
  stable: 2,
  inn: 2,
  bridge: 1,
  square: 1,
  manor: 1,
  abbey: 1,
  academy: 1,
  infirmary: 1,
  castle: 1,
  tower: 1,
};

export const PIECE_NAMES = {
  tavern: 'Tavern',
  stable: 'Stable',
  inn: 'Inn',
  bridge: 'Bridge',
  square: 'Square',
  manor: 'Manor',
  abbey: 'Abbey',
  academy: 'Academy',
  infirmary: 'Infirmary',
  castle: 'Castle',
  tower: 'Tower',
  cathedral: 'Cathedral',
};

export const PIECE_ABBR = {
  tavern: 'TA',
  stable: 'ST',
  inn: 'IN',
  bridge: 'BR',
  square: 'SQ',
  manor: 'MA',
  abbey: 'AB',
  academy: 'AC',
  infirmary: 'IF',
  castle: 'CS',
  tower: 'TO',
  cathedral: 'CA',
};

// ---- Geometry helpers ------------------------------------------------------

function normalize(cells) {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([x, y]) => [x - minX, y - minY])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

function rotate90(cells) {
  // 90 degrees clockwise: (x, y) -> (-y, x)
  return cells.map(([x, y]) => [-y, x]);
}

function key(cells) {
  return cells.map(([x, y]) => `${x},${y}`).join('|');
}

// Return all unique rotational orientations of a shape (normalized).
export function orientations(cells) {
  const seen = new Map();
  let cur = normalize(cells);
  for (let i = 0; i < 4; i++) {
    const n = normalize(cur);
    seen.set(key(n), n);
    cur = rotate90(cur);
  }
  return [...seen.values()];
}

// Base (orientation 0) shape for a given piece id and colour.
export function baseShape(pieceId, color) {
  if (pieceId === 'cathedral') return CATHEDRAL_SHAPE.map((c) => [...c]);
  if (color === 'dark' && DARK_SHAPES[pieceId]) {
    return DARK_SHAPES[pieceId].map((c) => [...c]);
  }
  return BASE_SHAPES[pieceId].map((c) => [...c]);
}

// All orientations for a piece id + colour.
export function pieceOrientations(pieceId, color) {
  return orientations(baseShape(pieceId, color));
}

// Number of squares a piece occupies.
export function pieceSize(pieceId) {
  if (pieceId === 'cathedral') return CATHEDRAL_SHAPE.length;
  return BASE_SHAPES[pieceId].length;
}

// Build the full starting inventory for one colour: a list of piece instances.
export function buildInventory(color) {
  const inv = [];
  for (const [id, count] of Object.entries(ROSTER)) {
    for (let i = 0; i < count; i++) {
      inv.push({ id, instance: i, color, size: pieceSize(id) });
    }
  }
  return inv;
}
