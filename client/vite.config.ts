import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    publicDir: '../assets_runtime',
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        open: true,
    },
    build: {
        target: 'esnext',
        outDir: 'dist',
    },
});
