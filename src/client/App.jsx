import React from 'react';
import { Lobby } from 'boardgame.io/dist/esm/react.js';
import { Cathedral } from '../game/cathedral.js';
import CathedralBoard from './Board.jsx';

// The game server's address. Override at build/run time with VITE_SERVER.
const SERVER =
  import.meta.env.VITE_SERVER ||
  `http://${window.location.hostname}:8000`;

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Cathedral</h1>
        <p className="tagline">the game of the medieval city</p>
      </header>

      <main className="lobby-wrap">
        <Lobby
          gameServer={SERVER}
          lobbyServer={SERVER}
          gameComponents={[{ game: Cathedral, board: CathedralBoard }]}
        />
      </main>

      <footer className="app-footer">
        Rules &copy; Chrisbo I.P. Holdings Ltd. This is an unofficial
        implementation for learning/play. Game server: <code>{SERVER}</code>
      </footer>
    </div>
  );
}
