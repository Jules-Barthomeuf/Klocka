// Ce que coûte chaque geste.
//
// Le journal disait déjà combien de temps une demande avait pris ; il ne disait
// pas ce qu'elle avait consommé. Or l'extraction envoie des PDF entiers —
// parfois cent pages — et une facture ne se pilote pas à l'aveugle.
//
// La consommation est captée à la source, dans llm.js, puis attribuée à
// l'opération courante grâce à un contexte asynchrone : une demande à
// l'assistant peut déclencher six appels au modèle, ils comptent tous pour elle.

import { AsyncLocalStorage } from 'node:async_hooks';
import { Records } from './db.js';

const contexte = new AsyncLocalStorage();

// Tarifs publics, en dollars par million de jetons. Une lecture de cache coûte
// un dixième d'une entrée neuve, une écriture un quart de plus.
const TARIFS = {
  'claude-opus-5': { entree: 5, sortie: 25 },
  'claude-opus-4-8': { entree: 5, sortie: 25 },
  'claude-sonnet-5': { entree: 2, sortie: 10 },
  'claude-haiku-4-5': { entree: 1, sortie: 5 },
  'claude-fable-5': { entree: 10, sortie: 50 },
};

const PART_CACHE_LECTURE = 0.1;
const PART_CACHE_ECRITURE = 1.25;

/** Coût en dollars d'un appel, ou null si le modèle n'a pas de tarif connu. */
export function coutDe(modele, u) {
  const t = TARIFS[modele];
  if (!t || !u) return null;
  const entree = (u.entree || 0) * t.entree;
  const lecture = (u.cache_lecture || 0) * t.entree * PART_CACHE_LECTURE;
  const ecriture = (u.cache_ecriture || 0) * t.entree * PART_CACHE_ECRITURE;
  const sortie = (u.sortie || 0) * t.sortie;
  return (entree + lecture + ecriture + sortie) / 1_000_000;
}

/**
 * Enregistre la consommation d'un appel. Appelé depuis llm.js.
 * Hors opération identifiée, la ligne est écrite telle quelle : mieux vaut une
 * consommation orpheline qu'une consommation invisible.
 */
export function enregistrerUsage(modele, usage) {
  if (!usage) return;
  const cout = coutDe(modele, usage);
  const courant = contexte.getStore();
  if (courant) {
    courant.appels += 1;
    courant.entree += usage.entree || 0;
    courant.sortie += usage.sortie || 0;
    courant.cache_lecture += usage.cache_lecture || 0;
    courant.cache_ecriture += usage.cache_ecriture || 0;
    courant.cout += cout || 0;
    courant.modele = modele;
    return;
  }
  ecrire({ operation: 'hors contexte', modele, appels: 1, ...usage, cout: cout || 0, par: null });
}

/**
 * Exécute une opération en comptant ce qu'elle consomme.
 * @param {{operation: string, par?: string, sur?: string}} quoi
 */
export async function mesurer(quoi, fn) {
  const compteur = nouveauCompteur();
  const debut = Date.now();
  const resultat = await contexte.run(compteur, fn);
  if (compteur.appels) ecrire(ligneDe(quoi, compteur, Date.now() - debut));
  return { resultat, consommation: compteur };
}

const nouveauCompteur = () => ({ appels: 0, entree: 0, sortie: 0, cache_lecture: 0, cache_ecriture: 0, cout: 0, modele: null });

const ligneDe = (quoi, c, duree_ms) => ({
  operation: quoi.operation,
  par: quoi.par || null,
  sur: quoi.sur || null,
  groupe: quoi.groupe || null,
  libelle: quoi.libelle || null,
  modele: c.modele,
  appels: c.appels,
  entree: c.entree,
  sortie: c.sortie,
  cache_lecture: c.cache_lecture,
  cache_ecriture: c.cache_ecriture,
  cout: c.cout,
  duree_ms,
});

// Ce qu'une route consomme sans être mesurée explicitement est quand même
// attribué : à la personne connectée, à la route, avec la durée de la réponse.
// Une opération mesurée à l'intérieur écrit sa propre ligne, et la route n'en
// écrit pas une seconde : le compteur le plus proche gagne.
export function mesurerRequetes(lireUser) {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const compteur = nouveauCompteur();
    const debut = Date.now();
    res.on('finish', () => {
      if (!compteur.appels) return;
      let par = null;
      try { par = lireUser(req)?.email || null; } catch { /* sans identité */ }
      const route = req.route?.path || req.path;
      ecrire(ligneDe({ operation: libelleRoute(req.method, route), par, sur: req.params?.dealId || req.params?.id || null }, compteur, Date.now() - debut));
    });
    contexte.run(compteur, next);
  };
}

const LIBELLES_ROUTE = [
  [/\/functions\/(\w+)/, (m) => `fonction ${m[1]}`],
  [/\/integrations\/invoke-llm/, () => 'modèle (direct)'],
  [/\/preanalyse\/dossiers\/[^/]+\/matrice/, () => 'matrice'],
  [/\/preanalyse\/dossiers\/[^/]+\/(extraction|extraire)/, () => 'extraction'],
  [/\/preanalyse\/dossiers\/[^/]+\/(conversation|question|converser)/, () => 'chat du dossier'],
  [/\/preanalyse\/dossiers\/[^/]+\/video/, () => 'vidéo'],
  [/\/preanalyse\/dossiers\/[^/]+\/presentation/, () => 'présentation'],
  [/\/preanalyse\/dossiers\/[^/]+\/mails?/, () => 'mail du dossier'],
  [/\/preanalyse\/dossiers\/[^/]+\/(redaction|redact|fiche)/, () => 'rédaction'],
  [/\/preanalyse/, () => 'pré-analyse'],
  [/\/assistant\/boite/, () => 'boîte'],
  [/\/assistant/, () => 'assistant'],
  [/\/mails/, () => 'mails'],
  [/\/monday/, () => 'monday'],
];
function libelleRoute(methode, route) {
  for (const [motif, l] of LIBELLES_ROUTE) { const m = route.match(motif); if (m) return l(m); }
  return `${methode} ${route}`;
}

// Au-delà, l'historique pèse sans rien apprendre de plus.
const PLAFOND = 10000;

function ecrire(ligne) {
  try {
    Records.create('CoutIA', { ...ligne, le: new Date().toISOString() });
    const tout = Records.list('CoutIA');
    if (tout.length > PLAFOND) {
      const trop = tout
        .sort((a, b) => String(a.le || '').localeCompare(String(b.le || '')))
        .slice(0, tout.length - PLAFOND);
      for (const l of trop) Records.delete('CoutIA', l.id);
    }
  } catch (e) {
    console.warn('[couts] ligne non écrite :', e?.message || e);
  }
}

/**
 * Synthèse des coûts sur une fenêtre : par opération, par personne, par jour,
 * et le journal ligne à ligne, du plus récent au plus ancien.
 */
export function syntheseCouts(jours = 30, { limite = 100, par = null } = {}) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();
  const lignes = Records.list('CoutIA').filter((l) => (l.le || '') >= depuis);

  const cumuler = (map, cle, l) => {
    const e = map.get(cle) || { cle, requetes: 0, appels: 0, entree: 0, sortie: 0, cout: 0, duree_ms: 0 };
    e.requetes += 1;
    e.appels += l.appels || 0;
    e.entree += l.entree || 0;
    e.sortie += l.sortie || 0;
    e.cout += l.cout || 0;
    e.duree_ms += l.duree_ms || 0;
    map.set(cle, e);
  };
  const gestes = regrouper(lignes);
  const groupes = par ? gestes.filter((g) => (g.par || 'automatique') === par) : gestes;
  const journal = groupes.slice(0, limite);
  // Par personne, on compte des gestes, pas des appels : une analyse = une requête.
  const gestesPar = new Map();
  for (const g of gestes) gestesPar.set(g.par || 'automatique', (gestesPar.get(g.par || 'automatique') || 0) + 1);

  const parOperation = new Map();
  const parPersonne = new Map();
  const parJour = new Map();
  for (const l of lignes) {
    cumuler(parOperation, l.operation || 'inconnue', l);
    cumuler(parPersonne, l.par || 'automatique', l);
    cumuler(parJour, (l.le || '').slice(0, 10), l);
  }

  for (const [cle, e] of parPersonne) if (gestesPar.has(cle)) e.requetes = gestesPar.get(cle);
  const tri = (m) => [...m.values()].sort((a, b) => b.cout - a.cout);
  return {
    total: {
      appels: lignes.reduce((n, l) => n + (l.appels || 0), 0),
      entree: lignes.reduce((n, l) => n + (l.entree || 0), 0),
      sortie: lignes.reduce((n, l) => n + (l.sortie || 0), 0),
      cout: lignes.reduce((n, l) => n + (l.cout || 0), 0),
    },
    operations: tri(parOperation),
    personnes: tri(parPersonne),
    jours: [...parJour.values()].sort((a, b) => a.cle.localeCompare(b.cle)),
    journal,
    journal_total: groupes.length,
  };
}

// Une analyse lancée d'un clic, c'est un geste : vingt lectures de documents
// étalées sur un quart d'heure font une ligne, qu'on ouvre pour le détail.
// Les lignes portent un groupe explicite quand l'opération le sait ; sinon,
// la même opération par la même personne, sans trou de plus de dix minutes,
// forme un groupe.
const TROU_MAX_MS = 10 * 60000;
function regrouper(lignes) {
  const chrono = [...lignes].sort((a, b) => String(a.le || '').localeCompare(String(b.le || '')));
  const ouverts = new Map(); // clé → groupe en cours
  const tous = [];
  for (const l of chrono) {
    const t = Date.parse(l.le || '') || 0;
    const debutLigne = t - (l.duree_ms || 0);
    const cle = l.groupe || `${l.operation || 'inconnue'}|${l.par || ''}`;
    let g = ouverts.get(cle);
    if (g && !l.groupe && debutLigne - g.fin_ms > TROU_MAX_MS) g = null;
    if (!g) {
      g = { id: l.id, groupe: l.groupe || null, operation: l.operation || 'inconnue', par: l.par || null, modele: l.modele || null,
        debut_ms: debutLigne, fin_ms: t, appels: 0, entree: 0, sortie: 0, cache_lecture: 0, cout: 0, lignes: [], sur: new Set() };
      ouverts.set(cle, g); tous.push(g);
    }
    g.debut_ms = Math.min(g.debut_ms, debutLigne);
    g.fin_ms = Math.max(g.fin_ms, t);
    g.appels += l.appels || 0; g.entree += l.entree || 0; g.sortie += l.sortie || 0; g.cache_lecture += l.cache_lecture || 0; g.cout += l.cout || 0;
    if (l.modele) g.modele = l.modele;
    if (l.sur) g.sur.add(l.sur);
    g.lignes.push({ id: l.id, le: l.le, libelle: l.libelle || null, sur: l.sur || null, modele: l.modele || null, appels: l.appels || 0,
      entree: l.entree || 0, sortie: l.sortie || 0, cout: l.cout || 0, duree_ms: l.duree_ms ?? null });
  }
  return tous
    .sort((a, b) => b.fin_ms - a.fin_ms)
    .map((g) => ({
      id: g.id, groupe: g.groupe, operation: g.operation, par: g.par, modele: g.modele,
      debut: new Date(g.debut_ms).toISOString(), fin: new Date(g.fin_ms).toISOString(),
      // La durée d'un geste isolé est celle de sa requête ; celle d'une série va du premier au dernier appel.
      duree_ms: g.lignes.length === 1 ? g.lignes[0].duree_ms : g.fin_ms - g.debut_ms,
      appels: g.appels, entree: g.entree, sortie: g.sortie, cache_lecture: g.cache_lecture, cout: g.cout,
      sur: [...g.sur], etapes: g.lignes.length, lignes: g.lignes.sort((a, b) => String(a.le).localeCompare(String(b.le))),
    }));
}
