import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      define: {
        // This is just generic value for the GEMINI API key.
        // This is not used at all, and can be ignored!
        'process.env.API_KEY' : JSON.stringify('api-key-this-is-not-used-can-be-ignored!'),
      },
      server: {
        port: 5175,
        strictPort: true,
        proxy: {
          //Target your Node.js backend
          '/api-proxy': 'http://localhost:5001',
          '/api': 'http://localhost:5001',
          '/ws-proxy': {target: 'ws://localhost:5001', ws: true},
        },
      },
      plugins: react(),
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
