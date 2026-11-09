// Qui peut envoyer, jusqu'à combien, et en quelle santé (8 nov. 2026, Jules). Une boîte Gmail est plafonnée à 40 mails
// sur 24 h glissantes par défaut : au-delà, sa réputation et celle de klocka.immo sont en jeu.

import db, { Records } from '../db.js';
import { norm } from './journal.js';
import { EXPEDITEUR, resendConfigure } from './resend.js';

export const EXPEDITEUR_ENT = 'EmailingExpediteur';
export const PLAFOND_DEFAUT = 40;
const JOUR = 86400000;

const reglage = (email) => Records.list(EXPEDITEUR_ENT).find((x) => x.email === norm(email)) || null;
export const plafondDe = (email) => Number(reglage(email)?.plafond) || PLAFOND_DEFAUT;

export function poserPlafond(email, plafond) {
  const e = norm(email);
  const n = Math.max(1, Math.min(500, Number(plafond) || PLAFOND_DEFAUT));
  const r = reglage(e);
  if (r) Records.update(EXPEDITEUR_ENT, r.id, { plafond: n });
  else Records.create(EXPEDITEUR_ENT, { email: e, plafond: n });
  return { ok: true, email: e, plafond: n };
}

/** Pure : la santé d'un canal d'après ses taux, aux seuils de Resend (plaintes 0,08 %, rebonds 4 %). */
export function sante({ envoyes, rebonds, plaintes }) {
  if (!envoyes) return { etat: 'inconnue', taux_rebonds: 0, taux_plaintes: 0 };
  const taux_rebonds = (rebonds / envoyes) * 100;
  const taux_plaintes = (plaintes / envoyes) * 100;
  const etat = taux_plaintes >= 0.08 || taux_rebonds >= 4 ? 'critique' : taux_plaintes >= 0.05 || taux_rebonds >= 2.5 ? 'a_surveiller' : 'bonne';
  return { etat, taux_rebonds, taux_plaintes };
}

export async function tableau({ quand = new Date() } = {}) {
  const { listAccounts } = await import('../email.js');
  const depuis24 = new Date(quand.getTime() - JOUR).toISOString();
  const depuis30 = new Date(quand.getTime() - 30 * JOUR).toISOString();
  const compter = (sql, ...a) => db.prepare(sql).get(...a).n;
  const boites = listAccounts().map((b) => {
    const email = norm(b.email || b.id);
    return {
      email, nom: b.name || null, fournisseur: b.provider, plafond: plafondDe(email),
      aujourdhui: compter(`SELECT COUNT(*) n FROM mail_file WHERE boite = ? AND canal = 'gmail' AND etat = 'envoye' AND envoye_le >= ?`, email, depuis24),
      en_attente: compter(`SELECT COUNT(*) n FROM mail_file WHERE boite = ? AND etat IN ('a_valider', 'a_partir')`, email),
      ...sante({
        envoyes: compter(`SELECT COUNT(*) n FROM mail_file WHERE boite = ? AND canal = 'gmail' AND etat = 'envoye' AND envoye_le >= ?`, email, depuis30),
        rebonds: compter(`SELECT COUNT(*) n FROM mail_opposition o WHERE o.motif = 'rebond' AND o.le >= ? AND EXISTS (SELECT 1 FROM mail_file f WHERE f.email = o.email AND f.boite = ?)`, depuis30, email),
        plaintes: 0,
      }),
    };
  });
  const delivres = compter(`SELECT COUNT(*) n FROM mail_evenement WHERE type = 'delivre' AND le >= ?`, depuis30);
  const resend = {
    expediteur: EXPEDITEUR(), configure: resendConfigure(), delivres,
    ...sante({ envoyes: delivres, rebonds: compter(`SELECT COUNT(*) n FROM mail_evenement WHERE type = 'rebond' AND le >= ?`, depuis30), plaintes: compter(`SELECT COUNT(*) n FROM mail_evenement WHERE type = 'plainte' AND le >= ?`, depuis30) }),
  };
  return { boites, resend, plateforme: (process.env.EMAILING_FROM_PLATEFORME || '').trim() || EXPEDITEUR(), plafond_defaut: PLAFOND_DEFAUT };
}
