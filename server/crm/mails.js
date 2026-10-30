// Envoyer un mail depuis Twenty CRM (29 oct. 2026, Jules) : un clic sur une adresse ouvre la fenêtre d'envoi de
// crm/twenty-front/klocka.js (modèles de Twenty CRM, objet, texte). Elle ne part pas du navigateur : la page crée un
// « Mail envoyé » (objet envoiMail, posé par scripts/crm/mails-twenty.mjs) au nom de la personne connectée, Twenty
// prévient Klocka par son webhook, et Klocka l'envoie depuis la boîte Gmail de cette personne (sendEmail, comme le
// mode appel). Twenty dit qui écrit (workspaceMemberId), ce que la page seule ne peut pas prouver.
// Le mail parti s'inscrit dans le fil de la fiche (commenter : Twenty CRM, et Monday en double).

import * as T0 from '../twenty.js';
import * as Mb from './membres.js';

let T = T0;
let envoyer = null;
let commenter = null;
/** Pour les tests : Twenty, l'envoi et le fil simulés. */
export function brancherPourTests({ twenty = null, envoi = null, fil = null } = {}) {
  if (!process.env.NODE_TEST_CONTEXT) return;
  T = twenty || T0;
  envoyer = envoi;
  commenter = fil;
}
const envoi = async (x) => (envoyer || (await import('../email.js')).sendEmail)(x);
const fil = async (id, texte) => (commenter || (await import('../monday.js')).commenter)(id, texte);

export const OBJET = { nameSingular: 'envoiMail', namePlural: 'envoisMail' };
const deja = new Set();

/** Le webhook de Twenty : un « Mail envoyé » créé par une personne part depuis sa boîte. */
export function depuisTwenty(ev) {
  if (ev?.eventName !== `${OBJET.nameSingular}.created`) return null;
  if (!ev.workspaceMemberId) return { ignore: 'écrit par Klocka' };
  const id = ev.record?.id;
  if (!id || deja.has(id)) return { ignore: 'déjà reçu' };
  deja.add(id);
  envoyerDepuisTwenty(id, ev.workspaceMemberId).catch((e) => console.error('[crm] mail :', e?.message || e));
  return { prevu: 'mail' };
}

/** Relit l'envoi (la vérité est dans Twenty, pas dans le webhook), l'envoie, puis note le résultat sur l'envoi. */
export async function envoyerDepuisTwenty(id, membreId) {
  const e = await T.lire(OBJET.namePlural, id);
  if (!e || e.statut !== 'A_ENVOYER') return { ignore: 'pas à envoyer' };
  const membre = (await Mb.membres()).find((m) => m.id === membreId);
  const owner = String(membre?.userEmail || '').toLowerCase();
  const fin = (valeurs) => T.modifier(OBJET.namePlural, id, valeurs);
  if (!owner) return fin({ statut: 'ERREUR', erreur: 'Expéditeur inconnu dans Twenty CRM' });
  const r = await envoi({ owner, to: e.a, subject: e.objet || '', body: e.corps || '', template_titre: e.modele || null, intention: 'sunday-crm' });
  if (!r?.success) return fin({ statut: 'ERREUR', erreur: String(r?.error || 'Envoi refusé').slice(0, 500), expediteur: owner });
  await fin({ statut: 'ENVOYE', expediteur: r.expediteur || owner });
  if (e.ficheId) {
    await fil(e.ficheId, `Mail envoyé à ${e.a} par ${owner} : ${e.objet || '(sans objet)'}\n\n${e.corps || ''}`).catch((x) => console.warn('[crm] mail, fil de la fiche :', x?.message || x));
  }
  return { envoye: true };
}
