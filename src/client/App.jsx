import React, { useState, useEffect, useRef } from 'react';
import { Lobby } from 'boardgame.io/dist/esm/react.js';
import { Client } from 'boardgame.io/dist/esm/client.js';
import { Local } from 'boardgame.io/dist/esm/multiplayer.js';
import { Cathedral } from '../game/cathedral.js';
import CathedralBoard from './Board.jsx';

// Opponents for "Play vs computer". Keys must exist in aiWorker.js FACTORIES.
const OPPONENTS = [
  { id: 'greedy', label: 'Greedy', hint: 'fast' },
  { id: 'mcts-r', label: 'MCTS', hint: 'stronger, a little slower' },
];

// The game server's address (online mode). Override with VITE_SERVER.
const SERVER = import.meta.env.VITE_SERVER || `http://${window.location.hostname}:8000`;

// A fully local game: two clients share one in-memory transport. The human
// drives their seat's client; the AI seat is driven inside CathedralBoard via
// the chosen agent, dispatching through the other client's moves.
//
// boardgame.io's Local() transport shares ONE in-memory master per game
// definition across all Local() instances, and clients without a matchID all
// join the match "default". So every local game needs its own matchID, or
// "New game" (and switching side or opponent) just reconnects to the old match.
let localMatchCounter = 0;

function LocalGame({ humanColor, opponent }) {
  const aiSeat = humanColor === 'light' ? '1' : '0';
  const [state, setState] = useState(null);
  const refs = useRef(null);

  useEffect(() => {
    const local = Local();
    const matchID = `local-${++localMatchCounter}`;
    const spec = { game: Cathedral, numPlayers: 2, multiplayer: local, matchID };
    const light = Client({ ...spec, playerID: '0' });
    const dark = Client({ ...spec, playerID: '1' });
    const human = humanColor === 'light' ? light : dark;
    const ai = humanColor === 'light' ? dark : light;
    refs.current = { light, dark, human, ai };
    light.start();
    dark.start();
    const unsub = human.subscribe((s) => {
      if (s) setState(s);
    });
    return () => {
      if (unsub) unsub();
      light.stop();
      dark.stop();
    };
  }, [humanColor]);

  if (!state || !refs.current) return <p className="muted">Setting up the board…</p>;
  return (
    <CathedralBoard
      G={state.G}
      ctx={state.ctx}
      moves={refs.current.human.moves}
      aiMoves={refs.current.ai.moves}
      playerID={humanColor === 'light' ? '0' : '1'}
      isConnected
      aiColor={aiSeat}
      humanColor={humanColor}
      aiOpponent={opponent.id}
      aiLabel={opponent.label}
    />
  );
}

function VsComputer() {
  const [humanColor, setHumanColor] = useState('dark');
  const [opponentId, setOpponentId] = useState('greedy');
  const [round, setRound] = useState(0);
  const opponent = OPPONENTS.find((o) => o.id === opponentId);
  return (
    <div>
      <div className="ai-controls">
        <span className="muted small">You play:</span>
        <button
          className={humanColor === 'dark' ? 'sel-side' : ''}
          onClick={() => {
            setHumanColor('dark');
            setRound((r) => r + 1);
          }}
        >
          Dark (move first)
        </button>
        <button
          className={humanColor === 'light' ? 'sel-side' : ''}
          onClick={() => {
            setHumanColor('light');
            setRound((r) => r + 1);
          }}
        >
          Light (place Cathedral)
        </button>
        <span className="muted small ai-controls-gap">Opponent:</span>
        {OPPONENTS.map((o) => (
          <button
            key={o.id}
            className={opponentId === o.id ? 'sel-side' : ''}
            title={o.hint}
            onClick={() => {
              setOpponentId(o.id);
              setRound((r) => r + 1);
            }}
          >
            {o.label} <span className="opp-hint">({o.hint})</span>
          </button>
        ))}
        <button onClick={() => setRound((r) => r + 1)}>↻ New game</button>
      </div>
      <LocalGame
        key={`${humanColor}-${opponentId}-${round}`}
        humanColor={humanColor}
        opponent={opponent}
      />
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState('ai'); // 'ai' | 'online'
  return (
    <div className="app">
      <header className="app-header">
        <h1>Cathedral</h1>
        <p className="tagline">the game of the medieval city</p>
        <nav className="mode-nav">
          <button className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}>
            Play vs computer
          </button>
          <button className={mode === 'online' ? 'active' : ''} onClick={() => setMode('online')}>
            Play online
          </button>
        </nav>
      </header>

      <main className="lobby-wrap">
        {mode === 'ai' ? (
          <VsComputer />
        ) : (
          <Lobby
            gameServer={SERVER}
            lobbyServer={SERVER}
            gameComponents={[{ game: Cathedral, board: CathedralBoard }]}
          />
        )}
      </main>

      <footer className="app-footer">
        Rules &copy; Chrisbo I.P. Holdings Ltd. Unofficial implementation for learning/play.
        {mode === 'online' ? (
          <>
            {' '}
            Game server: <code>{SERVER}</code>
          </>
        ) : null}
      </footer>
    </div>
  );
}
