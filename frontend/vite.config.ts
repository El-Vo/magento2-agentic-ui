import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// DB-UI-Core-CSS enthaelt url()-Referenzen auf DB-Schriften und -Assets.
// Diese sind lizenzrechtlich auf DB-interne Nutzung beschraenkt und duerfen hier
// nicht gebundelt werden -> durch neutrale Referenzen ersetzen (Fallback-Scripts
// greifen, siehe font-family-Override in styles.css).
function dbUiNeutralAssets(): Plugin {
  return {
    name: 'db-ui-neutral-assets',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('/@db-ui/core/') && id.endsWith('.css')) {
        return { code: code.replace(/url\(\s*(['"]?)[^)]*\1\s*\)/g, 'url(about:blank)'), map: null }
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [dbUiNeutralAssets(), react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.AGENT_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
