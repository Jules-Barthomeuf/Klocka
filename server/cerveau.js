// Le Cerveau de Klocka (spec MVP du 14 oct. 2026) : ce qui a été dit, décidé
// ou promis sur un dossier, un agent, une agence, un investisseur, une ville,
// gardé avec sa source et validé par un humain avant d'être tenu pour acquis.
//
// Un seul circuit :
//   1. une source entre telle quelle dans le journal brut (CerveauSource) :
//      compte rendu collé ou déposé, transcription du mode appel, débrief du
//      chat (« retiens que… ») ; l'IA ne la modifie ni ne la supprime jamais ;
//   2. l'extraction en tire des faits (CerveauFait) de quatre types : décision,
//      information, engagement, savoir ; chacun avec sa phrase exacte ;
//   3. chaque fait se rattache aux fiches (CerveauLien) ; s'il hésite, il
//      reste « à rattacher » avec ses candidats ;
//   4. Jules valide, corrige ou rejette (Cerveau > À valider) ; seuls les
//      faits validés répondent aux questions d'AK.
// Un fait sans source n'existe pas. Les faits rejetés restent, pour mesurer
// la qualité de l'extraction. Réservé à l'équipe, jamais lu côté mandataire.

import { Records } from './db.js';
import { estSuperAdmin } from './acces-pages.js';
import { notifier } from './notifications.js';

export const SOURCE = 'CerveauSource';
export const FAIT = 'CerveauFait';
export const LIEN = 'CerveauLien';
export const QUESTION = 'CerveauQuestion';
const RECHERCHE = 'CerveauRecherche';

export const TYPES_SOURCE = ['compte_rendu', 'appel', 'debrief', 'decision'];
export const TYPES_FAIT = ['decision', 'information', 'engagement', 'savoir'];
export const TYPES_ENTITE = ['dossier', 'projet', 'agent', 'agence', 'investisseur', 'ville'];

const maintenant = () => new Date().toISOString();
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const MOTS_VIDES = new Set('le la les un une des de du d l a au aux et ou en sur pour par avec dans que qui quoi ce cet cette ces se sa son ses leur nous vous il elle on est sont a ont pas ne plus tres bien fait faire dit dire on y'.split(' '));
const mots = (t) => norm(t).split(' ').filter((m) => m.length > 1 && !MOTS_VIDES.has(m));

/** Seul Jules valide au MVP (les super-admins de la plateforme). */
export const peutValider = (user) => estSuperAdmin(user);

// --- Les fiches : leur nom, et la recherche d'un candidat par son nom -------------------------

const lot = (d) => d?.lots?.[0]?.lot || {};
const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);

/** Le nom lisible d'une fiche. */
export function libelleEntite(type, id) {
  if (!id) return null;
  if (type === 'dossier') {
    const d = Records.findBy('Deal', 'deal_id', id);
    if (!d) return null;
    const a = val(lot(d).adresse);
    return d.nom || [val(lot(d).locataire_nom), a && typeof a === 'object' ? a.ville : null].filter(Boolean).join(', ') || 'Dossier';
  }
  if (type === 'projet') return Records.get('Project', id)?.titre || null;
  if (type === 'agent') {
    const a = Records.get('AgentImmo', id);
    return a ? [a.prenom, a.nom_famille].filter(Boolean).join(' ') || a.nom || null : null;
  }
  if (type === 'agence') return Records.get('AgenceProspect', id)?.nom || null;
  if (type === 'investisseur') { const u = Records.get('User', id); return u ? u.full_name || u.email : null; }
  if (type === 'ville') return id;
  return null;
}

/** Le lien vers une fiche, pour la rouvrir d'un clic. */
export function lienEntite(type, id) {
  if (type === 'dossier') return `/Analyse?deal_id=${id}`;
  if (type === 'projet') return `/AdminProjets?id=${id}`;
  if (type === 'agent') return `/Prospection?agent=${id}`;
  return null;
}

/** Les fiches qui répondent à un nom (« Libourne », « agence Durand »), les plus proches d'abord. */
export function candidatsPour(type, nom, { limite = 5 } = {}) {
  const q = mots(nom).filter((m) => !['agence', 'agent', 'dossier', 'projet', 'murs', 'immobilier', 'immo'].includes(m));
  if (!q.length) return [];
  const score = (texte) => { const t = ` ${norm(texte)} `; return q.filter((m) => t.includes(` ${m} `)).length / q.length; };
  const garder = (liste) => liste.filter((c) => c.score >= 0.99 || (q.length > 1 && c.score >= 0.5)).sort((a, b) => b.score - a.score).slice(0, limite);
  if (type === 'ville') return q.length ? [{ type_entite: 'ville', entite_id: String(nom).trim(), libelle: String(nom).trim(), score: 1 }] : [];
  if (type === 'dossier') {
    // Un « dossier » dans la bouche de l'équipe est souvent déjà un projet : les deux sont proposés.
    return garder([...Records.list('Deal').filter((d) => !d.supprime).map((d) => {
      const a = val(lot(d).adresse);
      const texte = [d.nom, val(lot(d).locataire_nom), val(lot(d).locataire_activite), a && typeof a === 'object' ? `${a.rue || ''} ${a.ville || ''}` : a, d.apercu?.agence, d.apercu?.agent_nom].filter(Boolean).join(' ');
      return { type_entite: 'dossier', entite_id: d.deal_id, libelle: libelleEntite('dossier', d.deal_id), score: score(texte) };
    }), ...candidatsPour('projet', nom, { limite })]);
  }
  if (type === 'projet') return garder(Records.list('Project').map((p) => ({ type_entite: 'projet', entite_id: p.id, libelle: p.titre, score: score(`${p.titre || ''} ${p.adresse_complete || ''} ${p.nom_locataire || ''}`) })));
  if (type === 'agent') return garder(Records.list('AgentImmo').map((a) => ({ type_entite: 'agent', entite_id: a.id, libelle: `${libelleEntite('agent', a.id) || ''}${a.ville ? `, ${a.ville}` : ''}`, ville: a.ville || null, score: score(`${a.prenom || ''} ${a.nom_famille || ''} ${a.nom || ''} ${a.agence || ''}`) })));
  if (type === 'agence') return garder(Records.list('AgenceProspect').map((a) => ({ type_entite: 'agence', entite_id: a.id, libelle: `${a.nom || ''}${a.ville ? `, ${a.ville}` : ''}`, ville: a.ville || null, score: score(a.nom || '') })));
  if (type === 'investisseur') return garder(Records.list('User').filter((u) => u.role === 'user').map((u) => ({ type_entite: 'investisseur', entite_id: u.id, libelle: u.full_name || u.email, score: score(`${u.full_name || ''} ${u.email || ''}`) })));
  return [];
}

// --- 1. Le journal brut ---------------------------------------------------------------------

/**
 * Une source entre telle quelle. `liens` : les fiches déjà connues (l'agent et
 * l'agence d'un appel) ; chaque fait extrait s'y rattache d'office.
 */
export function ajouterSource({ type, auteur = null, date = null, titre = null, contenu, lien_original = null, liens = [], cle = null }) {
  const texte = String(contenu || '').trim();
  if (!texte) return { ok: false, error: 'Source vide.' };
  if (!TYPES_SOURCE.includes(type)) return { ok: false, error: `Type de source inconnu : ${type}` };
  // Une même source (le même appel, le même compte rendu) n'entre qu'une fois.
  if (cle) { const deja = Records.list(SOURCE).find((s) => s.cle === cle); if (deja) return { ok: true, source: deja, deja: true }; }
  const source = Records.create(SOURCE, {
    type, auteur: auteur ? String(auteur).toLowerCase() : null, date: date || maintenant(), titre: titre ? String(titre).slice(0, 160) : null,
    contenu: texte.slice(0, 120000), lien_original, liens: (liens || []).filter((l) => l?.type_entite && l?.entite_id), cle,
    statut_extraction: 'en_attente', faits: 0, doublons: 0, cree_le: maintenant(),
  });
  return { ok: true, source };
}

// --- 2. L'extraction ------------------------------------------------------------------------

const SCHEMA = {
  type: 'object',
  properties: {
    faits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: TYPES_FAIT },
          resume: { type: 'string', description: 'une phrase, autonome, qui se comprend sans la source : qui, quoi, sur quoi' },
          citation: { type: 'string', description: 'la phrase EXACTE de la source, recopiée mot pour mot, d\'où vient le fait' },
          personne: { type: 'string', description: 'qui a dit, décidé ou promis (prénom nom, ou rôle), vide si inconnu' },
          echeance: { type: 'string', description: 'pour un engagement : la date promise, AAAA-MM-JJ, vide sinon' },
          entites: {
            type: 'array',
            items: { type: 'object', properties: { type_entite: { type: 'string', enum: TYPES_ENTITE }, nom: { type: 'string' } }, required: ['type_entite', 'nom'] },
          },
        },
        required: ['type', 'resume', 'citation'],
      },
    },
  },
  required: ['faits'],
};

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const jourDe = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${JOURS[d.getDay()]} ${d.toISOString().slice(0, 10)}`; };

const consigne = (source) => `Tu tiens la mémoire de Klocka, qui achète et vend des murs commerciaux (dossiers de pré-analyse, projets d'investisseurs, agents et agences immobilières qui apportent des biens).
Voici une source de type « ${source.type} »${source.titre ? ` (« ${source.titre} »)` : ''}, du ${jourDe(source.date)}${source.auteur ? `, par ${source.auteur}` : ''}. Un jour dit sans date (« jeudi », « mardi prochain », « d'ici vendredi ») se date à partir de ce jour-là.
Extrais les FAITS qui méritent d'être retrouvés dans une semaine ou un an, et rien d'autre :
- decision : ce qui a été tranché, avec son motif s'il est dit (« on refuse Libourne : loyer trop haut pour l'emplacement ») ;
- information : un fait sur un dossier, un agent, une agence, un investisseur, une ville (« l'agence Durand a deux murs off-market à Antibes ») ;
- engagement : une promesse, de qui, quoi, pour quand (« Durand rappelle jeudi ») ;
- savoir : une règle ou un savoir-faire de l'équipe, valable au-delà de ce dossier (« à Antibes, un emplacement n°2 se loue sous 300 €/m²/an »).
Règles : n'invente rien ; un fait par idée : une information et une promesse dans la même phrase font DEUX faits (« l'agence Durand a deux murs à Antibes, elle envoie les fiches jeudi » : une information, et un engagement de Durand pour jeudi) ; tout « il rappelle », « elle envoie », « je préviens », « on revient vers lui » daté ou non est un engagement ; la citation est recopiée mot pour mot de la source, sans retouche ; le résumé dit la chose en une phrase autonome ; les entités sont nommées comme dans la source (« Libourne », « agence Durand », « Maxime ») ; pas de fait pour une politesse, une logistique de réunion ou une hésitation non tranchée. Une source sans fait utile rend une liste vide.
Avant de rendre la liste, relis chaque information et chaque décision : si sa phrase contient aussi une promesse (« doit », « va », « envoie », « rappelle », « d'ici », « avant »), ajoute cette promesse comme un engagement à part, avec sa propre citation (la portion de phrase qui la dit), la personne qui promet et son échéance.${source.type === 'decision' ? '\nCette source est la réponse à « pourquoi ce dossier a-t-il été accepté ou refusé ? » : c\'est une décision, avec son motif.' : ''}

SOURCE :
<<<
${source.contenu.slice(0, 60000)}
>>>`;

/** Pure : la citation se retrouve-t-elle dans la source (aux espaces et à la casse près) ? */
export function citationDans(citation, contenu) {
  const c = norm(citation);
  return !!c && norm(contenu).includes(c);
}

/** Pure : un fait existant qui dit déjà la même chose (même citation, ou même résumé). */
export function doublonDe(fait, existants) {
  const r = norm(fait.resume);
  const c = norm(fait.citation);
  return existants.find((f) => f.statut !== 'rejete' && ((c && c.length > 20 && norm(f.citation) === c) || (r && norm(f.resume) === r))) || null;
}

/**
 * Range les faits extraits d'une source : vérifie la citation, écarte les
 * doublons, rattache les entités (d'office celles que la source connaît).
 * Pure sur `faits` ; écrit en base.
 */
export function rangerFaits(source, faits, { valideD_office = null } = {}) {
  const existants = Records.list(FAIT);
  const crees = [];
  let doublons = 0;
  for (const f of faits || []) {
    if (!TYPES_FAIT.includes(f?.type) || !String(f?.resume || '').trim()) continue;
    const double = doublonDe(f, [...existants, ...crees]);
    if (double) { doublons += 1; continue; }
    // Les entités : un seul candidat sûr, rattaché ; sinon « à rattacher », candidats proposés.
    const liens = [...(source.liens || [])];
    const candidats = [];
    const villes = (f.entites || []).filter((e) => e.type_entite === 'ville').map((e) => norm(e.nom));
    for (const e of f.entites || []) {
      let c = candidatsPour(e.type_entite, e.nom);
      // Une agence ou un agent d'une autre ville n'est pas un candidat ; sans ville connue, il n'est pas sûr.
      if (villes.length && (e.type_entite === 'agence' || e.type_entite === 'agent')) c = c.filter((x) => !x.ville || villes.includes(norm(x.ville)));
      const surs = c.filter((x) => x.score >= 0.99 && (!villes.length || !['agence', 'agent'].includes(e.type_entite) || x.ville));
      if (surs.length === 1 || (e.type_entite === 'ville' && c.length)) liens.push({ type_entite: surs[0]?.type_entite || c[0].type_entite, entite_id: (surs[0] || c[0]).entite_id });
      else candidats.push({ nom: e.nom, type_entite: e.type_entite, propositions: c.map(({ type_entite, entite_id, libelle }) => ({ type_entite, entite_id, libelle })) });
    }
    const uniques = liens.filter((l, i) => liens.findIndex((x) => x.type_entite === l.type_entite && x.entite_id === l.entite_id) === i);
    const statut = valideD_office ? 'valide' : candidats.length ? 'a_rattacher' : 'a_valider';
    const fait = Records.create(FAIT, {
      source_id: source.id, type: f.type, resume: String(f.resume).trim().slice(0, 400), citation: String(f.citation || '').trim().slice(0, 1200),
      citation_verifiee: citationDans(f.citation, source.contenu), personne: String(f.personne || '').trim() || null,
      echeance: /^\d{4}-\d{2}-\d{2}$/.test(String(f.echeance || '')) ? f.echeance : null,
      candidats, statut, corrige: false, cree_le: maintenant(),
      ...(valideD_office ? { valide_par: valideD_office, valide_le: maintenant() } : {}),
    });
    for (const l of uniques) Records.create(LIEN, { fait_id: fait.id, type_entite: l.type_entite, entite_id: l.entite_id });
    crees.push(fait);
  }
  Records.update(SOURCE, source.id, { statut_extraction: 'fait', faits: crees.length, doublons, extrait_le: maintenant() });
  return { faits: crees, doublons };
}

/** Extrait les faits d'une source (l'IA), puis les range. */
export async function extraire(sourceId, { valideD_office = null } = {}) {
  const source = Records.get(SOURCE, sourceId);
  if (!source) return { ok: false, error: 'Source introuvable.' };
  Records.update(SOURCE, source.id, { statut_extraction: 'en_cours' });
  try {
    const { invokeLLM } = await import('./llm.js');
    const { mesurer } = await import('./llm-couts.js');
    const { resultat } = await mesurer({ operation: 'cerveau', sur: source.id, par: source.auteur }, () => invokeLLM({ prompt: consigne(source), response_json_schema: SCHEMA }));
    const r = rangerFaits(source, resultat?.faits || [], { valideD_office });
    return { ok: true, source_id: source.id, faits: r.faits.map(resumeFait), doublons: r.doublons };
  } catch (e) {
    Records.update(SOURCE, source.id, { statut_extraction: 'echec', erreur: String(e?.message || e).slice(0, 300) });
    return { ok: false, error: `Extraction impossible : ${e?.message || e}` };
  }
}

// --- 3. La validation -----------------------------------------------------------------------

export const liensDu = (faitId) => Records.list(LIEN).filter((l) => l.fait_id === faitId);

/** Un fait tel que l'écran et AK le lisent : sa source, ses fiches. */
export function resumeFait(f) {
  const s = Records.get(SOURCE, f.source_id);
  return {
    id: f.id, type: f.type, resume: f.resume, citation: f.citation, citation_verifiee: f.citation_verifiee !== false, personne: f.personne, echeance: f.echeance,
    statut: f.statut, corrige: !!f.corrige, valide_par: f.valide_par || null, valide_le: f.valide_le || null, candidats: f.candidats || [],
    date: s?.date || f.cree_le,
    source: s ? { id: s.id, type: s.type, titre: s.titre, auteur: s.auteur, date: s.date, lien_original: s.lien_original || null } : null,
    fiches: liensDu(f.id).map((l) => ({ type_entite: l.type_entite, entite_id: l.entite_id, libelle: libelleEntite(l.type_entite, l.entite_id), lien: lienEntite(l.type_entite, l.entite_id) })),
  };
}

/** Valider, corriger (résumé, type, fiches), rejeter. */
export function trancher(faitId, { action, par, resume, type, fiches } = {}) {
  const f = Records.get(FAIT, faitId);
  if (!f) return { ok: false, error: 'Fait introuvable.' };
  if (action === 'rejeter') { Records.update(FAIT, f.id, { statut: 'rejete', valide_par: par, valide_le: maintenant() }); return { ok: true }; }
  if (action !== 'valider' && action !== 'corriger') return { ok: false, error: 'Action inconnue.' };
  const patch = { statut: 'valide', valide_par: par, valide_le: maintenant(), candidats: [] };
  if (action === 'corriger') {
    patch.corrige = true;
    if (String(resume || '').trim()) patch.resume = String(resume).trim().slice(0, 400);
    if (TYPES_FAIT.includes(type)) patch.type = type;
    if (Array.isArray(fiches)) {
      for (const l of liensDu(f.id)) Records.delete(LIEN, l.id);
      for (const x of fiches.filter((y) => TYPES_ENTITE.includes(y?.type_entite) && y?.entite_id)) Records.create(LIEN, { fait_id: f.id, type_entite: x.type_entite, entite_id: String(x.entite_id) });
    }
  }
  // Un fait encore « à rattacher » se valide quand même : il reste sans fiche, mais on le retrouve par la recherche.
  Records.update(FAIT, f.id, patch);
  return { ok: true, fait: resumeFait(Records.get(FAIT, f.id)) };
}

/** Valide d'un coup les faits en attente d'une source. */
export function validerLot(sourceId, { par }) {
  const enAttente = Records.list(FAIT).filter((f) => f.source_id === sourceId && (f.statut === 'a_valider' || f.statut === 'a_rattacher'));
  for (const f of enAttente) Records.update(FAIT, f.id, { statut: 'valide', valide_par: par, valide_le: maintenant() });
  return { ok: true, valides: enAttente.length };
}

/** La file À valider, groupée par source, la plus récente d'abord. */
export function aValider() {
  const faits = Records.list(FAIT).filter((f) => f.statut === 'a_valider' || f.statut === 'a_rattacher');
  const parSource = new Map();
  for (const f of faits) { if (!parSource.has(f.source_id)) parSource.set(f.source_id, []); parSource.get(f.source_id).push(resumeFait(f)); }
  return [...parSource.entries()].map(([id, liste]) => {
    const s = Records.get(SOURCE, id);
    return { source: s ? { id: s.id, type: s.type, titre: s.titre, auteur: s.auteur, date: s.date, extrait: s.contenu.slice(0, 400) } : { id }, faits: liste };
  }).sort((a, b) => String(b.source.date || '').localeCompare(String(a.source.date || '')));
}

export const nombreAValider = () => Records.list(FAIT).filter((f) => f.statut === 'a_valider' || f.statut === 'a_rattacher').length;

// --- 4. La restitution ----------------------------------------------------------------------

/** Pure : la pertinence d'un fait pour une question (mots communs, fiches nommées comprises). */
export function pertinence(question, fait) {
  const q = mots(question);
  if (!q.length) return 1;
  const texte = ` ${norm([fait.resume, fait.citation, fait.personne, fait.type, fait.source?.titre, ...(fait.fiches || []).map((x) => x.libelle)].filter(Boolean).join(' '))} `;
  return q.filter((m) => texte.includes(` ${m}`)).length / q.length;
}

/**
 * Cherche dans les faits validés. Filtres : type, type_entite + entite_id,
 * personne, depuis / jusqua (AAAA-MM-JJ). Les plus pertinents, puis les plus récents.
 */
export function chercher({ question = '', type = null, type_entite = null, entite_id = null, personne = null, depuis = null, jusqua = null, limite = 12 } = {}, { par = null } = {}) {
  let faits = Records.list(FAIT).filter((f) => f.statut === 'valide');
  if (type) faits = faits.filter((f) => f.type === type);
  if (type_entite && entite_id) { const ids = new Set(Records.list(LIEN).filter((l) => l.type_entite === type_entite && l.entite_id === entite_id).map((l) => l.fait_id)); faits = faits.filter((f) => ids.has(f.id)); }
  if (personne) faits = faits.filter((f) => norm(f.personne).includes(norm(personne)));
  let liste = faits.map(resumeFait);
  if (depuis) liste = liste.filter((f) => String(f.date).slice(0, 10) >= depuis);
  if (jusqua) liste = liste.filter((f) => String(f.date).slice(0, 10) <= jusqua);
  const notes = liste.map((f) => ({ f, p: pertinence(question, f) })).filter((x) => !question || x.p >= 0.34);
  notes.sort((a, b) => b.p - a.p || String(b.f.date).localeCompare(String(a.f.date)));
  const trouves = notes.slice(0, limite).map((x) => x.f);
  // Chaque question sur le passé est comptée : c'est le critère d'usage réel du MVP.
  if (par) Records.create(RECHERCHE, { par: String(par).toLowerCase(), question: String(question).slice(0, 300), trouves: trouves.length, le: maintenant() });
  return trouves;
}

/** La frise d'une fiche : ses faits validés, du plus récent au plus ancien. */
export function historique(type_entite, entite_id) {
  const ids = new Set(Records.list(LIEN).filter((l) => l.type_entite === type_entite && l.entite_id === String(entite_id)).map((l) => l.fait_id));
  return Records.list(FAIT).filter((f) => ids.has(f.id) && f.statut === 'valide').map(resumeFait).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function savoir() {
  return Records.list(FAIT).filter((f) => f.type === 'savoir' && f.statut === 'valide').map(resumeFait).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function sources({ limite = 200 } = {}) {
  return Records.list(SOURCE).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, limite)
    .map((s) => ({ id: s.id, type: s.type, titre: s.titre, auteur: s.auteur, date: s.date, statut_extraction: s.statut_extraction, faits: s.faits || 0, doublons: s.doublons || 0, lien_original: s.lien_original, extrait: s.contenu.slice(0, 280), erreur: s.erreur || null }));
}

export const source = (id) => Records.get(SOURCE, id);

// --- 5. Les mesures du MVP ------------------------------------------------------------------

/** Les critères de réussite qui se mesurent seuls (le banc de 20 questions et le temps de validation se suivent à part). */
export function mesures({ jours = 14, maintenantD = new Date() } = {}) {
  const depuis = new Date(maintenantD.getTime() - jours * 86400000).toISOString();
  const tranches = Records.list(FAIT).filter((f) => f.valide_le && f.valide_le >= depuis && f.statut !== 'a_valider');
  const valides = tranches.filter((f) => f.statut === 'valide' && f.source_id && Records.get(SOURCE, f.source_id)?.type !== 'decision');
  const recherches = Records.list(RECHERCHE).filter((r) => r.le >= depuis);
  const decisions = Records.list('Deal').flatMap((d) => (d.suivi || []).filter((s) => s.type === 'statut' && (s.vers === 'abandonne' || s.vers === 'projet_cree') && s.le >= depuis).map((s) => ({ d, s })));
  const motivees = decisions.filter(({ d, s }) => motifDe(d, s));
  return {
    jours,
    a_valider: nombreAValider(),
    extraction: { tranches: tranches.length, sans_correction: valides.filter((f) => !f.corrige).length, rejetes: tranches.filter((f) => f.statut === 'rejete').length },
    questions: { total: recherches.length, personnes: [...new Set(recherches.map((r) => r.par))].length, sans_reponse: recherches.filter((r) => !r.trouves).length },
    decisions: { total: decisions.length, motivees: motivees.length },
  };
}

// --- 6. La question des décisions sans motif ------------------------------------------------

const ACCEPTE_REFUSE = { abandonne: 'refusé', projet_cree: 'accepté' };
const NOTE_AUTO = /^[^→]+ → [^→]+$/;

/** Pure : le motif d'un changement de statut (la note, ou un fait de décision rattaché au dossier depuis). */
export function motifDe(deal, ligne) {
  const note = String(ligne?.detail || '').trim();
  if (note && !NOTE_AUTO.test(note)) return note;
  if (deal?.conclusion?.motif) return deal.conclusion.motif;
  if (deal?.decision?.raison) return deal.decision.raison;
  const ids = new Set(Records.list(LIEN).filter((l) => l.type_entite === 'dossier' && l.entite_id === deal?.deal_id).map((l) => l.fait_id));
  return Records.list(FAIT).find((f) => ids.has(f.id) && f.type === 'decision' && f.statut === 'valide' && (f.valide_le || '') >= String(ligne?.le || ''))?.resume || null;
}

const PAR_JOUR = 3;

/**
 * Un dossier passe en accepté ou refusé sans motif : une question à la
 * personne qui a changé le statut. Une seule ouverte à la fois, trois par jour
 * au plus ; les suivantes attendent leur tour.
 */
export function surDecision(deal, statut, { user, note } = {}) {
  const quoi = ACCEPTE_REFUSE[statut];
  const pour = String(user?.email || '').toLowerCase();
  if (!quoi || !pour || user?.role !== 'admin') return null;
  if (String(note || '').trim() && !NOTE_AUTO.test(String(note).trim())) return null;
  if (deal?.conclusion?.motif || deal?.decision?.raison) return null;
  if (Records.list(QUESTION).some((q) => q.deal_id === deal.deal_id && q.statut_vise === statut && q.etat !== 'abandonnee')) return null;
  const nom = libelleEntite('dossier', deal.deal_id) || 'Ce dossier';
  const q = Records.create(QUESTION, { pour, deal_id: deal.deal_id, statut_vise: statut, texte: `${nom} ${quoi} : pourquoi, en une phrase ?`, etat: 'en_attente', cree_le: maintenant() });
  poserLaSuivante(pour);
  return Records.get(QUESTION, q.id);
}

/** Pose la prochaine question en attente de la personne, si aucune n'est ouverte et le plafond du jour pas atteint. */
export function poserLaSuivante(pour, { maintenantD = new Date() } = {}) {
  const siennes = Records.list(QUESTION).filter((q) => q.pour === pour);
  if (siennes.some((q) => q.etat === 'posee')) return null;
  const jour = maintenantD.toISOString().slice(0, 10);
  if (siennes.filter((q) => String(q.posee_le || '').startsWith(jour)).length >= PAR_JOUR) return null;
  const suivante = siennes.filter((q) => q.etat === 'en_attente').sort((a, b) => String(a.cree_le).localeCompare(String(b.cree_le)))[0];
  if (!suivante) return null;
  Records.update(QUESTION, suivante.id, { etat: 'posee', posee_le: maintenantD.toISOString() });
  try {
    notifier({
      pour, titre: suivante.texte, texte: 'Répondez dans le chat : la réponse rejoint le Cerveau, rattachée au dossier.',
      lien: `/TableauDeBord?cerveau_question=${suivante.id}`, action: 'Répondre', genre: 'question', cle: `cerveau-question-${suivante.id}`,
    });
  } catch { /* la question reste posée : AK la repose dans le chat */ }
  return Records.get(QUESTION, suivante.id);
}

/** La question ouverte d'une personne, s'il y en a une. */
export const questionOuverte = (email) => Records.list(QUESTION).find((q) => q.pour === String(email || '').toLowerCase() && q.etat === 'posee') || null;

/**
 * La réponse à une question : une source « decision », dont le fait est validé
 * d'office (il vient de la personne qui a décidé), rattaché au dossier.
 */
export async function repondre(questionId, texte, { user }) {
  const q = Records.get(QUESTION, questionId);
  if (!q) return { ok: false, error: 'Question introuvable.' };
  if (q.etat === 'repondue') return { ok: false, error: 'Déjà répondue.' };
  const motif = String(texte || '').trim();
  if (!motif) return { ok: false, error: 'Réponse vide.' };
  const s = ajouterSource({ type: 'decision', auteur: user?.email, titre: q.texte, contenu: `Question : ${q.texte}\nRéponse de ${user?.email || 'l\'équipe'} : ${motif}`, liens: [{ type_entite: 'dossier', entite_id: q.deal_id }], cle: `question-${q.id}` });
  if (!s.ok) return s;
  // Le fait ne dépend pas de l'IA : la réponse est le motif, tel quel.
  const nom = libelleEntite('dossier', q.deal_id) || 'Le dossier';
  const r = rangerFaits(s.source, [{ type: 'decision', resume: `${nom} ${ACCEPTE_REFUSE[q.statut_vise] || 'tranché'} : ${motif}`, citation: motif, personne: user?.email || null, entites: [] }], { valideD_office: String(user?.email || 'equipe').toLowerCase() });
  Records.update(QUESTION, q.id, { etat: 'repondue', repondue_le: maintenant(), fait_id: r.faits[0]?.id || null });
  poserLaSuivante(q.pour);
  return { ok: true, fait: r.faits[0] ? resumeFait(r.faits[0]) : null };
}

// --- Les débriefs du chat -------------------------------------------------------------------

/** Pure : ce message est-il un débrief (« retiens que… », « note que… ») ? Rend le texte à garder, ou null. */
export function debriefDe(message) {
  const m = /^\s*(?:ak[\s,:]+)?(?:retiens|retenez|note|notez)\s+(?:bien\s+)?(?:que|qu['’])\s*([\s\S]+)$/i.exec(String(message || ''));
  return m && m[1].trim().length > 3 ? m[1].trim() : null;
}

/** Un débrief du chat : une source, puis ses faits extraits, en attente de validation. */
export async function noter(texte, { user, liens = [] } = {}) {
  const s = ajouterSource({ type: 'debrief', auteur: user?.email, titre: String(texte).slice(0, 80), contenu: texte, liens });
  if (!s.ok) return s;
  const r = await extraire(s.source.id);
  return { ...r, source_id: s.source.id };
}

// --- Les transcriptions du mode appel -------------------------------------------------------

/**
 * Un appel validé entre dans le Cerveau, sans geste de l'analyste : sa
 * transcription (jamais l'audio), rattachée d'office à l'agent et à l'agence.
 * L'extraction tourne en fond ; un essai n'entre pas.
 */
export function depuisAppel(appel, { par = null, agence = null } = {}) {
  const texte = String(appel?.transcription_gardee || '').trim();
  if (!texte || appel?.essai) return null;
  const liens = [appel.agent_id && { type_entite: 'agent', entite_id: appel.agent_id }, (appel.agence_id || agence?.id) && { type_entite: 'agence', entite_id: appel.agence_id || agence.id }].filter(Boolean);
  const qui = [appel.agent || libelleEntite('agent', appel.agent_id), agence?.nom].filter(Boolean).join(', ');
  const s = ajouterSource({
    type: 'appel', auteur: par || appel.par, date: appel.le || null, titre: `Appel${qui ? ` : ${qui}` : ''}`,
    contenu: `${appel.notes ? `Notes de l'analyste : ${appel.notes}\n\n` : ''}${texte}`, lien_original: '/Prospection?onglet=suivi', liens, cle: `appel-${appel.id}`,
  });
  if (s.ok && !s.deja) extraire(s.source.id).catch(() => {});
  return s.source || null;
}

/** L'historique : les transcriptions déjà gardées (depuis le 13 oct.), des trois derniers mois. */
export function importerAppelsGardes({ jours = 92 } = {}) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();
  let n = 0;
  for (const a of Records.list('AppelAgent').filter((x) => x.transcription_gardee && String(x.le || x.created_date || '') >= depuis && x.etat !== 'remplace')) {
    if (Records.list(SOURCE).some((s) => s.cle === `appel-${a.id}`)) continue;
    if (depuisAppel(a, { agence: a.agence_id ? Records.get('AgenceProspect', a.agence_id) : null })) n += 1;
  }
  return { ok: true, importes: n };
}
