# Cathedral

A browser implementation of **Cathedral – the game of the medieval city**, a
two‑player abstract strategy game. Built on
[boardgame.io](https://boardgame.io/) with a clean separation between the
authoritative game server (which enforces the rules) and the visualization
client (which renders the board and lets you play or spectate over the network).

## Architecture

The code deliberately keeps the three concerns apart:

```
src/
  game/        Shared rules — the single source of truth
    pieces.js      Piece geometry: the 14-piece set per colour + the Cathedral,
                   with rotations. Abbey & Academy are chiral (mirrored per colour).
    logic.js       Pure rules engine: placement legality, territory claiming,
                   capture, end detection, scoring. No framework dependencies.
    cathedral.js   boardgame.io Game object wrapping logic.js (setup/moves/turn/endIf).
  server/
    index.js     GAME SERVER. Runs the game object, validates every move,
                 holds canonical match state, exposes the lobby API + realtime
                 SocketIO transport. Serves NO UI.
  client/
    App.jsx      VISUALIZATION. Lobby to create / join / spectate matches.
    Board.jsx    The 10×10 board, piece tray, rotation, valid-move preview.
    main.jsx, styles.css
test/            Unit + integration tests (node:test).
```

Players talk to the server only through boardgame.io's defined transport
(SocketIO + lobby REST API). The server decides what is legal — the client
merely predicts and renders. You can run the client and server on different
machines (point the client at the server via `VITE_SERVER`).

## Running it

Requires Node 18+.

```bash
npm install

# Terminal 1 — the game server (rules authority + lobby), on :8000
npm run server

# Terminal 2 — the visualization client (Vite dev server), on :5173
npm run client

# …or run both together:
npm run dev
```

Then open <http://localhost:5173> in **two** browser windows (or two machines).
Create a match, have each player join a seat (Light = player 0, Dark = player 1),
and play. Anyone can also **spectate** a running match from the lobby.

To point the client at a remote server:

```bash
VITE_SERVER=http://your-host:8000 npm run client
# and on the server host, allow the client's origin:
CATHEDRAL_ORIGINS=http://your-client-host:5173 npm run server
```

## Tests

```bash
npm test
```

Covers piece geometry (counts, 47 squares/colour, chirality of Abbey/Academy),
placement legality, territory claiming, single-piece capture, the two-piece
"no capture" case, Cathedral capture, first-move "no claim" rule, scoring,
and a full game-flow integration test through a boardgame.io client.

## Rules implemented

Based on the official rules at
<https://cathedral-game.co.nz/about-how-to-play.html>:

- Light places the neutral **Cathedral** first; **Dark** makes the first
  building move, then players alternate.
- A move places one building on empty squares, aligned to the grid. You may
  build on your own claimed territory but never on your opponent's.
- **Claiming**: enclosing empty space with your buildings (helped by the city
  wall) makes it yours — your opponent can no longer build there.
- **Capture**: enclosing a region that contains exactly one enemy piece (or the
  Cathedral) removes it; a captured building returns to its owner's stock, the
  Cathedral is gone for the rest of the game. Two or more enclosed pieces are
  safe and the space stays shared.
- No claiming on a player's first move. The Cathedral cannot act as part of an
  enclosing boundary (handled implicitly: only your buildings + the wall seal a
  region).
- A player with no legal move is skipped; when neither can move the game ends.
- **Scoring**: each side scores the number of squares its *unplaced* pieces would
  cover. Fewer leftover squares wins (0 = you placed everything); equal is a draw.

### Note on territory detection

The open squares (everything that is not one of the mover's buildings) are split
into connected regions. The single largest region is treated as the neutral
"commons" / main playing area and is never claimed; only genuinely sealed-off
pockets are evaluated for claiming and capture. This matches normal play and
avoids the degenerate case where walling off one corner would otherwise count as
"enclosing" the entire rest of the board.

## Implementation note (boardgame.io imports)

boardgame.io v0.50 ships its sub-packages (`/core`, `/server`, `/react`, …) as
folders without an ESM `exports` map. Under Node's strict ESM resolver
(`"type": "module"`) the bare specifiers don't resolve, so this project imports
the explicit build files (e.g. `boardgame.io/dist/esm/core.js`, and the
CommonJS `boardgame.io/dist/cjs/server.js` via default-import interop). Vite
resolves these identically for the browser.

---

Rules © Chrisbo I.P. Holdings Ltd. This is an unofficial implementation for
learning and play.
