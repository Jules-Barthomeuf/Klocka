import { comparables, laPlusComparable, porteeDe, rayonEnMetres } from "@/lib/echelles";
import { decomposer, expliquer } from "@/lib/ponderation";

// Le marché tel qu'il revient vraiment : de l'état d'Alex et du lot à ce que
// l'écran affiche. Aucun chiffre n'est écrit ici — tout vient du serveur.
//
// Deux entrées :
//   etat     ce que rend /api/marche/alex/etat pendant et après la recherche
//            (tentatives, resultats par champ du lot, indicateurs, échecs…)
//   passage  le dernier passage du journal (/api/marche/journal), gardé en
//            base : c'est lui qui dit d'où vient chaque chiffre des jours après
//   lot      le lot du dossier, avec ce que les connecteurs y ont posé
//            (analyse_loyer, valeur_locative, transactions_fonds,
//            prix_residentiel, implantation) et ce que l'extraction y a lu
//            (surface_m2, loyer_annuel_ht_hc, prix_fai, rendement_annonce…)
//
// La règle qui tient tout, la même qu'en marche/normalise.js : un chiffre
// qu'aucune source n'a donné N'EXISTE PAS. Une carte sans donnée dit ce qui
// manque, elle n'invente pas.

const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? null : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d }));
const pct = (n, d = 1) => (n == null ? null : `${n > 0 ? "+" : ""}${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d })} %`);
const val = (champ) => {
  const v = champ?.valeur;
  return v == null || v === "" ? null : v;
};
const nb = (champ) => {
  const n = Number(val(champ));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Les libellés d'écran des connecteurs, tels que le fil les affiche. */
const ETIQUETTES = {
  equimmox: "EQUIMMOX",
  "data-b-valeur-locative": "DATA-B",
  "bodacc-cessions": "BODACC",
  "data-b-implantation": "DATA-B",
  figaro: "LE FIGARO IMMOBILIER",
};
const etiquette = (source) => ETIQUETTES[source] || String(source || "AGENT").toUpperCase();

/** Secondes écoulées entre le lancement et un instant ISO. */
const depuis = (iso, t0) => Math.max(0, (Date.parse(iso) - Date.parse(t0)) / 1000);

/** L'adresse d'un lot, en une ligne. */
export function adresseDe(lot) {
  const a = lot?.lot?.adresse?.valeur;
  if (!a) return null;
  return [a.rue, [a.code_postal, a.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
}

/** Les critères de la recherche, lus sur le lot. */
export function criteresDe(lot) {
  const surface = nb(lot?.lot?.surface_m2);
  const activite = val(lot?.lot?.locataire_activite);
  return [
    { cle: "adresse", libelle: "Adresse", valeur: adresseDe(lot) || "Adresse à renseigner", fixe: true },
    { cle: "rayon", libelle: "Rayon", valeur: "250 m (cessions) · 500 m (baux)", fixe: true },
    { cle: "nature", libelle: "Nature", valeur: activite ? `Murs commerciaux · ${activite}` : "Murs commerciaux", fixe: true },
    { cle: "surface", libelle: "Surface", valeur: surface ? `${Math.round(surface * 0.7)}–${Math.round(surface * 1.3)} m² (±30 % de ${fmt(surface)} m²)` : "Surface à renseigner", fixe: true },
    { cle: "periode", libelle: "Période", valeur: "24 mois", fixe: true },
  ];
}

// ── Le fil, pendant la recherche ────────────────────────────────────────────

/** Ce qu'une source a trouvé, en une phrase, d'après son résultat brut. */
function phraseResultat(champ, r) {
  if (!r) return null;
  switch (champ) {
    case "analyse_loyer":
      return r.bas != null || r.haut != null
        ? `Equimmox : baux comparables — bas ${fmt(r.bas)}, moyenne ${fmt(r.moyenne)}, haut ${fmt(r.haut)} €/m²/an${r.rayon ? ` (rayon ${r.rayon})` : ""}.`
        : "Equimmox a répondu sans fourchette.";
    case "valeur_locative": {
      const n = r.rue || r.quartier || r.ville;
      const ech = r.rue ? "rue" : r.quartier ? "quartier" : "ville";
      return n ? `Data-B : valeur locative de la ${ech} ${n.nom ? `(${n.nom}) ` : ""}— de ${fmt(n.basse)} à ${fmt(n.haute)} €/m²/an.` : "Data-B a répondu sans estimation.";
    }
    case "transactions_fonds":
      return `BODACC : ${fmt(r.total ?? r.transactions?.length)} cessions de fonds dans un rayon de ${r.rayon}${r.marche?.prix_median ? `, prix médian ${fmt(r.marche.prix_median)} €` : ""}${r.rue?.avec_prix ? ` — ${r.rue.avec_prix} dans la rue` : ""}.`;
    case "prix_residentiel": {
      const q = r.quartier || r.commune;
      return q ? `Le Figaro : résidentiel ${q.nom ? `(${q.nom}) ` : ""}${fmt(q.prix?.median)} €/m² médian${q.prix?.sur_1_an != null ? `, ${pct(q.prix.sur_1_an)} sur 1 an` : ""}${q.prix?.sur_5_ans != null ? `, ${pct(q.prix.sur_5_ans)} sur 5 ans` : ""}${q.loyer?.median ? ` — loyer ${fmt(q.loyer.median, 1)} €/m²/mois` : ""}.` : "Le Figaro a répondu sans chiffre.";
    }
    case "implantation":
      return `Data-B : étude d'implantation lue — flux piéton ${r.flux_pieton?.note ? `${r.flux_pieton.note.note}/${r.flux_pieton.note.sur}` : "—"}, flux voiture ${r.flux_voiture?.note ? `${r.flux_voiture.note.note}/${r.flux_voiture.note.sur}` : "—"}${r.troncon?.libelle ? `, ${r.troncon.libelle}` : ""}${r.demographie?.habitants ? `, ${fmt(r.demographie.habitants)} habitants` : ""}${r.revenu?.revenu_moyen_annuel ? `, revenu moyen ${fmt(r.revenu.revenu_moyen_annuel)} €/an` : ""}.`;
    default:
      return null;
  }
}

/** L'encart d'un résultat : le chiffre qui compte, et d'où il vient. */
function encartResultat(champ, r) {
  if (!r) return null;
  const source = r.source || champ;
  const base = { source, url: r.lien || null, capture: null };
  switch (champ) {
    case "analyse_loyer":
      return r.moyenne != null ? { ...base, libelle: "LOYER MOYEN EQUIMMOX", valeur: `${fmt(r.moyenne)} €/m²/an`, note: `Fourchette ${fmt(r.bas)} – ${fmt(r.haut)} €/m²/an${r.surface_min ? `, surfaces ${r.surface_min}–${r.surface_max} m²` : ""}${r.rayon ? `, rayon ${r.rayon}` : ""}. Baux réellement signés.` } : null;
    case "valeur_locative": {
      const n = r.rue || r.quartier || r.ville;
      return n ? { ...base, libelle: "VALEUR LOCATIVE DATA-B", valeur: `${fmt(n.basse)} – ${fmt(n.haute)} €/m²/an`, note: `Estimation à l'échelle ${r.rue ? "de la rue" : r.quartier ? "du quartier" : "de la ville"}${n.nom ? ` (${n.nom})` : ""}. Data-B estime ; Equimmox constate.` } : null;
    }
    case "transactions_fonds":
      return r.marche?.prix_median ? { ...base, libelle: "PRIX MÉDIAN DES FONDS", valeur: `${fmt(r.marche.prix_median)} €`, note: `${fmt(r.marche.avec_prix)} cession(s) chiffrée(s) sur ${fmt(r.total ?? r.transactions?.length)}, rayon ${r.rayon}. Fourchette ${fmt(r.marche.prix_bas)} – ${fmt(r.marche.prix_haut)} €.` } : null;
    case "prix_residentiel": {
      const q = r.quartier || r.commune;
      return q?.prix?.median ? { ...base, libelle: "PRIX RÉSIDENTIEL", valeur: `${fmt(q.prix.median)} €/m²`, url: q.lien || r.lien || null, note: `${q.nom || ""}${q.prix.bas ? ` — de ${fmt(q.prix.bas)} à ${fmt(q.prix.haut)} €/m²` : ""}${q.prix.sur_1_an != null ? `. ${pct(q.prix.sur_1_an)} sur 1 an, ${pct(q.prix.sur_5_ans)} sur 5 ans` : ""}.` } : null;
    }
    case "implantation":
      return r.flux_pieton?.note ? { ...base, libelle: "FLUX PIÉTON", valeur: `${r.flux_pieton.note.note} / ${r.flux_pieton.note.sur}`, note: `${r.troncon?.libelle || ""}${r.flux_pieton.par_heure?.haute ? ` — jusqu'à ${fmt(r.flux_pieton.par_heure.haute.max)} piétons par heure` : ""}${r.revenu?.revenu_moyen_annuel ? `. Revenu moyen ${fmt(r.revenu.revenu_moyen_annuel)} €/an, ${fmt(r.revenu.csp_plus)} CSP+` : ""}.` } : null;
    default:
      return null;
  }
}

/**
 * Le fil : une entrée par tentative, une par résultat posé, dans l'ordre du
 * temps. Le chrono part du lancement.
 */
export function filDe(etat, adresse = null) {
  if (!etat) return [];
  const t0 = etat.depuis || etat.tentatives?.[0]?.debut || new Date().toISOString();
  const entrees = [];

  // La première ligne part à zéro seconde. Sans elle, l'écran restait vide
  // jusqu'au premier retour du serveur — deux secondes et demie pendant
  // lesquelles on ne savait pas si quelque chose s'était lancé.
  const questions = (etat.etapes || []).map((e) => e.court?.split(" — ").pop() || e.court).filter(Boolean);
  entrees.push({
    t: 0,
    source: "AGENT",
    ton: "gris",
    texte: adresse
      ? `Je lance l’analyse sur ${adresse}.${questions.length ? ` ${questions.length} questions : ${questions.join(", ")}.` : ""}`
      : `Je lance l’analyse de marché.${questions.length ? ` ${questions.length} questions : ${questions.join(", ")}.` : ""}`,
  });

  for (const t of etat.tentatives || []) {
    const debut = depuis(t.debut, t0);
    const nom = t.service || t.source;
    if (t.essai === 1) entrees.push({ t: debut, source: etiquette(t.source), ton: "gris", texte: `Je me connecte à ${nom} et je lance la lecture.` });
    const fin = debut + (t.ms || 0) / 1000;
    if (t.ok) {
      entrees.push({ t: fin, source: etiquette(t.source), ton: "menthe", texte: `${nom} a répondu en ${Math.round((t.ms || 0) / 1000)} s.` });
    } else if (t.classe === "temporaire") {
      entrees.push({ t: fin, source: etiquette(t.source), ton: "ambre", texte: `${nom} ne répond pas (${t.erreur || "panne passagère"}). ${t.attente_ms ? `Je réessaie dans ${Math.round(t.attente_ms / 1000)} s.` : "Je passe à la source suivante."}` });
    } else {
      entrees.push({ t: fin, source: etiquette(t.source), ton: "rouge", texte: `${nom} : ${t.erreur || "échec"}${t.classe === "sans_donnee" ? " — rien sur cette adresse." : " — je n'insiste pas, je préviens."}` });
    }
  }

  // Les résultats posés : la phrase et l'encart. Leur instant est celui de la
  // tentative réussie de la même source.
  const finDe = (champ) => {
    const cle = { analyse_loyer: "equimmox", valeur_locative: "data-b-valeur-locative", transactions_fonds: "bodacc-cessions", prix_residentiel: "figaro", implantation: "data-b-implantation" }[champ];
    const t = (etat.tentatives || []).find((x) => x.source === cle && x.ok);
    return t ? depuis(t.debut, t0) + (t.ms || 0) / 1000 + 0.5 : null;
  };
  for (const [champ, r] of Object.entries(etat.resultats || {})) {
    const texte = phraseResultat(champ, r);
    if (!texte) continue;
    const t = finDe(champ) ?? (entrees.at(-1)?.t ?? 0) + 0.5;
    const encart = encartResultat(champ, r);
    entrees.push({ t, source: etiquette({ analyse_loyer: "equimmox", valeur_locative: "data-b-valeur-locative", transactions_fonds: "bodacc-cessions", prix_residentiel: "figaro", implantation: "data-b-implantation" }[champ]), ton: "menthe", texte, encart: encart || undefined });
  }

  // La fin : ce qui est couvert, ce qui manque.
  if (etat.etat && etat.etat !== "en_cours" && etat.fin) {
    const tf = depuis(etat.fin, t0);
    const manquants = etat.indicateurs_manquants || [];
    entrees.push({
      t: tf,
      source: "AGENT",
      ton: etat.complet ? "bleu" : "ambre",
      texte: etat.complet
        ? `Lecture complète : ${Object.keys(etat.indicateurs || {}).length} indicateurs, ${(etat.sources_utilisees || []).length} sources.`
        : `Lecture partielle : ${manquants.length} indicateur(s) manquant(s) — ${manquants.join(", ")}.${etat.nouvelle_tentative_le ? " Reprise automatique programmée." : ""}`,
    });
    for (const n of etat.notifications || []) entrees.push({ t: tf + 0.3, source: etiquette(n.source), ton: "rouge", texte: `${n.service} : ${n.message}` });
  }

  return entrees.sort((a, b) => a.t - b.t).map((e, i) => ({ ...e, rang: i }));
}

/**
 * Les repères de la barre : une question par repère, placée par son RANG.
 *
 * Les placer sur une horloge ne marchait pas : au lancement, la durée observée
 * vaut zéro et tous les repères s'empilaient à gauche. Le rang, lui, est connu
 * dès le départ — le serveur annonce ses questions avant de partir.
 */
export function reperesDe(etat) {
  const etapes = etat?.etapes || [];
  if (!etapes.length) return [];
  const tentatives = etat.tentatives || [];
  const enCoursRang = etat.etape ?? 0;
  return etapes.map((e, rang) => {
    const essais = tentatives.filter((t) => t.rang === rang);
    const reussie = essais.some((t) => t.ok);
    const echouee = essais.length > 0 && !reussie && rang < enCoursRang;
    return {
      cle: `q${rang}`,
      libelle: e.court?.split(" — ")[0] || `Question ${rang + 1}`,
      // 0 pour la première, 1 pour la dernière : la barre se remplit d'un
      // bout à l'autre, quelle que soit la durée réelle.
      position: etapes.length > 1 ? rang / (etapes.length - 1) : 0,
      franchi: rang < enCoursRang || reussie,
      encours: rang === enCoursRang && etat.etat === "en_cours",
      echoue: echouee,
      explication: reussie
        ? `${e.court} — répondu en ${Math.round((essais.find((t) => t.ok)?.ms || 0) / 1000)} s.`
        : echouee
          ? `${e.court} — ${essais.at(-1)?.erreur || "aucune source n’a répondu"}.`
          : e.legende || e.ligne || e.court,
    };
  });
}

/** L'avancement de la lecture, de 0 à 1 : par question franchie. */
export const avancementDe = (etat) => {
  const total = etat?.total || etat?.etapes?.length || 0;
  if (!total) return 0;
  if (etat.etat && etat.etat !== "en_cours") return 1;
  return Math.min(1, (etat.etape ?? 0) / total);
};

// ── L'analyse, une fois la lecture posée sur le lot ─────────────────────────

const moyenne = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/**
 * Ce que l'écran montre à l'arrivée quand une lecture existe : les verdicts,
 * les sources, la trace, l'emplacement. Rend null s'il n'y a rien.
 */
export function analyseDe(lot, passage) {
  if (!lot || !passage) return null;
  const ind = passage.indicateurs || {};
  const loyerM2 = ind.loyer_commercial_m2_an || null;
  const surface = nb(lot.lot?.surface_m2);
  const loyerEnPlace = nb(lot.lot?.loyer_annuel_ht_hc);
  const prixFai = nb(lot.lot?.prix_fai);
  const rendementAnnonce = nb(lot.lot?.rendement_annonce);
  const implantation = lot.implantation || null;
  const equimmox = lot.analyse_loyer || null;
  const dataB = lot.valeur_locative || null;
  const transactions = lot.transactions_fonds || null;
  const figaro = lot.prix_residentiel || null;
  const dvf = lot.ventes_dvf || null;
  const vitalite = lot.vitalite_rue || null;

  // La référence : la médiane de la source de tête (Equimmox) ; à défaut le
  // milieu de la fourchette Data-B. Jamais une moyenne de deux échelles.
  const reference = loyerM2?.median ?? (loyerM2?.bas != null && loyerM2?.haut != null ? Math.round((loyerM2.bas + loyerM2.haut) / 2) : null);

  // La surface sur laquelle un loyer de commerce se calcule : la pondérée,
  // quand la fiche décompose assez clairement pour la connaître. Un sous-sol
  // compté comme de la boutique fait dire « surévalué » à un loyer de marché.
  // Sans décomposition, on reste sur la surface du lot — et on le dit.
  const decoupe = decomposer(lot.lot?.surface_m2?.citation, surface);
  const surfaceRetenue = decoupe?.ponderee ?? surface;
  const baseSurface = decoupe ? "pondérée" : "déclarée";

  const loyerMarche = reference != null && surfaceRetenue ? Math.round(reference * surfaceRetenue) : null;
  const ecartLoyer = loyerMarche != null && loyerEnPlace != null ? loyerEnPlace - loyerMarche : null;
  // Le rapport qui décide d'un dossier de murs : ce que le locataire paie
  // rapporté à ce que le local vaut. Au-dessus, le loyer ne se reloue pas au
  // départ du locataire et le rendement affiché est un mirage ; en dessous,
  // c'est de la valeur latente, récupérable au renouvellement.
  const reversion = ecartLoyer != null && loyerMarche ? ecartLoyer / loyerMarche : null;
  // La capitalisation : au taux affiché par le vendeur, seul taux que le
  // dossier possède. Le rendement des transactions n'est pas publié par Data-B.
  const valeur = loyerMarche != null && rendementAnnonce ? Math.round(loyerMarche / (rendementAnnonce / 100) / 1000) * 1000 : null;
  const ecartPrix = valeur != null && prixFai != null ? prixFai - valeur : null;

  // Le second point de vue sur le prix. La valorisation ci-dessus capitalise
  // au taux ANNONCÉ PAR LE VENDEUR : c'est lui qui fournit l'étalon avec
  // lequel on juge son propre prix. La médiane des ventes réelles alentour ne
  // lui doit rien. Elle porte sur la surface bâtie, pas sur la pondérée : DVF
  // mesure des mètres carrés construits, pas des mètres carrés de commerce.
  const surfaceBatie = decoupe?.brute ?? surface;
  const parComparaison = dvf?.prix_m2?.median != null && surfaceBatie
    ? {
        prix_m2: dvf.prix_m2.median,
        bas: dvf.prix_m2.bas, haut: dvf.prix_m2.haut,
        n: dvf.n, rayon: dvf.rayon, periode: dvf.periode,
        valeur: Math.round((dvf.prix_m2.median * surfaceBatie) / 1000) * 1000,
        surface: surfaceBatie,
        demande_m2: prixFai != null && surfaceBatie ? Math.round(prixFai / surfaceBatie) : null,
        lien: dvf.lien || null,
        le: dvf.le || null,
      }
    : null;
  const ecartComparaison = parComparaison && prixFai != null ? prixFai - parComparaison.valeur : null;

  const cartes = [
    loyerM2
      ? {
          cle: "loyer-marche",
          libelle: "LOYER DE MARCHÉ",
          valeur: loyerM2.bas != null && loyerM2.haut != null ? `${fmt(loyerM2.bas)} – ${fmt(loyerM2.haut)} €/m²` : `${fmt(reference)} €/m²`,
          detail: `${reference != null ? `référence ${fmt(reference)} €/m²/an · ` : ""}${loyerM2.source || loyerM2.service}${loyerM2.precision ? ` · ${loyerM2.precision}` : ""}`,
          ton: "menthe",
        }
      : { cle: "loyer-marche", libelle: "LOYER DE MARCHÉ", valeur: "—", detail: "aucune source n'a donné de loyer commercial", ton: "gris" },
    {
      cle: "loyer-moyen",
      libelle: "LOYER MOYEN AU M²",
      valeur: equimmox?.moyenne != null ? `${fmt(equimmox.moyenne)} €/m²/an` : dataB ? `${fmt((dataB.rue || dataB.quartier || dataB.ville)?.basse)} – ${fmt((dataB.rue || dataB.quartier || dataB.ville)?.haute)} €/m²/an` : "—",
      detail: equimmox?.moyenne != null ? `moyenne des baux Equimmox${equimmox.rayon ? ` · rayon ${equimmox.rayon}` : ""}${equimmox.surface_min ? ` · ${equimmox.surface_min}–${equimmox.surface_max} m²` : ""}` : dataB ? "estimation Data-B, faute de baux Equimmox" : "aucun bail comparable lu",
      ton: equimmox?.moyenne != null || dataB ? "menthe" : "gris",
    },
    loyerEnPlace != null && loyerMarche != null
      ? {
          cle: "loyer-place",
          libelle: "LOYER EN PLACE",
          valeur: `${fmt(Math.round(loyerEnPlace / surfaceRetenue))} €/m²/an`,
          detail: `${fmt(loyerEnPlace)} € sur ${fmt(surfaceRetenue, 1)} m² (surface ${baseSurface})${decoupe ? ` · ${expliquer(decoupe)}` : ""} · marché ${fmt(reference)} €/m²/an`,
          ton: "menthe",
        }
      : { cle: "loyer-place", libelle: "LOYER EN PLACE", valeur: loyerEnPlace != null ? `${fmt(loyerEnPlace)} €/an` : "—", detail: loyerEnPlace == null ? "loyer en place non renseigné sur le lot" : !surfaceRetenue ? "surface non renseignée sur le lot" : "pas de loyer de marché pour comparer", ton: "gris" },
    // Le verdict qui manquait : l'écart au marché, et ce qu'il coûte ou
    // rapporte en euros par an. C'est lui qui alimente le risque de vacance et
    // qui chiffre une négociation.
    reversion != null
      ? {
          cle: "reversion",
          libelle: "RÉVERSION",
          valeur: `${reversion > 0 ? "Au-dessus du marché" : "Sous le marché"} · ${pct(reversion * 100, 0)}`,
          detail:
            reversion > 0
              ? `${fmt(Math.abs(ecartLoyer))} €/an à perdre si le local se reloue au marché · le rendement affiché suppose que le locataire reste`
              : `${fmt(Math.abs(ecartLoyer))} €/an de potentiel au renouvellement · valeur latente, si le bail permet de la reprendre`,
          ton: Math.abs(reversion) <= 0.1 ? "menthe" : reversion > 0 ? "ambre" : "menthe",
        }
      : { cle: "reversion", libelle: "RÉVERSION", valeur: "—", detail: "il faut un loyer en place, une surface et un loyer de marché", ton: "gris" },
    prixFai != null && valeur != null
      ? {
          cle: "prix-fai",
          libelle: "PRIX FAI",
          valeur: `${ecartPrix > 0 ? "Surévalué" : "Sous-évalué"} · ${ecartPrix > 0 ? "−" : "+"}${fmt(Math.abs(ecartPrix))} €`,
          detail: `${fmt(prixFai)} € vs ${fmt(valeur)} € valorisés à ${fmt(rendementAnnonce, 2)} % (taux affiché par le vendeur) · loyer de marché ${fmt(loyerMarche)} € sur ${fmt(surfaceRetenue, 1)} m² (surface ${baseSurface})`,
          ton: Math.abs(ecartPrix / valeur) > 0.05 ? "ambre" : "menthe",
        }
      : { cle: "prix-fai", libelle: "PRIX FAI", valeur: prixFai != null ? `${fmt(prixFai)} €` : "—", detail: prixFai == null ? "prix non renseigné sur le lot" : !rendementAnnonce ? "aucun taux de capitalisation : le rendement affiché manque sur le lot" : "pas de loyer de marché pour valoriser", ton: "gris" },
  ];

  // La maille la plus fine que Data-B ait donnée, et son nom. C'est celle qui
  // s'affiche ; ce n'est pas forcément celle que le recoupement compare.
  const niveauDataB = dataB ? dataB.rue || dataB.quartier || dataB.ville : null;
  const echelleDataB = dataB?.rue ? "rue" : dataB?.quartier ? "quartier" : dataB?.ville ? "ville" : null;

  // Les sources, avec leur issue et leur heure.
  const heure = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " à") : "");
  const derniereOk = (src) => [...(passage.tentatives || [])].reverse().find((t) => t.source === src && t.ok);
  const derniereKo = (src) => [...(passage.tentatives || [])].reverse().find((t) => t.source === src && !t.ok);
  const ligneSource = (src, nom, etatOk) => {
    const ok = derniereOk(src);
    const ko = derniereKo(src);
    if (ok) return { nom, ton: "menthe", etat: etatOk, quand: `relevé le ${heure(ok.debut)}` };
    if (ko) return { nom, ton: ko.classe === "definitive" ? "rouge" : "ambre", etat: `Non consultée : ${ko.erreur || "échec"}`, quand: heure(ko.debut) };
    return null;
  };
  const sources = [
    ligneSource("equimmox", "Equimmox", equimmox ? `baux · bas ${fmt(equimmox.bas)} · moyenne ${fmt(equimmox.moyenne)} · haut ${fmt(equimmox.haut)} €/m²/an` : "a répondu"),
    // L'échelle avec le chiffre : « estimation 640–960 » ne veut rien dire si
    // l'on ne sait pas que c'est la rue, quand la comparaison porte sur le quartier.
    ligneSource("data-b-valeur-locative", "Data-B · Valeurs locatives", dataB ? `estimation ${fmt(niveauDataB?.basse)} – ${fmt(niveauDataB?.haute)} €/m²/an à l'échelle ${echelleDataB === "ville" ? "de la ville" : `${echelleDataB === "rue" ? "de la" : "du"} ${echelleDataB}`}${niveauDataB?.nom ? ` (${niveauDataB.nom})` : ""}` : "a répondu"),
    ligneSource("bodacc-cessions", "BODACC · Cessions de fonds", transactions ? `${fmt(transactions.total ?? transactions.transactions?.length)} cessions · rayon ${transactions.rayon}${transactions.marche?.prix_median ? ` · médiane ${fmt(transactions.marche.prix_median)} €` : ""}` : "a répondu"),
    ligneSource("figaro", "Le Figaro Immobilier", figaro ? `${fmt((figaro.quartier || figaro.commune)?.prix?.median)} €/m² médian${(figaro.quartier || figaro.commune)?.prix?.sur_1_an != null ? ` · ${pct((figaro.quartier || figaro.commune).prix.sur_1_an)} / 1 an` : ""}` : "a répondu"),
    ligneSource("dvf", "DVF · Valeurs foncières", dvf ? (dvf.prix_m2 ? `${fmt(dvf.prix_m2.median)} €/m² médian · ${fmt(dvf.n)} vente(s) dans ${fmt(dvf.rayon)} m` : `${fmt(dvf.n)} vente(s) : trop peu pour une médiane`) : "a répondu"),
    ligneSource("bodacc", "BODACC · Annonces commerciales", vitalite ? `${fmt(vitalite.sur_la_rue?.creations)} création(s) · ${fmt(vitalite.sur_la_rue?.fermetures)} fermeture(s) sur ${vitalite.mois} mois` : "a répondu"),
    ligneSource("data-b-implantation", "Data-B · Étude d'implantation", implantation ? `flux piéton ${implantation.flux_pieton?.note ? `${implantation.flux_pieton.note.note}/${implantation.flux_pieton.note.sur}` : "—"} · flux voiture ${implantation.flux_voiture?.note ? `${implantation.flux_voiture.note.note}/${implantation.flux_voiture.note.sur}` : "—"}${implantation.troncon?.libelle ? ` · ${implantation.troncon.libelle}` : ""}` : "a répondu"),
  ].filter(Boolean);

  // La trace : chaque tentative, dans l'ordre, dite en français. La clé du
  // connecteur ne parle qu'au code ; la page lue parle à qui vérifie.
  const LUES = {
    dvf: "Valeurs foncières · ventes de locaux commerciaux, 5 millésimes",
    bodacc: "Annonces commerciales · créations, cessions, procédures, radiations",
    equimmox: "Analyse de loyer · baux comparables à 500 m",
    "data-b-valeur-locative": "Valeurs locatives · rue, quartier, ville",
    "bodacc-cessions": "Cessions de fonds · rayon 250 m, adresses géocodées par la Base Adresse",
    figaro: "Prix de l'immobilier · quartier et commune",
    "data-b-implantation": "Expertise / ELM · étude d'implantation (1 crédit)",
  };
  const consultations = (passage.tentatives || []).map((t) => ({
    quand: new Date(t.debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    src: t.service || t.source,
    quoi: `${LUES[t.source] || t.source}${t.essai > 1 ? ` · essai ${t.essai}` : ""}`,
    issue: t.ok ? `répondu en ${Math.round((t.ms || 0) / 1000)} s` : `${t.classe || "échec"} · ${(t.erreur || "").slice(0, 80)}`,
    ton: t.ok ? "menthe" : t.classe === "definitive" ? "rouge" : "ambre",
  }));

  const q = figaro?.quartier || figaro?.commune || null;
  const residentiel = q
    ? { source: "Le Figaro Immobilier", quartier: q.nom || figaro.commune?.nom || "", prix: q.prix || {}, loyer: q.loyer || {}, lien: q.lien || figaro.lien || null, quand: heure(figaro.le) }
    : null;

  // Ce que chaque plateforme a rendu, rangé chez elle. Le bilan croise ;
  // les onglets montrent la matière brute, sans mélange.
  const parSource = {
    "data-b": {
      nom: "Data-B",
      valeur_locative: dataB
        ? {
            secteurs: ["rue", "quartier", "ville"].map((e) => (dataB[e] ? { echelle: e, ...dataB[e] } : null)).filter(Boolean),
            lien: dataB.lien || null,
            le: dataB.le || null,
          }
        : null,
      transactions,
      implantation,
    },
    equimmox: { nom: "Equimmox", analyse: equimmox },
    figaro: { nom: "Le Figaro Immobilier", residentiel: figaro },
    dvf: { nom: "DVF", ventes: dvf },
    bodacc: { nom: "BODACC", vitalite },
  };

  // Le recoupement : deux mesures du même loyer, côte à côte. Le serveur le
  // calcule aussi (marche/chaine.js) ; on le relit ici pour l'écran, et on
  // retombe sur les résultats bruts quand le passage est ancien.
  const recoupement = (() => {
    const duServeur = passage.recoupements?.loyer_commercial_m2_an;
    // `portee_reference` signe un recoupement calculé à maille comparable. Les
    // lectures antérieures opposaient la rue de Data-B au rayon d'Equimmox et
    // annonçaient des écarts qui n'existaient pas : on les recalcule ici
    // plutôt que de les réafficher.
    if (duServeur?.portee_reference !== undefined && duServeur?.lectures?.length >= 2) return duServeur;

    const centreEq = equimmox?.moyenne ?? (equimmox?.bas != null && equimmox?.haut != null ? (equimmox.bas + equimmox.haut) / 2 : null);
    if (centreEq == null || !dataB) return null;
    const portee = rayonEnMetres(equimmox?.rayon);

    // Les trois mailles de Data-B, et celle qui décrit un territoire du même
    // ordre que le rayon d'Equimmox. Les autres sont écartées, pas jetées.
    const mailles = ["rue", "quartier", "ville"]
      .map((echelle) => {
        const v = dataB[echelle];
        if (!v || (v.basse == null && v.haute == null)) return null;
        return {
          service: "Data-B", echelle, precision: v.nom || null,
          bas: v.basse, median: null, haut: v.haute,
          centre: v.basse != null && v.haute != null ? (v.basse + v.haute) / 2 : (v.basse ?? v.haute),
          portee_m: porteeDe(echelle),
        };
      })
      .filter(Boolean);
    if (!mailles.length) return null;

    const retenue = laPlusComparable(mailles, portee);
    const ecartees = mailles
      .filter((m) => m !== retenue)
      .map((m) => ({ ...m, raison: "autre maille de la même source" }));
    const lectureEq = { service: "Equimmox", echelle: "rayon", precision: equimmox.rayon ? `rayon ${equimmox.rayon}` : null, bas: equimmox.bas, median: equimmox.moyenne, haut: equimmox.haut, centre: centreEq, portee_m: portee };

    if (!comparables(retenue.portee_m, portee)) {
      return { cle: "loyer_commercial_m2_an", lectures: [lectureEq], ecartees: [...ecartees, { ...retenue, raison: "maille hors de portée comparable" }], incoherences: [], portee_reference: portee, alerte: false };
    }
    const bas = Math.min(centreEq, retenue.centre);
    const haut = Math.max(centreEq, retenue.centre);
    const relatif = bas > 0 ? (haut - bas) / bas : null;
    return {
      cle: "loyer_commercial_m2_an",
      bas, haut, ecart: haut - bas, ecart_relatif: relatif,
      alerte: relatif != null && relatif > 0.15,
      portee_reference: portee,
      lectures: [lectureEq, retenue],
      ecartees,
      incoherences: [],
    };
  })();

  const le = passage.fin || passage.le;
  const date = le ? new Date(le) : null;
  return {
    // L'adresse du lot : l'emplacement d'ALX la reprend pour situer la rue dans sa ville.
    adresse: adresseDe(lot) || passage.adresse || null,
    le: date ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "",
    court: date ? date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "",
    anciennete: date ? anciennete(date) : "",
    resume: `${(passage.sources_utilisees || []).length} source(s) ont répondu${(passage.sources_en_echec || []).length ? `, ${passage.sources_en_echec.length} en échec` : ""} · ${Object.keys(ind).length} indicateur(s)${passage.complet ? "" : " · lecture partielle"}`,
    cartes,
    sources,
    consultations,
    emplacement: implantation ? { ...implantation, quand: implantation.le ? `relevé le ${heure(implantation.le)}` : "" } : null,
    parSource,
    dvf,
    vitalite,
    parComparaison,
    ecartComparaison,
    recoupement,
    residentiel,
    // Pour le graphique des loyers : le loyer en place au m², et les
    // fourchettes des sources sur la même règle (la maille Data-B retenue par
    // le recoupement, sinon la plus fine).
    en_place_m2: loyerEnPlace != null && surfaceRetenue ? Math.round(loyerEnPlace / surfaceRetenue) : null,
    loyers_lectures: (() => {
      const l = [];
      if (equimmox?.bas != null && equimmox?.haut != null) l.push({ service: "Equimmox", sous: `baux${equimmox.rayon ? ` · rayon ${equimmox.rayon}` : ""}`, bas: equimmox.bas, haut: equimmox.haut, median: equimmox.moyenne ?? null, principale: true });
      const db = recoupement?.lectures?.find((x) => x.service === "Data-B") || (niveauDataB ? { bas: niveauDataB.basse, haut: niveauDataB.haute, echelle: echelleDataB, precision: niveauDataB.nom || null } : null);
      if (db && db.bas != null && db.haut != null) l.push({ service: "Data-B", sous: `${db.echelle}${db.precision ? ` ${db.precision}` : ""}`, bas: db.bas, haut: db.haut, median: null, principale: !l.length });
      return l;
    })(),
    details: detailsDe({ loyerM2, reference, surface, surfaceRetenue, baseSurface, decoupe, reversion, parComparaison, ecartComparaison, loyerEnPlace, loyerMarche, ecartLoyer, prixFai, rendementAnnonce, valeur, ecartPrix, equimmox, dataB, transactions, figaro, passage }),
    journal: null,
    passage,
  };
}

function anciennete(date) {
  const jours = Math.round((Date.now() - date.getTime()) / 86400000);
  if (jours <= 0) return "Aujourd’hui";
  if (jours === 1) return "Hier";
  return `Il y a ${jours} jours`;
}

/** Le détail des verdicts, calculé — chaque ligne dit son opération. */
function detailsDe({ loyerM2, reference, surface, surfaceRetenue, baseSurface, decoupe, reversion, parComparaison, ecartComparaison, loyerEnPlace, loyerMarche, ecartLoyer, prixFai, rendementAnnonce, valeur, ecartPrix, equimmox, dataB, transactions, figaro, passage }) {
  const pertinentes = transactions?.pertinentes || transactions?.transactions?.slice(0, 10) || [];
  const comparables = pertinentes.map((t) => ({
    adresse: t.adresse || t.enseigne || "—",
    surface: t.distance_m != null ? `${fmt(t.distance_m)} m` : "",
    prix: t.prix ? `${fmt(t.prix)} €` : "prix non publié",
    src: `Data-B · cession ${t.date ? new Date(t.date).toLocaleDateString("fr-FR") : ""}${t.activite ? ` · ${t.activite}` : ""}`,
    sort: "retenu",
  }));
  const sources = (passage.tentatives || []).filter((t) => t.ok).map((t) => ({
    nom: `${t.service} · ${t.source}`,
    quand: new Date(t.debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    url: { equimmox: null, "data-b-valeur-locative": dataB?.lien, "bodacc-cessions": transactions?.lien, figaro: (figaro?.quartier || figaro?.commune)?.lien || figaro?.lien, "data-b-implantation": passage.indicateurs?.flux_pieton_note?.lien }[t.source] || null,
    capture: null,
  }));
  const reserves = [];
  if (!passage.complet) reserves.push(`Lecture partielle : ${(passage.indicateurs_manquants || []).join(", ")} manquent.`);
  if (loyerM2 && !loyerM2.median) reserves.push("La source de tête n'a pas donné de médiane : la référence est le milieu de la fourchette Data-B, une estimation.");
  if (loyerM2?.du_cache) reserves.push("Le loyer commercial vient du cache (moins de 30 jours) : relancez avec « forcer » pour une lecture fraîche.");

  const d = {};
  d["loyer-marche"] = loyerM2 && {
    libelle: "LOYER DE MARCHÉ", valeur: `${fmt(reference)} €/m²/an`, ton: "menthe",
    resume: `Le loyer commercial au m² tel que ${loyerM2.source || loyerM2.service} l'a donné, à l'échelle ${loyerM2.echelle || "du rayon"}${loyerM2.precision ? ` (${loyerM2.precision})` : ""}.`,
    calcul: [
      { libelle: "Source de tête", valeur: loyerM2.service || "—", note: loyerM2.source },
      { libelle: "Fourchette", valeur: loyerM2.bas != null ? `${fmt(loyerM2.bas)} – ${fmt(loyerM2.haut)} €/m²/an` : "—", note: loyerM2.precision },
      { libelle: "Référence retenue", valeur: `${fmt(reference)} €/m²/an`, note: loyerM2.median != null ? "la moyenne publiée par la source" : "milieu de la fourchette, faute de médiane" },
      dataB ? { libelle: "Contrôle Data-B", valeur: `${fmt((dataB.rue || dataB.quartier || dataB.ville)?.basse)} – ${fmt((dataB.rue || dataB.quartier || dataB.ville)?.haute)} €/m²/an`, note: `estimation à l'échelle ${dataB.rue ? "de la rue" : dataB.quartier ? "du quartier" : "de la ville"}` } : null,
      { libelle: "Relevé le", valeur: loyerM2.collecte_le ? new Date(loyerM2.collecte_le).toLocaleString("fr-FR") : "—", note: loyerM2.du_cache ? "depuis le cache" : "lecture fraîche" },
    ].filter(Boolean),
    comparables, sources, reserves,
  };
  d["loyer-moyen"] = equimmox?.moyenne != null && {
    libelle: "LOYER MOYEN AU M²", valeur: `${fmt(equimmox.moyenne)} €/m²/an`, ton: "menthe",
    resume: "La moyenne des baux réellement signés autour de l'adresse, telle qu'Equimmox la publie.",
    calcul: [
      { libelle: "Bas", valeur: `${fmt(equimmox.bas)} €/m²/an` },
      { libelle: "Moyenne", valeur: `${fmt(equimmox.moyenne)} €/m²/an` },
      { libelle: "Haut", valeur: `${fmt(equimmox.haut)} €/m²/an` },
      { libelle: "Périmètre", valeur: equimmox.rayon || "—", note: equimmox.surface_min ? `surfaces ${equimmox.surface_min}–${equimmox.surface_max} m²` : null },
      equimmox.delai_jours != null ? { libelle: "Délai de commercialisation", valeur: `${fmt(equimmox.delai_jours)} jours` } : null,
    ].filter(Boolean),
    comparables, sources, reserves: ["Equimmox publie la fourchette et la moyenne, pas la liste des baux : les comparables ci-contre sont les cessions de fonds Data-B, une autre mesure."],
  };
  d["loyer-place"] = loyerEnPlace != null && loyerMarche != null && {
    libelle: "LOYER EN PLACE", valeur: `${fmt(loyerEnPlace)} €/an`, ton: "ambre",
    resume: `Le loyer du bail ${ecartLoyer > 0 ? "dépasse" : "est sous"} le marché de ${fmt(Math.abs(ecartLoyer))} € par an.`,
    calcul: [
      { libelle: "Loyer en place", valeur: `${fmt(loyerEnPlace)} €/an`, note: "loyer annuel HT HC lu sur la fiche" },
      { libelle: "Surface déclarée", valeur: `${fmt(surface)} m²`, note: "telle que l'extraction l'a lue sur la fiche" },
      ...(decoupe
        ? decoupe.parties.map((p) => ({ libelle: `— ${p.libelle}`, valeur: `${fmt(p.m2, 1)} m² × ${fmt(p.coefficient, 2)}`, note: `soit ${fmt(p.m2 * p.coefficient, 1)} m² pondérés · « ${p.extrait} »` }))
        : []),
      { libelle: `Surface retenue (${baseSurface})`, valeur: `${fmt(surfaceRetenue, 1)} m²`, note: decoupe ? "en commerce, un loyer se calcule sur la surface pondérée : la boutique compte pour 1, la réserve pour une fraction" : "la fiche ne décompose pas assez clairement pour pondérer" },
      { libelle: "Demandé au m²", valeur: `${fmt(loyerEnPlace / surfaceRetenue, 2)} €/m²/an`, note: `${fmt(loyerEnPlace)} / ${fmt(surfaceRetenue, 1)}` },
      { libelle: "Loyer de marché", valeur: `${fmt(loyerMarche)} €/an`, note: `${fmt(surfaceRetenue, 1)} × ${fmt(reference)}` },
      { libelle: "Écart", valeur: `${ecartLoyer > 0 ? "+" : ""}${fmt(ecartLoyer)} €/an`, note: `soit ${pct((ecartLoyer / loyerMarche) * 100)}` },
    ],
    comparables, sources, reserves: [...reserves, ecartLoyer > 0 ? "Un loyer au-dessus du marché ne se maintient pas au renouvellement." : "Un loyer sous le marché est une marge de revalorisation, à l'échéance du bail."],
  };
  d["reversion"] = reversion != null && {
    libelle: "RÉVERSION", valeur: pct(reversion * 100, 0), ton: reversion > 0.1 ? "ambre" : "menthe",
    resume:
      reversion > 0
        ? `Le bail paie ${fmt(Math.abs(reversion) * 100, 0)} % de plus que le marché. Si le locataire part, le local ne se reloue qu'en perdant ${fmt(Math.abs(ecartLoyer))} € par an — et le rendement affiché avec.`
        : `Le bail paie ${fmt(Math.abs(reversion) * 100, 0)} % de moins que le marché. C'est ${fmt(Math.abs(ecartLoyer))} € par an de valeur latente, récupérable au renouvellement si le bail le permet.`,
    calcul: [
      { libelle: "Loyer en place", valeur: `${fmt(loyerEnPlace)} €/an` },
      { libelle: "Loyer de marché", valeur: `${fmt(loyerMarche)} €/an`, note: `${fmt(surfaceRetenue, 1)} m² (surface ${baseSurface}) × ${fmt(reference)} €/m²/an` },
      { libelle: "Écart", valeur: `${ecartLoyer > 0 ? "+" : ""}${fmt(ecartLoyer)} €/an`, note: `soit ${pct(reversion * 100)} du loyer de marché` },
      prixFai != null && rendementAnnonce
        ? { libelle: "Effet sur la valeur", valeur: `${ecartLoyer > 0 ? "−" : "+"}${fmt(Math.abs(Math.round(ecartLoyer / (rendementAnnonce / 100))))} €`, note: `l'écart capitalisé à ${fmt(rendementAnnonce, 2)} %` }
        : null,
      { libelle: "Ce que cela veut dire", valeur: reversion > 0 ? "Risque à la vacance" : "Potentiel au renouvellement", note: reversion > 0 ? "le rendement affiché suppose que le locataire reste et continue de surpayer" : "l'écart se reprend à l'échéance, sous réserve des clauses du bail" },
    ].filter(Boolean),
    comparables, sources,
    reserves: [
      ...reserves,
      "La réversion se joue à l'échéance du bail : sa date et ses clauses (déplafonnement, renouvellement) décident de ce qui est réellement récupérable.",
      ...(decoupe ? [] : ["La surface n'a pas pu être pondérée : si le local comporte réserve ou sous-sol, l'écart au marché est surestimé."]),
    ],
  };
  d["prix-fai"] = prixFai != null && valeur != null && {
    libelle: "PRIX FAI", valeur: `${fmt(prixFai)} €`, ton: "ambre",
    resume: `Capitalisé au taux affiché par le vendeur, le loyer de marché vaut ${fmt(valeur)} € : le prix demandé est ${ecartPrix > 0 ? "au-dessus" : "en dessous"} de ${fmt(Math.abs(ecartPrix))} €.`,
    calcul: [
      { libelle: "Loyer de marché", valeur: `${fmt(loyerMarche)} €/an` },
      { libelle: "Taux de capitalisation", valeur: `${fmt(rendementAnnonce, 2)} %`, note: "le rendement affiché par le vendeur — le seul taux que le dossier possède" },
      { libelle: "Valeur", valeur: `${fmt(valeur)} €`, note: `${fmt(loyerMarche)} / ${fmt(rendementAnnonce / 100, 4)}` },
      { libelle: "Prix demandé", valeur: `${fmt(prixFai)} €` },
      { libelle: "Écart", valeur: `${ecartPrix > 0 ? "+" : ""}${fmt(ecartPrix)} €`, note: `soit ${pct((ecartPrix / valeur) * 100)}` },
      { libelle: "Rendement au prix demandé", valeur: `${fmt((loyerMarche / prixFai) * 100, 2)} %`, note: "sur le loyer de marché" },
      loyerEnPlace != null ? { libelle: "Rendement affiché", valeur: `${fmt((loyerEnPlace / prixFai) * 100, 2)} %`, note: "sur le loyer en place" } : null,
      // Le contre-pouvoir : ce que des locaux comparables se sont vendu.
      parComparaison ? { libelle: "— Second point de vue —", valeur: "ventes réelles (DVF)", note: "aucun chiffre du vendeur n'entre dans ce calcul" } : null,
      parComparaison ? { libelle: "Prix au m² des ventes alentour", valeur: `${fmt(parComparaison.prix_m2)} €/m²`, note: `médiane de ${parComparaison.n} vente(s) dans ${parComparaison.rayon} m${parComparaison.periode ? `, ${String(parComparaison.periode.du).slice(0, 4)}–${String(parComparaison.periode.au).slice(0, 4)}` : ""} · fourchette ${fmt(parComparaison.bas)} – ${fmt(parComparaison.haut)}` } : null,
      parComparaison ? { libelle: "Valeur par comparaison", valeur: `${fmt(parComparaison.valeur)} €`, note: `${fmt(parComparaison.surface, 1)} m² bâtis × ${fmt(parComparaison.prix_m2)} €/m²` } : null,
      parComparaison && ecartComparaison != null ? { libelle: "Écart au prix demandé", valeur: `${ecartComparaison > 0 ? "+" : ""}${fmt(ecartComparaison)} €`, note: `le prix demandé est ${fmt(Math.abs(ecartComparaison))} € ${ecartComparaison > 0 ? "au-dessus" : "en dessous"} de la valeur par comparaison, soit ${pct((ecartComparaison / parComparaison.valeur) * 100)}${parComparaison.demande_m2 ? ` · il revient à ${fmt(parComparaison.demande_m2)} €/m² bâtis` : ""}` } : null,
    ].filter(Boolean),
    comparables, sources,
    reserves: [
      ...reserves,
      "Le taux de capitalisation vient de l'annonce, pas d'une source de marché : Data-B ne publie pas de rendement sur les transactions.",
      ...(parComparaison
        ? ["DVF mesure des mètres carrés bâtis, sans pondération commerciale : les deux valorisations ne reposent donc pas sur la même surface."]
        : ["Aucune valorisation par comparaison : DVF n'a pas rendu assez de ventes de locaux commerciaux autour de l'adresse."]),
    ],
  };
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v));
}
