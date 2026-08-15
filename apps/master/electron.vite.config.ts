import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Which build this is — see src/main/app-identity.ts. Chosen at build time
// because it decides where the database lives; `next` installs alongside a
// production till instead of upgrading over it.
const VARIANT = process.env.CHAYXANA_VARIANT === 'next' ? 'next' : 'production';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __CHAYXANA_VARIANT__: JSON.stringify(VARIANT),
    },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/preload.ts'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
      },
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    plugins: [react()],
  },
});
