// Les fiches commerciales, de l'arrivée à la signature : combien on en reçoit
// par semaine, et ce qu'elles deviennent. Le but de l'équipe est de battre
// son record de fiches par semaine ; cette page le mesure, elle ne sert pas
// à travailler.
//
// Une fiche, c'est un dossier né d'une fiche (mail, dépôt, chat), ou une
// fiche arrivée dans une boîte et pas encore préanalysée. Ses étapes :
//   reçue → Oui (la demande de documents est partie) → présentée (son
//   projet a un client) → aboutie (son projet est signé).
// Chaque fiche compte dans la semaine où elle est arrivée : on suit la
// cohorte, pas le calendrier des étapes. Le compte part de COMPTE_DEPUIS :
// l'équipe l'a remis à zéro le 25 septembre 2026, ce qui précède (essais,
// doublons, projets importés) ne compte plus.
//
// L'agent d'une fiche est celui qui l'a envoyée, jamais quelqu'un de
// l'équipe : une fiche transférée par Jules ou Paul prend l'expéditeur
// d'origine du mail transféré, et une correction à la main l'emporte.
//
// Tout est calculé ici, sur les listes de la base : pur, testé sans réseau.

import { statutDe } from './lifecycle.js';
import { porteUneFiche } from './fiches-auto.js';

const OUI = new Set(['documents_demandes', 'documents_recus', 'depouille', 'projet_cree']);
export const ETAPES = ['recue', 'oui', 'presente', 'abouti'];
export const LIBELLES_ETAPES = { recue: 'Reçue', non: 'Non', oui: 'Oui', presente: 'Présentée au client', abouti: 'Aboutie' };
export const COMPTE_DEPUIS = process.env.FICHES_DEPUIS || '2026-09-24T22:00:00.000Z';

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
  // Un projet créé sans client n'est qu'un Oui qui avance : il n'a pas d'étape à lui.
  if (projet || deal.projet_id || statut === 'projet_cree') return 'oui';
  const demandeEnvoyee = (deal.suivi || []).some((s) => s.intention === 'demande_documents');
  if (OUI.has(statut) || demandeEnvoyee) return 'oui';
  if (statut === 'abandonne') return 'non';
  return 'recue';
}

const rang = (etape) => (etape === 'non' ? 0 : Math.max(0, ETAPES.indexOf(etape)));

const ADRESSE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const nomSeul = (t) => String(t || '').replace(/<[^>]*>/, '').replace(/["']/g, '').trim() || null;

/**
 * Pure : l'expéditeur d'origine d'un mail transféré (« De : Laurent Sebban
 * <laurent@…> » sous « Message transféré »). Le premier qui n'est pas de
 * l'équipe, ou null.
 */
export function expediteurDOrigine(texte, estInterne = () => false) {
  const lignes = String(texte || '').split(/\r?\n/);
  for (const l of lignes) {
    const m = l.match(/^\s*>?\s*(?:\*\*)?(?:De|From|Exp[ée]diteur)\s*(?:\*\*)?\s*:\s*(.+)$/i);
    if (!m) continue;
    const email = (m[1].match(ADRESSE) || [])[0];
    if (!email || estInterne(email.toLowerCase())) continue;
    return { email: email.toLowerCase(), nom: nomSeul(m[1].replace(ADRESSE, '')) || null };
  }
  return null;
}

/**
 * Pure : l'agent d'une fiche. La correction à la main d'abord, puis
 * l'expéditeur s'il n'est pas de l'équipe, puis l'expéditeur d'origine d'un
 * transfert, puis le contact agent du dossier. Personne de l'équipe, jamais.
 */
export function agentDeLaFiche({ corrige = null, mail = null, contact = null }, estInterne = () => false) {
  if (corrige?.email || corrige?.nom) return { email: corrige.email || null, nom: corrige.nom || corrige.email, corrige: true };
  if (mail?.de_email && !mail.interne && !estInterne(String(mail.de_email).toLowerCase())) return { email: String(mail.de_email).toLowerCase(), nom: nomSeul(mail.de) || mail.de_email };
  const origine = mail ? expediteurDOrigine(mail.texte, estInterne) : null;
  if (origine) return { email: origine.email, nom: origine.nom || origine.email };
  if (contact && !estInterne(String(contact).toLowerCase())) return { email: String(contact).toLowerCase(), nom: contact };
  return null;
}

/**
 * Pure : toutes les fiches depuis la remise à zéro, les plus récentes
 * d'abord. Un dossier sans fiche (une coquille nommée à la main, jamais
 * analysée) n'en est pas une ; un mail déjà devenu dossier ne compte qu'une fois.
 */
export function listerFiches({ deals = [], mails = [], projets = [] } = {}, { depuis = COMPTE_DEPUIS, estInterne = () => false } = {}) {
  const projetsParDeal = new Map(projets.filter((p) => p.deal_id).map((p) => [p.deal_id, p]));
  const mailsParDeal = new Map(mails.filter((m) => m.deal_id).map((m) => [m.deal_id, m]));
  const fiches = [];
  for (const d of deals) {
    if (d.test || !(d.lots?.length || d.source)) continue;
    const mail = d.source_mail?.mail_recu_id ? mails.find((m) => m.id === d.source_mail.mail_recu_id) : mailsParDeal.get(d.deal_id);
    const ville = val(d.lots?.[0]?.lot?.adresse)?.ville || d.lots?.[0]?.enrichissement?.commune?.nom || null;
    const agent = agentDeLaFiche({ corrige: d.fiche_agent, mail, contact: d.contact_agent_email }, estInterne);
    fiches.push({
      id: d.deal_id,
      le: mail?.date || d.created_date || null,
      agent: agent?.nom || null,
      agent_email: agent?.email || null,
      agent_corrige: !!agent?.corrige,
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
    if (m.deal_id || !porteUneFiche(m)) continue;
    const agent = agentDeLaFiche({ corrige: m.fiche_agent, mail: m }, estInterne);
    // Un mail interne sans expéditeur d'origine n'est pas une fiche reçue : c'est un échange d'équipe.
    if (m.interne && !agent) continue;
    fiches.push({ id: `mail:${m.id}`, le: m.date || null, agent: agent?.nom || null, agent_email: agent?.email || null, agent_corrige: !!agent?.corrige, boite: m.compte || null, titre: m.objet || '(sans objet)', ville: null, verdict: null, etape: 'recue', deal_id: null, projet_id: null, a_preanalyser: true });
  }
  return fiches
    .filter((f) => !depuis || String(f.le || '') >= depuis)
    .sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')));
}

/**
 * Pure : les chiffres par semaine, de la plus ancienne à la plus récente,
 * sur `semaines` semaines finissant par celle de `maintenant`. Chaque fiche
 * compte dans la semaine de son arrivée ; une étape atteinte compte aussi
 * pour les étapes d'avant (une fiche présentée a eu son Oui).
 */
export function statsParSemaine(fiches, { semaines = 12, maintenant = new Date() } = {}) {
  const fin = semaineDe(maintenant);
  const liste = [];
  for (let i = semaines - 1; i >= 0; i--) {
    const d = new Date(`${fin}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    liste.push(d.toISOString().slice(0, 10));
  }
  const vide = () => ({ fiches: 0, oui: 0, presente: 0, abouti: 0 });
  const par = new Map(liste.map((s) => [s, vide()]));
  for (const f of fiches) {
    const s = par.get(semaineDe(f.le));
    if (!s) continue;
    s.fiches += 1;
    const r = rang(f.etape);
    if (r >= 1) s.oui += 1;
    if (r >= 2) s.presente += 1;
    if (r >= 3) s.abouti += 1;
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
