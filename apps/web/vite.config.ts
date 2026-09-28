import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En desarrollo el frontend habla con la API por el mismo origen (sin CORS).
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
