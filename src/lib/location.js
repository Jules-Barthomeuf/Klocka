// La location (6 nov. 2026, Jules : « adapter tout le système à la location »). Un bien porte une seule information de
// plus, `biens.transaction` sur sa fiche (ProprietaireMandataire) : « vente » (par défaut) ou « location ». Le même
// parcours en sept étapes, d'autres mots ; l'estimation donne un loyer, le mandat cherche un locataire, les acquéreurs
// deviennent des candidats, et le bien ne part jamais aux investisseurs de Klocka. Lu par le serveur et par l'écran.

/** Pure : le bien est-il à louer ? Accepte une fiche (`biens.transaction`), un bien de l'écran (`proprietaire`), ou le mot. */
export function estLocation(x) {
  if (!x) return false;
  if (typeof x === "string") return x === "location";
  if (x.transaction) return x.transaction === "location";
  if (x.biens?.transaction) return x.biens.transaction === "location";
  if (x.proprietaire?.biens?.transaction) return x.proprietaire.biens.transaction === "location";
  return false;
}

/** Les mots des étapes qui changent en location ; les autres (Visite, Data room, Commercialisation) restent. */
export const MOTS_ETAPES_LOCATION = { estimation: "Estimation du loyer", mandat: "Mandat de location", offre: "Acquéreurs", vente: "Bail signé" };

/** Pure : les étapes d'un parcours, avec les mots de la location quand il le faut. */
export const etapesSelon = (etapes, location) => (location ? etapes.map((e) => ({ ...e, label: MOTS_ETAPES_LOCATION[e.id] || e.label })) : etapes);

// Les honoraires de location (6 nov. 2026, Jules : « comme tu veux ») : à la charge du preneur, 15 % HT du loyer
// annuel hors taxes hors charges, sauf ce que le mandat dit d'autre.
export const HONORAIRES_LOCATION = { charge: "preneur", taux: 0.15, base: "du loyer annuel HT HC" };
/** Pure : les honoraires de location en euros HT pour un loyer annuel, ou null. */
export const honorairesLocation = (loyerAnnuel, taux = HONORAIRES_LOCATION.taux) => (Number(loyerAnnuel) > 0 ? Math.round(Number(loyerAnnuel) * taux) : null);

/** Les statuts d'un candidat locataire, dans l'ordre du travail. */
export const STATUTS_CANDIDAT = { contact: "Contact", visite: "Visite faite", dossier: "Dossier reçu", accord: "Accord", bail_signe: "Bail signé", perdu: "Perdu" };
