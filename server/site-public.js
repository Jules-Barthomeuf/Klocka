// Le site public de Klocka (klocka.immo), repris de Base44 le 6 nov. 2026 (Jules).
//
// Construit par site/vite.config.js dans dist/klocka.immo, il est servi à deux endroits :
// - partout sous /klocka.immo/ (app.klocka.immo/klocka.immo/, comme /kpartners/) ;
// - à la racine quand l'hôte est klocka.immo. Là, toute adresse qui n'est pas une page du site
//   appartient à la plateforme et y est renvoyée telle quelle, pour que les liens déjà envoyés
//   par mail (klocka.immo/Bienvenue?jeton=…) mènent au bon endroit. /api et /uploads passent.
import express from 'express';
import fs from 'fs';
import path from 'path';

export const PREFIXE = '/klocka.immo';
// klocka.localhost s'ouvre dans le navigateur sans rien configurer : c'est l'hôte des essais en local.
export const HOTES_SITE = new Set(
  (process.env.SITE_HOTES || 'klocka.immo,www.klocka.immo,klocka.localhost')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
);
export const PLATEFORME = (process.env.SITE_PLATEFORME_URL || 'https://app.klocka.immo').replace(/\/+$/, '');
// Les routes du site (site/src/App.jsx).
export const PAGES_SITE = new Set(['/', '/equipe', '/qui-sommes-nous', '/simulateur', '/legal']);

export const estHoteSite = (hote) => HOTES_SITE.has(String(hote || '').toLowerCase());

export function pageDuSite(chemin) {
  const p = String(chemin || '/').replace(/\/+$/, '') || '/';
  return PAGES_SITE.has(p);
}

export function siteMiddleware(distSite) {
  const index = path.join(distSite, 'index.html');
  const statique = express.static(distSite, {
    index: false,
    setHeaders: (res, chemin) => {
      // Les fichiers construits par Vite portent une empreinte ; les images de public/img non.
      if (chemin.startsWith(path.join(distSite, 'assets') + path.sep)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  });
  const servirPage = (req, res) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && pageDuSite(req.path) && fs.existsSync(index)) {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(index);
      return true;
    }
    return false;
  };

  const routeur = express.Router();
  // Sous /klocka.immo/, sur tous les hôtes. Une adresse inconnue y suit son cours (404 de la plateforme).
  routeur.use(PREFIXE, statique, (req, res, next) => { if (!servirPage(req, res)) next(); });
  // À la racine de klocka.immo.
  routeur.use((req, res, next) => {
    if (!estHoteSite(req.hostname)) return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    if (!servirPage(req, res)) res.redirect(302, PLATEFORME + req.originalUrl);
  });
  return routeur;
}
