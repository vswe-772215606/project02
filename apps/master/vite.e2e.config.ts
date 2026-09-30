import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Serves the real master renderer as a plain web app for the finance e2e run,
// pointed at the e2e server on :4020. Not part of any build.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer') } },
  define: { __CHAYXANA_PORT__: JSON.stringify(4020) },
  plugins: [react()],
  cacheDir: resolve(__dirname, 'node_modules/.vite-e2e'),
  server: { port: 5199, strictPort: true, host: '0.0.0.0' },
});
