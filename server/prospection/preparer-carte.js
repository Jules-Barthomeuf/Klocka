// La carte d'avant l'appel préparée d'avance (17 nov. 2026, Jules : « que les photos arrivent en même temps que le
// reste »). Ouverte à froid, la carte attendait 30 à 60 secondes ses photos : l'équipe Apollo, puis le site et les noms
// complets, puis les têtes par Google Images, chacune lancée à une relecture de l'écran. Ici la chaîne entière tourne
// d'un trait, pour l'agence ouverte et pour les suivantes de la file, pendant l'appel en cours : quand l'agence arrive,
// tout est déjà là (équipe, numéros du site, photos, résumé IA).
//
// Chaque étape garde ce qu'elle trouve sur l'agence et évite déjà les doublons (une recherche en cours se reprend) :
// préparer une carte que l'écran est en train d'ouvrir ne refait rien.

import { Records } from '../db.js';

const AGENCE = 'AgenceProspect';
const EN_COURS = new Map();
const FILE = [];
let tourne = false;

const villeDe = (a) => a?.ville || (a?.liste_id && Records.get('ListeAgences', a.liste_id)?.ville) || null;

/** La chaîne complète d'une agence ; la même promesse tant qu'elle tourne. */
export function preparerCarte(agenceId, { ville = null } = {}) {
  if (!agenceId || process.env.NODE_TEST_CONTEXT) return Promise.resolve();
  if (EN_COURS.has(agenceId)) return EN_COURS.get(agenceId);
  const p = (async () => {
    const lu = () => Records.get(AGENCE, agenceId);
    let a = lu();
    if (!a) return;
    const AP = await import('./agences-apollo.js');
    const SA = await import('./site-agence.js');
    const PE = await import('./photos-equipe.js');
    let gens = [];
    try { gens = await AP.equipeDeLAgence(a, { ville: ville || villeDe(a) }); } catch { /* sans Apollo, le reste se fait */ }
    a = lu();
    // Les noms complets et le site en même temps : ils ne dépendent pas l'un de l'autre.
    const siteAFaire = !a?.site_lu && (!!a?.site || (a?.genre !== 'mandataire' && !a?.site_cherche_le && !!(a?.telephone || a?.adresse)));
    await Promise.all([
      gens.length && !a?.apollo_equipe?.noms_cherches_le ? AP.chercherNomsComplets(agenceId).catch(() => {}) : null,
      siteAFaire ? SA.lireSiteAgence(agenceId).catch(() => {}) : null,
    ]);
    a = lu();
    const noms = [...(a.agents || []).map((x) => x.nom), ...(a.gerants || []).map((g) => g.nom), ...(a.apollo_equipe?.gens || []).map((g) => g.nom_complet)].filter(Boolean);
    await PE.photosDeLAgence(a, noms).catch(() => {});
    a = lu();
    const MA = await import('./mode-appel.js');
    const fiche = a.carnet_id ? Records.get('AgentImmo', a.carnet_id) : null;
    const cherches = a.photos_equipe?.cherches || {};
    const sansTete = MA.contactsDe(a, fiche, null)
      .filter((x) => !x.standard && !x.photo && !/\s\p{L}\.$/u.test(String(x.nom || '').trim()) && !cherches[PE.cleNom(x.nom)]).slice(0, 4);
    if (sansTete.length && PE.imagesBranchees()) await PE.chercherPhotosImages(agenceId, sansTete.map((x) => ({ nom: x.nom }))).catch(() => {});
    // Le résumé IA en dernier : il dit ce que le site vient d'apprendre (villes, taille, offres).
    await (await import('./resume-agence.js')).resumeDeLAgence(agenceId).catch(() => {});
  })().catch((e) => console.warn(`[carte préparée] ${agenceId} : ${e?.message || e}`)).finally(() => EN_COURS.delete(agenceId));
  EN_COURS.set(agenceId, p);
  return p;
}

/**
 * Les agences suivantes de la file, une après l'autre (pas toutes à la fois : chacune lit un site et appelle Apollo).
 * Une agence déjà en attente n'est pas remise ; la file d'attente garde les dernières demandées.
 */
export function preparerSuivantes(ids = [], { max = 3 } = {}) {
  for (const id of ids.filter(Boolean).slice(0, max)) {
    if (!FILE.includes(id) && !EN_COURS.has(id)) FILE.push(id);
  }
  while (FILE.length > 12) FILE.shift();
  if (!tourne) {
    tourne = true;
    (async () => {
      try { while (FILE.length) await preparerCarte(FILE.shift()); } finally { tourne = false; }
    })();
  }
  return { en_attente: FILE.length };
}
