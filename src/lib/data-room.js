// Les cases de la Data room, selon le type du bien (6 nov. 2026, Jules : « la Data room va différer selon le type de
// biens : pour des murs commerciaux ce qu'il y a actuellement, pour un fonds de commerce un autre type de documents ; on
// doit aussi pouvoir partir de zéro et créer les box avec leurs noms »). Une seule liste, lue par le serveur (le dossier
// de l'étape 4, et la Data room du bien avant le mandat) et par l'écran : la vue d'ensemble et l'étape 4 montrent la même.

import { estLocation } from "./location.js";

/** Toutes les cases connues, par clé : leur nom à l'écran. */
export const CASES = {
  bail: "Bail commercial",
  quittances: "Trois dernières quittances",
  kbis: "Kbis du locataire",
  copropriete: "Copropriété et charges",
  diagnostics: "Diagnostics (DPE, amiante…)",
  taxe_fonciere: "Taxe foncière",
  titre: "Titre de propriété",
  charges: "Dernier appel de charges",
  plans: "Plans et surfaces",
  bilans: "Bilans et liasses (3 ans)",
  liasses: "Liasses fiscales",
  ca_en_cours: "Chiffre d'affaires de l'année",
  kbis_fonds: "Kbis et statuts",
  statuts: "Statuts",
  inventaire: "Inventaire du matériel",
  personnel: "Personnel",
  licences: "Licences et autorisations",
  contrats: "Contrats en cours (fournisseurs, crédit-bail)",
  conformite: "Conformité ERP et accessibilité",
  autres: "Autres documents",
};

// [clé, obligatoire]. Sept à neuf cases au plus (6 nov. 2026, Jules : « il y en a beaucoup trop ») : ce qui va
// ensemble se regroupe (copropriété et charges, bilans et liasses, Kbis et statuts), le rare va dans « Autres documents ».
// Les murs : trois pièces obligatoires (3 nov. 2026, Jules) ; le fonds : le bail et les bilans.
const MURS = [["bail", true], ["quittances", true], ["diagnostics", true], ["taxe_fonciere"], ["copropriete"], ["titre"]];
const FONDS = [["bail", true], ["bilans", true], ["ca_en_cours"], ["kbis_fonds"], ["personnel"], ["licences"]];
// Murs et fonds vendus ensemble : le propriétaire exploite en général, il ne se paie pas de loyer, donc pas de quittances.
const MURS_ET_FONDS = [["bail", true], ["bilans", true], ["ca_en_cours"], ["kbis_fonds"], ["diagnostics", true], ["taxe_fonciere"], ["copropriete"], ["titre"]];

const LISTES = {
  murs_commerce: MURS,
  fonds_commerce: FONDS,
  murs_et_fonds: MURS_ET_FONDS,
  bureaux: MURS,
  immeuble: MURS,
  local_activite: MURS,
  // Un autre bien part de zéro : on nomme ses cases avec le « + ».
  autre: [],
};

// Un local à louer (6 nov. 2026, Jules : « adapter tout le système à la location ») : une seule liste, quel que soit le
// type. Le candidat locataire veut savoir ce qu'il loue et s'il peut y exercer : pas de bail en cours, ni quittances,
// ni bilans. Le DPE et les plans sont obligatoires ; le règlement de copropriété dit si la destination est permise.
// [clé, obligatoire, nom propre à la location].
const LOCATION = [["diagnostics", true], ["plans", true], ["titre"], ["copropriete", false, "Règlement de copropriété (destination permise)"], ["taxe_fonciere"], ["charges"], ["conformite"]];

// Les cases d'avant le 6 nov. qui se regroupent : leurs pièces vont dans la case qui les réunit.
const REGROUPEES = { charges: "copropriete", liasses: "bilans", statuts: "kbis_fonds", kbis: "kbis_fonds" };

/** Pure : le type qui choisit les cases ; un bien sans type cherche les murs (comme typeDuBien). */
export const typeDataroom = (type) => (LISTES[type] ? type : "murs_commerce");

/**
 * Pure : les cases d'un type de bien, « Autres documents » (la case « + ») toujours en dernier. `transaction` (le mot, la
 * fiche ou le bien, comme estLocation) : un bien à louer a sa liste à lui, quel que soit le type.
 */
export function casesDuType(type, transaction = null) {
  const liste = estLocation(transaction) ? LOCATION : LISTES[typeDataroom(type)];
  return [...liste.map(([cle, requise, mot]) => ({ cle, mot: mot || CASES[cle], requise: !!requise })), { cle: "autres", mot: CASES.autres, requise: false }];
}

/** Pure : la case de ce type où va une pièce de cette clé (elle-même, ou la case qui la regroupe), ou null. */
export function caseDuType(cle, type, transaction = null) {
  const cases = new Set(casesDuType(type, transaction).map((c) => c.cle));
  if (cases.has(cle)) return cle;
  return REGROUPEES[cle] && cases.has(REGROUPEES[cle]) ? REGROUPEES[cle] : null;
}

/** Pure : le nom d'une case connue, ou null. */
export const motDeCase = (cle) => CASES[cle] || null;

const sans = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// La case d'un document d'après son nom, la plus précise d'abord ; une clé regroupée (liasses, statuts, charges, Kbis)
// va dans la case qui la réunit.
const REGLES = [
  ["quittances", /quittance|appel de loyer|avis d ?echeance|etat locatif/],
  ["liasses", /liasse/],
  ["bilans", /bilan|compte de resultat|comptes annuels|grand livre/],
  ["ca_en_cours", /chiffre d ?affaires|\bca\b|attestation (comptable|de l ?expert|expert)|situation (comptable|intermediaire)/],
  ["bail", /\bbail\b|avenant/],
  ["taxe_fonciere", /taxe fonciere|\btf\b|avis d ?imposition|impots? fonciers?/],
  // La conformité d'un local à louer (ERP, accessibilité) ; hors location, la règle suivante la range aux diagnostics.
  ["conformite", /\berp\b|accessibilite|\bad ?ap\b|securite incendie|commission de securite|conformite/],
  ["diagnostics", /\bdpe\b|amiante|\bdta\b|diagnostic|\berp\b|\besris\b|termite|plomb|\bcrep\b|electri/],
  ["kbis", /k ?bis|extrait k/],
  ["statuts", /statuts/],
  ["inventaire", /inventaire|materiel|equipements?/],
  ["personnel", /personnel|salarie|contrats? de travail|registre/],
  ["licences", /licence|autorisation|\berp\b|terrasse/],
  ["contrats", /contrat|fournisseur|credit.bail|leasing/],
  ["titre", /titre de propriete|attestation (notariee|de propriete)|acte de vente/],
  ["copropriete", /copro|\bpv\b|proces verbal|assemblee|reglement|\brcp\b|\bedd\b|etat descriptif/],
  ["charges", /appel de (charges|fonds)|\bcharges\b/],
  ["plans", /\bplans?\b|surfaces?|metrage|carrez/],
];

/** Pure : la case de ce type de bien (et de cette transaction) où va un document d'après son nom, ou null (à classer). */
export function caseDuNom(nom, type, transaction = null) {
  const t = sans(nom).replace(/[_\-.]+/g, " ");
  for (const [cle, re] of REGLES) {
    if (!re.test(t)) continue;
    const ici = caseDuType(cle, type, transaction);
    if (ici) return ici;
  }
  return null;
}
