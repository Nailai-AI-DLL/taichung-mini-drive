import { defineConfig } from 'vite';

// GitHub Pages 部署時網址在 /taichung-mini-drive/ 底下,由 workflow 設 VITE_BASE(decisions/0022)
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  server: { port: 5173, strictPort: true },
});
