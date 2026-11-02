import { defineConfig } from 'vite';
import { catalog } from './server/catalog.mjs';
import { looks } from './server/looks.mjs';
import { stylist } from './server/stylist.mjs';
import { tryOn } from './server/try-on.mjs';

const api = {
  name: 'try-on-api',
  configureServer(server) {
    server.middlewares.use('/api/try-on', tryOn);
    server.middlewares.use('/api/looks', looks);
    server.middlewares.use('/api/catalog', catalog);
    server.middlewares.use('/api/stylist', stylist);
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api/try-on', tryOn);
    server.middlewares.use('/api/looks', looks);
    server.middlewares.use('/api/catalog', catalog);
    server.middlewares.use('/api/stylist', stylist);
  },
};

// Link previews need absolute addresses. Once the site has one, SITE_URL=https://… makes them so; until then they stay relative.
const site = {
  name: 'site-url',
  transformIndexHtml(html) {
    const url = process.env.SITE_URL?.replace(/\/$/, '');
    if (!url) return html;
    return html
      .replace('content="og.jpg"', `content="${url}/og.jpg"`)
      .replace('<meta property="og:type"', `<meta property="og:url" content="${url}/" />\n    <meta property="og:type"`);
  },
};

export default defineConfig({ base: './', plugins: [api, site], server: { watch: { ignored: ['**/cache/**'] } } });
