import { defineConfig } from 'vite';
import { looks } from './server/looks.mjs';
import { tryOn } from './server/try-on.mjs';

const api = {
  name: 'try-on-api',
  configureServer(server) {
    server.middlewares.use('/api/try-on', tryOn);
    server.middlewares.use('/api/looks', looks);
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api/try-on', tryOn);
    server.middlewares.use('/api/looks', looks);
  },
};

export default defineConfig({ base: './', plugins: [api], server: { watch: { ignored: ['**/cache/**'] } } });
