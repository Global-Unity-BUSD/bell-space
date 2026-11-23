import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Development: the website on :5173, the API (and live hints) proxied to the
// server on :8787. Production: `npm run build`, then the server serves web/dist.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/v1': { target: 'http://127.0.0.1:8787', ws: true } },
  },
});
