// L'avis de valeur locative (6 nov. 2026, Jules : « adapter tout le système à la location ») : pour un bien à louer,
// l'avis estime un LOYER, jamais un prix. La valeur locative de marché au m² (Data-B, Equimmox en repli : les seules
// sources de loyers, jamais un modèle ni DVF) sur la surface pondérée, ajustée par les critères du local (rang de la
// rue, façade, état, extraction…). Sans valeur de marché lue, pas de loyer : l'avis le dit au lieu d'inventer.
// Pur, lu par le serveur (server/mandataire-avis.js) et par l'écran (éditeur, deck). Testé dans
// server/mandataire-avis-location.test.js.

import { HONORAIRES_LOCATION, honorairesLocation } from "./location.js";

/** Le titre et l'objet du document. */
export const TITRE_AVIS_LOCATION = "Avis de valeur locative";
export const OBJET_AVIS_LOCATION = "Estimer la valeur locative du local en vue de sa mise en location";

// Ce qu'il faut savoir d'un local à louer : ni « loué ou libre », ni loyer en place, ni échéance, ni taux de base.
// L'essentiel retient la rédaction ; le reste se demande, « je ne sais pas » laisse « [à compléter] ».
export const ESSENTIELS_LOCATION = ["adresse", "surface_utile", "destination", "extraction", "etat_local", "disponible_le"];
const COMMUNS_LOCATION = ["type_bien", "adresse", "demandeur", "surface_utile", "destination", "extraction", "etat_local", "disponible_le", "date_visite"];
// Les murs de commerce : la façade et le rang de la rue ajustent le loyer comme ils ajustaient le taux.
const PAR_TYPE_LOCATION = { murs_commerce: ["facade", "rang_rue"] };

/** Les états d'un local à louer, et leurs mots. */
export const ETATS_LOCAL = { a_rafraichir: "À rafraîchir", bon: "Bon état", refait: "Refait à neuf" };

const vide = (v) => v == null || v === "";

/** Pure : ce qui manque avant de rédiger l'avis de valeur locative. */
export function manquantsLocation(q = {}) {
  return [...COMMUNS_LOCATION, ...(PAR_TYPE_LOCATION[q.type_bien] || [])].filter((k) => vide(q[k]));
}

/** Pure : l'essentiel qui manque encore (adresse, surface, destination, extraction, état, disponibilité). */
export function essentielsLocation(q = {}) {
  return ESSENTIELS_LOCATION.filter((k) => vide(q[k]));
}

/** Pure : l'état du local ramené à trois mots (« à rafraîchir », « bon », « refait »), les mots de Data-B compris. */
export function etatDuLocal(v) {
  const t = String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (!t || t === "nc") return null;
  if (/refait|parfait|neuf|renove/.test(t)) return "refait";
  if (/rafraich|travaux|brut|renover|vetuste|abime|gros/.test(t)) return "a_rafraichir";
  if (/bon|usage|correct|propre/.test(t)) return "bon";
  return null;
}

const oui = (v) => v === true || /^\s*(oui|yes|vrai|true)\b/i.test(String(v ?? ""));

/** Pure : les mètres de façade dits (« 8 m de vitrine », « 6,5 ml »), ou null. */
function metresDeFacade(t) {
  const m = String(t ?? "").match(/(\d+(?:[.,]\d+)?)\s*(?:m\b|ml\b|mètres?|metres?)/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}

// Les ajustements du loyer de marché, en % : des ordres de grandeur, à caler sur les baux signés par le réseau.
// Bornés ensemble à ± 25 %.
const BORNE_AJUSTEMENTS = 25;

/** Pure : les ajustements du loyer de marché d'après les critères du local. */
export function ajustementsLoyer(q = {}) {
  const a = [];
  const ajoute = (pct, motif) => { if (pct) a.push({ pct, motif }); };
  if (q.rang_rue === "n1") ajoute(10, "emplacement n°1");
  if (q.rang_rue === "n2") ajoute(-10, "emplacement n°2");
  const facade = metresDeFacade(q.facade);
  if (facade != null && facade >= 8) ajoute(5, "belle façade");
  else if (facade != null && facade > 0 && facade <= 4) ajoute(-5, "façade étroite");
  if (oui(q.angle)) ajoute(5, "local en angle");
  if (oui(q.extraction)) ajoute(5, "extraction : restauration possible");
  const etat = etatDuLocal(q.etat_local);
  if (etat === "refait") ajoute(5, "local refait");
  if (etat === "a_rafraichir") ajoute(-5, "local à rafraîchir");
  if (Number(q.vacance_rue_pct) > 15) ajoute(-5, "vacance de la rue au-dessus de 15 %");
  return a;
}

/** Pure : l'échelle la plus fine lue (la rue, puis le quartier, puis la ville), avec son nom. */
export function echelleDuMarche(marche) {
  for (const cle of ["rue", "quartier", "ville"]) {
    const n = marche?.[cle];
    if (n && (Number(n.basse) > 0 || Number(n.haute) > 0 || Number(n.moyenne) > 0)) return { cle, ...n };
  }
  return null;
}

/** Pure : le milieu de la fourchette de marché, sinon la borne qu'on a. */
const milieu = (n) => {
  const b = Number(n?.basse), h = Number(n?.haute);
  if (b > 0 && h > 0) return (b + h) / 2;
  return b > 0 ? b : h > 0 ? h : Number(n?.moyenne) > 0 ? Number(n.moyenne) : null;
};

/** Pure : un loyer annuel rond (500 €, 1 000 € dès 100 000 €). */
export const loyerRond = (v) => (Number(v) > 0 ? Math.round(Number(v) / (Number(v) >= 1e5 ? 1000 : 500)) * (Number(v) >= 1e5 ? 1000 : 500) : v);

/**
 * Pure : le loyer estimé. q : le questionnaire ; marche : la lecture de la valeur locative ({ rue, quartier, ville }
 * × { basse, haute }, et sa source) ; surfacePonderee : la surface du loyer (l'utile à défaut). null sans valeur de
 * marché ou sans surface : on ne l'invente pas.
 */
export function chiffrerLoyer(q = {}, { marche = null, surfacePonderee = null } = {}) {
  const n = echelleDuMarche(marche);
  const m2Marche = milieu(n);
  const surface = Number(surfacePonderee) > 0 ? Number(surfacePonderee) : Number(q.surface_utile) > 0 ? Number(q.surface_utile) : null;
  if (!m2Marche || !surface) return null;
  const ajustements = ajustementsLoyer(q);
  const total = Math.max(-BORNE_AJUSTEMENTS, Math.min(BORNE_AJUSTEMENTS, ajustements.reduce((t, x) => t + x.pct, 0)));
  const coef = 1 + total / 100;
  const m2 = m2Marche * coef;
  const valeur = loyerRond(m2 * surface);
  // La fourchette : ± 10 % autour du loyer retenu, sans sortir de celle du marché (ajustée).
  const basMarche = Number(n.basse) > 0 ? Number(n.basse) * coef * surface : null;
  const hautMarche = Number(n.haute) > 0 ? Number(n.haute) * coef * surface : null;
  const bas = loyerRond(Math.min(valeur, Math.max(valeur * 0.9, basMarche || 0)));
  const haut = loyerRond(Math.max(valeur, hautMarche ? Math.min(valeur * 1.1, hautMarche) : valeur * 1.1));
  return {
    valeur, bas, haut,
    loyer_m2: Math.round(valeur / surface),
    loyer_m2_bas: Math.round(bas / surface),
    loyer_m2_haut: Math.round(haut / surface),
    mensuel: Math.round(valeur / 12),
    surface_ponderee: Math.round(surface),
    marche: { echelle: n.cle, nom: n.nom || null, basse: Number(n.basse) || null, haute: Number(n.haute) || null, m2: Math.round(m2Marche), source: marche?.source || null },
    ajustements, ajustement_pct: total,
  };
}

/** Le dépôt de garantie conseillé par défaut : trois mois de loyer HT. */
export const DEPOT_MOIS = 3;

/**
 * Pure : les conditions conseillées pour un loyer annuel : dépôt de garantie (3 mois HT par défaut), franchise selon les travaux
 * (deux mois pour un local à rafraîchir, sauf ce que le mandataire a dit), honoraires de location (HONORAIRES_LOCATION).
 */
export function conditionsLocation(loyer, q = {}) {
  const l = Number(loyer) > 0 ? Number(loyer) : null;
  const mois = Number(q.depot_garantie_mois) > 0 ? Number(q.depot_garantie_mois) : DEPOT_MOIS;
  const dite = Number(q.franchise_mois);
  const franchise = Number.isFinite(dite) && q.franchise_mois != null && q.franchise_mois !== "" ? dite : etatDuLocal(q.etat_local) === "a_rafraichir" ? 2 : 0;
  return {
    depot_garantie_mois: mois,
    depot_garantie: l ? Math.round((l / 12) * mois) : null,
    franchise_mois: franchise,
    franchise_motif: franchise ? (etatDuLocal(q.etat_local) === "a_rafraichir" ? "le temps des travaux de rafraîchissement" : "consentie au preneur") : null,
    honoraires: l ? honorairesLocation(l) : null,
    honoraires_pct: Math.round(HONORAIRES_LOCATION.taux * 100),
    honoraires_charge: HONORAIRES_LOCATION.charge,
    honoraires_base: HONORAIRES_LOCATION.base,
  };
}

/**
 * Pure : l'avis de valeur locative après une retouche du loyer retenu : le loyer au m², le mensuel et les conditions
 * suivent. La franchise posée reste.
 */
export function recalculerLoyer(avis) {
  const c = { ...(avis?.chiffres || {}) };
  if (!(c.valeur > 0)) return avis;
  const s = Number(c.surface_ponderee) || Number(avis.methodes?.surface_ponderee) || Number(avis.methodes?.surface) || null;
  c.mensuel = Math.round(c.valeur / 12);
  if (s) {
    c.loyer_m2 = Math.round(c.valeur / s);
    if (c.bas > 0) c.loyer_m2_bas = Math.round(c.bas / s);
    if (c.haut > 0) c.loyer_m2_haut = Math.round(c.haut / s);
  }
  const avant = avis.conditions || {};
  const conditions = { ...avant, ...conditionsLocation(c.valeur, { franchise_mois: avant.franchise_mois ?? 0, depot_garantie_mois: avant.depot_garantie_mois }), franchise_motif: avant.franchise_motif ?? null };
  const libre = Object.fromEntries(Object.entries(avis.libre || {}).filter(([k]) => !k.startsWith("c_")));
  return { ...avis, chiffres: c, conditions, libre };
}
