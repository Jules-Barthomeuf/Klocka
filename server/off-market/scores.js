// Off-market (spec de Jules du 10 oct. 2026) : les deux scores d'un local.
//
//   - Motivation : le propriétaire a-t-il une raison de vendre ? Des signaux
//     publics empilés (BODACC, registre des entreprises, DVF, cadastre des
//     personnes morales), chacun avec ses points, sa source, sa date et sa
//     famille. Plafond de 40 par famille, bonus de 10 à partir de trois
//     familles : l'empilement compte plus que chaque signal.
//   - Fit : est-ce un mur que Klocka veut ? L'enseigne, l'emplacement, le
//     rendement, le lot, la commune, la vacance de la rue, la demande cliente.
//
// Le classement est Motivation × Fit. Les drapeaux de faisabilité (démembrement,
// bail à construction, copropriété, procédure) se lisent à côté, jamais dans le
// score. Tout est pur : rien n'est lu ni écrit ici, et chaque signal dit d'où
// il vient. Les poids sont des hypothèses d'expert, à recalibrer sur les
// issues (section 9 de la spec).

const AN_MS = 365.25 * 24 * 3600 * 1000;
const MOIS_MS = AN_MS / 12;

/** Pure : des mois écoulés depuis une date, ou null. */
export const moisDepuis = (date, maintenant = Date.now()) => {
  const t = Date.parse(date);
  return Number.isFinite(t) ? (maintenant - t) / MOIS_MS : null;
};
const anneesDepuis = (date, maintenant = Date.now()) => { const m = moisDepuis(date, maintenant); return m == null ? null : m / 12; };
const arrondi = (n) => Math.round(n * 10) / 10;
const annee = (d) => String(d || '').slice(0, 4);
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const moisLisible = (d) => { const t = new Date(d); return Number.isFinite(t.getTime()) ? `${MOIS[t.getUTCMonth()]} ${t.getUTCFullYear()}` : String(d || ''); };

/** Pure : la distance en kilomètres entre deux points. */
export function distanceKm(a, b) {
  if (!a || !b || ![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return null;
  const r = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

// ---------------------------------------------------------------------------
// Le profil du propriétaire : il choisit le canal et le ton
// ---------------------------------------------------------------------------

// Les collectivités, les établissements publics et les bailleurs sociaux (HLM, OPH, ESH, SEM) : exclus du classement, comme les groupes 1 à 6 et 9 du cadastre.
const PUBLIC = /\b(commune|ville de|office public|ophlm|opac|oph|hlm|esh|habitat social|logement social|sem\b|departement|département|région|region|communaute|communauté|metropole|métropole|syndicat|etat|état|caisse des depots|caisse des dépôts|hôpital|hopital|chu|crous|université|universite|sncf|rte\b|enedis|la poste|france domaine|domaine public)\b/i;
const FORMES_PUBLIQUES = /^(nature 7|nature 4|collectivit|etablissement public|établissement public)/i;
const ENSEIGNE_NATIONALE = /\b(carrefour|casino|monoprix|franprix|intermarch|leclerc|lidl|aldi|auchan|picard|nicolas|yves rocher|sephora|marionnaud|nocib|orange|sfr|bouygues|free|bnp|societe generale|société générale|credit agricole|crédit agricole|lcl|caisse d.epargne|banque populaire|cic\b|axa|maif|macif|generali|allianz|mcdonald|burger king|kfc|subway|starbucks|paul\b|brioche dor|la mie c|columbus|basic.?fit|fitness park|keep cool|optic 2000|krys|afflelou|generale d.optique|grand optical|alain afflelou|pharmacie|h&m|zara|celio|jules\b|kiabi|etam|camaieu|promod|pimkie|mango|foot locker|courir|decathlon|intersport|go sport|darty|boulanger|fnac|bureau vallee|la grande recre|king jouet|jouéclub|joueclub|action\b|gifi|hema|maisons du monde|but\b|conforama|ikea|leroy merlin|castorama|bricorama|mr\.? ?bricolage|weldom|point p|lapeyre|saint maclou|tapis saint|jeff de bruges|de neuville|leonidas|la vie claire|naturalia|bio c bon|biocoop|grand frais|spar\b|vival|proxi|utile|petit casino|carrefour city|carrefour express|monop|g20|leader price|norauto|feu vert|midas|speedy|point s|euromaster|vulco|cash converters|easy cash|orpi|century 21|laforet|laforêt|guy hoquet|foncia|nexity|stephane plaza|stéphane plaza|era\b|iad\b|safti|l.adresse|citya|square habitat)\b/i;

/** Pure : l'enseigne est-elle nationale (un locataire à signature) ? */
export const enseigneNationale = (nom) => ENSEIGNE_NATIONALE.test(String(nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));

const famille = (nom) => String(nom || '').trim().split(/\s+/).pop()?.toUpperCase() || '';

/**
 * Pure : le profil déduit d'un propriétaire. `murs` : le nombre de locaux
 * qu'on lui connaît. Rend { cle, libelle, canal, pourquoi }.
 */
export function profilDe({ proprietaire = null, societe = null, occupant = null, foncier = null, murs = 1 } = {}) {
  const p = proprietaire || {};
  const s = societe || {};
  const nom = String(p.nom || s.nom || '');
  const forme = String(p.forme || s.forme || '').toUpperCase();
  const ape = String(s.ape || '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
  const gerants = Array.isArray(s.gerants) ? s.gerants : [];
  const physiques = gerants.filter((g) => !g.personne_morale);
  if (!nom) return { cle: 'inconnu', libelle: 'Propriétaire inconnu', canal: null, pourquoi: 'aucun propriétaire résolu' };
  if (PUBLIC.test(nom) || FORMES_PUBLIQUES.test(forme) || ape === '8411Z' || ape === '8413Z') return { cle: 'public', libelle: 'Propriétaire public', canal: null, pourquoi: 'collectivité ou établissement public : exclu' };
  if (foncier?.occupant_proprietaire || (p.siren && occupant?.siren && p.siren === occupant.siren)) return { cle: 'occupant', libelle: 'Enseigne propriétaire-occupante', canal: 'courrier', pourquoi: 'le locataire est le propriétaire' };
  if (ape === '6810Z') return { cle: 'marchand', libelle: 'Marchand de biens', canal: 'mail', pourquoi: 'activité 68.10Z' };
  // Banques, crédit-bailleurs, assureurs (APE 64.1x, 64.9x, 65.xx) : des murs d'agence ou de crédit-bail, pas un patrimoine qu'une lettre fera vendre.
  if (/^(641|649|65)/.test(ape)) return { cle: 'institutionnel', libelle: 'Banque ou assureur', canal: 'mail', pourquoi: `activité ${ape}` };
  if (/^(6420Z|7010Z)$/.test(ape)) return { cle: 'holding', libelle: 'Holding', canal: 'mail', pourquoi: `activité ${ape}` };
  if (/SCPI|6521/.test(forme) || /\bSCPI\b|\bOPCI\b|FONCIERE|FONCIÈRE/i.test(nom)) return { cle: 'institutionnel', libelle: 'Foncière ou institutionnel', canal: 'mail', pourquoi: 'SCPI, OPCI ou foncière' };
  if (/^(SA|SAS|SASU)$/.test(forme) && murs >= 8) return { cle: 'fonciere', libelle: 'Foncière', canal: 'mail', pourquoi: `${murs} locaux détenus` };
  if (/^(ENTREPRENEUR INDIVIDUEL|EI|PERSONNE PHYSIQUE)$/.test(forme)) return { cle: 'particulier', libelle: 'Particulier', canal: 'courrier', pourquoi: 'personne physique : courrier seulement' };
  if (/^(SCI|SC|SOCIÉTÉ CIVILE|SOCIETE CIVILE|6540|6599)$/.test(forme)) {
    const familles = physiques.map((g) => famille(g.nom_famille || g.nom)).filter(Boolean);
    const meme = familles.length >= 2 && familles.some((f, i) => familles.indexOf(f) !== i);
    if (meme || (physiques.length === 1 && gerants.length === 1)) return { cle: 'sci_familiale', libelle: 'SCI familiale', canal: 'courrier', pourquoi: meme ? 'plusieurs gérants du même nom' : 'un seul gérant, personne physique' };
    if (gerants.some((g) => g.personne_morale)) return { cle: 'sci_pro', libelle: 'SCI patrimoniale professionnelle', canal: 'mail', pourquoi: 'gérée par une société' };
    return { cle: 'sci', libelle: 'SCI', canal: 'courrier', pourquoi: forme };
  }
  return { cle: 'societe', libelle: 'Société', canal: 'courrier', pourquoi: forme || 'forme inconnue' };
}

// ---------------------------------------------------------------------------
// Les signaux de motivation
// ---------------------------------------------------------------------------

export const FAMILLES = { proprietaire: 'Propriétaire', occupant: 'Occupant', evenement: 'Événement', marche: 'Marché' };

const normal = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Pure : l'annonce BODACC vise-t-elle cette société ? Le BODACC cite d'abord
 * le débiteur, puis les créanciers et les mandataires : une banque citée dans
 * la procédure d'un commerçant n'est pas en procédure. Sans nom ou sans
 * détail, on garde l'annonce.
 */
export function viseSociete(e, nom) {
  const d = normal(String(e?.detail || '').split(' · ')[0].split(',')[0]);
  const n = normal(nom);
  if (!d || !n) return true;
  return d.startsWith(n.slice(0, 12)) || n.startsWith(d.slice(0, 12));
}
const PLAFOND_FAMILLE = 40;
const BONUS_EMPILEMENT = 10;

/** Pure : depuis quand le propriétaire détient le local, et d'où on le sait. */
export function detentionDe(local) {
  const m = local.mutation || null;
  if (m?.du_local && m?.date) return { depuis: m.date, source: 'DVF, dernière vente du local' };
  if (local.detention?.depuis) return { depuis: local.detention.depuis, source: 'Cadastre des personnes morales (DGFiP)' };
  if (local.societe?.creation) return { depuis: local.societe.creation, source: 'Registre des entreprises, création de la société (au plus tôt)' };
  return null;
}

/** Pure : les lots du propriétaire portent-ils un démembrement, un bail à construction, une copropriété ? */
export function droitsDe(local) {
  const droits = (local.proprietaire?.lots || []).map((l) => String(l.droit || '').toLowerCase());
  return {
    demembre: droits.some((d) => /usufruit|nu-propri|nue-propri/.test(d)),
    construction: droits.some((d) => /construction|emphyt/.test(d)),
    syndic: droits.some((d) => /syndic/.test(d)),
    gerant_seulement: droits.length > 0 && droits.every((d) => /g[ée]rant|mandataire|gestionnaire/.test(d) && !/propri/.test(d)),
  };
}

/**
 * Pure : les signaux de motivation d'un local, chacun avec ses points (après
 * décroissance), sa famille, sa source, sa date et sa confiance.
 */
export function signauxMotivation(local, { maintenant = Date.now() } = {}) {
  const out = [];
  const s = local.societe || {};
  const p = local.proprietaire || {};
  const profil = local.profil || profilDe(local);
  const pousser = (x) => { if (x.points) out.push(x); };
  // Un événement décroît linéairement sur sa durée de vie.
  const decroissant = (base, date, vieMois) => {
    const m = moisDepuis(date, maintenant);
    if (m == null || m < 0 || m > vieMois) return 0;
    return arrondi(base * (1 - m / vieMois));
  };
  const evenements = (Array.isArray(local.evenements) ? local.evenements : []).filter((e) => viseSociete(e, p.nom || s.nom));
  const evLoc = (Array.isArray(local.evenements_locataire) ? local.evenements_locataire : []).filter((e) => viseSociete(e, local.occupant?.nom));
  const dernier = (liste, re) => [...liste].filter((e) => re.test(String(e.type || ''))).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;

  // --- Événements (propriétaire et locataire) ---
  const deces = dernier(evenements, /d[ée]c[èe]s/i);
  if (deces) pousser({ cle: 'deces_dirigeant', famille: 'evenement', libelle: 'Décès d\'un dirigeant', points: decroissant(25, deces.date, 24), date: deces.date, source: deces.source || 'BODACC', confiance: 'probable', valeur: `décès d'un dirigeant annoncé en ${moisLisible(deces.date)}` });
  const dissolution = dernier(evenements, /radiation|dissolution|liquidation/i);
  if (dissolution || s.active === false) pousser({ cle: 'dissolution', famille: 'evenement', libelle: 'Société en dissolution ou radiée', points: 25, date: dissolution?.date || s.fermee_le || null, source: dissolution?.source || 'Registre des entreprises', confiance: 'exacte', valeur: dissolution ? `${dissolution.type} en ${moisLisible(dissolution.date)}` : 'société fermée' });
  const procLoc = dernier(evLoc, /proc[ée]dure collective|sauvegarde|redressement|liquidation|conciliation/i);
  if (procLoc) pousser({ cle: 'locataire_procedure', famille: 'evenement', libelle: 'Locataire en procédure collective', points: decroissant(20, procLoc.date, 12), date: procLoc.date, source: procLoc.source || 'BODACC (locataire)', confiance: 'exacte', valeur: `locataire en ${procLoc.type} depuis ${moisLisible(procLoc.date)}` });
  const procProp = dernier(evenements, /proc[ée]dure collective|sauvegarde|redressement/i);
  if (procProp && !dissolution) pousser({ cle: 'proprietaire_procedure', famille: 'evenement', libelle: 'Société propriétaire en procédure', points: decroissant(25, procProp.date, 24), date: procProp.date, source: procProp.source || 'BODACC', confiance: 'exacte', valeur: `société propriétaire en ${procProp.type} depuis ${moisLisible(procProp.date)}` });
  // Un conseil d'administration change tout le temps : le signal ne vaut que pour une petite gérance.
  const gerance = (s.gerants || []).length > 5 ? null : dernier(evenements, /g[ée]rance|dirigeant|gerant/i);
  if (gerance && !deces) pousser({ cle: 'changement_gerant', famille: 'evenement', libelle: 'Changement de gérant', points: decroissant(10, gerance.date, 12), date: gerance.date, source: gerance.source || 'BODACC', confiance: 'exacte', valeur: `gérance changée en ${moisLisible(gerance.date)}` });
  const cession = dernier(evLoc, /cession|vente/i);
  if (cession) pousser({ cle: 'cession_fonds', famille: 'occupant', libelle: 'Fonds de commerce cédé', points: decroissant(8, cession.date, 12), date: cession.date, source: cession.source || 'BODACC (locataire)', confiance: 'exacte', valeur: `fonds cédé en ${moisLisible(cession.date)}` });

  // --- Propriétaire ---
  const ape = String(s.ape || '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
  const mutationDate = local.mutation?.date || null;
  if (ape === '6810Z' && mutationDate) {
    const m = moisDepuis(mutationDate, maintenant);
    if (m != null && m <= 36) pousser({ cle: 'marchand_recent', famille: 'proprietaire', libelle: 'Marchand de biens, achat récent', points: m <= 24 ? 20 : decroissant(20, mutationDate, 36), date: mutationDate, source: 'Registre des entreprises (68.10Z) et DVF', confiance: local.mutation?.du_local ? 'exacte' : 'probable', valeur: `marchand de biens, achat de ${annee(mutationDate)}` });
  }
  const gerants = Array.isArray(s.gerants) ? s.gerants : [];
  const g70 = gerants.find((g) => String(g.tranche_age || '') === '70+');
  const g50 = gerants.find((g) => String(g.tranche_age || '') === '50-70');
  const petiteGerance = (s.gerants || []).length <= 5; // un conseil de vingt personnes n'a pas d'âge
  if (g70 && petiteGerance) pousser({ cle: 'gerant_age', famille: 'proprietaire', libelle: 'Gérant de 70 ans ou plus', points: 15, date: s.lu_le || null, source: 'Registre des entreprises', confiance: 'exacte', valeur: `gérant de plus de 70 ans` });
  else if (g50 && petiteGerance) pousser({ cle: 'gerant_age', famille: 'proprietaire', libelle: 'Gérant de 50 à 70 ans', points: 5, date: s.lu_le || null, source: 'Registre des entreprises (âge connu par tranche)', confiance: 'probable', valeur: 'gérant de 50 à 70 ans' });
  const det = detentionDe(local);
  const annees = det ? anneesDepuis(det.depuis, maintenant) : null;
  if (annees != null && ape !== '6810Z') {
    if (annees >= 30) pousser({ cle: 'detention_30', famille: 'proprietaire', libelle: 'Détenu depuis plus de 30 ans', points: 20, date: det.depuis, source: det.source, confiance: det.source.startsWith('DVF') ? 'exacte' : 'probable', valeur: `détenu depuis ${Math.floor(annees)} ans (plus-value exonérée si SCI à l'IR)` });
    else if (annees >= 22) pousser({ cle: 'detention_22', famille: 'proprietaire', libelle: 'Détenu depuis plus de 22 ans', points: 15, date: det.depuis, source: det.source, confiance: det.source.startsWith('DVF') ? 'exacte' : 'probable', valeur: `détenu depuis ${Math.floor(annees)} ans (impôt sur la plus-value exonéré si SCI à l'IR)` });
    else if (annees >= 15) pousser({ cle: 'detention_15', famille: 'proprietaire', libelle: 'Détenu depuis plus de 15 ans', points: 15, date: det.depuis, source: det.source, confiance: det.source.startsWith('DVF') ? 'exacte' : 'probable', valeur: `détenu depuis ${Math.floor(annees)} ans (crédit probablement soldé)` });
  }
  const km = distanceKm(s.siege, local);
  if (km != null && km >= 100) pousser({ cle: 'siege_loin', famille: 'proprietaire', libelle: 'Siège à plus de 100 km', points: 8, date: s.lu_le || null, source: 'Registre des entreprises (siège)', confiance: 'exacte', valeur: `siège à ${Math.round(km)} km, à ${s.siege?.ville || 'ailleurs'}` });
  const droits = droitsDe(local);
  if (droits.demembre) pousser({ cle: 'demembrement', famille: 'proprietaire', libelle: 'Usufruit et nue-propriété séparés', points: 5, date: p.trouve_le || null, source: p.source || 'Cadastre des personnes morales', confiance: 'exacte', valeur: 'propriété démembrée : une transmission en cours' });

  // --- Occupant ---
  if (local.occupe === false || local.occupant?.ferme === true) pousser({ cle: 'occupant_ferme', famille: 'occupant', libelle: 'Local sans occupant actif', points: 15, date: local.occupant?.lu_le || null, source: local.occupe === false ? 'Lecture de la vitrine' : 'Google Maps (fermé)', confiance: local.occupe === false ? 'exacte' : 'probable', valeur: 'local vide ou fermé' });
  // L'échéance du bail : dite, sinon estimée par le cycle 3-6-9 depuis la dernière cession du fonds.
  let echeance = local.bail_echeance || null;
  let echeanceSource = local.bail_echeance ? (local.bail_source || 'bail') : null;
  if (!echeance && cession?.date) {
    const t = new Date(cession.date);
    for (const n of [3, 6, 9]) { const e = new Date(Date.UTC(t.getUTCFullYear() + n, t.getUTCMonth(), t.getUTCDate())); if (e.getTime() > maintenant) { echeance = e.toISOString().slice(0, 10); echeanceSource = 'estimée : cycle 3-6-9 depuis la cession du fonds'; break; } }
  }
  if (echeance) {
    const m = -moisDepuis(echeance, maintenant);
    if (m >= 0 && m <= 12) pousser({ cle: 'echeance_bail', famille: 'occupant', libelle: 'Échéance du bail dans l\'année', points: 8, date: echeance, source: echeanceSource, confiance: echeanceSource.startsWith('estimée') ? 'a_confirmer' : 'exacte', valeur: `échéance ${echeanceSource.startsWith('estimée') ? 'estimée ' : ''}en ${moisLisible(echeance)}` });
  }

  // --- Les freins ---
  if (['institutionnel', 'fonciere'].includes(profil.cle)) pousser({ cle: 'institutionnel', famille: 'proprietaire', libelle: 'Foncière ou institutionnel', points: -15, date: null, source: 'Registre des entreprises', confiance: 'exacte', valeur: profil.libelle.toLowerCase() });
  if (profil.cle === 'occupant' && local.occupe !== false) pousser({ cle: 'occupant_proprietaire', famille: 'occupant', libelle: 'Enseigne propriétaire-occupante', points: -5, date: null, source: 'Cadastre et registre', confiance: 'exacte', valeur: 'le locataire est le propriétaire' });

  // Un signal « à confirmer » ne compte pas dans le score tant qu'un second indice ne le relève pas (règle 2 de la fiabilité).
  return out.map((x) => (x.confiance === 'a_confirmer' ? { ...x, compte: false } : { ...x, compte: true }));
}

/** Pure : le score Motivation (0–100) et son explication, à partir des signaux. */
export function scoreMotivation(signaux) {
  const comptes = signaux.filter((x) => x.compte !== false);
  const parFamille = {};
  for (const x of comptes) parFamille[x.famille] = (parFamille[x.famille] || 0) + x.points;
  let total = 0;
  for (const f of Object.keys(parFamille)) total += Math.min(PLAFOND_FAMILLE, parFamille[f]);
  const familles = Object.keys(parFamille).filter((f) => parFamille[f] > 0);
  const bonus = familles.length >= 3 ? BONUS_EMPILEMENT : 0;
  total = Math.max(0, Math.min(100, Math.round(total + bonus)));
  const positifs = comptes.filter((x) => x.points > 0).sort((a, b) => b.points - a.points);
  const phrase = positifs.length ? `${positifs.map((x) => x.valeur).join(', ')}.` : 'Aucune raison de vendre repérée dans les registres publics.';
  return { total, familles: familles.length, bonus, par_famille: parFamille, explication: phrase.charAt(0).toUpperCase() + phrase.slice(1) };
}

// ---------------------------------------------------------------------------
// Le score Fit
// ---------------------------------------------------------------------------

/** Pure : le rendement implicite (loyer estimé ÷ valeur estimée), ou null. */
export function rendementImplicite(local) {
  const v = local.valorisation || {};
  const surface = Array.isArray(v.surface_estimee) ? (v.surface_estimee[0] + v.surface_estimee[1]) / 2 : null;
  const loyer = local.loyer_annuel_bail || (surface && v.loyer_m2_marche ? surface * v.loyer_m2_marche : null);
  const fourchette = v.fourchette || v.fourchette_estimee || null;
  const valeur = Array.isArray(fourchette) && fourchette[0] && fourchette[1] ? (fourchette[0] + fourchette[1]) / 2 : null;
  if (!loyer || !valeur) return null;
  return { rendement: arrondi((loyer / valeur) * 100), loyer: Math.round(loyer), valeur: Math.round(valeur), source: `${local.loyer_annuel_bail ? 'bail' : v.loyer_source || 'loyer de marché'} ÷ ${v.fourchette ? 'fourchette estimée' : 'valeur estimée'}` };
}

/**
 * Pure : le score Fit (0–100), critère par critère, avec « non mesuré » quand
 * la donnée manque (on donne alors une valeur neutre, jamais le maximum).
 * `demande` : le nombre de mandats investisseurs qui correspondent.
 */
export function scoreFit(local, { demande = null, vacanceRue = null } = {}) {
  const c = [];
  const occ = local.occupant || {};
  const enseigne = local.enseigne || occ.enseigne || '';
  const ferme = local.occupe === false || occ.ferme === true;
  const nationale = occ.chaine === true || enseigneNationale(enseigne);
  c.push({ cle: 'enseigne', libelle: 'Enseigne et signature du locataire', sur: 25, points: ferme ? 0 : nationale ? 25 : enseigne ? 12 : 6, valeur: ferme ? 'local sans occupant' : nationale ? `${enseigne} : enseigne nationale` : enseigne ? `${enseigne} : indépendant` : 'occupant inconnu', source: 'Lecture de la vitrine et registre' });
  const emp = Number(local.emplacement);
  c.push({ cle: 'emplacement', libelle: 'Emplacement de la rue', sur: 20, points: emp === 1 ? 20 : emp === 1.5 ? 13 : emp === 2 ? 6 : 8, valeur: emp === 1 ? 'n° 1' : emp === 1.5 ? 'n° 1 bis' : emp === 2 ? 'n° 2' : 'non mesuré', source: 'Classement des rues de la ville' });
  const r = rendementImplicite(local);
  c.push({ cle: 'rendement', libelle: 'Rendement implicite', sur: 15, points: !r ? 7 : r.rendement >= 7 ? 15 : r.rendement >= 6 ? 11 : r.rendement >= 5 ? 7 : 3, valeur: r ? `${String(r.rendement).replace('.', ',')} % (${r.loyer.toLocaleString('fr-FR')} € ÷ ${r.valeur.toLocaleString('fr-FR')} €)` : 'non mesuré', source: r?.source || 'estimation' });
  const droits = droitsDe(local);
  const copro = droits.syndic || (local.foncier?.proprietaires || []).length > 1 || local.mutation?.nombre_lots > 1;
  c.push({ cle: 'lot', libelle: 'Un local, un locataire, monopropriété', sur: 10, points: copro ? 4 : local.proprietaire?.lots?.length ? 10 : 7, valeur: copro ? 'copropriété ou plusieurs lots' : local.proprietaire?.lots?.length ? 'monopropriété' : 'non mesuré', source: 'Cadastre des personnes morales' });
  c.push({ cle: 'commune', libelle: 'Commune', sur: 10, points: 7, valeur: local.ville || 'non mesuré', source: 'INSEE (à affiner)' });
  c.push({ cle: 'vacance_rue', libelle: 'Vacance commerciale de la rue', sur: 10, points: vacanceRue == null ? 8 : vacanceRue > 15 ? 3 : 10, valeur: vacanceRue == null ? 'non mesuré' : `${vacanceRue} % de locaux vides`, source: 'Fermetures SIRENE' });
  c.push({ cle: 'demande', libelle: 'Demande des investisseurs Klocka', sur: 20, points: demande == null ? 0 : demande >= 2 ? 20 : demande >= 1 ? 10 : 0, valeur: demande == null ? 'non mesuré' : demande ? `${demande} mandat${demande > 1 ? 's' : ''} correspond${demande > 1 ? 'ent' : ''}` : 'aucun mandat ne correspond', source: 'Clients investisseurs (Sunday CRM)' });
  const total = Math.max(0, Math.min(100, c.reduce((t, x) => t + x.points, 0)));
  return { total, criteres: c };
}

// ---------------------------------------------------------------------------
// Les drapeaux, la capacité à décider, le profil fiscal
// ---------------------------------------------------------------------------

/** Pure : les drapeaux de faisabilité, lus à côté du score. */
export function drapeauxDe(local) {
  const out = [];
  const droits = droitsDe(local);
  if (droits.demembre) out.push({ cle: 'demembrement', libelle: 'Usufruit et nue-propriété séparés', detail: 'Deux interlocuteurs : la vente demande l\'accord des deux.' });
  if (droits.construction) out.push({ cle: 'bail_construction', libelle: 'Bail à construction ou emphytéose', detail: 'Les murs seuls se vendent difficilement avant la fin du bail.' });
  if (droits.syndic || (local.foncier?.proprietaires || []).length > 1) out.push({ cle: 'copropriete', libelle: 'Copropriété', detail: 'Plusieurs propriétaires sur la parcelle : chercher le lot.' });
  if (droits.gerant_seulement) out.push({ cle: 'gerant', libelle: 'Gestionnaire, pas propriétaire', detail: 'Le droit relevé est une gestion : remonter au titulaire.' });
  if ((local.evenements || []).some((e) => /proc[ée]dure|liquidation/i.test(String(e.type || '')))) out.push({ cle: 'procedure', libelle: 'Société en procédure', detail: 'La vente passe par le mandataire ou le liquidateur.' });
  if (local.occupe !== false) out.push({ cle: 'droit_preference', libelle: 'Droit de préférence du locataire', detail: 'Un local commercial loué vendu seul : le locataire est prioritaire.' });
  return out;
}

/** Pure : simple, moyen ou complexe : combien de personnes doivent dire oui. */
export function capaciteADecider(local) {
  const s = local.societe || {};
  const gerants = Array.isArray(s.gerants) ? s.gerants : [];
  const physiques = gerants.filter((g) => !g.personne_morale).length;
  const droits = droitsDe(local);
  const liquidation = s.active === false || (local.evenements || []).some((e) => /liquidation|dissolution/i.test(String(e.type || '')));
  if (liquidation) return { niveau: 'complexe', libelle: 'Complexe', pourquoi: 'société en liquidation : un liquidateur décide' };
  if (droits.demembre) return { niveau: 'complexe', libelle: 'Complexe', pourquoi: 'usufruitier et nu-propriétaire' };
  if (physiques >= 4) return { niveau: 'complexe', libelle: 'Complexe', pourquoi: `${physiques} gérants ou associés` };
  if (physiques >= 2) return { niveau: 'moyen', libelle: 'Moyen', pourquoi: `${physiques} gérants` };
  if (physiques === 1) return { niveau: 'simple', libelle: 'Simple', pourquoi: 'un seul gérant' };
  return { niveau: 'inconnu', libelle: 'Inconnu', pourquoi: 'gérants non lus' };
}

/** Pure : où en est le propriétaire par rapport aux seuils de plus-value (si SCI à l'IR). */
export function profilFiscal(local, maintenant = Date.now()) {
  const det = detentionDe(local);
  if (!det) return null;
  const annees = anneesDepuis(det.depuis, maintenant);
  if (annees == null) return null;
  const a = Math.floor(annees);
  const dans = (seuil) => Math.max(0, Math.ceil(seuil - annees));
  let phrase;
  if (annees >= 30) phrase = `Détenu depuis ${a} ans : plus-value exonérée d'impôt et de prélèvements sociaux, si SCI à l'IR.`;
  else if (annees >= 22) phrase = `Détenu depuis ${a} ans : impôt sur la plus-value exonéré, prélèvements sociaux encore dus jusqu'à 30 ans (dans ${dans(30)} ans), si SCI à l'IR.`;
  else phrase = `Détenu depuis ${a} ans : exonération d'impôt sur la plus-value dans ${dans(22)} ans, totale dans ${dans(30)} ans, si SCI à l'IR.`;
  return { annees: a, depuis: det.depuis, source: det.source, phrase };
}

/** Pure : tout le classement d'un local : scores, signaux, drapeaux, rang. */
export function classer(local, { maintenant = Date.now(), demande = null, vacanceRue = null } = {}) {
  const profil = local.profil || profilDe(local);
  const signaux = signauxMotivation({ ...local, profil }, { maintenant });
  const motivation = scoreMotivation(signaux);
  const fit = scoreFit(local, { demande, vacanceRue });
  const exclu = profil.cle === 'public' ? 'propriétaire public' : null;
  return { profil, signaux, motivation, fit, drapeaux: drapeauxDe(local), rang: exclu ? 0 : Math.round((motivation.total * fit.total) / 100), exclu };
}
