import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    // Use esbuild for JS minification (installed as dev dep)
    minify: 'esbuild',

    // Target es2018 for broad browser support (~95% of mobile)
    target: 'es2018',

    // Assets (hashed JS/CSS/images) go into dist/assets/
    assetsDir: 'assets',

    rollupOptions: {
      input: path.resolve(process.cwd(), 'index.html'),

      output: {
        manualChunks(id) {
          if (id.includes('note-types')) {
            return 'note-types';
          }
        },
      },
    },
  },

  server: {
    port: 3001,
    open: false,
  },
});
