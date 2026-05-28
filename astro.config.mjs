// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

/** Plugin que força charset=utf-8 em arquivos .txt no dev server */
function txtUtf8Plugin() {
  return {
    name: 'txt-utf8-charset',
    configureServer(/** @type {any} */ server) {
      server.middlewares.use((/** @type {any} */ req, /** @type {any} */ res, /** @type {any} */ next) => {
        if (req.url?.endsWith('.txt')) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        }
        next();
      });
    },
  };
}

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss(), txtUtf8Plugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
  },

  integrations: [react()]
});