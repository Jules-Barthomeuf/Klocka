// Les biens du mandataire (24 oct. 2026, Jules) : un bien se suit du premier
// contact avec le propriétaire jusqu'à la vente, comme un dossier de l'équipe.
// Rien n'est stocké : le serveur garde ses cinq objets (propriétaire de la
// Prospection, estimation, mandat, dossier, mise en marché) et leurs liens
// (estimation.proprietaire_id, mandat.estimation_id, dossier.mandat_id et
// dossier.estimation, marche.dossier_id) ; ce module en tire les biens,
// l'étape et le statut de chacun, de façon pure et testable.

/**
 * Les neuf étapes d'un bien (spec de Jules du 24 oct. 2026) : la fiche entre dans Biens au rendez-vous fixé, puis
 * Visité, Estimation, Prix d'accord, Mandat, Analyse, Mise en marché, Offres, Vente.
 */
export const ETAPES_BIEN = [
  { n: 1, id: "rdv", label: "Rendez-vous fixé" },
  { n: 2, id: "visite", label: "Visité" },
  { n: 3, id: "estimation", label: "Estimation" },
  { n: 4, id: "prix_accord", label: "Prix d'accord" },
  { n: 5, id: "mandat", label: "Mandat" },
  { n: 6, id: "analyse", label: "Analyse" },
  { n: 7, id: "marche", label: "Mise en marché" },
  { n: 8, id: "offre", label: "Offres" },
  { n: 9, id: "vente", label: "Vente" },
];
const IDS = ETAPES_BIEN.map((e) => e.id);

// Une fiche de la Prospection entre dans Biens au rendez-vous fixé, pas avant : « à contacter » et « contacté »
// restent dans la Prospection.
const PROPRIETAIRE_EN_COURS = new Set(["rdv_pris", "mandat_signe"]);

const ESTIMATION_FAITE = new Set(["prete", "envoye", "en_validation", "valide"]);
const MANDAT_FAIT = new Set(["signe", "enregistre"]);
const MARCHE_PRESENTE = new Set(["presente", "offre", "compromis", "acte", "commission_payee"]);
const MARCHE_VENTE = new Set(["compromis", "acte", "commission_payee"]);
const MARCHE_VENDU = new Set(["acte", "commission_payee"]);

/**
 * Les étapes faites d'un bien. Une étape validée à la main sur la fiche l'est avec toutes celles d'avant
 * (`proprietaire.biens.validee`) ; les objets en font avancer d'eux-mêmes : une estimation suppose le rendez-vous et la
 * visite, envoyée elle fait l'Estimation ; un mandat suppose le prix d'accord, signé il fait le Mandat ; le go ou une
 * mise en marché font l'Analyse ; présenté, la Mise en marché ; compromis, les Offres ; acte, la Vente.
 */
export function etapesFaites(b) {
  const m = b?.marche;
  const faites = new Set();
  const p = b?.proprietaire;
  if (p && PROPRIETAIRE_EN_COURS.has(p.statut)) {
    // `validee: null` : le rendez-vous est pris mais pas encore tenu (une fiche d'exemple, 25 oct. 2026).
    const v = p.biens && p.biens.validee === null ? -1 : IDS.indexOf(p.biens?.validee || "rdv");
    IDS.forEach((k, i) => { if (i <= v) faites.add(k); });
  }
  if (b?.estimation) { faites.add("rdv"); faites.add("visite"); }
  if (b?.estimation?.statut === "envoye") faites.add("estimation");
  if (b?.mandat) { faites.add("rdv"); faites.add("visite"); faites.add("estimation"); faites.add("prix_accord"); }
  if (b?.mandat && MANDAT_FAIT.has(b.mandat.statut)) faites.add("mandat");
  // Un dossier s'ouvre au mandat signé ; une mise en marché suit le go : les étapes d'avant sont faites (25 oct. 2026).
  const avant = (k) => IDS.slice(0, IDS.indexOf(k)).forEach((x) => faites.add(x));
  if (b?.dossier) avant("analyse");
  if (m) avant("marche");
  if (b?.dossier?.statut === "go" || m) faites.add("analyse");
  if (m && MARCHE_PRESENTE.has(m.statut)) faites.add("marche");
  if (m && MARCHE_VENTE.has(m.statut)) faites.add("offre");
  if (m && MARCHE_VENDU.has(m.statut)) faites.add("vente");
  return faites;
}

/** L'étape où en est le bien (1 à 9) : celle qui suit la dernière franchie (un ancien bien né d'un dossier n'est pas renvoyé au rendez-vous). */
export function etapeDuBien(b) {
  const faites = etapesFaites(b);
  let derniere = -1;
  IDS.forEach((k, i) => { if (faites.has(k)) derniere = i; });
  return Math.min(IDS.length, derniere + 2);
}

/** Le statut d'un bien, dit comme le mandataire le dit : En pause, ou la dernière étape franchie (les détails de la vente). */
export function statutDuBien(b) {
  if (b?.proprietaire?.biens?.pause) return "En pause";
  // Une fiche encore en Prospection (ouverte depuis la carte ou une liste) : ses mots à elle.
  const p = b?.proprietaire;
  if (p && !PROPRIETAIRE_EN_COURS.has(p.statut) && !b?.estimation && !b?.mandat && !b?.dossier && !b?.marche) return p.statut === "pas_vendeur" ? "Pas d'intérêt" : ["contacte", "en_discussion"].includes(p.statut) ? "Contacté" : "À contacter";
  const m = b?.marche;
  if (m) {
    if (m.statut === "commission_payee") return "Vendu";
    if (m.statut === "acte") return "Acte signé";
    if (m.statut === "compromis") return "Compromis";
    if (m.statut === "offre" || (m.offres || []).length) return "Offre reçue";
    return m.statut === "presente" ? "Présenté aux investisseurs" : "Mise en marché en préparation";
  }
  const d = b?.dossier;
  if (d) return d.statut === "go" ? "Go de l'analyste" : d.statut === "no_go" ? "No-go" : d.statut === "complements" ? "Compléments demandés" : d.transfere ? "Chez l'analyste" : "Dossier à compléter";
  if (b?.mandat) return MANDAT_FAIT.has(b.mandat.statut) ? "Mandat signé" : "Mandat en préparation";
  const faites = etapesFaites(b);
  const e = b?.estimation;
  if (faites.has("prix_accord")) return "Prix d'accord";
  if (e) return e.statut === "envoye" ? "Estimation envoyée" : ESTIMATION_FAITE.has(e.statut) ? "Avis prêt" : "Estimation en cours";
  if (faites.has("visite")) return "Visité";
  return "Rendez-vous fixé";
}

const date = (x) => x?.activite || x?.envoye_le || x?.prete_le || (x?.historique || []).at(-1)?.le || x?.cree_le || null;
const plusRecente = (...xs) => xs.filter(Boolean).sort().at(-1) || null;

/**
 * Pure : les biens, chacun avec son estimation, son mandat, son dossier et sa
 * mise en marché (null quand l'objet n'existe pas encore). Un objet n'est
 * rangé qu'une fois ; la clé du bien est « type:id » de son premier objet.
 */
export function regrouperBiens({ estimations = [], mandats = [], dossiers = [], marches = [], proprietaires = [] } = {}) {
  const parId = (liste) => new Map(liste.map((x) => [x.id, x]));
  const E = parId(estimations), M = parId(mandats);
  const pris = { e: new Set(), m: new Set(), d: new Set(), k: new Set() };
  const biens = [];
  const marcheDu = (d) => marches.find((k) => k.dossier_id === d.id && !pris.k.has(k.id)) || null;

  for (const d of dossiers) {
    const mandat = M.get(d.mandat?.id || d.mandat_id) || null;
    const estimation = E.get(d.estimation?.id || d.estimation_id) || (mandat?.estimation_id ? E.get(mandat.estimation_id) : null) || null;
    const marche = marcheDu(d);
    biens.push({ estimation: estimation && !pris.e.has(estimation.id) ? estimation : null, mandat: mandat && !pris.m.has(mandat.id) ? mandat : null, dossier: d, marche });
    if (estimation) pris.e.add(estimation.id);
    if (mandat) pris.m.add(mandat.id);
    if (marche) pris.k.add(marche.id);
    pris.d.add(d.id);
  }
  for (const m of mandats.filter((x) => !pris.m.has(x.id))) {
    const estimation = m.estimation_id && !pris.e.has(m.estimation_id) ? E.get(m.estimation_id) || null : null;
    biens.push({ estimation, mandat: m, dossier: null, marche: null });
    if (estimation) pris.e.add(estimation.id);
    pris.m.add(m.id);
  }
  for (const e of estimations.filter((x) => !pris.e.has(x.id))) biens.push({ estimation: e, mandat: null, dossier: null, marche: null });
  // Une mise en marché dont le dossier n'est pas dans la liste reste un bien à part.
  for (const k of marches.filter((x) => !pris.k.has(x.id))) biens.push({ estimation: null, mandat: null, dossier: null, marche: k });

  // Le propriétaire d'un bien estimé le rejoint ; un propriétaire contacté sans estimation est un bien à lui seul.
  const P = parId(proprietaires);
  const pris_p = new Set();
  for (const b of biens) {
    const p = b.estimation?.proprietaire_id ? P.get(b.estimation.proprietaire_id) : null;
    if (p && !pris_p.has(p.id)) { b.proprietaire = p; pris_p.add(p.id); }
  }
  for (const p of proprietaires.filter((x) => !pris_p.has(x.id) && PROPRIETAIRE_EN_COURS.has(x.statut))) {
    biens.push({ proprietaire: p, estimation: null, mandat: null, dossier: null, marche: null });
  }

  return biens.map((b) => {
    const p = b.proprietaire || null;
    const premier = p ? `proprietaire:${p.id}` : b.estimation ? `estimation:${b.estimation.id}` : b.mandat ? `mandat:${b.mandat.id}` : b.dossier ? `dossier:${b.dossier.id}` : `marche:${b.marche.id}`;
    const source = b.marche || b.dossier || b.mandat || b.estimation || p;
    const lui = { ...b, proprietaire: p };
    return {
      ...lui,
      cle: premier,
      ids: [p && `proprietaire:${p.id}`, b.estimation && `estimation:${b.estimation.id}`, b.mandat && `mandat:${b.mandat.id}`, b.dossier && `dossier:${b.dossier.id}`, b.marche && `marche:${b.marche.id}`].filter(Boolean),
      titre: b.dossier?.bien || b.mandat?.bien || b.estimation?.bien || b.marche?.bien || [p?.commerce || p?.nom, p?.ville].filter(Boolean).join(" · ") || "Bien sans nom",
      adresse: b.dossier?.adresse || b.estimation?.adresse || b.mandat?.questionnaire?.bien_adresse || p?.adresse || null,
      exemple: !!source?.exemple,
      etape: etapeDuBien(lui),
      statut: statutDuBien(lui),
      faites: etapesFaites(lui),
      modifie: plusRecente(date(b.estimation), date(b.mandat), date(b.dossier), date(b.marche), p ? (p.historique || []).at(-1)?.le || p.cree_le : null),
    };
  }).sort((a, b) => String(b.modifie || "").localeCompare(String(a.modifie || "")));
}

/** Pure : le bien qu'une clé « type:id » désigne, par n'importe lequel de ses objets. */
export const bienDe = (biens, cle) => (cle ? biens.find((b) => b.ids.includes(cle)) || null : null);

/**
 * Pure : le bien d'un propriétaire pas encore dans les cartes (« à appeler », ouvert depuis le matin) : son
 * étape Contact, rien d'autre. Null s'il n'existe pas.
 */
export function bienDuProprietaire(proprietaires, cle) {
  const id = String(cle || "").startsWith("proprietaire:") ? cle.slice("proprietaire:".length) : null;
  const p = id ? proprietaires.find((x) => x.id === id) : null;
  if (!p) return null;
  const b = { proprietaire: p, estimation: null, mandat: null, dossier: null, marche: null };
  return { ...b, cle, ids: [cle], titre: [p.commerce || p.nom, p.ville].filter(Boolean).join(" · ") || "Propriétaire", adresse: p.adresse || null, exemple: false, etape: etapeDuBien(b), statut: statutDuBien(b), faites: etapesFaites(b), modifie: p.cree_le || null };
}
