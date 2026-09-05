// Grille de lecture d'un dossier d'investissement commercial.
//
// Source unique : l'extraction d'un document ne relève PAS ce qu'il trouve,
// il répond à cette liste, élément par élément. Chaque ligne produite porte son
// constat, un statut et un commentaire — la même grammaire que la grille papier.

export const STATUTS_LIGNE = [
  'Conforme',
  'À vérifier',
  'Point de vigilance',
  'Non renseigné',
];

export const GRILLE = [
  {
    type: 'bail',
    label: 'Bail',
    elements: [
      'Date de début / date de fin',
      'Les parties',
      'Conditions financières',
      'Désignation du bail',
      'Droit de cession ou non',
      'Indexation',
      'Dépôt de garantie & pas de porte',
      'Charges (qui paie quoi ?)',
    ],
  },
  {
    type: 'pv_ag',
    label: 'PV AG',
    elements: [
      'Travaux votés',
      'Travaux en discussion',
      'Résolutions non votées (récurrentes)',
    ],
  },
  {
    type: 'rcp',
    label: 'RCP',
    elements: [
      'Activités autorisées',
      'Activités non autorisées',
      'Quote-part & tantièmes',
    ],
  },
  {
    type: 'quittances',
    label: 'Quittances',
    elements: [
      'Prix du loyer HC HT',
      'Assujettissement à la TVA',
    ],
  },
  {
    type: 'diagnostics',
    label: 'Diagnostics',
    elements: ['DPE', 'Amiante', 'ERP', 'Termites', 'Plomb', 'Électricité'],
  },
];

export const grilleDe = (type) => GRILLE.find((g) => g.type === type) || null;

// Le PV d'AG se lit par blocs, une ligne par résolution : les trois éléments
// de la grille papier deviennent des blocs, complétés de ce qui, dans un PV,
// pèse sur un acquéreur — l'argent, les procédures, la gestion.
export const BLOCS_PV_AG = [
  'Travaux votés',
  'Travaux en discussion',
  'Résolutions non votées (récurrentes)',
  'Finances, charges et impayés',
  'Procédures et contentieux',
  'Gestion et syndic',
  'Autres décisions',
];

// La catégorie choisie sur le document (libellé affiché) mène à son type de
// grille. Un document non classé n'a pas de grille : on relève alors ce qui
// s'y trouve, librement.
const PAR_CATEGORIE = {
  'Bail commercial': 'bail',
  Bail: 'bail',
  Avenants: 'avenants',
  Acte: 'acte',
  "Assemblée générale": 'pv_ag',
  'PV AG': 'pv_ag',
  "PV d'AG copro": 'pv_ag',
  "PV d'AG preneur": 'pv_ag_preneur',
  'Règlement de copropriété': 'rcp',
  RCP: 'rcp',
  EDD: 'edd',
  Quittances: 'quittances',
  Diagnostics: 'diagnostics',
  Kbis: 'kbis',
  'Plans & Carrez': 'plans',
  'Appels de charges': 'charges',
  'Taxe foncière': 'taxe_fonciere',
  Autre: 'autre',
};

// La liste fermée des catégories : rien ne reste « À classer ». Ce qui n'est
// pas reconnu est « Autre », et indexé quand même.
export const CATEGORIES = [
  'Acte', 'Bail commercial', 'Avenants', 'Quittances', 'Kbis', "PV d'AG preneur", 'Plans & Carrez',
  'Diagnostics', 'Règlement de copropriété', 'EDD', "PV d'AG copro", 'Appels de charges', 'Taxe foncière', 'Autre',
];

// Libellé de catégorie affiché pour un type de grille : le classement
// automatique doit poser la même valeur que le menu déroulant de l'analyste.
export const CATEGORIE_PAR_TYPE = {
  acte: 'Acte',
  bail: 'Bail commercial',
  avenants: 'Avenants',
  quittances: 'Quittances',
  kbis: 'Kbis',
  pv_ag_preneur: "PV d'AG preneur",
  plans: 'Plans & Carrez',
  diagnostics: 'Diagnostics',
  rcp: 'Règlement de copropriété',
  edd: 'EDD',
  pv_ag: "PV d'AG copro",
  charges: 'Appels de charges',
  taxe_fonciere: 'Taxe foncière',
  autre: 'Autre',
};

/** Catégorie devinée depuis le seul nom de fichier, ou null. */
export function categorieDepuisNom(nom = '') {
  const type = typeDepuisCategorie(null, nom);
  return type ? CATEGORIE_PAR_TYPE[type] || null : null;
}

export function typeDepuisCategorie(categorie, nom = '') {
  if (categorie && PAR_CATEGORIE[categorie]) return PAR_CATEGORIE[categorie];
  // Repli sur le nom du fichier quand la catégorie n'est pas renseignée.
  // Underscores, tirets et points comptent comme des séparateurs : sans cela
  // « BAIL_COM_2024.pdf » échappe à \bbail\b, le tiret bas étant un caractère
  // de mot.
  const n = `${categorie || ''} ${nom}`.toLowerCase().replace(/[_\-.]+/g, ' ');
  if (/avenant/.test(n)) return 'avenants';
  if (/\bbail\b/.test(n)) return 'bail';
  if (/\bacte\b|notari|vente|compromis|promesse/.test(n)) return 'acte';
  if (/kbis|k bis|extrait rcs|bilan|liasse/.test(n)) return 'kbis';
  if (/\bedd\b|descriptif de division|etat descriptif/.test(n)) return 'edd';
  if (/copropri[ée]t[ée]|r[èe]glement|\brcp\b/.test(n)) return 'rcp';
  if (/(\bag\b|assembl|proc[èe]s|\bpv\b).*(preneur|locataire|sarl|sas|societe|associ)/.test(n)) return 'pv_ag_preneur';
  if (/\bag\b|assembl|proc[èe]s|\bpv\b/.test(n)) return 'pv_ag';
  if (/quittance|appel de loyer|loyer/.test(n)) return 'quittances';
  if (/appel de charges|charges|budget|fonds/.test(n)) return 'charges';
  if (/taxe fonci|fonci[èe]re|teom/.test(n)) return 'taxe_fonciere';
  if (/carrez|mesurage|\bplan/.test(n)) return 'plans';
  if (/diagnostic|dpe|amiante|termite|plomb|\berp\b|electric|parasit/.test(n)) return 'diagnostics';
  return null;
}
