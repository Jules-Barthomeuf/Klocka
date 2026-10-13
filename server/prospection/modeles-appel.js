// Les mails du mode appel (spec du 7 oct. 2026) : des modèles fixes, ceux de
// la page Mails (MailTemplate). L'IA ne réécrit jamais le corps : seules les
// variables se remplissent ({{analyste}}, {{salutation}}, {{signature}},
// {{contexte}} pour Murs commerciaux seulement).

import { Records } from '../db.js';

/** L'issue et son modèle : le choix par défaut, et la variante d'un clic. */
// Depuis le 12 oct. 2026, deux canevas de Jules : « Suite à notre échange –
// Murs commerciaux occupés » (sans bien : présentation et budgets, un seul
// mail) et « Suite à notre échange – Dossier » (il a un bien : on attend son
// dossier). Les pièces du dossier ne se demandent que si elles l'ont été.
export const MODELES_DE_L_ISSUE = {
  pas_de_murs: { defaut: 'presentation-cahier' },
  a_des_murs: { defaut: 'demande-fiche', si_documents: 'demande-documents' },
  veut_mail: { defaut: 'presentation-cahier' },
  interesse: { defaut: 'presentation-cahier' },
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
export function remplirModele(t, { analyste = '', salutation = 'Bonjour,', contexte = null, type_bien = null, ville = null } = {}) {
  let corps = String(t?.contenu || '');
  // Le bien de l'appel ({{type_bien}}, {{ville}}) : non dit, il reste entre crochets, à compléter.
  corps = corps.replace(/\{\{\s*type_bien\s*\}\}/g, type_bien || '[type de bien]').replace(/\{\{\s*ville\s*\}\}/g, ville || '[ville]');
  const objet = String(t?.objet || '').replace(/\s*\{\{\s*ville\s*\}\}/g, ville ? ` ${ville}` : '').replace(/\{\{\s*\w+\s*\}\}/g, '').trim();
  if (contexte && !/\{\{\s*contexte\s*\}\}/.test(corps)) corps = corps.replace(/^([^\n]*)\n\n/, `$1\n\n{{contexte}}\n\n`);
  corps = corps
    .replace(/\n?\{\{\s*contexte\s*\}\}\n?/g, (full) => (contexte ? full.replace(/\{\{\s*contexte\s*\}\}/, contexte) : '\n'))
    .replace(/\{\{\s*salutation\s*\}\}/g, salutation || 'Bonjour,')
    .replace(/\{\{\s*analyste\s*\}\}/g, analyste || '{signature}')
    // Les anciens modèles disaient « Je suis {{signature}} » : c'est l'analyste.
    .replace(/Je suis \{\{\s*signature\s*\}\}/g, `Je suis ${analyste || '{signature}'}`)
    .replace(/\{\{\s*signature\s*\}\}/g, '{signature}')
    .replace(/\n{3,}/g, '\n\n');
  return { slug: t?.slug || null, titre: t?.titre || null, objet, corps, contexte: contexte || null };
}

/** Pure : ce qu'un modèle liste (les budgets des investisseurs, ou l'ancien cahier des charges) : ses lignes « - … » ou « • … ». */
export function cahierDuModele(t) {
  const texte = String(t?.contenu || '');
  return texte.split('\n').filter((l) => /^\s*[-•]\s+\S/.test(l)).map((l) => l.replace(/^\s*[-•]\s+/, '').trim()).slice(0, 6);
}

/** Le cahier des charges clients, à avoir sous les yeux avant d'appeler. */
export async function cahierDesCharges() {
  return cahierDuModele(await modele('presentation-cahier'));
}
