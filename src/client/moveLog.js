// Move-log helpers for the board UI (plain JS so they can be unit-tested).
//
// G.history holds one entry per placement: { color, pieceId, instance, cells,
// captured } (color 'neutral' for the Cathedral, which Light places).

import { PIECE_NAMES } from '../game/pieces.js';

const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
export const COLOR_LABEL = { light: 'Light', dark: 'Dark', neutral: 'Light' };

// Board squares covered by a list of cells, e.g. "A1" or "C4–E6" (bounding box).
export function squaresLabel(cells) {
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const from = `${COLS[Math.min(...xs)]}${Math.min(...ys) + 1}`;
  const to = `${COLS[Math.max(...xs)]}${Math.max(...ys) + 1}`;
  return from === to ? from : `${from}–${to}`;
}

// Turn G.history into display rows, newest first. Each capture is resolved to
// the cells the captured piece occupied, found from the move that placed it.
export function buildLog(history) {
  const rows = history.map((h, i) => {
    const captures = (h.captured || []).map((cap) => {
      let cells = [];
      for (let j = i - 1; j >= 0; j--) {
        const p = history[j];
        const same =
          cap.kind === 'cathedral'
            ? p.pieceId === 'cathedral'
            : p.color === cap.color && p.pieceId === cap.pieceId && p.instance === cap.instance;
        if (same) {
          cells = p.cells;
          break;
        }
      }
      const name =
        cap.kind === 'cathedral' ? 'the Cathedral' : `${COLOR_LABEL[cap.color]}'s ${PIECE_NAMES[cap.pieceId]}`;
      return { name, cells };
    });
    return {
      n: i + 1,
      color: h.color === 'neutral' ? 'light' : h.color,
      who: COLOR_LABEL[h.color],
      piece: PIECE_NAMES[h.pieceId],
      where: squaresLabel(h.cells),
      cells: h.cells,
      captures,
    };
  });
  return rows.reverse();
}
