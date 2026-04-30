import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /api to the Vercel dev server when running `vercel dev` alongside Vite.
    // If you run only `npm run dev`, the /api routes aren't served — use `vercel dev`.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    // Sourcemaps in dev only. In production they leak original source
    // to anyone who opens DevTools.
    sourcemap: process.env.NODE_ENV !== 'production',
  },
});
