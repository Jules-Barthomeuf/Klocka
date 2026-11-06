// Le site public de Klocka (klocka.immo), repris de Base44 le 6 nov. 2026.
// Construit à part de la plateforme : son Tailwind, ses polices, son dossier dist/klocka.immo.
// Le serveur le sert quand l'hôte est klocka.immo (voir server/site-public.js).
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const ici = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: ici,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(ici, 'src') } },
  css: { postcss: { plugins: [tailwindcss({ config: path.resolve(ici, 'tailwind.config.js') }), autoprefixer()] } },
  // Servi sous /klocka.immo/ partout (et à la racine sur le domaine klocka.immo) : voir server/site-public.js.
  base: '/klocka.immo/',
  build: { outDir: path.resolve(ici, '../dist/klocka.immo'), emptyOutDir: true },
  server: { port: 5180 },
})
