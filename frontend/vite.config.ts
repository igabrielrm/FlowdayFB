import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isAndroid = mode === 'android';

  return {
    plugins: [react()],
    base: isAndroid ? './' : '/app/',
    resolve: {
      dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled'],
      alias: {
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
    },
    define: {
      // sockjs-client espera `global` (Node). En el navegador no existe.
      global: 'globalThis',
    },
    build: {
      outDir: isAndroid ? 'dist-android' : '../src/main/resources/static/app',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      hmr: {
        path: '/app/',
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', '@emotion/react', '@emotion/styled', '@mui/material', 'sockjs-client'],
    },
  };
});
