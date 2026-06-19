// boardgame.io game definition for Cathedral.
//
// This object is the single source of truth for the rules. The game SERVER
// loads it and validates every move with it; the client loads the SAME object
// only so it can render and predict — the server always has the final say.

// This file is loaded by BOTH Node (the server/tests) and the browser (Vite).
// boardgame.io v0.50 has no "type":"module" and no ESM "exports" map, so its
// build files import inconsistently across the two: a named ESM import breaks
// under Node, while a CJS default import resolves to `undefined` under Vite.
// boardgame.io's INVALID_MOVE sentinel is simply the string "INVALID_MOVE"
// (the reducer compares a move's return value to it), so we define it locally
// and avoid the dual-environment import problem entirely.
const INVALID_MOVE = 'INVALID_MOVE';
import {
  createBoard,
  canPlaceCells,
  placeBuilding,
  placeCathedral as placeCathedralCells,
  resolveTerritory,
  hasLegalMove,
  scoreStock,
  buildInventory,
  pieceSize,
} from './logic.js';
import { pieceOrientations } from './pieces.js';

// Player id <-> colour. Player '0' is Light (places the Cathedral first);
// player '1' is Dark (makes the first building move).
export const PLAYER_COLOR = { 0: 'light', 1: 'dark' };
export const COLOR_PLAYER = { light: '0', dark: '1' };

function stockFor(color) {
  return buildInventory(color).map((p) => ({ id: p.id, instance: p.instance, size: p.size }));
}

function resolveOrientation(pieceId, color, orientationIndex) {
  const orients = pieceOrientations(pieceId, color);
  if (orientationIndex < 0 || orientationIndex >= orients.length) return null;
  return orients[orientationIndex];
}

function returnToStock(G, descriptor) {
  if (descriptor.kind === 'building') {
    G.stock[descriptor.color].push({
      id: descriptor.pieceId,
      instance: descriptor.instance,
      size: pieceSize(descriptor.pieceId),
    });
  } else if (descriptor.kind === 'cathedral') {
    G.cathedralRemoved = true; // Cathedral, once captured, never returns.
  }
}

export const Cathedral = {
  name: 'cathedral',

  setup: () => ({
    board: createBoard(),
    stock: { light: stockFor('light'), dark: stockFor('dark') },
    placedCount: { light: 0, dark: 0 },
    cathedralPlaced: false,
    cathedralRemoved: false,
    lastCaptured: [],
    history: [], // simple notation log for spectators
  }),

  phases: {
    // Light places the neutral Cathedral anywhere on the board.
    placeCathedral: {
      start: true,
      next: 'main',
      endIf: ({ G }) => G.cathedralPlaced,
      turn: { order: { first: () => 0, next: () => 0 } },
      moves: {
        placeCathedral: ({ G, playerID }, orientationIndex, ox, oy) => {
          if (playerID !== '0') return INVALID_MOVE;
          if (G.cathedralPlaced) return INVALID_MOVE;
          const shape = resolveOrientation('cathedral', 'light', orientationIndex);
          if (!shape) return INVALID_MOVE;
          const cells = shape.map(([x, y]) => [x + ox, y + oy]);
          if (!canPlaceCells(G.board, 'light', cells)) return INVALID_MOVE;
          placeCathedralCells(G.board, cells);
          G.cathedralPlaced = true;
          G.history.push({ color: 'neutral', pieceId: 'cathedral', cells });
        },
      },
    },

    // Main play. Dark moves first, then players alternate. A player who has no
    // legal move is skipped; when neither can move the game ends.
    main: {
      turn: {
        minMoves: 1,
        maxMoves: 1,
        order: {
          first: () => 1, // Dark ('1') makes the first building move
          next: ({ G, ctx }) => {
            const n = ctx.numPlayers;
            let pos = (ctx.playOrderPos + 1) % n;
            for (let i = 0; i < n; i++) {
              const pid = ctx.playOrder[pos];
              const color = PLAYER_COLOR[pid];
              if (hasLegalMove(G.board, color, G.stock[color])) return pos;
              pos = (pos + 1) % n;
            }
            return ctx.playOrderPos; // unreachable: endIf ends the game first
          },
        },
      },
      moves: {
        placePiece: ({ G, playerID }, pieceId, instance, orientationIndex, ox, oy) => {
          const color = PLAYER_COLOR[playerID];
          if (!color) return INVALID_MOVE;

          const idx = G.stock[color].findIndex(
            (p) => p.id === pieceId && p.instance === instance,
          );
          if (idx === -1) return INVALID_MOVE;

          const shape = resolveOrientation(pieceId, color, orientationIndex);
          if (!shape) return INVALID_MOVE;
          const cells = shape.map(([x, y]) => [x + ox, y + oy]);
          if (!canPlaceCells(G.board, color, cells)) return INVALID_MOVE;

          placeBuilding(G.board, color, pieceId, instance, cells);
          G.stock[color].splice(idx, 1);

          const isFirstMove = G.placedCount[color] === 0;
          const captured = resolveTerritory(G.board, color, isFirstMove);
          G.placedCount[color] += 1;

          for (const cap of captured) returnToStock(G, cap);
          G.lastCaptured = captured;
          G.history.push({ color, pieceId, instance, cells, captured });
        },
      },
    },
  },

  endIf: ({ G }) => {
    const lightCan = hasLegalMove(G.board, 'light', G.stock.light);
    const darkCan = hasLegalMove(G.board, 'dark', G.stock.dark);
    if (lightCan || darkCan) return undefined;

    const light = scoreStock(G.stock.light);
    const dark = scoreStock(G.stock.dark);
    const scores = { light, dark };
    if (light < dark) return { winner: '0', scores };
    if (dark < light) return { winner: '1', scores };
    return { draw: true, scores };
  },

  minPlayers: 2,
  maxPlayers: 2,
};

export default Cathedral;
