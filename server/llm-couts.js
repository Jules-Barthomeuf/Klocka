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
  const compteur = { appels: 0, entree: 0, sortie: 0, cache_lecture: 0, cache_ecriture: 0, cout: 0, modele: null };
  const resultat = await contexte.run(compteur, fn);
  if (compteur.appels) {
    ecrire({
      operation: quoi.operation,
      par: quoi.par || null,
      sur: quoi.sur || null,
      modele: compteur.modele,
      appels: compteur.appels,
      entree: compteur.entree,
      sortie: compteur.sortie,
      cache_lecture: compteur.cache_lecture,
      cache_ecriture: compteur.cache_ecriture,
      cout: compteur.cout,
    });
  }
  return { resultat, consommation: compteur };
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

/** Synthèse des coûts sur une fenêtre : par opération, par personne, par jour. */
export function syntheseCouts(jours = 30) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();
  const lignes = Records.list('CoutIA').filter((l) => (l.le || '') >= depuis);

  const cumuler = (map, cle, l) => {
    const e = map.get(cle) || { cle, appels: 0, entree: 0, sortie: 0, cout: 0 };
    e.appels += l.appels || 0;
    e.entree += l.entree || 0;
    e.sortie += l.sortie || 0;
    e.cout += l.cout || 0;
    map.set(cle, e);
  };

  const parOperation = new Map();
  const parPersonne = new Map();
  const parJour = new Map();
  for (const l of lignes) {
    cumuler(parOperation, l.operation || 'inconnue', l);
    cumuler(parPersonne, l.par || 'automatique', l);
    cumuler(parJour, (l.le || '').slice(0, 10), l);
  }

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
  };
}
