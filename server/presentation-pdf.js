// La présentation bancaire en PDF (12 oct. 2026, Jules : « dès que j'exporte en
// PPT ou en Google Slides, ça dérange tout »). Le PDF n'est pas redessiné : un
// navigateur sans écran ouvre la page d'impression, qui pose chaque
// diapositive avec le même composant que l'éditeur (Deck), figée ; chacune est
// photographiée en 2560 × 1440 et posée sur une page de 1280 × 720. Ce que
// l'on voit à l'écran est ce que reçoit la banque.
//
// La page d'impression est publique mais ne lit qu'avec un jeton à usage court
// (deux minutes), posé par le serveur pour son propre navigateur.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Records, CHEMIN_UPLOADS } from './db.js';

const ENTITE = 'PresentationBancaire';
const DUREE_JETON_MS = 2 * 60 * 1000;
const JETONS = new Map(); // jeton → { id, expire }

/** Un jeton d'impression pour une présentation. */
export function jetonImpression(id, maintenant = Date.now()) {
  for (const [j, v] of JETONS) if (v.expire < maintenant) JETONS.delete(j);
  const jeton = crypto.randomBytes(24).toString('hex');
  JETONS.set(jeton, { id, expire: maintenant + DUREE_JETON_MS });
  return jeton;
}

/** Ce que la page d'impression lit : le titre et les diapositives, si le jeton vaut encore. */
export function lireParJeton(jeton, maintenant = Date.now()) {
  const v = JETONS.get(String(jeton || ''));
  if (!v || v.expire < maintenant) return null;
  const p = Records.get(ENTITE, v.id);
  if (!p) return null;
  return { titre: p.titre || 'Projet de financement', diapos: p.diapos || [] };
}

/** Pure : le PDF gardé est-il encore celui de la présentation (rien retouché depuis) ? */
export const pdfAJour = (p, existe = true) => !!(p?.pdf_url && p.pdf_le && existe && String(p.pdf_le) >= String(p.maj_le || p.cree_le || ''));

/** Le PDF de la présentation : refait seulement si elle a changé depuis le dernier. */
export async function exporterPdf(id, { base, forcer = false } = {}) {
  const p = Records.get(ENTITE, id);
  if (!p) return { ok: false, error: 'Présentation introuvable.' };
  const nom = `presentation-bancaire-${String(p.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  const dossier = path.join(CHEMIN_UPLOADS, 'presentations');
  const fichier = path.join(dossier, nom);
  if (!forcer && pdfAJour(p, fs.existsSync(fichier))) return { ok: true, pdf_url: p.pdf_url, deja: true };

  const { lancerNavigateur } = await import('./marche/navigateur.js');
  const nav = await lancerNavigateur('La présentation en PDF');
  // Chaque diapositive est photographiée telle que l'écran la dessine (2560 × 1440), puis les images sont
  // posées une par page. L'impression directe du deck, essayée d'abord, le réduisait aux deux tiers de la page.
  const contexte = await nav.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, locale: 'fr-FR' });
  try {
    const page = await contexte.newPage();
    await page.goto(`${base}/ImpressionPresentation?jeton=${jetonImpression(id)}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction('window.__impressionPrete === true || !!window.__impressionErreur', null, { timeout: 60000 });
    const erreur = await page.evaluate('window.__impressionErreur || null');
    if (erreur) return { ok: false, error: `La page d'impression n'a pas pu s'ouvrir : ${erreur}` };
    const pages = page.locator('.k-impression-page');
    const n = await pages.count();
    if (!n) return { ok: false, error: 'Aucune diapositive à imprimer.' };
    const images = [];
    for (let k = 0; k < n; k++) images.push((await pages.nth(k).screenshot({ type: 'jpeg', quality: 92 })).toString('base64'));
    const feuille = await contexte.newPage();
    await feuille.setContent(`<!doctype html><html><head><style>@page{size:1280px 720px;margin:0}html,body{margin:0;padding:0;background:#000}img{display:block;width:1280px;height:720px;break-after:page;page-break-after:always}img:last-child{break-after:auto;page-break-after:auto}</style></head><body>${images.map((b) => `<img src="data:image/jpeg;base64,${b}">`).join('')}</body></html>`, { waitUntil: 'load' });
    const pdf = await feuille.pdf({ width: '1280px', height: '720px', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(fichier, pdf);
  } finally {
    await contexte.close().catch(() => {});
  }
  const pdf_url = `/uploads/presentations/${nom}`;
  // pdf_le après maj_le : le prochain export réutilise ce fichier tant que rien n'est retouché.
  Records.update(ENTITE, id, { pdf_url, pdf_le: new Date().toISOString() });
  return { ok: true, pdf_url };
}
