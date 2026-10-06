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

import { Records } from '../db.js';
import { norm, normEmail, normTel, telAffiche } from './regles.js';

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
/** Pure : le domaine d'un site ou d'un mail, sans les messageries grand public. */
export function domaineDe(x) {
  const d = String(x || '').toLowerCase().replace(/^.*@/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].trim();
  return !d || /^(gmail|hotmail|yahoo|outlook|orange|free|sfr|wanadoo|laposte|icloud|live|neuf|bbox|aol)\./.test(d) ? null : d;
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
    id: l.id, ville: l.ville, etat: l.etat, etape: l.etape || null, lancee_par: l.lancee_par || null, lancee_le: l.lancee_le || null, fini_le: l.fini_le || null,
    agences: a.length, avec_telephone: a.filter((x) => x.telephone).length, agents: a.reduce((n, x) => n + (x.agents || []).length, 0),
    au_carnet: a.filter((x) => x.carnet_id).length, deja_monday: a.filter((x) => x.monday_connu).length, journal: (l.journal || []).slice(0, 12),
  };
}

export const listes = () => Records.list(LISTE).sort((a, b) => a.ville.localeCompare(b.ville, 'fr')).map(resumeListe);

export function liste(id) {
  const l = Records.get(LISTE, id);
  if (!l) return null;
  // Un agent du carnet en cours d'appel (verrou tenu) : son agence porte un cadenas.
  const carnet = new Map(Records.list('AgentImmo').map((x) => [x.id, x]));
  const enAppel = (a) => {
    const v = carnet.get(a.carnet_id)?.verrou;
    return v?.par && Date.now() - Date.parse(v.le) < 30 * 60000 ? v.par : null;
  };
  const agences = agencesDe(id).map((a) => ({ ...a, en_appel_par: enAppel(a) })).sort((a, b) => (b.annonces || 0) - (a.annonces || 0) || (b.agents || []).length - (a.agents || []).length || String(a.nom).localeCompare(String(b.nom), 'fr'));
  return { ...resumeListe(l), lignes: agences };
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
  for (let page = 1; page <= Math.min(r.pages, 40); page += 1) {
    const res = page === 1 ? r : await M.resultats(p.prospective.jeton, { page, user });
    if (!res.ok) { noter(l, `Data-B : page ${page} illisible (${res.error}).`, 'alerte'); break; }
    for (const d of res.resultats) {
      if (!estAgence(d)) { ecartes += 1; continue; }
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
  noter(l, `Data-B : ${r.total} établissements « Immobilier » lus, ${ecartes} écartés (syndics, gestion, promotion, SCI…), ${nouvelles} nouvelles agences dans la liste.`, 'succes');
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
  const agents = r.buffer ? agentsDesAnnonces(lireXlsx(r.buffer), { classes: [], ville: r.ville }) : [];
  let rattaches = 0;
  let nees = 0;
  for (const ag of agents) {
    // Equimmox ne nomme pas l'agent : son mail le dit souvent (« jean.dupont@… » → Jean Dupont).
    const agent = { nom: nomDuMail(ag.email), email: ag.email || null, telephone: ag.telephone ? telAffiche(ag.telephone) : null, annonces: ag.annonces || 0 };
    ag.agence = String(ag.agence || '').replace(/\s*\([^)]*\)\s*$/, '');
    if (!agent.email && !agent.telephone) continue;
    if (PAS_UNE_AGENCE.test(String(ag.agence || '').replace(/\s*\([^)]*\)\s*$/, '').trim())) continue;
    const dom = domaineDe(agent.email);
    // Le nom d'abord : le domaine du mail d'un agent n'est pas toujours celui
    // de l'agence où il publie (un agent CBRE pour « Berge Immobilier »).
    const ici = agencesDe(l.id);
    let a = (ag.agence && ici.find((x) => cleAgence(x.nom) === cleAgence(ag.agence)))
      || (dom && ici.find((x) => domaineDe(x.site) === dom || domaineDe(x.email) === dom));
    if (!a) {
      // Jamais de site déduit d'un mail : la fiche Maps le donnera, ou rien.
      a = ranger(l.id, { nom: casse(ag.agence || agent.nom || agent.email), sources: ['Equimmox'] }).agence;
      nees += 1;
    }
    const liste = a.agents || [];
    const meme = liste.find((x) => (agent.email && normEmail(x.email) === normEmail(agent.email)) || (agent.telephone && normTel(x.telephone) === normTel(agent.telephone)));
    const agentsMaj = meme ? liste.map((x) => (x === meme ? { ...x, ...Object.fromEntries(Object.entries(agent).filter(([, v]) => v)) } : x)) : [...liste, agent];
    Records.update(AGENCE, a.id, { agents: agentsMaj, annonces: agentsMaj.reduce((n, x) => n + (x.annonces || 0), 0), sources: [...new Set([...(a.sources || []), 'Equimmox'])] });
    rattaches += 1;
  }
  noter(l, `Equimmox : ${agents.length} agents qui publient à ${r.ville}, ${rattaches} rangés dans leur agence${nees ? ` (${nees} agences en plus)` : ''}.`, 'succes');
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
    await parAnnuaire(l).catch((e) => noter(l, `Annuaire : ${e?.message || e}`, 'alerte'));
    await parEquimmox(l).catch((e) => noter(l, `Equimmox : ${e?.message || e}`, 'alerte'));
    await verifierMonday(l).catch((e) => noter(l, `Monday : ${e?.message || e}`, 'alerte'));
    const fin = resumeListe(Records.get(LISTE, l.id));
    noter(l, `Fini : ${fin.agences} agences, ${fin.avec_telephone} avec un numéro, ${fin.agents} agents.`, 'succes');
    Records.update(LISTE, l.id, { etat: 'fini', etape: null, fini_le: maintenant() });
  })().catch((e) => Records.update(LISTE, l.id, { etat: 'erreur', etape: null, erreur: e?.message || String(e) }))
    .finally(() => enCours.delete(l.id));
  return { ok: true, liste: resumeListe(Records.get(LISTE, l.id)) };
}

// --- Compléter les colonnes vides -------------------------------------------

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
    // 3. Les agents : une seule lecture des annonces de la ville, si des agences n'en ont pas.
    if (agencesDe(l.id).some((a) => !a.fermee && !(a.agents || []).length)) {
      await parEquimmox(l).catch((e) => noter(l, `Equimmox : ${e?.message || e}`, 'alerte'));
    }
    await verifierMonday(l).catch((e) => noter(l, `Monday : ${e?.message || e}`, 'alerte'));
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
export async function auCarnet(agenceId, { agent = null } = {}, user = null) {
  const a = Records.get(AGENCE, agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  const l = Records.get(LISTE, a.liste_id);
  const C = await import('./carnet.js');
  const base = { agence: a.nom, ville: l?.ville || null, onglet: l?.ville || null, adresse: a.adresse || null, source: `Agent IA · ${(a.sources || []).join(', ')}` };
  const agents = (a.agents || []).filter((x) => agent == null || x.email === agent || x.telephone === agent);
  const candidats = agents.length
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
  const c = x
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
  return { ok: true, agent_id: fiche.id };
}
