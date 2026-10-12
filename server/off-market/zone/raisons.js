// Off-market, mode Simple : le score « Zone » (spec de Jules du 11 oct. 2026).
// Jules juge un point en un clic, puis dit pourquoi, librement, à la voix ou au
// clavier (« bien, mais mal placé : rien d'autre dans la rue »). On ne lui
// fait pas cocher de cases : l'IA lit son texte et en tire les raisons
// ci-dessous, qui servent aux statistiques, aux exemples Street View et à
// l'explication. Le texte reste ce qui fait foi.

export const RAISONS = {
  quartier_residentiel: 'Quartier résidentiel',
  rue_sans_commerces: 'Rue sans commerces',
  rue_degradee: 'Rue dégradée',
  flux_trop_faible: 'Flux trop faible',
  pas_de_touristes: 'Pas de touristes',
  activite_hors_cible: 'Activité hors cible',
  local_trop_petit: 'Local trop petit',
  bon_emplacement: 'Bon emplacement',
  rue_commercante: 'Rue commerçante',
  forte_frequentation: 'Forte fréquentation',
  enseigne_de_qualite: 'Enseigne de qualité',
  voisinage_attractif: 'Voisinage attractif',
};

/** Les raisons qui se voient sur une photo de la rue : leur jugement devient un exemple pour la revue Street View. */
export const RAISONS_VISUELLES = ['rue_degradee', 'rue_commercante', 'voisinage_attractif'];

export const VERDICTS = { interessant: 'Intéressant', pas_interessant: 'Pas intéressant', a_revoir: 'À revoir' };

/** Pure : ne garde que des raisons connues, sans doublon. */
export const raisonsValides = (liste) => [...new Set((liste || []).filter((r) => Object.hasOwn(RAISONS, r)))];
