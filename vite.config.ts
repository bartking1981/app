import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' permite publicar en GitHub Pages dentro de cualquier subcarpeta
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, open: true },
})
