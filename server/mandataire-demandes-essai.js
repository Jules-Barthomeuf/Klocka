// Des clients d'essai aux recherches précises (24 oct. 2026, Jules : « des
// clients avec des recherches plus précises, par exemple Lyon et Mâcon
// uniquement, 500 k, rendement de 7 % minimum et pas de boîte de nuit ;
// d'autres qui ne cherchent qu'à Paris et Bordeaux »). Ils servent à voir le
// carrousel de la Prospection ne montrer à un mandataire que les clients qui
// cherchent dans son secteur.
//
// Posés au démarrage du serveur, une fois (une clé par client), jamais
// effacés ni réécrits : retirés ou retouchés à la main, ils le restent. Ils
// portent `essai: true` et la pastille « Exemple » à l'écran.

import { Records, Meta } from './db.js';

const CLE_META = 'mandataire.clients_essai';

export const CLIENTS_ESSAI = [
  { cle: 'lyon-macon-500', client_nom: 'Antoine Roux', profil: 'Investisseur privé', type_commerce: 'Murs commerciaux occupés', zones: ['Lyon', 'Mâcon'], budget_min: 300000, budget_max: 500000, rendement_min: 7, bail: 'Bail commercial en cours, locataire en place', remarque: 'Lyon et Mâcon uniquement. Pas de boîte de nuit.' },
  { cle: 'paris-bordeaux', client_nom: 'Claire Dumas', profil: 'Family office', type_commerce: 'Murs commerciaux', zones: ['Paris', 'Bordeaux'], budget_min: 800000, budget_max: 1500000, rendement_min: 5.5, bail: null, remarque: 'Paris et Bordeaux seulement, emplacement n°1.' },
  { cle: 'lyon-boulangerie', client_nom: 'Paul Girard', profil: 'Investisseur privé', type_commerce: 'Boulangerie, pharmacie', zones: ['Lyon'], budget_min: 250000, budget_max: 700000, rendement_min: 6, bail: null, remarque: 'Une boulangerie ou une pharmacie, rien d\'autre.' },
  { cle: 'villeurbanne-lyon', client_nom: 'Sophie Marchand', profil: 'Investisseur privé', type_commerce: 'Murs commerciaux', zones: ['Villeurbanne', 'Lyon'], budget_min: 150000, budget_max: 400000, rendement_min: 6.5, bail: null, remarque: 'Pas de restauration, pas de bars.' },
  { cle: 'nice-marseille', client_nom: 'Hugo Lefèvre', profil: 'SCI familiale', type_commerce: 'Murs commerciaux', zones: ['Nice', 'Marseille'], budget_min: 500000, budget_max: 1200000, rendement_min: 6, bail: null, remarque: 'Enseigne nationale comme locataire.' },
  { cle: 'rhone-sante', client_nom: 'Nadia Benali', profil: 'Investisseur privé', type_commerce: 'Murs commerciaux', zones: ['Rhône'], budget_min: 400000, budget_max: 1000000, rendement_min: 6, bail: null, remarque: 'Tout le Rhône. Pas de santé comme locataire.' },
];

/** Pose les clients d'essai qui manquent. Renvoie le nombre de clients posés. */
export function semerClientsEssai() {
  // Les clés déjà posées une fois : un client d'essai supprimé à la main ne revient pas.
  const lues = (() => { try { return JSON.parse(Meta.get(CLE_META) || '[]'); } catch { return []; } })();
  const poses_avant = new Set([...lues, ...Records.list('DemandeClient').map((d) => d.cle_essai).filter(Boolean)]);
  let poses = 0;
  for (const { cle, ...c } of CLIENTS_ESSAI) {
    if (poses_avant.has(cle)) continue;
    Records.create('DemandeClient', { ...c, cle_essai: cle, essai: true, source: 'essai', visible: true, active: true, ouverte_le: new Date().toISOString(), cree_par: 'essai' });
    poses_avant.add(cle);
    poses += 1;
  }
  if (poses) Meta.set(CLE_META, JSON.stringify([...poses_avant]));
  return poses;
}
