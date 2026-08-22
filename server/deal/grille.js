// Grille de lecture d'un dossier d'investissement commercial.
//
// Source unique : le dépouillement d'un document ne relève PAS ce qu'il trouve,
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

// La catégorie choisie sur le document (libellé affiché) mène à son type de
// grille. Un document non classé n'a pas de grille : on relève alors ce qui
// s'y trouve, librement.
const PAR_CATEGORIE = {
  'Bail commercial': 'bail',
  "Assemblée générale": 'pv_ag',
  'PV AG': 'pv_ag',
  'Règlement de copropriété': 'rcp',
  RCP: 'rcp',
  Quittances: 'quittances',
  Diagnostics: 'diagnostics',
};

export function typeDepuisCategorie(categorie, nom = '') {
  if (categorie && PAR_CATEGORIE[categorie]) return PAR_CATEGORIE[categorie];
  // Repli sur le nom du fichier quand la catégorie n'est pas renseignée.
  const n = `${categorie || ''} ${nom}`.toLowerCase();
  if (/\bbail\b/.test(n)) return 'bail';
  if (/\bag\b|assembl|proc[èe]s|\bpv\b/.test(n)) return 'pv_ag';
  if (/copropri[ée]t[ée]|r[èe]glement|\brcp\b/.test(n)) return 'rcp';
  if (/quittance|loyer/.test(n)) return 'quittances';
  if (/diagnostic|dpe|amiante|termite|plomb|\berp\b/.test(n)) return 'diagnostics';
  return null;
}
