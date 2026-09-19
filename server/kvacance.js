// K-Vacance : les locaux vides, et depuis combien de temps le quartier tourne.
//
// Deux sources, qui ne disent pas la même chose et se complètent :
//
//   OPENSTREETMAP dit ce qu'on voit depuis le trottoir. Un local marqué
//   `shop=vacant` ou `disused:shop` est un rideau baissé, relevé par quelqu'un
//   qui est passé devant. C'est la vacance visible, et c'est elle qui donne le
//   taux : vides sur total des devantures de la rue.
//
//   SIRENE dit ce que le registre enregistre. Un établissement fermé porte sa
//   date de création et sa date de fermeture : la différence, c'est la durée
//   d'exploitation. La médiane de ces durées sur une rue, c'est le turn-over.
//
// Une précaution sur Sirene : la recherche par rayon ne rend que les
// établissements de sociétés ENCORE VIVANTES. Les sociétés entièrement
// radiées — justement celles qui ont mis la clé sous la porte — n'y sont pas.
// On interroge donc aussi les sociétés cessées de la commune, et on les filtre
// par distance. Sans ce second passage, le turn-over serait faux par
// construction, et flatteur.
//
// Tout est gratuit et public. Aucun crédit n'est dépensé.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';
import { libelleActivite } from './naf.js';

const ANNUAIRE = 'https://recherche-entreprises.api.gouv.fr';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 30000;
const RECHERCHE = 'RechercheVacance';
const RAYON_DEFAUT = 400;
// Au-delà, une fermeture ne dit plus rien du quartier d'aujourd'hui.
const ANNEES_FERMETURE = 8;
const PAGES_MAX = 6;

const metres = (a, b, c, d) => {
  const R = 6371000; const rad = Math.PI / 180;
  const x = (c - a) * rad; const y = (d - b) * rad;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(y / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

export const normaliserRue = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\b(rue|avenue|av|boulevard|bd|place|pl|cours|chemin|impasse|allee|allees|quai|route|rte)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const mediane = (xs) => {
  if (!xs.length) return null;
  const t = [...xs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : Math.round((t[m - 1] + t[m]) / 2);
};

/** La même, au dixième près : une durée de vacance de 2,5 ans n'est pas 3 ans. */
const medianeAns = (xs) => {
  if (!xs.length) return null;
  const t = [...xs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  const v = t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
  return Math.round(v * 10) / 10;
};

const TYPES_VOIE = 'RUE|AVENUE|AV|BOULEVARD|BD|PLACE|PL|COURS|CHEMIN|IMPASSE|ALLEE|ALLEES|QUAI|ROUTE|RTE|TRAVERSE|MONTEE|DESCENTE|PROMENADE|SQUARE|CORNICHE|PASSAGE|GALERIE|ESPLANADE|PARVIS|SENTIER|VOIE';

/**
 * La clé d'un local : son numéro et sa voie. Pure : testée sans réseau.
 *
 * C'est elle qui permet de dire qu'un exploitant s'est installé là où un autre
 * a fermé. Les adresses du registre sont bruitées — « ADAPEI 06 TORRINI 8 RUE
 * TORRINI 06000 NICE », « 14 ET 16 14 BOULEVARD DE CESSOLE » — donc on ne
 * compare pas des chaînes : on retient le DERNIER couple « numéro + type de
 * voie » trouvé, qui est l'adresse postale réelle, et on coupe au code postal.
 *
 * Le bis fait partie de l'adresse et reste dans la clé : le 14 et le 14 bis
 * d'un boulevard sont deux immeubles, et les confondre inventerait des
 * successions qui n'ont pas eu lieu. Le registre l'écrit tantôt « BIS »,
 * tantôt d'une seule lettre — « 31 B RUE MICHEL ANGE ».
 */
export function cleAdresse(adresse) {
  const t = String(adresse || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\b\d{5}\b[\s\S]*$/, ' ');
  const re = new RegExp(`(\\d+)\\s*(BIS|TER|QUATER|[A-Z])?\\s+(?:${TYPES_VOIE})\\b(.*)$`, 'g');
  let m; let dernier = null;
  while ((m = re.exec(t)) !== null) { dernier = m; if (re.lastIndex === m.index) re.lastIndex += 1; }
  if (!dernier) return null;
  const voie = normaliserRue(dernier[3]);
  const bis = dernier[2] ? dernier[2].slice(0, 1).toLowerCase() : '';
  return voie ? `${Number(dernier[1])}${bis}|${voie}` : null;
}

/** En deçà, une médiane de délai ne repose sur rien et ne s'affiche pas. */
export const MINIMUM_REPRISES = 5;

/**
 * Le délai avant qu'un nouvel exploitant se déclare à une adresse où un
 * commerce a fermé. Pure : testée sans réseau.
 *
 * C'est la mesure que le registre permet, et il faut la nommer pour ce qu'elle
 * est. On a d'abord cru mesurer la vacance d'un local ; on mesure en réalité
 * l'intervalle entre deux déclarations à la même adresse postale. Trois
 * réserves, qui sont dans le résultat et sur l'écran :
 *
 *   1. Un numéro de rue n'est pas un local. Un immeuble en abrite plusieurs,
 *      donc une réouverture au même numéro n'est pas forcément la reprise du
 *      même commerce. Le délai est un indice de reprise d'activité à l'adresse,
 *      pas la relocation certifiée d'une boutique.
 *   2. La médiane ne porte que sur les délais ACHEVÉS. Une adresse sans
 *      nouvelle déclaration n'a pas de délai connu, seulement un temps écoulé ;
 *      le compter tirerait la médiane vers le bas, l'ignorer en silence la
 *      tirerait vers le haut. Les deux nombres sont rendus séparément.
 *   3. Un repreneur qui ne se déclare pas exactement à la même adresse passe
 *      pour une adresse restée sans activité. La mesure est donc un plafond.
 */
export function dureesDeVacance(fermetures, ouvertures, aujourdhui = new Date()) {
  const parCle = new Map();
  for (const o of ouvertures || []) {
    if (!o?.cle || !o?.date) continue;
    if (!parCle.has(o.cle)) parCle.set(o.cle, []);
    parCle.get(o.cle).push(o);
  }
  for (const v of parCle.values()) v.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const jour = aujourdhui.toISOString().slice(0, 10);
  const lignes = [];
  for (const f of fermetures || []) {
    if (!f?.cle_adresse || !f?.fermeture) continue;
    const reprise = (parCle.get(f.cle_adresse) || []).find((o) => String(o.date) > String(f.fermeture)) || null;
    const fin = reprise ? reprise.date : jour;
    const ans = Math.round(((Date.parse(fin) - Date.parse(f.fermeture)) / (365.25 * 86400000)) * 10) / 10;
    if (!Number.isFinite(ans) || ans < 0) continue;
    lignes.push({
      siret: f.siret,
      vacance_ans: ans,
      en_cours: !reprise,
      reprise_le: reprise ? reprise.date : null,
      reprise_par: reprise ? reprise.nom : null,
      reprise_activite: reprise ? reprise.activite_libelle || null : null,
    });
  }

  const terminees = lignes.filter((l) => !l.en_cours).map((l) => l.vacance_ans);
  const encore = lignes.filter((l) => l.en_cours).map((l) => l.vacance_ans);
  return {
    n: lignes.length,
    n_reprises: terminees.length,
    n_en_cours: encore.length,
    // Deux ou trois reprises ne font pas une médiane : l'écran s'en sert pour
    // montrer un chiffre ou dire qu'il n'y en a pas assez.
    assez: terminees.length >= MINIMUM_REPRISES,
    minimum_reprises: MINIMUM_REPRISES,
    mediane_ans: medianeAns(terminees),
    // Ce que les locaux encore vides ont déjà passé à l'être : ce n'est pas une
    // durée de vacance, c'est une durée écoulée, et les deux ne se mélangent pas.
    mediane_en_cours_ans: medianeAns(encore),
    lignes,
  };
}

/**
 * Le taux de vacance d'une zone, et rue par rue. Pure : testée sans réseau.
 *
 * Une rue qui n'a qu'une devanture relevée n'a pas de taux : un vide sur un
 * donnerait cent pour cent de vacance, ce qui ne veut rien dire.
 */
export const MINIMUM_PAR_RUE = 4;

export function tauxDeVacance(commerces) {
  const total = commerces.length;
  const vides = commerces.filter((c) => c.vacant).length;
  const parRue = new Map();
  for (const c of commerces) {
    const rue = normaliserRue((c.adresse || '').replace(/^\d+\w*\s+/, ''));
    if (!rue) continue;
    const r = parRue.get(rue) || { rue, libelle: (c.adresse || '').replace(/^\d+\w*\s+/, ''), total: 0, vides: 0, points: [] };
    r.total += 1;
    if (c.vacant) { r.vides += 1; r.points.push({ lat: c.lat, lon: c.lon, adresse: c.adresse }); }
    parRue.set(rue, r);
  }
  const rues = [...parRue.values()]
    .filter((r) => r.total >= MINIMUM_PAR_RUE)
    .map((r) => ({ ...r, taux: Math.round((r.vides / r.total) * 1000) / 10 }))
    .sort((a, b) => b.taux - a.taux || b.total - a.total);
  return {
    total,
    vides,
    taux: total ? Math.round((vides / total) * 1000) / 10 : null,
    rues,
    rues_ecartees: parRue.size - rues.length,
    minimum_par_rue: MINIMUM_PAR_RUE,
  };
}

/**
 * Le turn-over : combien d'années un commerce tient avant de fermer.
 * Pure : testée sans réseau.
 */
export function turnOver(fermetures) {
  const durees = fermetures.map((f) => f.duree_ans).filter((d) => d != null && d >= 0);
  const parAnnee = new Map();
  for (const f of fermetures) {
    if (!f.annee_fermeture) continue;
    parAnnee.set(f.annee_fermeture, (parAnnee.get(f.annee_fermeture) || 0) + 1);
  }
  return {
    n: fermetures.length,
    duree_mediane: mediane(durees),
    duree_moyenne: durees.length ? Math.round((durees.reduce((s, d) => s + d, 0) / durees.length) * 10) / 10 : null,
    // Moins de trois ans, c'est un emplacement qui ne pardonne pas.
    part_moins_3_ans: durees.length ? Math.round((durees.filter((d) => d < 3).length / durees.length) * 100) : null,
    par_annee: [...parAnnee.entries()].sort((a, b) => a[0] - b[0]).map(([annee, n]) => ({ annee, n })),
  };
}

async function annuaire(chemin, params) {
  const r = await fetch(`${ANNUAIRE}${chemin}?${new URLSearchParams(params)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(DELAI_MS),
  });
  if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 1200)); return annuaire(chemin, params); }
  if (!r.ok) throw new Error(`L'annuaire a répondu ${r.status}`);
  return r.json();
}

/** Une fermeture, telle qu'on la garde. Pure : testée sans réseau. */
export function lireFermeture(societe, etab, centre) {
  const lat = Number(etab.latitude); const lon = Number(etab.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const fin = etab.date_fermeture || societe.date_fermeture;
  if (!fin) return null;
  const debut = etab.date_creation || etab.date_debut_activite || societe.date_creation;
  const duree = debut ? Math.round(((Date.parse(fin) - Date.parse(debut)) / (365.25 * 86400000)) * 10) / 10 : null;
  const code = etab.activite_principale || societe.activite_principale;
  return {
    siret: etab.siret,
    nom: societe.nom_complet || societe.nom_raison_sociale,
    enseigne: (etab.liste_enseignes || [])[0] || null,
    activite: code,
    // Ce qui se faisait dans le local, et non le nom de la société qui
    // l'exploitait : « Formation continue d'adultes » plutôt que « ISATIS ».
    // Null pour un code d'avant 2008, que la nomenclature actuelle ignore.
    activite_libelle: libelleActivite(code),
    adresse: etab.adresse || null,
    cle_adresse: cleAdresse(etab.adresse),
    lat, lon,
    distance_m: centre ? metres(centre.lat, centre.lon, lat, lon) : null,
    ouverture: debut,
    fermeture: fin,
    annee_fermeture: Number(String(fin).slice(0, 4)) || null,
    duree_ans: duree != null && duree >= 0 ? duree : null,
    societe_cessee: societe.etat_administratif === 'C',
  };
}

/** Les fermetures autour d'un point : les deux chemins, réunis. */
async function fermeturesAutour(point, codeInsee, rayon) {
  const vues = new Set();
  const sortie = [];
  // Les établissements ENCORE OUVERTS, récoltés dans les mêmes réponses : ce
  // sont eux qui datent la reprise d'un local. Aucun appel supplémentaire.
  const ouvertures = [];
  const vuesOuvertes = new Set();
  const depuis = new Date().getFullYear() - ANNEES_FERMETURE;

  const garderOuverture = (societe, e) => {
    if (e.etat_administratif !== 'A' || vuesOuvertes.has(e.siret)) return;
    const d = e.date_creation || e.date_debut_activite;
    // « 1900-01-01 » est la sentinelle du registre pour une date inconnue :
    // la prendre au mot ferait précéder toute fermeture par une ouverture.
    if (!d || String(d).slice(0, 4) <= '1900') return;
    const cle = cleAdresse(e.adresse);
    if (!cle) return;
    vuesOuvertes.add(e.siret);
    const code = e.activite_principale || societe.activite_principale;
    ouvertures.push({
      cle, date: d,
      nom: (e.liste_enseignes || [])[0] || societe.nom_complet || societe.nom_raison_sociale,
      activite_libelle: libelleActivite(code),
    });
  };

  const garder = (societe, etabs) => {
    for (const e of etabs || []) {
      if (e.etat_administratif !== 'F' && societe.etat_administratif !== 'C') {
        garderOuverture(societe, e);
        continue;
      }
      const f = lireFermeture(societe, e, point);
      if (!f || vues.has(f.siret)) continue;
      if (f.distance_m > rayon) continue;
      if (f.annee_fermeture && f.annee_fermeture < depuis) continue;
      vues.add(f.siret);
      sortie.push(f);
    }
  };

  const erreurs = [];
  // 1. Les établissements fermés de sociétés encore vivantes : par rayon.
  try {
    for (let page = 1; page <= PAGES_MAX; page++) {
      const d = await annuaire('/near_point', { lat: point.lat, long: point.lon, radius: Math.max(0.1, rayon / 1000), per_page: '25', page: String(page), limite_matching_etablissements: '10' });
      for (const r of d.results || []) garder(r, r.matching_etablissements);
      if ((d.results || []).length < 25) break;
    }
  } catch (e) { erreurs.push(`fermetures autour du point : ${e?.message || e}`); }

  // 2. Les sociétés entièrement cessées de la commune, filtrées par distance.
  //    Sans elles, il manquerait les commerces qui ont vraiment disparu.
  if (codeInsee) {
    try {
      for (let page = 1; page <= PAGES_MAX; page++) {
        const d = await annuaire('/search', { code_commune: codeInsee, etat_administratif: 'C', per_page: '25', page: String(page), limite_matching_etablissements: '10' });
        for (const r of d.results || []) garder(r, r.matching_etablissements);
        if ((d.results || []).length < 25) break;
      }
    } catch (e) { erreurs.push(`sociétés cessées de la commune : ${e?.message || e}`); }
  }

  sortie.sort((a, b) => String(b.fermeture).localeCompare(String(a.fermeture)));
  return { fermetures: sortie, ouvertures, erreurs };
}

/** Une adresse : sa vacance visible, et le rythme auquel le quartier tourne. */
export async function analyser(texte, { rayon = RAYON_DEFAUT, user = null } = {}) {
  let adresse;
  try { adresse = await resoudreAdresse(texte); }
  catch (e) { return { ok: false, error: e.message }; }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };
  const point = { lat: adresse.lat, lon: adresse.lon, label: adresse.label, ville: adresse.ville, code_insee: adresse.code_insee };

  const [osm, sirene] = await Promise.all([
    (async () => {
      try {
        const { commercesDeLaZone } = await import('./kzoning-commerces.js');
        const { TOUS_LES_COMMERCES } = await import('./kzoning-metiers.js');
        const r = await commercesDeLaZone({ lat: adresse.lat, lon: adresse.lon, rayon_m: rayon, filtres: TOUS_LES_COMMERCES.filtres });
        return r.ok ? { commerces: r.commerces || [] } : { erreur: r.error };
      } catch (e) { return { erreur: e?.message || String(e) }; }
    })(),
    fermeturesAutour(point, adresse.code_insee, rayon),
  ]);

  const vacance = osm.erreur ? null : tauxDeVacance(osm.commerces);
  const rotation = turnOver(sirene.fermetures);
  // Chaque fermeture apprend si son local a été repris, et quand.
  const duree = dureesDeVacance(sirene.fermetures, sirene.ouvertures);
  const parSiret = new Map(duree.lignes.map((l) => [l.siret, l]));
  for (const f of sirene.fermetures) {
    const l = parSiret.get(f.siret);
    if (l) Object.assign(f, { vacance_ans: l.vacance_ans, en_cours: l.en_cours, reprise_le: l.reprise_le, reprise_par: l.reprise_par, reprise_activite: l.reprise_activite });
  }

  const existante = Records.list(RECHERCHE).find((x) => x.adresse === adresse.label);
  const le = new Date().toISOString();
  if (existante) Records.update(RECHERCHE, existante.id, { le, par: user?.email || existante.par });
  else Records.create(RECHERCHE, { adresse: adresse.label, point, le, par: user?.email || null }, user?.email);

  return {
    ok: true,
    point,
    rayon,
    annees_fermeture: ANNEES_FERMETURE,
    vacance,
    vacance_erreur: osm.erreur || null,
    locaux_vides: osm.erreur ? [] : osm.commerces.filter((c) => c.vacant).map(({ lat, lon, adresse: a, genre }) => ({ lat, lon, adresse: a, genre })),
    turnover: rotation,
    vacance_duree: { ...duree, lignes: undefined },
    ouvertures_vues: sirene.ouvertures.length,
    fermetures: sirene.fermetures.slice(0, 80),
    erreurs: sirene.erreurs,
  };
}

export function listerRecherches(limite = 30) {
  const vues = new Set();
  return Records.list(RECHERCHE)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .filter((x) => !vues.has(x.adresse) && vues.add(x.adresse))
    .slice(0, limite)
    .map(({ id, adresse, point, le, par }) => ({ id, adresse, point, le, par }));
}
