import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works under any GitHub Pages subpath.
  base: './',
  build: {
    rollupOptions: {
      // The full timeline page plus the homepage-widget preview.
      input: {
        main: 'index.html',
        widget: 'widget.html',
      },
    },
  },
});
