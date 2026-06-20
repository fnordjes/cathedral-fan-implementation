// Pure Cathedral rules engine.
//
// All functions here are framework-agnostic. They operate on plain JS data so
// they can be unit-tested in isolation and reused by the boardgame.io game
// definition (which enforces them on the server).
//
// Board model
// -----------
//   board.cells[y][x] : occupant or null
//        occupant = { kind: 'building', color, pieceId, instance }
//                 | { kind: 'cathedral' }
//   board.owner[y][x] : 'light' | 'dark' | null   (territory claim on EMPTY cells)
//
// Coordinates: x = column (0..9, A..J), y = row (0..9), y increases downward.

import { pieceOrientations, pieceSize, buildInventory } from './pieces.js';

export const BOARD_SIZE = 10;

export function otherColor(color) {
  return color === 'light' ? 'dark' : 'light';
}

export function createBoard() {
  const cells = [];
  const owner = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    cells.push(new Array(BOARD_SIZE).fill(null));
    owner.push(new Array(BOARD_SIZE).fill(null));
  }
  return { cells, owner };
}

function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

// Translate a (normalized) orientation by an origin offset to absolute cells.
export function absoluteCells(orientationCells, ox, oy) {
  return orientationCells.map(([x, y]) => [x + ox, y + oy]);
}

// Can `color` legally occupy exactly these absolute cells?
//  - every cell on the board
//  - every cell currently empty
//  - no cell is territory claimed by the opponent
export function canPlaceCells(board, color, cells) {
  const opp = otherColor(color);
  for (const [x, y] of cells) {
    if (!inBounds(x, y)) return false;
    if (board.cells[y][x] !== null) return false;
    if (board.owner[y][x] === opp) return false;
  }
  return true;
}

// Place a building (mutates board). Caller must have validated with canPlaceCells.
export function placeBuilding(board, color, pieceId, instance, cells) {
  for (const [x, y] of cells) {
    board.cells[y][x] = { kind: 'building', color, pieceId, instance };
    board.owner[y][x] = color; // an occupied cell belongs to its colour
  }
}

export function placeCathedral(board, cells) {
  for (const [x, y] of cells) {
    board.cells[y][x] = { kind: 'cathedral' };
    board.owner[y][x] = null;
  }
}

// Find all enumerations of a building placement for (pieceId, color):
// yields { cells, orientationIndex, ox, oy } for every legal placement.
export function* enumeratePlacements(board, color, pieceId) {
  const orients = pieceOrientations(pieceId, color);
  for (let oi = 0; oi < orients.length; oi++) {
    const shape = orients[oi];
    const maxX = Math.max(...shape.map((c) => c[0]));
    const maxY = Math.max(...shape.map((c) => c[1]));
    for (let oy = 0; oy + maxY < BOARD_SIZE; oy++) {
      for (let ox = 0; ox + maxX < BOARD_SIZE; ox++) {
        const cells = absoluteCells(shape, ox, oy);
        if (canPlaceCells(board, color, cells)) {
          yield { cells, orientationIndex: oi, ox, oy };
        }
      }
    }
  }
}

// Does `color` have at least one legal placement for any piece still in stock?
export function hasLegalMove(board, color, stock) {
  const seen = new Set();
  for (const piece of stock) {
    if (seen.has(piece.id)) continue; // orientations identical per id+colour
    seen.add(piece.id);
    const it = enumeratePlacements(board, color, piece.id);
    if (!it.next().done) return true;
  }
  return false;
}

// 8-connected flood components of cells that are NOT buildings of `color`.
// Such "open" cells include empty squares, the opponent's buildings and the
// Cathedral. Diagonal connectivity is deliberate (see the loop below): it makes
// a region sealed only when `color`'s buildings join edge-to-edge, matching the
// rule that a corner-to-corner contact does not form an enclosing wall.
function openComponents(board, color) {
  const visited = [];
  for (let y = 0; y < BOARD_SIZE; y++) visited.push(new Array(BOARD_SIZE).fill(false));

  const isBarrier = (x, y) => {
    const o = board.cells[y][x];
    return o && o.kind === 'building' && o.color === color;
  };

  const comps = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (visited[y][x] || isBarrier(x, y)) continue;
      const stack = [[x, y]];
      visited[y][x] = true;
      const comp = [];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        comp.push([cx, cy]);
        // 8-way (diagonal) flood: empty space leaks through corner gaps. Per the
        // rules, buildings must meet "wall to wall" to enclose — a corner-to-
        // corner join does NOT form a boundary, so space passes through it.
        // Allowing diagonal moves makes a region sealed only when the enclosing
        // buildings are edge-connected (a true wall), not merely corner-touching.
        for (const [dx, dy] of [
          [1, 0], [-1, 0], [0, 1], [0, -1],
          [1, 1], [1, -1], [-1, 1], [-1, -1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inBounds(nx, ny) || visited[ny][nx] || isBarrier(nx, ny)) continue;
          visited[ny][nx] = true;
          stack.push([nx, ny]);
        }
      }
      comps.push(comp);
    }
  }
  return comps;
}

// Distinct non-`color` pieces wholly inside a component.
function piecesInComponent(board, comp) {
  const map = new Map(); // key -> descriptor
  for (const [x, y] of comp) {
    const o = board.cells[y][x];
    if (!o) continue;
    if (o.kind === 'cathedral') {
      map.set('cathedral', { kind: 'cathedral' });
    } else if (o.kind === 'building') {
      const key = `${o.color}#${o.pieceId}#${o.instance}`;
      map.set(key, { kind: 'building', color: o.color, pieceId: o.pieceId, instance: o.instance });
    }
  }
  return [...map.values()];
}

function removePieceFromBoard(board, comp, descriptor) {
  for (const [x, y] of comp) {
    const o = board.cells[y][x];
    if (!o) continue;
    const match =
      descriptor.kind === 'cathedral'
        ? o.kind === 'cathedral'
        : o.kind === 'building' &&
          o.color === descriptor.color &&
          o.pieceId === descriptor.pieceId &&
          o.instance === descriptor.instance;
    if (match) board.cells[y][x] = null;
  }
}

// Resolve territory after `color` has just moved.
//
// The open cells (everything that is not one of `color`'s buildings) split into
// connected components. The LARGEST component is the neutral "commons" / main
// playing area and is never claimed — only genuinely sealed-off pockets are.
// (Without this, walling off a single far corner would technically leave the
// rest of the board "bounded by your buildings + wall" and wrongly claim it.)
//
// For each enclosed pocket (every component except the commons):
//   * 0 enemy/neutral pieces inside  -> claim the empty space for `color`
//   * exactly 1 piece inside         -> capture it (remove), then claim
//   * 2+ pieces inside               -> leave it (neither claimed nor captured)
//
// On a player's first move no claiming happens (rule 4). Returns a list of
// captured piece descriptors.
export function resolveTerritory(board, color, isFirstMove) {
  if (isFirstMove) return [];
  const comps = openComponents(board, color);
  if (comps.length <= 1) return []; // nothing sealed off

  // Identify the commons (largest component); exclude it from claiming.
  let commonsIdx = 0;
  for (let i = 1; i < comps.length; i++) {
    if (comps[i].length > comps[commonsIdx].length) commonsIdx = i;
  }

  const captured = [];
  for (let i = 0; i < comps.length; i++) {
    if (i === commonsIdx) continue;
    const comp = comps[i];
    const pieces = piecesInComponent(board, comp);
    if (pieces.length >= 2) continue; // not enclosed for capture/claim

    if (pieces.length === 1) {
      captured.push(pieces[0]);
      removePieceFromBoard(board, comp, pieces[0]);
    }
    // Claim every (now) empty cell of the pocket for `color`.
    for (const [x, y] of comp) {
      if (board.cells[y][x] === null) board.owner[y][x] = color;
    }
  }
  return captured;
}

// Total squares occupied by a list of unplaced pieces (lower is better).
export function scoreStock(stock) {
  return stock.reduce((sum, p) => sum + pieceSize(p.id), 0);
}

export { pieceSize, buildInventory };
