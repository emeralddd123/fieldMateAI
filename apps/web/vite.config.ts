import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: { include: ['@fieldmate/shared'] },
  build: {
    commonjsOptions: { include: [/node_modules/, /packages\/shared\/dist/] },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/jsqr')) {
            return 'qr-engine';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
          if (id.includes('node_modules/@tanstack')) {
            return 'query';
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router')
          ) {
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
});
