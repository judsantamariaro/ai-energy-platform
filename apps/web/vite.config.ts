import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // El único archivo por encima de 500 kB es ECharts (~590 kB con los módulos que se usan). Se
    // descarga solo en las pantallas con gráficos, gracias a la carga de páginas por ruta.
    chunkSizeWarningLimit: 650,
  },
  server: {
    port: 5173,
    // En desarrollo el frontend habla con la API por el mismo origen (sin CORS).
    proxy: {
      '/api': process.env.API_URL ?? 'http://127.0.0.1:3000',
    },
  },
});
