import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // During development the browser calls /api on the Vite server, which forwards to the NestJS API.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
