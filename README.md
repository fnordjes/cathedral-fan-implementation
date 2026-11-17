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
  ai/            Bot players (built on the same rule core as the server)
    moves.js       Legal-move enumeration + state snapshot/apply
    simulate.js    Fast headless game runner (shares logic.js)
    agents.js      random / greedy / aggressive / spacious strategies
    features.js    Board encoding + heuristic evaluation
    tfBackend.js   Auto-selects @tensorflow/tfjs-node (native) or tfjs (pure JS)
    neuralNet.js   TensorFlow.js value net + NeuralAgent (+ JSON save/load)
    mcts.js        Monte Carlo Tree Search (net / heuristic / rollout modes)
    train.js       Self-play trainer
    tournament.js  Local agent-vs-agent harness
    netbot.js      Run agents THROUGH the live server (SocketIO)
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

Then open <http://localhost:5173>. The client opens in **Play vs computer** mode —
a fully local game against the greedy AI that needs no server at all (pick your
side, Dark or Light, and hit New game). Switch to **Play online** in the header
to use the lobby: open it in **two** browser windows (or two machines), create a
match, have each player join a seat (Light = player 0, Dark = player 1), and
play. Anyone can also **spectate** a running match from the lobby.

> "Play vs computer" runs the game and the bot entirely in the browser (two
> boardgame.io clients over a shared in-memory transport; the AI seat is driven
> by the pure-JS greedy agent), so `npm run server` is only needed for online play.

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

## AI players

Several bot strategies live in `src/ai/`, all built on the **same rule core**
(`logic.js`) the server enforces, so bots and server never disagree:

- **random** – picks a uniformly random legal move.
- **greedy** – 1-ply lookahead maximising a fast evaluation (own placed squares,
  claimed territory, denying the opponent space — capturing and playing big
  pieces fall out of this naturally).
- **aggressive** / **spacious** – the greedy search with different weights, for
  visibly different styles (choke the opponent vs. grab territory).
- **neural** – a TensorFlow.js value network. It scores each candidate move by
  the position it leads to (negamax 1-ply) and is trained by self-play.

### Test agents against each other (local, fast)

```bash
npm run tournament -- greedy random 50
npm run tournament -- aggressive spacious 50
npm run tournament -- neural greedy 50        # after training a model
```

Colours alternate each game; it reports win rates and average score margin.
Typical results: greedy beats random ~100%, aggressive edges spacious ~65%.

### Play bots THROUGH the live game server

This is the faithful "use the gameserver to test players against each other"
path — bots connect as networked clients over SocketIO, exactly like a human:

```bash
npm run server                                   # terminal 1
npm run netbot -- play --agentA greedy --agentB aggressive   # terminal 2
# then open the web client and spectate the match from the lobby
```

You can also attach a bot to a seat of a match created in the browser:

```bash
npm run netbot -- join --match <matchID> --seat 1 --agent greedy
```

### Train the neural-net player (self-play)

A **pre-trained model ships in `src/ai/model/model.json`** — you can use the
`neural` agent right away. To train further (it *resumes* from the saved model):

```bash
# Fast bootstrap: learn a value function from the greedy heuristic's games
npm run train -- --opponent greedy-self --iters 5 --games 100 --epochs 6

# Refine by true self-play (slower; the net plays itself)
npm run train -- --opponent self --iters 5 --games 20 --epochs 6
```

Options: `--opponent greedy-self|self|greedy`, `--iters`, `--games`, `--epochs`,
`--epsilon` (exploration), `--evalGames` (0 to skip the vs-greedy eval), `--out`.
Each iteration plays games, labels every visited position with the final outcome
from that side's perspective, trains the value network, **saves after every
iteration** (so training is resumable / interruptible), and reports its win-rate
vs. greedy. The model is usable via the `neural` agent everywhere
(`npm run tournament -- neural greedy`, `netbot ... --agent neural`).

**What the shipped model does:** trained on ~700 bootstrap games plus self-play
rounds, it beats `random` ~95–100% and plays competently, but does **not** beat
the handcrafted `greedy` agent (it reaches roughly 20–30% there). That's the
expected ceiling for a 1-ply value network on this compute budget: a value net
selecting moves one ply deep struggles to out-search an explicit heuristic.
Closing that gap is a search problem more than a training one — adding MCTS or a
policy head (AlphaZero-style) is the natural next step.

> **Faster training with the native backend.** `src/ai/tfBackend.js` auto-selects
> `@tensorflow/tfjs-node` (native libtensorflow — typically 10–40× faster
> training/inference) when it's installed, and falls back to pure-JS
> `@tensorflow/tfjs` otherwise. It's listed as an *optional* dependency, so a
> normal `npm install` tries to fetch its prebuilt binary but won't fail the
> install if that can't be built/downloaded. To force it:
>
> ```bash
> npm install @tensorflow/tfjs-node
> ```
>
> On startup the AI prints which backend is active (`[tf] backend: …`). Prebuilt
> binaries exist for common OS + Node combos (incl. Windows x64 / Node 18); if
> none matches yours it compiles from source (needs a C++ toolchain). Nothing
> else changes — the `tf.*` API is identical, so the same model files and scripts
> work on either backend.

## MCTS players (search on top of the value net)

`src/ai/mcts.js` adds Monte Carlo Tree Search — a search tree that spends more
simulations on promising lines instead of judging a position one move deep.
Three leaf-evaluation modes share one negamax tree (with Cathedral's turn-skip
and exact terminal scoring handled inside the search):

- **`mcts`** — PUCT guided by the trained **value network** (priors + leaf
  values). The AlphaZero-style approach; only as strong as the net, and slow
  under pure-JS tfjs.
- **`mcts-h`** — PUCT guided by the **greedy heuristic** (no model needed).
- **`mcts-r`** — classic **rollouts**: play each leaf out to the end with a fast
  policy (`--rollout random|greedy`) and use the real result.

```bash
npm run tournament -- mcts-h greedy 20 --sims 60
npm run tournament -- mcts greedy 10 --sims 80      # value-net MCTS
npm run netbot -- play --agentA mcts-h --agentB greedy --sims 80
```

`--sims` sets simulations per move (default 80). Final move selection uses the
mean value of visited moves and falls back to the static 1-ply value for
unvisited ones — important here because Cathedral's branching factor is large
(~80–150 legal moves early), so naive "most-visited" selection degenerates when
simulations < branching.

**Honest status.** That large branching factor is the catch: to clearly
out-search the greedy heuristic, MCTS needs *many* simulations per move, but
pure-JS tfjs only affords a few dozen in reasonable time. At those counts
`mcts-h` is roughly **greedy-level** (it traded wins ~50% in small tests — high
variance), not a decisive win. The implementation is correct and scales: with
`@tensorflow/tfjs-node` (much faster net eval) and/or a few hundred simulations,
search depth — and strength — go up. The cleanest path to a strong bot is more
simulations plus a stronger value net (more self-play), feeding each other.

## Implementation note (boardgame.io imports)

boardgame.io v0.50 has no `"type": "module"` and no ESM `exports` map, so Node
treats its build files as CommonJS. Files Node loads therefore default-import the
`dist/cjs` builds and destructure (e.g. `src/server/index.js`); the shared
`cathedral.js` (loaded by both Node and the browser) avoids the issue entirely
by defining boardgame.io's `INVALID_MOVE` sentinel locally — it is simply the
string `"INVALID_MOVE"`. The browser-only `App.jsx` imports the ESM `react`
build. Vite resolves all of these for the browser.

---

Rules © Chrisbo I.P. Holdings Ltd. This is an unofficial implementation for
learning and play.
