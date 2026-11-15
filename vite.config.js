import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 600, // pdf.js loads only when someone picks a resume
    rollupOptions: { input: { index: resolve(import.meta.dirname, 'index.html'), make: resolve(import.meta.dirname, 'make.html') } },
  },
});
