import { defineConfig } from 'vite';

// base: './' — Electron(file://)과 Capacitor 모두 상대 경로로 로드되도록
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
