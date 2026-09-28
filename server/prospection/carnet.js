// Le carnet des agents immobiliers. Il vit dans la plateforme (AgentImmo) et
// fait foi ; Monday en reçoit une copie pour piloter (monday.js).
//
// Un agent : nom, agence, ville et villes où il publie, téléphones, mails,
// secteurs, référent (le premier de l'équipe qui l'a joint), statut, dernier
// contact, prochaine action et sa date, score, résumé du dernier appel, ses
// annonces Equimmox par ville (et les murs vides), sa source, et son journal
// (appels, mails, fiches), du plus récent au plus ancien.

import { Records } from '../db.js';
import * as R from './regles.js';

const ENTITE = 'AgentImmo';
const JOURNAL_MAX = 80;

export const agents = () => Records.list(ENTITE);
export const agentDe = (id) => Records.get(ENTITE, id);

export function majAgent(id, champs) {
  return Records.update(ENTITE, id, { ...champs, maj_le: new Date().toISOString() });
}

/** Ajoute une ligne au journal d'un agent : un appel, un mail, une fiche, une note. */
export function journal(id, { type, texte, par = null, le = new Date().toISOString(), lien = null }) {
  const a = agentDe(id);
  if (!a) return null;
  const j = [{ le, type, texte: String(texte || '').slice(0, 600), par, lien }, ...(a.journal || [])].slice(0, JOURNAL_MAX);
  return majAgent(id, { journal: j });
}

const liste = (...v) => [...new Set(v.flat().filter(Boolean))];

// Les colonnes libres de la grille, reprises de la Google Sheet de l'équipe.
export const CHAMPS_LIBRES = ['prenom', 'nom_famille', 'poste', 'onglet', 'immo_commercial', 'specialite', 'reponse', 'bien_similaire', 'linkedin'];

/** Pure : la fiche d'un nouvel agent, à partir d'un candidat (Equimmox, fichier, alerte, Monday, à la main). */
export function ficheDuCandidat(c, maintenant = new Date()) {
  const tel = R.normTel(c.telephone);
  return {
    nom: String(c.nom || c.agence || c.email || 'Agent').slice(0, 160),
    agence: c.agence || null,
    ville: c.ville || null,
    villes: liste(c.ville, Object.keys(c.annonces_par_ville || {})),
    telephones: liste(tel ? R.telAffiche(tel) : null, ...(c.telephones || []).map(R.telAffiche)),
    emails: liste(R.normEmail(c.email), ...(c.emails || []).map(R.normEmail)),
    secteurs: liste(...(c.secteurs || [])),
    referent: c.referent || null,
    statut: c.statut || 'nouveau',
    tentatives: 0,
    prochaine: c.prochaine || null,
    dernier_contact_le: c.dernier_contact_le || null,
    resume_dernier_appel: null,
    score: 0,
    annonces_par_ville: c.annonces_par_ville || {},
    vides_par_ville: c.vides_par_ville || {},
    annonces: c.annonces || 0,
    sites: c.sites || [],
    source: c.source || null,
    remarques: c.remarque || null,
    adresse_annonce: c.adresse || null,
    // Les colonnes de l'ancienne Google Sheet, gardées telles quelles.
    ...Object.fromEntries(CHAMPS_LIBRES.map((k) => [k, c[k] || null])),
    journal: c.remarque ? [{ le: new Date(maintenant).toISOString(), type: 'source', texte: c.remarque, par: null }] : [],
    cree_le: new Date(maintenant).toISOString(),
    maj_le: new Date(maintenant).toISOString(),
  };
}

/** Pure : ce qu'un candidat apporte à un agent déjà connu (numéros, mails, annonces à jour). */
export function fusion(a, c) {
  const f = ficheDuCandidat(c);
  const champs = {
    telephones: liste(a.telephones || [], f.telephones),
    emails: liste(a.emails || [], f.emails),
    villes: liste(a.villes || [], f.villes),
  };
  if (!a.agence && f.agence) champs.agence = f.agence;
  if (!a.ville && f.ville) champs.ville = f.ville;
  for (const k of CHAMPS_LIBRES) if (!a[k] && f[k]) champs[k] = f[k];
  if (!a.referent && f.referent) champs.referent = f.referent;
  // Un agent encore « à appeler » prend ce que la source sait de lui (déjà
  // appelé, pas d'immobilier commercial…) ; un agent suivi ici garde son statut.
  if ((!a.statut || a.statut === 'nouveau') && f.statut && f.statut !== 'nouveau') champs.statut = f.statut;
  if (!a.remarques && f.remarques) champs.remarques = f.remarques;
  if (Object.keys(c.annonces_par_ville || {}).length) {
    champs.annonces_par_ville = { ...(a.annonces_par_ville || {}), ...c.annonces_par_ville };
    champs.vides_par_ville = { ...(a.vides_par_ville || {}), ...(c.vides_par_ville || {}) };
    for (const v of Object.keys(c.annonces_par_ville)) if (!c.vides_par_ville?.[v]) champs.vides_par_ville[v] = 0;
    champs.annonces = Object.values(champs.annonces_par_ville).reduce((t, n) => t + n, 0);
    champs.sites = liste(a.sites || [], c.sites || []);
    if (c.adresse) champs.adresse_annonce = c.adresse;
  }
  return champs;
}

/**
 * Fait entrer des candidats dans le carnet : un agent connu (mail,
 * téléphone, nom et agence) est complété, un inconnu est créé.
 * @returns {{crees: object[], completes: number, ignores: number}}
 */
export function integrer(candidats, { maintenant = new Date() } = {}) {
  const tous = agents();
  const index = R.indexer(tous);
  const crees = [];
  let completes = 0;
  let ignores = 0;
  for (const c of candidats || []) {
    if (!R.clesDe(c).length) { ignores += 1; continue; }
    const connu = R.dejaConnu(index, c);
    if (connu) {
      const avant = agentDe(connu.id);
      if (!avant) continue;
      const champs = fusion(avant, c);
      // Un agent qui publie plus qu'avant remonte : on le note au journal.
      const plus = (champs.annonces || 0) > (avant.annonces || 0) && avant.dernier_contact_le;
      majAgent(avant.id, champs);
      if (plus) journal(avant.id, { type: 'equimmox', texte: `Nouvelles annonces sur Equimmox : ${champs.annonces} en tout (${avant.annonces || 0} avant).` });
      completes += 1;
      continue;
    }
    const cree = Records.create(ENTITE, ficheDuCandidat(c, maintenant));
    for (const k of R.clesDe(cree)) index.set(k, cree);
    crees.push(cree);
  }
  return { crees, completes, ignores };
}

/** L'agent d'une adresse mail, s'il est au carnet. */
export function agentParEmail(email) {
  const e = R.normEmail(email);
  if (!e) return null;
  return agents().find((a) => (a.emails || []).includes(e)) || null;
}

/** Pure : les agents qui répondent le mieux à une recherche (nom, agence, téléphone, mail, ville). Plusieurs à égalité : c'est ambigu. */
export function trouver(liste, recherche) {
  const q = R.norm(recherche);
  if (!q) return [];
  const tel = R.normTel(recherche);
  const mots = q.split(' ').filter((m) => m.length > 1);
  return (liste || [])
    .map((a) => {
      const cible = R.norm(`${a.nom} ${a.agence || ''} ${(a.emails || []).join(' ')} ${a.ville || ''}`);
      let score = 0;
      if (tel && (a.telephones || []).some((t) => R.normTel(t) === tel)) score += 10;
      if (R.norm(a.nom) === q) score += 8;
      for (const m of mots) if (cible.includes(m)) score += 1;
      return { a, score };
    })
    .filter((x) => x.score >= Math.max(1, Math.min(2, mots.length)))
    .sort((x, y) => y.score - x.score)
    .filter((x, _, l) => x.score === l[0].score)
    .map((x) => x.a);
}

/** Prend un agent pour l'appeler : personne d'autre ne peut le prendre pendant trente minutes. */
export function verrouiller(id, email) {
  const a = agentDe(id);
  if (!a) return { ok: false, error: 'Agent introuvable.' };
  if (R.verrouTenu(a.verrou) && a.verrou.par !== email) return { ok: false, error: `${a.verrou.nom || a.verrou.par} l'appelle déjà.`, verrou: a.verrou };
  const u = Records.filter('User', { email })[0];
  majAgent(id, { verrou: { par: email, nom: (u?.full_name || email).split(' ')[0], le: new Date().toISOString() } });
  return { ok: true };
}

export function liberer(id, email = null) {
  const a = agentDe(id);
  if (a?.verrou && (!email || a.verrou.par === email)) majAgent(id, { verrou: null });
}

// ---------------------------------------------------------------------------
// L'import depuis Monday, une fois
// ---------------------------------------------------------------------------

const STATUT_DE_MONDAY = (texte) => {
  const t = R.norm(texte);
  if (/mort/.test(t)) return 'pause';
  if (/pas de rep|no rep/.test(t)) return 'a_rappeler';
  if (/recontact|rappel/.test(t)) return 'a_rappeler';
  if (/regulier|elevee|moyenne|interess/.test(t)) return 'en_discussion';
  return 'nouveau';
};

/**
 * Reprend dans le carnet les agents des deux tableaux Monday actuels
 * (« Prospection Agent Immo » et « Agent immobilier »), sans doublon. Les
 * agents qui nous ont déjà envoyé des fiches viennent du second.
 */
export async function importerDepuisMonday() {
  const { lireProspects, lireAgentsImmo } = await import('./monday.js');
  const [prospects, agentsImmo] = await Promise.all([lireProspects(), lireAgentsImmo()]);
  const candidats = [
    ...agentsImmo.map((a) => ({ nom: a.nom, agence: a.agence, email: a.email, telephone: a.telephone, ville: a.ville, source: 'Monday · Agent immobilier', statut: /mort/i.test(a.priorite || '') ? 'pause' : 'envoie_des_fiches', referent: a.referent || null, remarque: a.remarques ? `Monday : ${a.remarques}` : null, dernier_contact_le: a.date || null, prochaine: a.relance ? { quoi: 'relance prévue dans Monday', le: a.relance } : null })),
    // Un « Nouveau contact » n'a jamais été appelé : sa date de relance (souvent
    // posée d'office à l'import d'un fichier) n'est pas une relance promise.
    ...prospects.map((p) => {
      const statut = STATUT_DE_MONDAY(p.statut);
      const appele = statut !== 'nouveau';
      return { nom: p.nom, agence: p.agence, email: p.email, telephone: p.telephone, ville: p.ville, source: /^apollo/i.test(p.remarques || '') ? 'Apollo' : 'Monday · Prospection', statut, referent: appele ? p.collaborateurs?.[0] || null : null, remarque: p.remarques ? `Monday : ${p.remarques}` : null, dernier_contact_le: appele ? p.date || null : null, prochaine: appele && p.prochaine_relance ? { quoi: `relance prévue dans Monday (${p.statut || 'sans statut'})`, le: p.prochaine_relance } : null };
    }),
  ];
  return { ...integrer(candidats), lus: candidats.length };
}

// ---------------------------------------------------------------------------
// L'import d'une Google Sheet d'agents (un onglet par ville)
// ---------------------------------------------------------------------------

const ONGLETS_IGNORES = /^(ville|villes|data|feuille \d+|sheet\d*|fonciere)$/i;

/** Pure : l'adresse d'un collègue d'après le prénom écrit dans « Attribué à » (Max, No aura, Coarile…). */
export function referentDuPrenom(texte, equipe = []) {
  const t = R.norm(texte).replace(/\s+/g, '');
  if (!t) return null;
  const alias = { max: 'maxime', noaura: 'nora', coarile: 'coralie' };
  const prenom = alias[t] || t;
  const u = equipe.find((x) => R.norm(String(x.nom || '').split(' ')[0]) === prenom || R.norm(x.email).startsWith(prenom.slice(0, 4)));
  return u?.email || null;
}

/** Pure : le statut d'un agent d'après ce que la Sheet en dit. */
export function statutDeLaSheet({ reponse = '', immo = '', remarque = '' }) {
  const r = R.norm(reponse);
  const i = R.norm(immo);
  const tout = `${r} ${R.norm(remarque)}`;
  if (i === 'non' || /pas immobilier|pas d immo|banque|courtier|grossiste|agence fermee/.test(tout)) return 'archive';
  if (/rappel|pas de rep|n a pas rep|repondeur|message|sms/.test(tout)) return 'a_rappeler';
  if (r === 'non') return 'pause';
  if (r === 'oui' || r === 'ok' || /revient vers moi|mail envoye|projets/.test(tout)) return 'en_discussion';
  return r ? 'a_rappeler' : 'nouveau';
}

/**
 * Pure : les candidats d'un classeur (lireClasseur), un onglet par ville.
 * Les colonnes de l'équipe : Attribué à, First Name, Last Name, Poste,
 * Entreprise, Email, Numéro, Immobilier Commercial, Spécialité, Réponse,
 * Autre/Remarque, Bien à vendre similaire, LinkedIn.
 */
export function candidatsDeLaSheet(classeur, { equipe = [], source = 'Google Sheet' } = {}) {
  const out = [];
  for (const [onglet, lignes] of Object.entries(classeur || {})) {
    if (ONGLETS_IGNORES.test(onglet.trim()) || !lignes.length) continue;
    const cle = (l, ...noms) => { for (const n of noms) for (const k of Object.keys(l)) if (R.norm(k) === R.norm(n)) return String(l[k] || '').trim(); return ''; };
    if (!Object.keys(lignes[0]).some((k) => /first name|entreprise|agence/i.test(k))) continue;
    const ville = onglet.trim().replace(/\s+et environs$/i, '').replace(/\s+/g, ' ');
    for (const l of lignes) {
      const prenom = cle(l, 'First Name', 'Prénom');
      const nomFamille = cle(l, 'Last Name', 'Nom');
      const agence = cle(l, 'Entreprise', 'Agence', "Nom de l'entreprise / Agence");
      const email = cle(l, 'Email', 'E-mail');
      const tel = cle(l, 'Numéro', 'Téléphone', 'Contact (Téléphone / Site)');
      if (!prenom && !agence && !email && !tel) continue;
      const reponse = cle(l, 'Réponse');
      const immo = cle(l, 'Immobilier Commercial', 'Immobilier Commercial ?');
      const remarque = cle(l, 'Autre/Remarque', 'Autre', 'Remarque');
      out.push({
        nom: [prenom, nomFamille].filter(Boolean).join(' ') || agence,
        prenom: prenom || null, nom_famille: nomFamille || null,
        agence: agence || null, email, telephone: tel, ville: /environs/i.test(onglet) ? 'Paris' : ville, onglet: onglet.trim(),
        poste: cle(l, 'Poste') || null, immo_commercial: immo || null, specialite: cle(l, 'Spécialité') || null,
        reponse: reponse || null, bien_similaire: cle(l, 'Bien à vendre similaire') || null, linkedin: cle(l, 'LinkedIn') || null,
        referent: referentDuPrenom(cle(l, 'Attribué à'), equipe),
        statut: statutDeLaSheet({ reponse, immo, remarque }),
        remarque: remarque || null,
        source,
      });
    }
  }
  return out;
}

/** Importe une Google Sheet du Drive de `email` (son lien ou son identifiant) dans le carnet. */
export async function importerSheet(lienOuId, email) {
  const id = (String(lienOuId || '').match(/\/d\/([A-Za-z0-9_-]{20,})/) || [])[1] || String(lienOuId || '').trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) return { ok: false, error: 'Lien de Google Sheet illisible.' };
  const { accessTokenFor, storedAccount } = await import('../google-oauth.js');
  const compte = storedAccount(email);
  if (!compte) return { ok: false, error: 'Ta boîte Google n\'est pas connectée à Klocka : connecte-la, puis recommence.' };
  const token = await accessTokenFor(compte);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return { ok: false, error: r.status === 404 ? 'Google Sheet introuvable depuis ton compte.' : `Google a refusé l'export (${r.status}).` };
  const { lireClasseur } = await import('../xlsx.js');
  const classeur = lireClasseur(Buffer.from(await r.arrayBuffer()));
  const { EQUIPE } = await import('./equipe.js');
  const equipe = [
    ...EQUIPE.map((m) => ({ email: m.email, nom: m.prenom })),
    ...Records.filter('User', { role: 'admin' }).map((u) => ({ email: String(u.email || '').toLowerCase(), nom: u.full_name || '' })).filter((u) => u.email.endsWith('@klocka.immo')),
  ];
  const candidats = candidatsDeLaSheet(classeur, { equipe });
  const res = integrer(candidats);
  const parOnglet = {};
  for (const c of candidats) parOnglet[c.onglet] = (parOnglet[c.onglet] || 0) + 1;
  return { ok: true, lus: candidats.length, crees: res.crees.length, completes: res.completes, sans_contact: res.ignores, onglets: parOnglet };
}

/** Pure : l'onglet d'un agent dans la grille : celui de la Sheet, sinon sa ville (« Nice et alentours » → Nice). */
export function ongletDe(a) {
  // « Paris Et Environs », « PARIS 8ème », « Nice et alentours » : un seul onglet par ville.
  const v = String(a.onglet || a.ville || '').replace(/\s+(et\s+(ses\s+)?(alentours|environs)|\d+.*|\(.*\))$/i, '').trim();
  if (!v) return 'Sans ville';
  return v.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ]+)/g, (m, x, mot) => (x === '-' && ['en', 'sur', 'de', 'la', 'le', 'les', 'du', 'et'].includes(mot) ? m : x + mot.charAt(0).toUpperCase() + mot.slice(1)));
}
