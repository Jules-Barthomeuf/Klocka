// Prospecter pour ses clients (24 oct. 2026, Jules) : à gauche la carte du
// secteur du mandataire, à droite ses clients en carrousel, seulement ceux qui
// cherchent dans une ville de son secteur. « Prospecter » sur un client pose
// sur la carte quelques murs, pas des milliers : dans les villes du secteur
// qu'il cherche, autour de son budget, et seulement les commerces qui montrent
// des signaux de vente, dont on connaît le propriétaire et l'exploitant.

import { Records, Meta } from './db.js';
import { pourClient } from '../src/lib/clients-commerces.js';
import { texteDrapeau } from './off-market/simple.js';

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
    const vu = { activite: c.activite, enseigne: c.enseigne, nom: c.exploitant?.nom || c.nom, nom_google: c.nom_google, chaine: !!c.chaine, centre: centreDe(c), prix: null };
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
      ...(compacter ? compacter(c) : { id: c.id, lat: c.lat, lon: c.lon, ville_id: c.ville_id, activite: c.activite || null, adresse: c.adresse || null, proprietaire: c.proprietaire.nom, nom: c.exploitant.nom, drapeaux: c.drapeaux.map((x) => x.cle) }),
      titre: c.enseigne || c.exploitant?.nom || c.nom,
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
async function lireCommerces(v) {
  const { centreVille } = await import('./off-market/simple.js');
  const liste = Records.filter('CommerceSimple', { ville_id: v.id });
  const zone = centreVille(liste, Records.get('Ville', v.id));
  return { liste, zone, centreDe: (c) => (zone?.centre ? zone.centre.has(c.id) : null) };
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
async function villesDuMandataire(secteur) {
  const { villesChoisies, etatVille, preparation } = await import('./villes-secteur.js');
  const villes = Records.list('Ville');
  const toutes = villesChoisies(secteur).map((v) => {
    const f = villes.find((x) => (v.code && x.code_insee === v.code) || nz(x.nom) === nz(v.nom)) || null;
    return { choisie: v, fiche: f?.centre?.lat != null ? f : null };
  });
  return {
    fiches: toutes.filter((x) => x.fiche).map((x) => ({ id: x.fiche.id, nom: x.fiche.nom, centre: x.fiche.centre })),
    toutes: await Promise.all(toutes.map(async (x) => ({ id: x.fiche?.id || x.choisie.code || x.choisie.nom, nom: x.choisie.nom, centre: x.fiche?.centre || null, etat: x.fiche ? etatVille(x.fiche) : 'a_lire', preparation: x.fiche ? await preparation(x.fiche) : { en_cours: true } }))),
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
  for (const d of E.demandesVisibles()) {
    const siennes = await villesDuClient(d, villes, geos);
    if (!siennes.length) continue;
    const points = await pointsDans(d, siennes, cache, emailDe(user));
    clients.push({ ...d, villes: siennes.map((v) => ({ id: v.id, nom: v.nom })), n: points.length, prospecte_le: deja[d.id]?.le || null });
  }
  clients.sort((a, b) => b.n - a.n);
  return {
    secteur: { id: secteur.id, nom: secteur.nom, teinte: secteur.teinte || null, motif: secteur.motif ?? 0, polygones: E.anneauxSecteur(secteur) },
    villes: toutes,
    clients,
  };
}

/** Les points d'un client, pour la carte. Un client qui ne cherche pas dans le secteur n'en a pas. */
export async function pointsDuClient(user, demandeId, { noter = false } = {}) {
  const E = await import('./mandataire-espace.js');
  const secteur = E.secteurDe(user);
  if (!secteur) return { ok: false, error: 'Aucun secteur pour vous : Klocka vous en attribue un.' };
  const d = E.demandesVisibles().find((x) => x.id === demandeId);
  if (!d) return { ok: false, error: 'Client introuvable.' };
  const villes = await villesDuClient(d, (await villesDuMandataire(secteur)).fiches);
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
