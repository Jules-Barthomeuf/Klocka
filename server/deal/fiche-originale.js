// La fiche commerciale telle qu'elle est arrivée, pas sa transcription.
//
// Le texte lu sert à l'analyse ; l'analyste, lui, veut voir le document :
// le PDF ou l'image importés, les pièces jointes d'un mail (la fiche arrive
// presque toujours en PDF joint, et l'on n'archivait que le .eml entier), les
// pièces de la data room quand la fiche en a été tirée. Un texte collé n'a pas
// d'autre original que lui-même, et on le dit.

import fs from 'fs';
import path from 'path';
import { Records } from '../db.js';
import { archiverSource } from './ingest.js';

const VISIBLES = /\.(pdf|png|jpe?g|webp|gif)$/i;
const mimeDe = (nom) => (/\.pdf$/i.test(nom) ? 'application/pdf' : /\.png$/i.test(nom) ? 'image/png' : /\.jpe?g$/i.test(nom) ? 'image/jpeg' : /\.webp$/i.test(nom) ? 'image/webp' : /\.gif$/i.test(nom) ? 'image/gif' : null);

/** Pure : ce que la source dit déjà d'elle-même, sans rien lire. */
export function originauxConnus(deal) {
  const s = deal?.source || {};
  if (Array.isArray(s.originaux)) return s.originaux;
  if (s.url && VISIBLES.test(s.url)) return [{ nom: s.nom_fichier || 'Fiche', url: s.url, mime: mimeDe(s.url) }];
  // Une fiche tirée de la data room : ses pièces sont les originaux.
  if (/fiche-depuis-data-room/.test(s.nom_fichier || '')) {
    return (deal.documents_espace || []).filter((d) => d.url && VISIBLES.test(d.url)).map((d) => ({ nom: d.nom, url: d.url, mime: d.mime || mimeDe(d.url) }));
  }
  return null;
}

/**
 * Les originaux d'une fiche, extraits une fois du mail archivé s'il le faut,
 * puis gardés sur le dossier.
 * @returns {Promise<{originaux: Array<{nom, url, mime}>, colle: boolean}>}
 */
// Un fichier archivé peut avoir disparu (disque effacé, base copiée sans ses
// fichiers) : on le dit, plutôt que de montrer une image cassée.
const present = (url, uploadDir) => {
  if (!uploadDir || !/^\/uploads\//.test(String(url || ''))) return true;
  return fs.existsSync(path.join(uploadDir, path.basename(url)));
};
const marquer = (liste, uploadDir) => liste.map((o) => ({ ...o, present: present(o.url, uploadDir) }));

export async function originauxDeLaFiche(deal, uploadDir) {
  const connus = originauxConnus(deal);
  if (connus) return { originaux: marquer(connus, uploadDir), colle: false };
  const s = deal?.source || {};
  if (s.url && /\.eml$/i.test(s.url) && uploadDir) {
    const chemin = path.join(uploadDir, path.basename(s.url));
    if (fs.existsSync(chemin)) {
      const { simpleParser } = await import('mailparser');
      const mail = await simpleParser(fs.readFileSync(chemin));
      const originaux = (mail.attachments || [])
        .filter((a) => a.filename && VISIBLES.test(a.filename))
        .map((a) => ({ nom: a.filename, url: archiverSource(a.content, a.filename, uploadDir), mime: a.contentType || mimeDe(a.filename) }));
      Records.update('Deal', deal.id, { source: { ...s, originaux } });
      return { originaux: marquer(originaux, uploadDir), colle: false };
    }
  }
  return { originaux: [], colle: !s.url };
}
