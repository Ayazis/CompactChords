import { defineConfig } from 'vite';
import { importPlugin } from './server/import-plugin';

export default defineConfig({
  // Relative asset paths, so dist/ works from any folder or sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [importPlugin()],
});
