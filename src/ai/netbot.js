// Networked bot runner — plays agents THROUGH the live game server, exactly like
// a human client would (boardgame.io SocketIO transport + lobby API). This is
// the faithful "use the gameserver to test players against each other" path.
//
//   Start the server first:  npm run server
//
//   # Spin up a match and drop two bots into it (watch it in the web lobby):
//   node src/ai/netbot.js play --agentA greedy --agentB aggressive [--server http://localhost:8000]
//
//   # Or attach one bot to an existing seat of a match created in the browser:
//   node src/ai/netbot.js join --match <matchID> --seat 1 --agent greedy
//
// Agents: random | greedy | aggressive | spacious | neural   (--net <dir> for neural)

import path from 'node:path';
import bgioClient from 'boardgame.io/dist/cjs/client.js';
import bgioMultiplayer from 'boardgame.io/dist/cjs/multiplayer.js';
import { Cathedral } from '../game/cathedral.js';
import { PLAYER_COLOR, buildingMoves, cathedralMoves } from './moves.js';
import { makeAgent } from './agents.js';
import { loadNeuralAgent, modelExists } from './neuralNet.js';
import { loadMctsAgent, mctsHeuristicAgent, mctsRolloutAgent } from './mcts.js';

const { Client, LobbyClient } = bgioClient;
const { SocketIO } = bgioMultiplayer;

async function buildAgent(name, seed, netDir, sims = 80) {
  if (name === 'mcts-r') return mctsRolloutAgent({ seed, simulations: Number(sims), policy: 'random' });
  if (name === 'mcts-h') return mctsHeuristicAgent({ seed, simulations: Number(sims) });
  if (name === 'neural' || name === 'mcts') {
    if (!modelExists(netDir)) throw new Error(`no model at ${netDir} — run: npm run train`);
    if (name === 'mcts') return loadMctsAgent(netDir, { seed, simulations: Number(sims) });
    return loadNeuralAgent(netDir, { seed });
  }
  return makeAgent(name, { seed });
}

// Drive one seat of a match until the game ends. Resolves with the gameover.
function runBot({ server, matchID, playerID, credentials, agent }) {
  return new Promise((resolve) => {
    const client = Client({
      game: Cathedral,
      numPlayers: 2,
      multiplayer: SocketIO({ server }),
      matchID,
      playerID,
      credentials,
      debug: false,
    });

    let acting = false;
    let lastKey = null;
    let done = false;

    client.subscribe((state) => {
      if (!state || done) return;
      if (state.ctx.gameover) {
        done = true;
        client.stop();
        resolve(state.ctx.gameover);
        return;
      }
      if (state.ctx.currentPlayer !== playerID) return;

      const key = `${state.ctx.turn}:${state.ctx.phase}`;
      if (acting || key === lastKey) return;
      acting = true;
      lastKey = key;

      (async () => {
        try {
          const G = state.G;
          const snap = {
            board: G.board,
            stock: G.stock,
            placedCount: G.placedCount,
            cathedralPlaced: G.cathedralPlaced,
          };
          if (state.ctx.phase === 'placeCathedral') {
            const moves = cathedralMoves(snap);
            const m = await agent.act(snap, 'light', 'placeCathedral', moves);
            client.moves.placeCathedral(m.oi, m.ox, m.oy);
          } else {
            const color = PLAYER_COLOR[playerID];
            const moves = buildingMoves(snap, color);
            if (moves.length) {
              const m = await agent.act(snap, color, 'main', moves);
              client.moves.placePiece(m.pieceId, m.instance, m.oi, m.ox, m.oy);
            }
          }
        } catch (e) {
          console.error(`[seat ${playerID}] error:`, e.message);
        } finally {
          acting = false;
        }
      })();
    });

    client.start();
  });
}

function parseFlags(args) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) flags[args[i].slice(2)] = args[++i];
    else pos.push(args[i]);
  }
  return { flags, pos };
}

async function main() {
  const { flags, pos } = parseFlags(process.argv.slice(2));
  const cmd = pos[0] || 'play';
  const server = flags.server || 'http://localhost:8000';
  const netDir = path.resolve(process.cwd(), flags.net || 'src/ai/model');
  const lobby = new LobbyClient({ server });

  if (cmd === 'play') {
    const nameA = flags.agentA || 'greedy';
    const nameB = flags.agentB || 'greedy';
    const { matchID } = await lobby.createMatch('cathedral', { numPlayers: 2 });
    const a = await lobby.joinMatch('cathedral', matchID, { playerID: '0', playerName: `${nameA}-light` });
    const b = await lobby.joinMatch('cathedral', matchID, { playerID: '1', playerName: `${nameB}-dark` });
    console.log(`Match ${matchID} created on ${server}`);
    console.log(`  Light = ${nameA}, Dark = ${nameB}. Spectate it from the web lobby.`);

    const agentA = await buildAgent(nameA, 1, netDir, flags.sims);
    const agentB = await buildAgent(nameB, 2, netDir, flags.sims);
    const [over] = await Promise.all([
      runBot({ server, matchID, playerID: '0', credentials: a.playerCredentials, agent: agentA }),
      runBot({ server, matchID, playerID: '1', credentials: b.playerCredentials, agent: agentB }),
    ]);
    const result = over.draw ? 'draw' : `${over.winner === '0' ? 'Light' : 'Dark'} wins`;
    console.log(`Game over: ${result}`, over.scores || '');
    process.exit(0);
  } else if (cmd === 'join') {
    const matchID = flags.match;
    const seat = flags.seat ?? '1';
    const name = flags.agent || 'greedy';
    if (!matchID) throw new Error('--match <matchID> is required for join');
    const joined = await lobby.joinMatch('cathedral', matchID, {
      playerID: String(seat),
      playerName: `${name}-bot`,
    });
    console.log(`Joined match ${matchID} as seat ${seat} (${name}).`);
    const agent = await buildAgent(name, Number(seat) + 1, netDir, flags.sims);
    const over = await runBot({
      server,
      matchID,
      playerID: String(seat),
      credentials: joined.playerCredentials,
      agent,
    });
    console.log('Game over:', over);
    process.exit(0);
  } else {
    console.error('Usage: netbot.js play|join [flags] (see file header)');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
