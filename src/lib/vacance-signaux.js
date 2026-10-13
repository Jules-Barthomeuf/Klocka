// Signaux de vacance : ce que l'écran et le serveur nomment pareil.
//
// Les types de bien, les types de signal et les bornes du rayon vivent ici,
// une fois : la barre de filtres les dessine, le serveur les vérifie
// (server/outils/vacance-regles.js les importe), et un mot ne change pas
// d'un côté sans changer de l'autre.

/** Les six types de bien, dans l'ordre d'affichage. */
export const CATEGORIES = [
  { cle: "commerce", mot: "Commerce" },
  { cle: "bureau", mot: "Bureau" },
  { cle: "industrie", mot: "Industrie / atelier" },
  { cle: "entrepot", mot: "Entrepôt / gros" },
  { cle: "sante", mot: "Santé / cabinet" },
  { cle: "autre", mot: "Autre" },
];

/**
 * Les types de signal que les sources branchées produisent. Les permis de
 * construire (Sitadel) ne le sont pas : on ne montre pas un filtre dont la
 * source n'existe pas.
 */
export const TYPES_SIGNAL = [
  { cle: "liquidation", mot: "Liquidation judiciaire", source: "BODACC", sens: "Fin d'activité quasi certaine, local libéré à court terme" },
  { cle: "redressement", mot: "Redressement judiciaire", source: "BODACC", sens: "Entreprise en difficulté, risque de fermeture" },
  { cle: "sauvegarde", mot: "Sauvegarde", source: "BODACC", sens: "Difficultés anticipées, risque plus faible" },
  { cle: "autre_procedure", mot: "Autre procédure collective", source: "BODACC", sens: "Plans, conversions, clôtures, rétablissement professionnel" },
  { cle: "transfert_siege", mot: "Transfert de siège", source: "BODACC", sens: "L'entreprise quitte l'adresse de son siège" },
  { cle: "radiation", mot: "Radiation", source: "BODACC", sens: "L'entreprise disparaît du registre" },
  { cle: "dissolution", mot: "Dissolution", source: "BODACC", sens: "Décision de cesser l'activité, liquidation amiable" },
  { cle: "fermeture", mot: "Fermeture d'établissement", source: "SIRENE", sens: "Un établissement précis passe à l'état « fermé »" },
];

export const CLES_CATEGORIES = CATEGORIES.map((c) => c.cle);
export const CLES_TYPES = TYPES_SIGNAL.map((t) => t.cle);

/** Le rayon : de 100 m à 5 km, 500 m au départ, par pas de 50 m. */
export const RAYON = { min: 100, max: 5000, defaut: 500, pas: 50 };

/** Le mot d'un type de signal ou de bien, pour l'écran. */
export const motType = (cle) => TYPES_SIGNAL.find((t) => t.cle === cle)?.mot || cle;
export const motCategorie = (cle) => CATEGORIES.find((c) => c.cle === cle)?.mot || cle;

/** Un signal de moins de douze mois est « récent » : la carte le dessine plus sombre. */
export const estRecent = (dateIso, maintenant = Date.now()) => !!dateIso && maintenant - Date.parse(dateIso) < 365.25 * 86400000;
