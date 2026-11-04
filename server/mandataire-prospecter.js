// Prospecter pour ses clients (24 oct. 2026, Jules) : à gauche la carte du
// secteur du mandataire, à droite ses clients en carrousel, seulement ceux qui
// cherchent dans une ville de son secteur. « Prospecter » sur un client pose
// sur la carte quelques murs, pas des milliers : dans les villes du secteur
// qu'il cherche, autour de son budget, et seulement les commerces qui montrent
// des signaux de vente, dont on connaît le propriétaire et l'exploitant.

import { Records, Meta } from './db.js';
import { pourClient } from '../src/lib/clients-commerces.js';
import { texteDrapeau, enseigneVue, activiteVue } from './off-market/simple.js';

// Une cinquantaine de murs par ville (24 oct. 2026, Jules : « zoomer sur une ville montre ses 50 points »).
export const POINTS_MAX = 50;

// Le poids d'un signal pour le classement : ce qui dit « il vend bientôt » passe devant l'ancienneté.
const POIDS = { fonds_cede: 3, transmission: 3, ferme: 3, gerant_age: 2, detention_30: 2, detention_22: 1 };
export const forceDe = (drapeaux = []) => drapeaux.reduce((n, d) => n + (POIDS[d.cle] || 1), 0);

/**
 * Pure : le prix qui compte pour ce client. S'il exige un rendement et qu'on connaît le loyer, le prix qui le lui
 * donne (loyer ÷ rendement) : le prix estimé d'un commerce vient du taux de la ville, un client à 7 % n'aurait
 * sinon jamais rien à Lyon (6,5 %). Sinon le prix estimé. Null quand on ne sait pas.
 */
export function prixPourClient(estimation, d) {
  const loyer = estimation?.loyer_an;
  const moyenLoyer = loyer ? ((Number(loyer.basse) || 0) + (Number(loyer.haute) || 0)) / 2 : 0;
  const r = Number(d?.rendement_min) || 0;
  if (r > 0 && moyenLoyer > 0) {
    const cible = Math.round(moyenLoyer / (r / 100));
    return { basse: Math.round(cible * 0.9), moyenne: cible, haute: Math.round(cible * 1.1), au_rendement: r };
  }
  if (r > 0) return null;
  return estimation?.prix?.moyenne ? estimation.prix : null;
}

/** Pure : un point est-il un commerce ? Les bureaux et les entrepôts de l'Off-market restent à l'équipe (PLAN.md 0.4). */
export const estCommerce = (c) => (c?.classe || 'commerce') === 'commerce';

/**
 * Pure : les points d'un client parmi des commerces (les fiches complètes de l'Off-market). Gardés : un signal de
 * vente au moins, un propriétaire et un exploitant nommés, l'activité et les exclusions du client, et un prix connu
 * dans son budget (à 20 % près) quand il en a un. Les plus forts signaux d'abord, au plus `max`.
 */
export function pointsPourClient(commerces, d, { max = POINTS_MAX, centreDe = () => null, compacter = null, compte = null } = {}) {
  const budget = Number(d?.budget_max) || Number(d?.budget_min) || 0;
  // `compte` : où s'arrêtent les commerces, pour dire pourquoi un client n'a pas de mur (24 oct. 2026).
  const n = compte || {};
  for (const k of ['commerces', 'signal', 'connus', 'prix', 'criteres']) n[k] = n[k] || 0;
  const gardes = [];
  for (const c of commerces) {
    // Commerces seulement côté mandataire (31 oct. 2026, PLAN.md 0.4) : ni bureaux, ni entrepôts.
    if (!estCommerce(c)) continue;
    n.commerces += 1;
    const drapeaux = c.drapeaux || [];
    if (!drapeaux.length) continue;
    n.signal += 1;
    if (!c.proprietaire?.nom || !c.exploitant?.nom || c.lat == null || c.lon == null) continue;
    n.connus += 1;
    // Sans prix estimé, le mur reste (24 oct. 2026, Jules : « affiche toujours les points, dis juste prix à vérifier ») :
    // le budget ne trie que les murs dont on connaît le prix.
    const prix = prixPourClient(c.estimation, d);
    if (prix) n.prix += 1;
    // Le prix estimé n'est pas assez fiable pour écarter un mur (24 oct. 2026, Jules : « trop bas, surfaces douteuses ») :
    // il ne filtre plus, il range (ceux dans son budget d'abord) et il s'affiche comme indicatif.
    const vu = { classe: c.classe || 'commerce', activite: activiteVue(c), enseigne: enseigneVue(c), nom: c.exploitant?.nom || c.nom, nom_google: c.nom_google, chaine: !!c.chaine, centre: centreDe(c), prix: null };
    if (!pourClient(vu, d)) continue;
    n.criteres += 1;
    const max = Number(d?.budget_max) || 0, min = Number(d?.budget_min) || 0;
    const dansBudget = !prix || !(max || min) ? null : !((max && prix.basse > max * 1.2) || (min && prix.haute < min * 0.8));
    gardes.push({ c, prix, force: forceDe(drapeaux), dansBudget });
  }
  return gardes
    // Les plus forts signaux d'abord ; à force égale, un prix connu avant un prix à vérifier, puis le plus proche du budget.
    .sort((a, b) => b.force - a.force || b.c.drapeaux.length - a.c.drapeaux.length || Number(b.dansBudget === true) - Number(a.dansBudget === true) || Number(!!b.prix) - Number(!!a.prix) || Math.abs((a.prix?.moyenne || budget) - budget) - Math.abs((b.prix?.moyenne || budget) - budget))
    .slice(0, max)
    // La forme des commerces de l'Off-market (`compact`), pour le même tableau et les mêmes filtres ; le prix est
    // celui qui compte pour ce client, le prix estimé reste à côté.
    .map(({ c, prix, force, dansBudget }) => ({
      ...(compacter ? compacter(c) : { id: c.id, lat: c.lat, lon: c.lon, ville_id: c.ville_id, classe: c.classe || 'commerce', activite: c.activite || null, adresse: c.adresse || null, proprietaire: c.proprietaire.nom, nom: c.exploitant.nom, drapeaux: c.drapeaux.map((x) => x.cle) }),
      titre: enseigneVue(c) || c.exploitant?.nom || c.nom,
      exploitant: c.exploitant.nom,
      signaux: c.drapeaux.map((x) => texteDrapeau(x.texte)), force, prix, prix_estime: c.estimation?.prix || null, prix_a_verifier: !prix, dans_budget: dansBudget,
    }));
}

/**
 * Pure : pourquoi un client n'a aucun mur, dit à la première marche où tout s'arrête : pas de ville lue, pas de signal,
 * propriétaire ou exploitant inconnus, pas de prix estimé, ou rien dans son budget et ses critères.
 */
export function pourquoiVide(n = {}, d = {}, villes = []) {
  const ou = villes.map((v) => v.nom).join(', ');
  if (!villes.length) return "Il ne cherche dans aucune des villes choisies de votre secteur.";
  if (!n.commerces) return `Les commerces de ${ou} ne sont pas encore lus : ils arrivent en fond, revenez dans un moment.`;
  if (!n.signal) return `Aucun des ${n.commerces} commerces de ${ou} ne montre encore de signal de vente.`;
  if (!n.connus) return `${n.signal} commerces de ${ou} ont un signal de vente, mais leur propriétaire ou leur exploitant n'est pas encore connu (la recherche continue en fond).`;
  return `${n.connus} commerces ont un signal et un propriétaire connus, mais aucun ne répond à ses critères (activité, exclusions, emplacement) ou à son budget.`;
}

/** Les villes du secteur qu'un client cherche (toutes s'il ne dit pas de zone). */
async function villesDuClient(d, villes, geos = new Map()) {
  const { geoDe, zoneCouvre } = await import('./mandataire-agent.js');
  const zones = (d.zones || []).filter((z) => !/toute la france|^france$/i.test(z));
  if (!zones.length) return villes;
  const out = [];
  for (const v of villes) {
    // Le département et la région d'une ville, lus une fois par appel (l'API Géo, quand la ville ne les garde pas).
    if (!geos.has(v.nom)) geos.set(v.nom, await geoDe(v.nom));
    const lieu = { ville: v.nom, ...geos.get(v.nom) };
    if (zones.some((z) => zoneCouvre(z, lieu))) out.push(v);
  }
  return out;
}

/** Les commerces lus d'une ville, et qui est dans le centre commerçant (pour « emplacement n°1 »). Gardés le temps d'un appel. */
async function commercesDeLaVille(v, cache = null) {
  if (cache?.has(v.id)) return cache.get(v.id);
  const r = await lireCommerces(v);
  cache?.set(v.id, r);
  return r;
}
// Une lecture partagée une minute (3 nov. 2026, Jules : « Votre secteur et vos clients, c'est super long ») : la page
// lance ensemble les clients et la carte, qui décodaient chacun les mêmes 25 000 commerces (2 à 6 s chacun).
// Gardée cinq minutes même si un commerce change (3 nov. 2026) : la recherche des propriétaires en fond en modifie sans
// cesse, et chaque modification relançait le décodage et le centre-ville de toute la ville (8 à 10 s).
const CINQ_MINUTES = 5 * 60_000;
const lectures = new Map(); // ville_id → { sig, le, p }
// Le centre-ville d'une ville, gardé six heures (3 nov. 2026, Jules : « ça prend beaucoup trop longtemps pour charger les
// points d'un client ») : 1 à 5 s par ville, et il ne bouge pas quand un propriétaire est trouvé. Un commerce arrivé
// entre-temps n'y est pas : il compte hors du centre jusqu'au calcul suivant.
const SIX_HEURES = 6 * 60 * 60_000;
const centres = new Map(); // ville_id → { le, zone }
export async function lireCommerces(v) {
  const sig = Records.signature('CommerceSimple');
  const deja = lectures.get(v.id);
  if (deja && (deja.sig === sig || Date.now() - deja.le < CINQ_MINUTES)) return deja.p;
  const p = (async () => {
    const { centreVille } = await import('./off-market/simple.js');
    const liste = Records.filter('CommerceSimple', { ville_id: v.id });
    const garde = centres.get(v.id);
    const zone = garde && Date.now() - garde.le < SIX_HEURES ? garde.zone : centreVille(liste, Records.get('Ville', v.id));
    if (zone !== garde?.zone) centres.set(v.id, { le: Date.now(), zone });
    return { liste, zone, centreDe: (c) => (zone?.centre ? zone.centre.has(c.id) : null) };
  })();
  lectures.set(v.id, { sig, le: Date.now(), p });
  setTimeout(() => { if (lectures.get(v.id)?.p === p) lectures.delete(v.id); }, CINQ_MINUTES).unref?.();
  p.catch(() => lectures.delete(v.id));
  return p;
}

/** Les points d'un client dans les villes données. */
async function pointsDans(d, villes, cache = null, moi = null, compte = null) {
  const { compact } = await import('./off-market/simple.js');
  // Qui tient chaque commerce (24 oct. 2026) : un point pris par un autre mandataire ne s'affiche pas ; le mien porte
  // sa fiche (noir sur la carte une fois dans Biens).
  const { teneurs } = await import('./fiche-mandataire.js');
  const tenus = teneurs(Records.list('ProprietaireMandataire'), moi);
  const tous = [];
  for (const v of villes) {
    await new Promise((r) => setImmediate(r));
    const { liste, zone, centreDe } = await commercesDeLaVille(v, cache);
    const libres = liste.filter((c) => { const t = tenus.get(c.id); return !t || t.a_moi; });
    const compacter = (c) => compact(c, { ...(zone || {}), moi });
    tous.push(...pointsPourClient(libres, d, { centreDe, compacter, compte, max: POINTS_MAX }).map((p) => {
      const t = tenus.get(p.id);
      return { ...p, ville: v.nom, fiche: t ? { id: t.id, dans_biens: t.dans_biens, statut: t.statut } : null };
    }));
  }
  return tous.sort((a, b) => b.force - a.force);
}

const emailDe = (u) => String(u?.email || '').toLowerCase();
const nz = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Les villes où il prospecte « pour mes clients » : celles que Klocka a choisies pour son secteur (24 oct. 2026), et
 * seulement elles. `fiches` : les fiches Ville qui existent, avec leur centre ; `toutes` : chacune avec son état.
 */
export async function villesDuMandataire(secteur, { etats = true } = {}) {
  const { villesDuSecteurMandataire, etatVille, preparation } = await import('./villes-secteur.js');
  const villes = Records.list('Ville');
  // Les villes cochées pour le secteur, et les Villes Klocka de son contour (30 oct. 2026).
  const toutes = (await villesDuSecteurMandataire(secteur)).map((v) => {
    const f = villes.find((x) => (v.code && x.code_insee === v.code) || nz(x.nom) === nz(v.nom)) || null;
    return { choisie: v, fiche: f?.centre?.lat != null ? f : null };
  });
  return {
    // Le code INSEE sert aux murs libres (3 nov. 2026) : le recensement des vitrines se fait par commune.
    fiches: toutes.filter((x) => x.fiche).map((x) => ({ id: x.fiche.id, nom: x.fiche.nom, centre: x.fiche.centre, code_insee: x.fiche.code_insee || x.choisie.code || null })),
    // L'état de chaque ville (lecture, propriétaires, prix) : l'écran des clients seulement, pas la carte d'un client.
    toutes: !etats ? [] : await Promise.all(toutes.map(async (x) => ({ id: x.fiche?.id || x.choisie.code || x.choisie.nom, nom: x.choisie.nom, centre: x.fiche?.centre || null, etat: x.fiche ? etatVille(x.fiche) : 'a_lire', preparation: x.fiche ? await preparation(x.fiche) : { en_cours: true } }))),
  };
}

// Les clients déjà prospectés par un mandataire (25 oct. 2026, Jules : « on doit les voir au lieu de cliquer sur
// Prospecter ») : l'id du client et le jour de sa dernière prospection, gardés par mandataire.
const clePropectes = (user) => `mandataire.prospectes:${emailDe(user)}`;
export function prospectes(user) {
  try { const x = JSON.parse(Meta.get(clePropectes(user)) || '{}'); return x && typeof x === 'object' ? x : {}; } catch { return {}; }
}
export function noterProspecte(user, demandeId, n) {
  if (!emailDe(user) || !demandeId) return;
  Meta.set(clePropectes(user), JSON.stringify({ ...prospectes(user), [demandeId]: { le: new Date().toISOString(), n } }));
}

/** Le secteur du mandataire et ses clients qui cherchent dedans, chacun avec ses villes et son nombre de points. */
export async function prospecter(user) {
  const E = await import('./mandataire-espace.js');
  await E.synchroniserSiVieux().catch(() => {});
  const secteur = E.secteurDe(user);
  if (!secteur) return { secteur: null, villes: [], clients: [] };
  const { fiches: villes, toutes } = await villesDuMandataire(secteur);
  const clients = [];
  const deja = prospectes(user);
  const cache = new Map();
  const geos = new Map();
  for (const d of E.demandesVisibles({ avecTest: E.voitTest(user) })) {
    const siennes = await villesDuClient(d, villes, geos);
    if (!siennes.length) continue;
    const points = await pointsDans(d, siennes, cache, emailDe(user));
    clients.push({ ...d, villes: siennes.map((v) => ({ id: v.id, nom: v.nom })), n: points.length, dans_ma_liste: points.filter((p) => p.fiche).length, prospecte_le: deja[d.id]?.le || null });
  }
  clients.sort((a, b) => b.n - a.n);
  return {
    secteur: { id: secteur.id, nom: secteur.nom, teinte: secteur.teinte || null, motif: secteur.motif ?? 0, polygones: E.anneauxSecteur(secteur) },
    villes: toutes,
    clients,
  };
}

/**
 * Pure : le point d'un commerce sans client en tête (« tous les commerces » du secteur, 25 oct. 2026, Jules) : la même
 * forme que celle d'un point pour un client, sans budget ni critères (`dans_budget` vaut null), son prix estimé tel quel.
 */
export function pointDuSecteur(c, base, ville) {
  const drapeaux = c.drapeaux || [];
  return {
    ...base,
    titre: enseigneVue(c) || c.exploitant?.nom || c.nom,
    exploitant: c.exploitant?.nom || null,
    signaux: drapeaux.map((x) => texteDrapeau(x.texte)), force: forceDe(drapeaux),
    prix: c.estimation?.prix || null, prix_estime: c.estimation?.prix || null, prix_a_verifier: !c.estimation?.prix, dans_budget: null,
    ville,
  };
}

// Ce que l'écran lit d'un point de tout le secteur : la carte, les filtres, la recherche et le tableau. Le reste (adresse
// brute, siret, textes des signaux…) vient avec la fiche, au clic.
const CHAMPS_LEGERS = ['id', 'force', 'classe', 'lien', 'activite', 'drapeaux', 'fonds', 'bureaux', 'ca', 'resultat', 'proprietaire', 'proprietaire_type', 'depuis', 'chaine', 'liste', 'adresse', 'centre', 'zone', 'titre', 'nom', 'ville', 'prix', 'reponse', 'fiche'];
/**
 * Pure : un point de tout le secteur, allégé (26 oct. 2026 : 74 000 points, 62 Mo en entier). Les valeurs vides
 * disparaissent, sauf `centre` à faux (le filtre d'emplacement le lit) ; la position est arrondie au mètre.
 */
export function leger(p) {
  const out = { lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5 };
  for (const k of CHAMPS_LEGERS) {
    const v = p[k];
    if (v == null || v === '' || (v === false && k !== 'centre') || (Array.isArray(v) && !v.length && k !== 'drapeaux')) continue;
    if (k === 'classe' && v === 'commerce') continue;
    if (k === 'nom' && v === p.titre) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Tous les commerces du secteur, sans client (25 oct. 2026, Jules : le client est un filtre, pas une vue) : ceux des
 * villes choisies par Klocka, avec position, les plus forts signaux d'abord, puis ceux dont on connaît le propriétaire.
 * Tous, sans plafond (26 oct. 2026, Jules : « voir tous les commerces de la ville, ne rien manquer ») : Lyon seul en a
 * plus de 10 000, la carte les dessine sur un canevas. Ceux qu'un autre mandataire tient ne s'affichent pas.
 */
export async function pointsDuSecteur(user, { max = Infinity, classe = 'commerce' } = {}) {
  const E = await import('./mandataire-espace.js');
  const secteur = E.secteurDe(user);
  if (!secteur) return { ok: false, error: 'Aucun secteur pour vous : Klocka vous en attribue un.' };
  const { compact } = await import('./off-market/simple.js');
  const { teneurs } = await import('./fiche-mandataire.js');
  const moi = emailDe(user);
  const tenus = teneurs(Records.list('ProprietaireMandataire'), moi);
  const { fiches, toutes } = await villesDuMandataire(secteur);
  const points = [];
  let lus = 0;
  for (const v of fiches) {
    // Une ville à la fois, et la main rendue entre deux (30 oct. 2026) : décoder des milliers de commerces d'un bloc
    // figeait le serveur pour tout le monde pendant une dizaine de secondes.
    await new Promise((r) => setImmediate(r));
    const { liste, zone } = await lireCommerces(v);
    for (const c of liste) {
      lus += 1;
      const t = tenus.get(c.id);
      // Les bureaux à part (3 nov. 2026, Jules : « trois types d'actifs, Fonds, Murs et Bureaux ») : `classe` choisit.
      if ((t && !t.a_moi) || c.lat == null || c.lon == null || (c.classe || 'commerce') !== classe) continue;
      points.push(leger({ ...pointDuSecteur(c, compact(c, { ...(zone || {}), moi }), v.nom), fiche: t ? { id: t.id, dans_biens: t.dans_biens, statut: t.statut } : null }));
    }
  }
  points.sort((a, b) => b.force - a.force || Number(!!b.proprietaire) - Number(!!a.proprietaire) || String(a.titre || '').localeCompare(String(b.titre || ''), 'fr'));
  return {
    ok: true, villes: fiches.map((v) => v.nom), points: points.slice(0, max), total: points.length, prospecte_le: null,
    compte: { commerces: lus }, pourquoi_vide: points.length ? null : (toutes.length ? 'Les commerces de votre secteur ne sont pas encore lus : ils arrivent en fond, revenez dans un moment.' : "Klocka n'a pas encore choisi les villes de votre secteur."),
  };
}

// --- Le cache des vues du secteur (30 oct. 2026, Jules : « côté mandataire c'est super long ») ----------------------
// `pointsDuSecteur` décode les dizaines de milliers de commerces des villes du secteur (11 à 13 s) et rend 26 Mo de
// JSON ; `prospecter` refait le même travail client par client. Le résultat est gardé par mandataire, la carte
// compressée (5 Mo au lieu de 26). Une fiche de mandataire qui bouge (un commerce mis dans une liste, un bien) le
// recalcule aussitôt ; des commerces qui changent pendant une lecture en fond, au plus toutes les cinq minutes.

const UNE_HEURE = 60 * 60_000;
const caches = new Map(); // `${vue}:${email}` → { le, fiches, donnees, valeur }
const enCalcul = new Map();

// Des fiches, seul compte ce que lit `teneurs` (qui tient quel commerce, son statut) (1er nov. 2026, Jules : « les fiches
// en mode terrain, c'est super long ») : une parole notée, un historique, un champ corrigé changeaient la signature de
// toute la table et relançaient ces calculs de plusieurs secondes, qui retenaient les autres requêtes du serveur.
let tenueGardee = { brute: null, valeur: '' };
export function signatureDesTenues(fiches) {
  let h = 0;
  const lignes = fiches.filter((p) => p.commerce_simple_id).map((p) => `${p.id}:${p.commerce_simple_id}:${p.mandataire_email || ''}:${p.statut || ''}:${p.test || p.essai_bien ? 1 : 0}`).sort();
  for (const l of lignes) for (let i = 0; i < l.length; i++) h = (h * 31 + l.charCodeAt(i)) | 0;
  return `${lignes.length}:${h}`;
}
function tenues() {
  const brute = Records.signature('ProprietaireMandataire');
  if (tenueGardee.brute !== brute) tenueGardee = { brute, valeur: signatureDesTenues(Records.list('ProprietaireMandataire')) };
  return tenueGardee.valeur;
}

const signatures = () => ({
  // La liste des Villes Klocka compte aussi : une ville ajoutée entre dans « Mon secteur » tout de suite.
  fiches: `${tenues()}|${Records.signature('SecteurMandataire')}|${Records.signature('DemandeClient')}|${Meta.get('villes-klocka') || ''}`,
  donnees: `${Records.signature('CommerceSimple')}|${Records.signature('Ville')}`,
});

/** Pure : un résultat gardé est-il encore bon ? */
export function encoreBon(garde, sig, maintenant = Date.now()) {
  if (!garde) return false;
  if (garde.fiches !== sig.fiches) return false;
  if (maintenant - garde.le > UNE_HEURE) return false;
  return garde.donnees === sig.donnees || maintenant - garde.le < CINQ_MINUTES;
}

async function enCache(vue, user, calculer) {
  const cle = `${vue}:${emailDe(user)}`;
  const sig = signatures();
  const garde = caches.get(cle);
  if (encoreBon(garde, sig)) return garde.valeur;
  if (enCalcul.has(cle)) return enCalcul.get(cle);
  const p = (async () => {
    const valeur = await calculer();
    caches.set(cle, { le: Date.now(), ...sig, valeur });
    // Borné : un mandataire de plus chasse le plus ancien, la mémoire du serveur ne grossit pas avec eux.
    while (caches.size > 12) caches.delete(caches.keys().next().value);
    return valeur;
  })().finally(() => enCalcul.delete(cle));
  enCalcul.set(cle, p);
  return p;
}

/** La carte du secteur, compressée une fois : `{ ok, gzip }` ou `{ ok: false, error }`. */
export async function pointsDuSecteurCompresses(user) {
  return enCache('tous', user, async () => {
    const r = await pointsDuSecteur(user);
    if (!r.ok) return r;
    const { gzipSync } = await import('zlib');
    const gzip = gzipSync(Buffer.from(JSON.stringify(r)));
    try { Meta.set(carteSurDisque(user), gzip.toString('base64')); } catch { /* le cache en mémoire suffit */ }
    return { ok: true, gzip, total: r.total };
  });
}

/**
 * Pure : les bureaux regroupés par immeuble (même position au mètre près). Le point garde l'occupant le plus parlant
 * (le plus de signaux, puis un propriétaire connu) pour sa fiche ; il porte le nombre d'occupants, leurs noms (les trois
 * premiers) et l'union de leurs signaux.
 */
export function parImmeuble(points) {
  const groupes = new Map();
  for (const p of points) {
    const k = `${Number(p.lat).toFixed(5)},${Number(p.lon).toFixed(5)}`;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(p);
  }
  return [...groupes.values()].map((g) => {
    const tri = [...g].sort((a, b) => (b.bureaux?.length || 0) - (a.bureaux?.length || 0) || Number(!!b.proprietaire) - Number(!!a.proprietaire));
    const base = tri[0];
    const signaux = [...new Set(g.flatMap((p) => p.bureaux || []))];
    return {
      ...base,
      titre: g.length > 1 ? (base.adresse || base.titre) : base.titre,
      occupants: g.length,
      noms: g.slice(0, 3).map((p) => p.titre || p.nom).filter(Boolean),
      bureaux: signaux,
      proprietaire: base.proprietaire || g.find((p) => p.proprietaire)?.proprietaire || null,
      fiche: base.fiche || g.find((p) => p.fiche)?.fiche || null,
    };
  }).sort((a, b) => (b.bureaux?.length || 0) - (a.bureaux?.length || 0) || b.occupants - a.occupants);
}

/** Les bureaux du secteur (3 nov. 2026, Jules), compressés et gardés comme la carte des commerces. */
export async function bureauxDuSecteur(user) {
  return enCache('bureaux', user, async () => {
    const r = await pointsDuSecteur(user, { classe: 'bureau' });
    if (!r.ok) return r;
    // Un point par immeuble (3 nov. 2026, Jules : « un immeuble où sont domiciliées dix sociétés est un immeuble de
    // bureaux ») : les établissements à la même position (SIRENE la donne par adresse) se regroupent.
    r.points = parImmeuble(r.points);
    r.total = r.points.length;
    if (!r.points.length) r.pourquoi_vide = 'Aucun bureau recensé dans les villes de votre secteur pour l’instant.';
    const { gzipSync } = await import('zlib');
    const gzip = gzipSync(Buffer.from(JSON.stringify(r)));
    try { Meta.set(bureauxSurDisque(user), gzip.toString('base64')); } catch { /* le cache en mémoire suffit */ }
    return { ok: true, gzip, total: r.total };
  });
}

/**
 * Les bureaux tout de suite (3 nov. 2026, Jules : « pourquoi je ne vois pas les bureaux ? ») : comme la carte des
 * commerces, le dernier calcul gardé (mémoire, sinon disque) sert pendant que le suivant se fait ; le calcul (dix
 * secondes à Lyon) se prépare au démarrage avec les secteurs.
 */
const bureauxSurDisque = (user) => `mandataire.bureaux.v2:${emailDe(user)}`;
export async function bureauxDuSecteurVite(user) {
  const garde = caches.get(`bureaux:${emailDe(user)}`);
  if (encoreBon(garde, signatures())) return garde.valeur;
  const calcul = bureauxDuSecteur(user);
  if (garde?.valeur?.ok) { calcul.catch(() => {}); return garde.valeur; }
  try {
    const b = Meta.get(bureauxSurDisque(user));
    if (b) { calcul.catch(() => {}); return { ok: true, gzip: Buffer.from(b, 'base64') }; }
  } catch { /* on attend le calcul */ }
  return calcul;
}

/**
 * La carte tout de suite (3 nov. 2026, Jules) : la dernière gardée, même un peu vieille (en mémoire, sinon sur disque,
 * 2 Mo compressés), et le calcul relancé en fond ; on n'attend le calcul que la toute première fois.
 */
// v2 (3 nov. 2026) : les points portent les raisons de céder le fonds ; une carte gardée avant n'en a pas.
const carteSurDisque = (user) => `mandataire.carte.v2:${emailDe(user)}`;
export async function pointsDuSecteurVite(user) {
  const garde = caches.get(`tous:${emailDe(user)}`);
  if (encoreBon(garde, signatures())) return garde.valeur;
  const calcul = pointsDuSecteurCompresses(user);
  if (garde?.valeur?.ok) { calcul.catch(() => {}); return garde.valeur; }
  try {
    const b = Meta.get(carteSurDisque(user));
    if (b) { calcul.catch(() => {}); return { ok: true, gzip: Buffer.from(b, 'base64') }; }
  } catch { /* on attend le calcul */ }
  return calcul;
}

/**
 * `prospecter`, gardé de même (le résultat est petit, le calcul est long), et sur disque (1er nov. 2026, Jules : « ça
 * charge trop longtemps Votre secteur et vos clients ») : un redémarrage du serveur ne fait plus attendre le calcul.
 */
const surDisque = (user) => `mandataire.prospecter:${emailDe(user)}`;
export async function prospecterEnCache(user) {
  // Les clients synchronisés avant de lire la signature : sinon la synchro, faite pendant le calcul, la change, et le
  // résultat gardé naît déjà périmé (un second calcul de plus après chaque synchro).
  await (await import('./mandataire-espace.js')).synchroniserSiVieux().catch(() => {});
  return enCache('clients', user, async () => {
    const r = await prospecter(user);
    try { Meta.set(surDisque(user), JSON.stringify(r)); } catch { /* le cache en mémoire suffit */ }
    return r;
  });
}

/**
 * Sans attendre (1er nov. 2026, page Clients) : le dernier résultat gardé, même un peu vieux (en mémoire, sinon sur
 * disque), et le calcul relancé en fond s'il ne l'est plus ; null la toute première fois (l'écran dit « calcul »).
 */
export function prospecterSansAttendre(user) {
  const garde = caches.get(`clients:${emailDe(user)}`);
  if (!encoreBon(garde, signatures())) prospecterEnCache(user).catch(() => {});
  if (garde?.valeur) return garde.valeur;
  try { return JSON.parse(Meta.get(surDisque(user)) || 'null'); } catch { return null; }
}

/** Pour l'écran de la Prospection : le dernier résultat tout de suite ; `a_jour` faux dit qu'il se recalcule en fond. */
export async function prospecterVite(user) {
  const garde = caches.get(`clients:${emailDe(user)}`);
  if (encoreBon(garde, signatures())) return { ...garde.valeur, a_jour: true };
  const vieux = prospecterSansAttendre(user);
  if (vieux) return { ...vieux, a_jour: false };
  return { ...(await prospecterEnCache(user)), a_jour: true };
}

/**
 * Prêt avant la première ouverture (3 nov. 2026, Jules : « super rapide même à la première ouverture ») : pour chaque
 * secteur attribué, les clients et la carte se calculent en fond, une fois, puis de nouveau quand le secteur bouge
 * (redessiné, réattribué, ses communes relues). Ensuite, une ouverture sert le dernier calcul et le refait en fond.
 */
const clePrete = (email) => `mandataire.prospection-prete.v2:${email}`;
let enPreparation = false;
export async function preparerLesSecteurs() {
  if (enPreparation) return 0;
  enPreparation = true;
  let n = 0;
  try {
    for (const s of Records.list('SecteurMandataire').filter((x) => x.mandataire_email)) {
      const email = String(s.mandataire_email).toLowerCase();
      // Une carte encore vide (les villes d'un secteur neuf se lisent en fond) se refait au tour suivant.
      let prete = null;
      try { prete = JSON.parse(Meta.get(clePrete(email)) || 'null'); } catch { /* à refaire */ }
      // `bureaux` absent : une carte préparée avant les bureaux (3 nov. 2026), refaite une fois pour eux.
      if (prete?.points && prete.bureaux != null && prete.le >= (s.updated_date || '')) continue;
      // Le vrai compte : l'équipe voit aussi les clients de test, et le résultat est gardé par adresse.
      const user = Records.findBy('User', 'email', email) || { email, role: 'mandataire' };
      try {
        await prospecterEnCache(user);
        const carte = await pointsDuSecteurCompresses(user);
        const bureaux = await bureauxDuSecteur(user);
        Meta.set(clePrete(email), JSON.stringify({ le: new Date().toISOString(), points: carte.total || 0, bureaux: bureaux.total || 0 }));
        n += 1;
      } catch (e) { console.warn(`[prospection] ${email} : ${e?.message || e}`); }
    }
  } finally { enPreparation = false; }
  return n;
}

/** Pour les tests et après un changement de secteur : tout se recalcule. */
export const oublierCaches = () => { caches.clear(); };

/** Les points d'un client, pour la carte. Un client qui ne cherche pas dans le secteur n'en a pas. */
export async function pointsDuClient(user, demandeId, { noter = false } = {}) {
  const E = await import('./mandataire-espace.js');
  const secteur = E.secteurDe(user);
  if (!secteur) return { ok: false, error: 'Aucun secteur pour vous : Klocka vous en attribue un.' };
  const d = E.demandesVisibles({ avecTest: E.voitTest(user) }).find((x) => x.id === demandeId);
  if (!d) return { ok: false, error: 'Client introuvable.' };
  const villes = await villesDuClient(d, (await villesDuMandataire(secteur, { etats: false })).fiches);
  const compte = {};
  const points = await pointsDans(d, villes, null, String(user?.email || '').toLowerCase(), compte);
  // Des cibles sans prix : l'estimation repart dans ses villes, les cibles d'abord (le plafond du jour tient).
  if (compte.connus > compte.prix && !process.env.NODE_TEST_CONTEXT) {
    const { demarrerPrix } = await import('./off-market/simple.js');
    for (const v of villes) demarrerPrix(v.id);
  }
  // Seul le geste « Prospecter » date la prospection (25 oct. 2026, Jules) : revoir un client ne la refait pas.
  if (noter) noterProspecte(user, d.id, points.length);
  return { ok: true, villes: villes.map((v) => v.nom), points, compte, prospecte_le: prospectes(user)[d.id]?.le || null, pourquoi_vide: points.length ? null : pourquoiVide(compte, d, villes) };
}
