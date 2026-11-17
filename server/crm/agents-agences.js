// Les agents immobiliers de Twenty CRM rapprochés de leur agence (17 nov. 2026, Jules : « reprends les 612 agents
// immobiliers et assigne les agences de ces agents dans la page Agences ; contacté, ça veut dire que c'est des gens
// qu'on a mis dans Agent immo »). Une agence dont un agent est dans « Agent immobilier » est en contact ; l'agence d'un
// agent qui n'est dans aucune liste est ajoutée au tableau Agences, dans la ville de l'agent.
//
// Pur : rien n'est lu ni écrit ici ; server/crm/agences-twenty.js s'en sert pour poser les lignes.

import { valeurOption } from './correspondance.js';

/** Les boîtes mail de tout le monde : leur domaine ne dit rien de l'agence. */
const GENERIQUES = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|aol|orange|wanadoo|free|sfr|neuf|bbox|laposte|club-internet|numericable|gmx|protonmail|proton|mail|libertysurf|aliceadsl|cegetel|noos|voila|tele2)\./i;
/** Les réseaux : un même domaine pour des centaines d'agences (ou de mandataires), il ne désigne pas une agence. */
const RESEAUX = /^(iadfrance|iad|safti|capifrance|optimhome|bskimmobilier|efficity|proprietes-privees|megagence|lafourmi-immo|century21|orpi|laforet|guyhoquet|guy-hoquet|era|eraimmobilier|stephaneplazaimmobilier|nestenn|square-habitat|citya|foncia|arthurimmo|arthur-immo|keller-williams|kw|kwfrance|expfrance|exp|sextantfrance|immoreseau|lafrancedesagences|bnppre|cbre|jll|cushwake|savills|knightfrank|ladresse|tissot|cerenicimo|michael-zingraf|barnes-international|sothebysrealty|engelvoelkers|vaneau|immo-diffusion|akiliimmobilier|dr-house-immo|homeandco)\./i;

const ascii = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Les mots qui ne distinguent pas une agence d'une autre. */
const MOTS_VIDES = new Set(['immobilier', 'immobiliere', 'immobilieres', 'immobiliers', 'immo', 'agence', 'agences', 'cabinet', 'groupe', 'transaction', 'transactions', 'commerce', 'commerces', 'entreprise', 'entreprises', 'conseil', 'conseils', 'sarl', 'sas', 'sasu', 'eurl', 'sa', 'sci', 'la', 'le', 'les', 'l', 'de', 'du', 'des', 'd', 'et', 'en', 'a', 'au', 'aux', 'the', 'and', 'by', 'france', 'immobilierentreprise', 'pro']);

/** Pure : le nom d'une agence réduit à ce qui la distingue (« L'Agence de Lille » → « lille »). */
export function nomNet(t) {
  return ascii(t).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((m) => m && !MOTS_VIDES.has(m)).join(' ');
}

/** Pure : le domaine d'un mail ou d'un site, sans www ; null pour une boîte de tout le monde ou un réseau. */
export function domaineDe(t, { reseaux = false } = {}) {
  const s = String(t || '').trim().toLowerCase();
  if (!s) return null;
  const d = (s.includes('@') ? s.split('@').pop() : s.replace(/^[a-z]+:\/\//, '').split('/')[0]).replace(/^www\./, '').trim();
  if (!d || !d.includes('.')) return null;
  if (GENERIQUES.test(d)) return null;
  if (!reseaux && RESEAUX.test(d)) return null;
  return d;
}

const chiffres = (t) => String(t || '').replace(/\D/g, '');
/** Pure : les neuf derniers chiffres d'un numéro français, pour comparer +33 6… et 06…. */
export const neufChiffres = (t) => { const c = chiffres(t); return c.length >= 9 ? c.slice(-9) : null; };
const telDe = (x) => neufChiffres(x?.telephone?.primaryPhoneNumber || (typeof x?.telephone === 'string' ? x.telephone : ''));

/** Les villes mal tapées ou dites autrement dans « Agent immobilier ». */
const VILLES_DITES = { monptellier: 'Montpellier', pairs: 'Paris', vincenne: 'Vincennes', chartrons: 'Bordeaux', 'paris et ses environs': 'Paris', 'nice et alentours': 'Nice', 'france lyon': 'Lyon', 'la ciotat marseille': 'La Ciotat', 'st nazaire': 'Saint-Nazaire', 'saint die des vosge': 'Saint-Dié-des-Vosges', 'pays basque': 'Bayonne' };
/** Des régions ou rien de précis : pas de ville. */
const PAS_UNE_VILLE = /^(france|idf|ile de france|paca|bretagne|savoie|alsace|essai)$/;

/**
 * Pure : la ville d'un agent, propre (17 nov. 2026) : « Paris 17 » et « Paris - 11 » → Paris, « Lyon - 9 » → Lyon,
 * « AIx en Provence » → Aix en Provence, les fautes connues corrigées, une région → null.
 */
export function villeNette(v) {
  let t = String(v || '').trim();
  if (!t) return null;
  const cle = ascii(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (PAS_UNE_VILLE.test(cle) || /essai/.test(cle)) return null;
  if (VILLES_DITES[cle]) return VILLES_DITES[cle];
  t = t.replace(/\s*-?\s*\d{1,2}(e|eme|ème)?$/i, '').trim();
  // La casse : « CANET EN ROUSSILLON », « fréjus », « AIx en Provence » → première lettre de chaque mot.
  return t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, l) => sep + l.toUpperCase()).replace(/\b(En|De|Du|Des|Sur|Les|La|Le|Et)\b(?!$)/g, (m, x, i) => (i ? x.toLowerCase() : x));
}

/** Pure : la ville d'un agent comme l'option Ville du tableau Agences. */
export const villeOption = (v) => { const n = villeNette(v); return n ? valeurOption(n) : null; };

/** Une ligne d'essai : ville ou entreprise d'essai, Klocka elle-même. */
export const estEssai = (a) => /essai/i.test(`${a?.ville || ''} ${a?.entreprise || ''} ${a?.name || ''}`) || /klocka/i.test(`${a?.entreprise || ''} ${a?.eMail?.primaryEmail || ''}`);

/** Deux noms nets désignent-ils la même agence ? Égaux, ou l'un contient l'autre en mots entiers (quatre lettres au moins).
 *  Le nom de la ville ne compte pas : « Lille Immo » n'est pas « L'Agence de Lille ». */
export function memesNoms(a0, b0, ville = '') {
  const sans = nomNet(String(ville || '').replace(/_/g, ' ')).split(' ').filter(Boolean);
  const ote = (x) => x.split(' ').filter((m) => !sans.includes(m)).join(' ');
  const a = ote(a0 || '');
  const b = ote(b0 || '');
  if (!a || !b) return false;
  if (a === b) return true;
  const [court, long] = a.length <= b.length ? [a, b] : [b, a];
  return court.replace(/ /g, '').length >= 4 && ` ${long} `.includes(` ${court} `);
}

/**
 * Pure : chaque agent rapproché d'une ligne du tableau Agences.
 *  1. son téléphone : la ligne de l'agence, ou un interlocuteur de l'agence ;
 *  2. le domaine de son mail (ni boîte de tout le monde, ni réseau) : le mail ou le site de l'agence, de sa ville d'abord ;
 *  3. le nom de son entreprise, dans sa ville.
 * Rend { parAgence: Map(id ligne → agents), aCreer: [{ ville, nom, agents }], sansAgence: agents }.
 * Les agents d'une même entreprise dans une même ville font une seule agence à créer.
 */
export function rapprocher(agents, agences) {
  const parTel = new Map();
  const parDomaine = new Map();
  const parVille = new Map();
  for (const g of agences) {
    const t = telDe(g);
    if (t) parTel.set(t, g);
    for (const c of String(g.interlocuteurs || '').split('\n')) { const n = neufChiffres(c.split(' · ').pop()); if (n && !parTel.has(n)) parTel.set(n, g); }
    for (const d of [domaineDe(g.email?.primaryEmail), domaineDe(g.siteWeb?.primaryLinkUrl)].filter(Boolean)) {
      if (!parDomaine.has(d)) parDomaine.set(d, []);
      if (!parDomaine.get(d).includes(g)) parDomaine.get(d).push(g);
    }
    const v = g.ville || '';
    if (!parVille.has(v)) parVille.set(v, []);
    parVille.get(v).push({ g, nom: nomNet(g.name) });
  }
  const parAgence = new Map();
  const aCreer = new Map();
  const sansAgence = [];
  const lier = (g, a, par) => { if (!parAgence.has(g.id)) parAgence.set(g.id, []); parAgence.get(g.id).push({ ...a, par }); };
  for (const a of agents) {
    if (estEssai(a)) continue;
    const ville = villeOption(a.ville);
    const t = telDe(a);
    if (t && parTel.has(t)) { lier(parTel.get(t), a, 'téléphone'); continue; }
    const d = domaineDe(a.eMail?.primaryEmail);
    const parD = d ? parDomaine.get(d) || [] : [];
    const parDIci = parD.filter((g) => g.ville === ville);
    if (parDIci.length || parD.length === 1) { lier(parDIci[0] || parD[0], a, 'mail'); continue; }
    const nom = nomNet(a.entreprise);
    const memeNom = nom && ville ? (parVille.get(ville) || []).filter((x) => memesNoms(x.nom, nom, ville)) : [];
    if (memeNom.length) {
      // Plusieurs agences du même nom dans la ville : la plus proche du nom (égal d'abord).
      const choisie = memeNom.find((x) => x.nom === nom) || memeNom[0];
      lier(choisie.g, a, 'nom');
      continue;
    }
    if (!nom && !d) { sansAgence.push(a); continue; }
    const cle = `${ville || ''}|${nom || d}`;
    if (!aCreer.has(cle)) aCreer.set(cle, { cle, ville: villeNette(a.ville), nom: String(a.entreprise || '').trim() || d, domaine: d, agents: [] });
    aCreer.get(cle).agents.push(a);
  }
  return { parAgence, aCreer: [...aCreer.values()], sansAgence };
}
