import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /* Video assets are large and OneDrive holds write locks on them; watching
       them makes chokidar throw EBUSY and takes the dev server down. */
    watch: {
      ignored: ['**/public/video/**', '**/*.mp4'],
    },
    proxy: {
      '/api': { target: 'http://localhost:3100', changeOrigin: true },
      '/media': { target: 'http://localhost:3100', changeOrigin: true },
    },
  },
  preview: { port: 5173 },
});
