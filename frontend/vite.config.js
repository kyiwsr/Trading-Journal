import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The proxy keeps API calls same-origin in dev so the session cookie needs no cross-site settings.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    globals: true,
    css: false,
  },
})
