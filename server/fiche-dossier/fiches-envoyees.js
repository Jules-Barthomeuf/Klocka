// Les fiches qu'un agent nous a envoyées, sur sa fiche (24 nov. 2026, Jules : « il y a des agents qui nous ont envoyé
// des fiches mais leur fiche est vide ; ce serait trop long de remplir manuellement à chaque fois »).
//
// Ce qui est sûr, sans IA et sans OK : la Mémoire garde, pour chaque fiche reçue, l'agent lu dessus (nom, adresse,
// téléphone, agence). La fiche de l'agent va les chercher à chaque ouverture : par son adresse, sinon son téléphone,
// sinon son nom (avec la même agence quand les deux la disent). Une fiche supprimée de la Mémoire en sort d'elle-même ;
// rien n'est écrit, rien n'est à rattraper. Les fiches se comptent comme le record et les statistiques
// (record-memoire.js, `lignesFiches`) : même bien revenu par un autre envoi la même semaine compté une fois.
// Pur pour le rapprochement et le résumé ; `envoisDeLAgent` lit la base.

import db, { Records } from '../db.js';
import { ENTITE } from '../memoire/memoire.js';
import { lignesFiches } from '../memoire/record-memoire.js';
import { montant } from '../montants.js';

const ORIGINES = ['transfert', 'scraper', 'veille', 'whatsapp', 'dossier', 'drive'];
const min = (e) => String(e || '').trim().toLowerCase();
const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const mots = (t) => sansAccents(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((m) => m.length > 1);
// Le téléphone par ses neuf derniers chiffres : « +33 6 20 41 12 06 » et « 06 20 41 12 06 » sont le même.
const tel = (t) => { const c = String(t || '').replace(/\D/g, ''); return c.length >= 9 ? c.slice(-9) : null; };
const estEquipe = (e) => /@klocka\.immo$/.test(e);
// Les mots d'une agence qui ne la distinguent pas.
const VIDES = new Set(['immobilier', 'immo', 'agence', 'groupe', 'commerce', 'commerces', 'conseil', 'transaction', 'transactions', 'entreprise', 'entreprises', 'sas', 'sarl', 'the', 'les', 'des', 'and']);

/** Pure : ce qui reconnaît un agent : ses adresses, ses téléphones, son nom en mots triés, les mots de son agence. */
export function identiteAgent({ nom = null, emails = [], telephones = [], agence = null } = {}) {
  const m = mots(nom);
  return {
    emails: new Set(emails.map(min).filter((e) => e && !estEquipe(e))),
    telephones: new Set(telephones.map(tel).filter(Boolean)),
    nom: m.length >= 2 ? [...m].sort().join(' ') : null,
    agence: new Set(mots(agence).filter((x) => !VIDES.has(x))),
  };
}

/** Pure : ce bien de la Mémoire vient-il de cet agent ? `par` : comment on l'a reconnu, ou null. */
export function venuDe(b, id) {
  const ag = b?.agent || {};
  const e = min(b?.agent_email || ag.email);
  if (e && id.emails.has(e)) return 'adresse';
  const t = tel(ag.telephone);
  if (t && id.telephones.has(t)) return 'telephone';
  const m = mots(ag.nom);
  if (id.nom && m.length >= 2 && [...m].sort().join(' ') === id.nom) {
    // Le même nom : il faut que l'agence ne le contredise pas (deux « Sophie Martin » de deux agences).
    const a = mots(ag.agence).filter((x) => !VIDES.has(x));
    if (!a.length || !id.agence.size || a.some((x) => id.agence.has(x))) return 'nom';
  }
  return null;
}

const libelleBien = (b) => {
  const quoi = b.locataire_nom || b.locataire_activite || b.type_actif || 'Fiche';
  const ou = [b.adresse?.rue, b.ville || b.adresse?.ville].filter(Boolean).join(', ');
  return { titre: `${quoi.charAt(0).toUpperCase()}${quoi.slice(1)}`, ou: ou || null };
};

const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Pure : la phrase en tête : combien, d'où, quoi, la dernière, par qui elles nous sont venues le plus souvent. */
export function resumeDesEnvois(lignes = [], { prenomDe = (e) => e } = {}) {
  if (!lignes.length) return null;
  const compte = (cles) => { const m = new Map(); for (const k of cles.filter(Boolean)) m.set(k, (m.get(k) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  const villes = compte(lignes.map((l) => l.ville));
  const types = compte(lignes.map((l) => l.type));
  const via = compte(lignes.map((l) => l.qui).filter((q) => q && q !== 'personne'));
  const n = lignes.length;
  const phrase = [`${n} fiche${n > 1 ? 's' : ''} envoyée${n > 1 ? 's' : ''}`];
  if (villes.length) phrase.push(`${villes.slice(0, 4).map(([v, k]) => (k > 1 ? `${v} (${k})` : v)).join(', ')}${villes.length > 4 ? '…' : ''}`);
  const fin = [];
  if (types.length) fin.push(types.slice(0, 2).map(([t, k]) => (k > 1 && types.length > 1 ? `${t} (${k})` : t)).join(', '));
  fin.push(`la dernière le ${jourCourt(lignes[0].jour)}${via.length ? `, via ${prenomDe(via[0][0])}` : ''}`);
  return `${phrase.join(' : ')} ; ${fin.join(' ; ')}.`;
}

/** Pure : les fiches de l'agent, de la plus récente à la plus ancienne, et ses coordonnées lues dessus. */
export function fichesDeLAgent(biens = [], id, ctx = {}) {
  const siennes = biens.filter((b) => !b.supprime_le && venuDe(b, id));
  const comptees = new Map(lignesFiches(siennes, ctx).map((l) => [l.id, l]));
  const lignes = siennes.filter((b) => comptees.has(b.id)).map((b) => {
    const l = comptees.get(b.id);
    const { titre, ou } = libelleBien(b);
    return {
      id: b.id, jour: l.jour, qui: l.qui, titre, ou, ville: b.ville || b.adresse?.ville || null, type: b.type_actif || null,
      prix: montant(b.prix), loyer: b.loyer_annuel ? `${montant(b.loyer_annuel)} de loyer` : null,
      fiche: b.fiche?.url ? { url: b.fiche.url, nom: b.fiche.nom || null } : null, par: venuDe(b, id),
    };
  }).sort((a, b) => b.jour.localeCompare(a.jour));
  // Ses coordonnées, de la fiche la plus récente qui les dit.
  const recentes = [...siennes].sort((a, b) => String(b.recu_le || '').localeCompare(String(a.recu_le || '')));
  const lu = (f) => recentes.map((b) => f(b.agent || {}, b)).find(Boolean) || null;
  return {
    lignes,
    contact: { telephone: lu((a) => a.telephone), email: lu((a, b) => min(b.agent_email || a.email) || null), agence: lu((a) => a.agence) },
  };
}

/** L'agent derrière une clé de fiche : celui de la Prospection, ou celui que Twenty a lié (`twenty_id`). */
function agentDe(cle) {
  if (cle.startsWith('agent:')) return Records.get('AgentImmo', cle.slice(6));
  if (cle.startsWith('twenty:agentImmobilier:')) {
    const tid = cle.slice(23);
    return Records.findBy('AgentImmo', 'twenty_id', tid) || null;
  }
  return null;
}

/**
 * Les fiches reçues d'un agent, pour sa fiche : `{ lignes, resume, contact }`, ou null s'il n'en a envoyé aucune.
 * `nom` : le nom de la fiche, quand l'agent n'est connu que de Twenty.
 */
export function envoisDeLAgent(cle, { nom = null, prenomDe = (e) => e } = {}) {
  const a = agentDe(String(cle || ''));
  if (!a && !nom) return null;
  const id = identiteAgent({ nom: a?.nom_crm || a?.nom || nom, emails: a?.emails || [], telephones: a?.telephones || [], agence: a?.agence || null });
  if (!id.emails.size && !id.telephones.size && !id.nom) return null;
  const biens = db.prepare(`SELECT id, data FROM records WHERE entity = ? AND json_extract(data, '$.origine') IN (${ORIGINES.map(() => '?').join(',')}) AND json_extract(data, '$.supprime_le') IS NULL`)
    .all(ENTITE, ...ORIGINES).map((r) => ({ ...JSON.parse(r.data), id: r.id }));
  const candidats = biens.filter((b) => venuDe(b, id));
  if (!candidats.length) return null;
  const mails = new Map();
  for (const mid of new Set(candidats.map((b) => b.mail_recu_id).filter(Boolean))) { const m = Records.get('MailRecu', mid); if (m) mails.set(mid, m); }
  const deals = new Map();
  for (const did of new Set(candidats.map((b) => b.deal_id).filter(Boolean))) { const d = Records.findBy('Deal', 'deal_id', did); if (d) deals.set(did, d); }
  const { lignes, contact } = fichesDeLAgent(candidats, id, { mails, deals });
  if (!lignes.length) return null;
  // Les coordonnées de la plateforme d'abord ; celles des fiches comblent ce qui manque, et se disent « lues sur ses fiches ».
  const coord = {
    telephone: a?.telephones?.[0] || contact.telephone, email: a?.emails?.find((e) => !estEquipe(min(e))) || contact.email, agence: a?.agence || contact.agence,
  };
  const luesSurFiches = ['telephone', 'email', 'agence'].filter((k) => coord[k] && coord[k] === contact[k] && !(k === 'telephone' ? a?.telephones?.length : k === 'email' ? a?.emails?.length : a?.agence));
  return {
    lignes: lignes.slice(0, 40).map((l) => ({ ...l, qui: l.qui && l.qui !== 'personne' ? prenomDe(l.qui) : null })),
    total: lignes.length,
    resume: resumeDesEnvois(lignes, { prenomDe }),
    contact: { ...coord, lues_sur_fiches: luesSurFiches },
  };
}
