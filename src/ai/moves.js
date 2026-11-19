// AI engine helpers: a compact game state plus legal-move enumeration and move
// application, all built on the SAME rule core (logic.js) that the boardgame.io
// server enforces. This keeps bots and the server in agreement about the rules;
// only the (trivial) turn flow is re-expressed here for fast headless play.

import {
  createBoard,
  placeCathedral as placeCathedralCells,
  applyBuildingMove,
  hasLegalMove,
  scoreStock,
  initialStock,
  enumeratePlacements,
  otherColor,
  BOARD_SIZE,
} from '../game/logic.js';
import { pieceSize } from '../game/pieces.js';
import { PLAYER_COLOR, COLOR_PLAYER } from '../game/cathedral.js';

export { PLAYER_COLOR, COLOR_PLAYER, otherColor, scoreStock, hasLegalMove, pieceSize };

// A self-contained game snapshot used by the simulator and agents.
export function initialState() {
  return {
    board: createBoard(),
    stock: { light: initialStock('light'), dark: initialStock('dark') },
    placedCount: { light: 0, dark: 0 },
    cathedralPlaced: false,
    cathedralRemoved: false,
  };
}

export function cloneState(s) {
  return {
    board: {
      cells: s.board.cells.map((row) => row.map((c) => (c ? { ...c } : null))),
      owner: s.board.owner.map((row) => row.slice()),
    },
    stock: {
      light: s.stock.light.map((p) => ({ ...p })),
      dark: s.stock.dark.map((p) => ({ ...p })),
    },
    placedCount: { ...s.placedCount },
    cathedralPlaced: s.cathedralPlaced,
    cathedralRemoved: s.cathedralRemoved,
  };
}

// All legal Cathedral placements (Light, opening only).
export function cathedralMoves(s) {
  const out = [];
  for (const p of enumeratePlacements(s.board, 'light', 'cathedral')) {
    out.push({ kind: 'cathedral', oi: p.orientationIndex, ox: p.ox, oy: p.oy, cells: p.cells });
  }
  return out;
}

// All legal building placements for `color`. One entry per (piece-id,
// orientation, position); a concrete stock instance is attached for applying.
export function buildingMoves(s, color) {
  const out = [];
  const seen = new Set();
  for (const p of s.stock[color]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const instance = p.instance;
    for (const pl of enumeratePlacements(s.board, color, p.id)) {
      out.push({
        kind: 'building',
        pieceId: p.id,
        instance,
        oi: pl.orientationIndex,
        ox: pl.ox,
        oy: pl.oy,
        cells: pl.cells,
      });
    }
  }
  return out;
}

// Apply a move to the state (mutating). Returns captured piece descriptors.
export function applyMove(s, color, move) {
  if (move.kind === 'cathedral') {
    placeCathedralCells(s.board, move.cells);
    s.cathedralPlaced = true;
    return [];
  }
  const captured = applyBuildingMove(s, color, move.pieceId, move.instance, move.cells);
  if (captured === null) {
    throw new Error(`illegal move applied: ${move.pieceId}#${move.instance} for ${color}`);
  }
  return captured;
}

// Squares of `color`'s remaining pieces that have no legal placement at all.
// Such pieces will (barring a capture that frees space) stay unplaced, so
// these squares are effectively already lost.
export function stuckSquares(state, color) {
  const counts = new Map();
  for (const p of state.stock[color]) counts.set(p.id, (counts.get(p.id) || 0) + 1);
  let n = 0;
  for (const [id, count] of counts) {
    if (enumeratePlacements(state.board, color, id).next().done) n += count * pieceSize(id);
  }
  return n;
}

// Squares of empty territory owned by `color`.
export function territoryCount(board, color) {
  let n = 0;
  for (let y = 0; y < BOARD_SIZE; y++)
    for (let x = 0; x < BOARD_SIZE; x++)
      if (board.cells[y][x] === null && board.owner[y][x] === color) n++;
  return n;
}

// Empty cells available to `color` (not occupied, not opponent territory).
export function availableSpace(board, color) {
  const opp = otherColor(color);
  let n = 0;
  for (let y = 0; y < BOARD_SIZE; y++)
    for (let x = 0; x < BOARD_SIZE; x++)
      if (board.cells[y][x] === null && board.owner[y][x] !== opp) n++;
  return n;
}
