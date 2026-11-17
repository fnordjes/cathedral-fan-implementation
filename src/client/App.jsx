import React, { useState, useEffect, useRef } from 'react';
import { Lobby } from 'boardgame.io/dist/esm/react.js';
import { Client } from 'boardgame.io/dist/esm/client.js';
import { Local } from 'boardgame.io/dist/esm/multiplayer.js';
import { Cathedral } from '../game/cathedral.js';
import CathedralBoard from './Board.jsx';

// The game server's address (online mode). Override with VITE_SERVER.
const SERVER = import.meta.env.VITE_SERVER || `http://${window.location.hostname}:8000`;

// A fully local game: two clients share one in-memory transport. The human
// drives their seat's client; the AI seat is driven inside CathedralBoard via
// the greedy agent, dispatching through the other client's moves.
function LocalGame({ humanColor }) {
  const aiSeat = humanColor === 'light' ? '1' : '0';
  const [state, setState] = useState(null);
  const refs = useRef(null);

  useEffect(() => {
    const local = Local();
    const light = Client({ game: Cathedral, numPlayers: 2, multiplayer: local, playerID: '0' });
    const dark = Client({ game: Cathedral, numPlayers: 2, multiplayer: local, playerID: '1' });
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
    />
  );
}

function VsComputer() {
  const [humanColor, setHumanColor] = useState('dark');
  const [round, setRound] = useState(0);
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
        <button onClick={() => setRound((r) => r + 1)}>↻ New game</button>
      </div>
      <LocalGame key={`${humanColor}-${round}`} humanColor={humanColor} />
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
