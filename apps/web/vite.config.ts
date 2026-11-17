import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development the API runs separately under `wrangler pages dev` (see `npm run dev`)
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
});
