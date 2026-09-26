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
    ...agentsImmo.map((a) => ({ nom: a.nom, agence: a.agence, email: a.email, telephone: a.telephone, ville: a.ville, source: 'Monday · Agent immobilier', statut: /mort/i.test(a.priorite || '') ? 'pause' : 'envoie_des_fiches', referent: a.referent || null, remarque: a.remarques ? `Monday : ${a.remarques}` : null, dernier_contact_le: a.date || null, prochaine: a.relance ? { quoi: 'relance notée dans Monday', le: a.relance } : null })),
    ...prospects.map((p) => ({ nom: p.nom, agence: p.agence, email: p.email, telephone: p.telephone, ville: p.ville, source: 'Monday · Prospection', statut: STATUT_DE_MONDAY(p.statut), referent: p.collaborateurs?.[0] || null, remarque: p.remarques ? `Monday : ${p.remarques}` : null, dernier_contact_le: p.date || null, prochaine: p.prochaine_relance ? { quoi: 'relance notée dans Monday', le: p.prochaine_relance } : null })),
  ];
  return { ...integrer(candidats), lus: candidats.length };
}
