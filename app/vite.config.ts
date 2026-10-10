import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // En développement, l'application appelle la banque sur /api, relayée vers BANK_URL: une banque déployée (https://...)
  // ou le tunnel SSH vers son socket privé (voir le README), par défaut sur ce port.
  const bank = env.BANK_URL ?? 'http://127.0.0.1:8787'
  return {
    plugins: [
      react(),
      // Le connecteur Bitcoin du fournisseur dépend de modules Node (process, Buffer, util).
      nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
    ],
    // Passkeys: le navigateur exige un domaine, donc `localhost` et jamais `127.0.0.1`.
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: bank, changeOrigin: true } },
    },
    preview: { proxy: { '/api': { target: bank, changeOrigin: true } } },
  }
})
