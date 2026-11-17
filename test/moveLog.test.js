import { test } from 'node:test';
import assert from 'node:assert/strict';
import bgioClient from 'boardgame.io/dist/cjs/client.js';
import { Cathedral } from '../src/game/cathedral.js';
import { buildLog, squaresLabel } from '../src/client/moveLog.js';
import { cathedralMoves, buildingMoves, PLAYER_COLOR } from '../src/ai/moves.js';
import { makeRng } from '../src/ai/rng.js';

const { Client } = bgioClient;

// Play a whole game through the real game definition with random legal moves,
// so G.history is exactly what the UI receives.
function playRandomGame(seed) {
  const rng = makeRng(seed);
  const client = Client({ game: Cathedral, numPlayers: 2 });
  client.start();
  for (let i = 0; i < 200; i++) {
    const { G, ctx } = client.getState();
    if (ctx.gameover) break;
    client.updatePlayerID(ctx.currentPlayer);
    if (ctx.phase === 'placeCathedral') {
      const m = rng.pick(cathedralMoves(G));
      client.moves.placeCathedral(m.oi, m.ox, m.oy);
    } else {
      const m = rng.pick(buildingMoves(G, PLAYER_COLOR[ctx.currentPlayer]));
      client.moves.placePiece(m.pieceId, m.instance, m.oi, m.ox, m.oy);
    }
  }
  const G = client.getState().G;
  client.stop();
  return G.history;
}

test('squaresLabel: single square and bounding box', () => {
  assert.equal(squaresLabel([[0, 0]]), 'A1');
  assert.equal(squaresLabel([[3, 4], [4, 4], [4, 5]]), 'D5–E6');
});

test('buildLog: one row per move, newest first, Cathedral credited to Light', () => {
  const history = playRandomGame(1);
  const rows = buildLog(history);
  assert.equal(rows.length, history.length);
  assert.equal(rows[0].n, history.length);
  const first = rows[rows.length - 1];
  assert.equal(first.n, 1);
  assert.equal(first.piece, 'Cathedral');
  assert.equal(first.who, 'Light');
  assert.equal(first.color, 'light');
});

test('buildLog: captures name the piece and point at the squares it occupied', () => {
  let history = null;
  for (let seed = 1; seed < 200 && !history; seed++) {
    const h = playRandomGame(seed);
    if (h.some((e) => e.captured?.length)) history = h;
  }
  assert.ok(history, 'expected some random game to contain a capture');

  const rows = buildLog(history);
  let checked = 0;
  history.forEach((entry, i) => {
    const row = rows.find((r) => r.n === i + 1);
    assert.equal(row.captures.length, (entry.captured || []).length);
    entry.captured?.forEach((cap, k) => {
      const shown = row.captures[k];
      if (cap.kind === 'cathedral') {
        assert.equal(shown.name, 'the Cathedral');
      } else {
        assert.match(shown.name, new RegExp(`^(Light|Dark)'s `));
        assert.ok(shown.name.includes(cap.color === 'light' ? 'Light' : 'Dark'));
      }
      // The cells must be those of the most recent earlier placement of that piece.
      const placed = history
        .slice(0, i)
        .reverse()
        .find((p) =>
          cap.kind === 'cathedral'
            ? p.pieceId === 'cathedral'
            : p.color === cap.color && p.pieceId === cap.pieceId && p.instance === cap.instance,
        );
      assert.deepEqual(shown.cells, placed.cells);
      checked++;
    });
  });
  assert.ok(checked > 0);
});
