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
  ["valeur", "La valeur retenue", "La valeur retenue"],
  ["mandataire", "Votre mandataire", "Votre mandataire"],
];
// Les chapitres propres à l'avis de valeur locative (6 nov. 2026, Jules) : les loyers du secteur et les conditions.
const CHAPITRES_LOCATION = [
  ["secteur", "Les loyers du secteur", "Les loyers du secteur"],
  ["valeur", "Le loyer estimé", "Le loyer estimé"],
  ["conditions", "Les conditions conseillées", "Les conditions"],
];
const chapitreDe = (cle, location) => ((location ? CHAPITRES_LOCATION.find(([k]) => k === cle) : null) || CHAPITRES.find(([k]) => k === cle) || [])[1];

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
// « de Antibes » → « d'Antibes », « de Le Havre » → « du Havre » (31 oct. 2026).
export const deVille = (v) => (/^les\s/i.test(v) ? `des ${v.slice(4)}` : /^le\s/i.test(v) ? `du ${v.slice(3)}` : /^[aeiouyhàâäéèêëîïôöûü]/i.test(v) ? `d'${v}` : `de ${v}`);
// La taxe foncière et les charges dites pareil (« refacturée au locataire ») tiennent en une phrase, sans redite.
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).map((w) => w.replace(/s$/, "").replace(/e$/, "")).join(" ").trim();
export function chargesDe(taxe, charges) {
  if (taxe && charges && sansAccent(taxe) === sansAccent(charges)) return `Taxe foncière et charges ${String(charges).replace(/^refactur[ée]+s?/i, "refacturées").replace(/^./, (c) => c.toLowerCase())}`;
  return [taxe ? `Taxe foncière : ${taxe}` : null, charges ? `Charges : ${charges}` : null].filter(Boolean).join(" · ") || null;
}
const ligne = (lignes, mot) => (lignes || []).find((l) => String(l.mot).toLowerCase().startsWith(mot.toLowerCase()))?.texte || null;
/** La première phrase d'un texte, coupée au mot près au-delà de `max` caractères (la phrase de gauche tient en 3 lignes). */
const premiereLigne = (t, max = 110) => {
  const p = String(t || "").split(/(?<=[.!?])\s/)[0]?.trim() || "";
  if (p.length <= max) return p;
  return `${p.slice(0, max).replace(/[\s,;:(]+\S*$/, "")}…`;
};
// Un texte entre crochets (« [à compléter] », retouché ou non) est un trou de l'avis, pas une valeur.
const trou = (v) => !v || /^\s*\[.*\]\s*$/.test(String(v));
// L'arrondissement de Paris, Lyon ou Marseille, depuis le code postal (31 oct. 2026, maquette de Jules : « Lyon 3e »).
export const arrondissement = (cp, ville) => {
  const m = String(cp || "").match(/^(75|69|13)0(\d{2})$/);
  if (!m || !/^(paris|lyon|marseille)/i.test(String(ville || ""))) return "";
  const n = Number(m[2]);
  return n ? ` ${n}${n === 1 ? "er" : "e"}` : "";
};
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
  const ponderee = !!surfacePonderee && Math.round(surfacePonderee) !== Math.round(surfaceUtile || 0);
  const boutique = nombre(surfaces[0]?.utile) || surfaceUtile;
  const ville = villeSeule(avis.bien?.ville) || villeDeLAdresse(avis.bien?.adresse) || villeDeLAdresse(q.adresse) || villeSeule(q.ville) || "";
  const type = avis.type_libelle || "Murs de commerce";
  // Un fonds de commerce (3 nov. 2026) ne se vaut ni par un taux ni par un loyer capitalisé : ses pages Taux et Calcul
  // ne paraissent pas, la méthode est dans l'avis.
  const fonds = avis.type_bien === "fonds_commerce";
  // Un local à louer (6 nov. 2026, Jules) : l'avis de valeur locative. Ni bail en place, ni taux, ni calcul du prix ;
  // les loyers du secteur, le loyer estimé et les conditions conseillées à la place.
  const location = avis.location === true;

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
    ["Charges", chargesDe(ligne(loc.lignes, "Taxe foncière"), ligne(loc.lignes, "Charges"))],
    ["Garantie", ligne(loc.lignes, "Dépôt")],
  ].map(([mot, texte]) => ({ mot, texte: court(texte) || A_RENSEIGNER, vide: !court(texte) }));

  const empl = avis.emplacement || {};
  // Le quartier en tableau, sans l'accès ni les mouvements BODACC (31 oct. 2026, Jules), ni les points de vigilance.
  const HORS_QUARTIER = /acc[eè]s|bodacc|vigilance/i;
  const lignesQuartier = (empl.lignes || []).filter((l) => !HORS_QUARTIER.test(l.mot || "")).map((l) => ({ mot: l.mot, texte: court(l.texte), alerte: !!l.alerte })).filter((l) => l.texte).slice(0, 6);

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

  const valeur = nombre(c.valeur);

  const sig = avis.signataire || {};
  const cp = String(avis.bien?.ville || avis.bien?.adresse || q.adresse || "").match(/\b\d{5}\b/)?.[0] || "";
  const lieu = ville ? `${ville}${arrondissement(cp, ville)}` : "";
  const titreBien = `${type} à ${lieu || "[ville]"}`;
  // La couverture (maquette du 31 oct. 2026) : le bien, pas encore son prix.
  const accroche = court(ligne(desc.lignes, "Désignation"), 50) || court(premiereLigne(desc.resume), 50) || null;

  const pages = [
      { cle: "couverture", section: location ? "Avis de valeur locative" : "Avis de valeur", titre: titreBien, phrase: null,
        adresse: [trou(avis.bien?.rue) ? null : avis.bien?.rue, trou(avis.bien?.ville) ? (avis.bien?.adresse || "").match(/\d{5}\s+[^,]+$/)?.[0] : avis.bien?.ville].filter(Boolean).join(", ") || A_RENSEIGNER,
        mandataire: trou(sig.nom) ? A_RENSEIGNER : sig.nom, proprietaire: trou(avis.demandeur) ? A_RENSEIGNER : avis.demandeur,
        etat: location ? `${type} à louer` : fonds ? type : `${type}${avis.occupe === false ? " libres" : " loués"}`, lieu: lieu || A_RENSEIGNER, accroche,
        ...(location ? { location: true, disponible: court(q.disponible_le, 30) || null } : {}),
        // Une surface pondérée égale à l'utile n'est pas pondérée (31 oct. 2026 : « 80 m² · Surface pondérée » pour 80 m² utiles).
        loyer: location ? nombre(c.valeur) : loyer, surface: ponderee ? surfacePonderee : surfaceUtile || surfacePonderee, surface_ponderee: ponderee, echeance: fin ? fin.getUTCFullYear() : null, restant },
      { cle: "sommaire", section: "Sommaire", titre: "Sommaire", phrase: location ? ["La ville, le quartier et le local.", "Puis les loyers du secteur, le loyer et les conditions."] : ["Le bail, puis la ville, le quartier et le local.", "Enfin, le prix et son calcul."],
        chapitres: CHAPITRES.map(([, mot], i) => ({ n: i + 1, mot, page: i + 3 })) },
      { cle: "locatif", section: "Situation locative", titre: "Le bilan locatif",
        phrase: avis.occupe === false ? ["Le local est libre.", "Sa valeur se lit au loyer qu'il peut porter."] : [premiereLigne(loc.synthese) || "Un locataire en place, un loyer à lire.", fin ? `Un revenu jusqu'en ${fin.getUTCFullYear()}.` : ""],
        frise, lignes: lignesBail },
      { cle: "ville", section: "La ville", titre: `La ville${ville ? ` ${deVille(ville)}` : ""}`, phrase: ["Ce que dit la commune.", ""],
        // Sa photo, trouvée sur Google à la rédaction (1er nov. 2026, Jules), et son auteur, que Google demande de citer.
        photo: avis.photos?.ville || null, photo_auteur: avis.photos?.ville_auteur || null,
        // Les chiffres de la commune (26 oct. 2026) : posés dans l'avis par donnees_commune (INSEE, Le Figaro), chacun sourcé.
        tuiles: [
          ["population", "Habitants", (v) => Math.round(v).toLocaleString("fr-FR")],
          ["revenu", "Niveau de vie médian", (v) => euros(v)],
          ["chomage", "Chômage de la zone d'emploi", (v) => pourcent(v, 1)],
          ["logement", "Prix du logement, médian", (v) => `${Math.round(v).toLocaleString("fr-FR")} €/m²`],
        ].map(([cle, mot, f]) => { const x = villeChiffres?.[cle]; return { cle, mot, valeur: x?.valeur != null ? f(x.valeur) : A_RENSEIGNER, vide: x?.valeur == null }; }),
        // Plus de texte de marché sous les chiffres (31 oct. 2026, Jules : « pas les ventes autour »).
        texte: "", sources: [...new Set(["population", "revenu", "chomage", "logement"].map((k) => villeChiffres?.[k]?.source).filter(Boolean))].join(" · ") || "INSEE, Le Figaro" },
      { cle: "quartier", section: "Le quartier", titre: "Le quartier", phrase: [premiereLigne(empl.synthese) || "Ce qui fait la valeur de l'adresse.", ""],
        lignes: lignesQuartier.length ? lignesQuartier : [{ mot: "Emplacement", texte: A_RENSEIGNER, vide: true }] },
      { cle: "local", section: "Le local", titre: "Le local", phrase: [premiereLigne(desc.resume) || "Le local.", ""],
        tuiles: surfaces.slice(0, 3).map((x) => ({ valeur: m2(x.utile), mot: x.zone })),
        lignes: lignesLocal },
      { cle: "usages", section: "Activités et loyer", titre: "Les usages", phrase: ["Ce que le local peut accueillir,", "et le loyer qu'il porte."],
        autorisees: location ? [
          { mot: "Destination", texte: court(q.destination, 60) || court(ligne(desc.lignes, "Destination"), 60) || A_RENSEIGNER },
          { mot: "Extraction", texte: court(ligne(desc.lignes, "Extraction"), 60) || court(q.extraction, 60) || A_RENSEIGNER },
          { mot: "PLU", texte: court(ligne(jur.lignes, "Urbanisme"), 60) || A_RENSEIGNER },
        ] : [
          { mot: "Bail", texte: court(q.activite_locataire, 60) || court(ligne(loc.lignes, "Locataire"), 60) || A_RENSEIGNER },
          { mot: "Copropriété", texte: court(ligne(jur.lignes, "Copropriété"), 60) || A_RENSEIGNER },
          { mot: "PLU", texte: court(ligne(jur.lignes, "Urbanisme"), 60) || A_RENSEIGNER },
        ],
        marche: marcheBas && marcheHaut ? { bas: marcheBas, haut: marcheHaut, annuel_bas: boutique ? Math.round(marcheBas * boutique / 100) * 100 : null, annuel_haut: boutique ? Math.round(marcheHaut * boutique / 100) * 100 : null } : null,
        loyer_m2: location ? nombre(c.loyer_m2) : loyerM2, au_marche: location ? null : auMarche, source: loyersMarche?.source || null, ...(location ? { location: true } : {}) },
      { cle: "taux", section: "Le taux", titre: "Le taux", phrase: [m.rendement ? "On part du taux de la ville, puis on l'ajuste au bien." : "On part du taux du secteur, puis on l'ajuste au bien.", "C'est lui qui fait le prix."],
        taux, justification: m.justification_taux || "", source: m.rendement ? null : m.source_taux || null,
        // Le taux pas à pas (31 oct. 2026) : la base de la ville, puis chaque ajustement du bien.
        etapes: m.rendement ? [
          { mot: "Taux de base de la ville", sous: lieu ? `${lieu}, validé par les mandataires K Partners` : "Validé par les mandataires K Partners", valeur: pourcent(m.rendement.taux_base) },
          ...(m.rendement.ajustements || []).map((a) => ({ mot: String(a.motif || "").replace(/^./, (x) => x.toUpperCase()), sous: null, valeur: `${a.delta > 0 ? "+" : "−"} ${Math.abs(a.delta).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}` })),
        ] : [] },
      { cle: "calcul", section: "Le calcul du prix", titre: "Le calcul", phrase: ["Le loyer divisé par le taux.", "Un calcul que vous pouvez refaire."],
        // La capitalisation seule depuis le 31 oct. 2026 (Jules) : plus de méthodes pondérées ni de comparables.
        loyer, taux, capitalisation: nombre(c.capitalisation), valeur, sensibilite },
      { cle: "valeur", section: "La valeur retenue", titre: "La valeur", phrase: valeur && c.bas && c.haut ? [`${fonds ? "Votre fonds vaut" : "Vos murs valent"} entre ${euros(c.bas)} et ${euros(c.haut)}.`, `Nous retenons ${euros(valeur)}.`] : [fonds ? "La valeur de votre fonds." : "La valeur de vos murs.", ""],
        valeur, bas: nombre(c.bas), haut: nombre(c.haut), prix_acquereur: nombre(c.cout_total), rendement_acquereur: nombre(c.rendement_total), honoraires_pct: nombre(c.honoraires_pct) ?? 5, frais_pct: nombre(c.frais_pct) ?? 7.5,
        // Au m² de la surface pondérée quand l'avis l'a (maquette du 31 oct. 2026), sinon de la surface utile.
        m2: valeur && (surfacePonderee || surfaceUtile) ? Math.round(valeur / (surfacePonderee || surfaceUtile)) : null, m2_pondere: !!surfacePonderee,
        // Le taux sous une borne seulement quand la borne vient de la sensibilité (pas de la fourchette Data-B).
        taux_bas: s && proche(c.bas, s.valeur_haute_taux) ? s.taux_haut : null, taux_haut: s && proche(c.haut, s.valeur_basse_taux) ? s.taux_bas : null },
      { cle: "mandataire", section: "Votre mandataire", titre: "Votre mandataire", phrase: ["Un interlocuteur, du mandat à la vente.", ""],
        nom: sig.nom || A_RENSEIGNER, telephone: sig.telephone || A_RENSEIGNER, email: sig.email || A_RENSEIGNER,
        secteur: sig.ville_signature || A_RENSEIGNER, photo: sig.photo || null },
  ];
  // L'avis de valeur locative (6 nov. 2026, Jules) : les loyers du secteur, le loyer estimé et les conditions conseillées
  // prennent la place du taux, du calcul et de la valeur. Tout vient de l'avis : rien ne s'invente ici.
  if (location) {
    const cond = avis.conditions || {};
    const ech = { Rue: "Dans la rue", Quartier: "Dans le quartier", Ville: "Dans la ville" };
    const secteur = (avis.marche?.secteur || []).map((l) => ({ mot: ech[l.echelle] || l.echelle, sous: court(l.nom, 50), texte: nombre(l.basse) && nombre(l.haute) && nombre(l.basse) !== nombre(l.haute) ? `${Math.round(l.basse).toLocaleString("fr-FR")} – ${Math.round(l.haute).toLocaleString("fr-FR")} €/m²/an` : `${Math.round(nombre(l.basse) || nombre(l.haute)).toLocaleString("fr-FR")} €/m²/an` }));
    const surfaceLoyer = nombre(c.surface_ponderee) ?? surfacePonderee ?? surfaceUtile;
    const iValeur = pages.findIndex((x) => x.cle === "valeur");
    pages[iValeur] = {
      cle: "valeur", section: "Le loyer estimé", titre: "Le loyer", location: true,
      phrase: valeur && c.bas && c.haut ? [`Votre local se loue entre ${euros(c.bas)} et ${euros(c.haut)} par an.`, `Nous retenons ${euros(valeur)} HT HC.`] : ["Le loyer de votre local.", ""],
      valeur, bas: nombre(c.bas), haut: nombre(c.haut), m2: nombre(c.loyer_m2), mensuel: nombre(c.mensuel), surface: surfaceLoyer, m2_pondere: !!surfacePonderee,
    };
    pages.splice(iValeur, 0, {
      cle: "secteur", section: "Les loyers du secteur", titre: "Les loyers du secteur", phrase: ["Ce que se louent les locaux autour,", "au m² et par an."],
      lignes: secteur.length ? secteur : [{ mot: "Valeur locative de marché", texte: A_RENSEIGNER, vide: true }],
      lecture: court(avis.marche?.lecture, 220) || "", source: avis.marche?.loyers?.source || null,
      ajustements: (avis.methodes?.ajustements || []).map((a) => ({ mot: String(a.motif || "").replace(/^./, (x) => x.toUpperCase()), valeur: `${a.pct > 0 ? "+" : "−"} ${Math.abs(a.pct)} %` })),
      m2_marche: nombre(avis.methodes?.loyer_m2_marche),
    });
    pages.splice(iValeur + 2, 0, {
      cle: "conditions", section: "Les conditions conseillées", titre: "Les conditions", phrase: ["Ce que nous conseillons", "pour louer vite et bien."],
      lignes: [
        { mot: "Loyer annuel", texte: valeur ? `${euros(valeur)} HT HC` : A_RENSEIGNER, vide: !valeur },
        { mot: "Dépôt de garantie", texte: nombre(cond.depot_garantie) ? `${euros(cond.depot_garantie)}, ${cond.depot_garantie_mois || 3} mois de loyer HT` : A_RENSEIGNER, vide: !nombre(cond.depot_garantie) },
        { mot: "Franchise", texte: nombre(cond.franchise_mois) ? `${cond.franchise_mois} mois${cond.franchise_motif ? `, ${cond.franchise_motif}` : ""}` : "Aucune" },
        { mot: "Honoraires", texte: nombre(cond.honoraires) ? `${euros(cond.honoraires)} HT, ${cond.honoraires_pct ?? 15} % ${cond.honoraires_base || "du loyer annuel HT HC"}, à la charge du ${cond.honoraires_charge || "preneur"}` : A_RENSEIGNER, vide: !nombre(cond.honoraires) },
      ],
    });
  }
  // Les retouches du deck (26 oct. 2026, mode Édition) : le titre et la phrase d'une page, gardés dans l'avis (`avis.deck`,
  // « locatif.titre », « locatif.phrase »). Les chiffres ne se retouchent pas ici : ils viennent de l'avis.
  const retouches = avis.deck || {};
  for (const page of pages) {
    if (typeof retouches[`${page.cle}.titre`] === "string" && retouches[`${page.cle}.titre`].trim()) page.titre = retouches[`${page.cle}.titre`];
    if (typeof retouches[`${page.cle}.phrase`] === "string") page.phrase = retouches[`${page.cle}.phrase`] ? [retouches[`${page.cle}.phrase`], ""] : null;
  }
  // Les pages retirées du deck (26 oct. 2026, Jules : « on supprime la 6, la 7 devient la 6 ») : gardées dans l'avis
  // (`avis.deck.masquees`), jamais la couverture. Les numéros suivent l'ordre qui reste, et le sommaire aussi.
  const masquees = new Set([...(Array.isArray(retouches.masquees) ? retouches.masquees.filter((c) => c !== "couverture") : []), ...(fonds ? ["taux", "calcul"] : []), ...(location ? ["locatif", "taux", "calcul"] : [])]);
  const restantes = pages.filter((x) => !masquees.has(x.cle));
  const sommaire = restantes.find((x) => x.cle === "sommaire");
  if (sommaire) {
    sommaire.chapitres = restantes
      .map((x, i) => ({ x, page: i + 1 }))
      .filter(({ x }) => x.cle !== "couverture" && x.cle !== "sommaire")
      .map(({ x, page }, i) => ({ n: i + 1, mot: chapitreDe(x.cle, location) || x.titre, page }));
  }
  // Les textes des cartes retouchés en mode Édition (« <page>.c.<texte> ») : le deck les affiche à la place du calcul.
  const textes = Object.fromEntries(Object.entries(retouches).filter(([k, v]) => /^[a-z]+\.c\./.test(k) && typeof v === "string"));
  // Les pages qu'un avis de valeur locative n'a pas ne sont pas « retirées » : « Remettre » ne les propose pas.
  const retirees = location ? [...masquees].filter((k) => !["locatif", "taux", "calcul"].includes(k)) : [...masquees];
  return { titre: titreBien, pages: restantes, masquees: retirees, retouches: textes, etiquette: location ? "Avis de valeur locative" : "Avis de valeur", ...(location ? { location: true } : {}) };
}
