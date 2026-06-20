// Fast headless game runner. Plays one full Cathedral game between two agents
// using the shared rule core (logic.js) and the same turn flow as the
// boardgame.io game definition: Light places the Cathedral, Dark moves first,
// players alternate, a player with no move is skipped, and the game ends when
// neither can move. Lower leftover-square count wins.

import {
  initialState,
  cathedralMoves,
  buildingMoves,
  applyMove,
  otherColor,
  scoreStock,
  hasLegalMove,
} from './moves.js';

export async function playGame(agentLight, agentDark, opts = {}) {
  const { onDecision, maxPlies = 400 } = opts;
  const agents = { light: agentLight, dark: agentDark };
  const s = initialState();

  // Opening: Light places the Cathedral.
  const catMoves = cathedralMoves(s);
  const catMove = await agents.light.act(s, 'light', 'placeCathedral', catMoves);
  applyMove(s, 'light', catMove);

  let current = 'dark';
  let plies = 0;

  while (plies < maxPlies) {
    let moves = buildingMoves(s, current);
    if (moves.length === 0) {
      const other = otherColor(current);
      if (hasLegalMove(s.board, other, s.stock[other])) {
        current = other;
        continue;
      }
      break; // neither can move
    }

    if (onDecision) onDecision(s, current);
    const move = await agents[current].act(s, current, 'main', moves);
    applyMove(s, current, move);
    plies += 1;

    // Next mover: opponent if they can move, else keep going if we can, else end.
    const other = otherColor(current);
    if (hasLegalMove(s.board, other, s.stock[other])) current = other;
    else if (hasLegalMove(s.board, current, s.stock[current])) current = current; // eslint-disable-line
    else break;
  }

  const light = scoreStock(s.stock.light);
  const dark = scoreStock(s.stock.dark);
  let winner = 'draw';
  if (light < dark) winner = 'light';
  else if (dark < light) winner = 'dark';

  return { winner, scores: { light, dark }, plies, state: s };
}
