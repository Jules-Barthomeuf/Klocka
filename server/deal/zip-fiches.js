// Un ZIP de fiches reçu par mail (9 nov. 2026, Jules : « un projet zip » de trois projets donnait un seul dossier) :
// on l'ouvre et on en sort les fiches, chacune donnant un dossier. Les dossiers, images et papiers d'agence sont
// écartés par les mêmes règles que les pièces jointes directes (estUneFiche).

import { estUneFiche } from './fiches-auto.js';

const MIME = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const mimeDe = (nom) => MIME[String(nom).split('.').pop().toLowerCase()] || 'application/octet-stream';
const nomSeul = (chemin) => String(chemin).split('/').pop();

/**
 * Les fiches d'un ZIP, en mémoire. Rend [{ nom, mime, buffer }], dans l'ordre du zip ; vide si le zip ne s'ouvre
 * pas ou ne contient aucune fiche. `garder` : ce qu'on retient d'après le nom du fichier.
 */
export async function fichesDuZip(buffer, garder = estUneFiche) {
  let zip;
  try {
    const JSZip = (await import('jszip')).default;
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return [];
  }
  const entrees = Object.values(zip.files)
    // Ni dossier, ni métadonnées macOS (__MACOSX, ._fichier), ni fichier caché.
    .filter((f) => !f.dir && !/(^|\/)(__MACOSX\/|\._)/.test(f.name) && !/(^|\/)\./.test(nomSeul(f.name)))
    .filter((f) => garder(nomSeul(f.name)));
  const fiches = [];
  for (const f of entrees) {
    const contenu = await f.async('nodebuffer').catch(() => null);
    if (contenu && contenu.length) fiches.push({ nom: nomSeul(f.name), mime: mimeDe(f.name), buffer: contenu });
  }
  return fiches;
}

/** Les pièces jointes d'un mail qui sont des ZIP. */
export const zipsDuMail = (mail) => (mail?.pieces_jointes || []).filter((p) => /\.zip$/i.test(String(p?.nom || '')) && p?.piece_id);
