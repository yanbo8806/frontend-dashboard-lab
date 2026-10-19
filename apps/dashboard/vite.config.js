import { defineConfig } from 'vite';
import { demoApi } from './tools/server.mjs';

// 固定 1871×841 舞台；相对资源地址支持 GitHub Pages 的仓库子路径。
export default defineConfig({
  base: './',
  plugins: [{
    name: 'read-only-dashboard-demo-api',
    configureServer(server) { server.middlewares.use((req, res, next) => { demoApi(req, res).then(handled => { if (!handled) next(); }).catch(next); }); },
    configurePreviewServer(server) { server.middlewares.use((req, res, next) => { demoApi(req, res).then(handled => { if (!handled) next(); }).catch(next); }); },
  }],
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    assetsDir: 'bundle',
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl'], three: ['three'], charts: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers'] } } },
  },
  server: { port: 5199, strictPort: true },
});
