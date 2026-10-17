// L'architecture de la page Dossiers (17 oct. 2026, Jules).
//
// Liste : trois blocs de cartes. « À traiter » (« À toi d'agir » et « En
// attente d'un tiers »), « Pipeline » (Tri, Qualification, Commercialisation,
// Transaction) et « Écartés par AK ». Dossier : une frise de huit étapes.
//
// Rien de tout cela n'est stocké : le serveur garde ses cinq portes
// (`etape_max`, server/deal/etapes.js) et son statut ; ce module en tire le
// bloc d'un dossier et l'étape de la frise, de façon pure et testable.

/** Les huit étapes de la frise d'un dossier ouvert. */
export const FRISE = [
  { n: 1, id: "reception", label: "Email", sous: "Mail trié" },
  { n: 2, id: "preanalyse", label: "Pré-analyse", sous: "Fiche" },
  { n: 3, id: "documents", label: "Data Room", sous: "Reçus / manquants" },
  { n: 4, id: "analyse", label: "Analyse", sous: "Grilles" },
  { n: 5, id: "plateforme", label: "Plateforme", sous: "Projet en ligne" },
  { n: 6, id: "clients", label: "Clients", sous: "Loom" },
  { n: 7, id: "offre", label: "Offre", sous: "LOI" },
  { n: 8, id: "bancaire", label: "Dossier bancaire", sous: "Après offre" },
];

/** Les quatre phases du pipeline. */
export const PHASES = [
  { id: "tri", label: "Tri", sous: "Email et pré-analyse" },
  { id: "qualification", label: "Qualification", sous: "Data Room et analyse" },
  { id: "commercialisation", label: "Commercialisation", sous: "Plateforme et clients" },
  { id: "transaction", label: "Transaction", sous: "Offre et dossier bancaire" },
];

const ANALYSE_FAITE = new Set(["documents_recus", "depouille"]);

/**
 * L'étape de la frise où en est le dossier (1 à 8), d'après la porte du
 * serveur : 1 réception, 2 pré-analyse, 3 documents puis analyse, 4
 * plateforme, 5 présentation (dossier bancaire). Clients et Offre se lisent
 * sur ce que le serveur sait d'eux (`nb_demandes_clients`, `nb_offres`).
 */
export function etapeFrise(d) {
  const porte = Math.max(1, Math.min(5, Number(d?.etape_max) || 1));
  if (porte <= 2) return porte;
  if (porte === 3) return ANALYSE_FAITE.has(d?.statut) ? 4 : 3;
  if (porte === 4) return d?.nb_offres > 0 ? 7 : d?.nb_demandes_clients > 0 ? 6 : 5;
  return 8;
}

/** Faux : le dossier est écarté (abandonné, ou AK l'a jugé NO-GO). */
export const estEcarte = (d) => d?.statut === "abandonne" || d?.lots?.[0]?.verdict === "NO-GO";

/** La phase du pipeline d'un dossier, d'après son étape de frise. */
export function phaseDe(d) {
  const n = etapeFrise(d);
  return n <= 2 ? "tri" : n <= 4 ? "qualification" : n <= 6 ? "commercialisation" : "transaction";
}

const prenomDe = (x) => String(x || "").split("@")[0].split(/[.\s]/)[0].toLowerCase();

/** Le dossier est-il à moi ? Sans responsable, il est à tout le monde. */
export function estAMoi(d, moi) {
  const m = prenomDe(moi);
  const qui = (d?.responsables?.length ? d.responsables : [d?.responsable]).filter(Boolean).map(prenomDe);
  return !qui.length || (!!m && qui.includes(m));
}

/**
 * Ce qui attend le dossier, et de qui :
 *  - « toi » : une relance due, un message non lu, des documents arrivés à
 *    lire, une analyse à décider, une pré-analyse à relire ;
 *  - « tiers » : des documents demandés, pas encore dus en relance.
 * Renvoie { de: "toi" | "tiers", pourquoi } ou null s'il n'y a rien à faire.
 */
export function aTraiter(d) {
  if (estEcarte(d) || d?.statut === "projet_cree" && etapeFrise(d) >= 5) return d?.fil_non_lus > 0 ? { de: "toi", pourquoi: "Un message vous attend" } : null;
  if (d?.a_relancer) return { de: "toi", pourquoi: "À relancer" };
  if (d?.fil_non_lus > 0) return { de: "toi", pourquoi: "Un message vous attend" };
  if (d?.statut === "documents_demandes") return { de: "tiers", pourquoi: "Documents demandés à l'agent" };
  if (d?.statut === "documents_recus") return { de: "toi", pourquoi: "Documents reçus, à lire" };
  if (d?.statut === "depouille") return { de: "toi", pourquoi: "Analyse à décider" };
  if (d?.statut === "analyse" && etapeFrise(d) === 2) return { de: "toi", pourquoi: "Pré-analyse à relire" };
  return null;
}

/**
 * Les trois blocs de la liste. `moi` : l'e-mail ou le prénom de la personne.
 * Un dossier n'est que dans un bloc : écarté d'abord ; sinon « à toi d'agir »
 * s'il est à moi et qu'il attend quelque chose de moi ; « en attente d'un
 * tiers » s'il est à moi et attend un tiers ; sinon au pipeline.
 * Le pipeline garde aussi les dossiers « à traiter » des autres.
 */
export function classer(dossiers, moi) {
  const r = { toi: [], tiers: [], ecartes: [], pipeline: Object.fromEntries(PHASES.map((p) => [p.id, []])) };
  for (const d of dossiers || []) {
    if (d.archived) continue;
    if (estEcarte(d)) { r.ecartes.push(d); continue; }
    const t = aTraiter(d);
    if (t && estAMoi(d, moi)) { (t.de === "toi" ? r.toi : r.tiers).push({ ...d, pourquoi: t.pourquoi }); continue; }
    r.pipeline[phaseDe(d)].push(d);
  }
  return r;
}

// Les pièces attendues d'un dossier de murs commerciaux, et comment les reconnaître : par la catégorie posée
// sur le document (Data Room), sinon par son nom.
const PIECES_ATTENDUES = [
  ["Bail commercial", /\bbail|avenant|renouvellement/],
  ["Quittances", /quittance|appel de loyer|avis d.?[ée]ch[ée]ance/],
  ["Règlement de copropriété", /r[eè]glement|\brcp\b|copropri/],
  ["Assemblée générale", /\bpv\b|assembl|\bag\b/],
  ["Diagnostics", /\bdpe\b|diag|amiante|plomb|termite|\berp\b/],
  ["Taxe foncière", /taxe|fonci/],
];
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Pure : chaque pièce attendue avec les documents qui la couvrent, et les documents qui n'en couvrent aucune. */
export function checklistDataRoom(documents = []) {
  const pris = new Set();
  const pieces = PIECES_ATTENDUES.map(([nom, re]) => {
    const docs = documents.filter((d) => sansAccent(d.categorie) === sansAccent(nom) || (!d.categorie || d.categorie === "Autre") && re.test(sansAccent(d.nom)));
    docs.forEach((d) => pris.add(d));
    return { nom, docs };
  });
  return { pieces, autres: documents.filter((d) => !pris.has(d)) };
}
