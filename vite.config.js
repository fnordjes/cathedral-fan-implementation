import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Visualization client dev server. Talks to the game server (default :8000)
// over the network via boardgame.io's SocketIO transport + lobby REST API.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
