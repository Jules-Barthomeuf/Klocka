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
