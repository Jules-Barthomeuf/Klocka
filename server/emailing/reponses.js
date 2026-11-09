// Les réponses aux mails du module (8 nov. 2026, Jules) : la veille des boîtes les range déjà dans MailRecu. On n'y garde
// que ce qui vient d'une personne à qui l'on a écrit, on en fait un fait, et la bonne personne est prévenue. La lecture
// (veut un call, a un bien, ne plus écrire) se fait par mots, sans IA : elle propose, un humain décide d'une opposition.

import db, { Records, Meta } from '../db.js';
import * as J from './journal.js';

export const REPONSE = 'EmailingReponse';
const CURSEUR = 'emailing:module_reponses_le';

const sansAccent = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Pure : ce que dit une réponse. */
export function lireReponse({ objet = '', texte = '' }) {
  const t = sansAccent(`${objet}\n${texte}`.slice(0, 1500));
  if (/absent|out of office|reponse automatique|message automatique|conges|de retour le/.test(t)) return 'absence';
  if (/desinscri|ne plus (me |nous )?(contacter|ecrire|recevoir|solliciter)|retire[rz].*(liste|adresse)|\bne veux plus\b|\bstop\b|ne m'ecrivez plus/.test(t)) return 'ne_plus_ecrire';
  if (/pas interesse|ne suis pas interesse|ne sommes pas interesses|aucun interet|ne souhaite pas/.test(t)) return 'pas_interesse';
  if (/rappel|appel(ez|er)|disponible|rendez-vous|\brdv\b|creneau|echanger|discuter/.test(t)) return 'veut_call';
  if (/fiche|mandat|\bbien\b|local|murs|ci-joint|en piece jointe|dossier/.test(t)) return 'a_un_bien';
  return 'autre';
}

const POSITIVES = new Set(['veut_call', 'a_un_bien']);

/** Relit les mails arrivés depuis le dernier passage. */
export async function lireReponses({ quand = new Date() } = {}) {
  const depuis = Meta.get(CURSEUR) || quand.toISOString();
  Meta.set(CURSEUR, quand.toISOString());
  const lignes = db.prepare(`SELECT id, data FROM records WHERE entity IN ('MailRecu', 'MailEcarte') AND created_date > ? ORDER BY created_date LIMIT 500`).all(depuis);
  let n = 0;
  for (const l of lignes) {
    let m;
    try { m = JSON.parse(l.data); } catch { continue; }
    const email = J.norm(m.de_email);
    if (!email || !J.aRecuQuelqueChose(email)) continue;
    const le = m.date || m.le || quand.toISOString();
    const lecture = lireReponse({ objet: m.objet, texte: m.texte || m.extrait || '' });
    const dernier = J.dernierEnvoiA(email);
    if (lecture === 'absence') { J.emettre('reponse_auto', { email, source: l.id, le, cle: `reponse:${l.id}` }); continue; }
    const c = J.contactParEmail(email);
    J.emettre('reponse', { email, contact_id: c?.id || null, source: l.id, charge: { objet: m.objet || '', lecture }, le, cle: `reponse:${l.id}` });
    if (POSITIVES.has(lecture)) J.emettre('reponse_positive', { email, contact_id: c?.id || null, source: l.id, charge: { lecture }, le, cle: `positive:${l.id}` });
    if (lecture === 'pas_interesse') J.emettre('desinteret', { email, contact_id: c?.id || null, source: l.id, le, cle: `desinteret:${l.id}` });
    if (dernier) J.majFile(dernier.id, { repondu_le: le });
    const pour = dernier?.boite || c?.suivi_par || null;
    Records.create(REPONSE, { email, contact_id: c?.id || null, nom: m.de || email, objet: m.objet || '', extrait: String(m.texte || m.extrait || '').slice(0, 2000), lecture, le, statut: 'a_traiter', pour, en_reponse_a: dernier?.objet || null, automatisation_id: dernier?.automatisation_id || null, mail_id: l.id });
    n += 1;
    if (dernier?.automatisation_id && !process.env.NODE_TEST_CONTEXT) {
      try { (await import('../notifications.js')).notifier({ pour, titre: `${m.de || email} a répondu`, texte: dernier.objet || null, lien: '/Emailing?p=reponses', cle: `module-reponse:${l.id}` }); } catch { /* la notification n'empêche rien */ }
    }
  }
  return n;
}

export function reponses({ statut = 'a_traiter', limite = 200 } = {}) {
  return Records.list(REPONSE).filter((r) => !statut || statut === 'toutes' || r.statut === statut)
    .sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, limite);
}

export const aTraiter = () => db.prepare(`SELECT COUNT(*) n FROM records WHERE entity = '${REPONSE}' AND json_extract(data, '$.statut') = 'a_traiter'`).get().n;

export function traiter(id, statut = 'traitee') {
  if (!Records.get(REPONSE, id)) return null;
  return { ok: true, reponse: Records.update(REPONSE, id, { statut: statut === 'a_traiter' ? 'a_traiter' : 'traitee' }) };
}

/** « Ne plus écrire », décidé par un humain depuis la réponse. */
export function nePlusEcrire(id, user) {
  const r = Records.get(REPONSE, id);
  if (!r) return null;
  J.poserOpposition(r.email, { motif: 'ne_plus_ecrire', source: 'reponse', par: user?.email || null });
  return { ok: true, reponse: Records.update(REPONSE, id, { statut: 'traitee' }) };
}
