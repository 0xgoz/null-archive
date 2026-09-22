import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/html',
  publicDir: false,
  build: {
    // Relative to src/html: put the finished site at the project root.
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
