// K-Vacance : y a-t-il beaucoup de locaux vides ici, oui ou non ?
//
// Deux sources, qui ne disent pas la même chose et se complètent :
//
//   OPENSTREETMAP dit ce qu'on voit depuis le trottoir. Un local marqué
//   `shop=vacant` ou `disused:shop` est un rideau baissé, relevé par quelqu'un
//   qui est passé devant. C'est la vacance VISIBLE : vides sur total des
//   devantures. Une devanture vide que personne n'a relevée paraît occupée, ce
//   taux est donc un plancher.
//
//   SIRENE (INSEE) dit ce que le registre enregistre : tous les commerces de
//   la commune, actifs et fermés, avec leurs dates et leur point. C'est la
//   vacance AU REGISTRE : la part des adresses commerçantes dont le dernier
//   commerce a fermé récemment sans qu'un autre s'y déclare. Un repreneur
//   déclaré à une adresse voisine paraît absent, ce taux est donc un plafond.
//   Le même registre donne le RYTHME DES FERMETURES : combien de commerces
//   ferment par an, rapporté au stock.
//
// Un chiffre seul ne répond pas à « beaucoup ou pas ». Chaque lecture de la
// zone se compare donc à la même lecture pour toute la commune, et aux seuils
// que la profession utilise ; le verdict en sort, avec ses réserves écrites.
//
// Pourquoi Sirene et plus l'annuaire des entreprises : l'annuaire rend 25
// sociétés par page, sans filtre de date, et ses sociétés cessées ne se
// filtrent pas par zone. Six pages d'une commune qui en compte quatre cents,
// c'était tirer au sort. Voir insee-sirene.js.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';
import { etablissementsDeLaCommune, sireneConfigure, MESSAGE_SANS_CLE } from './insee-sirene.js';

const RECHERCHE = 'RechercheVacance';
const RAYON_DEFAUT = 400;
// Au-delà, une fermeture ne dit plus rien du quartier d'aujourd'hui.
const ANNEES_FERMETURE = 8;

/**
 * Ce qu'on appelle un commerce : les préfixes NAF retenus, appliqués à la zone
 * comme à la commune. 47 le commerce de détail, 56 la restauration, 96.0 les
 * services à la personne (coiffure, beauté, pressing), 95.2 la réparation
 * d'articles personnels. Les holdings, SCI et cabinets de conseil domiciliés à
 * la même adresse ne sont pas des devantures : ils ne comptent pas.
 */
export const NAF_COMMERCE = ['47', '56', '960', '952'];
export const estCommerce = (code) => {
  const c = String(code || '').replace('.', '');
  return NAF_COMMERCE.some((p) => c.startsWith(p));
};

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

const pour100 = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const virg = (n) => String(n).replace('.', ',');

/**
 * « 1900-01-01 » est la sentinelle du registre pour une date inconnue. La
 * prendre au mot donnerait des commerces exploités cent vingt ans, et une
 * ouverture antérieure à toute fermeture. On la traite comme une absence.
 */
const dateConnue = (d) => !!d && String(d).slice(0, 4) > '1900';

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

/** La rue d'une clé d'adresse : ce qui suit la barre. */
export const rueDeLaCle = (cle) => (cle ? String(cle).split('|')[1] || null : null);

/** En deçà, une médiane de délai ne repose sur rien et ne s'affiche pas. */
export const MINIMUM_REPRISES = 5;

/**
 * Le délai avant qu'un nouvel exploitant se déclare à une adresse où un
 * commerce a fermé. Pure : testée sans réseau.
 *
 * On mesure l'intervalle entre deux déclarations à la même adresse postale.
 * Trois réserves, qui sont dans le résultat et sur l'écran :
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
 * Le taux de vacance visible d'une zone, et rue par rue. Pure : testée sans réseau.
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
    .map((r) => ({ ...r, taux: pour100(r.vides, r.total) }))
    .sort((a, b) => b.taux - a.taux || b.total - a.total);
  return {
    total,
    vides,
    taux: pour100(vides, total),
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

// --- Le registre, lu en entier ---------------------------------------------

/**
 * Une fermeture telle que l'écran la montre, depuis un établissement Sirene.
 * Pure : testée sans réseau.
 */
export function lireFermeture(e, centre) {
  if (!e || e.etat !== 'F' || !e.fermeture) return null;
  if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) return null;
  const duree = dateConnue(e.ouverture) ? Math.round(((Date.parse(e.fermeture) - Date.parse(e.ouverture)) / (365.25 * 86400000)) * 10) / 10 : null;
  return {
    siret: e.siret,
    nom: e.nom,
    enseigne: e.enseigne || null,
    activite: e.activite,
    // Ce qui se faisait dans le local, et non le nom de la société qui
    // l'exploitait : « Formation continue d'adultes » plutôt que « ISATIS ».
    activite_libelle: e.activite_libelle || null,
    adresse: e.adresse || null,
    cle_adresse: e.cle_adresse || cleAdresse(e.adresse),
    lat: e.lat, lon: e.lon,
    distance_m: centre ? metres(centre.lat, centre.lon, e.lat, e.lon) : null,
    ouverture: e.ouverture,
    fermeture: e.fermeture,
    annee_fermeture: Number(String(e.fermeture).slice(0, 4)) || null,
    duree_ans: duree != null && duree >= 0 ? duree : null,
  };
}

/** Les établissements à portée du point, avec leur distance et leur clé. Pure. */
export function dansLeRayon(etablissements, point, rayon) {
  return (etablissements || [])
    .filter((e) => Number.isFinite(e?.lat) && Number.isFinite(e?.lon))
    .map((e) => ({ ...e, cle_adresse: e.cle_adresse || cleAdresse(e.adresse), distance_m: metres(point.lat, point.lon, e.lat, e.lon) }))
    .filter((e) => e.distance_m <= rayon);
}

/** En deçà, une rue n'a pas de taux au registre. */
export const MINIMUM_ADRESSES_RUE = 5;
/** Une adresse vidée depuis plus longtemps a sans doute changé d'usage : on ne la compte plus. */
export const FENETRE_VACANCE_ANS = 3;

/**
 * La vacance au registre. Pure : testée sans réseau.
 *
 * On regarde chaque adresse postale où un commerce a existé. Si un commerce y
 * est actif, l'adresse est occupée. Sinon, si le dernier a fermé dans la
 * fenêtre, l'adresse est vide au registre. Une adresse vidée depuis plus
 * longtemps ne compte ni comme vide ni comme occupée : elle est sans doute
 * devenue un logement ou un bureau, et la garder gonflerait le taux.
 */
export function vacanceAuRegistre(etablissements, { aujourdhui = new Date(), fenetreAns = FENETRE_VACANCE_ANS } = {}) {
  const limite = new Date(aujourdhui); limite.setFullYear(limite.getFullYear() - fenetreAns);
  const depuis = limite.toISOString().slice(0, 10);
  const parCle = new Map();
  for (const e of etablissements || []) {
    const cle = e?.cle_adresse || cleAdresse(e?.adresse);
    if (!cle) continue;
    const a = parCle.get(cle) || { cle, actifs: 0, derniere: null, dernier: null };
    if (e.etat === 'A') a.actifs += 1;
    else if (e.fermeture && (!a.derniere || String(e.fermeture) > a.derniere)) { a.derniere = String(e.fermeture); a.dernier = e; }
    parCle.set(cle, a);
  }
  const lignes = [];
  let occupees = 0; let anciennes = 0;
  for (const a of parCle.values()) {
    if (a.actifs) { occupees += 1; continue; }
    if (a.derniere >= depuis) {
      lignes.push({ cle: a.cle, adresse: a.dernier.adresse, fermee_le: a.derniere, activite_libelle: a.dernier.activite_libelle || null, nom: a.dernier.enseigne || a.dernier.nom || null, lat: a.dernier.lat, lon: a.dernier.lon });
    } else anciennes += 1;
  }
  const vides = lignes.length;
  const adresses = occupees + vides;
  return { adresses, occupees, vides, anciennes, fenetre_ans: fenetreAns, taux: pour100(vides, adresses), lignes: lignes.sort((x, y) => y.fermee_le.localeCompare(x.fermee_le)) };
}

/**
 * Le rythme des fermetures : la part du stock qui ferme en un an. Pure.
 *
 * Rendu aussi en « un commerce sur N » : cela se juge sans barème, là où un
 * pourcentage demanderait un seuil que personne n'a fixé.
 */
export function rythmeDesFermetures(etablissements, { aujourdhui = new Date() } = {}) {
  const limite = new Date(aujourdhui); limite.setFullYear(limite.getFullYear() - 1);
  const depuis = limite.toISOString().slice(0, 10);
  const actifs = (etablissements || []).filter((e) => e?.etat === 'A').length;
  const fermees = (etablissements || []).filter((e) => e?.etat === 'F' && e.fermeture && String(e.fermeture) >= depuis).length;
  const stock = actifs + fermees;
  return {
    actifs,
    fermees_12_mois: fermees,
    taux_annuel: pour100(fermees, stock),
    un_sur: fermees ? Math.round(stock / fermees) : null,
  };
}

/**
 * Où se place la zone parmi les rues de sa commune, sur la vacance au registre.
 * Pure : testée sans réseau. Même idée que la tension d'une rue dans
 * K-Transactions : le seul repère honnête, c'est les autres rues, lues avec
 * la même source et la même règle.
 */
export function rangParmiLesRues(tauxZone, etablissementsCommune, options = {}) {
  const parRue = new Map();
  for (const e of etablissementsCommune || []) {
    const cle = e?.cle_adresse || cleAdresse(e?.adresse);
    const rue = rueDeLaCle(cle);
    if (!rue) continue;
    if (!parRue.has(rue)) parRue.set(rue, []);
    parRue.get(rue).push({ ...e, cle_adresse: cle });
  }
  const taux = [];
  for (const etabs of parRue.values()) {
    const v = vacanceAuRegistre(etabs, options);
    if (v.adresses >= MINIMUM_ADRESSES_RUE && v.taux != null) taux.push(v.taux);
  }
  if (!taux.length || tauxZone == null) return null;
  taux.sort((a, b) => a - b);
  const q = (p) => taux[Math.min(taux.length - 1, Math.floor(taux.length * p))];
  return {
    rues_comptees: taux.length,
    mediane_des_rues: q(0.5),
    haut_des_rues: q(0.75),
    // La part des rues de la commune qui ont moins de vacance que la zone.
    rang: Math.round((taux.filter((x) => x < tauxZone).length / taux.length) * 100),
  };
}

// --- Le verdict --------------------------------------------------------------

/**
 * Les seuils que la profession emploie pour lire un taux de vacance
 * commerciale : en dessous de 5 %, une vacance frictionnelle (des locaux entre
 * deux exploitants) ; de 5 à 10 %, une vacance à surveiller ; au-dessus de
 * 10 %, une vacance structurelle. Repères d'usage (Procos, Codata), pas une
 * norme : ils se lisent avec la comparaison à la commune, jamais seuls.
 */
export const SEUILS = { frictionnelle: 5, structurelle: 10 };
/** Une zone à ce multiple du taux communal est au-dessus de sa commune ; à l'inverse, en dessous. */
export const ECART_COMMUNE = 1.5;
/** En deçà de ces effectifs, aucune des deux lectures ne porte un verdict. */
export const MINIMUM_DEVANTURES = 30;
export const MINIMUM_ADRESSES = 20;

/** Un taux face à celui de sa commune. Pure : testée sans réseau. */
export function comparer(tauxZone, tauxCommune) {
  if (tauxZone == null || tauxCommune == null) return null;
  if (tauxCommune === 0) return { ratio: null, mot: tauxZone > 0 ? 'au-dessus' : 'dans la moyenne' };
  const ratio = Math.round((tauxZone / tauxCommune) * 10) / 10;
  return { ratio, mot: ratio >= ECART_COMMUNE ? 'au-dessus' : ratio <= 1 / ECART_COMMUNE ? 'en dessous' : 'dans la moyenne' };
}

const lireSeuil = (t) => (t == null ? null : t < SEUILS.frictionnelle ? 'faible' : t < SEUILS.structurelle ? 'moyenne' : 'forte');

/**
 * La tournure qui relie une lecture à sa commune. « au-dessus » et « en
 * dessous » appellent la préposition, « dans la moyenne » se dit « comme » :
 * sans ce détour, la phrase sortait « au-dessus la commune ».
 */
const faceALaCommune = (mot) => (mot === 'dans la moyenne' ? 'comme' : `${mot} de`);

/**
 * Beaucoup de vacance, ou pas ? Pure : testée sans réseau.
 *
 * Chaque lecture (visible, registre) donne un niveau par les seuils, corrigé
 * par la commune : une zone au-dessus de sa commune monte d'un cran, une zone
 * en dessous descend d'un cran. Les deux lectures doivent converger pour
 * trancher ; si elles divergent, on dit « dans la moyenne » et on dit
 * pourquoi. Sans assez de matière, on ne prétend rien.
 *
 * @param {{visible?:{zone?:{taux,total}, commune?:{taux}}, registre?:{zone?:{taux,adresses}, commune?:{taux}, rang?:{rang}}, rythme?:{zone?:{taux_annuel,un_sur}, commune?:{taux_annuel}}}} p
 */
export function verdictVacance({ visible = {}, registre = {}, rythme = {} } = {}) {
  const niveaux = ['faible', 'moyenne', 'forte'];
  const decaler = (niveau, mot) => {
    if (!niveau || !mot) return niveau;
    const i = niveaux.indexOf(niveau);
    if (mot === 'au-dessus') return niveaux[Math.min(2, i + 1)];
    if (mot === 'en dessous') return niveaux[Math.max(0, i - 1)];
    return niveau;
  };
  const appuis = [];
  const reserves = [];
  const lectures = [];

  const v = visible.zone;
  if (v && v.total >= MINIMUM_DEVANTURES && v.taux != null) {
    const c = comparer(v.taux, visible.commune?.taux);
    lectures.push(decaler(lireSeuil(v.taux), c?.mot));
    appuis.push({
      lecture: 'visible',
      phrase: `${virg(v.taux)} % des ${v.total} devantures relevées sont vides` + (c ? `, ${faceALaCommune(c.mot)} la commune (${virg(visible.commune.taux)} %)` : ''),
      repere: `moins de ${SEUILS.frictionnelle} % : vacance frictionnelle ; plus de ${SEUILS.structurelle} % : structurelle`,
    });
  } else if (v) {
    reserves.push(`${v.total} devanture${v.total > 1 ? 's' : ''} relevée${v.total > 1 ? 's' : ''} dans OpenStreetMap : trop peu pour lire la vacance visible.`);
  }

  const r = registre.zone;
  if (r && r.adresses >= MINIMUM_ADRESSES && r.taux != null) {
    const c = comparer(r.taux, registre.commune?.taux);
    lectures.push(decaler(lireSeuil(r.taux), c?.mot));
    const rang = registre.rang?.rang;
    appuis.push({
      lecture: 'registre',
      phrase: `${virg(r.taux)} % des ${r.adresses} adresses commerçantes ont perdu leur dernier commerce sans qu'un autre s'y déclare` + (c ? `, ${faceALaCommune(c.mot)} la commune (${virg(registre.commune.taux)} %)` : ''),
      repere: rang != null ? `${rang} % des rues de la commune ont moins de vacance au registre que cette zone` : `fenêtre de ${r.fenetre_ans || FENETRE_VACANCE_ANS} ans, adresses postales et non locaux`,
    });
  } else if (r) {
    reserves.push(`${r.adresses} adresse${r.adresses > 1 ? 's' : ''} commerçante${r.adresses > 1 ? 's' : ''} au registre dans la zone : trop peu pour lire la vacance au registre.`);
  }

  const y = rythme.zone;
  if (y && y.taux_annuel != null && y.actifs) {
    const c = comparer(y.taux_annuel, rythme.commune?.taux_annuel);
    appuis.push({
      lecture: 'rythme',
      phrase: `${y.fermees_12_mois} commerce${y.fermees_12_mois > 1 ? 's' : ''} sur ${y.actifs + y.fermees_12_mois} ${y.fermees_12_mois > 1 ? 'ont' : 'a'} fermé en un an` + (y.un_sur ? `, un sur ${y.un_sur}` : '') + (c ? `, ${faceALaCommune(c.mot)} la commune (${virg(rythme.commune.taux_annuel)} % par an)` : ''),
      repere: 'un bail commercial court par périodes de 3, 6 et 9 ans',
    });
  }

  let niveau = 'inconnue';
  let phrase;
  if (!lectures.length) {
    phrase = 'Pas assez de matière pour dire si la vacance est forte ou faible ici.';
  } else if (lectures.length === 2 && lectures[0] !== lectures[1]) {
    const [a, b] = lectures;
    const extreme = a === 'forte' || b === 'forte' ? 'forte' : 'faible';
    niveau = 'moyenne';
    phrase = `Vacance dans la moyenne : la rue et le registre ne disent pas la même chose, l'une des deux lectures la donne ${extreme}.`;
    reserves.push('Les deux lectures divergent : la vacance visible est un plancher (ce qui n\'est pas relevé paraît occupé), celle du registre un plafond (un repreneur déclaré à côté paraît absent).');
  } else {
    niveau = lectures[0];
    phrase = niveau === 'forte' ? 'Vacance forte : beaucoup de locaux vides ici.'
      : niveau === 'faible' ? 'Vacance faible : peu de locaux vides ici.'
        : 'Vacance dans la moyenne : ni plus ni moins de locaux vides qu\'ailleurs.';
    if (lectures.length === 1) reserves.push('Une seule lecture porte ce verdict.');
  }
  return { niveau, phrase, appuis, reserves };
}

/** Le résumé en une ligne, pour la file de K-Data. Pure. */
export function resumerVerdict(verdict, visible) {
  if (!verdict) return null;
  const mot = verdict.niveau === 'inconnue' ? 'vacance non mesurable' : `vacance ${verdict.niveau === 'moyenne' ? 'dans la moyenne' : verdict.niveau}`;
  const t = visible?.zone?.taux;
  return t != null ? `${mot} : ${virg(t)} % de devantures vides` : mot;
}

// --- L'analyse ----------------------------------------------------------------

/** Une adresse : sa vacance, comparée à sa commune, et le verdict. */
export async function analyser(texte, { rayon = RAYON_DEFAUT, user = null } = {}) {
  let adresse;
  try { adresse = await resoudreAdresse(texte); }
  catch (e) { return { ok: false, error: e.message }; }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };
  const point = { lat: adresse.lat, lon: adresse.lon, label: adresse.label, ville: adresse.ville, code_insee: adresse.code_insee };
  const aujourdhui = new Date();

  const { commercesDeLaZone, vacanceDeLaCommune } = await import('./kzoning-commerces.js');
  const { TOUS_LES_COMMERCES } = await import('./kzoning-metiers.js');
  const [osm, osmCommune, sirene] = await Promise.all([
    commercesDeLaZone({ lat: adresse.lat, lon: adresse.lon, rayon_m: rayon, filtres: TOUS_LES_COMMERCES.filtres }).catch((e) => ({ ok: false, error: e?.message || String(e) })),
    vacanceDeLaCommune(adresse.code_insee, TOUS_LES_COMMERCES.filtres).catch((e) => ({ ok: false, error: e?.message || String(e) })),
    sireneConfigure()
      ? etablissementsDeLaCommune(adresse.code_insee, { prefixes: NAF_COMMERCE, anneesFermeture: ANNEES_FERMETURE }).catch((e) => ({ ok: false, error: e?.message || String(e) }))
      : Promise.resolve({ ok: false, error: MESSAGE_SANS_CLE }),
  ]);

  const erreurs = [];
  const vacance = osm.ok ? tauxDeVacance(osm.commerces || []) : null;
  if (!osm.ok) erreurs.push(osm.error);
  if (!osmCommune.ok) erreurs.push(osmCommune.error);

  let fermetures = []; let ouvertures = []; let registre = null; let rythme = null;
  if (sirene.ok) {
    const commune = (sirene.etablissements || []).filter((e) => estCommerce(e.activite));
    const zone = dansLeRayon(commune, point, rayon);
    fermetures = zone.map((e) => lireFermeture(e, point)).filter(Boolean).sort((a, b) => String(b.fermeture).localeCompare(String(a.fermeture)));
    ouvertures = zone.filter((e) => e.etat === 'A' && e.cle_adresse && dateConnue(e.ouverture)).map((e) => ({ cle: e.cle_adresse, date: e.ouverture, nom: e.enseigne || e.nom, activite_libelle: e.activite_libelle }));
    const zoneRegistre = vacanceAuRegistre(zone, { aujourdhui });
    registre = {
      zone: { ...zoneRegistre, lignes: zoneRegistre.lignes.slice(0, 60) },
      commune: { ...vacanceAuRegistre(commune, { aujourdhui }), lignes: undefined },
      rang: rangParmiLesRues(zoneRegistre.taux, commune, { aujourdhui }),
      etablissements_commune: commune.length,
      etablissements_zone: zone.length,
      garde_le: sirene.garde_le,
    };
    rythme = { zone: rythmeDesFermetures(zone, { aujourdhui }), commune: rythmeDesFermetures(commune, { aujourdhui }) };
  }

  const rotation = turnOver(fermetures);
  // Chaque fermeture apprend si son local a été repris, et quand.
  const duree = dureesDeVacance(fermetures, ouvertures, aujourdhui);
  const parSiret = new Map(duree.lignes.map((l) => [l.siret, l]));
  for (const f of fermetures) {
    const l = parSiret.get(f.siret);
    if (l) Object.assign(f, { vacance_ans: l.vacance_ans, en_cours: l.en_cours, reprise_le: l.reprise_le, reprise_par: l.reprise_par, reprise_activite: l.reprise_activite });
  }

  const visible = {
    zone: vacance ? { total: vacance.total, vides: vacance.vides, taux: vacance.taux } : null,
    commune: osmCommune.ok ? { total: osmCommune.total, vides: osmCommune.vides, taux: osmCommune.taux } : null,
  };
  const verdict = verdictVacance({ visible, registre: registre || {}, rythme: rythme || {} });
  if (!sirene.ok) verdict.reserves.push(`Le registre n'a pas été lu : ${sirene.error}`);

  const existante = Records.list(RECHERCHE).find((x) => x.adresse === adresse.label);
  const le = aujourdhui.toISOString();
  if (existante) Records.update(RECHERCHE, existante.id, { le, par: user?.email || existante.par });
  else Records.create(RECHERCHE, { adresse: adresse.label, point, le, par: user?.email || null }, user?.email);

  return {
    ok: true,
    point,
    rayon,
    annees_fermeture: ANNEES_FERMETURE,
    verdict,
    visible,
    registre,
    rythme,
    source_registre: sirene.ok ? 'insee' : null,
    sirene_erreur: sirene.ok ? null : sirene.error,
    vacance,
    vacance_erreur: osm.ok ? null : osm.error,
    locaux_vides: osm.ok ? (osm.commerces || []).filter((c) => c.vacant).map(({ lat, lon, adresse: a, genre }) => ({ lat, lon, adresse: a, genre })) : [],
    turnover: rotation,
    vacance_duree: { ...duree, lignes: undefined },
    ouvertures_vues: ouvertures.length,
    fermetures: fermetures.slice(0, 80),
    erreurs,
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
