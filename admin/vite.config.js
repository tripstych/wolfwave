import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
        router: (req) => {
          const host = req.headers.host;
          if (host) {
            const hostname = host.split(':')[0];
            if (hostname.endsWith('.localhost')) {
              return `http://${hostname}:3000`;
            }
          }
          return 'http://127.0.0.1:3000';
        }
      },
      '/uploads': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
        router: (req) => {
          const host = req.headers.host;
          if (host) {
            const hostname = host.split(':')[0];
            if (hostname.endsWith('.localhost')) {
              return `http://${hostname}:3000`;
            }
          }
          return 'http://127.0.0.1:3000';
        }
      },
      // Proxy static assets to backend
      '/js': 'http://127.0.0.1:3000',
      '/css': 'http://127.0.0.1:3000',
      '/images': 'http://127.0.0.1:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
