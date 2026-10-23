// L'agent IA de la prospection des agents immobiliers (page Prospection,
// onglets Agent IA et Listes). On lui donne une ville ; il y cherche toutes
// les agences immobilières et range ce qu'il trouve dans la liste de la
// ville, partagée par toute l'équipe (une liste Nice, une liste Lyon…). Une
// ville relancée complète sa liste, sans doublon.
//
//   1. Google Maps la recherche « agence immobilière » dans la ville, comme
//                  on la ferait sur Maps : nom, adresse, téléphone et site de
//                  la fiche. Le téléphone et le site ne viennent que de là
//                  quand Maps les donne (5 oct. 2026 : un site déduit du mail
//                  d'un agent envoyait « Berge Immobilier » chez CBRE) ;
//   2. Data-B      les établissements « Immobilier » de la commune : SIRET,
//                  mail, et les agences sans fiche Maps (une prospective) ;
//   3. l'annuaire  des entreprises, par SIREN : le gérant, la création,
//                  l'effectif (gratuit) ;
//   4. Equimmox    les agents qui publient des annonces dans la ville, avec
//                  leur mail et leur téléphone, rattachés à leur agence par
//                  son nom, sinon par le domaine de son site ; un agent d'une
//                  agence inconnue fait naître la sienne, sans site.
//
// Rien ne part vers une agence : « Au carnet » la fait entrer dans la
// prospection (le carnet des agents, la liste du jour, Monday), d'un clic.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from '../db.js';
import { norm, normEmail, normTel, telAffiche } from './regles.js';
import * as MA from './mode-appel.js';
import { reseauDe, nomPersonne, estEnNomPropre, estUnePersonne, retrouverMandataire, telephoneAGarder, lireCollage, RESEAUX, clePersonne } from './mandataires.js';
import { ANALYSTES } from '../fil-dossier.js';

const LISTE = 'ListeAgences';
const AGENCE = 'AgenceProspect';
const METIER_IMMOBILIER = '59';
// Le métier « Immobilier » de Data-B mêle syndics, gestion locative,
// promoteurs, marchands de biens et SCI : on ne garde que le code NAF des
// agences immobilières (68.31Z), où sont aussi les agents indépendants.
export const NAF_AGENCES = '6831Z';
/** Pure : une ligne Data-B est-elle une agence immobilière (ou un agent indépendant) ? */
export const estAgence = (d) => String(d?.ape || '').replace(/[.\s]/g, '').toUpperCase() === NAF_AGENCES;
// Les annonceurs qu'Equimmox ne connaît pas, et les portails qui masquent les mails : pas des agences.
const PAS_UNE_AGENCE = /^(annonceur inconnu|particulier|locopro|contact[- ]manager|leboncoin|seloger|bureauxlocaux|logic[- ]immo|bien ici|pap)$/i;
const JOURNAL_MAX = 40;
const maintenant = () => new Date().toISOString();
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const casse = (t) => String(t || '').toLowerCase().replace(/(^|[\s'’(-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).trim();

// Les mots qui ne disent rien d'une agence, pour la reconnaître par son nom.
const VIDES = new Set(['agence', 'immobilier', 'immobiliere', 'immo', 'sarl', 'sas', 'sasu', 'eurl', 'sa', 'sci', 'groupe', 'cabinet', 'transaction', 'transactions', 'conseil', 'conseils', 'et', 'de', 'des', 'du', 'la', 'le', 'les', 'l', 'd']);
/** Pure : la clé d'un nom d'agence (« Agence Century 21 Cce SARL » → « century 21 cce »). */
export const cleAgence = (nom) => norm(nom).split(' ').filter((m) => m && !VIDES.has(m)).join(' ');

// « Yasmina Zabar - Arthur Loyd » (12 oct. 2026, analystes : « est-ce la même agence ? ») : Equimmox nomme
// l'annonce d'un agent « Prénom Nom - Agence ». La partie gauche est une personne si elle a deux ou trois mots
// à majuscule, sans chiffre ni mot d'agence, et n'est pas un réseau au nom de personne (Guy Hoquet, Stéphane Plaza).
const MOT_D_AGENCE = /\b(immo\w*|agence|conseil|transactions?|groupe|cabinet|r[ée]seau|patrimoine|entreprises?|commerces?|bureaux|expertise|gestion|sarl|sas|sci|conciergerie|location|services?|signature|propri[ée]t[ée]s?|house|home|riviera|habitat|invest\w*)\b/i;
const RESEAUX_AU_NOM = /^(guy hoquet|st[ée]phane plaza)$/i;
const estPersonne = (x) => { const mots = x.split(' '); return mots.length >= 2 && mots.length <= 3 && mots.every((m) => /^[A-ZÀ-Ý][a-zà-ÿ'’-]{1,}$/.test(m)) && !MOT_D_AGENCE.test(x) && !RESEAUX_AU_NOM.test(x); };
/** Pure : l'agence et l'agent d'un libellé d'annonce Equimmox. L'agence est la dernière partie, l'agent celle d'avant ; `ville` écarte « Ft Riviera - Nice Massena ». */
export function agenceDuLibelle(libelle, { ville = null } = {}) {
  const t = String(libelle || '').replace(/\s+/g, ' ').trim();
  const parts = t.split(/\s+[-–—]\s+/);
  if (parts.length < 2) return { agence: t, agent: null };
  const droite = parts.at(-1);
  const gauche = parts.at(-2);
  const motsVille = new Set(cleAgence(ville || '').split(' ').filter((m) => m.length >= 3));
  const surLaVille = [droite, gauche].some((x) => cleAgence(x).split(' ').some((m) => motsVille.has(m)));
  return estPersonne(gauche) && !surLaVille && cleAgence(droite).length >= 3 ? { agence: droite.trim(), agent: gauche.trim() } : { agence: t, agent: null };
}
/** Pure : le domaine d'un site ou d'un mail, sans les messageries grand public. */
export function domaineDe(x) {
  const d = String(x || '').toLowerCase().replace(/^.*@/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].trim();
  return !d || /^(gmail|hotmail|yahoo|outlook|orange|free|sfr|wanadoo|laposte|icloud|live|neuf|bbox|aol)\./.test(d) ? null : d;
}

// --- Un agent est-il bien de cette agence ? ---------------------------------
//
// Une annonce Equimmox porte parfois plusieurs agents et plusieurs agences
// (un co-mandat) : rangé sous le nom d'agence le plus fréquent, un agent de
// Coldwell Banker finissait chez Azurea (6 oct. 2026). Le mail tranche : un
// domaine professionnel doit être celui de l'agence.

/** Pure : le domaine sans ses sous-domaines (« immobilier.cbre.fr » → « cbre.fr »). */
export const domaineRacine = (d) => (d ? String(d).split('.').slice(-2).join('.') : null);

/** Pure : les domaines connus d'une agence (son site, son mail), sans sous-domaine. */
export function domainesAgence(a) {
  return new Set([domaineDe(a?.site), domaineDe(a?.email), domaineDe(a?.site_mail)].filter(Boolean).map(domaineRacine));
}

/** Pure : les mots qui nomment une agence, sans ceux de sa ville (« Cbre Nice » → « cbre »). */
const motsDuNom = (nom, ville = null) => {
  const villeMots = new Set(cleAgence(ville || '').split(' ').filter(Boolean));
  return cleAgence(nom).split(' ').filter((m) => m.length > 3 && !villeMots.has(m));
};

/**
 * Pure : le domaine nomme-t-il l'agence ? « azurea-commerces.com » pour
 * « Azurea Commerces & Entreprises », « cbre.fr » pour « CBRE - Nice ».
 */
export function domaineDuNom(domaine, nom, ville = null) {
  const etiquette = String(domaineRacine(domaine) || '').split('.').slice(0, -1).join('').replace(/[^a-z0-9]/g, '');
  if (!etiquette) return false;
  return motsDuNom(nom, ville).some((m) => etiquette.includes(m.replace(/[^a-z0-9]/g, '')));
}

/**
 * Pure : l'agent va-t-il dans cette agence ? Un mail professionnel doit être
 * au domaine de l'agence (ou à un domaine qui porte son nom). Un mail grand
 * public (Gmail…) ne va que dans une agence sans domaine connu : chez une
 * agence qui a le sien, c'est un particulier ou un indépendant d'ailleurs. Un
 * agent sans mail, connu par son seul numéro, n'a rien qui le contredise.
 */
export function agentVaAvec(agent, agence, ville = null) {
  if (!agent?.email) return true;
  const dom = domaineRacine(domaineDe(agent.email));
  const connus = domainesAgence(agence);
  if (!dom) return connus.size === 0;
  return connus.has(dom) || domaineDuNom(dom, agence?.nom, ville);
}

/** Pure : l'agence de la liste dont le domaine est celui de l'agent, ou null. */
export function agenceDuDomaine(agent, agences, ville = null) {
  const dom = domaineRacine(domaineDe(agent?.email));
  if (!dom) return null;
  return agences.find((x) => domainesAgence(x).has(dom)) || agences.find((x) => domaineDuNom(dom, x.nom, ville)) || null;
}

/** Pure : un dirigeant de l'annuaire en prénom et nom (« Clémence Marie-Claude … Colacicco (Colacicco) » → « Clémence Colacicco »). */
export function nomCourt(g) {
  const nom = String(g?.nom || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const famille = String(g?.nom_famille || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!famille || !nom.toLowerCase().endsWith(famille.toLowerCase())) return casse(nom);
  const prenom = nom.slice(0, nom.length - famille.length).trim().split(' ')[0];
  return casse([prenom, famille].filter(Boolean).join(' '));
}

/** Pure : « jean.dupont@century21.fr » → « Jean Dupont » ; « contact@… » → rien. */
export function nomDuMail(email) {
  const local = String(email || '').split('@')[0].toLowerCase();
  const mots = local.split(/[._-]+/).filter((m) => /^[a-zà-ÿ]{2,}$/.test(m));
  if (mots.length < 2 || mots.some((m) => /^(contact|agence|info|accueil|transaction|immo|immobilier|location|vente|gestion|bureau|direction|commercial|negociation)$/.test(m))) return null;
  return casse(mots.slice(0, 3).join(' '));
}

// --- Les listes -------------------------------------------------------------

function noter(liste, texte, ton = 'info') {
  const l = Records.get(LISTE, liste.id);
  Records.update(LISTE, liste.id, { journal: [{ le: maintenant(), texte, ton }, ...(l?.journal || [])].slice(0, JOURNAL_MAX) });
}

// Une ligne écartée (pas une agence) reste en base, cachée de la liste.
const agencesDe = (listeId, { toutes = false } = {}) => Records.list(AGENCE).filter((a) => a.liste_id === listeId && (toutes || !a.hors_cible));

function resumeListe(l) {
  const a = agencesDe(l.id);
  return {
    id: l.id, ville: l.ville, type: l.type || 'agences', etat: l.etat, etape: l.etape || null, lancee_par: l.lancee_par || null, lancee_le: l.lancee_le || null, fini_le: l.fini_le || null,
    agences: a.length, agences_seules: a.filter((x) => MA.genreDe(x) === 'agence').length, avec_telephone: a.filter((x) => x.telephone).length, agents: a.reduce((n, x) => n + (x.agents || []).length, 0),
    au_carnet: a.filter((x) => x.carnet_id).length, deja_monday: a.filter((x) => x.monday_connu).length, journal: (l.journal || []).slice(0, 12),
  };
}

// La liste du mode essai (agences fictives) n'apparaît pas parmi les villes.
export const listes = () => Records.list(LISTE).filter((l) => !l.essai).sort((a, b) => a.ville.localeCompare(b.ville, 'fr')).map(resumeListe);

export function liste(id) {
  let l = Records.get(LISTE, id);
  if (!l) return null;
  // Les doublons par numéro se retirent d'eux-mêmes (13 oct. 2026, Jules), au plus toutes les dix minutes par liste.
  if (l.etat !== 'en_cours' && (!l.doublons_le || Date.now() - Date.parse(l.doublons_le) > 10 * 60000)) {
    try { reparerListe(id); } catch (e) { console.warn('[agent-ia] doublons :', e?.message || e); }
    l = Records.update(LISTE, id, { doublons_le: new Date().toISOString() }) || Records.get(LISTE, id);
  }
  // Un agent du carnet en cours d'appel (verrou tenu) : son agence porte un cadenas.
  const carnet = new Map(Records.list('AgentImmo').map((x) => [x.id, x]));
  const enAppel = (a) => {
    const v = carnet.get(a.carnet_id)?.verrou;
    return v?.par && Date.now() - Date.parse(v.le) < 30 * 60000 ? v.par : null;
  };
  // Chaque ligne porte son statut croisé (Monday et nos appels) et sa
  // pertinence ; l'ordre est celui du mode appel : relance due d'abord, le
  // commerce avant le résidentiel, les mortes à la fin.
  // L'ordre fixe (12 oct. 2026) : la liste ne se réordonne pas après un appel.
  const lignes = MA.ordreStable(MA.annoter(agencesDe(id).map((a) => ({ ...a, en_appel_par: enAppel(a) }))));
  return { ...resumeListe(l), lignes, chiffres: MA.chiffresDeLaVille(lignes) };
}

// --- Ranger une agence, sans doublon ---------------------------------------

/**
 * L'agence déjà dans la liste : même fiche Maps, même SIRET, même téléphone,
 * même nom, puis même domaine. Dans cet ordre : un nom dit l'agence mieux
 * qu'un domaine, qui peut être celui d'un réseau.
 */
function retrouver(listeId, a) {
  const tel = normTel(a.telephone);
  const cle = cleAgence(a.nom);
  const dom = domaineDe(a.site) || domaineDe(a.email);
  const toutes = agencesDe(listeId, { toutes: true });
  return (a.place_id && toutes.find((x) => x.place_id === a.place_id))
    || (a.siret && toutes.find((x) => x.siret === a.siret))
    || (tel && toutes.find((x) => normTel(x.telephone) === tel))
    || (cle && cle.length > 2 && toutes.find((x) => cleAgence(x.nom) === cle))
    || (dom && toutes.find((x) => domaineDe(x.site) === dom || domaineDe(x.email) === dom))
    || null;
}

/**
 * Range une agence, sans doublon. On complète ce qui manque sans écraser ;
 * `autorite` nomme les champs que cette source tranche (Maps : le téléphone
 * et le site), qui remplacent alors ce qu'on avait.
 */
export function ranger(listeId, a, { autorite = [] } = {}) {
  const deja = retrouver(listeId, a);
  if (!deja) return { agence: Records.create(AGENCE, { liste_id: listeId, agents: [], gerants: [], sources: [], ...a, cree_le: maintenant() }), nouvelle: true };
  const champs = {};
  for (const [k, v] of Object.entries(a)) {
    if (v == null || v === '' || Array.isArray(v)) continue;
    if (autorite.includes(k) || deja[k] == null || deja[k] === '') champs[k] = v;
  }
  champs.sources = [...new Set([...(deja.sources || []), ...(a.sources || [])])];
  return { agence: Records.update(AGENCE, deja.id, champs), nouvelle: false };
}

// --- Ranger un mandataire, sans doublon (23 oct. 2026) ------------------------

/**
 * Range un mandataire : une personne, pas une agence. On complète ce qui manque ; le téléphone se remplace par celui
 * d'une source plus sûre (annuaire, annonce, registre, Apollo) ; les annonces gardent le plus grand compte vu.
 */
export function rangerMandataire(listeId, m) {
  // Le réseau se lit aussi dans le site ou le mail (« cedric-theveniaud.optimhome.com », « expfrance.fr »).
  if (!m.reseau) { const r = reseauDe(m.site, m.email); if (r) m = { ...m, reseau: r.cle, reseau_nom: r.nom }; }
  const deja = retrouverMandataire(agencesDe(listeId, { toutes: true }), m, { normTel });
  const tel = m.telephone ? { telephone: m.telephone, source: m.telephone_source || 'annonce' } : null;
  const commerce = (m.annonces_commerce || 0) > 0;
  if (!deja) {
    // Déjà au carnet (appelé comme agent d'une agence) : la ligne le sait, son statut suit.
    const t = normTel(m.telephone);
    const mail = normEmail(m.email || '');
    const carnet = Records.list('AgentImmo').find((y) => (t && (y.telephones || []).map(normTel).includes(t)) || (mail && (y.emails || []).map(normEmail).includes(mail))) || null;
    return { mandataire: Records.create(AGENCE, { liste_id: listeId, agents: [], gerants: [], sources: [], ...m, genre: 'mandataire', telephone: tel?.telephone || null, telephone_source: tel?.source || null, publie_commerce: commerce, carnet_id: m.carnet_id || carnet?.id || null, cree_le: maintenant() }), nouveau: true };
  }
  const champs = {};
  for (const [k, v] of Object.entries(m)) {
    if (v == null || v === '' || Array.isArray(v) || ['telephone', 'telephone_source', 'annonces', 'annonces_commerce', 'sources', 'nom'].includes(k)) continue;
    if (deja[k] == null || deja[k] === '') champs[k] = v;
  }
  const garde = telephoneAGarder(deja.telephone ? { telephone: deja.telephone, source: deja.telephone_source } : null, tel);
  if (garde && garde.telephone !== deja.telephone) { champs.telephone = garde.telephone; champs.telephone_source = garde.source; }
  // Un nom d'annonce (« Vito Schiavone ») vaut mieux que celui du registre en capitales.
  if (m.nom && (!deja.nom || (deja.sources || []).every((x) => x === 'Data-B'))) champs.nom = m.nom;
  champs.annonces = Math.max(deja.annonces || 0, m.annonces || 0);
  champs.annonces_commerce = Math.max(deja.annonces_commerce || 0, m.annonces_commerce || 0);
  champs.publie_commerce = champs.annonces_commerce > 0;
  champs.genre = 'mandataire';
  champs.sources = [...new Set([...(deja.sources || []), ...(m.sources || [])])];
  return { mandataire: Records.update(AGENCE, deja.id, champs), nouveau: false };
}

// --- 1. Google Maps -----------------------------------------------------------

async function parMaps(l, { chercher = null } = {}) {
  const M = await import('./agences-maps.js');
  if (!chercher && !M.mapsConfigure()) { noter(l, "Google Maps n'est pas configuré (GOOGLE_MAPS_SERVEUR) : je passe à Data-B.", 'alerte'); return 0; }
  Records.update(LISTE, l.id, { etape: 'Google Maps : les agences de la ville' });
  const r = await (chercher || M.agencesDeLaVille)(l.ville, { surCase: ({ cases, lieux }) => Records.update(LISTE, l.id, { etape: `Google Maps : ${lieux} lieux, ${cases} zone${cases > 1 ? 's' : ''} lue${cases > 1 ? 's' : ''}` }) });
  let nouvelles = 0;
  for (const a of r.agences) {
    if (!a.nom) continue;
    const { nouvelle } = ranger(l.id, { ...a, site_source: a.site ? 'Google Maps' : null, sources: ['Google Maps'] }, { autorite: ['telephone', 'site', 'site_source', 'place_id', 'maps_url', 'adresse'] });
    if (nouvelle) nouvelles += 1;
  }
  noter(l, `Google Maps : ${r.agences.length} agences immobilières à ${r.commune.nom} (${r.ecartes} lieux d'à côté écartés), ${nouvelles} nouvelles dans la liste ; téléphone et site de leur fiche Maps.`, 'succes');
  return nouvelles;
}

// --- 2. Data-B ----------------------------------------------------------------

async function parDataB(l, user) {
  const { dataBConfigure } = await import('../data-b.js');
  if (!dataBConfigure()) { noter(l, "Data-B n'est pas configuré : je passe aux annonces d'Equimmox.", 'alerte'); return 0; }
  const M = await import('../mandataire-prospective.js');
  const villes = await M.chercherVilles(l.ville);
  const n = norm(l.ville);
  const ville = villes.find((v) => norm(v.nom) === n) || villes.find((v) => norm(v.nom).startsWith(n)) || villes[0];
  if (!ville) { noter(l, `Data-B ne connaît pas « ${l.ville} ».`, 'alerte'); return 0; }
  const p = await M.lancerProspective({ nom: `Agences immobilières · ${ville.nom}`, ville, metiers: [METIER_IMMOBILIER] }, user);
  if (!p.ok) { noter(l, `Data-B refuse la recherche : ${p.error}`, 'alerte'); return 0; }
  // La prospective se calcule chez Data-B : on attend sa première page.
  let r = null;
  for (let essai = 0; essai < 12; essai += 1) {
    r = await M.resultats(p.prospective.jeton, { page: 1, user });
    if (r.ok) break;
    await pause(10_000);
  }
  if (!r?.ok) { noter(l, `Data-B n'a pas rendu ses résultats : ${r?.error || 'délai dépassé'}.`, 'alerte'); return 0; }
  let nouvelles = 0;
  let ecartes = 0;
  let mandatairesNes = 0;
  for (let page = 1; page <= Math.min(r.pages, 40); page += 1) {
    const res = page === 1 ? r : await M.resultats(p.prospective.jeton, { page, user });
    if (!res.ok) { noter(l, `Data-B : page ${page} illisible (${res.error}).`, 'alerte'); break; }
    for (const d of res.resultats) {
      if (!estAgence(d)) { ecartes += 1; continue; }
      // Un agent en nom propre (« Monsieur Vito Schiavone ») : un mandataire, une personne à appeler (23 oct. 2026).
      if (estEnNomPropre(d.nom) || estEnNomPropre(d.enseigne)) {
        const r = rangerMandataire(l.id, {
          nom: nomPersonne(d.enseigne || d.nom), raison_sociale: d.nom || null, siren: d.siren || null, siret: d.siret || null,
          adresse: d.adresse ? casse(d.adresse) : null, code_postal: d.code_postal || null, telephone: d.telephone ? telAffiche(d.telephone) : null, telephone_source: 'registre',
          email: (d.emails || [])[0] || null, creation: d.creation || null, ape: d.ape || null, lat: d.lat ?? null, lon: d.lon ?? null, sources: ['Data-B'],
        });
        if (r.nouveau) mandatairesNes += 1;
        continue;
      }
      const { nouvelle } = ranger(l.id, {
        nom: casse(d.enseigne || d.nom), raison_sociale: d.nom || null, siret: d.siret || null, siren: d.siren || null,
        adresse: d.adresse ? casse(d.adresse) : null, code_postal: d.code_postal || null,
        telephone: d.telephone ? telAffiche(d.telephone) : null, email: (d.emails || [])[0] || null, site: d.site || null,
        effectif: d.effectif || null, creation: d.creation || null, lat: d.lat ?? null, lon: d.lon ?? null, ape: d.ape || null, sources: ['Data-B'],
      });
      if (nouvelle) nouvelles += 1;
    }
    Records.update(LISTE, l.id, { etape: `Data-B : page ${page} sur ${r.pages}` });
  }
  noter(l, `Data-B : ${r.total} établissements « Immobilier » lus, ${ecartes} écartés (syndics, gestion, promotion, SCI…), ${nouvelles} nouvelles agences et ${mandatairesNes} mandataires en nom propre dans la liste.`, 'succes');
  return nouvelles;
}

// --- 2 bis. Apollo : les agences que Maps et Data-B n'ont pas ----------------

async function parApollo(l) {
  const A = await import('./agences-apollo.js');
  if (!A.apolloConfigure()) { noter(l, "Apollo n'est pas branché (APOLLO_API_KEY) : je passe à l'annuaire.", 'alerte'); return 0; }
  Records.update(LISTE, l.id, { etape: 'Apollo : les agences de la ville' });
  const r = await A.agencesDeLaVille(l.ville, { surPage: ({ requetes, agences }) => Records.update(LISTE, l.id, { etape: `Apollo : ${agences} agences, ${requetes} recherches` }) });
  let nouvelles = 0;
  for (const a of r.agences) {
    const { nouvelle } = ranger(l.id, { ...a, site_source: a.site ? 'Apollo' : null, sources: ['Apollo'] });
    if (nouvelle) nouvelles += 1;
  }
  noter(l, `Apollo : ${r.agences.length} agences immobilières à ${l.ville}, ${nouvelles} nouvelles dans la liste (${r.requetes} recherches).`, 'succes');
  return nouvelles;
}

// --- 3. L'annuaire des entreprises : le gérant ------------------------------

async function parAnnuaire(l) {
  const { societe } = await import('../alx/annuaire.js');
  const aLire = agencesDe(l.id).filter((a) => a.siren && !a.annuaire_lu_le);
  let lus = 0;
  for (const a of aLire) {
    try {
      const s = await societe({ siren: a.siren });
      const gerants = (s?.gerants || []).filter((g) => !g.personne_morale && g.nom).slice(0, 4).map((g) => ({ nom: nomCourt(g), qualite: g.qualite || null, tranche_age: g.tranche_age || null }));
      Records.update(AGENCE, a.id, {
        annuaire_lu_le: maintenant(), gerants,
        ...(s?.creation && !a.creation ? { creation: String(s.creation).slice(0, 4) } : {}),
        ...(s?.effectif && !a.effectif ? { effectif: s.effectif } : {}),
        ...(s && !s.active ? { fermee: true } : {}),
      });
      lus += 1;
    } catch (e) {
      Records.update(AGENCE, a.id, { annuaire_lu_le: maintenant() });
      if (/429|trop de requ/i.test(e?.message || '')) await pause(3000);
    }
    if (lus % 10 === 0) Records.update(LISTE, l.id, { etape: `Annuaire : ${lus} agences sur ${aLire.length}` });
    await pause(250);
  }
  if (aLire.length) noter(l, `Annuaire des entreprises : le gérant de ${lus} agences.`, 'succes');
}

// --- 4. Equimmox : les agents qui publient ----------------------------------

async function parEquimmox(l) {
  const { equimmoxConfigure, exporterAnnoncesVente } = await import('../equimmox.js');
  if (!equimmoxConfigure()) { noter(l, "Equimmox n'est pas configuré : pas d'agents par leurs annonces.", 'alerte'); return; }
  Records.update(LISTE, l.id, { etape: 'Equimmox : les annonces de la ville' });
  const r = await exporterAnnoncesVente(l.ville);
  if (!r.ok) { noter(l, `Equimmox : ${r.error}`, 'alerte'); return; }
  const { lireXlsx } = await import('../xlsx.js');
  const { agentsDesAnnonces } = await import('./sources.js');
  // Toutes les classes d'annonces : un agent qui vend des appartements connaît aussi les murs du quartier.
  const lignesXlsx = r.buffer ? lireXlsx(r.buffer) : [];
  const agents = lignesXlsx.length ? agentsDesAnnonces(lignesXlsx, { classes: [], ville: r.ville }) : [];
  // Les annonces de commerce de chacun : elles font remonter son agence dans le mode appel.
  const commerce = new Map();
  for (const x of lignesXlsx.length ? agentsDesAnnonces(lignesXlsx, { classes: ['Commercial'], ville: r.ville }) : []) {
    const cle = normEmail(x.email) || normTel(x.telephone);
    if (cle) commerce.set(cle, (commerce.get(cle) || 0) + (x.annonces || 0));
  }
  let rattaches = 0;
  let nees = 0;
  let ecartes = 0;
  let mandataires = 0;
  for (const ag of agents) {
    // Equimmox ne nomme pas l'agent : son mail le dit souvent (« jean.dupont@… » → Jean Dupont).
    const agent = { nom: nomDuMail(ag.email), email: ag.email || null, telephone: ag.telephone ? telAffiche(ag.telephone) : null, annonces: ag.annonces || 0, annonces_commerce: commerce.get(normEmail(ag.email) || normTel(ag.telephone)) || 0 };
    ag.agence = String(ag.agence || '').replace(/\s*\([^)]*\)\s*$/, '');
    // « Prénom Nom - Agence » : l'agent rejoint son agence au lieu d'en faire une ligne.
    const lib = agenceDuLibelle(ag.agence, { ville: l.ville });
    if (lib.agent) { ag.agence = lib.agence; agent.nom = lib.agent; }
    if (!agent.email && !agent.telephone) continue;
    // « Prénom Nom - IAD France » (23 oct. 2026, Jules) : un mandataire IAD de la ville, pas une agence IAD.
    const reseau = reseauDe(ag.agence, agent.email);
    if (reseau) {
      // Sans nom de personne (« recup.email@capifrance.fr »), c'est le standard du réseau : personne à appeler ici.
      if (!estUnePersonne(lib.agent || agent.nom)) { ecartes += 1; continue; }
      const r = rangerMandataire(l.id, { nom: nomPersonne(lib.agent || agent.nom), reseau: reseau.cle, reseau_nom: reseau.nom, email: agent.email, telephone: agent.telephone, telephone_source: 'annonce', annonces: agent.annonces, annonces_commerce: agent.annonces_commerce, sources: ['Equimmox'] });
      if (r.nouveau) mandataires += 1;
      continue;
    }
    if (PAS_UNE_AGENCE.test(String(ag.agence || '').replace(/\s*\([^)]*\)\s*$/, '').trim())) continue;
    // Le nom de l'annonce ne suffit plus : sur un co-mandat, il rangeait un
    // agent CBRE chez « Berge Immobilier ». Le mail professionnel tranche.
    const ici = agencesDe(l.id).filter((x) => x.genre !== 'mandataire');
    // Par le nom, si le mail ne le contredit pas ; sinon l'agence de son domaine.
    const parNom = ag.agence ? ici.find((x) => cleAgence(x.nom) === cleAgence(ag.agence)) : null;
    let a = (parNom && agentVaAvec(agent, parNom, l.ville) ? parNom : null) || agenceDuDomaine(agent, ici, l.ville);
    // Le nom de l'annonce contredit par le mail : on ne crée pas d'agence sous
    // un nom qui n'est pas le sien. L'agent reste de côté.
    if (!a && parNom) { ecartes += 1; continue; }
    if (!a) {
      // Jamais de site déduit d'un mail : la fiche Maps le donnera, ou rien.
      a = ranger(l.id, { nom: casse(ag.agence || agent.nom || agent.email), sources: ['Equimmox'] }).agence;
      nees += 1;
    }
    const liste = a.agents || [];
    const meme = liste.find((x) => (agent.email && normEmail(x.email) === normEmail(agent.email)) || (agent.telephone && normTel(x.telephone) === normTel(agent.telephone)));
    const agentsMaj = meme ? liste.map((x) => (x === meme ? { ...x, ...Object.fromEntries(Object.entries(agent).filter(([, v]) => v)) } : x)) : [...liste, agent];
    Records.update(AGENCE, a.id, { agents: agentsMaj, annonces: agentsMaj.reduce((n, x) => n + (x.annonces || 0), 0), annonces_commerce: agentsMaj.reduce((n, x) => n + (x.annonces_commerce || 0), 0), sources: [...new Set([...(a.sources || []), 'Equimmox'])] });
    rattaches += 1;
  }
  if (mandataires) noter(l, `Equimmox : ${mandataires} mandataires de réseau qui publient à ${r.ville} (IAD, SAFTI, Capifrance…), chacun à part, avec son numéro d'annonce.`, 'succes');
  noter(l, `Equimmox : ${agents.length} agents qui publient à ${r.ville}, ${rattaches} rangés dans leur agence${nees ? ` (${nees} agences en plus)` : ''}${ecartes ? `, ${ecartes} laissés de côté (leur mail n'est pas celui de l'agence de l'annonce)` : ''}.`, 'succes');
  reparerListe(l.id);
}

// --- Réparer une liste : agents mal rangés, doublons ------------------------

/** Pure : le site complet d'une agence, sans protocole ni « www », pour reconnaître un doublon. */
const siteComplet = (x) => String(x || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

/**
 * Remet chaque agent dans son agence et fusionne les doublons. Rien ne se
 * perd : un agent qu'aucune agence ne reconnaît passe dans `agents_ecartes`,
 * une fiche fusionnée reste en base, cachée (`fusionnee_dans`).
 */
/**
 * Les mandataires d'une liste faite avant le 23 oct. 2026 : un agent en nom propre rangé comme une agence devient un
 * mandataire ; une « agence » qui est un réseau (IAD France, sans fiche Maps) rend ses agents, mandataires de la ville ;
 * deux fiches de la même personne se fondent. Rend le nombre de lignes changées.
 */
export function migrerMandataires(listeId) {
  let n = 0;
  for (const a of agencesDe(listeId)) {
    // Un mandataire sans réseau connu : son site ou son mail le disent peut-être.
    if (a.genre === 'mandataire' && !a.reseau) { const r = reseauDe(a.site, a.email); if (r) Records.update(AGENCE, a.id, { reseau: r.cle, reseau_nom: r.nom }); }
    if (a.genre === 'mandataire') continue;
    if (estEnNomPropre(a.raison_sociale) || estEnNomPropre(a.nom)) {
      const r = reseauDe(a.site, a.email, ...(a.agents || []).map((x) => x.email));
      Records.update(AGENCE, a.id, { genre: 'mandataire', nom: nomPersonne(a.nom), raison_sociale: a.raison_sociale || a.nom, telephone_source: a.telephone ? a.telephone_source || 'registre' : null, ...(r ? { reseau: r.cle, reseau_nom: r.nom } : {}) });
      n += 1;
      continue;
    }
    const reseau = reseauDe(a.nom);
    // « Olivier Trompette - immobilier - iad France » (sa fiche Google Maps) : un conseiller, pas une agence.
    const tete = String(a.nom || '').split(/\s+[-–—|]\s+/)[0];
    if (reseau && tete !== a.nom && estUnePersonne(tete) && !reseauDe(tete)) {
      Records.update(AGENCE, a.id, { genre: 'mandataire', nom: nomPersonne(tete), nom_avant: a.nom, reseau: reseau.cle, reseau_nom: reseau.nom, telephone_source: a.telephone ? a.telephone_source || (a.place_id ? 'maps' : 'annonce') : null, agents: [] });
      for (const x of (a.agents || []).filter((y) => (y.telephone || y.email) && estUnePersonne(y.nom || nomDuMail(y.email)) && clePersonne(y.nom || '') !== clePersonne(tete))) {
        rangerMandataire(listeId, { nom: nomPersonne(x.nom || nomDuMail(x.email)), reseau: reseau.cle, reseau_nom: reseau.nom, email: x.email || null, telephone: x.telephone || null, telephone_source: 'annonce', annonces: x.annonces || 0, annonces_commerce: x.annonces_commerce || 0, sources: ['Equimmox'] });
      }
      n += 1;
      continue;
    }
    if (!reseau || a.place_id || !(a.agents || []).length) continue;
    for (const x of a.agents) {
      if ((!x.telephone && !x.email) || !estUnePersonne(x.nom || nomDuMail(x.email))) continue;
      rangerMandataire(listeId, { nom: nomPersonne(x.nom || nomDuMail(x.email)), reseau: reseau.cle, reseau_nom: reseau.nom, email: x.email || null, telephone: x.telephone || null, telephone_source: 'annonce', annonces: x.annonces || 0, annonces_commerce: x.annonces_commerce || 0, ...(x.monday ? { monday: x.monday } : {}), sources: ['Equimmox'] });
      n += 1;
    }
    // Une ligne déjà suivie (au carnet, associée à quelqu'un) reste ; sinon elle sort, la raison dite.
    if (!a.carnet_id && !(a.pour || []).length) Records.update(AGENCE, a.id, { hors_cible: true, retiree_motif: `réseau de mandataires (${reseau.nom}) : ses conseillers sont rangés à part`, retiree_le: maintenant(), retiree_par: 'automatique' });
  }
  // Les doublons d'une même personne (registre et annonce) : la fiche la plus renseignée garde tout.
  const vus = [];
  for (const m of agencesDe(listeId).filter((x) => x.genre === 'mandataire')) {
    const deja = retrouverMandataire(vus, m, { normTel });
    if (!deja) { vus.push(m); continue; }
    const garde = Records.get(AGENCE, deja.id);
    const champs = {};
    for (const [k, v] of Object.entries(m)) if (!['id', 'nom', 'sources', 'agents', 'gerants', 'created_date', 'updated_date', 'cree_le'].includes(k) && v != null && v !== '' && (garde[k] == null || garde[k] === '')) champs[k] = v;
    const t = telephoneAGarder(garde.telephone ? { telephone: garde.telephone, source: garde.telephone_source } : null, m.telephone ? { telephone: m.telephone, source: m.telephone_source } : null);
    if (t && t.telephone !== garde.telephone) { champs.telephone = t.telephone; champs.telephone_source = t.source; }
    if ((garde.sources || []).every((x) => x === 'Data-B') && m.nom) champs.nom = m.nom;
    Records.update(AGENCE, garde.id, { ...champs, sources: [...new Set([...(garde.sources || []), ...(m.sources || [])])], annonces: Math.max(garde.annonces || 0, m.annonces || 0), annonces_commerce: Math.max(garde.annonces_commerce || 0, m.annonces_commerce || 0), pour: [...new Set([...(garde.pour || []), ...(m.pour || [])])] });
    Records.update(AGENCE, m.id, { hors_cible: true, fusionnee_dans: garde.id });
    n += 1;
  }
  return n;
}

export function reparerListe(listeId) {
  const ville = Records.get(LISTE, listeId)?.ville || null;
  const mandatairesRanges = migrerMandataires(listeId);
  let deplaces = 0;
  let ecartes = 0;
  let fusions = 0;
  let horsDep = 0;
  // 1. Les doublons, par des règles sûres (6 oct. 2026 : « qu'on n'appelle
  // pas deux fois ») : même numéro ; même site exact et un mot du nom en
  // commun ; un nom relevé sur des annonces Equimmox, sans numéro ni site,
  // rattaché à l'agence dont c'est le nom ou le domaine. Les groupes se
  // fondent dans la fiche la plus renseignée.
  // Les mandataires sont des personnes : les règles de fusion des agences ne les touchent pas.
  const actives = () => agencesDe(listeId).filter((x) => x.genre !== 'mandataire');
  const tout = actives();
  const parent = new Map(tout.map((a) => [a.id, a.id]));
  const racine = (id) => { let r = id; while (parent.get(r) !== r) r = parent.get(r); parent.set(id, r); return r; };
  const unir = (x, y) => { const a = racine(x); const b = racine(y); if (a !== b) parent.set(b, a); };
  const parTel = new Map();
  const parSite = new Map();
  for (const a of tout) {
    const t = normTel(a.telephone);
    if (t) { if (parTel.has(t)) unir(parTel.get(t), a.id); else parTel.set(t, a.id); }
  }
  // Le numéro d'une agence qui est celui d'un agent d'une autre ligne : la même agence (13 oct. 2026).
  for (const a of tout) {
    for (const x of a.agents || []) {
      const t = normTel(x.telephone);
      if (t && parTel.has(t) && parTel.get(t) !== a.id && (!a.telephone || normTel(a.telephone) !== t)) {
        const autre = tout.find((y) => y.id === parTel.get(t));
        // Un mobile d'agent partagé par deux vraies agences ne les fond pas : il faut aussi un mot du nom en commun.
        const mots = new Set(motsDuNom(a.nom, ville));
        if (autre && motsDuNom(autre.nom, ville).some((m) => mots.has(m))) unir(parTel.get(t), a.id);
      }
    }
  }
  for (const a of tout) {
    const k = siteComplet(a.site);
    if (k) { if (!parSite.has(k)) parSite.set(k, []); parSite.get(k).push(a); }
  }
  for (const groupe of parSite.values()) {
    for (const d of groupe.slice(1)) {
      const mots = new Set(motsDuNom(groupe[0].nom, ville));
      if (motsDuNom(d.nom, ville).some((m) => mots.has(m))) unir(groupe[0].id, d.id);
    }
  }
  // Les noms d'annonces sans numéro ni site : l'agence de leurs agents, ou
  // celle dont le nom commence pareil (« Bnp » → « Bnppre Nice »), si une seule.
  const coquille = (a) => !a.telephone && !a.site && (a.sources || []).every((x) => x === 'Equimmox');
  const motsVille = new Set(cleAgence(ville || '').split(' ').filter(Boolean));
  // « Prénom Nom - Arthur Loyd » (12 oct. 2026) : les coquilles d'une même agence se fondent, chacune apporte son agent nommé.
  const parLibelle = new Map();
  for (const a of tout.filter(coquille)) {
    const lib = agenceDuLibelle(a.nom, { ville });
    if (!lib.agent) continue;
    if ((a.agents || []).some((x) => !x.nom)) Records.update(AGENCE, a.id, { agents: (a.agents || []).map((x) => (x.nom ? x : { ...x, nom: lib.agent })) });
    const k = cleAgence(lib.agence);
    if (parLibelle.has(k)) unir(parLibelle.get(k), a.id); else parLibelle.set(k, a.id);
  }
  for (const a of tout.filter(coquille)) {
    const autres = tout.filter((x) => x.id !== a.id && !coquille(x));
    const parDomaine = (a.agents || []).map((x) => agenceDuDomaine(x, autres, ville)).find(Boolean);
    const cle = cleAgence(agenceDuLibelle(a.nom, { ville }).agence).replace(/\s+/g, '');
    // Le premier mot d'un nom d'annonce et celui d'une agence qui commencent
    // pareil (« Bnppre High Street » et « BNP Paribas Real Estate »).
    const premier = (n) => cleAgence(n).split(' ').filter((m) => m.length >= 3 && !motsVille.has(m))[0] || '';
    const pa = premier(agenceDuLibelle(a.nom, { ville }).agence);
    const parNom = cle.length >= 3 ? autres.filter((x) => {
      const px = premier(x.nom);
      return cleAgence(x.nom).replace(/\s+/g, '').startsWith(cle) || (pa && px && (pa.startsWith(px) || px.startsWith(pa)));
    }) : [];
    const cible = parDomaine || (new Set(parNom.map((x) => racine(x.id))).size === 1 ? parNom[0] : null);
    if (cible) unir(cible.id, a.id);
  }
  const groupes = new Map();
  for (const a of tout) { const r = racine(a.id); if (!groupes.has(r)) groupes.set(r, []); groupes.get(r).push(a); }
  for (const groupe of groupes.values()) {
    if (groupe.length < 2) continue;
    // La fiche gardée : la plus renseignée (Data-B et Maps d'abord).
    const poids = (x) => (x.siren ? 4 : 0) + (x.place_id ? 2 : 0) + (x.telephone ? 2 : 0) + (x.email ? 1 : 0) + (x.carnet_id ? 8 : 0) + (x.pour?.length ? 8 : 0) + (x.sources || []).length - (coquille(x) ? 10 : 0);
    const [garde, ...autres] = [...groupe].sort((x, y) => poids(y) - poids(x));
    for (const d of autres) {
      const g = Records.get(AGENCE, garde.id);
      const champs = {};
      for (const [k, v] of Object.entries(d)) {
        if (['id', 'liste_id', 'agents', 'gerants', 'sources', 'nom', 'pour', 'cree_le', 'created_date', 'updated_date'].includes(k)) continue;
        if (v != null && v !== '' && (g[k] == null || g[k] === '')) champs[k] = v;
      }
      const agents = [...(g.agents || [])];
      for (const x of Records.get(AGENCE, d.id)?.agents || d.agents || []) {
        if (!agents.some((y) => (x.email && normEmail(y.email) === normEmail(x.email)) || (x.telephone && normTel(y.telephone) === normTel(x.telephone)))) agents.push(x);
      }
      Records.update(AGENCE, g.id, {
        ...champs, agents,
        pour: [...new Set([...(g.pour || []), ...(d.pour || [])])],
        gerants: (g.gerants || []).length ? g.gerants : d.gerants || [],
        sources: [...new Set([...(g.sources || []), ...(d.sources || [])])],
      });
      Records.update(AGENCE, d.id, { hors_cible: true, fusionnee_dans: g.id });
      fusions += 1;
    }
  }
  // Le nom d'agence, sans l'agent devant (« Yasmina Zabar - Arthur Loyd » → « Arthur Loyd »).
  for (const a of actives().filter(coquille)) {
    const lib = agenceDuLibelle(a.nom, { ville });
    if (lib.agent) Records.update(AGENCE, a.id, { nom: lib.agence, nom_avant: a.nom });
  }
  // 1 bis. Une ligne d'un autre département (Data-B rend parfois des homonymes
  // lointains : Saint-Barthélemy dans la liste de Nice) sort de la liste.
  const dep = MA.departementDe(actives());
  if (dep) {
    for (const a of agencesDe(listeId)) {
      const cp = String(a.code_postal || String(a.adresse || '').match(/\b\d{5}\b/)?.[0] || '');
      if (!/^\d{5}$/.test(cp)) continue;
      const d = cp.startsWith('20') ? (Number(cp) < 20200 ? '2A' : '2B') : cp.slice(0, 2);
      if (d !== dep) { Records.update(AGENCE, a.id, { hors_cible: true, retiree_motif: `autre département (${cp})`, retiree_le: maintenant(), retiree_par: 'automatique' }); horsDep += 1; }
    }
  }
  // 2. Les agents : chacun chez l'agence de son mail, sinon de côté.
  for (const a of actives()) {
    const garder = [];
    const sortis = [];
    for (const x of a.agents || []) (agentVaAvec(x, a, ville) ? garder : sortis).push(x);
    if (!sortis.length) continue;
    const ecartesIci = [];
    for (const x of sortis) {
      const autre = agenceDuDomaine(x, actives().filter((y) => y.id !== a.id), ville);
      if (autre) {
        const cible = Records.get(AGENCE, autre.id);
        const deja = (cible.agents || []).some((y) => (x.email && normEmail(y.email) === normEmail(x.email)) || (x.telephone && normTel(y.telephone) === normTel(x.telephone)));
        if (!deja) {
          const agents = [...(cible.agents || []), x];
          Records.update(AGENCE, cible.id, { agents, annonces: agents.reduce((n, y) => n + (y.annonces || 0), 0) });
        }
        deplaces += 1;
      } else {
        ecartesIci.push({ ...x, ecarte_le: maintenant(), ecarte_de: a.nom });
        ecartes += 1;
      }
    }
    Records.update(AGENCE, a.id, {
      agents: garder,
      annonces: garder.reduce((n, y) => n + (y.annonces || 0), 0),
      ...(ecartesIci.length ? { agents_ecartes: [...(Records.get(AGENCE, a.id).agents_ecartes || []), ...ecartesIci] } : {}),
    });
  }
  return { deplaces, ecartes, fusions, ...(horsDep ? { hors_departement: horsDep } : {}), ...(mandatairesRanges ? { mandataires: mandatairesRanges } : {}) };
}

// --- 5. Monday : qui est déjà en contact ------------------------------------

/** Les agences déjà en contact dans Monday sont marquées : on ne les rappelle pas comme des inconnues. */
export async function verifierMonday(l) {
  Records.update(LISTE, l.id, { etape: 'Monday : qui est déjà en contact' });
  const { marquerListe } = await import('./monday-connus.js');
  const r = await marquerListe(l.id);
  if (!r.ok) { noter(l, `Monday non vérifié : ${r.error}`, 'alerte'); return r; }
  noter(l, `Monday : ${r.connues} agence${r.connues > 1 ? 's' : ''} sur ${r.total} déjà en contact, marquée${r.connues > 1 ? 's' : ''} « Déjà en contact ».`, 'succes');
  return r;
}

// --- Lancer une ville -------------------------------------------------------

const enCours = new Set();

/** Lance l'agent sur une ville : sa liste naît (ou se complète), le travail part en fond. */
export function lancer(villeBrute, user) {
  const ville = casse(String(villeBrute || '').trim()).slice(0, 80);
  if (ville.length < 2) return { ok: false, error: 'Quelle ville ?' };
  let l = Records.list(LISTE).find((x) => norm(x.ville) === norm(ville));
  if (l && enCours.has(l.id)) return { ok: true, liste: resumeListe(l), deja: true };
  l = l
    ? Records.update(LISTE, l.id, { etat: 'en_cours', etape: 'Démarrage', lancee_par: user?.email || null, lancee_le: maintenant() })
    : Records.create(LISTE, { ville, etat: 'en_cours', etape: 'Démarrage', lancee_par: user?.email || null, lancee_le: maintenant(), journal: [] });
  enCours.add(l.id);
  noter(l, `Je cherche les agences immobilières de ${ville} (lancé par ${user?.full_name || user?.email || "l'équipe"}).`);
  (async () => {
    await parMaps(l).catch((e) => noter(l, `Google Maps : ${e?.message || e}`, 'alerte'));
    await parDataB(l, user).catch((e) => noter(l, `Data-B : ${e?.message || e}`, 'alerte'));
    await parApollo(l).catch((e) => noter(l, `Apollo : ${e?.message || e}`, 'alerte'));
    await parAnnuaire(l).catch((e) => noter(l, `Annuaire : ${e?.message || e}`, 'alerte'));
    await parEquimmox(l).catch((e) => noter(l, `Equimmox : ${e?.message || e}`, 'alerte'));
    await verifierMonday(l).catch((e) => noter(l, `Monday : ${e?.message || e}`, 'alerte'));
    appliquerRegles(l.id);
    reparerListe(l.id);
    const fin = resumeListe(Records.get(LISTE, l.id));
    noter(l, `Fini : ${fin.agences} agences, ${fin.avec_telephone} avec un numéro, ${fin.agents} agents.`, 'succes');
    Records.update(LISTE, l.id, { etat: 'fini', etape: null, fini_le: maintenant() });
  })().catch((e) => Records.update(LISTE, l.id, { etat: 'erreur', etape: null, erreur: e?.message || String(e) }))
    .finally(() => enCours.delete(l.id));
  return { ok: true, liste: resumeListe(Records.get(LISTE, l.id)) };
}

// --- À qui est la ligne -----------------------------------------------------

/** Pure : le prénom d'une adresse de l'équipe (« nora.l@klocka.immo » → « Nora »). */
export const prenomDe = (email) => {
  const p = String(email || '').split('@')[0].split(/[._-]/)[0];
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};

// Les photos de l'équipe, rangées dans public/equipe/<prénom>.jpg, quand le
// compte n'en a pas déposé dans Compte.
const DOSSIER_PHOTOS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'equipe');
const photoDe = (u) => {
  if (u.picture) return u.picture;
  const fichier = `${prenomDe(u.email).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}.jpg`;
  return fs.existsSync(path.join(DOSSIER_PHOTOS, fichier)) ? `/equipe/${fichier}` : null;
};

// L'équipe de la prospection (6 oct. 2026) : les analystes, puis Alexis, qui
// n'est plus là mais peut encore tenir une ligne, en dernier.
const ANCIENS = ['alexis.p@klocka.immo'];
// Paul, l'associé (14 oct. 2026, Jules) : on peut lui associer une agence dans la Prospection,
// sans qu'il devienne analyste des dossiers des mandataires (ANALYSTES, fil-dossier.js).
const ASSOCIES = ['paul.dz@klocka.immo'];

/** L'équipe qu'on peut nommer sur une ligne, avec sa photo : les analystes, puis les anciens. */
export function equipe() {
  const comptes = new Map(Records.list('User').map((u) => [normEmail(u.email), u]));
  const emails = [...new Set([...ANALYSTES.map((x) => normEmail(x.email)), ...ASSOCIES])].sort((x, y) => prenomDe(x).localeCompare(prenomDe(y), 'fr')).concat(ANCIENS);
  return emails.map((email) => {
    const u = comptes.get(email) || { email };
    return { email, nom: prenomDe(email), photo: photoDe(u), ancien: ANCIENS.includes(email) };
  });
}

// Les métiers qu'un motif de suppression peut désigner. Un motif reconnu
// devient une règle : les autres lignes de ce métier, présentes ou à venir,
// sortent de la liste d'elles-mêmes, avec le motif dit.
export const METIERS_EXCLUS = [
  { cle: 'notaire', libelle: 'Notaire', motif: /notair/i, ligne: /\bnotair|\betude notariale|\boffice notarial/i },
  { cle: 'syndic', libelle: 'Syndic', motif: /syndic/i, ligne: /\bsyndic/i },
  { cle: 'gestion', libelle: 'Gestion locative', motif: /gestion locative|administrat(eur|ion) de biens|gerance/i, ligne: /gestion locative|administrat(eur|ion) de biens|\bgerance\b/i },
  { cle: 'promoteur', libelle: 'Promoteur', motif: /promot/i, ligne: /\bpromot(eur|ion)/i },
  { cle: 'entrepots', libelle: 'Entrepôts / logistique', motif: /entrep[oô]t|logisti/i, ligne: /\b(entrepots?|logistique|logisticien)\b/i },
  { cle: 'centre_commercial', libelle: 'Centres commerciaux XXL', motif: /centre commercial|grands? centres?|galerie marchande|retail park/i, ligne: /\b(centres? commerciaux?|galeries? marchandes?|retail parks?)\b/i },
  { cle: 'saisonnier', libelle: 'Location saisonnière', motif: /saisonni|conciergerie|airbnb/i, ligne: /saisonni|conciergerie|airbnb/i },
  { cle: 'viager', libelle: 'Viager', motif: /viager/i, ligne: /\bviager/i },
  { cle: 'avocat', libelle: 'Avocat / huissier', motif: /avocat|huissier|commissaire de justice/i, ligne: /\b(avocats?|huissiers?|commissaires? de justice)\b/i },
  { cle: 'banque', libelle: 'Banque / assurance', motif: /banque|assuran|courti/i, ligne: /\b(banques?|assurances?|courtiers?|courtage)\b/i },
  { cle: 'diagnostic', libelle: 'Diagnostiqueur / géomètre', motif: /diagnos|geometre|géomètre|expert/i, ligne: /\b(diagnostics?|geometres?|expertises?)\b/i },
];

const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Pure : le métier qu'un motif désigne (« c'est un notaire » → notaire), ou null. */
export const metierDuMotif = (motif) => METIERS_EXCLUS.find((m) => m.motif.test(sansAccent(motif))) || null;

/** Pure : la règle apprise qui retire cette ligne, d'après son nom, sa raison sociale et ses spécialités Apollo. */
export function regleQuiRetire(a, regles = []) {
  const texte = sansAccent([a?.nom, a?.raison_sociale, a?.apollo_description, ...(a?.apollo_mots || [])].filter(Boolean).join(' · '));
  for (const r of regles) {
    const m = METIERS_EXCLUS.find((x) => x.cle === r.cle);
    if (!m) continue;
    // Les entrepôts et les grands centres : seulement si l'agence ne parle pas aussi de commerce de centre-ville.
    if (['entrepots', 'centre_commercial'].includes(m.cle) && /(fonds de commerce|commerce de proximite|centre-?ville|boutiques?)/i.test(texte)) continue;
    if (m.ligne.test(texte)) return r;
  }
  return null;
}

/** Les règles apprises des suppressions, une par métier. */
export const reglesApprises = () => {
  const parCle = new Map();
  for (const x of Records.list('ExclusionProspection')) if (x.cle && !parCle.has(x.cle)) parCle.set(x.cle, x);
  return [...parCle.values()];
};

/** Retire d'une liste les lignes qu'une règle apprise désigne. Rend le nombre retiré. */
export function appliquerRegles(listeId) {
  const regles = reglesApprises();
  if (!regles.length) return 0;
  let n = 0;
  for (const a of agencesDe(listeId)) {
    if (a.carnet_id || (a.pour || []).length) continue; // une ligne qu'on suit ne disparaît pas seule
    const r = regleQuiRetire(a, regles);
    if (!r) continue;
    Records.update(AGENCE, a.id, { hors_cible: true, retiree_le: maintenant(), retiree_par: 'automatique', retiree_motif: `${METIERS_EXCLUS.find((m) => m.cle === r.cle)?.libelle || r.cle} (appris de « ${r.motif} »)` });
    n += 1;
  }
  return n;
}

/**
 * Retire des lignes de la liste (« Bnp », un notaire, une agence qui ne fait
 * que des entrepôts), avec le motif dit en quelques mots. Elles restent en
 * base, masquées, avec qui et pourquoi : rien ne se perd, une nouvelle
 * recherche ne les fait pas revenir, et un motif qui désigne un métier
 * retire aussi, désormais, les autres lignes de ce métier.
 */
export function retirerAgences(ids = [], user = null, motif = null) {
  const m = String(motif || '').trim().slice(0, 140) || null;
  const metier = m ? metierDuMotif(m) : null;
  let n = 0;
  const listes = new Set();
  for (const id of ids) {
    const a = Records.get(AGENCE, id);
    if (!a || a.hors_cible) continue;
    Records.update(AGENCE, id, { hors_cible: true, retiree_le: maintenant(), retiree_par: user?.email || null, retiree_motif: m });
    if (metier) Records.create('ExclusionProspection', { cle: metier.cle, motif: m, agence: a.nom, liste_id: a.liste_id, par: user?.email || null, le: maintenant() });
    listes.add(a.liste_id);
    n += 1;
  }
  let aussi = 0;
  if (metier) for (const l of listes) aussi += appliquerRegles(l);
  return { ok: true, retirees: n, metier: metier?.libelle || null, aussi };
}

/** Les lignes retirées d'une liste, avec leur motif : le contexte qu'on garde. */
export function retirees(listeId) {
  return Records.list(AGENCE).filter((a) => a.liste_id === listeId && a.hors_cible && !a.fusionnee_dans)
    .map((a) => ({ id: a.id, nom: a.nom, motif: a.retiree_motif || null, par: a.retiree_par || null, le: a.retiree_le || null }))
    .sort((x, y) => String(y.le || '').localeCompare(String(x.le || '')));
}

/** Remet une ligne retirée dans la liste. */
export function remettreAgence(id) {
  const a = Records.get(AGENCE, id);
  if (!a || !a.hors_cible || a.fusionnee_dans) return { ok: false, error: 'Ligne introuvable.' };
  Records.update(AGENCE, id, { hors_cible: false, retiree_motif: null, retiree_le: null, retiree_par: null, remise_le: maintenant() });
  return { ok: true };
}

/**
 * Nomme quelqu'un sur une ligne, ou le retire. Sans adresse, c'est celui qui
 * clique. Plusieurs personnes peuvent tenir la même ligne.
 */
export function attribuer(agenceId, { email = null, retirer = false } = {}, user = null) {
  const a = Records.get(AGENCE, agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  const qui = normEmail(email || user?.email || '');
  if (!qui) return { ok: false, error: 'Qui ?' };
  if (!equipe().some((m) => m.email === qui)) return { ok: false, error: "Cette personne n'est pas de l'équipe." };
  const pour = (a.pour || []).filter((x) => x !== qui);
  if (!retirer) pour.push(qui);
  Records.update(AGENCE, a.id, { pour });
  return { ok: true, pour };
}

// --- Compléter les colonnes vides -------------------------------------------

// Les contacts révélés chez Apollo par passage : un crédit chacun.
const CONTACTS_MAX = Number(process.env.APOLLO_CONTACTS_MAX) || 40;

/** Pure : la même agence, d'après son nom ? Un mot qui compte en commun suffit. */
export function memeNom(a, b) {
  const ma = new Set(cleAgence(a).split(' ').filter((m) => m.length > 2));
  return cleAgence(b).split(' ').some((m) => m.length > 2 && ma.has(m));
}

/** Pure : les colonnes encore vides d'une ligne, telles que le tableau les montre. */
export function colonnesVides(a) {
  const vides = [];
  if (!a.adresse) vides.push('adresse');
  if (!a.site) vides.push('site');
  if (!a.maps_url) vides.push('maps');
  if (!a.telephone && !(a.agents || []).some((x) => x.telephone)) vides.push('telephone');
  if (!(a.gerants || []).length) vides.push('gerants');
  if (!(a.agents || []).length) vides.push('agents');
  return vides;
}

/**
 * Complète, ligne par ligne, ce que le tableau montre vide : la fiche Maps de
 * l'agence (adresse, site, fiche, téléphone), son gérant à l'annuaire des
 * entreprises, puis les agents par les annonces Equimmox de la ville. Rien de
 * ce qui est rempli n'est remplacé. Le travail part en fond, comme `lancer`.
 */
export function completer(listeId, user) {
  const l = Records.get(LISTE, listeId);
  if (!l) return { ok: false, error: 'Liste introuvable.' };
  if (enCours.has(l.id)) return { ok: true, liste: resumeListe(l), deja: true };
  Records.update(LISTE, l.id, { etat: 'en_cours', etape: 'Les colonnes vides', lancee_par: user?.email || null, lancee_le: maintenant() });
  enCours.add(l.id);
  noter(l, `Je complète les colonnes vides (lancé par ${user?.full_name || user?.email || "l'équipe"}).`);
  (async () => {
    // D'abord les agences qui manquent encore à la liste, chez Apollo.
    await parApollo(l).catch((e) => noter(l, `Apollo : ${e?.message || e}`, 'alerte'));
    const aFaire = agencesDe(l.id).filter((a) => !a.fermee && colonnesVides(a).length);
    // 1. Maps : une recherche par agence à qui il manque adresse, site, fiche ou numéro.
    const M = await import('./agences-maps.js');
    let parMapsNb = 0;
    if (M.mapsConfigure()) {
      const commune = await M.communeDe(l.ville).catch(() => null);
      const pourMaps = aFaire.filter((a) => colonnesVides(a).some((c) => ['adresse', 'site', 'maps', 'telephone'].includes(c)));
      for (const [i, a] of pourMaps.entries()) {
        Records.update(LISTE, l.id, { etape: `Google Maps : ${i + 1} sur ${pourMaps.length}` });
        try {
          const t = await M.chercherAgence(a.nom, l.ville, { commune });
          if (!t || !(memeNom(a.nom, t.nom) || (t.telephone && normTel(t.telephone) === normTel(a.telephone)))) continue;
          const actuelle = Records.get(AGENCE, a.id);
          const champs = {};
          for (const k of ['adresse', 'code_postal', 'telephone', 'site', 'place_id', 'maps_url', 'note_google', 'avis_google', 'lat', 'lon']) {
            if (t[k] != null && t[k] !== '' && (actuelle[k] == null || actuelle[k] === '')) champs[k] = t[k];
          }
          if (champs.site && !actuelle.site_source) champs.site_source = 'Google Maps';
          if (Object.keys(champs).length) {
            Records.update(AGENCE, a.id, { ...champs, sources: [...new Set([...(actuelle.sources || []), 'Google Maps'])] });
            parMapsNb += 1;
          }
        } catch (e) {
          noter(l, `Google Maps : ${e?.message || e}`, 'alerte');
          break;
        }
        await pause(150);
      }
    } else {
      noter(l, "Google Maps n'est pas configuré : adresse, site et numéro ne se complètent pas.", 'alerte');
    }
    // 2. L'annuaire : le gérant, par le SIREN, sinon par le nom dans la ville.
    const { societe } = await import('../alx/annuaire.js');
    let gerantsNb = 0;
    const pourAnnuaire = agencesDe(l.id).filter((a) => !a.fermee && !(a.gerants || []).length);
    for (const [i, a] of pourAnnuaire.entries()) {
      Records.update(LISTE, l.id, { etape: `Annuaire : ${i + 1} sur ${pourAnnuaire.length}` });
      try {
        const sv = a.siren ? await societe({ siren: a.siren }) : await societe({ nom: a.raison_sociale || a.nom, ville: l.ville, code_postal: a.code_postal || null });
        // Par le nom, seule une société de la même ville, au nom qui ressemble, est prise.
        if (!sv || (!a.siren && (sv.ville_non_recoupee || !memeNom(a.nom, sv.nom || sv.denomination || '')))) continue;
        const gerants = (sv.gerants || []).filter((g) => !g.personne_morale && g.nom).slice(0, 4).map((g) => ({ nom: nomCourt(g), qualite: g.qualite || null, tranche_age: g.tranche_age || null }));
        Records.update(AGENCE, a.id, {
          annuaire_lu_le: maintenant(),
          ...(gerants.length ? { gerants } : {}),
          ...(!a.siren && sv.siren ? { siren: sv.siren } : {}),
          ...(sv.creation && !a.creation ? { creation: String(sv.creation).slice(0, 4) } : {}),
          ...(sv.effectif && !a.effectif ? { effectif: sv.effectif } : {}),
        });
        if (gerants.length) gerantsNb += 1;
      } catch (e) {
        if (/429|trop de requ/i.test(e?.message || '')) await pause(3000);
      }
      await pause(250);
    }
    // 2 bis. Apollo : chaque agence qui a un site, enrichie par son domaine
    // (numéro, LinkedIn, effectif, spécialités) ; puis les contacts des plus
    // pertinentes qui n'ont personne à joindre, au plus CONTACTS_MAX révélés.
    const A = await import('./agences-apollo.js');
    let apolloNb = 0;
    let contactsNb = 0;
    if (A.apolloConfigure()) {
      const avecSite = agencesDe(l.id).filter((a) => !a.fermee && domaineDe(a.site) && !a.apollo_lu_le);
      for (const [i, a] of avecSite.entries()) {
        Records.update(LISTE, l.id, { etape: `Apollo : ${i + 1} sur ${avecSite.length}` });
        try {
          const o = await A.enrichirAgence(domaineDe(a.site));
          const champs = { apollo_lu_le: maintenant() };
          if (o) {
            if (o.telephone && !a.telephone) champs.telephone = o.telephone;
            if (o.linkedin && !a.linkedin) champs.linkedin = o.linkedin;
            if (o.effectif && !a.effectif) champs.effectif = o.effectif;
            if (o.mots?.length) champs.apollo_mots = o.mots;
            if (o.description) champs.apollo_description = o.description;
            champs.sources = [...new Set([...(a.sources || []), 'Apollo'])];
            apolloNb += 1;
          }
          Records.update(AGENCE, a.id, champs);
        } catch (e) { noter(l, `Apollo : ${e?.message || e}`, 'alerte'); break; }
      }
      const sansContact = MA.annoter(agencesDe(l.id).filter((a) => !a.fermee && domaineDe(a.site) && !(a.agents || []).some((x) => x.email) && !a.apollo_contacts_le))
        .filter((a) => a.statut.etat !== 'morte').slice(0, CONTACTS_MAX);
      for (const a of sansContact) {
        try {
          const gens = await A.contactsDeLAgence(domaineDe(a.site), l.ville, { max: 2 });
          const agents = [...(a.agents || [])];
          for (const g of gens) if (!agents.some((x) => g.email && normEmail(x.email) === normEmail(g.email))) agents.push({ nom: g.nom, email: g.email, poste: g.poste, linkedin: g.linkedin, source: 'Apollo', annonces: 0 });
          Records.update(AGENCE, a.id, { agents, apollo_contacts_le: maintenant() });
          contactsNb += gens.length;
        } catch (e) { noter(l, `Apollo : ${e?.message || e}`, 'alerte'); break; }
      }
      noter(l, `Apollo : ${apolloNb} agence${apolloNb > 1 ? 's' : ''} enrichie${apolloNb > 1 ? 's' : ''} par leur site, ${contactsNb} contact${contactsNb > 1 ? 's' : ''} trouvé${contactsNb > 1 ? 's' : ''}.`, 'succes');
    }
    // 3. Les agents : une seule lecture des annonces de la ville, si des agences n'en ont pas.
    if (agencesDe(l.id).some((a) => !a.fermee && !(a.agents || []).length)) {
      await parEquimmox(l).catch((e) => noter(l, `Equimmox : ${e?.message || e}`, 'alerte'));
    }
    await verifierMonday(l).catch((e) => noter(l, `Monday : ${e?.message || e}`, 'alerte'));
    appliquerRegles(l.id);
    reparerListe(l.id);
    const restent = agencesDe(l.id).filter((a) => !a.fermee && colonnesVides(a).length).length;
    noter(l, `Colonnes complétées : ${parMapsNb} agence${parMapsNb > 1 ? 's' : ''} par Google Maps, ${gerantsNb} gérant${gerantsNb > 1 ? 's' : ''} trouvé${gerantsNb > 1 ? 's' : ''}. ${restent} ligne${restent > 1 ? 's' : ''} garde${restent > 1 ? 'nt' : ''} une case vide, faute de source.`, 'succes');
    Records.update(LISTE, l.id, { etat: 'fini', etape: null, fini_le: maintenant() });
  })().catch((e) => Records.update(LISTE, l.id, { etat: 'erreur', etape: null, erreur: e?.message || String(e) }))
    .finally(() => enCours.delete(l.id));
  return { ok: true, liste: resumeListe(Records.get(LISTE, l.id)) };
}

/**
 * Supprime la liste d'une ville et ses lignes. Ce qui est entré au carnet y
 * reste : le carnet, la liste du jour et Monday ne dépendent pas d'elle.
 */
export function supprimerListe(id) {
  const l = Records.get(LISTE, id);
  if (!l) return { ok: false, error: 'Liste introuvable.' };
  if (enCours.has(id)) return { ok: false, error: `L'agent cherche encore à ${l.ville} : attendez la fin pour supprimer la liste.` };
  const lignes = agencesDe(id, { toutes: true });
  for (const a of lignes) Records.delete(AGENCE, a.id);
  Records.delete(LISTE, id);
  return { ok: true, ville: l.ville, agences: lignes.length };
}

/** Au démarrage du serveur : une liste restée « en cours » ne l'est plus. */
export function reprendre() {
  for (const l of Records.list(LISTE).filter((x) => x.etat === 'en_cours')) Records.update(LISTE, l.id, { etat: 'interrompue', etape: null });
  // Les agents rangés sous le mauvais nom d'une annonce (avant le 6 oct.
  // 2026) et les doublons : chaque liste se répare, et le journal le dit.
  for (const l of Records.list(LISTE)) {
    try {
      const auto = appliquerRegles(l.id);
      if (auto) noter(l, `${auto} ligne${auto > 1 ? 's' : ''} retirée${auto > 1 ? 's' : ''} d'après les motifs de suppression appris.`, 'succes');
      const r = reparerListe(l.id);
      if (r.deplaces || r.ecartes || r.fusions || r.hors_departement) {
        noter(l, `Réparée : ${r.fusions} doublon${r.fusions > 1 ? 's' : ''} fusionné${r.fusions > 1 ? 's' : ''}, ${r.deplaces} agent${r.deplaces > 1 ? 's' : ''} remis dans leur agence, ${r.ecartes} laissé${r.ecartes > 1 ? 's' : ''} de côté (mail d'une autre agence)${r.hors_departement ? `, ${r.hors_departement} ligne${r.hors_departement > 1 ? 's' : ''} d'un autre département retirée${r.hors_departement > 1 ? 's' : ''}` : ''}.`, 'succes');
        console.log(`[agent IA] ${l.ville} réparée : ${r.fusions} doublons, ${r.deplaces} agents déplacés, ${r.ecartes} écartés`);
      }
    } catch (e) { console.warn(`[agent IA] réparation de ${l.ville} : ${e?.message || e}`); }
  }
  // Les sites déduits du mail d'un agent (avant le 5 oct. 2026) n'en sont
  // pas : ils passent dans `site_mail`, la fiche Maps donnera le vrai.
  for (const a of Records.list(AGENCE)) {
    const sources = a.sources || [];
    if (a.site && !a.site_source && sources.length && sources.every((s) => s === 'Equimmox')) Records.update(AGENCE, a.id, { site: null, site_mail: a.site });
  }
}

export { parMaps as _parMaps };

// --- Au carnet ----------------------------------------------------------------

/**
 * Une agence de la liste entre au carnet des agents : chacun de ses agents
 * (Equimmox), ou l'agence elle-même par son standard. Le carnet dédoublonne
 * par mail et par téléphone.
 */
/**
 * Le numéro d'un mandataire par Apollo (23 oct. 2026), au clic seulement : payant, il passe après l'annuaire du
 * réseau, l'annonce et le registre. Un numéro trouvé ne remplace jamais celui d'une source plus sûre.
 */
export async function numeroApollo(id, { chercher = null } = {}) {
  const a = Records.get(AGENCE, id);
  if (!a || a.genre !== 'mandataire') return { ok: false, error: 'Mandataire introuvable.' };
  const l = Records.get(LISTE, a.liste_id);
  const mots = String(a.nom || '').trim().split(/\s+/);
  const A = await import('./agences-apollo.js');
  if (!chercher && !A.apolloConfigure()) return { ok: false, error: "Apollo n'est pas branché (APOLLO_API_KEY)." };
  const r = await (chercher || A.numeroDUnePersonne)({ prenom: mots.length > 1 ? mots[0] : null, nom: mots.length > 1 ? mots.slice(1).join(' ') : mots[0], organisation: a.reseau_nom || null, ville: l?.ville || null });
  Records.update(AGENCE, a.id, { apollo_le: maintenant() });
  if (!r?.telephone && !r?.email) return { ok: true, trouve: false };
  const garde = telephoneAGarder(a.telephone ? { telephone: a.telephone, source: a.telephone_source } : null, r.telephone ? { telephone: r.telephone, source: 'apollo' } : null);
  Records.update(AGENCE, a.id, { ...(garde && garde.telephone !== a.telephone ? { telephone: garde.telephone, telephone_source: garde.source } : {}), ...(!a.email && r.email ? { email: r.email } : {}), sources: [...new Set([...(a.sources || []), 'Apollo'])] });
  return { ok: true, trouve: true, telephone: Records.get(AGENCE, a.id).telephone };
}

/**
 * Une page d'annuaire collée par quelqu'un de l'équipe (23 oct. 2026) : chaque personne lue entre dans la liste comme
 * mandataire du réseau choisi, son numéro marqué « annuaire » (la source la plus sûre). Rend ce qui a été fait.
 */
export function collerMandataires(listeId, { texte, reseau }, user = null) {
  const l = Records.get(LISTE, listeId);
  if (!l) return { ok: false, error: 'Liste introuvable.' };
  const r = RESEAUX.find((x) => x.cle === reseau);
  if (!r) return { ok: false, error: 'Choisissez le réseau.' };
  const gens = lireCollage(texte);
  if (!gens.length) return { ok: false, error: "Je ne lis aucun nom dans ce texte : copiez la page de résultats (les fiches, avec les numéros affichés)." };
  let nouveaux = 0;
  let completes = 0;
  for (const g of gens) {
    const x = rangerMandataire(listeId, { nom: g.nom, reseau: r.cle, reseau_nom: r.nom, telephone: g.telephone, telephone_source: 'annuaire', code_postal: g.code_postal || null, sources: [`Annuaire ${r.nom}`], colle_par: user?.email || null });
    if (x.nouveau) nouveaux += 1; else completes += 1;
  }
  noter(l, `Annuaire ${r.nom} collé${user?.email ? ` par ${user.email.split('@')[0]}` : ''} : ${gens.length} conseillers lus, ${nouveaux} nouveaux, ${completes} déjà connus complétés, ${gens.filter((g) => g.telephone).length} avec un numéro.`, 'succes');
  return { ok: true, lus: gens.length, nouveaux, completes, avec_numero: gens.filter((g) => g.telephone).length, sans_numero: gens.filter((g) => !g.telephone).map((g) => g.nom) };
}

/** Pure : la fiche de carnet d'un mandataire : la personne, son réseau en guise d'agence. */
export const contactMandataire = (a) => ({
  nom: a.nom, agence: a.reseau_nom ? `${a.reseau_nom} (mandataire)` : 'Mandataire indépendant', email: a.email || null, telephone: a.telephone || null,
  annonces: a.annonces || 0, remarque: [a.reseau_nom ? `Mandataire ${a.reseau_nom}` : 'Mandataire en nom propre', a.siren ? `SIREN ${a.siren}` : null, a.publie_commerce ? 'publie du commerce' : null].filter(Boolean).join(' · '),
});

export async function auCarnet(agenceId, { agent = null } = {}, user = null) {
  const a = Records.get(AGENCE, agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  const l = Records.get(LISTE, a.liste_id);
  const C = await import('./carnet.js');
  const base = { agence: a.nom, ville: l?.ville || null, onglet: l?.ville || null, adresse: a.adresse || null, source: `Agent IA · ${(a.sources || []).join(', ')}` };
  const agents = (a.agents || []).filter((x) => agent == null || x.email === agent || x.telephone === agent);
  // Un mandataire entre au carnet comme la personne qu'il est, avec son réseau (23 oct. 2026).
  const candidats = a.genre === 'mandataire'
    ? [{ ...base, ...contactMandataire(a) }]
    : agents.length
    ? agents.map((x) => ({ ...base, nom: x.nom || a.nom, email: x.email, telephone: x.telephone, annonces: x.annonces || 0 }))
    : [{ ...base, nom: a.gerants?.[0]?.nom || a.nom, email: a.email, telephone: a.telephone, remarque: a.gerants?.[0] ? `Gérant de ${a.nom}` : null }];
  // Sans mail ni téléphone, personne à appeler : rien n'entre au carnet.
  if (!candidats.some((c) => c.email || c.telephone)) return { ok: false, error: "Ni mail ni téléphone : l'agence ne peut pas entrer au carnet." };
  const r = C.integrer(candidats.filter((c) => c.email || c.telephone));
  const id = r.crees[0]?.id || C.agents().find((x) => (x.telephones || []).includes(normTel(candidats[0].telephone)) || (x.emails || []).includes(normEmail(candidats[0].email)))?.id || null;
  if (!r.crees.length && !r.completes) return { ok: false, error: "Ni mail ni téléphone : l'agence ne peut pas entrer au carnet." };
  Records.update(AGENCE, a.id, { carnet_id: id, au_carnet_le: maintenant(), au_carnet_par: user?.email || null });
  return { ok: true, crees: r.crees.length, completes: r.completes };
}

/**
 * Appeler depuis une liste : l'agence (son standard, au nom de son gérant)
 * ou l'un de ses agents entre au carnet s'il n'y est pas, et l'on rend sa
 * fiche du carnet, pour ouvrir le panneau d'appel (verrou, enregistrement,
 * propositions d'AK, mail prêt).
 */
export async function pourAppeler(agenceId, { agent = null } = {}, user = null) {
  const a = Records.get(AGENCE, agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  const l = Records.get(LISTE, a.liste_id);
  const x = agent ? (a.agents || []).find((y) => y.email === agent || y.telephone === agent) : null;
  if (agent && !x) return { ok: false, error: 'Agent introuvable.' };
  const c = a.genre === 'mandataire' ? contactMandataire(a) : x
    ? { nom: x.nom || x.email || a.nom, agence: a.nom, email: x.email, telephone: x.telephone, annonces: x.annonces || 0 }
    : { nom: a.gerants?.[0]?.nom || a.nom, agence: a.nom, email: a.email, telephone: a.telephone, remarque: a.gerants?.[0] ? `Gérant de ${a.nom}` : null };
  if (!c.telephone) return { ok: false, error: 'Pas de numéro à appeler.' };
  const C = await import('./carnet.js');
  const R = await import('./regles.js');
  const r = C.integrer([{ ...c, ville: l?.ville || null, onglet: l?.ville || null, adresse: a.adresse || null, source: `Agent IA · ${(a.sources || []).join(', ')}` }]);
  const tel = normTel(c.telephone);
  const fiche = r.crees[0] || C.agents().find((y) => (y.telephones || []).map(R.normTel).includes(tel) || (c.email && (y.emails || []).includes(normEmail(c.email))));
  if (!fiche) return { ok: false, error: "L'agence n'a pas pu entrer au carnet." };
  if (!a.carnet_id) Records.update(AGENCE, a.id, { carnet_id: fiche.id, au_carnet_le: maintenant(), au_carnet_par: user?.email || null });
  // Qui appelle quoi (13 oct. 2026, Jules) : l'agence qu'on appelle s'associe d'elle-même à celui qui
  // appelle, si personne ne la tient ; les files des collègues passent alors par-dessus.
  const moi = normEmail(user?.email || '');
  const pour = Records.get(AGENCE, a.id)?.pour || [];
  if (moi && !pour.length && !Records.get(LISTE, a.liste_id)?.essai) Records.update(AGENCE, a.id, { pour: [moi] });
  return { ok: true, agent_id: fiche.id };
}
