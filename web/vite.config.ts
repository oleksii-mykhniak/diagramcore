import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works from any path — including
  // GitHub Pages project sites (https://<user>.github.io/<repo>/),
  // where the app isn't served from the domain root (PLAN.md step 8.4).
  base: './',
})
