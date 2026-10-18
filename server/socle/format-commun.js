// Le contrat commun des outils d'analyse (18 oct. 2026).
//
// Neuf outils rangent déjà leurs résultats dans leurs entités, chacun dans sa
// forme. Haka, le module d'analyse et les études client doivent les lire de la
// même façon : une valeur, sa fourchette quand c'est une estimation, une
// confiance calculée par le code, les sources avec leur millésime, et ce qui
// permet à un humain de vérifier.
//
// Tout est pur : un adaptateur reçoit le résultat tel que l'outil le rend (ou
// l'enregistrement qui le porte) et rend le format commun. Rien n'est inventé :
// un champ absent du résultat brut vaut null.

export const OUTILS = [
  'kzoning', 'kexpertise', 'kestimation', 'kprospective', 'kvacance',
  'kfoncier', 'valeur_locative', 'ktransactions', 'signaux_vacance',
];
export const CONFIANCES = ['haute', 'moyenne', 'faible'];
export const JOURS_PEREMPTION = 30;

const JOUR_MS = 86400000;
const estObjet = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const nombreOuNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const texteOuNull = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v));

/** L'âge en jours d'une date ISO, ou null si elle ne se lit pas. */
function ageJours(iso, maintenant = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, (maintenant - t) / JOUR_MS) : null;
}

// --- La confiance, calculée par le code ------------------------------------------

/**
 * La confiance d'un résultat d'après le nombre de données qui le portent et
 * leur fraîcheur. Sous `min_moyenne`, faible ; à partir de `min_haute`, haute ;
 * entre les deux, moyenne. Une donnée plus vieille que `age_max_jours` fait
 * perdre un cran.
 */
export function confianceDe({ n = 0, min_haute = 10, min_moyenne = 3, age_jours = null, age_max_jours = null } = {}) {
  const compte = Number(n);
  if (!Number.isFinite(compte) || compte <= 0 || compte < min_moyenne) return 'faible';
  let niveau = compte >= min_haute ? 'haute' : 'moyenne';
  if (age_jours != null && age_max_jours != null && Number(age_jours) > Number(age_max_jours)) {
    niveau = niveau === 'haute' ? 'moyenne' : 'faible';
  }
  return niveau;
}

// --- La forme commune ---------------------------------------------------------

function normaliserFourchette(f) {
  if (f === null || f === undefined) return null;
  if (!estObjet(f)) throw new Error('Format commun : la fourchette doit être un objet { bas, central, haut } ou null.');
  const out = { bas: nombreOuNull(f.bas), central: nombreOuNull(f.central), haut: nombreOuNull(f.haut) };
  return out.bas == null && out.central == null && out.haut == null ? null : out;
}

function normaliserSources(sources) {
  if (sources === null || sources === undefined) return [];
  if (!Array.isArray(sources)) throw new Error('Format commun : les sources doivent être une liste.');
  const vues = new Set();
  const out = [];
  for (const s of sources) {
    if (!estObjet(s) || !texteOuNull(s.cle)) continue;
    const src = { cle: String(s.cle), nom: texteOuNull(s.nom) || String(s.cle), millesime: texteOuNull(s.millesime), le: texteOuNull(s.le) };
    const k = `${src.cle}|${src.nom}`;
    if (vues.has(k)) continue;
    vues.add(k);
    out.push(src);
  }
  return out;
}

/**
 * Valide et normalise un résultat au format commun. Lève une erreur claire si
 * l'outil est inconnu, la confiance invalide, la date illisible.
 * @param {object} r
 * @param {{maintenant?: number}} [options] l'instant de référence de `perime`
 */
export function resultatCommun(r, { maintenant = Date.now() } = {}) {
  if (!estObjet(r)) throw new Error('Format commun : le résultat doit être un objet.');
  if (!OUTILS.includes(r.outil)) throw new Error(`Format commun : outil inconnu « ${r.outil} » (attendu : ${OUTILS.join(', ')}).`);

  const confiance = r.confiance === undefined || r.confiance === null ? 'faible' : r.confiance;
  if (!CONFIANCES.includes(confiance)) throw new Error(`Format commun : confiance invalide « ${r.confiance} » (attendu : haute, moyenne ou faible).`);

  const e = estObjet(r.entree) ? r.entree : {};
  const entree = {
    adresse: texteOuNull(e.adresse),
    id_local: texteOuNull(e.id_local),
    parametres: estObjet(e.parametres) ? e.parametres : {},
  };

  const detail = r.detail === undefined || r.detail === null ? {} : r.detail;
  if (typeof detail !== 'object') throw new Error('Format commun : le détail doit être une liste ou un objet.');

  const t = r.date === undefined || r.date === null ? maintenant : Date.parse(r.date);
  if (!Number.isFinite(t)) throw new Error(`Format commun : date illisible « ${r.date} ».`);
  const date = new Date(t).toISOString();

  return {
    outil: r.outil,
    entree,
    valeur: r.valeur === undefined ? null : r.valeur,
    fourchette: normaliserFourchette(r.fourchette),
    unite: texteOuNull(r.unite),
    confiance,
    sources: normaliserSources(r.sources),
    detail,
    date,
    perime: maintenant - t > JOURS_PEREMPTION * JOUR_MS,
  };
}

// --- Les sources : des libellés des outils aux clés communes -------------------

// Les clés reprennent celles de src/lib/sources.js quand elles existent
// (dvf, equimmox, data_b, bodacc, annuaire), sinon une clé descriptive.
const LIBELLES = [
  [/^dvf\b|demandes de valeurs fonci/i, 'dvf'],
  [/equimmox/i, 'equimmox'],
  [/data-?b/i, 'data_b'],
  [/bodacc/i, 'bodacc'],
  [/annuaire des entreprises/i, 'annuaire'],
  [/openstreetmap|^osm$/i, 'osm'],
  [/filosofi/i, 'insee_filosofi'],
  [/insee recensement/i, 'insee_recensement'],
  [/sirene/i, 'sirene'],
  [/base adresse nationale/i, 'ban'],
  [/parcellaire|cadastr/i, 'cadastre_ign'],
  [/majic|personnes morales/i, 'majic'],
  [/^ign$/i, 'ign'],
  [/google/i, 'google_places'],
];

/** Une source du format commun depuis le libellé qu'un outil porte. */
export function sourceDepuisLibelle(libelle, { millesime = null, le = null } = {}) {
  const nom = texteOuNull(libelle);
  if (!nom) return null;
  const trouve = LIBELLES.find(([re]) => re.test(nom));
  const cle = trouve ? trouve[1] : nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return { cle, nom, millesime: millesime == null ? null : String(millesime), le: le || null };
}

const sources = (...liste) => liste.filter(Boolean);
const dateDe = (...dates) => dates.find((d) => d && Number.isFinite(Date.parse(d))) || null;
const commun = (outil, entree, champs) => resultatCommun({ outil, entree: entree || {}, ...champs });

// --- Les adaptateurs, un par outil ---------------------------------------------

/**
 * K-Zoning. Une zone (ZoneKData) ne porte aucune donnée : ce qu'on y lit vient
 * des routes /api/kzoning/zones/:id/lecture ({ insee, equipements, *_garde_le })
 * et /api/kzoning/zones/:id/commerces ({ commerces, garde_le, metiers }). Le
 * brut est l'une, l'autre, ou les deux fusionnées.
 */
function kzoning(brut = {}, entree = {}) {
  const b = brut || {};
  const insee = b.insee || null;
  const equipements = b.equipements || null;
  const commerces = Array.isArray(b.commerces) ? b.commerces : null;
  const occupes = commerces ? commerces.filter((c) => !c.vacant).length : equipements?.commerces ?? null;
  const vacants = commerces ? commerces.filter((c) => c.vacant).length : equipements?.vacants ?? null;
  const date = dateDe(b.garde_le, b.insee_garde_le, b.equipements_garde_le, entree.date);
  const n = insee ? insee.carreaux : commerces ? commerces.length : 0;
  return commun('kzoning', entree, {
    valeur: insee || commerces || equipements
      ? { habitants: insee?.population?.habitants ?? null, commerces: occupes, vacants }
      : null,
    fourchette: null,
    unite: null,
    // Les carreaux INSEE lus (ou les commerces relevés) et la fraîcheur du relevé, gardé trente jours.
    confiance: confianceDe({ n, min_haute: insee ? 5 : 10, min_moyenne: 1, age_jours: ageJours(date), age_max_jours: 30 }),
    sources: sources(
      insee && sourceDepuisLibelle('INSEE Filosofi', { le: b.insee_garde_le || null }),
      (commerces || equipements) && sourceDepuisLibelle('OpenStreetMap', { le: b.garde_le || b.equipements_garde_le || null }),
    ),
    detail: {
      commerces: commerces || [],
      metiers: b.metiers || null,
      insee,
      equipements,
      erreurs: [b.insee_erreur, b.equipements_erreur].filter(Boolean),
    },
    date,
  });
}

/**
 * K-Expertise : l'enregistrement ExpertiseKData ou son `resultat`
 * ({ point, etude, generateurs, zones, sources }). L'étude vient de Data-B ou
 * de l'étude interne (sources ouvertes) ; sa note de flux piéton est un
 * classement sur cinq, pas un comptage.
 */
function kexpertise(brut = {}, entree = {}) {
  const r = brut?.resultat && !brut.etude ? brut.resultat : brut || {};
  const etude = r.etude || null;
  const zones = Array.isArray(r.zones) ? r.zones : [];
  const avecInsee = zones.filter((z) => z.insee);
  const primaire = zones.find((z) => z.cle === 'primaire') || zones[0] || null;
  const date = dateDe(brut?.fini_le, etude?.le, brut?.cree_le, entree.date);
  const libelles = [...(Array.isArray(etude?.sources) ? etude.sources : etude?.source ? [etude.source] : []), ...(r.sources || [])];
  const vus = new Set();
  const listeSources = libelles
    .filter((l) => l && !/sources ouvertes/i.test(l) && !vus.has(l) && vus.add(l))
    .map((l) => sourceDepuisLibelle(l, { le: (etude?.sources || []).includes(l) || l === etude?.source ? etude?.le || null : null }));
  const note = (f) => f?.note?.note ?? null;
  return commun('kexpertise', entree, {
    valeur: etude || zones.length || r.generateurs
      ? {
        flux_pieton: note(etude?.flux_pieton),
        flux_voiture: note(etude?.flux_voiture),
        habitants_zone_primaire: primaire?.insee?.population?.habitants ?? null,
        generateurs: Array.isArray(r.generateurs) ? r.generateurs.length : null,
        // L'emplacement classé (lot 8, boîte à outils allumée) : indice de flux sur 100 et classement du tronçon.
        ...(r.emplacement ? { classement: r.emplacement.classement?.classement ?? null, libelle_classement: r.emplacement.classement?.libelle ?? null, indice_flux: r.emplacement.flux?.indice ?? null, lineaire_commercial: !!r.emplacement.urbanisme?.lineaire_commercial } : {}),
      }
      : null,
    fourchette: null,
    unite: null,
    // Quatre lectures possibles : l'étude et les trois zones INSEE.
    confiance: confianceDe({ n: avecInsee.length + (etude ? 1 : 0), min_haute: 4, min_moyenne: 2 }),
    sources: listeSources,
    detail: { generateurs: r.generateurs || [], zones, etude, manques: etude?.manques || [], erreur_etude: r.etude_erreur || null, emplacement: r.emplacement || null },
    date,
  });
}

/**
 * Estimation de murs : l'enregistrement EstimationMurs ({ marche, resultat })
 * ou le `resultat` de calculerEstimation ({ valeurs, methodes, poids, ... }).
 */
function kestimation(brut = {}, entree = {}) {
  const r = brut?.resultat && !brut.valeurs ? brut.resultat : brut || {};
  const marche = brut?.marche || {};
  const v = r.valeurs || null;
  const methodes = r.methodes || {};
  const date = dateDe(r.calcule_le, brut?.fini_le, entree.date);
  const dvf = methodes.dvf || marche.dvf || null;
  const libelles = marche.sources || [];
  return commun('kestimation', entree, {
    valeur: v?.moyenne ?? null,
    fourchette: v ? { bas: v.basse, central: v.moyenne, haut: v.haute } : null,
    unite: v ? '€' : null,
    // Trois méthodes croisées au plus : plus elles sont nombreuses, plus la valeur tient.
    confiance: confianceDe({ n: Object.keys(methodes).length, min_haute: 3, min_moyenne: 2, age_jours: ageJours(date), age_max_jours: 30 }),
    sources: libelles.map((l) => sourceDepuisLibelle(l, { le: /equimmox/i.test(l) ? marche.vlm_equimmox?.le || null : null })),
    detail: {
      methodes,
      poids: r.poids || null,
      taux: r.taux || null,
      coefficients: r.coefficients || [],
      prix_m2: r.prix_m2 ?? null,
      ventes: dvf?.ventes || [],
    },
    date,
  });
}

/**
 * K-Prospective : l'enregistrement Prospection ({ commerces, retenus,
 * nb_commerces, nb_retenus, ... }), rempli étape par étape.
 */
function kprospective(brut = {}, entree = {}) {
  const b = brut || {};
  const commerces = Array.isArray(b.commerces) ? b.commerces : [];
  const retenus = new Set(b.retenus || []);
  const identifies = commerces.filter((c) => c.societe).length;
  const date = dateDe(b.fini_le, b.cree_le, entree.date);
  const termine = b.etat === 'terminee';
  return commun('kprospective', entree, {
    valeur: termine || commerces.length ? { retenus: b.nb_retenus ?? retenus.size, commerces: b.nb_commerces ?? commerces.length } : null,
    fourchette: null,
    unite: 'commerces',
    // Les critères ne se jugent que sur les sociétés identifiées derrière les devantures.
    confiance: confianceDe({ n: identifies, min_haute: 10, min_moyenne: 3 }),
    sources: sources(
      commerces.length && sourceDepuisLibelle('OpenStreetMap'),
      identifies && sourceDepuisLibelle('annuaire des entreprises'),
      commerces.some((c) => c.parcelle) && sourceDepuisLibelle('Parcellaire Express (IGN)'),
      commerces.some((c) => c.foncier) && sourceDepuisLibelle('MAJIC, locaux des personnes morales (DGFiP)'),
    ),
    detail: commerces.map((c) => ({ ...c, retenu: retenus.has(c.id) })),
    date,
  });
}

/** K-Vacance : le retour d'analyser() (verdict, visible, registre, rythme, fermetures...). */
function kvacance(brut = {}, entree = {}) {
  const b = brut || {};
  const verdict = b.verdict || null;
  const visibleZone = b.visible?.zone || null;
  const registreZone = b.registre?.zone || null;
  // Les minima de server/kvacance.js : 30 devantures, 20 adresses au registre.
  const lectures = (visibleZone?.total >= 30 ? 1 : 0) + (registreZone?.adresses >= 20 ? 1 : 0);
  const date = dateDe(b.le, entree.date);
  return commun('kvacance', entree, {
    valeur: verdict
      ? { niveau: verdict.niveau ?? null, taux_visible: visibleZone?.taux ?? null, taux_registre: registreZone?.taux ?? null }
      : null,
    fourchette: null,
    unite: '%',
    confiance: verdict?.niveau === 'inconnue' ? 'faible' : confianceDe({ n: lectures, min_haute: 2, min_moyenne: 1 }),
    sources: sources(
      b.vacance && sourceDepuisLibelle('OpenStreetMap'),
      b.source_registre === 'insee' && sourceDepuisLibelle('Sirene', { le: b.registre?.garde_le || null }),
    ),
    detail: {
      phrase: verdict?.phrase ?? null,
      appuis: verdict?.appuis || [],
      reserves: verdict?.reserves || [],
      visible: b.visible || null,
      rythme: b.rythme || null,
      locaux_vides: b.locaux_vides || [],
      fermetures: b.fermetures || [],
      erreurs: b.erreurs || [],
    },
    date,
  });
}

/** K-Foncier : le retour d'analyser() ({ point, annee, erreurs, parcelles, total, avec_proprietaires }). */
function kfoncier(brut = {}, entree = {}) {
  const b = brut || {};
  const parcelles = Array.isArray(b.parcelles) ? b.parcelles : [];
  const date = dateDe(b.le, entree.date);
  return commun('kfoncier', entree, {
    valeur: parcelles.length ? { parcelles: b.total ?? parcelles.length, avec_proprietaires: b.avec_proprietaires ?? parcelles.filter((p) => p.proprietaires?.length).length } : null,
    fourchette: null,
    unite: 'parcelles',
    // Les personnes physiques n'y sont jamais : la confiance porte sur les parcelles rattachées à une personne morale.
    confiance: (b.erreurs || []).length ? 'faible' : confianceDe({ n: b.avec_proprietaires ?? 0, min_haute: 5, min_moyenne: 1 }),
    sources: sources(
      parcelles.length && sourceDepuisLibelle('Parcellaire Express (IGN)'),
      b.annee && sourceDepuisLibelle('MAJIC, locaux des personnes morales (DGFiP)', { millesime: b.annee }),
    ),
    // Les contours restent dans l'outil : le détail garde ce qui se vérifie.
    detail: parcelles.map(({ geometry, ...p }) => p),
    date,
  });
}

/**
 * Valeur locative : le `resultat` de valeurLocative() (ou l'enregistrement
 * ValeurLocativeRecherche qui le porte). La valeur retenue vient des
 * comparables (Klocka ou Equimmox) ; à défaut, l'échelle Equimmox la plus fine.
 */
function valeur_locative(brut = {}, entree = {}) {
  const r = brut?.resultat && !brut.unite ? brut.resultat : brut || {};
  const v = r.valeur || null;
  const comp = r.comparables || null;
  const liste = Array.isArray(comp?.comparables) ? comp.comparables : [];
  const niveau = ['rue', 'quartier', 'ville'].map((k) => (r[k] ? { cle: k, ...r[k] } : null)).find(Boolean) || null;

  let fourchette = null;
  let valeur = null;
  if (v && (v.central != null || v.bas != null || v.haut != null)) {
    fourchette = { bas: v.bas, central: v.central, haut: v.haut };
    valeur = v.central ?? null;
  } else if (niveau) {
    const central = niveau.moyenne ?? (niveau.basse != null && niveau.haute != null ? Math.round((niveau.basse + niveau.haute) / 2) : null);
    fourchette = { bas: niveau.basse, central, haut: niveau.haute };
    valeur = central;
  }

  const confiance = CONFIANCES.includes(v?.confiance) ? v.confiance
    : CONFIANCES.includes(comp?.confiance) ? comp.confiance
      : confianceDe({ n: ['rue', 'quartier', 'ville'].filter((k) => r[k]).length, min_haute: 3, min_moyenne: 1 });

  const klocka = liste.filter((c) => String(c.source || '').startsWith('klocka'));
  const equimmox = liste.filter((c) => c.source === 'equimmox');
  const ilc = klocka.map((c) => c.ilc).find((x) => x?.a) || null;
  return commun('valeur_locative', entree, {
    valeur,
    fourchette,
    unite: fourchette ? r.unite || '€ HT HC / m² / an' : null,
    confiance,
    sources: sources(
      (equimmox.length || r.constate) && sourceDepuisLibelle('Equimmox · Analyse de loyer', { le: equimmox.map((c) => c.le).find(Boolean) || null }),
      klocka.length && { cle: 'loyers_klocka', nom: 'Loyers des dossiers Klocka', millesime: null, le: null },
      ilc && { cle: 'insee_ilc', nom: 'Indice des loyers commerciaux (INSEE)', millesime: ilc.a, le: null },
    ),
    detail: {
      source_retenue: v?.source ?? null,
      niveau: v?.niveau ?? comp?.niveau ?? niveau?.cle ?? null,
      comparables: liste,
      klocka: comp?.klocka || null,
      controle: comp?.controle || null,
      echelles: { rue: r.rue || null, quartier: r.quartier || null, ville: r.ville || null },
      erreurs: r.erreurs || [],
    },
    date: dateDe(r.le, brut?.le, entree.date),
  });
}

/** K-Transactions : le retour d'analyser() ({ murs, fonds, rotation, tension_rue, cessions, ... }). */
function ktransactions(brut = {}, entree = {}) {
  const b = brut || {};
  const murs = b.murs || null;
  const fonds = b.fonds || null;
  const p = murs?.prix_m2 || null;
  const annees = murs?.annees || [];
  return commun('ktransactions', entree, {
    valeur: murs || fonds
      ? {
        murs_prix_m2: p?.median ?? null,
        ventes_murs: murs?.n ?? null,
        fonds_prix: fonds?.prix?.median ?? null,
        cessions_fonds: fonds?.n ?? null,
        periode_rotation_ans: b.rotation?.periode_ans ?? null,
      }
      : null,
    fourchette: p ? { bas: p.bas, central: p.median, haut: p.haut } : null,
    unite: p ? murs.unite || '€ / m²' : null,
    // DVF ne rend un prix au m² qu'à partir de son minimum de ventes (n_minimum).
    confiance: confianceDe({ n: murs?.n ?? 0, min_haute: 20, min_moyenne: murs?.n_minimum ?? 5 }),
    sources: sources(
      murs && sourceDepuisLibelle(murs.source || 'DVF', { millesime: annees.length ? annees.join(', ') : null, le: murs.le || null }),
      fonds && sourceDepuisLibelle('BODACC'),
      b.locaux != null && sourceDepuisLibelle('OpenStreetMap'),
    ),
    detail: {
      ventes: murs?.ventes || [],
      cessions: b.cessions || [],
      comparables_rue: fonds?.comparables_rue || [],
      rotation: b.rotation || null,
      tension_rue: b.tension_rue || null,
      erreurs: [b.murs_erreur, b.fonds_erreur].filter(Boolean),
    },
    date: dateDe(murs?.le, b.le, entree.date),
  });
}

/**
 * Signaux de vacance (Outils > Vacance) : le retour de rechercher(), un
 * FeatureCollection ({ total, repartition, zone, features }). Un 202
 * « chargement » n'a encore rien lu.
 */
function signaux_vacance(brut = {}, entree = {}) {
  const b = brut || {};
  const features = Array.isArray(b.features) ? b.features : [];
  const chargee = b.zone?.chargee_le || null;
  const enChargement = b.etat === 'chargement';
  const vues = new Set(features.flatMap((f) => (f.properties?.signaux || []).map((s) => s.source)).filter(Boolean));
  return commun('signaux_vacance', entree, {
    valeur: enChargement || (!b.zone && b.total == null) ? null : { locaux: b.total ?? features.length, repartition: b.repartition || {} },
    fourchette: null,
    unite: enChargement || (!b.zone && b.total == null) ? null : 'locaux',
    // La commune est rechargée chaque nuit : au-delà d'une semaine sans recharge, la lecture vieillit.
    confiance: confianceDe({ n: chargee && !enChargement ? 1 : 0, min_haute: 1, min_moyenne: 1, age_jours: ageJours(chargee), age_max_jours: 7 }),
    sources: [...vues].map((s) => sourceDepuisLibelle(s === 'bodacc' ? 'BODACC' : s === 'sirene' ? 'Sirene' : s, { le: chargee })),
    detail: features.map((f) => ({ ...f.properties, lat: f.geometry?.coordinates?.[1] ?? null, lon: f.geometry?.coordinates?.[0] ?? null })),
    date: dateDe(chargee, entree.date),
  });
}

export const ADAPTATEURS = {
  kzoning, kexpertise, kestimation, kprospective, kvacance,
  kfoncier, valeur_locative, ktransactions, signaux_vacance,
};

/** Le résultat brut d'un outil, au format commun. */
export function versFormatCommun(outil, brut, entree = {}) {
  const a = ADAPTATEURS[outil];
  if (!a) throw new Error(`Format commun : outil inconnu « ${outil} » (attendu : ${OUTILS.join(', ')}).`);
  return a(brut, entree);
}
