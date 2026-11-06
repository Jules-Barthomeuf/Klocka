// Le bilan d'une opération présentée à Tokimo (6 nov. 2026, Jules) : la grille de leur Excel d'analyse
// (« Bilan achat revente », hypothèses de financement, proposition, emplois et ressources, décaissement,
// facturation), refaite à l'identique. Pure : la page la recalcule à chaque frappe, le serveur s'en sert
// pour la liste, et le test la confronte au dossier de Mailly-sur-Seille, chiffre par chiffre.
//
// Ce que l'Excel ne dit pas et qu'on a déduit de ses chiffres :
//   - le montant à collecter est la dette, augmentée de ce que Tokimo retient au décaissement (frais de
//     structuration TTC, séquestre des coupons), arrondie au millier supérieur (196 200 € → 220 000 €) ;
//   - les garanties se calculent sur le prix d'acquisition (1,25 % de 180 000 € = 2 250 €) ;
//   - le besoin opérationnel est la somme I à IV : les frais financiers (V) sont payés par la collecte.

export const TVA = 0.2;

/** Une analyse neuve : les taux et les durées de la grille Tokimo, rien de chiffré sur le bien. */
export function saisieVide() {
  return {
    adresse: "",
    destination: "Achat-revente (marchand de biens)",
    // Le type de logement cherché dans DVF : « Maison » ou « Appartement ».
    typologie: "Maison",
    description_actif: "",
    description_projet: "",
    forces: "",
    faiblesses: "",
    surfaces: { utile: 0, terrasse: 0, terrain: 0, creee: 0 },
    prix_acquisition: 0,
    frais_notaire_pct: 7.5,
    commission_agence: 0,
    travaux_renovation: 0,
    travaux_creation: 0,
    aleas: 0,
    honoraires: 0,
    garantie_hypotheque_pct: 1.25,
    caution_perso_pct: 0.25,
    assurances: 0,
    comptable: 0,
    divers: 0,
    duree_mois: 12,
    taux_pct: 11,
    structuration_grille_pct: 8,
    apporteur: false,
    frais_gestion_pct: 0,
    sequestre_mois: 0,
    coupons_mensuels: false,
    fonds_propres_pct: 0,
    besoin_conserve: true,
    dette_supplementaire: 0,
    prix_cible_m2: 0,
    ca_sup: 0,
    loyer_annuel: 0,
    frais_agence_comparables_pct: 5,
    remboursement_anticipe_mois: 2,
    gestion_depassement_pct: 0.1,
    garanties: "HC + CP",
    conditions_suspensives: "",
    avis: { administratif: "", financier: "", localisation: "", garanties: "", commerciales: "", entreprise: "", experience: "", sante: "" },
    delai: [],
    demande_operateur: "",
    avis_analyste: "",
    comparables: [],
    dvf: [],
    photos: [],
  };
}

const n = (v) => {
  const x = typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const pct = (v) => n(v) / 100;
const div = (a, b) => (b ? a / b : 0);
const arrondiMillier = (x) => (x > 0 ? Math.ceil(Math.round(x * 100) / 100 / 1000) * 1000 : 0);

/** Une saisie complétée de ses valeurs par défaut (une analyse ancienne n'a pas les champs ajoutés depuis). */
export function completer(saisie = {}) {
  const v = saisieVide();
  return { ...v, ...saisie, surfaces: { ...v.surfaces, ...(saisie.surfaces || {}) }, avis: { ...v.avis, ...(saisie.avis || {}) } };
}

/** Min, moyenne, médiane, max d'une série de prix au m². */
export function statistiques(valeurs) {
  const t = valeurs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!t.length) return null;
  const m = Math.floor(t.length / 2);
  return {
    n: t.length,
    min: t[0],
    max: t[t.length - 1],
    moyenne: t.reduce((s, x) => s + x, 0) / t.length,
    mediane: t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2,
  };
}

/** Le prix au m² d'une vente DVF. */
export const prixM2Dvf = (v) => div(n(v.prix), n(v.surface));
/** Le prix au m² net vendeur d'une annonce : son prix frais d'agence inclus, moins ces frais. */
export const prixM2Comparable = (c, fraisPct = 5) => div(n(c.prix_fai) / (1 + pct(fraisPct)), n(c.surface));

/**
 * Tout ce que l'Excel calcule, à partir de la saisie.
 *
 * @param {object} brut  la saisie (voir saisieVide)
 */
export function bilan(brut) {
  const s = completer(brut);
  const surfaceUtile = n(s.surfaces.utile) + n(s.surfaces.creee);
  const parM2 = (x) => div(x, surfaceUtile);

  // I. Charges foncières
  const prix = n(s.prix_acquisition);
  const fraisNotaire = prix * pct(s.frais_notaire_pct);
  const commission = n(s.commission_agence);
  const chargesFoncieres = prix + fraisNotaire + commission;
  // II. Dépenses d'investissement
  const depenses = n(s.travaux_renovation) + n(s.travaux_creation) + n(s.aleas) + n(s.honoraires);
  // III. Frais de sûretés
  const garantieHypotheque = prix * pct(s.garantie_hypotheque_pct);
  const cautionPerso = prix * pct(s.caution_perso_pct);
  const suretes = garantieHypotheque + cautionPerso;
  // IV. Assurances, charges, divers
  const charges = n(s.assurances) + n(s.comptable) + n(s.divers);

  // Fonds propres et dette
  const besoin = chargesFoncieres + depenses + suretes + charges;
  const fondsPropres = besoin * pct(s.fonds_propres_pct);
  const dette = besoin - fondsPropres;

  // La collecte : la dette, plus ce que Tokimo retient au décaissement quand le besoin de l'opérateur est conservé.
  const structurationPct = pct(s.structuration_grille_pct) + (s.apporteur ? 0.01 : 0);
  const gestionPct = pct(s.frais_gestion_pct);
  const sequestrePart = n(s.sequestre_mois) > 0 ? (pct(s.taux_pct) / 12) * n(s.sequestre_mois) : 0;
  const aFinancer = dette + n(s.dette_supplementaire);
  const retenue = structurationPct * (1 + TVA) + gestionPct * (1 + TVA) + sequestrePart;
  const collecte = arrondiMillier(s.besoin_conserve && retenue < 1 ? aFinancer / (1 - retenue) : aFinancer);
  const fraisTokimoHT = collecte * structurationPct;
  const fraisTokimo = fraisTokimoHT * (1 + TVA);
  const fraisGestionHT = collecte * gestionPct;
  const fraisGestion = fraisGestionHT * (1 + TVA);
  const sequestre = collecte * sequestrePart;

  // V. Frais financiers
  const interets = collecte * pct(s.taux_pct) * (n(s.duree_mois) / 12);
  const fraisFinanciers = interets + fraisTokimo + fraisGestion;
  const prixDeRevient = besoin + fraisFinanciers;

  // Arbitrage et chiffre d'affaires
  const cible = n(s.prix_cible_m2);
  const prixM2 = { bas: cible * 0.9, cible, haut: cible * 1.1 };
  const ca = {
    bas: prixM2.bas * surfaceUtile + n(s.ca_sup),
    cible: prixM2.cible * surfaceUtile + n(s.ca_sup),
    haut: prixM2.haut * surfaceUtile + n(s.ca_sup),
  };
  const marge = (x) => ({ marge: x - prixDeRevient, sur_pr: div(x - prixDeRevient, prixDeRevient), sur_ca: div(x - prixDeRevient, x) });
  const loyer = n(s.loyer_annuel);
  const annuites = collecte * pct(s.taux_pct);

  // Emplois et ressources
  const emplois = { acquisition: chargesFoncieres, travaux: depenses, suretes, divers: charges, structuration: fraisTokimo + fraisGestion, sequestre };
  const totalEmplois = Object.values(emplois).reduce((t, x) => t + x, 0);

  // Le décaissement
  const decaissementNotaire = collecte - fraisTokimo - fraisGestion - sequestre;

  // Les marchés
  const dvf = statistiques(s.dvf.map(prixM2Dvf));
  const comparables = statistiques(s.comparables.map((c) => prixM2Comparable(c, s.frais_agence_comparables_pct)));

  return {
    surface_utile: surfaceUtile,
    lignes: {
      prix_acquisition: prix, frais_notaire: fraisNotaire, commission_agence: commission, charges_foncieres: chargesFoncieres,
      travaux_renovation: n(s.travaux_renovation), travaux_creation: n(s.travaux_creation), aleas: n(s.aleas), honoraires: n(s.honoraires), depenses,
      garantie_hypotheque: garantieHypotheque, caution_perso: cautionPerso, suretes,
      assurances: n(s.assurances), comptable: n(s.comptable), divers: n(s.divers), charges,
      interets, frais_tokimo: fraisTokimo, frais_gestion: fraisGestion, frais_financiers: fraisFinanciers,
      prix_de_revient: prixDeRevient,
    },
    par_m2: parM2,
    besoin, fonds_propres: fondsPropres, dette,
    structuration_pct: structurationPct, structuration_net_pct: pct(s.structuration_grille_pct),
    collecte, frais_tokimo: fraisTokimo, frais_gestion: fraisGestion, sequestre,
    prix_m2: prixM2, ca,
    performance: { bas: marge(ca.bas), cible: marge(ca.cible), haut: marge(ca.haut) },
    exposition: {
      ltv: div(collecte, ca.cible),
      ltc: div(collecte, prixDeRevient),
      risque_m2: div(collecte, surfaceUtile),
      annuites,
      dscr: div(loyer, annuites),
    },
    rendement: { bas: div(loyer, ca.bas), cible: div(loyer, ca.cible), haut: div(loyer, ca.haut) },
    emplois, total_emplois: totalEmplois,
    ressources: { dette_obligataire: collecte, fonds_propres: totalEmplois - collecte },
    decaissement: { collecte, frais_tokimo: fraisTokimo + fraisGestion, sequestre, notaire: decaissementNotaire, suretes, net_operateur: decaissementNotaire - suretes },
    facturation: {
      structuration: { base: collecte, taux: structurationPct, ht: fraisTokimoHT },
      gestion: { base: collecte, taux: gestionPct, ht: fraisGestionHT },
      total_ht: fraisTokimoHT + fraisGestionHT,
      total_ttc: (fraisTokimoHT + fraisGestionHT) * (1 + TVA),
    },
    marches: { dvf, comparables, cible: cible ? { min: prixM2.bas, cible, max: prixM2.haut } : null },
  };
}
