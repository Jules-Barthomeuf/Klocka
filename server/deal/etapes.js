// Les six étapes d'un dossier, source unique partagée par le serveur et le
// front (le front importe le même descripteur via l'API).
//
// Une étape n'est accessible que si elle a été DÉBLOQUÉE : l'utilisateur passe
// explicitement à la suivante. `etape_max` vit à plat sur le Deal ; pour les
// dossiers antérieurs, elle se déduit du statut (migration paresseuse).

export const ETAPES = [
  { n: 1, id: 'mail', label: 'Mail', sub: 'agent' },
  { n: 2, id: 'preanalyse', label: 'Pré-analyse', sub: 'fiche du bien' },
  { n: 3, id: 'analyse', label: 'Analyse', sub: 'documents et décision' },
  { n: 4, id: 'video', label: 'Vidéo', sub: 'présentation client' },
  { n: 5, id: 'plateforme', label: 'Plateforme', sub: 'création du projet' },
  { n: 6, id: 'presentation', label: 'Présentation', sub: 'dossier banque' },
];

// Étape minimale déduite du statut, pour les dossiers créés avant `etape_max`.
const PAR_STATUT = {
  analyse: 2,
  documents_demandes: 3,
  documents_recus: 3,
  depouille: 4,
  projet_cree: 6,
  abandonne: 3,
};

export function etapeMax(deal) {
  const stockee = Number(deal?.etape_max);
  // Une valeur explicite fait foi — y compris pour revenir en arrière. Le
  // statut ne sert qu'aux dossiers antérieurs à `etape_max`, et une coquille
  // nommée sans lots démarre à l'étape 1 quel que soit son statut par défaut.
  if (isFinite(stockee) && stockee >= 1) return Math.min(ETAPES.length, stockee);
  const deduite = (deal?.lots?.length ? PAR_STATUT[deal?.statut || 'analyse'] : 1) || 1;
  return Math.min(ETAPES.length, Math.max(1, deduite));
}

export const etapeParId = (id) => ETAPES.find((e) => e.id === id) || null;
