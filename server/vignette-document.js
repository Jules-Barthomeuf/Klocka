// La vraie première page d'un document de la Bibliothèque (2 nov. 2026, Jules : « je veux que les previews des fichiers
// soient les vrais documents »). L'avis de valeur et le teaser n'existent qu'en page d'impression : le serveur l'ouvre
// une fois, photographie sa première page A4 en petit JPEG et le garde ; il ne la refait que si le document a changé
// (`version`). Une seule photo à la fois : un Chromium tient trois cents mégaoctets, Render en a deux gigas en tout.
// Le mandat est un PDF déposé : l'écran le dessine lui-même (pdf.js), sans passer par ici.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CHEMIN_UPLOADS } from './db.js';

const DOSSIER = path.join(CHEMIN_UPLOADS, 'vignettes');
const PAGES = { avis: 'ImpressionAvis', teaser: 'ImpressionTeaser' };
// La page A4 à 96 points par pouce, photographiée à moitié : 397 × 562, assez pour une carte de 3 colonnes.
const A4 = { width: 794, height: 1123 };

const sur = (x) => String(x).replace(/[^a-zA-Z0-9_-]/g, '_');
/** Pure : le fichier d'une vignette, qui change avec la version du document. */
export const fichierVignette = (genre, id, version, dossier = DOSSIER) =>
  path.join(dossier, `${genre}-${sur(id)}-${crypto.createHash('sha1').update(String(version || '')).digest('hex').slice(0, 10)}.jpg`);

let file = Promise.resolve();

/** La vignette { ok, fichier } d'un avis ou d'un teaser ; faite au premier appel, gardée ensuite. */
export async function vignetteDocument({ genre, id, version, base }) {
  if (!PAGES[genre] || !id) return { ok: false, error: 'Pas de vignette pour ce document.' };
  const fichier = fichierVignette(genre, id, version);
  if (fs.existsSync(fichier)) return { ok: true, fichier };
  const tour = file.then(() => photographier({ genre, id, fichier, base }));
  file = tour.catch(() => {});
  return tour;
}

async function photographier({ genre, id, fichier, base }) {
  if (fs.existsSync(fichier)) return { ok: true, fichier };
  const { jetonImpression } = await import('./presentation-pdf.js');
  const { lancerNavigateur } = await import('./marche/navigateur.js');
  const nav = await lancerNavigateur('La vignette du document');
  const contexte = await nav.newContext({ viewport: A4, deviceScaleFactor: 0.5, locale: 'fr-FR' });
  try {
    const page = await contexte.newPage();
    const jeton = jetonImpression(`${genre}:${id}`);
    await page.setExtraHTTPHeaders({ 'X-Klocka-Impression': jeton });
    await page.goto(`${base}/${PAGES[genre]}?jeton=${jeton}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction('window.__impressionPrete === true || !!window.__impressionErreur', null, { timeout: 60000 });
    const erreur = await page.evaluate('window.__impressionErreur || null');
    if (erreur) return { ok: false, error: erreur };
    await page.emulateMedia({ media: 'print' });
    const image = await page.screenshot({ type: 'jpeg', quality: 72, clip: { x: 0, y: 0, ...A4 } });
    fs.mkdirSync(DOSSIER, { recursive: true });
    // Les anciennes versions du même document partent : une seule vignette par document.
    const prefixe = `${genre}-${sur(id)}-`;
    for (const f of fs.readdirSync(DOSSIER)) if (f.startsWith(prefixe)) fs.rmSync(path.join(DOSSIER, f), { force: true });
    fs.writeFileSync(fichier, image);
    return { ok: true, fichier };
  } finally {
    await contexte.close().catch(() => {});
  }
}
