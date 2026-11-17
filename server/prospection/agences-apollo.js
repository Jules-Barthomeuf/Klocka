// Les agences immobilières d'une ville, et leurs contacts, chez Apollo
// (6 oct. 2026). Trois usages, du moins cher au plus cher :
//
//   1. La recherche d'entreprises (mixed_companies/search) : des agences que
//      Google Maps et Data-B n'ont pas, avec site, numéro et LinkedIn. Apollo
//      ne rend ni la ville ni le secteur en clair : on garde les codes
//      d'activité d'agence immobilière (NAICS 53121x, SIC 6531), et on écarte
//      promoteurs, conciergeries et salons.
//   2. L'enrichissement d'une agence par son domaine (organizations/enrich) :
//      numéro, LinkedIn, effectif, et ses spécialités, qui disent si elle fait
//      du commerce ou du résidentiel.
//   3. Ses contacts (mixed_people/api_search puis people/match) : la
//      recherche masque le nom ; le révéler coûte un crédit par personne, d'où
//      un plafond par passage.
//
// Chaque réponse est gardée 90 jours (ApolloRecherche) : on ne repaie pas.

import { Records } from '../db.js';
import { telAffiche } from './regles.js';

const API = 'https://api.apollo.io/api/v1';
const cle = () => (process.env.APOLLO_API_KEY || '').trim();
export const apolloConfigure = () => !!cle();
const GARDE_MS = 90 * 86400000;
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function appeler(chemin, { methode = 'POST', corps = null, lire = fetch } = {}) {
  const r = await lire(`${API}${chemin}`, {
    method: methode,
    headers: { 'content-type': 'application/json', 'x-api-key': cle(), 'cache-control': 'no-cache' },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 401 || r.status === 403) throw new Error('Apollo refuse la clé (APOLLO_API_KEY).');
  if (r.status === 429) throw new Error('Apollo : trop de demandes, on reprendra plus tard.');
  if (r.status === 422 || r.status === 402) throw new Error('Apollo : crédits épuisés ou demande refusée.');
  return r.ok ? r.json().catch(() => ({})) : {};
}

/** Une réponse gardée 90 jours, sinon le travail et sa mise en mémoire. */
async function enMemoire(cleRecherche, travail) {
  const deja = Records.filter('ApolloRecherche', { cle: cleRecherche })[0];
  if (deja && Date.now() - Date.parse(deja.le) < GARDE_MS) return deja.contact;
  const contact = await travail();
  if (deja) Records.update('ApolloRecherche', deja.id, { contact, le: new Date().toISOString() });
  else Records.create('ApolloRecherche', { cle: cleRecherche, contact, le: new Date().toISOString() });
  return contact;
}

const PAS_AGENCE = /(promotion|promoteur|conciergerie|expo|salon|syndic|financ|credit|courtage|diagnostic|formation|ecole|architect|construction|batiment|btp)/i;
const NOM_IMMO = /(immo|immobili|real estate|transaction|commerces?|properties|propriet|agence)/i;

/** Pure : une entreprise Apollo est-elle une agence immobilière ? Ses codes d'activité d'abord, son nom à défaut. */
export function estAgenceApollo(o) {
  const nom = String(o?.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (PAS_AGENCE.test(nom)) return false;
  const naics = (o?.naics_codes || []).map(String);
  const sic = (o?.sic_codes || []).map(String);
  if (naics.some((c) => c.startsWith('53121')) || sic.includes('6531')) return true;
  if (naics.length || sic.length) return false;
  return NOM_IMMO.test(nom);
}

/** Pure : une entreprise Apollo en ligne de la liste. */
export function versAgence(o) {
  const tel = o.sanitized_phone || o.primary_phone?.sanitized_number || o.phone || null;
  return {
    nom: String(o.name || '').trim(),
    site: o.website_url || (o.primary_domain ? `https://${o.primary_domain}` : null),
    telephone: telAffiche(tel),
    linkedin: o.linkedin_url || null,
    apollo_id: o.id || null,
  };
}

// Les mots qui ramènent les agences d'une ville chez Apollo : son nom, puis
// ses étiquettes. Chaque requête rend au plus trois pages de cent.
const NOMS = ['immo', 'immobilier', 'immobiliere', 'real estate', 'transaction', 'commerces', 'properties', 'agence'];
const ETIQUETTES = ['real estate agency', 'commercial real estate', 'agence immobiliere', 'immobilier commercial'];

/**
 * Les agences immobilières d'une ville chez Apollo. `max_requetes` plafonne
 * ce qu'un passage coûte. Rend { agences, requetes }.
 */
export async function agencesDeLaVille(ville, { max_requetes = 24, pages = 3, lire = fetch, surPage = () => {} } = {}) {
  if (!apolloConfigure()) throw new Error("Apollo n'est pas branché : APOLLO_API_KEY manque.");
  const vues = new Map();
  let requetes = 0;
  const requetesDe = [...NOMS.map((n) => ({ q_organization_name: n })), ...ETIQUETTES.map((t) => ({ q_organization_keyword_tags: [t] }))];
  for (const filtre of requetesDe) {
    for (let page = 1; page <= pages; page += 1) {
      if (requetes >= max_requetes) break;
      const j = await appeler('/mixed_companies/search', { corps: { organization_locations: [`${ville}, France`], per_page: 100, page, ...filtre }, lire });
      requetes += 1;
      const liste = j.organizations || [];
      for (const o of liste) if (o?.id && !vues.has(o.id) && estAgenceApollo(o)) vues.set(o.id, o);
      surPage({ requetes, agences: vues.size });
      if (liste.length < 100 || page >= (j.pagination?.total_pages || 1)) break;
      await pause(300);
    }
  }
  return { agences: [...vues.values()].map(versAgence).filter((a) => a.nom), requetes };
}

/** L'agence par son domaine : numéro, LinkedIn, effectif, spécialités. Gardé 90 jours. */
export async function enrichirAgence(domaine, { lire = fetch } = {}) {
  if (!apolloConfigure() || !domaine) return null;
  return enMemoire(`org|${domaine}`, async () => {
    const j = await appeler(`/organizations/enrich?domain=${encodeURIComponent(domaine)}`, { methode: 'GET', lire });
    const o = j.organization;
    if (!o) return null;
    const tel = o.sanitized_phone || o.primary_phone?.sanitized_number || o.phone || null;
    return {
      nom: o.name || null,
      telephone: telAffiche(tel),
      linkedin: o.linkedin_url || null,
      effectif: Number(o.estimated_num_employees) || null,
      ville: o.city || null,
      mots: (o.keywords || []).slice(0, 25),
      description: o.short_description ? String(o.short_description).slice(0, 400) : null,
    };
  });
}

// Les postes qu'on veut joindre dans une agence : ceux qui ont les mandats.
const POSTES = ['agent immobilier', 'negociateur', 'négociateur', 'conseiller immobilier', 'directeur', 'gerant', 'gérant', 'fondateur', 'associe', 'associé', 'transaction', 'immobilier commercial', 'immobilier d\'entreprise', 'commerce'];

/**
 * Les contacts d'une agence chez Apollo, au plus `max` révélés (un crédit
 * chacun) : nom, poste, mail, LinkedIn. Gardé 90 jours par domaine.
 */
export async function contactsDeLAgence(domaine, ville, { max = 2, lire = fetch } = {}) {
  if (!apolloConfigure() || !domaine) return [];
  return enMemoire(`people|${domaine}|${max}`, async () => {
    const j = await appeler('/mixed_people/api_search', { corps: { q_organization_domains_list: [domaine], person_titles: POSTES, ...(ville ? { person_locations: [`${ville}, France`] } : {}), per_page: 10, page: 1 }, lire });
    const gens = (j.people || []).filter((p) => p.has_email).slice(0, max);
    const out = [];
    for (const p of gens) {
      const m = await appeler('/people/match', { corps: { id: p.id }, lire });
      const x = m.person;
      if (!x) continue;
      const nom = [x.first_name, x.last_name].filter(Boolean).join(' ').trim();
      const email = x.email && !/^email_not_unlocked/.test(x.email) ? x.email : null;
      if (!nom && !email) continue;
      out.push({ nom: nom || null, email, poste: x.title || p.title || null, linkedin: x.linkedin_url || null, source: 'Apollo' });
      await pause(200);
    }
    return out;
  }) || [];
}

/**
 * Le numéro d'un mandataire (23 oct. 2026), en dernier recours : une recherche de la personne (prénom, nom, réseau,
 * ville). Payant : seulement au clic, et la réponse est gardée 90 jours. Rend { telephone, email } ou null.
 */
export async function numeroDUnePersonne({ prenom, nom, organisation = null, ville = null }, { lire = fetch } = {}) {
  if (!apolloConfigure() || !nom) return null;
  return enMemoire(`personne|${prenom || ''}|${nom}|${organisation || ''}|${ville || ''}`.toLowerCase(), async () => {
    const m = await appeler('/people/match', { corps: { first_name: prenom || undefined, last_name: nom, organization_name: organisation || undefined, ...(ville ? { city: ville } : {}) }, lire });
    const p = m.person;
    if (!p) return null;
    const tel = (p.phone_numbers || p.contact?.phone_numbers || [])[0]?.sanitized_number || null;
    const email = p.email && !/^email_not_unlocked/.test(p.email) ? p.email : null;
    return tel || email ? { telephone: tel ? telAffiche(tel) : null, email } : null;
  });
}

// --- L'équipe d'une agence, pour la carte d'appel (17 nov. 2026) ---------------------------------------------------
// Jules : « pour nourrir la carte d'appel, aller chercher dans Apollo les membres de l'équipe : l'interlocuteur
// probable, puis les autres ; pas ceux qui font de la location, mais un conseiller en transaction, une responsable
// administrative, le manager de l'agence ». Et : « je ne veux pas leurs numéros, sinon ça consomme trop de crédits ».
// Seule la recherche (mixed_people/api_search) sert : elle ne coûte aucun crédit et rend le prénom, l'initiale du nom
// et le poste. Rien n'est révélé (people/match), ni mail ni numéro.

// La location, la gestion locative, le syndic et les métiers sans rapport ne sont pas des interlocuteurs.
const HORS_SUJET = /(locat|rental|letting|leasing|gestion|property manag|syndic|copropri|comptab|account|marketing|communication|community|social media|e-?commerce|legal|juridique|travaux|logisti|[ée]v[éeè]nement|event|\\bcto\\b|\\bcfo\\b|t[ée]l[ée]conseill|business develop|d[ée]veloppeu|developer|stagiaire|intern\b|alternan|apprenti|photograph|home ?stag|\bit\b|informati|data|rh\b|ressources humaines|human resources|recrut)/i;
// Un poste mêlé (« négociateur location et transaction ») reste un interlocuteur s'il fait de la transaction ou du commerce.
const MALGRE_TOUT = /(transaction|immobilier (commercial|d.entreprise)|fonds de commerce|locaux commerciaux|murs commerciaux)/i;
// Du plus probable au moins probable : le commerce, la transaction, la direction de l'agence, l'administratif.
const RANGS = [
  /(immobilier (commercial|d.entreprise)|fonds de commerce|locaux commerciaux|murs commerciaux|cession|(?<![-\w])commerces?\b)/i,
  /(transaction|n[ée]gociat|conseill|agent immobilier|real estate agent|sales|vente|commercial|charg[ée]e? de projet|consultant|broker)/i,
  /(directeur|directrice|director|manager|g[ée]rant|responsable d.agence|head|ceo|founder|fondat|pr[ée]sident|associ[ée]|owner|partner|dirigeant)/i,
  /(assistant|administrati|office|secr[ée]taire|accueil)/i,
];
const TRADUCTIONS = [
  [/^co-?founder$/i, 'Cofondateur'], [/^founder$/i, 'Fondateur'], [/^(ceo|chief executive officer)$/i, 'Dirigeant'],
  [/^managing director$/i, 'Directeur général'], [/^(agency|branch) manager$/i, 'Responsable d\'agence'],
  [/^real estate agent$/i, 'Agent immobilier'], [/^real estate (consultant|advisor|adviser)$/i, 'Conseiller immobilier'],
  [/^sales (manager|director)$/i, 'Responsable commercial'], [/^owner$/i, 'Gérant'], [/^office manager$/i, 'Responsable administrative'],
  [/^(executive )?assistant$/i, 'Assistant'], [/^partner$/i, 'Associé'],
];

/** Pure : le poste en français quand Apollo le donne en anglais (les plus courants) ; tel quel sinon. */
export function posteFrancais(poste) {
  const p = String(poste || '').trim();
  const t = TRADUCTIONS.find(([re]) => re.test(p));
  return t ? t[1] : p || null;
}

/** Pure : le rang d'un poste (0 le plus probable), ou null s'il n'est pas un interlocuteur (location, gestion…). */
export function rangPoste(poste) {
  const p = String(poste || '');
  if (HORS_SUJET.test(p) && !MALGRE_TOUT.test(p)) return null;
  // Un poste qui ne dit ni transaction, ni direction, ni administratif (« Greenbullien ») n'est pas proposé.
  const i = RANGS.findIndex((re) => re.test(p));
  return i < 0 ? null : i;
}

/** Pure : « Maxime D. » à partir du prénom et du nom masqué par Apollo (« Do***e »). */
export function nomCourt(prenom, nomMasque) {
  const p = String(prenom || '').trim();
  const i = String(nomMasque || '').trim()[0];
  return p ? `${p}${i ? ` ${i.toUpperCase()}.` : ''}` : null;
}

/** Pure : les personnes de la recherche, sans la location, rangées de la plus probable à la moins probable. */
export function equipeRangee(people = []) {
  return (people || [])
    .map((p) => ({ nom: nomCourt(p.first_name, p.last_name_obfuscated || p.last_name), poste: posteFrancais(p.title), rang: rangPoste(p.title), id: p.id }))
    .filter((x) => x.nom && x.rang != null)
    .sort((a, b) => a.rang - b.rang)
    .slice(0, 6)
    .map(({ nom, poste, id }) => ({ nom, poste, apollo_id: id }));
}

const domaineDe = (site) => { try { return new URL(/^https?:/.test(site) ? site : `https://${site}`).hostname.replace(/^www\./, ''); } catch { return null; } };

/**
 * L'équipe d'une agence chez Apollo, par son identifiant Apollo ou le domaine de son site ; gardée 90 jours et posée sur
 * l'agence (`apollo_equipe`). Gratuit : la recherche seule. Rend [{ nom, poste, apollo_id }].
 */
export async function equipeDeLAgence(agence, { ville = null, lire = fetch } = {}) {
  if (!apolloConfigure() || !agence) return [];
  const domaine = agence.site ? domaineDe(agence.site) : null;
  if (!agence.apollo_id && !domaine) return [];
  const cleR = `equipe2|${agence.apollo_id || domaine}|${String(ville || '').toLowerCase()}`;
  const gens = await enMemoire(cleR, async () => {
    const org = agence.apollo_id ? { organization_ids: [agence.apollo_id] } : { q_organization_domains_list: [domaine] };
    const chercher = (corps) => appeler('/mixed_people/api_search', { corps: { ...org, per_page: 25, page: 1, ...corps }, lire });
    let j = await chercher({});
    // Un réseau (Orpi, Century 21…) : l'identifiant ou le domaine désigne tout le réseau. On resserre sur la ville ;
    // encore trop de monde, on ne sait pas qui est de cette agence-ci : personne plutôt que des inconnus d'ailleurs.
    const total = (j) => Number(j.total_entries ?? j.pagination?.total_entries ?? (j.people || []).length);
    if (total(j) > 30) {
      if (!ville) return [];
      j = await chercher({ person_locations: [`${ville}, France`] });
      if (total(j) > 30) return [];
    }
    return equipeRangee(j.people || []);
  }) || [];
  if (agence.id) Records.update('AgenceProspect', agence.id, { apollo_equipe: { le: new Date().toISOString(), gens } });
  return gens;
}
