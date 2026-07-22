import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// Same-origin in every environment (spec §11): the browser only ever talks to
// :5173, and Vite forwards /api server-side. In Compose, VITE_API_PROXY_TARGET
// is set to http://api:3000 (the container's service name); outside Compose it
// defaults to localhost.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        proxy: {
            '/api': {
                target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
                changeOrigin: false,
            },
        },
    },
});
