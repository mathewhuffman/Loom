import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dynamicGlyphDir = path.resolve(__dirname, 'public', 'glyphs', 'dynamic');
const normalizedDynamicPath = dynamicGlyphDir.replace(/\\/g, '/');

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // IMPORTANT: Use relative paths for Electron file:// protocol
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        `${normalizedDynamicPath}/**`,
        '**/public/glyphs/dynamic/**',
      ],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

