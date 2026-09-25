// Les fiches commerciales, de l'arrivée à la signature : combien on en reçoit
// par semaine, combien d'appels il faut pour en avoir une, et ce qu'elles
// deviennent. Le but de l'équipe est de battre son record de fiches par
// semaine ; cette page le mesure.
//
// Une fiche, c'est un dossier né d'une fiche (mail, dépôt, chat), ou une
// fiche arrivée dans une boîte et pas encore préanalysée. Ses étapes :
//   reçue → Oui (la demande de documents est partie) → projet créé →
//   présenté (le projet a un client) → abouti (le projet est signé).
// Chaque fiche compte dans la semaine où elle est arrivée : on suit la
// cohorte, pas le calendrier des étapes.
//
// Tout est calculé ici, sur les listes de la base : pur, testé sans réseau.

import { statutDe } from './lifecycle.js';
import { porteUneFiche } from './fiches-auto.js';

const OUI = new Set(['documents_demandes', 'documents_recus', 'depouille', 'projet_cree']);
export const ETAPES = ['recue', 'oui', 'projet', 'presente', 'abouti'];
export const LIBELLES_ETAPES = { recue: 'Reçue', non: 'Non', oui: 'Oui', projet: 'Projet créé', presente: 'Présentée au client', abouti: 'Aboutie' };
export const RESULTATS_APPEL = ['pas_de_reponse', 'a_rappeler', 'interesse', 'fiche_promise', 'pas_interesse'];

const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);

/** Pure : le lundi (UTC) de la semaine d'une date, en AAAA-MM-JJ. */
export function semaineDe(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const lundi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return lundi.toISOString().slice(0, 10);
}

/** Pure : la dernière étape atteinte par un dossier. */
export function etapeDuDossier(deal, projetsParDeal = new Map()) {
  const statut = statutDe(deal);
  const projet = projetsParDeal.get(deal.deal_id) || null;
  if (projet?.statut === 'signe') return 'abouti';
  if (projet && (projet.client_email || (projet.client_emails || []).length)) return 'presente';
  if (projet || deal.projet_id || statut === 'projet_cree') return 'projet';
  const demandeEnvoyee = (deal.suivi || []).some((s) => s.intention === 'demande_documents');
  if (OUI.has(statut) || demandeEnvoyee) return 'oui';
  if (statut === 'abandonne') return 'non';
  return 'recue';
}

const rang = (etape) => (etape === 'non' ? 0 : Math.max(0, ETAPES.indexOf(etape)));

/**
 * Pure : toutes les fiches, les plus récentes d'abord. Un dossier sans fiche
 * (une coquille nommée à la main, jamais analysée) n'en est pas une ; un mail
 * déjà devenu dossier ne compte qu'une fois.
 */
export function listerFiches({ deals = [], mails = [], projets = [] } = {}) {
  const projetsParDeal = new Map(projets.filter((p) => p.deal_id).map((p) => [p.deal_id, p]));
  const mailsParDeal = new Map(mails.filter((m) => m.deal_id).map((m) => [m.deal_id, m]));
  const fiches = [];
  for (const d of deals) {
    if (d.test || !(d.lots?.length || d.source)) continue;
    const mail = d.source_mail?.mail_recu_id ? mails.find((m) => m.id === d.source_mail.mail_recu_id) : mailsParDeal.get(d.deal_id);
    const ville = val(d.lots?.[0]?.lot?.adresse)?.ville || d.lots?.[0]?.enrichissement?.commune?.nom || null;
    fiches.push({
      id: d.deal_id,
      le: mail?.date || d.created_date || null,
      agent: mail?.de || d.contact_agent_email || null,
      agent_email: (mail?.de_email || d.contact_agent_email || '').toLowerCase() || null,
      boite: mail?.compte || null,
      titre: d.nom || d.lots?.[0]?.synthese?.titre || d.source?.nom_fichier || 'Dossier',
      ville,
      verdict: d.lots?.[0]?.evaluation?.verdict || null,
      etape: etapeDuDossier(d, projetsParDeal),
      deal_id: d.deal_id,
      projet_id: projetsParDeal.get(d.deal_id)?.id || d.projet_id || null,
    });
  }
  for (const m of mails) {
    if (m.deal_id || m.interne || !porteUneFiche(m)) continue;
    fiches.push({ id: `mail:${m.id}`, le: m.date || null, agent: m.de || m.de_email, agent_email: (m.de_email || '').toLowerCase() || null, boite: m.compte || null, titre: m.objet || '(sans objet)', ville: null, verdict: null, etape: 'recue', deal_id: null, projet_id: null, a_preanalyser: true });
  }
  return fiches.sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')));
}

/**
 * Pure : les chiffres par semaine, de la plus ancienne à la plus récente,
 * sur `semaines` semaines finissant par celle de `maintenant`. Chaque fiche
 * compte dans la semaine de son arrivée ; une étape atteinte compte aussi
 * pour les étapes d'avant (une fiche présentée a eu son Oui).
 */
export function statsParSemaine(fiches, appels = [], { semaines = 12, maintenant = new Date() } = {}) {
  const fin = semaineDe(maintenant);
  const liste = [];
  for (let i = semaines - 1; i >= 0; i--) {
    const d = new Date(`${fin}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    liste.push(d.toISOString().slice(0, 10));
  }
  const vide = () => ({ fiches: 0, oui: 0, projet: 0, presente: 0, abouti: 0, appels: 0, appels_fiche: 0 });
  const par = new Map(liste.map((s) => [s, vide()]));
  for (const f of fiches) {
    const s = par.get(semaineDe(f.le));
    if (!s) continue;
    s.fiches += 1;
    const r = rang(f.etape);
    if (r >= 1) s.oui += 1;
    if (r >= 2) s.projet += 1;
    if (r >= 3) s.presente += 1;
    if (r >= 4) s.abouti += 1;
  }
  for (const a of appels) {
    const s = par.get(semaineDe(a.le));
    if (!s) continue;
    s.appels += 1;
    if (a.resultat === 'fiche_promise') s.appels_fiche += 1;
  }
  return liste.map((semaine) => ({ semaine, ...par.get(semaine) }));
}

/** Pure : le record de fiches en une semaine, sur toute l'histoire. */
export function recordDeFiches(fiches) {
  const par = new Map();
  for (const f of fiches) {
    const s = semaineDe(f.le);
    if (s) par.set(s, (par.get(s) || 0) + 1);
  }
  let record = { semaine: null, fiches: 0 };
  for (const [semaine, n] of par) if (n > record.fiches || (n === record.fiches && semaine > (record.semaine || ''))) record = { semaine, fiches: n };
  return record;
}

/** Pure : les agents qui apportent, sur la période : fiches, Oui, et leur part. */
export function agentsDeLaPeriode(fiches, { depuis = null } = {}) {
  const par = new Map();
  for (const f of fiches) {
    if (!f.agent_email || (depuis && String(f.le || '') < depuis)) continue;
    const a = par.get(f.agent_email) || { email: f.agent_email, nom: String(f.agent || '').replace(/<[^>]*>/, '').replace(/["']/g, '').trim() || f.agent_email, fiches: 0, oui: 0 };
    a.fiches += 1;
    if (rang(f.etape) >= 1) a.oui += 1;
    par.set(f.agent_email, a);
  }
  return [...par.values()].sort((x, y) => y.oui - x.oui || y.fiches - x.fiches).slice(0, 15);
}
