// Le passage, deuxième version (13 nov. 2026, Jules : « pour le passage, ce n'est pas très accurate » ; « mets tout en
// place », puis « tu me donnes des adresses, je te dis ce que j'en pense, et on fait un fine-tuning »).
//
// La première note additionnait des indices de l'offre en absolu (14 commerces ouverts = la note pleine) et ne
// comptait pas ce qu'elle n'avait pas lu : deux critères sur cinq, pleins, faisaient 10/10. Celle-ci :
//   1. juge chaque critère face aux autres rues de la ville : les commerces ouverts et les enseignes nationales de la
//      rue rangés parmi toutes les rues de la commune (registre SIRENE) ;
//   2. ajoute la demande : les avis Google des commerces à 100 m, face à ceux de la rue la plus commerçante de la ville
//      (plus de gens passent, plus de gens laissent un avis) ; et le prix que le marché fait payer le passage : le loyer
//      de la rue face à celui d'un kilomètre autour (Equimmox, lecture déjà faite par le Loyer, jamais relancée ici) ;
//   3. garde les transports, le type de voie et la photo Street View lue par l'IA ;
//   4. ne note pas sous trois critères lus, ni sans les commerces de la rue ; un critère manquant compte pour sa valeur
//      moyenne au lieu de disparaître : on ne monte plus à 10 sur deux lectures ;
//   5. apprend : chaque note donnée par l'équipe (page Outils > Passage, ou la note de l'analyste sur la Rue) est
//      gardée avec les critères figés du moment ; à partir de huit, un réglage des poids est proposé, mesuré sur des
//      adresses mises de côté, et ne s'applique que si quelqu'un l'adopte.
// Le résultat reste un indice, pas un comptage, et le dit.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from '../db.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const VERSION_PASSAGE = 'v4 du 13 nov. 2026';
export const SIGNAUX = [
  { cle: 'commerces', nom: 'Commerces de la rue' },
  { cle: 'vacance', nom: 'Locaux vides de la rue' },
  { cle: 'avis', nom: 'Fréquentation Google à 100 m' },
  { cle: 'enseignes', nom: 'Enseignes nationales' },
  { cle: 'loyer', nom: 'Loyer de la rue' },
  { cle: 'transports', nom: 'Transports à 300 m' },
  { cle: 'voie', nom: 'Type de voie' },
];
export const MINIMUM_LUS = 3;
export const MINIMUM_REGLAGE = 8;
const MODELE = 'ModelePassage';
const JUGEMENT = 'JugementPassage';
const CANDIDAT = 'CandidatPassage';
const REFERENCE = 'ReferencePassage';
const REFERENCE_JOURS = 30;
// Une recherche Google « autour » avec le nombre d'avis (champ Enterprise des Places) : ~0,035 $.
export const COUT_AVIS_USD = 0.035;

const borne = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const arrondi = (x, p = 2) => Math.round(x * 10 ** p) / 10 ** p;
const entier = (n) => Math.round(n).toLocaleString('fr-FR');
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// --- Les critères, purs ------------------------------------------------------------------------------------------------

/** Pure : la part des valeurs de la liste sous v, les égalités comptées pour moitié (0 à 1). */
export function partDessous(v, liste) {
  if (v == null || !liste?.length) return null;
  let moins = 0; let egal = 0;
  for (const x of liste) { if (x < v) moins += 1; else if (x === v) egal += 1; }
  return (moins + egal / 2) / liste.length;
}

/**
 * Pure : les critères du passage, chacun de 0 à 1 avec sa phrase, ou absent quand il n'a pas pu être lu.
 * `rangs` : rangsDeLaCommune (rue.js) ; `avis`, `reference` : avisAutour ; `loyer` : { rue, ville } en €/m²/an.
 */
export function signauxPassage({ rue = null, position = null, rangs = null, avis = null, reference = null, loyer = null, transports = null, voie = null, vues = null, ville = null } = {}) {
  const s = {};
  const laVille = ville ? `de ${ville}` : 'de la commune';
  const assez = (rue?.cellules ?? 0) >= 4 && (rangs?.ouvertes?.length ?? 0) >= 5;
  if (assez) {
    // Le nombre de commerces de la rue et leur densité autour du local (son tronçon), chacun rangé parmi les rues de la
    // ville ; la note prend leur moyenne géométrique : une longue avenue clairsemée ne vaut plus une rue dense.
    const p = partDessous(rue.ouvertes, rangs.ouvertes);
    const t = position?.troncon;
    const densite = t?.occupes != null && rangs.densites?.length ? Math.round((t.occupes / Math.max(t.longueur_m || 0, 100)) * 1000) / 10 : null;
    const pd = densite != null ? partDessous(densite, rangs.densites) : null;
    const place = position?.place || null;
    const facteur = pd != null || !place ? 1 : place.rang === 1 ? 1 : place.rang <= Math.ceil(place.rang_sur / 2) ? 0.85 : 0.65;
    // Le nombre d'abord (13 nov. 2026, Jules : « plus il y a de commerces, plus il y a de passage ») : 70 % le nombre,
    // 30 % la densité autour du local. La moyenne géométrique d'avant mettait la rue de la République de Lyon (68
    // commerces, 32 enseignes) à 5/10 parce que son tronçon semblait clairsemé.
    // Puis 90 % le nombre, 10 % la densité (même jour, Jules : « le KFC de la rue de la République, je mets 10, ou entre
    // 9,5 et le maximum ») : le tronçon du 12 paraissait clairsemé et tirait encore la rue de tête vers 8.
    const valeur = pd != null ? 0.9 * p + 0.1 * pd : p * facteur;
    s.commerces = {
      valeur: arrondi(valeur),
      texte: `${pluriel(rue.ouvertes, 'commerce')} ouvert${rue.ouvertes > 1 ? 's' : ''} dans la rue, plus que ${Math.round(p * 100)} % des rues ${laVille}${densite != null ? ` ; ${String(densite).replace('.', ',')} par 100 m autour du local, plus dense que ${Math.round(pd * 100)} % des rues` : place ? `, local ${place.mot.startsWith('le ') ? `dans ${place.mot}` : place.mot}` : ''}`,
    };
    // Les locaux vides (13 nov. 2026, Jules : « plus il y a de commerces et peu de vacance, plus il y a de passage ») :
    // la part des locaux de la rue sans commerce ouvert au registre, lue en absolu : jusqu'à 10 % (le bruit du registre,
    // que toute grande rue commerçante porte), le plein ; 40 % ou plus, rien. Pas de rang parmi les rues : une ruelle de
    // quatre locaux tous ouverts passait devant la rue de tête.
    const vides = rue.vides ?? Math.max(0, (rue.cellules || 0) - (rue.ouvertes || 0));
    const pct = rue.vacance_registre_pct ?? (rue.cellules ? Math.round((vides / rue.cellules) * 100) : null);
    // Jusqu'à 15 % : le bruit du registre sur une grande rue (la République de Lyon en porte 16 %) ; 45 % ou plus, rien.
    if (pct != null) s.vacance = { valeur: arrondi(borne(1 - (pct - 15) / 30)), texte: `${pct} % de locaux vides dans la rue (${vides} ${vides > 1 ? 'locaux' : 'local'} sans commerce ouvert au registre)` };
    const n = rue.enseignes_nationales || 0;
    const pe = n ? partDessous(n, rangs.nationales) : 0;
    s.enseignes = { valeur: arrondi(pe), texte: n ? `${pluriel(n, 'enseigne')} nationale${n > 1 ? 's' : ''} dans la rue${rue.noms_enseignes?.length ? ` (${rue.noms_enseignes.slice(0, 4).join(', ')})` : ''}, plus que ${Math.round(pe * 100)} % des rues` : 'aucune enseigne nationale dans la rue' };
  }
  if (avis?.somme != null && reference?.somme > 0) {
    const r = avis.somme / reference.somme;
    s.avis = { valeur: arrondi(borne(Math.sqrt(r))), texte: `${entier(avis.somme)} avis Google sur les commerces à 100 m, ${Math.round(r * 100)} % de ceux ${reference.rue ? `de la ${String(reference.rue).toLowerCase()}` : 'de la rue la plus commerçante'}${ville ? `, la rue la plus commerçante ${laVille}` : ''}` };
  }
  if (loyer?.rue > 0 && loyer?.ville > 0) {
    const r = loyer.rue / loyer.ville;
    const ecart = Math.round((r - 1) * 100);
    // Au prix des alentours : 5 ; 20 % plus cher : 10 ; 20 % moins cher : 0 (même jour, Jules : la République à +13 %
    // ne faisait que 5,5 ; au même prix que le kilomètre autour, une rue valait 3,75).
    s.loyer = { valeur: arrondi(borne((r - 0.8) / 0.4)), texte: `loyer de la rue ${entier(loyer.rue)} €/m²/an, ${ecart >= 0 ? '+' : '−'}${Math.abs(ecart)} % face au kilomètre autour (Equimmox)` };
  }
  if (transports) {
    const g = transports.genres || [];
    s.transports = { valeur: arrondi(borne((g.length * 0.5 + (transports.lourd ? 0.5 : 0)) / 1.5)), texte: g.length ? `à 300 m : ${g.join(', ')}` : 'aucun transport en commun à 300 m' };
  }
  if (voie) {
    const v = String(voie).toLowerCase();
    s.voie = { valeur: /piéton|pieton|rencontre/.test(v) ? 1 : /principale|primaire|secondaire|avenue|boulevard|cours|quai|place|esplanade|promenade/.test(v) ? 0.6 : 0.3, texte: `voie : ${voie}` };
  }
  // Plus de photo de la rue dans la note (13 nov. 2026, Jules : « enlève la ligne Photo de la rue, je ne veux pas ça ») :
  // un seul cliché, à un instant, ne dit pas le passage. La photo reste lue pour le local (occupé ou vide).
  return s;
}

/** Pure : les valeurs seules (clé → 0..1 ou null), ce que garde un jugement. */
export const valeursDe = (signaux) => Object.fromEntries(SIGNAUX.map(({ cle }) => [cle, signaux?.[cle]?.valeur ?? null]));

/** Pure : la note d'un modèle linéaire sur des valeurs ; un critère absent vaut la moyenne du modèle. */
export function predire(modele, valeurs) {
  let x = modele.constante || 0;
  for (const { cle } of SIGNAUX) x += (modele.coefs?.[cle] || 0) * (valeurs[cle] ?? modele.moyennes?.[cle] ?? 0.5);
  return borne(x, 0, 10);
}

/**
 * Pure : la note refaite avec le loyer de la rue, arrivé après elle (13 nov. 2026, Jules : « loyer de la rue non lu, je
 * suis sûr que tu peux le lire ») : dans le Marché, l'Emplacement finit avant que le Loyer ait lu Equimmox. Les autres
 * critères restent ceux lus ; `loyer` : { rue, ville } en €/m²/an, comme loyerDeLaRue.
 */
export function passageAvecLoyer(passage, loyer, modele = modeleParDefaut()) {
  if (!passage || !(loyer?.rue > 0 && loyer?.ville > 0)) return passage;
  const signaux = Object.fromEntries((passage.signaux || []).filter((x) => x.valeur != null).map((x) => [x.cle, { valeur: x.valeur, texte: x.texte }]));
  const nouveau = signauxPassage({ loyer }).loyer;
  if (!nouveau) return passage;
  return noteDuPassage({ ...signaux, loyer: nouveau }, modele);
}

/** Pure : la moyenne pondérée sur 10 des seuls critères lus. */
export function moyenneLue(modele, valeurs) {
  let somme = 0; let poids = 0;
  for (const { cle } of SIGNAUX) {
    const c = modele.coefs?.[cle] || 0;
    if (valeurs[cle] == null || !c) continue;
    somme += c * valeurs[cle]; poids += c;
  }
  return poids ? borne((somme / poids) * 10, 0, 10) : 0;
}

/** Pure : la note du passage et tout ce qui l'explique, ou pourquoi elle ne se donne pas. */
export function noteDuPassage(signaux, modele = modeleParDefaut()) {
  const lus = SIGNAUX.filter(({ cle }) => signaux?.[cle]);
  const liste = SIGNAUX.map(({ cle, nom }) => ({ cle, nom, valeur: signaux?.[cle]?.valeur ?? null, texte: signaux?.[cle]?.texte || null }));
  const base = {
    version: VERSION_PASSAGE, modele: modele.version, signaux: liste, lus: lus.length, sur: SIGNAUX.length,
    manque: SIGNAUX.filter(({ cle }) => !signaux?.[cle]).map(({ cle }) => cle),
    pourquoi: lus.map(({ cle }) => signaux[cle].texte),
    parts: Object.fromEntries(lus.map(({ cle }) => [cle, signaux[cle].valeur])),
  };
  if (lus.length < MINIMUM_LUS || !signaux?.commerces) {
    return { ...base, note: null, statut: 'vide', confiance: 'basse', raison: `Pas assez lu pour noter : ${lus.length} critère${lus.length > 1 ? 's' : ''} sur ${SIGNAUX.length}${!signaux?.commerces ? ', sans les commerces de la rue' : ''}.` };
  }
  // Les poids écrits à la main : la moyenne pondérée de ce qui a été lu (13 nov. 2026, Jules : « fais le max sans
  // Google ») ; un critère absent (les avis et la photo, tant que Google est suspendu) ne tire plus la note vers 5.
  // Un modèle appris des notes de l'équipe garde sa formule.
  const note = Math.round((modele.moyennePonderee ? moyenneLue(modele, valeursDe(signaux)) : predire(modele, valeursDe(signaux))) * 2) / 2;
  return { ...base, note, confiance: lus.length >= 6 ? 'haute' : lus.length >= 4 ? 'moyenne' : 'basse', statut: note >= 7 ? 'ok' : note >= 4.5 ? 'a_voir' : 'alerte' };
}

// --- Le modèle et son réglage ------------------------------------------------------------------------------------------

/** Les poids de départ, écrits à la main avec leur raison (passage-poids.json). */
export function modeleParDefaut() {
  const j = JSON.parse(fs.readFileSync(path.join(ICI, 'passage-poids.json'), 'utf8'));
  const total = SIGNAUX.reduce((t, { cle }) => t + (j.poids[cle] || 0), 0);
  return {
    version: j.version, constante: 0, moyennePonderee: true,
    coefs: Object.fromEntries(SIGNAUX.map(({ cle }) => [cle, arrondi((10 * (j.poids[cle] || 0)) / total, 3)])),
    moyennes: Object.fromEntries(SIGNAUX.map(({ cle }) => [cle, 0.5])),
    pourquoi: j.pourquoi,
  };
}

/** Le modèle en service : le dernier adopté, sinon celui de départ. */
export function modeleActif() {
  const r = Records.filter(MODELE, {}).filter((m) => m.actif).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
  return r ? { version: r.version, constante: r.constante, coefs: r.coefs, moyennes: r.moyennes, le: r.le, par: r.par, n: r.n } : modeleParDefaut();
}

/**
 * Pure : les poids qui collent le mieux aux notes de l'équipe. Moindres carrés, poids positifs, rappelés vers ceux en
 * service (`lambda`) pour ne pas tout jeter sur dix notes ; la constante est libre. Descente coordonnée.
 * `jugements` : [{ note, valeurs }].
 */
export function ajuster(jugements, depart, { lambda = 1.5, tours = 300 } = {}) {
  const n = jugements.length;
  const cles = SIGNAUX.map((s) => s.cle);
  const moyennes = Object.fromEntries(cles.map((k) => {
    const v = jugements.map((j) => j.valeurs?.[k]).filter((x) => x != null);
    return [k, v.length ? arrondi(v.reduce((a, b) => a + b, 0) / v.length, 3) : (depart.moyennes?.[k] ?? 0.5)];
  }));
  const X = jugements.map((j) => cles.map((k) => j.valeurs?.[k] ?? moyennes[k]));
  const y = jugements.map((j) => j.note);
  const b0 = cles.map((k) => depart.coefs?.[k] || 0);
  const b = [...b0];
  let c = depart.constante || 0;
  for (let t = 0; t < tours; t += 1) {
    c = y.reduce((s, yi, i) => s + yi - X[i].reduce((u, x, k) => u + b[k] * x, 0), 0) / n;
    for (let k = 0; k < cles.length; k += 1) {
      let num = lambda * b0[k]; let den = lambda;
      for (let i = 0; i < n; i += 1) {
        const reste = y[i] - c - X[i].reduce((u, x, m) => u + (m === k ? 0 : b[m] * x), 0);
        num += X[i][k] * reste; den += X[i][k] * X[i][k];
      }
      b[k] = Math.max(0, num / den);
    }
  }
  return { constante: arrondi(c, 3), coefs: Object.fromEntries(cles.map((k, i) => [k, arrondi(b[i], 3)])), moyennes };
}

/** Pure : l'écart moyen (en points sur 10) et le biais (positif : Klocka note trop haut) d'un modèle sur des jugements. */
export function ecarts(modele, jugements) {
  if (!jugements.length) return { ecart_moyen: null, biais: null };
  const d = jugements.map((j) => predire(modele, j.valeurs) - j.note);
  return { ecart_moyen: arrondi(d.reduce((s, x) => s + Math.abs(x), 0) / d.length, 1), biais: arrondi(d.reduce((s, x) => s + x, 0) / d.length, 1) };
}

/**
 * Pure : le réglage proposé et sa mesure honnête : chaque note est prédite par des poids appris sans elle (on la met de
 * côté), puis comparée à l'écart du modèle en service sur les mêmes notes.
 */
export function proposerReglage(jugements, actif) {
  if (jugements.length < MINIMUM_REGLAGE) return { pret: false, manque: MINIMUM_REGLAGE - jugements.length };
  const propose = ajuster(jugements, actif);
  const deCote = jugements.map((j, i) => {
    const sans = ajuster(jugements.filter((_, k) => k !== i), actif, { tours: 150 });
    return Math.abs(predire(sans, j.valeurs) - j.note);
  });
  // Ville par ville : les poids appris sans aucune note de la ville, essayés sur elle. C'est ce qui dit si le réglage
  // tient dans une ville qu'il n'a jamais vue (13 nov. 2026, Jules : « entraîner sur les villes que je connais, mais que
  // ça marche pour toutes les autres »).
  const villes = [...new Set(jugements.map((j) => j.ville).filter(Boolean))];
  const parVille = villes.length >= 2 ? villes.map((v) => {
    const ici = jugements.filter((j) => j.ville === v);
    const ailleurs = jugements.filter((j) => j.ville !== v);
    if (ici.length < 3 || ailleurs.length < MINIMUM_REGLAGE - 2) return null;
    const sans = ajuster(ailleurs, actif, { tours: 150 });
    return { ville: v, n: ici.length, ecart_actuel: ecarts(actif, ici).ecart_moyen, ecart_appris_ailleurs: ecarts(sans, ici).ecart_moyen };
  }).filter(Boolean) : [];
  return {
    pret: true, n: jugements.length, propose,
    actuel: ecarts(actif, jugements),
    ecart_propose: arrondi(deCote.reduce((s, x) => s + x, 0) / deCote.length, 1),
    par_ville: parVille,
  };
}

// --- Google : les avis autour d'un point -------------------------------------------------------------------------------

/** Les vingt lieux les plus suivis à `rayon` mètres et la somme de leurs avis Google. */
export async function avisAutour(point, { rayon = 100, cle = (process.env.GOOGLE_MAPS_SERVEUR || '').trim(), lire = fetch } = {}) {
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return { ok: false, error: 'point inconnu' };
  if (!cle) return { ok: false, error: "Google Maps n'est pas configuré (GOOGLE_MAPS_SERVEUR)" };
  const r = await lire('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle, 'X-Goog-FieldMask': 'places.displayName,places.userRatingCount,places.businessStatus' },
    body: JSON.stringify({ maxResultCount: 20, rankPreference: 'POPULARITY', languageCode: 'fr', regionCode: 'FR', locationRestriction: { circle: { center: { latitude: point.lat, longitude: point.lon }, radius: rayon } } }),
    signal: AbortSignal.timeout(12000),
  }).catch((e) => ({ ok: false, statusText: e?.message }));
  if (!r.ok) {
    const corps = typeof r.json === 'function' ? await r.json().catch(() => null) : null;
    const suspendu = corps?.error?.details?.some?.((d) => d.reason === 'CONSUMER_SUSPENDED');
    return { ok: false, error: suspendu ? 'le projet Google Cloud de la clé est suspendu' : `Google Places a répondu ${r.status || ''} ${r.statusText || ''}`.trim() };
  }
  const lieux = ((await r.json()).places || []).filter((p) => !p.businessStatus || p.businessStatus === 'OPERATIONAL');
  const top = lieux.map((p) => ({ nom: p.displayName?.text || '', avis: p.userRatingCount || 0 })).sort((a, b) => b.avis - a.avis);
  return { ok: true, somme: top.reduce((s, x) => s + x.avis, 0), lieux: top.length, top: top.slice(0, 5), recherches: 1 };
}

/** La référence d'une commune : les avis autour de sa rue la plus commerçante, gardés trente jours. */
export async function referenceDeLaCommune(codeInsee, tete, { lire = avisAutour } = {}) {
  if (!codeInsee || !tete?.centre) return null;
  const garde = Records.filter(REFERENCE, { code_insee: codeInsee }).filter((x) => x.voie === tete.voie && Date.now() - Date.parse(x.le) < REFERENCE_JOURS * 86400000)[0];
  if (garde) return { somme: garde.somme, rue: garde.rue };
  const a = await lire(tete.centre);
  if (!a.ok) return null;
  Records.create(REFERENCE, { code_insee: codeInsee, voie: tete.voie, rue: tete.nom, somme: a.somme, le: new Date().toISOString() });
  return { somme: a.somme, rue: tete.nom };
}

/** Le loyer de la rue et celui du kilomètre autour, d'une lecture Equimmox déjà faite (un an au plus) ; rien n'est relancé. */
export async function loyerDeLaRue(label) {
  const { derniereLectureConnue } = await import('../valeur-locative.js');
  const l = await derniereLectureConnue(label).catch(() => null);
  const m = (n) => (n?.moyenne > 0 ? n.moyenne : n?.basse != null && n?.haute != null ? (n.basse + n.haute) / 2 : null);
  const rue = m(l?.resultat?.rue); const ville = m(l?.resultat?.ville);
  return rue && ville ? { rue, ville } : null;
}

// --- Les jugements de l'équipe -----------------------------------------------------------------------------------------

/** Garde une note de l'équipe avec les critères figés du moment (page Passage, ou note de l'analyste sur la Rue). */
export function garderJugement({ note, commentaire = '', passage, adresse, ville = null, rue_id = null, candidat_id = null, origine = 'page' }, user = null) {
  const n = Math.max(0, Math.min(10, Math.round(Number(note) * 2) / 2));
  if (!Number.isFinite(n) || !passage?.signaux) return null;
  return Records.create(JUGEMENT, {
    adresse, ville, rue_id, candidat_id, origine, note: n, commentaire: String(commentaire || '').slice(0, 1200),
    note_klocka: passage.note ?? null, version: passage.version || null, modele: passage.modele || null,
    valeurs: Object.fromEntries(passage.signaux.map((s) => [s.cle, s.valeur])),
    par: user?.email || null, le: new Date().toISOString(),
  }, user?.email);
}

/** Les jugements qui servent au réglage : le dernier de chaque adresse, quel qu'en soit l'auteur. */
export function jugementsRetenus() {
  const parAdresse = new Map();
  for (const j of Records.filter(JUGEMENT, {}).sort((a, b) => String(a.le).localeCompare(String(b.le)))) parAdresse.set(String(j.adresse).toLowerCase(), j);
  return [...parAdresse.values()];
}

/** Le tableau de la page : les notes, l'écart du modèle en service, et le réglage proposé. */
export function tableauPassage() {
  const actif = modeleActif();
  const tous = jugementsRetenus().sort((a, b) => String(b.le).localeCompare(String(a.le)));
  const lignes = tous.map((j) => ({ id: j.id, adresse: j.adresse, note: j.note, note_klocka_alors: j.note_klocka, note_klocka: Math.round(predire(actif, j.valeurs) * 2) / 2, commentaire: j.commentaire, par: j.par, le: j.le, origine: j.origine }));
  const candidats = Records.filter(CANDIDAT, {});
  return {
    modele: { version: actif.version, le: actif.le || null, par: actif.par || null, coefs: actif.coefs, constante: actif.constante },
    lignes, ...ecarts(actif, tous),
    reglage: proposerReglage(tous, actif),
    file: { a_preparer: candidats.filter((c) => c.etat === 'a_preparer').length, prets: candidats.filter((c) => c.etat === 'pret').length, erreurs: candidats.filter((c) => c.etat === 'erreur').length, en_cours: PREPARATION.en_cours },
    signaux: SIGNAUX,
  };
}

/** Adopte le réglage proposé, recalculé ici sur les jugements du moment. */
export function adopterReglage(user = null) {
  const actif = modeleActif();
  const tous = jugementsRetenus();
  const r = proposerReglage(tous, actif);
  if (!r.pret) return { ok: false, error: `Il faut ${MINIMUM_REGLAGE} notes au moins (${tous.length} pour l'instant).` };
  for (const m of Records.filter(MODELE, {}).filter((x) => x.actif)) Records.update(MODELE, m.id, { actif: false });
  const le = new Date().toISOString();
  const version = `réglé sur ${tous.length} notes le ${new Date(le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  Records.create(MODELE, { ...r.propose, version, actif: true, n: tous.length, ecart_avant: r.actuel.ecart_moyen, ecart_mesure: r.ecart_propose, par: user?.email || null, le }, user?.email);
  return { ok: true, version };
}

// --- La file des adresses à juger ---------------------------------------------------------------------------------------

const cleAdresse = (a) => String(a || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Ajoute une adresse à juger, une fois. */
export function ajouterCandidat(adresse, { origine = 'ajoutee', ville = null, rang = null, lot = null } = {}, user = null) {
  const cle = cleAdresse(adresse);
  if (!cle) return null;
  const deja = Records.filter(CANDIDAT, { cle })[0];
  if (deja) return deja;
  return Records.create(CANDIDAT, { cle, adresse: String(adresse).trim(), origine, ville, rang, lot, etat: 'a_preparer', le: new Date().toISOString(), par: user?.email || null }, user?.email);
}

/**
 * Pure : des rues de toute la gamme d'une commune, pour ne pas juger que des rues fortes : la plus commerçante, puis
 * des rues aux trois quarts, à la moitié et au quart du classement, avec un numéro qui a un commerce ouvert.
 */
export function ruesDeLaGamme(rangs, { cibles = [0.98, 0.75, 0.5, 0.25] } = {}) {
  const rues = (rangs?.rues || []).filter((r) => r.exemple);
  if (rues.length < 4) return [];
  const triees = [...rues].sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || a.ouvertes - b.ouvertes);
  const vues = new Set();
  const choisies = [];
  for (const c of cibles) {
    const i = Math.min(triees.length - 1, Math.floor(c * triees.length));
    const r = triees[i];
    if (!r || vues.has(r.voie)) continue;
    vues.add(r.voie);
    choisies.push({ ...r, rang: c });
  }
  return choisies;
}

/** Pure : n rangs répartis du haut au bas du classement d'une ville (0,99 … 0,05). */
export const ciblesReparties = (n) => (n <= 1 ? [0.99] : Array.from({ length: n }, (_, i) => Math.round((0.99 - (i * 0.94) / (n - 1)) * 100) / 100));

/**
 * Propose des adresses à juger. Avec `villes` (des noms), un lot par appel : `parCommune` rues de toute la gamme dans
 * chaque ville, jugées avant le reste de la file. Sans, les communes déjà lues par l'outil Rue et les adresses des
 * dossiers.
 */
export async function proposerAdresses({ villes = null, parCommune = 4, lot = null } = {}, user = null) {
  const { registreDeLaCommune, rangsDeLaCommune } = await import('./rue.js');
  let communes = [];
  const erreurs = [];
  if (villes?.length) {
    const { communeDuNom } = await import('../adresse-ban.js');
    for (const v of villes) { const c = await communeDuNom(v).catch((e) => ({ ok: false, error: e?.message || String(e) })); if (c.ok) communes.push(c); else erreurs.push(c.error); }
  } else {
    communes = [...new Map(Records.filter('AnalyseRue', {}).map((x) => x.resultat?.adresse).filter((a) => a?.code_insee).map((a) => [a.code_insee, { code_insee: a.code_insee, ville: a.ville }])).values()].slice(0, 6);
  }
  const leLot = lot || (villes?.length ? communes.map((c) => c.ville).join(', ') : null);
  let ajoutees = 0;
  for (const c of communes) {
    const reg = await registreDeLaCommune(c.code_insee).catch((e) => ({ ok: false, error: e?.message || String(e) }));
    if (!reg?.ok) { erreurs.push(`${c.ville} : ${reg?.error || 'registre illisible'}`); continue; }
    const rangs = rangsDeLaCommune(reg.etablissements);
    for (const r of ruesDeLaGamme(rangs, { cibles: ciblesReparties(parCommune) })) {
      const a = `${r.exemple}`.includes(c.ville.toUpperCase()) ? r.exemple : `${r.exemple}, ${c.ville}`;
      if (!Records.filter(CANDIDAT, { cle: cleAdresse(a) })[0] && ajouterCandidat(a, { origine: 'gamme', ville: c.ville, rang: r.rang, lot: leLot }, user)) ajoutees += 1;
    }
  }
  if (!villes?.length) {
    // Les adresses déjà lues pour un dossier entrent aussi : ce sont de vrais cas.
    for (const x of Records.filter('AnalyseRue', {}).slice(-30)) {
      const a = x.resultat?.adresse?.label;
      if (a && !Records.filter(CANDIDAT, { cle: cleAdresse(a) })[0] && ajouterCandidat(a, { origine: 'analyse', ville: x.resultat.adresse.ville }, user)) ajoutees += 1;
    }
  }
  return { ok: true, ajoutees, communes: communes.map((c) => c.ville), lot: leLot, erreurs };
}

export const PREPARATION = { en_cours: false, faites: 0 };

/** Lit chaque adresse en attente avec l'outil Rue (une à la fois), en tâche de fond. */
export async function preparerCandidats({ analyser = null } = {}) {
  if (PREPARATION.en_cours) return { ok: true, deja: true };
  PREPARATION.en_cours = true; PREPARATION.faites = 0;
  const lire = analyser || (await import('./rue.js')).analyserRue;
  try {
    // Le dernier lot demandé se lit d'abord ; on relit la file à chaque tour, un lot peut arriver pendant la lecture.
    const dernierLot = () => Records.filter(CANDIDAT, {}).filter((x) => x.lot).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0]?.lot || null;
    for (;;) {
      const lot = dernierLot();
      const c = Records.filter(CANDIDAT, { etat: 'a_preparer' }).sort((a, b) => (a.lot === lot ? 0 : 1) - (b.lot === lot ? 0 : 1) || String(a.le).localeCompare(String(b.le)))[0];
      if (!c) break;
      const r = await lire(c.adresse).catch((e) => ({ ok: false, error: e?.message || String(e) }));
      if (r.ok) Records.update(CANDIDAT, c.id, { etat: 'pret', rue_id: r.id, adresse: r.resultat.adresse.label, prepare_le: new Date().toISOString() });
      else Records.update(CANDIDAT, c.id, { etat: 'erreur', erreur: r.error });
      PREPARATION.faites += 1;
    }
  } finally { PREPARATION.en_cours = false; }
  return { ok: true, faites: PREPARATION.faites };
}

/** La prochaine adresse à juger pour cette personne, sans la note de Klocka (on juge à l'aveugle). */
export async function prochaineAJuger(user, { sauf = [] } = {}) {
  const { lireAnalyse } = await import('./rue.js');
  const jugees = new Set(Records.filter(JUGEMENT, {}).filter((j) => j.par === (user?.email || null)).map((j) => cleAdresse(j.adresse)));
  const prets = Records.filter(CANDIDAT, { etat: 'pret' }).filter((c) => !jugees.has(cleAdresse(c.adresse)) && !sauf.includes(c.id));
  // Les villes et les rangs mêlés (un ordre tiré de l'identifiant, le même pour tous) : on ne juge pas la gamme dans l'ordre.
  const melange = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 1000003, 7);
  // Le dernier lot demandé passe devant le reste de la file.
  const dernier = Records.filter(CANDIDAT, {}).filter((x) => x.lot).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0]?.lot || null;
  prets.sort((a, b) => (a.lot === dernier ? 0 : 1) - (b.lot === dernier ? 0 : 1) || melange(a.id) - melange(b.id));
  const c = prets[0];
  if (!c) return { ok: true, reste: 0, candidat: null };
  const a = lireAnalyse(c.rue_id);
  const x = a.ok ? a.resultat : null;
  return {
    ok: true, reste: prets.length,
    candidat: {
      id: c.id, adresse: c.adresse, ville: x?.adresse?.ville || c.ville, lot: c.lot || null, photo_source: x?.street_view?.source || null, lat: x?.adresse?.lat ?? null, lon: x?.adresse?.lon ?? null,
      photos: x?.street_view?.photos || null, photo_date: x?.street_view?.date || null,
    },
  };
}

/** Enregistre la note de la personne sur une adresse de la file, et dévoile celle de Klocka. */
export async function jugerCandidat(id, { note, commentaire = '' }, user = null) {
  const { lireAnalyse } = await import('./rue.js');
  const c = Records.get(CANDIDAT, id);
  if (!c) return { ok: false, error: 'Adresse introuvable' };
  const a = lireAnalyse(c.rue_id);
  const passage = a.ok ? a.resultat.passage : null;
  if (!passage?.signaux) return { ok: false, error: "Cette adresse n'a pas été lue avec la nouvelle note." };
  const j = garderJugement({ note, commentaire, passage, adresse: c.adresse, ville: a.resultat?.adresse?.ville || c.ville, rue_id: c.rue_id, candidat_id: c.id, origine: 'page' }, user);
  if (!j) return { ok: false, error: 'Note invalide' };
  return { ok: true, jugement: { note: j.note, commentaire: j.commentaire }, klocka: { note: passage.note, raison: passage.raison || null, signaux: passage.signaux, confiance: passage.confiance } };
}
