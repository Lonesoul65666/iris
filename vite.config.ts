import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api/yf': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yf/, ''),
      },
      // SimpleFIN Bridge proxy — dev only. In a Tauri wrapper, swap to native HTTP (no CORS).
      '/api/simplefin': {
        target: 'https://beta-bridge.simplefin.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/simplefin/, ''),
      },
    },
  },
})
