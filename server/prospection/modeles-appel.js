// Les mails du mode appel (spec du 7 oct. 2026) : des modèles fixes, ceux de
// la page Mails (MailTemplate). L'IA ne réécrit jamais le corps : seules les
// variables se remplissent ({{analyste}}, {{salutation}}, {{signature}},
// {{contexte}} pour Murs commerciaux seulement).

import { Records } from '../db.js';

/** L'issue et son modèle : le choix par défaut, et la variante d'un clic. */
export const MODELES_DE_L_ISSUE = {
  pas_de_murs: { defaut: 'presentation-cahier', variante: 'presentation' },
  // A un bien : la fiche commerciale seule d'abord ; les pièces du dossier si elles ont été demandées.
  a_des_murs: { defaut: 'demande-fiche', variante: 'demande-documents', si_documents: 'demande-documents' },
};

/** Le modèle d'un slug : celui de la base (modifiable depuis la page Mails), sinon celui livré. */
export async function modele(slug) {
  const enBase = Records.list('MailTemplate').find((t) => t.slug === slug && !t.archived);
  if (enBase) return enBase;
  const { DEFAULT_TEMPLATES } = await import('../mail.js');
  return DEFAULT_TEMPLATES.find((t) => t.slug === slug) || null;
}

/**
 * Pure : le mail d'un modèle, variables remplies. {{signature}} reste
 * {signature} : elle se pose à l'envoi, avec le nom de qui envoie. La phrase de
 * contexte se place sous la salutation quand le modèle n'a pas sa variable.
 */
export function remplirModele(t, { analyste = '', salutation = 'Bonjour,', contexte = null } = {}) {
  let corps = String(t?.contenu || '');
  if (contexte && !/\{\{\s*contexte\s*\}\}/.test(corps)) corps = corps.replace(/^([^\n]*)\n\n/, `$1\n\n{{contexte}}\n\n`);
  corps = corps
    .replace(/\n?\{\{\s*contexte\s*\}\}\n?/g, (full) => (contexte ? full.replace(/\{\{\s*contexte\s*\}\}/, contexte) : '\n'))
    .replace(/\{\{\s*salutation\s*\}\}/g, salutation || 'Bonjour,')
    .replace(/\{\{\s*analyste\s*\}\}/g, analyste || '{signature}')
    // Les anciens modèles disaient « Je suis {{signature}} » : c'est l'analyste.
    .replace(/Je suis \{\{\s*signature\s*\}\}/g, `Je suis ${analyste || '{signature}'}`)
    .replace(/\{\{\s*signature\s*\}\}/g, '{signature}')
    .replace(/\n{3,}/g, '\n\n');
  return { slug: t?.slug || null, titre: t?.titre || null, objet: String(t?.objet || '').replace(/\{\{\s*\w+\s*\}\}/g, '').trim(), corps, contexte: contexte || null };
}

/** Pure : le cahier des charges d'un modèle, ses lignes « - Type de bien : … ». */
export function cahierDuModele(t) {
  const texte = String(t?.contenu || '');
  const debut = texte.search(/cahier des charges/i);
  if (debut < 0) return [];
  return texte.slice(debut).split('\n').filter((l) => /^\s*-\s+\S/.test(l)).map((l) => l.replace(/^\s*-\s+/, '').trim()).slice(0, 6);
}

/** Le cahier des charges clients, à avoir sous les yeux avant d'appeler. */
export async function cahierDesCharges() {
  return cahierDuModele(await modele('presentation-cahier'));
}
