// La page Relances (spec du 8 oct. 2026) : une seule liste partagée par toute
// l'équipe, de tout ce qu'il faut rappeler, chaque ligne avec son motif ; un
// clic la prend (« Pris par », personne d'autre ne peut l'ouvrir) et ouvre le
// mode appel de la Prospection sur cet agent. Au-dessus, le tableau de bord :
// le total, les motifs, les mails de relance à valider, l'activité, le pilotage.
//
// Les motifs, dans l'ordre d'urgence :
//   Bien retenu, Bien refusé : un bien de l'agent a été jugé (dossier passé
//     en Oui, ou abandonné) et l'agent ne le sait pas encore de notre bouche ;
//   Engagement : une échéance qu'il a donnée, un mandat annoncé, une date
//     choisie, une réponse à lire ;
//   Fiche non reçue : il a un bien, la fiche n'est pas arrivée ;
//   Point mensuel : le point régulier avec un agent qui n'a pas de bien ;
//   Retenter : il n'a pas décroché.
// La date vient de la fiche du carnet (`prochaine`, posée par l'issue de
// l'appel), de la colonne Relance d'une ligne Monday sûre, d'un envoi depuis
// la Prospection (`en_relance`), ou du jour du verdict d'un bien.

import { Records } from '../db.js';
import * as R from './regles.js';
import { annoter, statutDeLAgence, recherchesDeLaZone, departementDe, elementDeFile, numeroDe, remiseEnProspection } from './mode-appel.js';
import { prenomDe, EQUIPE } from './equipe.js';
import { majAgent, journal } from './carnet.js';
import { mailSansReponse, prenomDeLAgent } from './mails.js';

const AGENCE = 'AgenceProspect';
const LISTE = 'ListeAgences';
const APPEL = 'AppelAgent';
const SESSION = 'SessionAppel';
const MAIL = 'ProspectionMail';

export const MOTIFS = {
  bien_retenu: 'Bien retenu',
  bien_refuse: 'Bien refusé',
  engagement: 'Engagement',
  fiche_non_recue: 'Fiche non reçue',
  point_mensuel: 'Point mensuel',
  retenter: 'Retenter',
};
const RANG_MOTIF = Object.fromEntries(Object.keys(MOTIFS).map((k, i) => [k, i]));
const SANS_REPONSE = ['pas_de_reponse', 'repondeur'];
const ENGAGEMENT = /(mandat|échéance qu'il a donnée|comme convenu|il a répondu|suite de notre échange)/i;
const OUI = new Set(['documents_demandes', 'documents_recus', 'depouille', 'projet_cree']);
/** Un bien jugé il y a plus longtemps ne fait plus une relance « Bien retenu / refusé ». */
export const BIENS_JOURS = 30;
/** Une ligne prise se libère seule après quinze minutes sans activité. */
export const PRISE_MS = 15 * 60 * 1000;

const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);
const jourDeIso = (iso) => (iso ? R.jourDe(new Date(iso)) : null);
const initiales = (email) => {
  const p = prenomDe(email) || '';
  const nom = String(email || '').split('@')[0].split(/[._-]/)[1] || '';
  return `${p.charAt(0)}${nom.charAt(0)}`.toUpperCase() || '?';
};

// ---------------------------------------------------------------------------
// Les biens d'un agent : ce qu'on en a pensé, et s'il le sait
// ---------------------------------------------------------------------------

/** Pure : un bien d'agent, d'après sa fiche (listerFiches) et son dossier. */
export function bienDe(f, deal = null, prevenus = []) {
  const suivi = deal?.suivi || [];
  const dec = deal?.decision || null;
  let verdict = 'en_cours';
  let le = null;
  let raison = null;
  if (['oui', 'presente', 'abouti'].includes(f.etape)) {
    verdict = 'retenu';
    le = (dec?.decision === 'oui' && dec.le) || suivi.find((s) => OUI.has(s.vers) || s.intention === 'demande_documents')?.le || null;
  } else if (f.etape === 'non') {
    verdict = 'refuse';
    const s = [...suivi].reverse().find((x) => x.vers === 'abandonne');
    le = (dec?.decision === 'non' && dec.le) || s?.le || null;
    const motifs = (deal?.lots?.[0]?.evaluation?.motifs || []).map((m) => (typeof m === 'string' ? m : m?.texte || m?.libelle || '')).filter(Boolean);
    raison = dec?.raison || (s?.detail ? String(s.detail).replace(/^Non\s*:\s*/i, '') : null) || motifs.slice(0, 2).join(' ; ') || null;
  }
  const ad = val(deal?.lots?.[0]?.lot?.adresse) || {};
  const adresse = [ad.rue, ad.code_postal, ad.ville || f.ville].filter(Boolean).join(' ') || f.ville || null;
  return { deal_id: f.deal_id || null, titre: f.titre, adresse, recue: true, recue_le: f.le || null, verdict, verdict_le: jourDeIso(le), raison, prevenu: !!f.deal_id && prevenus.includes(f.deal_id) };
}

/** Pure : les biens à annoncer à l'agent : jugés depuis moins de BIENS_JOURS, et qu'il ne sait pas encore. */
export function biensAJuger(biens, jour) {
  const depuis = R.plusJours(jour, -BIENS_JOURS);
  return biens.filter((b) => ['retenu', 'refuse'].includes(b.verdict) && !b.prevenu && b.verdict_le && b.verdict_le >= depuis);
}

let cacheBiens = { le: 0, valeur: null };
/** Les biens de chaque agent du carnet (par son mail), les plus récents d'abord. Relu au plus une fois par minute. */
export async function biensDesAgents({ frais = false } = {}) {
  if (!frais && cacheBiens.valeur && Date.now() - cacheBiens.le < 60_000) return cacheBiens.valeur;
  const { fiches } = await import('./index.js');
  let liste = [];
  try { liste = await fiches(); } catch { liste = []; }
  const deals = new Map(Records.list('Deal').map((d) => [d.deal_id, d]));
  const parEmail = new Map();
  for (const a of Records.list('AgentImmo')) if (!a.essai) for (const e of a.emails || []) parEmail.set(e, a);
  const out = new Map();
  for (const f of liste) {
    const a = f.agent_email ? parEmail.get(String(f.agent_email).toLowerCase()) : null;
    if (!a) continue;
    if (!out.has(a.id)) out.set(a.id, []);
    out.get(a.id).push(bienDe(f, f.deal_id ? deals.get(f.deal_id) : null, a.prevenus || []));
  }
  cacheBiens = { le: Date.now(), valeur: out };
  return out;
}

// ---------------------------------------------------------------------------
// Le motif, la date, la phrase à dire
// ---------------------------------------------------------------------------

/** Pure : le motif d'une relance. */
export function motifDe({ fiche = null, statut = {}, aJuger = [] } = {}) {
  if (aJuger.some((b) => b.verdict === 'retenu')) return 'bien_retenu';
  if (aJuger.some((b) => b.verdict === 'refuse')) return 'bien_refuse';
  const p = fiche?.prochaine || null;
  if (p?.si_fiche) return 'fiche_non_recue';
  if (p && (ENGAGEMENT.test(p.quoi || '') || p.date_choisie)) return 'engagement';
  if (SANS_REPONSE.includes(statut.derniere_issue) && fiche?.statut !== 'pause') return 'retenter';
  return 'point_mensuel';
}

/** Pure : ce qu'on dit en ouvrant l'appel. */
const jourCourtFr = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

/** Pure : « Vous l'avez appelé le 7 octobre (Nora) et le 9 octobre (Jules), sans réponse. » d'après les appels sans réponse depuis le dernier vrai échange. */
export function phraseRetenter(appels = [], { moment = null, monday = null } = {}) {
  const tries = [...appels].sort((x, y) => String(y.le).localeCompare(String(x.le)));
  const sans = [];
  for (const x of tries) { if (!SANS_REPONSE.includes(x.issue)) break; sans.push(x); }
  if (!sans.length) {
    // Rien depuis la plateforme : ce que dit Monday, pour savoir d'où l'on part.
    if (monday?.statut) {
      const quand = monday.date && /^\d{4}-\d{2}-\d{2}/.test(String(monday.date)) ? ` le ${jourCourtFr(`${String(monday.date).slice(0, 10)}T12:00:00Z`)}` : '';
      return `Dans Monday, sa ligne dit « ${monday.statut} »${quand}${monday.qui ? ` (${(() => { const x = String(prenomDe(monday.qui) || monday.qui); return x.charAt(0).toUpperCase() + x.slice(1); })()})` : ''}. Personne ne l'a encore eu au téléphone depuis : il faut le rappeler${moment ? `, plutôt ${moment}` : ''}.`;
    }
    return `Il n'a pas décroché la dernière fois : rappelez-le${moment ? `, plutôt ${moment}` : ''}.`;
  }
  const dates = sans.reverse().map((x) => `le ${jourCourtFr(x.le)}${x.par ? ` (${prenomDe(x.par)})` : ''}`);
  const liste = dates.length > 1 ? `${dates.slice(0, -1).join(', ')} et ${dates[dates.length - 1]}` : dates[0];
  const message = sans.some((x) => x.issue === 'repondeur') ? ' Un message a été laissé sur son répondeur.' : '';
  return `Vous l'avez déjà appelé ${sans.length > 1 ? `${sans.length} fois, ` : ''}${liste}, sans réponse.${message} Il faut le rappeler${moment ? `, plutôt ${moment}` : ''}.`;
}

export function phraseDe(motif, { bien = null, fiche = null, statut = {}, recherche = null, appels = null, monday = null } = {}) {
  const p = fiche?.prochaine || null;
  if (motif === 'bien_retenu') return `Bien retenu : ${bien?.titre || 'son bien'}${bien?.adresse ? ` (${bien.adresse})` : ''}. On le retient : la suite, ce sont les documents.`;
  if (motif === 'bien_refuse') return `Bien refusé : ${bien?.titre || 'son bien'}${bien?.raison ? `. Raison : ${bien.raison}` : ''}.`;
  if (motif === 'engagement') return `Engagement : ${p?.quoi || 'ce qui a été convenu'}.`;
  if (motif === 'fiche_non_recue') return `Fiche non reçue : il devait nous envoyer la fiche${bien?.titre ? ` de ${bien.titre}` : ''}.`;
  if (motif === 'retenter') {
    // Une phrase claire pour toute l'équipe (8 oct. 2026) : qui l'a appelé, quand, et ce qu'il faut faire.
    if (appels) return phraseRetenter(appels, { moment: p?.moment || null, monday });
    const n = Math.max(2, (statut.tentatives || fiche?.tentatives || 0) + 1);
    return `Retenter : ${n}e essai${p?.moment ? `, plutôt ${p.moment}` : ''}.`;
  }
  return recherche ? `Point mensuel : nouveau client qui cherche ${recherche.replace(/^murs/, 'des murs')}.` : 'Point mensuel : a-t-il rentré des murs ?';
}

/** Pure : le groupe d'une échéance. Sans date, la relance est à faire aujourd'hui. */
export function groupeDe(le, jour) {
  if (!le || le === jour) return 'aujourdhui';
  return le < jour ? 'retard' : 'a_venir';
}

/** Pure : l'ordre de la liste : le motif le plus urgent, puis la plus ancienne. */
export function ordreDesRelances(lignes) {
  return [...lignes].sort((x, y) => RANG_MOTIF[x.motif.cle] - RANG_MOTIF[y.motif.cle]
    || String(x.le || '9').localeCompare(String(y.le || '9'))
    || String(x.agence || x.nom).localeCompare(String(y.agence || y.nom), 'fr'));
}

/**
 * Pure : la relance d'un agent (sa ligne d'agence s'il en a une, sa fiche du
 * carnet sinon), ou null. Jamais : les mortes, « Ne plus appeler », les
 * archivés, les noms d'annonces, sans numéro.
 */
export function relanceDe({ agence = null, fiche = null, statut = {}, aJuger = [], jour }) {
  // Retirée des relances à la main, ou renvoyée en prospection (8 oct. 2026) : plus de ligne, jusqu'au prochain appel.
  const retiree = (x) => !!x?.hors_relances?.le && !(statut.quand && String(statut.quand) > x.hors_relances.le);
  if (retiree(agence) || retiree(fiche) || (agence && remiseEnProspection({ ...agence, statut }))) return null;
  if (statut.etat === 'morte' || agence?.ne_plus_appeler || fiche?.ne_plus_appeler || fiche?.statut === 'archive' || agence?.genre === 'annonceur' || agence?.hors_cible) return null;
  const telephone = agence ? numeroDe(agence) : (fiche?.telephones || [])[0] || null;
  if (!telephone) return null;
  const mc = agence?.monday_connu;
  const mondaySur = mc?.confiance === 'sure' || ['téléphone', 'mail', 'un de ses agents'].includes(mc?.par);
  const motif = motifDe({ fiche, statut, aJuger });
  const bienLe = aJuger.length ? aJuger.map((b) => b.verdict_le).sort()[0] : null;
  const le = (motif === 'bien_retenu' || motif === 'bien_refuse') ? bienLe
    : fiche?.prochaine?.le || (mondaySur ? statut.relance_le : null) || agence?.en_relance?.le || null;
  if (!aJuger.length && !statut.appelee && !le) return null;
  return { motif, le, telephone };
}

// ---------------------------------------------------------------------------
// « Pris par » : une ligne ouverte par une seule personne à la fois
// ---------------------------------------------------------------------------

// Tenu en mémoire pour répondre en quelques millisecondes à toute l'équipe
// (la colonne se relit toutes les secondes et demie), et recopié sur
// l'agence pour survivre à un redémarrage du serveur.
const PRISES = new Map(); // clé de la ligne → { par, depuis, vu, agences: [id] }
let prisesChargees = false;

/** La clé d'une ligne : l'agent du carnet, sinon l'agence. */
export const cleDe = (agence) => agence.carnet_id || `ag:${agence.id}`;
export const priseValide = (p, maintenantD = new Date()) => !!p?.par && maintenantD.getTime() - Date.parse(p.vu || 0) < PRISE_MS;

function chargerPrises() {
  if (prisesChargees) return;
  prisesChargees = true;
  for (const a of Records.list(AGENCE)) {
    if (!a.prise?.par) continue;
    const cle = cleDe(a);
    const x = PRISES.get(cle) || { ...a.prise, agences: [] };
    x.agences.push(a.id);
    PRISES.set(cle, x);
  }
}

// Change à chaque appel validé : la liste des autres écrans se relit aussitôt (« en temps réel »).
let VERSION = 0;
export const version = () => VERSION;

/** Libérer une ligne quel que soit qui la tient : un rappel entrant passe devant une relance prise. */
export function liberer(cle) {
  chargerPrises();
  const p = PRISES.get(cle);
  if (p) poserPrise(cle, null, p.agences);
  VERSION += 1;
}

/** Pour les tests : repartir de la base. */
export function oublierPrises() { PRISES.clear(); prisesChargees = false; cacheBiens = { le: 0, valeur: null }; }

function poserPrise(cle, prise, agenceIds) {
  if (prise) PRISES.set(cle, { ...prise, agences: agenceIds }); else PRISES.delete(cle);
  for (const id of agenceIds) if (Records.get(AGENCE, id)) Records.update(AGENCE, id, { prise: prise ? { par: prise.par, depuis: prise.depuis, vu: prise.vu } : null });
}

/** Les lignes prises en ce moment : clé → qui (prénom, initiales). */
export function prises(maintenantD = new Date()) {
  chargerPrises();
  const out = {};
  for (const [cle, p] of PRISES) {
    if (!priseValide(p, maintenantD)) continue;
    out[cle] = { par: p.par, prenom: prenomDe(p.par), initiales: initiales(p.par), depuis: p.depuis };
  }
  return out;
}

const agencesDeLaCle = (cle) => (String(cle).startsWith('ag:') ? [Records.get(AGENCE, String(cle).slice(3))].filter(Boolean) : Records.list(AGENCE).filter((a) => a.carnet_id === cle));

/**
 * Prendre une ligne. Une seule personne à la fois : si un collègue la tient
 * (et s'en sert depuis moins de quinze minutes), refus avec son prénom. Un
 * agent du carnet sans ligne d'agence en reçoit une, hors des listes de
 * villes, pour que le mode appel puisse l'ouvrir. On ne tient qu'une ligne :
 * prendre la suivante lâche la précédente.
 */
export function prendre(cle, user, { maintenantD = new Date() } = {}) {
  chargerPrises();
  const moi = String(user?.email || '').toLowerCase();
  if (!moi || !cle) return { ok: false, error: 'Ligne introuvable.' };
  const p = PRISES.get(cle);
  if (priseValide(p, maintenantD) && p.par !== moi) return { ok: false, prise_par: prenomDe(p.par), error: `${prenomDe(p.par)} vient de la prendre.` };
  let agences = agencesDeLaCle(cle);
  if (!agences.length) {
    const f = Records.get('AgentImmo', cle);
    if (!f || f.essai) return { ok: false, error: 'Ligne introuvable.' };
    agences = [Records.create(AGENCE, {
      liste_id: null, hors_liste: true, nom: f.agence || f.nom, telephone: (f.telephones || [])[0] || null, email: (f.emails || [])[0] || null,
      adresse: f.adresse || null, ville: f.ville || null, carnet_id: f.id, sources: ['Carnet'], cree_pour: 'relances', cree_le: maintenantD.toISOString(),
    })];
  }
  for (const [autre, x] of [...PRISES]) if (autre !== cle && x.par === moi) poserPrise(autre, null, x.agences);
  const t = maintenantD.toISOString();
  poserPrise(cle, { par: moi, depuis: p?.par === moi && priseValide(p, maintenantD) ? p.depuis : t, vu: t }, agences.map((a) => a.id));
  // L'agence d'une liste de ville d'abord : c'est elle que la Prospection connaît.
  const choisie = agences.find((a) => a.liste_id) || agences[0];
  return { ok: true, agence_id: choisie.id, cle };
}

/** L'analyste est toujours là : la ligne reste à lui quinze minutes de plus. Rend `perdue` si un collègue l'a prise entre-temps. */
export function garder(cle, user, { maintenantD = new Date() } = {}) {
  chargerPrises();
  const moi = String(user?.email || '').toLowerCase();
  const p = PRISES.get(cle);
  if (p && p.par !== moi && priseValide(p, maintenantD)) return { ok: false, perdue: true, prise_par: prenomDe(p.par) };
  const agences = p?.par === moi ? p.agences : agencesDeLaCle(cle).map((a) => a.id);
  if (!agences.length) return { ok: false, error: 'Ligne introuvable.' };
  const t = maintenantD.toISOString();
  // En mémoire seulement : la base garde la prise, l'heure exacte n'y sert qu'après un redémarrage.
  PRISES.set(cle, { par: moi, depuis: p?.par === moi ? p.depuis : t, vu: t, agences });
  return { ok: true };
}

/** Quitter sans appeler : la ligne se libère tout de suite. */
export function lacher(cle, user) {
  chargerPrises();
  const moi = String(user?.email || '').toLowerCase();
  const p = PRISES.get(cle);
  if (p && p.par === moi) poserPrise(cle, null, p.agences);
  return { ok: true };
}

/**
 * Après la validation d'un appel (mode appel) : un agent joint sait ce qu'on
 * pense de ses biens jugés (ils ne font plus de relance), et la ligne se
 * libère. « Annuler » remet la fiche comme avant, ses biens à annoncer compris.
 */
export async function apresAppel({ agent_id, agence_id = null, issue, user, maintenantD = new Date() }) {
  VERSION += 1;
  const ag = agence_id ? Records.get(AGENCE, agence_id) : null;
  const cle = agent_id || (ag ? cleDe(ag) : null);
  if (cle) lacher(cle, user);
  if (ag && cleDe(ag) !== cle) lacher(cleDe(ag), user);
  if (!agent_id || SANS_REPONSE.includes(issue)) return;
  const f = Records.get('AgentImmo', agent_id);
  if (!f) return;
  const biens = (await biensDesAgents({ frais: true })).get(agent_id) || [];
  const aJuger = biensAJuger(biens, R.jourDe(maintenantD));
  if (!aJuger.length) return;
  majAgent(agent_id, { prevenus: [...new Set([...(f.prevenus || []), ...aJuger.map((b) => b.deal_id).filter(Boolean)])] });
  journal(agent_id, { type: 'note', texte: `Prévenu : ${aJuger.map((b) => `${b.titre} ${b.verdict === 'retenu' ? 'retenu' : 'refusé'}`).join(', ')}`, par: user?.email || null });
  cacheBiens = { le: 0, valeur: null };
}

// ---------------------------------------------------------------------------
// Les mails de relance préparés : rien ne part sans un clic
// ---------------------------------------------------------------------------

/** Pure : le mail quand la fiche promise n'est pas arrivée à J+3. */
export function mailFicheNonRecue(a, bien = null) {
  const p = prenomDeLAgent(a?.nom);
  return {
    objet: 'La fiche du bien dont nous avons parlé',
    corps: [`Bonjour${p ? ` ${p}` : ''},`, '', `Je reviens vers vous au sujet ${bien ? `de ${bien}` : 'du bien dont nous avons parlé au téléphone'} : pourriez-vous nous envoyer sa fiche commerciale (adresse, prix, loyer et bail) ?`, '', 'Nous vous répondons rapidement, oui ou non.', '', 'Bien à vous,', '{signature}'].join('\n'),
  };
}

/**
 * Prépare les mails de relance dus, une fois chacun (clé) : la fiche non
 * reçue à l'échéance de son rappel, et le mail après trois appels sans
 * réponse. Ils attendent dans « Mails à valider ».
 */
export function preparerMails(fiches, jour, dernierBien = new Map()) {
  const existants = new Set(Records.list(MAIL).map((m) => m.cle).filter(Boolean));
  let n = 0;
  for (const f of fiches) {
    const p = f.prochaine;
    const a = (f.emails || [])[0];
    if (!p?.le || p.le > jour || !a || f.ne_plus_appeler || f.statut === 'archive') continue;
    let genre = null;
    let mail = null;
    if (p.si_fiche) { genre = 'fiche_non_recue'; mail = mailFicheNonRecue(f, dernierBien.get(f.id) || null); }
    else if (f.statut === 'pause' && /sans réponse/.test(p.quoi || '')) { genre = 'sans_reponse'; mail = mailSansReponse(f); }
    if (!genre) continue;
    const cle = `${genre}:${f.id}:${p.le}`;
    if (existants.has(cle)) continue;
    Records.create(MAIL, { etat: 'pret', cree_le: new Date().toISOString(), genre: 'relance', sous_genre: genre, cle, agent_id: f.id, nom: f.nom, agence: f.agence || null, a, ...mail });
    n += 1;
  }
  return n;
}

/** Les mails de relance qui attendent un clic. */
export const mailsAValider = () => Records.list(MAIL)
  .filter((m) => !m.essai && m.etat === 'pret' && m.genre === 'relance' && ['fiche_non_recue', 'sans_reponse'].includes(m.sous_genre))
  .sort((x, y) => String(x.cree_le).localeCompare(String(y.cree_le)))
  .map((m) => ({ id: m.id, motif: m.sous_genre === 'fiche_non_recue' ? 'Fiche non reçue' : '3 appels sans réponse', nom: m.nom, agence: m.agence, a: m.a, objet: m.objet, corps: m.corps, cree_le: m.cree_le }));

// ---------------------------------------------------------------------------
// L'activité et le pilotage
// ---------------------------------------------------------------------------

/** Pure : le lundi de la semaine d'un jour (AAAA-MM-JJ). */
const lundiDe = (jour) => R.plusJours(jour, -((new Date(`${jour}T12:00:00Z`).getUTCDay() + 6) % 7));

/** Pure : appels du jour et de la semaine par analyste et pour l'équipe, les issues de la semaine, les fiches reçues. */
export function activite({ appels = [], fiches = [], jour }) {
  const lundi = lundiDe(jour);
  const semaine = appels.filter((x) => jourDeIso(x.le) >= lundi && jourDeIso(x.le) <= jour);
  const parAnalyste = new Map(EQUIPE.map((m) => [m.email, { email: m.email, prenom: m.prenom, jour: 0, semaine: 0 }]));
  for (const x of semaine) {
    const e = String(x.par || '').toLowerCase();
    if (!parAnalyste.has(e)) parAnalyste.set(e, { email: e, prenom: prenomDe(e), jour: 0, semaine: 0 });
    const s = parAnalyste.get(e);
    s.semaine += 1;
    if (jourDeIso(x.le) === jour) s.jour += 1;
  }
  const issues = {};
  for (const x of semaine) issues[x.issue] = (issues[x.issue] || 0) + 1;
  return {
    analystes: [...parAnalyste.values()].sort((x, y) => y.semaine - x.semaine || x.prenom.localeCompare(y.prenom, 'fr')),
    equipe: { jour: semaine.filter((x) => jourDeIso(x.le) === jour).length, semaine: semaine.length },
    issues: Object.entries(issues).map(([cle, n]) => ({ cle, libelle: R.ISSUES[cle] || cle, n })).sort((x, y) => y.n - x.n),
    fiches_recues: { jour: fiches.filter((f) => jourDeIso(f.le) === jour).length, semaine: fiches.filter((f) => jourDeIso(f.le) >= lundi && jourDeIso(f.le) <= jour).length },
  };
}

/**
 * Pure : le pilotage. Contactés : les agents suivis (statut au-delà de « À
 * appeler », ni archivés ni « Ne plus appeler ») joints dans les trente
 * derniers jours : un appel abouti, un mail envoyé, ou une fiche reçue.
 */
export function pilotage({ agents = [], appels = [], fiches = [], retard = 0, jour }) {
  const depuis = R.plusJours(jour, -30);
  const aboutis = new Map();
  for (const x of appels) if (!SANS_REPONSE.includes(x.issue)) aboutis.set(x.agent_id, Math.max(aboutis.get(x.agent_id) || 0, Date.parse(x.le) || 0));
  const suivis = agents.filter((a) => !a.essai && !a.ne_plus_appeler && !['nouveau', 'archive'].includes(a.statut || 'nouveau'));
  const joints = suivis.filter((a) => [aboutis.get(a.id) ? new Date(aboutis.get(a.id)).toISOString() : null, a.dernier_mail_le, a.derniere_fiche_le].some((d) => d && jourDeIso(d) >= depuis));
  const mois = jour.slice(0, 7);
  return {
    contactes: { n: joints.length, sur: suivis.length, part: suivis.length ? Math.round((joints.length / suivis.length) * 100) : 0, cible: 90 },
    retard,
    biens_du_mois: fiches.filter((f) => jourDeIso(f.le)?.slice(0, 7) === mois).length,
  };
}

// ---------------------------------------------------------------------------
// La page
// ---------------------------------------------------------------------------

/** Les relances de toute l'équipe : les lignes, le tableau de bord, les mails à valider. */
export async function relances({ maintenantD = new Date() } = {}) {
  const jour = R.jourDe(maintenantD);
  const demain = R.plusJours(jour, 1);
  const listes = new Map(Records.list(LISTE).filter((l) => !l.essai).map((l) => [l.id, l]));
  const agences = Records.list(AGENCE).filter((a) => (a.liste_id ? listes.has(a.liste_id) : a.hors_liste) && !a.hors_cible);
  const fiches = Records.list('AgentImmo').filter((x) => !x.essai);
  const parId = new Map(fiches.map((x) => [x.id, x]));
  const appels = Records.list(APPEL).filter((x) => !x.essai && !x.essai_archive && x.etat === 'valide');
  const appelsDe = new Map();
  for (const x of appels) {
    if (!appelsDe.has(x.agent_id)) appelsDe.set(x.agent_id, []);
    appelsDe.get(x.agent_id).push(x);
  }
  const biens = await biensDesAgents();
  const lignes = [];
  const aVenir = [];
  const vues = new Set();
  const pousser = (x) => (x.groupe === 'a_venir' ? aVenir : lignes).push(x);

  for (const a of annoter(agences, maintenantD)) {
    const fiche = parId.get(a.carnet_id) || null;
    const aJuger = biensAJuger(biens.get(a.carnet_id) || [], jour);
    const r = relanceDe({ agence: a, fiche, statut: a.statut, aJuger, jour });
    const cle = cleDe(a);
    // Une même personne dans deux villes, ou deux lignes au même numéro : une seule relance.
    const tel = `tel:${R.normTel(r?.telephone)}`;
    const nomAgent = fiche?.nom && fiche.nom !== a.nom ? fiche.nom : a.monday_connu?.nom || null;
    // Deux lignes au même nom (« Nicolas Mened » deux fois, 8 oct. 2026) : une seule, la plus urgente.
    const parNom = `nom:${R.norm(nomAgent || a.nom)}`;
    if (!r || vues.has(cle) || vues.has(tel) || vues.has(parNom)) continue;
    vues.add(cle);
    vues.add(tel);
    vues.add(parNom);
    const l = listes.get(a.liste_id);
    pousser({
      cle, agence_id: a.id, agent_id: a.carnet_id || null, pour: a.pour || [],
      nom: nomAgent, agence: a.nom,
      ville: l?.ville || a.ville || fiche?.ville || null, telephone: r.telephone,
      motif: { cle: r.motif, libelle: MOTIFS[r.motif] }, le: r.le, groupe: groupeDe(r.le, jour),
      retard: r.le && r.le < jour ? Math.round((Date.parse(`${jour}T12:00:00Z`) - Date.parse(`${r.le}T12:00:00Z`)) / 86400000) : 0,
    });
  }
  // Les agents du carnet sans ligne d'agence : ceux qui nous envoient des fiches, surtout.
  for (const f of fiches) {
    if (vues.has(f.id)) continue;
    const aJuger = biensAJuger(biens.get(f.id) || [], jour);
    if (!aJuger.length && !f.prochaine?.le) continue;
    const statut = statutDeLAgence({ nom: f.nom }, { fiche: f, appels: appelsDe.get(f.id) || [], maintenantD });
    const r = relanceDe({ fiche: f, statut, aJuger, jour });
    if (!r || vues.has(`tel:${R.normTel(r.telephone)}`) || vues.has(`nom:${R.norm(f.nom)}`)) continue;
    vues.add(f.id);
    vues.add(`nom:${R.norm(f.nom)}`);
    pousser({
      cle: f.id, agence_id: null, agent_id: f.id, pour: [], nom: f.nom, agence: f.agence || null, ville: f.ville || null, telephone: r.telephone,
      motif: { cle: r.motif, libelle: MOTIFS[r.motif] }, le: r.le, groupe: groupeDe(r.le, jour),
      retard: r.le && r.le < jour ? Math.round((Date.parse(`${jour}T12:00:00Z`) - Date.parse(`${r.le}T12:00:00Z`)) / 86400000) : 0,
    });
  }

  // Les mails dus se préparent au passage, une fois chacun.
  const derniersBiens = new Map();
  for (const x of appels) if ((x.biens || []).length && !derniersBiens.has(x.agent_id)) derniersBiens.set(x.agent_id, x.biens[0]);
  preparerMails(fiches, jour, derniersBiens);

  const { fiches: lesFiches } = await import('./index.js');
  let recues = [];
  try { recues = (await lesFiches()).filter((f) => f.le); } catch { recues = []; }
  const retard = lignes.filter((x) => x.groupe === 'retard').length;
  return {
    ok: true,
    jour,
    total: lignes.length,
    retard,
    demain: aVenir.filter((x) => x.le === demain).length,
    motifs: Object.entries(MOTIFS).map(([cle, libelle]) => ({ cle, libelle, n: lignes.filter((x) => x.motif.cle === cle).length, urgent: ['bien_retenu', 'bien_refuse'].includes(cle) })),
    villes: [...new Set(lignes.map((x) => x.ville).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr')),
    lignes: ordreDesRelances(lignes),
    prises: prises(maintenantD),
    mails: mailsAValider(),
    activite: activite({ appels, fiches: recues, jour }),
    pilotage: pilotage({ agents: fiches, appels, fiches: recues, retard, jour }),
  };
}

/**
 * Ce que le mode appel ouvre pour une ligne prise : la fiche de l'agence
 * (comme dans la file d'une ville) et, en tête, pourquoi on relance : le
 * motif et la phrase à dire, le dernier échange, le bien en cours,
 * l'historique complet.
 */
export async function ficheDeRelance(agenceId, user, { maintenantD = new Date() } = {}) {
  const a0 = Records.get(AGENCE, agenceId);
  if (!a0) return { ok: false, error: 'Agence introuvable.' };
  const [a] = annoter([a0], maintenantD);
  const jour = R.jourDe(maintenantD);
  const fiche = a.carnet_id ? Records.get('AgentImmo', a.carnet_id) : null;
  const l = a.liste_id ? Records.get(LISTE, a.liste_id) : null;
  const ville = l?.ville || a.ville || fiche?.ville || null;
  const biens = (await biensDesAgents()).get(a.carnet_id) || [];
  const aJuger = biensAJuger(biens, jour);
  const r = relanceDe({ agence: a, fiche, statut: a.statut, aJuger, jour });
  const motif = r?.motif || motifDe({ fiche, statut: a.statut, aJuger });
  const departement = departementDe([a]);
  const recherche = recherchesDeLaZone(Records.list('DemandeClient'), ville, { departement }).find((x) => !/^\d/.test(x)) || null;
  // Le bien en cours : celui qu'on annonce, sinon le dernier reçu, sinon celui dont on attend la fiche.
  const appels = Records.list(APPEL).filter((x) => x.agent_id && x.agent_id === a.carnet_id && x.etat === 'valide' && !x.essai_archive).sort((x, y) => String(y.le).localeCompare(String(x.le)));
  const evoque = appels.find((x) => (x.biens || []).length)?.biens?.[0] || null;
  const bien = aJuger[0] || (fiche?.prochaine?.si_fiche ? { titre: evoque || 'le bien évoqué', recue: false, verdict: null } : biens[0] || null);
  const d = appels[0] || null;
  const element = elementDeFile(a, { place: 1, badge: MOTIFS[motif], fiche, ville, maintenantD });
  return {
    ok: true,
    ville,
    chiffres: null,
    recherches: recherche ? [recherche] : [],
    file: [{
      ...element,
      raison: null,
      relance: {
        motif: { cle: motif, libelle: MOTIFS[motif] },
        phrase: phraseDe(motif, { bien, fiche, statut: a.statut, recherche, appels, monday: a.monday_connu || null }),
        le: r?.le || null,
        agent: fiche?.nom && fiche.nom !== a.nom ? fiche.nom : null,
        dernier: d ? { le: d.le, par: prenomDe(d.par), issue: R.ISSUES[d.issue] || d.issue, resume: d.resume || null } : a.monday_connu ? { le: a.monday_connu.date || null, par: a.monday_connu.qui || null, issue: a.monday_connu.statut || null, resume: null, monday: true } : null,
        bien,
        historique: (fiche?.journal || []).slice(0, 40).map((j) => ({ le: j.le, type: j.type, texte: j.texte, par: j.par ? prenomDe(j.par) : null })),
      },
    }],
  };
}

/** La session du mode appel des relances : un récapitulatif, sans ville. */
export function ouvrirSession(user) {
  return { ok: true, session: Records.create(SESSION, { liste_id: null, ville: 'Relances', relances: true, par: user?.email || null, debut: new Date().toISOString(), appels: [] }) };
}

/**
 * Envoyer des lignes de la Prospection dans Relances : chacune y entre due
 * aujourd'hui. Une ligne déjà en relance n'est pas touchée ; une morte, une
 * « Ne plus appeler », une hors cible ou une sans numéro est refusée.
 */
export async function envoyer(ids, user, { maintenantD = new Date() } = {}) {
  const moi = String(user?.email || '').toLowerCase();
  const jour = R.jourDe(maintenantD);
  const agences = (ids || []).map((id) => Records.get(AGENCE, id)).filter(Boolean);
  const annotees = new Map(annoter(agences, maintenantD).map((a) => [a.id, a]));
  const biens = await biensDesAgents();
  let envoyees = 0;
  let deja = 0;
  const refusees = [];
  const villes = new Set();
  for (const a of agences) {
    const x = annotees.get(a.id);
    const fiche = a.carnet_id ? Records.get('AgentImmo', a.carnet_id) : null;
    if (!x || a.hors_cible || x.statut.etat === 'morte' || a.ne_plus_appeler || fiche?.ne_plus_appeler || !numeroDe(a)) { refusees.push(a.nom); continue; }
    if (relanceDe({ agence: x, fiche, statut: x.statut, aJuger: biensAJuger(biens.get(a.carnet_id) || [], jour), jour })) { deja += 1; continue; }
    Records.update(AGENCE, a.id, { en_relance: { par: moi, le: jour } });
    envoyees += 1;
    const ville = Records.get(LISTE, a.liste_id)?.ville;
    if (ville) villes.add(ville);
  }
  return { ok: true, envoyees, deja, refusees, villes: [...villes] };
}

/**
 * Supprimer des relances (8 oct. 2026) : la ligne sort de la liste, la relance
 * prévue est retirée ; un prochain appel la refait vivre.
 */
export function retirerDesRelances(cles, user, { maintenantD = new Date() } = {}) {
  const le = maintenantD.toISOString();
  const par = String(user?.email || '').toLowerCase() || null;
  let n = 0;
  for (const cle of (Array.isArray(cles) ? cles : []).slice(0, 200)) {
    const agence = String(cle).startsWith('ag:') ? Records.get(AGENCE, String(cle).slice(3)) : Records.list(AGENCE).find((x) => x.carnet_id === cle) || null;
    const fiche = agence?.carnet_id ? Records.get('AgentImmo', agence.carnet_id) : Records.get('AgentImmo', cle);
    if (agence) Records.update(AGENCE, agence.id, { hors_relances: { le, par }, en_relance: null });
    if (fiche) { majAgent(fiche.id, { hors_relances: { le, par }, prochaine: null, relances_suivantes: [] }); journal(fiche.id, { type: 'note', texte: 'Retiré des relances', par }); }
    if (agence || fiche) { liberer(cle); n += 1; }
  }
  return { ok: true, retirees: n };
}

/**
 * Renvoyer en prospection (8 oct. 2026) : on ne l'a jamais vraiment démarché ;
 * l'agence revient dans la file du mode appel comme une jamais contactée, et
 * sort des relances. Un agent sans ligne d'agence ne peut pas y retourner.
 */
export function renvoyerEnProspection(cles, user, { maintenantD = new Date() } = {}) {
  const le = maintenantD.toISOString();
  const par = String(user?.email || '').toLowerCase() || null;
  let n = 0;
  let sansAgence = 0;
  for (const cle of (Array.isArray(cles) ? cles : []).slice(0, 200)) {
    const agence = String(cle).startsWith('ag:') ? Records.get(AGENCE, String(cle).slice(3)) : Records.list(AGENCE).find((x) => x.carnet_id === cle) || null;
    if (!agence) { sansAgence += 1; continue; }
    Records.update(AGENCE, agence.id, { remise_en_prospection: { le, par }, en_relance: null, hors_relances: null, passee: null, pour: [] });
    const fiche = agence.carnet_id ? Records.get('AgentImmo', agence.carnet_id) : null;
    if (fiche) { majAgent(fiche.id, { prochaine: null, relances_suivantes: [] }); journal(fiche.id, { type: 'note', texte: 'Renvoyé en prospection', par }); }
    liberer(cle);
    n += 1;
  }
  return { ok: true, renvoyees: n, sans_agence: sansAgence };
}
