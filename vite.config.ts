import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0' },
  // config touch: forces server restart to pick up new env vars
})
