// L'agent IA de la prospection des agents immobiliers (page Prospection,
// onglets Agent IA et Listes). On lui donne une ville ; il y cherche toutes
// les agences immobilières et range ce qu'il trouve dans la liste de la
// ville, partagée par toute l'équipe (une liste Nice, une liste Lyon…). Une
// ville relancée complète sa liste, sans doublon.
//
//   1. Data-B      les établissements « Immobilier » de la commune : nom,
//                  adresse, téléphone, mail, site, SIRET (une prospective) ;
//   2. l'annuaire  des entreprises, par SIREN : le gérant, la création,
//                  l'effectif (gratuit) ;
//   3. Equimmox    les agents qui publient des annonces dans la ville, avec
//                  leur mail et leur téléphone, rattachés à leur agence par
//                  son nom ou le domaine de son site ; un agent d'une agence
//                  que Data-B ne connaît pas fait naître la sienne.
//
// Rien ne part vers une agence : « Au carnet » la fait entrer dans la
// prospection (le carnet des agents, la liste du jour, Monday), d'un clic.

import { Records } from '../db.js';
import { norm, normEmail, normTel, telAffiche } from './regles.js';

const LISTE = 'ListeAgences';
const AGENCE = 'AgenceProspect';
const METIER_IMMOBILIER = '59';
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

const agencesDe = (listeId) => Records.list(AGENCE).filter((a) => a.liste_id === listeId);

function resumeListe(l) {
  const a = agencesDe(l.id);
  return {
    id: l.id, ville: l.ville, etat: l.etat, etape: l.etape || null, lancee_par: l.lancee_par || null, lancee_le: l.lancee_le || null, fini_le: l.fini_le || null,
    agences: a.length, avec_telephone: a.filter((x) => x.telephone).length, agents: a.reduce((n, x) => n + (x.agents || []).length, 0),
    au_carnet: a.filter((x) => x.carnet_id).length, journal: (l.journal || []).slice(0, 12),
  };
}

export const listes = () => Records.list(LISTE).sort((a, b) => a.ville.localeCompare(b.ville, 'fr')).map(resumeListe);

export function liste(id) {
  const l = Records.get(LISTE, id);
  if (!l) return null;
  const agences = agencesDe(id).sort((a, b) => (b.annonces || 0) - (a.annonces || 0) || (b.agents || []).length - (a.agents || []).length || String(a.nom).localeCompare(String(b.nom), 'fr'));
  return { ...resumeListe(l), lignes: agences };
}

// --- Ranger une agence, sans doublon ---------------------------------------

/** L'agence déjà dans la liste : même SIRET, même téléphone, même nom ou même domaine. */
function retrouver(listeId, a) {
  const tel = normTel(a.telephone);
  const cle = cleAgence(a.nom);
  const dom = domaineDe(a.site) || domaineDe(a.email);
  return agencesDe(listeId).find((x) => (a.siret && x.siret === a.siret)
    || (tel && normTel(x.telephone) === tel)
    || (cle && cle.length > 2 && cleAgence(x.nom) === cle)
    || (dom && (domaineDe(x.site) === dom || domaineDe(x.email) === dom))) || null;
}

export function ranger(listeId, a) {
  const deja = retrouver(listeId, a);
  if (!deja) return { agence: Records.create(AGENCE, { liste_id: listeId, agents: [], gerants: [], sources: [], ...a, cree_le: maintenant() }), nouvelle: true };
  // On complète ce qui manque, sans écraser ce qu'on avait.
  const champs = {};
  for (const [k, v] of Object.entries(a)) if (v != null && v !== '' && (deja[k] == null || deja[k] === '') && !Array.isArray(v)) champs[k] = v;
  champs.sources = [...new Set([...(deja.sources || []), ...(a.sources || [])])];
  return { agence: Records.update(AGENCE, deja.id, champs), nouvelle: false };
}

// --- 1. Data-B ----------------------------------------------------------------

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
  for (let page = 1; page <= Math.min(r.pages, 40); page += 1) {
    const res = page === 1 ? r : await M.resultats(p.prospective.jeton, { page, user });
    if (!res.ok) { noter(l, `Data-B : page ${page} illisible (${res.error}).`, 'alerte'); break; }
    for (const d of res.resultats) {
      const { nouvelle } = ranger(l.id, {
        nom: casse(d.enseigne || d.nom), raison_sociale: d.nom || null, siret: d.siret || null, siren: d.siren || null,
        adresse: d.adresse ? casse(d.adresse) : null, code_postal: d.code_postal || null,
        telephone: d.telephone ? telAffiche(d.telephone) : null, email: (d.emails || [])[0] || null, site: d.site || null,
        effectif: d.effectif || null, creation: d.creation || null, lat: d.lat ?? null, lon: d.lon ?? null, sources: ['Data-B'],
      });
      if (nouvelle) nouvelles += 1;
    }
    Records.update(LISTE, l.id, { etape: `Data-B : page ${page} sur ${r.pages}` });
  }
  noter(l, `Data-B : ${r.total} établissements « Immobilier » lus, ${nouvelles} nouvelles agences dans la liste.`, 'succes');
  return nouvelles;
}

// --- 2. L'annuaire des entreprises : le gérant ------------------------------

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

// --- 3. Equimmox : les agents qui publient ----------------------------------

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
    const dom = domaineDe(agent.email);
    let a = agencesDe(l.id).find((x) => (ag.agence && cleAgence(x.nom) === cleAgence(ag.agence)) || (dom && (domaineDe(x.site) === dom || domaineDe(x.email) === dom)));
    if (!a) {
      a = ranger(l.id, { nom: casse(ag.agence || agent.nom || agent.email), site: dom ? `https://${dom}` : null, sources: ['Equimmox'] }).agence;
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
    await parDataB(l, user).catch((e) => noter(l, `Data-B : ${e?.message || e}`, 'alerte'));
    await parAnnuaire(l).catch((e) => noter(l, `Annuaire : ${e?.message || e}`, 'alerte'));
    await parEquimmox(l).catch((e) => noter(l, `Equimmox : ${e?.message || e}`, 'alerte'));
    const fin = resumeListe(Records.get(LISTE, l.id));
    noter(l, `Fini : ${fin.agences} agences, ${fin.avec_telephone} avec un numéro, ${fin.agents} agents.`, 'succes');
    Records.update(LISTE, l.id, { etat: 'fini', etape: null, fini_le: maintenant() });
  })().catch((e) => Records.update(LISTE, l.id, { etat: 'erreur', etape: null, erreur: e?.message || String(e) }))
    .finally(() => enCours.delete(l.id));
  return { ok: true, liste: resumeListe(Records.get(LISTE, l.id)) };
}

/** Au démarrage du serveur : une liste restée « en cours » ne l'est plus. */
export function reprendre() {
  for (const l of Records.list(LISTE).filter((x) => x.etat === 'en_cours')) Records.update(LISTE, l.id, { etat: 'interrompue', etape: null });
}

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
