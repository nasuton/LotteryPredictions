import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Support GitHub Pages repository subdirectories.
  base: './',
  plugins: [react()],
})
