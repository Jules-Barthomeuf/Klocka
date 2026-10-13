// Les mails de chacun (13 oct. 2026, Jules : « un onglet Mail dans Compte pour
// personnaliser vos mails types ») : on part des modèles de l'équipe (ceux de
// la page Mails), chacun les réécrit à sa façon, et la plateforme lui propose
// ensuite ses propres versions après un appel. Revenir au modèle de l'équipe
// efface la sienne. Les variables restent les mêmes ({{salutation}},
// {{type_bien}}, {{ville}}, {{signature}}).

import { Records } from './db.js';

const ENTITE = 'MailPerso';
// Les mails que la plateforme propose après un appel.
export const MAILS_PERSONNALISABLES = ['presentation-cahier', 'demande-fiche', 'demande-documents'];
const moiDe = (user) => String(user?.email || '').toLowerCase();

/** Le modèle de l'équipe : celui de la base (page Mails), sinon celui livré. */
async function modeleEquipe(slug) {
  const enBase = Records.list('MailTemplate').find((t) => t.slug === slug && !t.archived);
  if (enBase) return enBase;
  const { DEFAULT_TEMPLATES } = await import('./mail.js');
  return DEFAULT_TEMPLATES.find((t) => t.slug === slug) || null;
}

/** La version d'une personne pour ce modèle, ou null. */
export function versionDe(email, slug) {
  const par = String(email || '').toLowerCase();
  if (!par || !slug) return null;
  return Records.list(ENTITE).find((x) => x.par === par && x.slug === slug) || null;
}

/** Ses mails : chaque modèle de l'équipe, et sa version s'il en a une. */
export async function mesMails(user) {
  const moi = moiDe(user);
  const out = [];
  for (const slug of MAILS_PERSONNALISABLES) {
    const t = await modeleEquipe(slug);
    if (!t) continue;
    const v = versionDe(moi, slug);
    out.push({ slug, titre: t.titre, description: t.description || null, equipe: { objet: t.objet, contenu: t.contenu }, perso: v ? { objet: v.objet, contenu: v.contenu, maj_le: v.maj_le } : null });
  }
  return out;
}

export function enregistrer(user, slug, { objet, contenu }) {
  const moi = moiDe(user);
  if (!moi) return { ok: false, error: 'Connectez-vous.' };
  if (!MAILS_PERSONNALISABLES.includes(slug)) return { ok: false, error: 'Modèle inconnu.' };
  const o = String(objet || '').trim().slice(0, 300);
  const c = String(contenu || '').replace(/\r\n/g, '\n').trim().slice(0, 20000);
  if (!o || !c) return { ok: false, error: 'L\'objet et le message sont nécessaires.' };
  const d = versionDe(moi, slug);
  const maj = { objet: o, contenu: c, maj_le: new Date().toISOString() };
  const r = d ? Records.update(ENTITE, d.id, maj) : Records.create(ENTITE, { par: moi, slug, ...maj });
  return { ok: true, perso: { objet: r.objet, contenu: r.contenu, maj_le: r.maj_le } };
}

/** Revenir au modèle de l'équipe : sa version s'efface. */
export function revenir(user, slug) {
  const d = versionDe(moiDe(user), slug);
  if (d) Records.delete(ENTITE, d.id);
  return { ok: true };
}
