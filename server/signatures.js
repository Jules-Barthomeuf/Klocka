// La signature des mails de l'équipe (8 oct. 2026) : une bannière Klocka par
// personne (sa photo, son nom, son adresse, son numéro), en bas de chaque mail
// parti de sa boîte. Elle remplace, dans la version HTML, la signature en
// texte (« Jules / jules.b@klocka.immo / www.klocka.immo ») ; la version texte
// la garde, pour les messageries qui n'affichent pas d'image.
//
// L'image part dans le mail lui-même (pièce intégrée, « cid ») : elle
// s'affiche sans que le destinataire ait à charger les images, et ne dépend
// pas d'une adresse du serveur. Les fichiers sont dans public/signatures/,
// nommés par l'adresse avant l'arobase.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DOSSIER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'signatures');
export const CID = 'banniere-klocka';

// Ce que dit la bannière, pour qui ne voit pas l'image (texte de remplacement).
const EQUIPE = {
  'jules.b@klocka.immo': { nom: 'Jules Barthomeuf', telephone: '06 49 78 81 76' },
  'maxime.p@klocka.immo': { nom: 'Maxime Pama', telephone: '06 10 91 71 65' },
  'coralie.g@klocka.immo': { nom: 'Coralie Guillaud', telephone: '07 52 02 16 12' },
  'nora.l@klocka.immo': { nom: 'Nora Lorinquer', telephone: '07 82 74 53 32' },
};

const cache = new Map();

/** La bannière d'une adresse d'envoi, ou null : seulement les adresses Klocka qui en ont une. */
export function banniereDe(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.endsWith('@klocka.immo')) return null;
  if (cache.has(e)) return cache.get(e);
  const fichier = path.join(DOSSIER, `${e.split('@')[0]}.jpg`);
  let b = null;
  try {
    const contenu = fs.readFileSync(fichier);
    const qui = EQUIPE[e] || { nom: e.split('@')[0], telephone: null };
    b = { email: e, contenu, nom: qui.nom, alt: [qui.nom, 'Klocka', e, qui.telephone, 'www.klocka.immo'].filter(Boolean).join(' · ') };
  } catch { b = null; }
  cache.set(e, b);
  return b;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Pure : le corps sans la signature en texte qui le termine. Une ligne de
 * signature : l'adresse, « klocka.immo », « Klocka », un numéro, ou le nom de
 * l'expéditeur (seul sur sa ligne). On remonte depuis la fin et on s'arrête à
 * la formule de politesse (« Bien à vous, ») ou à une vraie phrase. Rien n'est
 * retiré si le bloc ne contient ni l'adresse ni « klocka.immo ».
 */
export function sansSignature(texte, { email, nom = '' } = {}) {
  const lignes = String(texte || '').replace(/\s+$/, '').split('\n');
  const e = norm(email);
  const mots = norm(nom).split(/\s+/).filter((m) => m.length >= 3);
  const prenomLocal = norm(String(email || '').split('@')[0].split(/[._-]/)[0]);
  const estSignature = (l) => {
    const t = norm(l);
    if (!t) return false;
    if (e && t.includes(e)) return true;
    if (/klocka\.immo|^klocka\b|^www\./.test(t)) return true;
    if (/^(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}$/.test(t)) return true;
    // Le nom seul sur sa ligne (« Jules », « Jules Barthomeuf »), sans ponctuation de phrase.
    if (t.length <= 40 && !/[,.!?;:]$/.test(t) && (t === prenomLocal || (mots.length && t.split(/\s+/).every((m) => mots.includes(m) || m === prenomLocal)))) return true;
    return false;
  };
  let i = lignes.length;
  let preuve = false;
  while (i > 0 && estSignature(lignes[i - 1])) {
    const t = norm(lignes[i - 1]);
    if ((e && t.includes(e)) || /klocka\.immo/.test(t)) preuve = true;
    i -= 1;
  }
  if (!preuve) return { corps: String(texte || '').replace(/\s+$/, ''), retiree: false };
  return { corps: lignes.slice(0, i).join('\n').replace(/\s+$/, ''), retiree: true };
}

/** Pure : le HTML d'un mail avec la bannière à la place de la signature. */
export function htmlAvecBanniere(corpsHtml, banniere) {
  const alt = String(banniere.alt).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `${corpsHtml}<div style="margin-top:20px"><img src="cid:${CID}" alt="${alt}" width="500" style="display:block;width:100%;max-width:500px;height:auto;border:0;outline:none;text-decoration:none"></div>`;
}
