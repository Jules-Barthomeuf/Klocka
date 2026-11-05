// La couleur d'un statut (5 nov. 2026, Jules) : une couleur, un sens, partout. On la lit dans le libellé du choix,
// pas dans la couleur que Twenty lui a donnée, pour que « Signé » soit menthe dans toutes les colonnes. Le gris par
// défaut : un statut neutre ou inconnu ne colore rien de vif. L'ordre compte : « Non proposé » est gris avant que
// « proposé » ne le rende lavande, « Clients en cours » est bleu avant que « client » ne le rende menthe.

const SENS = [
  ['gris', /non propos|^prospects?$|fonds de commerce|^non$|^aucun|archiv/],
  ['corail', /perdu|refus|annul|abandon|ne plus appeler|pas int[ée]ress|sans suite|[ée]chou|hors cible/],
  ['ambre', /relanc|expire|acqu[ée]reur|stand.?by|attente|rappeler|à faire|a faire|urgent|def strat/],
  ['bleu', /en cours|contact|n[ée]goci|recherche|rdv|rendez|visite|int[ée]ress|en discussion|analyse/],
  ['menthe', /sign|client|vendu|gagn|^oui$|termin|faite?$|valid|r[ée]ussi|conclu/],
  ['lavande', /propos|vendeur|mandat|offre|estim/],
  ['turquoise', /bureau|entrep[oô]t|activit[ée]|logistique/],
  ['orchidee', /local commercial|commerce|boutique|murs/],
];

/** Pure : le nom de la couleur d'un libellé de statut (lavande, bleu, menthe, ambre, corail, turquoise, orchidee, gris). */
export function couleurStatut(libelle) {
  const t = String(libelle || '').toLowerCase().normalize('NFC').trim();
  if (!t) return 'gris';
  return SENS.find(([, motif]) => motif.test(t))?.[0] || 'gris';
}

// Les classes de chaque couleur, écrites en entier pour que Tailwind les trouve.
export const CLASSES_STATUT = {
  lavande: 'bg-statut-lavande-fond text-statut-lavande',
  bleu: 'bg-statut-bleu-fond text-statut-bleu',
  menthe: 'bg-statut-menthe-fond text-statut-menthe',
  ambre: 'bg-statut-ambre-fond text-statut-ambre',
  corail: 'bg-statut-corail-fond text-statut-corail',
  turquoise: 'bg-statut-turquoise-fond text-statut-turquoise',
  orchidee: 'bg-statut-orchidee-fond text-statut-orchidee',
  gris: 'bg-statut-gris-fond text-statut-gris',
};
