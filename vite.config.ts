import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Two entry points: index.html is the static marketing site (home), app.html is the CRM.
// In production vercel.json routes the app paths to app.html; this plugin does the same in `npm run dev`.
const APP_PATHS = /^\/(login|app|reset-password|form)(\/|$|\?)/;
const devRoutes = (): Plugin => ({
  name: 'flowcrm-dev-routes',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url || '/';
      const pathname = url.split('?')[0];
      if (APP_PATHS.test(url)) {
        req.url = '/app.html' + (url.includes('?') ? url.slice(url.indexOf('?')) : '');
      } else if (/^\/[a-z0-9-]+$/.test(pathname) && fs.existsSync(path.resolve(__dirname, 'public', pathname.slice(1) + '.html'))) {
        req.url = pathname + '.html'; // clean URLs for the industry pages, like Vercel's cleanUrls
      }
      next();
    });
  },
});

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:3015',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:3015',
          changeOrigin: true,
        },
      },
    },
    plugins: [react(), devRoutes()],
    build: {
      rollupOptions: {
        input: {
          site: path.resolve(__dirname, 'index.html'),
          app: path.resolve(__dirname, 'app.html'),
        },
      },
    },
    // No env values are injected into the browser bundle: the Gemini key is used by the server only.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
