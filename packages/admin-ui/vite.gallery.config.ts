import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Builds the design-system gallery as a standalone browser page.
 *
 * Deliberately separate from vite.config.ts: this one produces a single JS
 * bundle so the result can be inlined into one shareable HTML file (see
 * scripts/build-gallery-page.mjs).
 */
export default defineConfig({
  root: resolve(__dirname, 'gallery'),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'gallery-dist'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'gallery.js',
        assetFileNames: 'gallery.[ext]',
      },
    },
  },
});
