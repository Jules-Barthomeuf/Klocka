// Le projet vitrine de la découverte : un local commercial à 7 %.
//
// Un inscrit doit voir tout de suite ce que Klocka construit — un vrai
// dossier, chiffré. Tant que l'équipe n'a pas coché « vitrine » sur un projet
// réel anonymisé, celui-ci tient la place : réaliste, cohérent avec le
// simulateur, et il s'efface de lui-même dès qu'un projet vitrine réel existe.

import { Records } from './db.js';

export const PROJET_VITRINE = {
  titre: 'Local commercial loué — Lyon 7e',
  adresse_complete: 'Avenue Jean Jaurès, 69007 Lyon',
  statut: 'prospect',
  vitrine: true,
  demo_vitrine: true,
  archived: false,
  client_email: '',
  client_emails: [],
  admin_principal: null,
  // Le bien
  surface_m2: 180,
  sim_surface: 180,
  prix_acquisition: 900000,
  sim_prix_bien_fai: 950000,
  sim_prix_bien_negocie: 900000,
  // Le loyer : 63 000 € HT HC, soit 7,0 % du prix négocié
  sim_loyer_initial_ht: 63000,
  rendement_locatif: 7,
  sim_indexation_loyers: 2,
  sim_annee_revente: 20,
  // Les frais, aux réglages standard
  sim_droits_enregistrement: 8,
  sim_fees_klocka: 8,
  sim_fees_klocka_type: 'pourcentage',
  sim_incentive_klocka: 20,
  sim_frais_dossier_bancaire: 1500,
  sim_cout_creation_societe: 500,
  sim_frais_courtage: 0,
  // Le financement
  sim_apport: 160000,
  sim_taux_interet: 3.9,
  sim_duree_credit: 20,
  sim_taux_assurance: 0.25,
  // Ce qu'on dit du bien
  notes_bien:
    "Local de 180 m² en pied d'immeuble, angle passant, loué à une enseigne alimentaire de proximité sous bail commercial 3/6/9 signé récemment. Loyer 63 000 € HT HC par an, charges et taxe foncière refacturées.",
  description_ville: "Lyon, deuxième aire urbaine de France : une démographie qui croît, un tissu commercial dense et des loyers commerciaux qui tiennent dans le temps.",
  description_secteur: "Le 7e arrondissement, autour de Jean Macé et Gerland : quartiers en transformation, flux quotidiens forts, commerces de proximité recherchés.",
  ville_secteur_champ1: 'Lyon 7e',
};

/** Le projet vitrine existe, une fois ; il se met à jour si le gabarit change. */
export function assurerProjetVitrine() {
  const existant = Records.list('Project').find((p) => p.demo_vitrine);
  if (existant) {
    // On réaligne les chiffres sur le gabarit sans toucher au reste.
    Records.update('Project', existant.id, { ...PROJET_VITRINE, archived: existant.archived === true ? true : false });
    return existant;
  }
  const p = Records.create('Project', PROJET_VITRINE, 'klocka');
  console.log(`[seed] projet vitrine créé : ${p.titre}`);
  return p;
}
