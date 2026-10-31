// Les clients de test (31 oct. 2026, Jules, PLAN.md 0.1) : des recherches précises pour suivre le parcours mandataire
// sans vrai client. Ils portent `test: true` : l'équipe les voit avec la pastille « Test » (Clients, Prospection), un
// compte mandataire ne les voit jamais (demandesVisibles, server/mandataire-espace.js).
//
// Posés au démarrage du serveur, une fois (une clé par client), jamais effacés ni réécrits : retirés ou retouchés à
// la main, ils le restent. Les deux premiers reprennent les clés des clients d'essai du 24 oct. (`essai: true`, de
// test eux aussi) : une base qui les a déjà ne les double pas. Les quatre autres clients d'essai de ce jour-là, déjà
// posés, restent en base comme clients de test ; ils ne sont plus semés.

import { Records, Meta } from './db.js';

const CLE_META = 'mandataire.clients_essai';

export const CLIENTS_TEST = [
  { cle: 'lyon-macon-500', client_nom: 'Antoine Roux', profil: 'Investisseur privé', type_commerce: 'Murs commerciaux occupés', zones: ['Lyon', 'Mâcon'], budget_min: 300000, budget_max: 500000, rendement_min: 7, bail: 'Bail commercial en cours, locataire en place', remarque: 'Lyon et Mâcon uniquement. Pas de boîte de nuit.' },
  { cle: 'paris-bordeaux', client_nom: 'Claire Dumas', profil: 'Family office', type_commerce: 'Murs commerciaux', zones: ['Paris', 'Bordeaux'], budget_min: 800000, budget_max: 1500000, rendement_min: 5.5, bail: null, remarque: 'Paris et Bordeaux uniquement.' },
  { cle: 'alpes-maritimes-alimentaire', client_nom: 'Marc Olivier', profil: 'Investisseur privé', type_commerce: 'Alimentaire', zones: ['Alpes-Maritimes'], budget_min: 300000, budget_max: 500000, rendement_min: 6, bail: null, remarque: 'Commerce alimentaire uniquement, dans les Alpes-Maritimes.' },
  { cle: 'antibes-1-3m', client_nom: 'Léa Fabre', profil: 'Investisseur privé', type_commerce: 'Murs commerciaux', zones: ['Antibes'], budget_min: 1000000, budget_max: 3000000, rendement_min: null, bail: null, remarque: 'Antibes uniquement.' },
];

/** Pose les clients de test qui manquent. Renvoie le nombre de clients posés. */
export function semerClientsTest() {
  // Les clés déjà posées une fois : un client de test supprimé à la main ne revient pas.
  const lues = (() => { try { return JSON.parse(Meta.get(CLE_META) || '[]'); } catch { return []; } })();
  const poses_avant = new Set([...lues, ...Records.list('DemandeClient').map((d) => d.cle_essai).filter(Boolean)]);
  let poses = 0;
  for (const { cle, ...c } of CLIENTS_TEST) {
    if (poses_avant.has(cle)) continue;
    Records.create('DemandeClient', { ...c, cle_essai: cle, test: true, source: 'test', visible: true, active: true, ouverte_le: new Date().toISOString(), cree_par: 'test' });
    poses_avant.add(cle);
    poses += 1;
  }
  if (poses) Meta.set(CLE_META, JSON.stringify([...poses_avant]));
  return poses;
}
