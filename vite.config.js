import { defineConfig } from 'vite';

// base: './' — Electron(file://)과 Capacitor 모두 상대 경로로 로드되도록
// 화면에 표시할 빌드 시각 (한국 시간) — 업데이트가 적용됐는지 확인용
const built = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(5, 16).replace('T', ' ');

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(built) },
  build: { outDir: 'dist', emptyOutDir: true },
});
