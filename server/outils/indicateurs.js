// Les indicateurs de l'Emplacement, chacun sur 10 et lu seul (les Transports sans note depuis le 25 nov. 2026) (24 nov. 2026, Jules : « des indicateurs indépendants,
// notés sur 10 ; Commercialité : les commerces en pied d'immeuble, plus il y en a, meilleure est la commercialité ; un
// commerce tous les deux immeubles, moins bien ; et mets les autres aussi »). Pas de moyenne : chacun dit sa note, sa
// phrase et sa source, ou qu'il n'a pas pu se lire.
//
// Commercialité : les immeubles sont les numéros de la rue dans la Base Adresse Nationale (un numéro, une entrée sur la
// rue) ; un pied d'immeuble est commerçant quand le registre SIRENE y connaît un commerce ouvert à ce numéro (l'outil
// Rue : cellules « occupé »). On compte 150 m avant et après le bien en suivant sa rue (pas à vol d'oiseau), les deux
// trottoirs, chacun suivi par ses numéros : la part des
// numéros qui ont un commerce. Tous ont un commerce : 10 ; un sur deux : 5 (barème provisoire, à régler sur les notes de
// l'équipe). Moins de six numéros autour : pas de note.
// Pur pour les calculs ; `numerosDeLaVoie` et `indicateursDeLAdresse` lisent la BAN et la base.

import { Records } from '../db.js';

export const RAYON_COMMERCIALITE = 150;
const MONTRES = new Set(['commercialite', 'loyer', 'transports']);
export const MINIMUM_IMMEUBLES = 6;
const BAN_JOURS = 30;
const demi = (x) => Math.round(Math.max(0, Math.min(10, x)) * 2) / 2;
const pct = (n) => `${Math.round(n * 100)} %`;

/**
 * Pure : la commercialité autour du bien.
 * `numeros` : les numéros BAN de la rue ({ numero, lat, lon }) ; `cellules` : les cellules de l'outil Rue ({ numero, etat }) ;
 * `point` : le bien. Un numéro compte une fois (7 et 7 bis : un immeuble).
 */
/**
 * Pure : les numéros d'un trottoir à `rayon` mètres avant et après le bien, mesurés le long de la rue (25 nov. 2026,
 * Jules : « 150 m avant et après, dans la rue », pas à vol d'oiseau). `points` : les numéros d'un même côté, rangés
 * par numéro, ce qui dessine le tracé du trottoir ; le bien se pose sur ce tracé (sa projection), et chaque numéro
 * garde sa distance au bien en suivant le tracé. Un trottoir qui ne passe pas à `ecartMax` mètres du bien ne compte pas.
 */
export function leLongDeLaRue(points = [], bien, { rayon = RAYON_COMMERCIALITE, ecartMax = 60 } = {}) {
  if (!points.length || !bien) return [];
  const k = 111320; const c = Math.cos((bien.lat * Math.PI) / 180);
  const P = points.map((p) => [(p.lon - bien.lon) * k * c, (p.lat - bien.lat) * k]);
  const cumul = [0];
  for (let i = 1; i < P.length; i += 1) cumul.push(cumul[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  // La place du bien sur le tracé : le point du tracé le plus proche de lui.
  let ecart = Math.hypot(P[0][0], P[0][1]); let place = 0;
  for (let i = 0; i < P.length - 1; i += 1) {
    const [ax, ay] = P[i]; const dx = P[i + 1][0] - ax; const dy = P[i + 1][1] - ay; const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < ecart) { ecart = d; place = cumul[i] + t * Math.sqrt(l2); }
  }
  if (ecart > ecartMax) return [];
  return points.filter((_, i) => Math.abs(cumul[i] - place) <= rayon + 0.5);
}

// Une place, un square, un parvis : la numérotation en fait le tour (1, 2, 3… à la suite), sans trottoir pair ou impair.
export const estUnePlace = (nomVoie) => /^(place|placette|square|parvis|esplanade|rond-point|cour)\b/i.test(String(nomVoie || '').trim());

export function commercialite({ numeros = [], cellules = [], point, rayon = RAYON_COMMERCIALITE, place = false }) {
  const parNumero = new Map();
  for (const n of numeros) {
    const k = Number(n.numero);
    if (!Number.isFinite(k) || !Number.isFinite(n.lat) || !Number.isFinite(n.lon)) continue;
    if (!parNumero.has(k)) parNumero.set(k, n);
  }
  const commercants = new Set(cellules.filter((c) => c.etat === 'occupe').map((c) => Number(c.numero)).filter(Number.isFinite));
  const tous = [...parNumero.entries()];
  // 150 m avant et après le bien, le long de la rue, chaque trottoir suivi par ses numéros (pairs d'un côté, impairs de l'autre).
  const cote = (pair) => tous.filter(([n]) => (n % 2 === 0) === pair).sort((x, y) => x[0] - y[0]);
  const garder = (liste) => { const gardes = new Set(leLongDeLaRue(liste.map(([, n]) => n), point, { rayon })); return liste.filter(([, n]) => gardes.has(n)); };
  // Sur une place, le tour de la place : tous ses numéros (25 nov. 2026, Lorient, place de la Libération).
  const autour = place ? tous : point ? [...garder(cote(true)), ...garder(cote(false))] : [];
  const ou = place ? 'sur la place' : `${rayon} m avant et après le bien dans la rue`;
  const rue = tous.length ? tous.filter(([k]) => commercants.has(k)).length / tous.length : null;
  if (autour.length < MINIMUM_IMMEUBLES) {
    return { note: null, immeubles: autour.length, pieds: null, part: null, part_rue: rue, texte: `${autour.length} numéro${autour.length > 1 ? 's' : ''} ${ou} dans la Base Adresse : trop peu pour noter.` };
  }
  const pieds = autour.filter(([k]) => commercants.has(k)).length;
  const part = pieds / autour.length;
  return {
    note: demi(part * 10), immeubles: autour.length, pieds, part, part_rue: rue,
    texte: `${pieds} pied${pieds > 1 ? 's' : ''} d'immeuble sur ${autour.length} avec un commerce ouvert, ${ou} (${pct(part)})${rue != null && !place ? ` ; ${pct(rue)} sur toute la rue` : ''}.`,
  };
}

// Sur une place, ou quand la rue n'a pas six numéros autour du bien (impasse, rue courte), la rue n'est pas
// représentative : la Commercialité se lit sur un cercle autour du bien, toutes les rues (25 nov. 2026, Jules : « parfois
// ça ne va pas être représentatif, il faut un truc pour écarter, et là ça va voir un cercle autour de l'adresse du
// bien »). Pas plus tôt : le cercle mélange les rues de derrière (la République de Lyon : 8,5 dans la rue, 3,5 au cercle).
export const SEUIL_REPRESENTATIF = 6;
export const RAYON_CERCLE = 150;

const metresEntre = (a, b) => {
  const k = 111320; const c = Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((b.lon - a.lon) * k * c, (b.lat - a.lat) * k);
};

/**
 * Pure : la commercialité sur le cercle autour du bien, toutes les rues. `numeros` : les numéros de la Base Adresse
 * autour ({ numero, voie, lat, lon }) ; `commercants` : pour chaque voie (son nom au registre), les numéros qui ont un
 * commerce ouvert. Un immeuble : une voie et un numéro (7 et 7 bis : un).
 */
export function commercialiteCercle({ numeros = [], commercants = new Map(), point, rayon = RAYON_CERCLE }) {
  const immeubles = new Map();
  for (const n of numeros) {
    const k = Number(n.numero);
    if (!n.voie || !Number.isFinite(k) || !Number.isFinite(n.lat) || !point || metresEntre(point, n) > rayon) continue;
    const cle = `${n.voie}|${k}`;
    if (!immeubles.has(cle)) immeubles.set(cle, { voie: n.voie, numero: k });
  }
  const liste = [...immeubles.values()];
  const pieds = liste.filter((x) => commercants.get(x.voie)?.has(x.numero)).length;
  const voies = new Set(liste.map((x) => x.voie)).size;
  if (liste.length < MINIMUM_IMMEUBLES) return { note: null, immeubles: liste.length, pieds: null, part: null, voies, cercle: true };
  const part = pieds / liste.length;
  return { note: demi(part * 10), immeubles: liste.length, pieds, part, voies, cercle: true };
}

/** Pure : la note de la vacance d'après le taux de l'outil Vacance : 5 % ou moins, 10 ; 30 % ou plus, 0. */
export const noteVacance = (taux) => (Number.isFinite(taux) ? demi(10 - (taux - 5) * 0.4) : null);

/**
 * Pure : les transports sans note (25 nov. 2026, Jules : « pas de notes, juste Tramways, Bus etc, et s'il y a des
 * parkings, le nombre autour du bien à droite ») : une ligne par genre d'arrêt présent, puis les parkings. `parkings` :
 * null quand OpenStreetMap n'a pas répondu, la ligne le dit.
 */
const GENRES_TRANSPORT = [['métro', 'Métro'], ['tramway', 'Tramway'], ['gare', 'Gare'], ['bus', 'Bus']];
export function lignesTransports(arrets = [], parkings = null) {
  // Tramway et Bus toujours, même à zéro (25 nov. 2026, Jules : « mets les trucs de tramways aussi ») ; Métro et Gare
  // seulement quand il y en a.
  const lignes = GENRES_TRANSPORT.map(([genre, nom]) => ({ cle: genre, nom, nombre: arrets.filter((a) => a.genre === genre).length })).filter((l) => l.nombre > 0 || l.cle === 'tramway' || l.cle === 'bus');
  lignes.push({ cle: 'parking', nom: 'Parkings', nombre: Array.isArray(parkings) ? parkings.length : null });
  return lignes;
}

/**
 * Pure : les indicateurs, dans leur ordre. `passage` : la note de passage de l'outil Rue (ses critères, chacun de 0 à
 * 1) ; `vacance` : le taux de l'outil Vacance ({ taux, vacants, tranches }) ; `arrets` : les arrêts placés.
 */
/**
 * Pure : le loyer de la rue, traité comme la Commercialité (24 nov. 2026, Jules : « mets la note du Loyer de la rue comme
 * Commercialité ») : le calcul écrit en clair et le barème marqué provisoire. `loyer` : { rue, ville } en €/m²/an
 * (Equimmox : la moyenne des loyers de la rue, et celle du kilomètre autour). Au même prix : 5 ; 20 % plus cher : 10 ;
 * 20 % moins cher : 0.
 */
export function noteLoyer(loyer) {
  if (!(loyer?.rue > 0 && loyer?.ville > 0)) return null;
  const r = loyer.rue / loyer.ville;
  const ecart = Math.round((r - 1) * 100);
  const e = (n) => `${Math.round(n).toLocaleString('fr-FR')} €/m²/an`;
  return {
    note: demi(((r - 0.8) / 0.4) * 10),
    texte: `${e(loyer.rue)} dans la rue, contre ${e(loyer.ville)} dans le kilomètre autour : ${ecart === 0 ? 'au même prix' : `${Math.abs(ecart)} % ${ecart > 0 ? 'plus cher' : 'moins cher'}`}.`,
  };
}

export function indicateurs({ commercial = null, passage = null, vacance = null, arrets = null, rue = null, loyer = null, parkings = null }) {
  const sig = Object.fromEntries((passage?.signaux || []).map((s) => [s.cle, s]));
  const depuis = (cle, nom, source) => (sig[cle]?.valeur != null ? { cle, nom, note: demi(sig[cle].valeur * 10), texte: sig[cle].texte, source } : { cle, nom, note: null, texte: 'Pas lu pour cette adresse.', source });
  const liste = [
    { cle: 'commercialite', nom: 'Commercialité', note: commercial?.note ?? null, texte: commercial?.texte || 'Pas lue : la rue ou ses numéros sont inconnus.', source: "Base Adresse Nationale (les numéros de la rue) et registre SIRENE (les commerces ouverts à chaque numéro), 150 m avant et après le bien en suivant la rue, les deux trottoirs ; sur une place ou une rue de moins de 6 numéros autour du bien, un cercle de 150 m autour du bien, toutes les rues. Barème provisoire : tous les pieds d'immeuble commerçants, 10 ; un sur deux, 5.", provisoire: true },
    vacance?.taux != null
      ? { cle: 'vacance', nom: 'Locaux vides', note: noteVacance(vacance.taux), texte: `${String(vacance.taux).replace('.', ',')} % de locaux vides dans la rue${vacance.tranches ? ` (${vacance.vacants} sur ${vacance.tranches})` : ''}.`, source: 'Outil Vacance (registre, OpenStreetMap, Google Maps). 5 % ou moins, 10 ; 30 % ou plus, 0.' }
      : sig.vacance?.valeur != null ? depuis('vacance', 'Locaux vides', 'Registre SIRENE : les locaux de la rue sans commerce ouvert.')
        // Sans l'outil Vacance ni le passage : le registre seul, dès quatre locaux connus dans la rue.
        : rue?.vacance_registre_pct != null && (rue.cellules?.length || 0) >= 4
          ? { cle: 'vacance', nom: 'Locaux vides', note: noteVacance(rue.vacance_registre_pct), texte: `${String(rue.vacance_registre_pct).replace('.', ',')} % des locaux de la rue sans commerce ouvert, au registre seul (${rue.cellules.length} locaux connus).`, source: 'Registre SIRENE seul (l’outil Vacance n’a pas répondu). 5 % ou moins, 10 ; 30 % ou plus, 0.' }
          : { cle: 'vacance', nom: 'Locaux vides', note: null, texte: rue?.cellules ? `Trop peu de locaux connus dans la rue pour noter (${rue.cellules.length}), et l'outil Vacance n'a pas répondu.` : 'Pas lu pour cette adresse.', source: 'Outil Vacance, ou le registre SIRENE dès quatre locaux connus.' },
    sig.enseignes?.valeur != null ? depuis('enseignes', 'Enseignes nationales', 'Registre SIRENE et liste des marques, rangé parmi les rues de la ville.')
      // Sans rang dans la ville : la part des commerces ouverts de la rue qui sont des enseignes, dès trois commerces.
      : rue?.part_enseignes_pct != null && (rue.ouvertes || 0) >= 3
        ? { cle: 'enseignes', nom: 'Enseignes nationales', note: demi(rue.part_enseignes_pct / 3), texte: `${rue.part_enseignes_pct} % des ${rue.ouvertes} commerces ouverts de la rue sont des enseignes nationales.`, source: 'Registre SIRENE et liste des marques. 30 % ou plus, 10 ; 15 %, 5.' }
        : { cle: 'enseignes', nom: 'Enseignes nationales', note: null, texte: rue?.ouvertes != null ? `Trop peu de commerces dans la rue pour noter (${rue.ouvertes}).` : 'Pas lu pour cette adresse.', source: 'Registre SIRENE et liste des marques.' },
    noteLoyer(loyer)
      ? { cle: 'loyer', nom: 'Loyer de la rue', ...noteLoyer(loyer), provisoire: true, source: 'Equimmox : la moyenne des loyers de la rue face à celle du kilomètre autour. Barème provisoire : au même prix, 5 ; 20 % plus cher, 10 ; 20 % moins cher, 0.' }
      : { ...depuis('loyer', 'Loyer de la rue', 'Equimmox : le loyer de la rue face au kilomètre autour. Barème provisoire : au même prix, 5 ; 20 % plus cher, 10 ; 20 % moins cher, 0.'), provisoire: true },
    { cle: 'transports', nom: 'Transports', note: null, lignes: lignesTransports(arrets || [], parkings), texte: arrets ? (arrets.length ? null : 'Aucun arrêt de transport en commun à 300 m.') : 'Arrêts pas lus pour cette adresse.', source: 'OpenStreetMap : les arrêts de transport en commun et les parkings ouverts au public à 300 m du bien.' },
  ];
  // Trois indicateurs montrés (24 nov. 2026, Jules : « enlève Locaux vides, on a déjà Signal de vacance ; Enseignes
  // nationales aussi ; enlève Fréquentation ») : la vacance et les enseignes ont déjà leur partie au-dessus.
  return liste.filter((x) => MONTRES.has(x.cle));
}

/** Les numéros d'une voie de la Base Adresse Nationale, gardés trente jours. `lire` : fetch, remplacé dans les tests. */
export async function numerosDeLaVoie(voieId, { lire = fetch } = {}) {
  if (!/^[0-9AB]{5}_[\w]+$/i.test(String(voieId || ''))) return null;
  const garde = Records.filter('LectureBan', { voie: voieId }).filter((x) => Date.now() - Date.parse(x.le) < BAN_JOURS * 86400000)[0];
  if (garde) return garde.numeros;
  const r = await lire(`https://plateforme.adresse.data.gouv.fr/lookup/${encodeURIComponent(voieId)}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`La Base Adresse a répondu ${r.status}.`);
  const d = await r.json();
  const numeros = (d.numeros || []).map((n) => ({ numero: n.numero, suffixe: n.suffixe || null, lon: n.position?.coordinates?.[0] ?? null, lat: n.position?.coordinates?.[1] ?? null })).filter((n) => Number.isFinite(n.lat));
  Records.create('LectureBan', { voie: voieId, numeros, le: new Date().toISOString() });
  return numeros;
}

/**
 * Les numéros de la Base Adresse sur le cercle autour d'un point : le géocodage inverse rend les numéros à une centaine
 * de mètres d'un point ; on l'interroge au centre et à 100 m au nord, au sud, à l'est et à l'ouest. Gardé trente jours.
 */
export async function numerosAutour(lat, lon, { lire = fetch } = {}) {
  const cle = `cercle|${lat.toFixed(4)}|${lon.toFixed(4)}`;
  const garde = Records.filter('LectureBan', { voie: cle }).filter((x) => Date.now() - Date.parse(x.le) < BAN_JOURS * 86400000)[0];
  if (garde) return garde.numeros;
  const dLat = 100 / 111320; const dLon = 100 / (111320 * Math.cos((lat * Math.PI) / 180));
  const points = [[lat, lon], [lat + dLat, lon], [lat - dLat, lon], [lat, lon + dLon], [lat, lon - dLon]];
  const vus = new Map();
  for (const [la, lo] of points) {
    const r = await lire(`https://api-adresse.data.gouv.fr/reverse/?lon=${lo.toFixed(6)}&lat=${la.toFixed(6)}&type=housenumber&limit=50`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`La Base Adresse a répondu ${r.status}.`);
    for (const f of (await r.json()).features || []) {
      const p = f.properties || {}; const [x, y] = f.geometry?.coordinates || [];
      const k = `${p.street}|${p.housenumber}`;
      if (p.street && p.housenumber && Number.isFinite(y) && !vus.has(k)) vus.set(k, { numero: parseInt(p.housenumber, 10), rue: p.street, lat: y, lon: x });
    }
  }
  const numeros = [...vus.values()];
  Records.create('LectureBan', { voie: cle, numeros, le: new Date().toISOString() });
  return numeros;
}

/** La commercialité sur le cercle autour du bien : les numéros de la BAN autour, les commerces du registre de la commune. */
async function commercialiteAutour(point, codeInsee) {
  if (!codeInsee) return null;
  const numeros = await numerosAutour(point.lat, point.lon);
  const { registreDeLaCommune, cellulesDeLaRue } = await import('./rue.js');
  const { voieDuNom, numeroDe } = await import('./vacance-taux.js');
  const registre = await registreDeLaCommune(codeInsee);
  if (!registre?.ok) return null;
  const avecVoie = numeros.map((n) => ({ ...n, voie: voieDuNom(n.rue) })).filter((n) => n.voie);
  const commercants = new Map();
  for (const voie of new Set(avecVoie.map((n) => n.voie))) {
    const { cellules } = cellulesDeLaRue(registre.etablissements, voie);
    commercants.set(voie, new Set(cellules.filter((c) => c.etat === 'occupe').map((c) => numeroDe(c.cle)).filter(Number.isFinite)));
  }
  return commercialiteCercle({ numeros: avecVoie, commercants, point });
}

/**
 * Les indicateurs d'une adresse déjà lue par l'outil Rue (sa dernière lecture) ; `vacance` : le taux de l'outil Vacance
 * tel que l'Emplacement l'a gardé. Rien n'est relu que la BAN (gardée) et les arrêts (gardés).
 */
export async function indicateursDeLAdresse(label, { vacance = null } = {}) {
  const lecture = Records.filter('AnalyseRue', { adresse: label }).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
  if (!lecture) return { ok: false, error: "L'Emplacement de cette adresse n'a pas encore été lu." };
  const x = lecture.resultat || {};
  const { resoudreAdresse } = await import('../adresse-ban.js');
  const ban = await resoudreAdresse(label).catch(() => null);
  const voie = ban?.ban_id ? String(ban.ban_id).split('_').slice(0, 2).join('_') : null;
  const numeros = voie ? await numerosDeLaVoie(voie).catch(() => null) : null;
  const point = Number.isFinite(x.adresse?.lat) ? { lat: x.adresse.lat, lon: x.adresse.lon } : null;
  const place = estUnePlace(ban?.rue || x.adresse?.rue);
  let commercial = numeros ? commercialite({ numeros, cellules: x.rue?.cellules || [], point, place }) : null;
  // La rue n'est pas représentative (place, rue courte) : le cercle autour du bien, toutes les rues.
  if (point && (place || !commercial || commercial.immeubles < SEUIL_REPRESENTATIF)) {
    const cercle = await commercialiteAutour(point, x.adresse?.code_insee).catch(() => null);
    if (cercle?.note != null) {
      const pourquoi = place ? 'Sur une place' : `La rue ne compte que ${commercial?.immeubles ?? 0} numéro${(commercial?.immeubles ?? 0) > 1 ? 's' : ''} autour du bien`;
      commercial = { ...cercle, part_rue: commercial?.part_rue ?? null, texte: `${pourquoi} : cercle de ${RAYON_CERCLE} m autour du bien, toutes les rues. ${cercle.pieds} pied${cercle.pieds > 1 ? 's' : ''} d'immeuble sur ${cercle.immeubles} avec un commerce ouvert, dans ${cercle.voies} rue${cercle.voies > 1 ? 's' : ''} (${pct(cercle.part)}).` };
    }
  }
  let arrets = x.transports?.arrets || null;
  if (!arrets && point) {
    const { arretsAutour } = await import('./rue.js');
    arrets = (await arretsAutour(point.lat, point.lon).catch(() => null))?.arrets || null;
  }
  const { loyerDeLaRue } = await import('./passage.js');
  const { parkingsAutour } = await import('./rue.js');
  // Les parkings en même temps que le loyer : la lecture ne s'allonge pas.
  const [loyer, parkings] = await Promise.all([
    loyerDeLaRue(label).catch(() => null),
    point ? parkingsAutour(point.lat, point.lon).then((r) => r.parkings).catch(() => null) : null,
  ]);
  return { ok: true, indicateurs: indicateurs({ commercial, passage: x.passage, vacance, arrets, rue: x.rue, loyer, parkings }), commercialite: commercial };
}
