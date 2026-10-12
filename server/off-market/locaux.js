// Off-market : les locaux et les propriétaires, lus dans ce que la plateforme
// a déjà relevé (les vitrines d'une ville, le cadastre des personnes morales,
// le registre des entreprises, le BODACC, le DVF), présentés comme la spec le
// demande : un Local, son Occupant, son Propriétaire, ses Mutations, ses
// Signaux, chaque fait avec sa source et sa date.
//
// Rien n'est copié : un local est une vue sur un relevé (`Cible`), calculée à
// la lecture. Les scores sont purs (scores.js) ; la demande des investisseurs
// vient de Monday, gardée dix minutes.

import { Records } from '../db.js';
import { classer, profilDe, capaciteADecider, profilFiscal, rendementImplicite, detentionDe, moisLisible, moisDepuis } from './scores.js';
import { rapidesDe } from '../../src/lib/off-market-filtres.js';

const CIBLE = 'Cible';
const VILLE = 'Ville';
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Les territoires : les villes dont les vitrines ont été lues
// ---------------------------------------------------------------------------

/** Les villes lues, avec le nombre de locaux de chacune. */
/** Pure : l'avancement d'une lecture, ce que l'écran en montre. */
export function lectureDe(v) {
  const p = v?.parcours;
  if (!p) return null;
  return { etat: p.etat, phase: p.phase, rue_en_cours: p.rue_en_cours || null, rues_total: p.rues_total || 0, rues_faites: p.rues_faites || 0, commerces_trouves: p.commerces_trouves || 0, cibles_creees: p.cibles_creees || 0, demarre_le: p.demarre_le || null, fini_le: p.fini_le || null, par: p.par || null };
}

/** Les villes lues, et celles qu'on est en train de lire (même sans local encore). */
export function territoires() {
  const comptes = {};
  for (const c of Records.champs(CIBLE, ['ville_id'])) comptes[c.ville_id] = (comptes[c.ville_id] || 0) + 1;
  return Records.list(VILLE)
    .filter((v) => !v.cachee && (comptes[v.id] || v.parcours?.etat === 'en_cours'))
    .map((v) => ({ id: v.id, nom: v.nom, code_postal: v.code_postal || null, code_insee: v.code_insee || null, departement: String(v.code_postal || '').slice(0, 2) || null, centre: v.centre || null, locaux: comptes[v.id] || 0, lecture: lectureDe(v) }))
    .sort((a, b) => b.locaux - a.locaux);
}

/** Les territoires d'un compte : tout pour l'équipe, les villes du secteur pour un mandataire. */
export async function territoiresDe(user) {
  const tous = territoires();
  if (user?.role === 'admin') return tous;
  const { secteurDe, villesDuSecteur } = await import('../mandataire-espace.js');
  // Les villes de son secteur, et celles qu'il a lancées lui-même.
  const s = secteurDe(user);
  const ids = new Set(s ? villesDuSecteur(s).map((v) => v.id) : []);
  const email = String(user?.email || '').toLowerCase();
  for (const v of Records.list(VILLE)) if (email && String(v.cree_par || '').toLowerCase() === email) ids.add(v.id);
  return tous.filter((v) => ids.has(v.id));
}

// ---------------------------------------------------------------------------
// La demande des investisseurs : combien de mandats correspondent à un local
// ---------------------------------------------------------------------------

let cacheClients = { le: 0, valeur: null };
/** Les clients investisseurs actifs (Monday), gardés dix minutes ; vide sans Monday. */
export async function clientsActifs() {
  if (Date.now() - cacheClients.le < 10 * 60000 && cacheClients.valeur) return cacheClients.valeur;
  let clients = [];
  try { const C = await import('../alx/clients.js'); clients = C.clientsConfigure() ? await C.clientsActifs() : []; } catch { clients = []; }
  cacheClients = { le: Date.now(), valeur: clients };
  return clients;
}
export const oublierClients = () => { cacheClients = { le: 0, valeur: null }; };

/**
 * Pure : les mandats qui correspondent à un local : la zone cherchée contient
 * la ville ou le département, et le budget encadre la valeur estimée (à 20 %
 * près) quand on la connaît.
 */
export function demandePour(local, clients = []) {
  if (!Array.isArray(clients) || !clients.length) return null;
  const ville = norm(local.ville);
  const dept = String(local.code_postal || '').slice(0, 2);
  const r = rendementImplicite(local);
  return clients.filter((c) => {
    const zone = norm(c.lieu_recherche);
    // Un mandat sans zone ne correspond à rien : sinon chaque local « a une demande ».
    const zoneOk = !!zone && ((ville && zone.includes(ville)) || (dept && new RegExp(`(^|\\D)${dept}(\\D|$)`).test(zone)) || /france|partout|national/.test(zone));
    const budgetOk = !c.budget || !r?.valeur || (c.budget >= r.valeur * 0.8);
    return zoneOk && budgetOk;
  // `cible` : le mandat nomme la ville, le département ou la région ; un mandat « toute France » compte dans le fit, pas dans la liste rapide « Demande cliente ».
  }).map((c) => ({ id: c.id, nom: c.nom, budget: c.budget || null, zone: c.lieu_recherche || null, objectif: c.objectif || null, cible: !/france|partout|national/i.test(norm(c.lieu_recherche)) }));
}

// ---------------------------------------------------------------------------
// Un local : la vue, avec ses sources
// ---------------------------------------------------------------------------

const villesMemo = new Map();
const villeDe = (id) => { if (!villesMemo.has(id)) villesMemo.set(id, Records.get(VILLE, id)); return villesMemo.get(id); };
export const oublierVilles = () => villesMemo.clear();

/** Pure : la confiance qu'on a dans le propriétaire relevé. */
export function confianceProprietaire(c) {
  const p = c.proprietaire || null;
  if (!p?.nom) return { niveau: 'inconnu', libelle: 'Propriétaire inconnu' };
  if (c.foncier?.adresse_non_confirmee) return { niveau: 'a_confirmer', libelle: 'À confirmer : adresse non confirmée' };
  if (p.siren && /foncier|dgfip|cadastre/i.test(String(p.source || ''))) return { niveau: 'exacte', libelle: 'Exacte : cadastre des personnes morales' };
  if (p.siren) return { niveau: 'probable', libelle: `Probable : ${p.source || 'source non dite'}` };
  return { niveau: 'a_confirmer', libelle: 'À confirmer : nom sans SIREN' };
}

/** Pure : la source d'un propriétaire, dite avec les mots de la spec. */
const sourceLisible = (s) => String(s || '').replace(/Data-B · Foncier/i, 'Cadastre des personnes morales (DGFiP), via Data-B').replace(/^DGFiP.*/i, 'Cadastre des personnes morales (DGFiP)');

/**
 * Le local d'un relevé, compact (pour la carte et les listes) ou complet (la
 * fiche). `ctx` : { clients, maintenant, contacts } pour la demande et le suivi.
 */
/**
 * Pure : l'occupant d'un relevé, quelle que soit la forme du relevé. Les villes
 * lues avant octobre 2026 portent un objet `occupant` (siren, chaîne, fermé) ;
 * les suivantes un `siret` à la racine et un drapeau `proprietaire_occupant`.
 */
export function occupantDe(c) {
  const o = c.occupant || {};
  const siret = o.siret || c.siret || null;
  return { ...o, siret, siren: o.siren || (siret ? String(siret).slice(0, 9) : null), nom: o.nom || null };
}

/** Pure : le foncier, avec le drapeau propriétaire-occupant quelle que soit sa place dans le relevé. */
export function foncierDe(c) {
  return { ...(c.foncier || {}), occupant_proprietaire: !!(c.foncier?.occupant_proprietaire || c.proprietaire_occupant) };
}

/** Pure : depuis combien d'années le propriétaire détient le local, si on le sait. */
export function detentionAnnees(base, maintenant = Date.now()) {
  const d = detentionDe(base);
  const m = d?.depuis ? moisDepuis(d.depuis, maintenant) : null;
  // Au-delà de 90 ans, c'est une date de création par défaut (1900), pas une détention.
  return m == null || m > 90 * 12 ? null : Math.floor(m / 12);
}

/** Pure : la tranche d'âge du gérant le plus âgé ('70+', '50-70', '-50'), ou null. */
export function trancheGerant(societe) {
  const g = (societe?.gerants || []).filter((x) => !x.personne_morale);
  if (g.some((x) => x.tranche_age === '70+')) return '70+';
  if (g.some((x) => x.tranche_age === '50-70')) return '50-70';
  if (g.some((x) => x.tranche_age === '-50')) return '-50';
  return null;
}

export function localDe(c, { complet = false, clients = null, maintenant = Date.now(), contact = null } = {}) {
  const v = villeDe(c.ville_id);
  const occupant = occupantDe(c);
  const foncier = foncierDe(c);
  const base = { ...c, occupant, foncier, ville: c.ville || v?.nom || null, code_postal: v?.code_postal || null, profil: profilDe({ proprietaire: c.proprietaire, societe: c.societe, occupant, foncier }) };
  const demande = clients ? demandePour(base, clients) : null;
  const k = classer(base, { maintenant, demande: demande ? demande.length : null });
  const confiance = confianceProprietaire(c);
  const compact = {
    id: c.id, ville_id: c.ville_id, ville: base.ville, rue: c.rue || null, adresse: c.adresse, lat: c.lat ?? null, lon: c.lon ?? null, emplacement: c.emplacement ?? null,
    enseigne: c.enseigne || null, activite: c.activite || null, occupe: c.occupe !== false,
    proprietaire: c.proprietaire?.nom ? { nom: c.proprietaire.nom, siren: c.proprietaire.siren || null, forme: c.proprietaire.forme || c.societe?.forme || null, cle: cleProprietaire(c) } : null,
    profil: k.profil, confiance: confiance.niveau,
    motivation: k.motivation.total, fit: k.fit.total, rang: k.rang, exclu: k.exclu,
    signaux: k.signaux.filter((s) => s.compte !== false && s.points > 0).map((s) => s.cle), familles: k.motivation.familles,
    drapeaux: k.drapeaux.map((d) => d.cle),
    suivi: contact ? { statut: contact.statut, oppose: !!contact.oppose, dernier_le: contact.interactions?.at(-1)?.le || null } : null,
    // Ce que les filtres et la carte de bien lisent sans ouvrir la fiche.
    parcelle: c.proprietaire?.parcelle || c.foncier?.parcelle || null,
    detention_annees: detentionAnnees(base, maintenant),
    gerant_tranche: trancheGerant(c.societe),
    demande_n: demande ? demande.filter((d) => d.cible).length : 0,
    mutation: c.mutation?.date ? { date: String(c.mutation.date).slice(0, 10), prix: c.mutation.prix ?? null, du_local: !!c.mutation.du_local } : null,
    valeur: c.valorisation?.fourchette ? Math.round((c.valorisation.fourchette[0] + c.valorisation.fourchette[1]) / 2) : null,
    rendement: rendementImplicite(base)?.rendement ?? null,
    surface: c.valorisation?.surface_estimee ? Math.round((c.valorisation.surface_estimee[0] + c.valorisation.surface_estimee[1]) / 2) : null,
    murs: 1,
  };
  compact.rapides = rapidesDe(compact);
  if (!complet) return compact;
  const s = c.societe || {};
  const det = detentionDe(base);
  const r = rendementImplicite(base);
  return {
    ...compact,
    explication: k.motivation.explication,
    signaux_detail: k.signaux,
    motivation_detail: k.motivation,
    fit_detail: k.fit,
    drapeaux_detail: k.drapeaux,
    local: {
      parcelle: c.proprietaire?.parcelle || c.foncier?.parcelle || null,
      lots: (c.proprietaire?.lots || []).map((l) => ({ etage: l.etage, batiment: l.batiment, porte: l.porte, droit: l.droit })),
      surface_estimee: c.valorisation?.surface_estimee || null, surface_source: c.valorisation?.estimee_detail || null,
      copropriete: (c.foncier?.proprietaires || []).length > 1,
      photo: c.photo || null,
      sources: { parcelle: c.proprietaire?.source ? sourceLisible(c.proprietaire.source) : null, surface: c.valorisation?.batiment?.source || null },
    },
    occupant: { enseigne: c.enseigne || null, activite: c.activite || null, siret: occupant.siret, siren: occupant.siren, chaine: !!occupant.chaine, ferme: !!occupant.ferme, actif: c.occupe !== false, source: 'Lecture de la vitrine, registre des entreprises', lu_le: occupant.lu_le || c.updated_date || null },
    bail: { echeance: c.bail_echeance || null, source: c.bail_source || null, loyer_m2: c.loyer_m2_bail || null, cession: (c.evenements_locataire || []).filter((e) => /cession/i.test(e.type || '')).map((e) => ({ date: e.date, detail: e.detail, source: e.source })), procedures: (c.evenements_locataire || []).filter((e) => /proc|conciliation/i.test(e.type || '')).map((e) => ({ date: e.date, type: e.type, source: e.source })) },
    proprietaire_detail: c.proprietaire?.nom ? {
      nom: c.proprietaire.nom, siren: c.proprietaire.siren || null, forme: c.proprietaire.forme || s.forme || null, droit: (c.proprietaire.lots || []).map((l) => l.droit).filter((x, i, t) => t.indexOf(x) === i),
      depuis: det ? { date: det.depuis, source: det.source } : null,
      source: sourceLisible(c.proprietaire.source), trouve_le: c.proprietaire.trouve_le || null, confiance,
      societe: s.siren ? { ape: s.ape || null, creation: s.creation || null, active: s.active !== false, siege: s.siege?.adresse || null, siege_ville: s.siege?.ville || null, effectif: s.effectif || null, etablissements: s.nombre_etablissements || null, comptes_deposes: !!s.comptes_deposes, source: 'Registre des entreprises (API Recherche d\'entreprises)', lu_le: s.lu_le || null } : null,
      gerants: (s.gerants || []).map((g) => ({ nom: g.nom, qualite: g.qualite || null, tranche_age: g.tranche_age || null, personne_morale: !!g.personne_morale })),
      capacite: capaciteADecider(base),
      fiscal: profilFiscal(base, maintenant),
    } : null,
    mutations: [c.mutation, c.mutation_voisine].filter(Boolean).map((m) => ({ date: m.date, prix: m.prix || null, surface: m.surface || null, du_local: !!m.du_local, parcelle: m.parcelle || null, distance_m: m.distance_m ?? null, type: m.type_local || null, source: m.source || 'DVF' })),
    marche: { loyer_m2: c.valorisation?.loyer_m2_marche || null, loyer_fourchette: c.valorisation?.loyer_fourchette || null, loyer_source: c.valorisation?.loyer_source || null, fourchette: c.valorisation?.fourchette || null, rendement: r, rue_flux: v?.rues?.find((x) => x.nom === c.rue)?.flux_estime || null },
    evenements: [...(c.evenements || []).map((e) => ({ ...e, qui: 'propriétaire' })), ...(c.evenements_locataire || []).map((e) => ({ ...e, qui: 'locataire' }))].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    demande: demande || [],
    contact: contact || null,
  };
}

/** Pure : la clé d'un propriétaire : son SIREN, sinon son nom. */
export const cleProprietaire = (c) => (c.proprietaire?.siren ? String(c.proprietaire.siren) : c.proprietaire?.nom ? `nom:${norm(c.proprietaire.nom)}` : null);

/** Les relevés d'un territoire, ou de plusieurs. */
export const relevesDe = (villeIds) => villeIds.flatMap((id) => Records.filter(CIBLE, { ville_id: id }));

/**
 * Les locaux d'un ou plusieurs territoires, compacts et classés (rang
 * décroissant). `contacts` : le suivi par propriétaire, pour dire « contacté ».
 */
export async function listerLocaux(villeIds, { contacts = new Map(), maintenant = Date.now() } = {}) {
  const clients = await clientsActifs();
  const locaux = relevesDe(villeIds).map((c) => localDe(c, { clients, maintenant, contact: contacts.get(cleProprietaire(c)) || null }));
  // La taille du portefeuille : combien de ces locaux le même propriétaire détient.
  const parProprietaire = new Map();
  for (const l of locaux) if (l.proprietaire?.cle) parProprietaire.set(l.proprietaire.cle, (parProprietaire.get(l.proprietaire.cle) || 0) + 1);
  for (const l of locaux) if (l.proprietaire?.cle) { l.murs = parProprietaire.get(l.proprietaire.cle); l.rapides = rapidesDe(l); }
  return locaux.sort((a, b) => b.rang - a.rang || b.motivation - a.motivation);
}

/** La fiche d'un local. */
export async function ficheLocal(id, { contact = null, maintenant = Date.now() } = {}) {
  const c = Records.get(CIBLE, id);
  if (!c) return null;
  return localDe(c, { complet: true, clients: await clientsActifs(), maintenant, contact });
}

// ---------------------------------------------------------------------------
// Un propriétaire : tout ce qu'il détient, qui décide, par quel canal
// ---------------------------------------------------------------------------

/** Les relevés d'un propriétaire (sa clé), dans toutes les villes lues. */
export function relevesDuProprietaire(cle) {
  if (/^\d{9}$/.test(String(cle))) {
    const ids = Records.champs(CIBLE, ['proprietaire.siren']).filter((x) => String(x['proprietaire.siren'] || '') === String(cle)).map((x) => x.id);
    return ids.map((id) => Records.get(CIBLE, id)).filter(Boolean);
  }
  return Records.list(CIBLE).filter((c) => cleProprietaire(c) === cle);
}

/**
 * La fiche d'un propriétaire : identité, profil, dirigeants, patrimoine (tous
 * ses locaux lus, toutes villes), chronologie, capacité à décider, profil
 * fiscal, demande cliente, et le suivi.
 */
export async function ficheProprietaire(cle, { contact = null, villesVisibles = null, maintenant = Date.now() } = {}) {
  const releves = relevesDuProprietaire(cle);
  if (!releves.length) return null;
  const clients = await clientsActifs();
  const locaux = releves.map((c) => localDe(c, { clients, maintenant })).sort((a, b) => b.rang - a.rang);
  const ref = releves.find((c) => c.societe?.siren) || releves[0];
  const s = ref.societe || {};
  const profil = profilDe({ proprietaire: ref.proprietaire, societe: s, occupant: occupantDe(ref), foncier: foncierDe(ref), murs: releves.length });
  const base = { ...ref, profil };
  const evenements = [];
  const vus = new Set();
  for (const c of releves) for (const e of c.evenements || []) { const k = `${e.date}|${e.type}`; if (!vus.has(k)) { vus.add(k); evenements.push(e); } }
  const mutations = releves.filter((c) => c.mutation?.du_local).map((c) => ({ date: c.mutation.date, prix: c.mutation.prix, adresse: c.adresse, ville: c.ville }));
  const chrono = [
    ...(s.creation ? [{ date: s.creation, quoi: 'Création de la société', source: 'Registre des entreprises' }] : []),
    ...mutations.map((m) => ({ date: m.date, quoi: `Acquisition : ${m.adresse}, ${m.ville}${m.prix ? ` (${Number(m.prix).toLocaleString('fr-FR')} €)` : ''}`, source: 'DVF' })),
    ...evenements.map((e) => ({ date: e.date, quoi: `${e.type}${e.detail ? ` · ${e.detail}` : ''}`, source: e.source || 'BODACC' })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const villes = [...new Set(locaux.map((l) => l.ville).filter(Boolean))];
  const hors = villesVisibles ? locaux.filter((l) => !villesVisibles.has(l.ville_id)).length : 0;
  const demande = demandePour({ ...base, ville: locaux[0]?.ville }, clients) || [];
  const meilleure = locaux[0] || null;
  return {
    cle, siren: ref.proprietaire?.siren || null, nom: ref.proprietaire?.nom || s.nom || null, forme: ref.proprietaire?.forme || s.forme || null,
    profil, confiance: confianceProprietaire(ref),
    identite: s.siren ? { ape: s.ape || null, creation: s.creation || null, active: s.active !== false, fermee_le: s.fermee_le || null, siege: s.siege?.adresse || null, siege_ville: s.siege?.ville || null, effectif: s.effectif || null, etablissements: s.nombre_etablissements || null, comptes_deposes: !!s.comptes_deposes, source: 'Registre des entreprises', lu_le: s.lu_le || null } : null,
    gerants: (s.gerants || []).map((g) => ({ nom: g.nom, qualite: g.qualite || null, tranche_age: g.tranche_age || null, personne_morale: !!g.personne_morale })),
    capacite: capaciteADecider(base),
    fiscal: profilFiscal(base, maintenant),
    patrimoine: { locaux, total: locaux.length, villes, hors_territoire: hors, valeur_estimee: locaux.reduce((t, l) => { const c = releves.find((x) => x.id === l.id); const f = c?.valorisation?.fourchette; return t + (Array.isArray(f) && f[0] && f[1] ? (f[0] + f[1]) / 2 : 0); }, 0) || null },
    chronologie: chrono,
    motivation: meilleure ? { total: Math.max(...locaux.map((l) => l.motivation)), explication: localDe(releves.find((c) => c.id === meilleure.id), { complet: true, clients, maintenant }).explication } : null,
    demande,
    contact: { adresse_siege: s.siege?.adresse || null, canal: profil.canal, telephone: ref.dirigeant_telephone || ref.murs_telephone || null, email: ref.proprietaire?.email || null, site: s.site || null },
    suivi: contact || null,
  };
}

export { moisLisible };
