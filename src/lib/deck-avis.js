// Le deck de l'avis de valeur K Partners (26 oct. 2026, Jules) : douze pages que le mandataire montre au vendeur
// pour soutenir son estimation. Le bien, puis le prix (un loyer divisé par un taux), puis la preuve (les ventes
// comparables). Le deck ne porte aucun chiffre à lui : tout vient de l'avis rédigé et du questionnaire de
// l'estimation, pour qu'il ne contredise jamais l'avis. Une valeur absente se dit « à renseigner », jamais inventée.
// Pure et testable (server/deck-avis.test.js) ; la méthode de calcul vit dans l'avis (server/mandataire-avis.js,
// `chiffrer`), le deck la raconte.

export const A_RENSEIGNER = "à renseigner";

export const CHAPITRES = [
  ["locatif", "Bilan de la situation locative", "Situation locative"],
  ["ville", "La ville", "La ville"],
  ["quartier", "Le quartier", "Le quartier"],
  ["local", "Le local", "Le local"],
  ["usages", "Activités et valeur locative", "Activités et loyer"],
  ["taux", "Le taux de capitalisation", "Le taux"],
  ["calcul", "Le calcul du prix", "Le calcul du prix"],
  ["comparables", "Les comparables", "Les comparables"],
  ["valeur", "La valeur retenue", "La valeur retenue"],
  ["mandataire", "Votre mandataire", "Votre mandataire"],
];

const nombre = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && String(v).match(/\d/) ? n : null;
};
export const euros = (v) => (nombre(v) == null ? null : `${Math.round(nombre(v)).toLocaleString("fr-FR")} €`);
export const pourcent = (v, decimales = 2) => (nombre(v) == null ? null : `${nombre(v).toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`);
const annee = (t) => { const m = String(t || "").match(/(19|20)\d{2}/); return m ? Number(m[0]) : null; };
/** La date d'un texte (« 01/01/2023 », « 2031-12-31 », « décembre 2031 »), au jour près quand on peut. */
export function dateDe(t) {
  const s = String(t || "");
  let m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-]((?:19|20)\d{2})/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  m = s.match(/((?:19|20)\d{2})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const a = annee(s);
  return a ? new Date(Date.UTC(a, 11, 31)) : null;
}
/** Un texte de ligne, court : sa première proposition, sans parenthèse, sans « [à compléter] ». */
const court = (t, max = 70) => {
  if (trou(t)) return null;
  let x = String(t || "").replace(/\s*\([^)]*\)?/g, "").replace(/\[[^\]]*\]\s*[-–—:]?\s*/g, "").trim();
  if (!x) return null;
  if (x.length > max) x = `${x.slice(0, max).replace(/[\s,;:]+\S*$/, "")}…`;
  return x.charAt(0).toUpperCase() + x.slice(1);
};
const m2 = (v) => (nombre(v) == null ? null : `${nombre(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m²`);
const proche = (a, b) => nombre(a) && nombre(b) && Math.abs(nombre(a) - nombre(b)) / nombre(a) < 0.02;
const ligne = (lignes, mot) => (lignes || []).find((l) => String(l.mot).toLowerCase().startsWith(mot.toLowerCase()))?.texte || null;
/** La première phrase d'un texte, coupée au mot près au-delà de `max` caractères (la phrase de gauche tient en 3 lignes). */
const premiereLigne = (t, max = 110) => {
  const p = String(t || "").split(/(?<=[.!?])\s/)[0]?.trim() || "";
  if (p.length <= max) return p;
  return `${p.slice(0, max).replace(/[\s,;:(]+\S*$/, "")}…`;
};
// Un texte entre crochets (« [à compléter] », retouché ou non) est un trou de l'avis, pas une valeur.
const trou = (v) => !v || /^\s*\[.*\]\s*$/.test(String(v));
const villeSeule = (v) => (trou(v) ? "" : String(v || "").replace(/^\d{5}\s*/, "").trim());
/** La ville d'une adresse complète (« 1 avenue Mirabeau, 06000 Nice »). */
const villeDeLAdresse = (a) => { const m = String(a || "").match(/\d{5}\s+([^,]+)$/); return m ? m[1].trim() : ""; };

/**
 * Pure : les douze pages du deck, depuis l'avis (`avis`) et l'estimation (son questionnaire `estimation.questionnaire`).
 * `aujourdhui` se passe pour les tests.
 */
export function deckDeLAvis({ avis = {}, estimation = {} } = {}, { aujourdhui = new Date() } = {}) {
  const q = estimation?.questionnaire || {};
  const villeChiffres = avis.ville || estimation?.ville_chiffres || null;
  const c = avis.chiffres || {};
  const m = avis.methodes || {};
  const loyer = nombre(m.loyer) ?? nombre(q.loyer_annuel_hc);
  const taux = nombre(m.taux);
  const surfaces = avis.description?.surfaces || [];
  const surfaceUtile = nombre(m.surface) ?? (surfaces.reduce((t, s) => t + (nombre(s.utile) || 0), 0) || null);
  const surfacePonderee = surfaces.length ? surfaces.reduce((t, s) => t + (nombre(s.ponderee) || 0), 0) || null : null;
  const boutique = nombre(surfaces[0]?.utile) || surfaceUtile;
  const ville = villeSeule(avis.bien?.ville) || villeDeLAdresse(avis.bien?.adresse) || villeDeLAdresse(q.adresse) || villeSeule(q.ville) || "";
  const type = avis.type_libelle || "Murs de commerce";

  // Le bail : de sa date d'effet à son échéance, les triennales entre les deux.
  const effet = dateDe(q.date_effet);
  const fin = dateDe(q.echeance) || (effet ? new Date(Date.UTC(effet.getUTCFullYear() + 9, effet.getUTCMonth(), effet.getUTCDate())) : null);
  const restant = fin ? Math.max(0, (fin - aujourdhui) / (365.25 * 86400000)) : null;
  const frise = [];
  if (effet) frise.push({ annee: effet.getUTCFullYear(), mot: "Prise d'effet" });
  frise.push({ annee: aujourdhui.getUTCFullYear(), mot: "Aujourd'hui", present: true });
  if (effet && fin) {
    for (let a = effet.getUTCFullYear() + 3; a < fin.getUTCFullYear(); a += 3) if (a > aujourdhui.getUTCFullYear()) { frise.push({ annee: a, mot: "Triennale" }); break; }
  }
  if (fin) frise.push({ annee: fin.getUTCFullYear(), mot: "Échéance" });
  frise.sort((a, b) => a.annee - b.annee || (a.present ? -1 : 1));

  const loc = avis.locatif || {};
  const lignesBail = [
    ["Locataire", ligne(loc.lignes, "Locataire")],
    ["Paiements", ligne(loc.lignes, "Paiements")],
    ["Bail", ligne(loc.lignes, "Bail")],
    ["Loyer", ligne(loc.lignes, "Loyer")],
    ["Charges", [ligne(loc.lignes, "Taxe foncière"), ligne(loc.lignes, "Charges")].filter(Boolean).join(" · ") || null],
    ["Garantie", ligne(loc.lignes, "Dépôt")],
  ].map(([mot, texte]) => ({ mot, texte: court(texte) || A_RENSEIGNER, vide: !court(texte) }));

  const empl = avis.emplacement || {};
  const lignesQuartier = (empl.lignes || []).map((l) => ({ mot: l.mot, texte: court(l.texte), alerte: !!l.alerte })).filter((l) => l.texte).slice(0, 6);

  const jur = avis.juridique || {};
  const desc = avis.description || {};
  const lignesLocal = [
    surfacePonderee && Math.round(surfacePonderee) !== Math.round(surfaceUtile || 0) ? { mot: "Surface pondérée", texte: m2(surfacePonderee) } : null,
    ...(desc.lignes || []).filter((l) => l.mot !== "Désignation").map((l) => ({ mot: l.mot, texte: court(l.texte, 60) })),
    { mot: "Copropriété", texte: court(ligne(jur.lignes, "Copropriété"), 60) },
    { mot: "Diagnostics", texte: court(ligne(jur.lignes, "Diagnostics"), 60) },
  ].filter((l) => l && l.texte).slice(0, 5);

  const loyersMarche = avis.marche?.loyers || null;
  const loyerM2 = loyer && boutique ? Math.round(loyer / boutique) : null;
  const marcheBas = nombre(loyersMarche?.basse), marcheHaut = nombre(loyersMarche?.haute);
  const auMarche = loyerM2 && marcheBas && marcheHaut
    ? loyerM2 < marcheBas ? "Sous le marché" : loyerM2 > marcheHaut ? "Au-dessus du marché" : "Au prix du marché"
    : null;

  // La sensibilité au taux : les trois lignes de l'avis (taux bas, retenu, haut).
  const s = c.sensibilite || null;
  const sensibilite = s && taux ? [
    { taux: s.taux_bas, valeur: s.valeur_basse_taux },
    { taux, valeur: c.capitalisation || (loyer && taux ? Math.round(loyer / (taux / 100)) : null), retenu: true },
    { taux: s.taux_haut, valeur: s.valeur_haute_taux },
  ] : [];

  const casse = (t) => String(t || "").toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (x) => x.toUpperCase());
  const refs = (avis.marche?.references || []).slice(0, 3).map((r) => ({
    bien: r.adresse ? casse(String(r.adresse).split(",")[0]) : r.bien || "Local commercial",
    surface: nombre(r.surface), prix: nombre(r.prix), prix_m2: nombre(r.prix_m2), annee: r.date || null,
  }));
  const valeur = nombre(c.valeur);
  const valeurM2 = valeur && surfaceUtile ? Math.round(valeur / surfaceUtile) : null;
  const m2Refs = refs.map((r) => r.prix_m2).filter(Boolean);
  const dansLEcart = valeurM2 && m2Refs.length ? { bas: Math.min(...m2Refs), haut: Math.max(...m2Refs), dedans: valeurM2 >= Math.min(...m2Refs) && valeurM2 <= Math.max(...m2Refs) } : null;

  const sig = avis.signataire || {};
  const titreBien = `${type} à ${ville || "[ville]"}`;

  const pages = [
      { cle: "couverture", section: "Avis de valeur", titre: titreBien, phrase: null,
        adresse: [trou(avis.bien?.rue) ? null : avis.bien?.rue, trou(avis.bien?.ville) ? (avis.bien?.adresse || "").match(/\d{5}\s+[^,]+$/)?.[0] : avis.bien?.ville].filter(Boolean).join(", ") || A_RENSEIGNER,
        mandataire: trou(sig.nom) ? A_RENSEIGNER : sig.nom, proprietaire: trou(avis.demandeur) ? A_RENSEIGNER : avis.demandeur,
        valeur, bas: nombre(c.bas), haut: nombre(c.haut), loyer, taux, restant },
      { cle: "sommaire", section: "Sommaire", titre: "Sommaire", phrase: ["Le bail, puis la ville, le quartier et le local.", "Enfin, le prix et sa preuve."],
        chapitres: CHAPITRES.map(([, mot], i) => ({ n: i + 1, mot, page: i + 3 })) },
      { cle: "locatif", section: "Situation locative", titre: "Le bilan locatif",
        phrase: avis.occupe === false ? ["Le local est libre.", "Sa valeur se lit au loyer qu'il peut porter."] : [premiereLigne(loc.synthese) || "Un locataire en place, un loyer à lire.", fin ? `Un revenu jusqu'en ${fin.getUTCFullYear()}.` : ""],
        frise, lignes: lignesBail },
      { cle: "ville", section: "La ville", titre: `La ville${ville ? ` de ${ville}` : ""}`, phrase: [premiereLigne(avis.marche?.lecture) || "Le marché de la commune.", ""],
        // Les chiffres de la commune (26 oct. 2026) : posés dans l'avis par donnees_commune (INSEE, Le Figaro), chacun sourcé.
        tuiles: [
          ["population", "Habitants", (v) => Math.round(v).toLocaleString("fr-FR")],
          ["revenu", "Niveau de vie médian", (v) => euros(v)],
          ["chomage", "Chômage de la zone d'emploi", (v) => pourcent(v, 1)],
          ["logement", "Prix du logement, médian", (v) => `${Math.round(v).toLocaleString("fr-FR")} €/m²`],
        ].map(([cle, mot, f]) => { const x = villeChiffres?.[cle]; return { cle, mot, valeur: x?.valeur != null ? f(x.valeur) : A_RENSEIGNER, vide: x?.valeur == null }; }),
        texte: avis.marche?.synthese || "", sources: [...new Set(["population", "revenu", "chomage", "logement"].map((k) => villeChiffres?.[k]?.source).filter(Boolean))].join(" · ") || "INSEE, Le Figaro" },
      { cle: "quartier", section: "Le quartier", titre: "Le quartier", phrase: [premiereLigne(empl.synthese) || "Ce qui fait la valeur de l'adresse.", ""],
        lignes: lignesQuartier.length ? lignesQuartier : [{ mot: "Emplacement", texte: A_RENSEIGNER, vide: true }] },
      { cle: "local", section: "Le local", titre: "Le local", phrase: [premiereLigne(desc.resume) || "Le local.", ""],
        tuiles: surfaces.slice(0, 3).map((x) => ({ valeur: m2(x.utile), mot: x.zone })),
        lignes: lignesLocal },
      { cle: "usages", section: "Activités et loyer", titre: "Les usages", phrase: ["Ce que le local peut accueillir,", "et le loyer qu'il porte."],
        autorisees: [
          { mot: "Bail", texte: court(q.activite_locataire, 60) || court(ligne(loc.lignes, "Locataire"), 60) || A_RENSEIGNER },
          { mot: "Copropriété", texte: court(ligne(jur.lignes, "Copropriété"), 60) || A_RENSEIGNER },
          { mot: "PLU", texte: court(ligne(jur.lignes, "Urbanisme"), 60) || A_RENSEIGNER },
        ],
        marche: marcheBas && marcheHaut ? { bas: marcheBas, haut: marcheHaut, annuel_bas: boutique ? Math.round(marcheBas * boutique / 100) * 100 : null, annuel_haut: boutique ? Math.round(marcheHaut * boutique / 100) * 100 : null } : null,
        loyer_m2: loyerM2, au_marche: auMarche, source: loyersMarche?.source || null },
      { cle: "taux", section: "Le taux", titre: "Le taux", phrase: ["On part du taux du secteur, puis on l'ajuste au bien.", "C'est lui qui fait le prix."],
        taux, justification: m.justification_taux || "", source: m.source_taux || null },
      { cle: "calcul", section: "Le calcul du prix", titre: "Le calcul", phrase: m.equimmox?.methodes?.length ? ["Quatre méthodes, pondérées.", "Un calcul que vous pouvez refaire."] : ["Le loyer divisé par le taux.", "Un calcul que vous pouvez refaire."],
        loyer, taux, capitalisation: nombre(c.capitalisation), valeur, sensibilite,
        // Depuis le 26 oct. 2026 : les quatre méthodes d'Equimmox et leur poids, quand l'avis en vient.
        ponderation: (m.equimmox?.methodes || []).map((x) => ({ nom: x.nom, valeur: nombre(x.valeur), coefficient: nombre(x.coefficient), fourchette_m2: x.bas_m2 && x.haut_m2 ? [x.bas_m2, x.haut_m2] : null, taux: x.taux ?? null })),
        valeur_brute: nombre(m.equimmox?.valeur_brute) },
      { cle: "comparables", section: "Les comparables", titre: "Les comparables", phrase: null,
        references: refs, votre: { surface: surfaceUtile, prix: valeur, prix_m2: valeurM2, rendement: nombre(c.rendement) },
        ecart_m2: dansLEcart, source: avis.marche?.source || "" },
      { cle: "valeur", section: "La valeur retenue", titre: "La valeur", phrase: valeur && c.bas && c.haut ? [`Vos murs valent entre ${euros(c.bas)} et ${euros(c.haut)}.`, `Nous retenons ${euros(valeur)}.`] : ["La valeur de vos murs.", ""],
        valeur, bas: nombre(c.bas), haut: nombre(c.haut), prix_acquereur: nombre(c.cout_total), rendement_acquereur: nombre(c.rendement_total), m2: valeurM2,
        // Le taux sous une borne seulement quand la borne vient de la sensibilité (pas de la fourchette Data-B).
        taux_bas: s && proche(c.bas, s.valeur_haute_taux) ? s.taux_haut : null, taux_haut: s && proche(c.haut, s.valeur_basse_taux) ? s.taux_bas : null },
      { cle: "mandataire", section: "Votre mandataire", titre: "Votre mandataire", phrase: ["Un interlocuteur, du mandat à la vente.", ""],
        nom: sig.nom || A_RENSEIGNER, telephone: sig.telephone || A_RENSEIGNER, email: sig.email || A_RENSEIGNER,
        secteur: sig.ville_signature || A_RENSEIGNER, photo: sig.photo || null },
  ];
  // Les retouches du deck (26 oct. 2026, mode Édition) : le titre et la phrase d'une page, gardés dans l'avis (`avis.deck`,
  // « locatif.titre », « locatif.phrase »). Les chiffres ne se retouchent pas ici : ils viennent de l'avis.
  const retouches = avis.deck || {};
  for (const page of pages) {
    if (typeof retouches[`${page.cle}.titre`] === "string" && retouches[`${page.cle}.titre`].trim()) page.titre = retouches[`${page.cle}.titre`];
    if (typeof retouches[`${page.cle}.phrase`] === "string") page.phrase = retouches[`${page.cle}.phrase`] ? [retouches[`${page.cle}.phrase`], ""] : null;
  }
  // Les pages retirées du deck (26 oct. 2026, Jules : « on supprime la 6, la 7 devient la 6 ») : gardées dans l'avis
  // (`avis.deck.masquees`), jamais la couverture. Les numéros suivent l'ordre qui reste, et le sommaire aussi.
  const masquees = new Set(Array.isArray(retouches.masquees) ? retouches.masquees.filter((c) => c !== "couverture") : []);
  const restantes = pages.filter((x) => !masquees.has(x.cle));
  const sommaire = restantes.find((x) => x.cle === "sommaire");
  if (sommaire) {
    sommaire.chapitres = restantes
      .map((x, i) => ({ x, page: i + 1 }))
      .filter(({ x }) => x.cle !== "couverture" && x.cle !== "sommaire")
      .map(({ x, page }, i) => ({ n: i + 1, mot: (CHAPITRES.find(([k]) => k === x.cle) || [])[1] || x.titre, page }));
  }
  return { titre: titreBien, pages: restantes, masquees: [...masquees] };
}
