// Cathedral GAME SERVER.
//
// This process is the authority on the rules. It runs the boardgame.io game
// definition, validates every incoming move against it, keeps the canonical
// match state, and exposes the lobby (match list / create / join) API plus the
// realtime SocketIO transport. It serves NO visualization — the client is a
// separate app that talks to this server over the network.

// The server build is CommonJS only; import it via interop (default import)
// from the explicit build file so it works under Node ESM ("type":"module").
import pkg from 'boardgame.io/dist/cjs/server.js';
import { Cathedral } from '../game/cathedral.js';

const { Server, Origins } = pkg;

const PORT = Number(process.env.PORT) || 8000;

// In dev the visualization runs on the Vite port (5173). Adjust / extend for
// other hosts via the CATHEDRAL_ORIGINS env var (comma separated).
const extraOrigins = (process.env.CATHEDRAL_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const server = Server({
  games: [Cathedral],
  origins: [
    Origins.LOCALHOST_IN_DEVELOPMENT,
    Origins.LOCALHOST,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...extraOrigins,
  ],
});

server.run(PORT, () => {
  console.log(`Cathedral game server listening on http://localhost:${PORT}`);
  console.log('  Lobby API:   /games, /games/cathedral, ...');
  console.log('  Transport:   SocketIO (realtime moves)');
});
