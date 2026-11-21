import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const backendTarget =
        env.VITE_PROXY_TARGET ||
        env.VITE_BACKEND_URL ||
        'http://127.0.0.1:3000';

    return {
        base: './',
        plugins: [react()],
        server: {
            host: '0.0.0.0',
            port: 8080,
            allowedHosts: true,
            proxy: {
                '/socket.io': {
                    target: backendTarget,
                    changeOrigin: true,
                    secure: false,
                    ws: true,
                },
                '/status': {
                    target: backendTarget,
                    changeOrigin: true,
                    secure: false,
                },
                '/rooms': {
                    target: backendTarget,
                    changeOrigin: true,
                    secure: false,
                },
                '/player': {
                    target: backendTarget,
                    changeOrigin: true,
                    secure: false,
                },
                '/isImposter': {
                    target: backendTarget,
                    changeOrigin: true,
                    secure: false,
                },
            },
        },
    };
});
