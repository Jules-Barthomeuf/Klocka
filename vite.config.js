import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { pageKpartners, demandeDePage } from './server/pwa-kpartners.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND = process.env.VITE_BACKEND_URL || 'http://localhost:3001'

// En local, kpartners.localhost reçoit la page habillée K Partners, comme app.kpartners.immo en ligne
// (server/pwa-kpartners.js) : le nom, l'icône et le manifeste de l'application à installer.
const pwaKpartners = {
  name: 'pwa-kpartners',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const chemin = (req.url || '/').split('?')[0]
      const hote = String(req.headers.host || '').replace(/:\d+$/, '')
      if (!/^(app\.)?kpartners\./.test(hote) || chemin.startsWith('/@') || chemin.startsWith('/node_modules')
        || !demandeDePage(req.method, chemin) || !String(req.headers.accept || '').includes('text/html')) return next()
      try {
        const html = await server.transformIndexHtml(req.url, fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'))
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(pageKpartners(html))
      } catch (e) { next(e) }
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pwaKpartners],
  // MapLibre analyse ses tuiles vectorielles dans un Web Worker ; le
  // pré-bundling de Vite casse ce worker en dev (symptôme : fond raster OK,
  // aucune tuile vectorielle chargée). On le sert donc tel quel.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  resolve: {
    alias: [
      // "@" -> src (previously provided by the base44 vite plugin)
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      // Redirect the Base44 SDK imports to the local shim. The sub-path alias
      // must come first so it matches before the bare-package alias.
      {
        find: '@base44/sdk/dist/utils/axios-client',
        replacement: path.resolve(__dirname, 'src/lib/local-sdk/axios-client.js'),
      },
      { find: '@base44/sdk', replacement: path.resolve(__dirname, 'src/lib/local-sdk/index.js') },
    ],
  },
  server: {
    proxy: {
      // Les appels au modèle (analyse d'un dossier, rédaction) dépassent
      // volontiers la minute : sans délai explicite, le proxy coupe la
      // connexion en cours de route et le navigateur signale une erreur réseau.
      '/api': { target: BACKEND, changeOrigin: true, timeout: 600000, proxyTimeout: 600000 },
      '/uploads': { target: BACKEND, changeOrigin: true },
    },
  },
})
