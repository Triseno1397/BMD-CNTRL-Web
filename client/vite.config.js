import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // Bind to all network interfaces for iPhone access
    port: 5173,
    strictPort: true,
    proxy: {
      // Proxy API requests to backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // Proxy WebSocket connections to backend on /ws path
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        rewrite: (path) => path.replace(/^\/ws/, '')
      }
    }
  }
})
