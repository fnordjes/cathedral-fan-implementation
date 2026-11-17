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
  absoluteCells,
  placeCathedral as placeCathedralCells,
  applyBuildingMove,
  hasLegalMove,
  scoreStock,
  initialStock,
} from './logic.js';
import { pieceOrientations } from './pieces.js';

// Player id <-> colour. Player '0' is Light (places the Cathedral first);
// player '1' is Dark (makes the first building move).
export const PLAYER_COLOR = { 0: 'light', 1: 'dark' };
export const COLOR_PLAYER = { light: '0', dark: '1' };

function resolveOrientation(pieceId, color, orientationIndex) {
  const orients = pieceOrientations(pieceId, color);
  if (orientationIndex < 0 || orientationIndex >= orients.length) return null;
  return orients[orientationIndex];
}

export const Cathedral = {
  name: 'cathedral',

  setup: () => ({
    board: createBoard(),
    stock: { light: initialStock('light'), dark: initialStock('dark') },
    placedCount: { light: 0, dark: 0 },
    cathedralPlaced: false,
    cathedralRemoved: false,
    history: [], // every placement + its captures; drives the UI move log
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
          const cells = absoluteCells(shape, ox, oy);
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

          const shape = resolveOrientation(pieceId, color, orientationIndex);
          if (!shape) return INVALID_MOVE;
          const cells = absoluteCells(shape, ox, oy);

          const captured = applyBuildingMove(G, color, pieceId, instance, cells);
          if (captured === null) return INVALID_MOVE;
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
