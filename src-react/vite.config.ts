import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Separa vendors estables: firebase y react cambian poco entre
        // releases, asi el navegador los reutiliza de cache y el bundle
        // de la app (que cambia cada deploy) queda aislado y liviano.
        manualChunks: {
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/functions',
            'firebase/messaging',
            'firebase/storage',
          ],
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
