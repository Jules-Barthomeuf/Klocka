// Une liste d'agences tirée des personnes (18 nov. 2026, Jules : « au lieu de chercher par entreprise, j'ai cherché toutes
// les personnes de l'industrie dans la ville ; je trie par entreprise, je regarde qui y travaille et s'ils sont à
// Grenoble ; puis je mets l'entreprise dans l'app et dedans ses collaborateurs »).
//
//   1. Apollo, la recherche de personnes (gratuite, aucun crédit) : celles de la ville dont l'employeur est dans
//      l'immobilier (NAICS 531, le secteur « Real Estate » d'Apollo).
//   2. Par entreprise : on écarte ce qui n'est pas une agence (bailleurs sociaux, BTP, promoteurs, hôtels…) et les réseaux
//      de mandataires indépendants (iad, SAFTI…), où chacun travaille à son compte ; on garde une entreprise où quelqu'un
//      fait de la transaction, du commerce ou dirige, ou dont le nom dit l'immobilier.
//   3. Google Maps, une recherche par entreprise : seule une fiche d'agence immobilière ouverte dans la commune la fait
//      entrer (nom de vitrine, téléphone, site, adresse) ; deux noms Apollo pour la même fiche n'en font qu'une.
//   4. La liste : une agence par fiche, ses collaborateurs dedans (prénom, nom masqué, poste). La carte d'appel cherche
//      ensuite leurs noms complets, leurs numéros sur le site de l'agence et leurs photos, comme pour toute agence.
//
// Rien n'est révélé chez Apollo (ni mail ni numéro : un crédit chacun).

import { Records } from '../db.js';
import { HORS_SUJET, rangPoste } from '../../src/lib/interlocuteurs.js';

const LISTE = 'ListeAgences';
const AGENCE = 'AgenceProspect';
const maintenant = () => new Date().toISOString();
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const sa = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PAS_AGENCE = /(habitat|\boph\b|office public|crous|adoma|logement social|bailleur|un toit|bouygues|leon grosse|vinci|eiffage|demathieu|batiment|construction|constructeur|\bbtp\b|travaux|promotion|promoteur|residences?\b|reside etudes|domitys|appart.?city|gites?|alpexpo|congres|evenement|hotel|camping|\bepf|etablissement public|notaires?|banque|credit|caisse|lease|finance|assurance|architect|diagnostic|expertise|qualiconsult|syndic\b|copropri|gestion locative|location\b|domicile|minimistan|universit|ecole|mairie|ville de|metropole|departement|region|centre d.affaires|workplace|parking|indigo|conciergerie|majordome|bien.?ici|portail|safer|gares|semcoda|societe civile|desenvolvimento|cresud|\bltd\b|s\.a\.c\.i)/;
const RESEAUX = /(fnaim|\biad\b|safti|capifrance|optimhome|proprietes privees|megagence|\bexp\b|bsk|lafourmi|efficity|dr house|ikami|sextant|immo reseau|3g immo|keller williams|liberkeys|avinim|starthom)/;
const NOM_IMMO = /(immo|agence|transaction|propert|real estate|patrimoine|commerce)/;
const COLLABORATEURS_MAX = 15;
const RAYON_KM = 20;

/** Pure : la distance à vol d'oiseau, en km. */
export function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Les mots qui ne distinguent pas une agence d'une autre.
const MOTS_VIDES = new Set(['immobilier', 'immobiliere', 'immobiliers', 'immo', 'agence', 'agences', 'groupe', 'group', 'cabinet', 'conseil', 'conseils', 'transaction', 'transactions', 'real', 'estate', 'sarl', 'sas', 'france', 'les', 'des', 'the', 'and', 'grenoble', 'isere', 'alpes', 'entreprise', 'entreprises', 'immobilier', 'regie', 'patrimoine', 'gestion', 'commerce', 'commerces', 'neuf', 'international', 'realty']);
const motsDe = (n) => sa(n).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));
const compact = (n) => sa(n).replace(/[^a-z0-9]/g, '');

/** Pure : la fiche Maps est-elle bien l'entreprise d'Apollo ? Un mot distinctif commun, ou l'un des noms dans l'autre. */
export function memeEnseigne(nomApollo, nomMaps) {
  const a = motsDe(nomApollo);
  const b = new Set(motsDe(nomMaps));
  if (a.some((m) => b.has(m))) return true;
  const ca = compact(a.join(' '));
  const cb = compact(nomMaps);
  // « ZAN'IMMO » et « ZANIMMO » : le nom entier, collé, dans l'autre.
  const entier = compact(nomApollo);
  return (ca.length >= 4 && cb.includes(ca)) || (entier.length >= 5 && cb.includes(entier));
}

/** Pure : le rang d'un poste, l'anglais traduit d'abord (« Real Estate Advisor » est un conseiller). */
async function rangDe(poste) {
  const { posteFrancais } = await import('./agences-apollo.js');
  return rangPoste(posteFrancais(poste)) ?? rangPoste(poste);
}

/**
 * Les entreprises à garder, chacune avec ses collaborateurs rangés (le commerce, la transaction, la direction,
 * l'administratif ; ni la location ni la gestion). Rend { gardees: [{ nom, gens, personnes }], ecartees }.
 */
export async function choisirEntreprises(people = []) {
  const { nomCourt, posteFrancais } = await import('./agences-apollo.js');
  const parNom = new Map();
  for (const p of people) {
    const n = String(p?.organization?.name || '').trim();
    if (!n) continue;
    if (!parNom.has(n)) parNom.set(n, []);
    parNom.get(n).push(p);
  }
  const gardees = [];
  const ecartees = { pas_agence: [], reseau: [], sans_transaction: [] };
  for (const [nom, gens] of parNom) {
    const s = sa(nom);
    if (RESEAUX.test(s)) { ecartees.reseau.push(nom); continue; }
    if (PAS_AGENCE.test(s) && !/(immo|agence|transaction)/.test(s.replace(/promotion immobili\w*|immobilier neuf/g, ''))) { ecartees.pas_agence.push(nom); continue; }
    const ranges = [];
    for (const p of gens) ranges.push({ p, r: await rangDe(p.title) });
    const utiles = ranges.filter((x) => x.r != null).sort((a, b) => a.r - b.r);
    // Quelqu'un qui fait de la transaction ou du commerce ; à défaut, un dirigeant d'une entreprise au nom d'agence.
    const transaction = utiles.some((x) => x.r <= 1) || (NOM_IMMO.test(s) && utiles.some((x) => x.r === 2));
    if (!transaction && !(NOM_IMMO.test(s) && !utiles.length)) { ecartees.sans_transaction.push(nom); continue; }
    // Personne au poste reconnu (« Leader », un poste vide) : les gens de l'entreprise tels quels.
    const retenus = (utiles.length ? utiles.map((x) => x.p) : gens).slice(0, COLLABORATEURS_MAX);
    gardees.push({
      nom, personnes: gens.length,
      gens: retenus.map((p) => ({ nom: nomCourt(p.first_name, p.last_name_obfuscated || p.last_name), prenom: String(p.first_name || '').trim(), masque: String(p.last_name_obfuscated || '').trim() || null, poste: posteFrancais(p.title), apollo_id: p.id })).filter((g) => g.nom),
    });
  }
  gardees.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return { gardees, ecartees };
}

/** Les personnes de l'immobilier de la ville chez Apollo (recherche gratuite), toutes pages. */
async function personnesDeLaVille(ville, { lire = fetch } = {}) {
  const cle = (process.env.APOLLO_API_KEY || '').trim();
  if (!cle) throw new Error("Apollo n'est pas branché : APOLLO_API_KEY manque.");
  const tous = [];
  for (let page = 1; page <= 50; page += 1) {
    const r = await lire('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cle, 'cache-control': 'no-cache' },
      body: JSON.stringify({ person_locations: [`${ville}, France`], organization_naics_codes: ['531'], per_page: 100, page }),
      signal: AbortSignal.timeout(30_000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Apollo a répondu ${r.status}`);
    const lot = j.people || [];
    tous.push(...lot);
    if (lot.length < 100) break;
    await pause(300);
  }
  return tous;
}

/**
 * La liste `nom` (« Grenoble 2 ») tirée des personnes de la ville. Une liste du même nom déjà là n'est pas refaite.
 * `deps` (tests) : personnes, chercher (Maps, une entreprise), commune.
 */
export async function creerListeParPersonnes({ ville, nom = `${ville} 2`, par = null, journal = console.log, deps = {} } = {}) {
  if (Records.list(LISTE).some((l) => !l.archivee && l.ville === nom)) return { deja: true };
  const M = await import('./agences-maps.js');
  const people = deps.personnes || await personnesDeLaVille(ville);
  const { gardees, ecartees } = await choisirEntreprises(people);
  const commune = deps.commune || await M.communeDe(ville);
  if (!commune) throw new Error(`La commune « ${ville} » est introuvable.`);
  // La vitrine dans le département, pas seulement la commune : ceux d'Apollo « à Grenoble » travaillent souvent à Meylan ou
  // Échirolles (échantillon du 18 nov. 2026 : 3 entreprises sur 25 avaient leur fiche dans Grenoble même). Le cadre de la
  // commune oriente la recherche ; le code postal du département et le nom de l'enseigne tranchent.
  const dep = String(commune.code || '').slice(0, 2);
  const zone = { ...commune, nom: '', codes_postaux: [] };
  // À 20 km au plus du centre de la commune : Bourgoin-Jallieu est dans l'Isère, pas autour de Grenoble.
  const centre = commune.cadre ? { lat: (commune.cadre.sud + commune.cadre.nord) / 2, lon: (commune.cadre.ouest + commune.cadre.est) / 2 } : null;
  const pres = (lieu) => !centre || lieu.lat == null || distanceKm(centre, lieu) <= RAYON_KM;
  const chercher = deps.chercher || ((n) => M.chercherAgence(n, ville, { commune: zone, accepter: (lieu) => memeEnseigne(n, lieu.nom) && (!dep || String(lieu.code_postal || '').startsWith(dep)) && pres(lieu) }));
  const parFiche = new Map();
  const horsVille = [];
  for (const e of gardees) {
    let lieu = null;
    try { lieu = await chercher(e.nom); } catch (err) { journal(`[liste] ${e.nom} : Maps ${err?.message || err}`); }
    if (!lieu?.place_id) { horsVille.push(e.nom); continue; }
    const deja = parFiche.get(lieu.place_id);
    if (deja) {
      // Deux noms Apollo, une seule vitrine : une agence, les collaborateurs réunis.
      for (const g of e.gens) if (!deja.gens.some((x) => x.apollo_id === g.apollo_id)) deja.gens.push(g);
      deja.noms_apollo.push(e.nom);
    } else parFiche.set(lieu.place_id, { lieu, gens: [...e.gens], noms_apollo: [e.nom] });
    if (!deps.chercher) await pause(150);
  }
  const le = maintenant();
  const texte = `Liste ${nom} tirée des personnes : ${people.length} personnes de l'immobilier à ${ville} chez Apollo, ${gardees.length} entreprises gardées (${ecartees.pas_agence.length} écartées hors agence, ${ecartees.reseau.length} réseaux de mandataires, ${ecartees.sans_transaction.length} sans transaction), ${horsVille.length} sans vitrine d'agence à leur nom dans le département sur Google Maps ; ${parFiche.size} agences.`;
  const l = Records.create(LISTE, { ville: nom, commune: commune.nom, type: 'agences', source: 'personnes', etat: 'fini', lancee_par: par, lancee_le: le, fini_le: le, journal: [{ le, texte, ton: 'succes' }] });
  for (const { lieu, gens, noms_apollo } of parFiche.values()) {
    Records.create(AGENCE, {
      liste_id: l.id, ...lieu, ville: commune.nom, agents: [], gerants: [],
      site_source: lieu.site ? 'Google Maps' : null, sources: ['Apollo', 'Google Maps'], noms_apollo,
      // `par_personnes` : l'équipe vient de la recherche de personnes ; la carte ne la recherche pas par le domaine (un
      // réseau, Foncia ou Citya, n'y rendait personne).
      apollo_equipe: { le, gens, par_personnes: true },
      cree_le: le,
    });
  }
  journal(`[liste] ${texte}`);
  return { liste: l.id, agences: parFiche.size, gardees: gardees.length, hors_ville: horsVille.length, personnes: people.length, ecartees: Object.fromEntries(Object.entries(ecartees).map(([k, v]) => [k, v.length])) };
}

/**
 * Compléter une liste tirée des personnes (18 nov. 2026, Jules : « intègre les réseaux de mandataires ; et les gardées ») :
 * les entreprises gardées sans vitrine Maps entrent quand même, avec leurs collaborateurs (sans téléphone) ; chaque
 * mandataire d'un réseau (iad, SAFTI…) a sa ligne, au genre mandataire, son réseau en face. Ce qui est déjà dans la liste
 * (même nom Apollo, même personne) n'est pas refait.
 */
export async function completerListeParPersonnes({ listeId, people, ville, journal = console.log }) {
  const l = Records.get(LISTE, listeId);
  if (!l) throw new Error('Liste introuvable.');
  const { nomCourt, posteFrancais } = await import('./agences-apollo.js');
  const deja = Records.list(AGENCE).filter((a) => a.liste_id === listeId);
  const nomsVus = new Set(deja.flatMap((a) => a.noms_apollo || []));
  const personnesVues = new Set(deja.flatMap((a) => (a.apollo_equipe?.gens || []).map((g) => g.apollo_id)));
  const { gardees } = await choisirEntreprises(people);
  const le = maintenant();
  let sansVitrine = 0;
  for (const e of gardees) {
    if (nomsVus.has(e.nom)) continue;
    Records.create(AGENCE, { liste_id: listeId, nom: e.nom, ville, agents: [], gerants: [], sources: ['Apollo'], noms_apollo: [e.nom], sans_vitrine: true, apollo_equipe: { le, gens: e.gens, par_personnes: true }, cree_le: le });
    sansVitrine += 1;
  }
  let mandataires = 0;
  for (const p of people) {
    const reseau = String(p?.organization?.name || '').trim();
    if (!reseau || !RESEAUX.test(sa(reseau)) || personnesVues.has(p.id)) continue;
    const g = { nom: nomCourt(p.first_name, p.last_name_obfuscated || p.last_name), prenom: String(p.first_name || '').trim(), masque: String(p.last_name_obfuscated || '').trim() || null, poste: posteFrancais(p.title), apollo_id: p.id };
    if (!g.nom) continue;
    Records.create(AGENCE, { liste_id: listeId, nom: g.nom, ville, genre: 'mandataire', reseau_nom: reseau, agents: [], gerants: [], sources: ['Apollo'], noms_apollo: [reseau], apollo_equipe: { le, gens: [g], par_personnes: true }, cree_le: le });
    personnesVues.add(p.id);
    mandataires += 1;
  }
  const texte = `Liste complétée : ${sansVitrine} entreprises sans vitrine Google Maps (avec leurs collaborateurs, sans téléphone) et ${mandataires} mandataires des réseaux (iad, SAFTI, Capifrance…), une ligne chacun.`;
  Records.update(LISTE, listeId, { journal: [...(l.journal || []), { le, texte, ton: 'succes' }] });
  journal(`[liste] ${l.ville} : ${texte}`);
  return { sans_vitrine: sansVitrine, mandataires };
}

// La règle de Jules (18 nov. 2026, sur la première page de sa liste Apollo : « on exclut juste les assureurs, À la bonne
// porte et AAC Promoteur ; tout le reste on garde ») : seuls les assureurs, les promoteurs-constructeurs et les noms
// écartés à la main restent dehors.
const ASSUREURS = /(assuran|assureur|mutuelle|\baxa\b|allianz|\bmaif\b|macif|matmut|groupama|generali|\bmma\b|\bgmf\b|swiss ?life|\bmaaf\b|april\b|cardif|aviva|abeille)/;
// « XX Promotion » et les entreprises de construction aussi (Grenoble 2, 18 nov. 2026 : 15 retirées après coup).
const PROMOTEURS = /(promoteur|constructeur|\bpromotion\b|\bconstruction\b)/;
export const EXCLUS_A_LA_MAIN = ['à la bonne porte'];

/** Pure : l'entreprise reste-t-elle dehors selon la règle de Jules ? */
export const resteDehors = (nom) => ASSUREURS.test(sa(nom)) || PROMOTEURS.test(sa(nom)) || EXCLUS_A_LA_MAIN.some((x) => sa(x) === sa(nom));

/**
 * Toutes les entreprises de la recherche qui ne sont pas encore dans la liste, sauf celles que la règle de Jules laisse
 * dehors (et les réseaux de mandataires, posés un par un). Chacune cherchée sur Maps (téléphone, site, adresse) ; ses
 * collaborateurs : les postes reconnus d'abord, puis les autres.
 */
export async function ajouterEntreprises({ listeId, people, ville, journal = console.log, deps = {} }) {
  const l = Records.get(LISTE, listeId);
  if (!l) throw new Error('Liste introuvable.');
  const M = await import('./agences-maps.js');
  const { nomCourt, posteFrancais } = await import('./agences-apollo.js');
  const deja = Records.list(AGENCE).filter((a) => a.liste_id === listeId);
  const nomsVus = new Set(deja.flatMap((a) => a.noms_apollo || []));
  const parFiche = new Map(deja.filter((a) => a.place_id).map((a) => [a.place_id, a]));
  const commune = deps.commune || await M.communeDe(ville);
  const dep = String(commune?.code || '').slice(0, 2);
  const zone = { ...commune, nom: '', codes_postaux: [] };
  const centre = commune?.cadre ? { lat: (commune.cadre.sud + commune.cadre.nord) / 2, lon: (commune.cadre.ouest + commune.cadre.est) / 2 } : null;
  const chercher = deps.chercher || ((n) => M.chercherAgence(n, ville, { commune: zone, accepter: (lieu) => memeEnseigne(n, lieu.nom) && (!dep || String(lieu.code_postal || '').startsWith(dep)) && (!centre || lieu.lat == null || distanceKm(centre, lieu) <= RAYON_KM) }));
  const parNom = new Map();
  for (const p of people) {
    const n = String(p?.organization?.name || '').trim();
    if (!n || nomsVus.has(n) || RESEAUX.test(sa(n)) || resteDehors(n)) continue;
    if (!parNom.has(n)) parNom.set(n, []);
    parNom.get(n).push(p);
  }
  const le = maintenant();
  const res = { ajoutees: 0, avec_vitrine: 0, fondues: 0, dehors: [...new Set(people.map((p) => String(p?.organization?.name || '').trim()).filter((n) => n && resteDehors(n)))] };
  for (const [nom, gens] of parNom) {
    const ranges = [];
    for (const p of gens) ranges.push({ p, r: await rangDe(p.title) });
    ranges.sort((a, b) => (a.r ?? 9) - (b.r ?? 9));
    const equipe = ranges.slice(0, COLLABORATEURS_MAX).map(({ p }) => ({ nom: nomCourt(p.first_name, p.last_name_obfuscated || p.last_name), prenom: String(p.first_name || '').trim(), masque: String(p.last_name_obfuscated || '').trim() || null, poste: posteFrancais(p.title), apollo_id: p.id })).filter((g) => g.nom);
    let lieu = null;
    try { lieu = await chercher(nom); } catch (err) { journal(`[liste] ${nom} : Maps ${err?.message || err}`); }
    if (!deps.chercher) await pause(150);
    const meme = lieu?.place_id ? parFiche.get(lieu.place_id) : null;
    if (meme) {
      // Une vitrine déjà dans la liste : ses collaborateurs s'y ajoutent.
      const avant = Records.get(AGENCE, meme.id);
      const gensAvant = avant.apollo_equipe?.gens || [];
      Records.update(AGENCE, meme.id, { noms_apollo: [...(avant.noms_apollo || []), nom], apollo_equipe: { ...(avant.apollo_equipe || {}), gens: [...gensAvant, ...equipe.filter((g) => !gensAvant.some((x) => x.apollo_id === g.apollo_id))], noms_cherches_le: null } });
      res.fondues += 1;
      continue;
    }
    const a = Records.create(AGENCE, {
      liste_id: listeId, ...(lieu?.place_id ? { ...lieu, site_source: lieu.site ? 'Google Maps' : null, sources: ['Apollo', 'Google Maps'] } : { nom, sources: ['Apollo'], sans_vitrine: true }),
      ville, agents: [], gerants: [], noms_apollo: [nom], apollo_equipe: { le, gens: equipe, par_personnes: true }, cree_le: le,
    });
    if (lieu?.place_id) { parFiche.set(lieu.place_id, a); res.avec_vitrine += 1; }
    res.ajoutees += 1;
  }
  const texte = `Règle de Jules (seuls les assureurs, les promoteurs-constructeurs et « À la bonne porte » dehors) : ${res.ajoutees} entreprises ajoutées, dont ${res.avec_vitrine} avec une vitrine Google Maps ; ${res.fondues} fondues dans une vitrine déjà là ; dehors : ${res.dehors.join(', ')}.`;
  Records.update(LISTE, listeId, { journal: [...(Records.get(LISTE, listeId).journal || []), { le, texte, ton: 'succes' }] });
  journal(`[liste] ${l.ville} : ${texte}`);
  return res;
}

/** Le nom complet trouvé d'un mandataire devient le nom de sa ligne (« Léa M. » → « Léa Martin »). */
export function nommerMandataires(listeId) {
  let n = 0;
  for (const a of Records.list(AGENCE).filter((x) => x.liste_id === listeId && x.genre === 'mandataire')) {
    const complet = a.apollo_equipe?.gens?.[0]?.nom_complet;
    if (complet && complet !== a.nom) { Records.update(AGENCE, a.id, { nom: complet, nom_avant: a.nom }); n += 1; }
  }
  return n;
}

// --- Le tri par type d'entreprise (18 nov. 2026, Jules sur Grenoble 2 : « de 5 à 13, supprime ») ------------------------
// Gardés : les agences de transaction, l'immobilier d'entreprise et de commerce, les syndics et gestionnaires (souvent
// aussi en transaction), et les mandataires (un par ligne). Écartés : investissement et foncières, logement social,
// résidences et tourisme, BTP, diagnostics, coworking, public, tech et portails, et ce qui n'a pas de type clair.
const T_AGENCES_CONNUES = /\b(square habitat|century ?21|orpi|laforet|guy hoquet|stephane plaza|era immobilier|nestenn|citya|foncia|lamy|valoris|cimm|arthurimmo|sotheby|barnes|engel|kretz|daniel feau|john taylor|cote particuliers|agence)\b/;
const T_COMMERCE = /\b(cbre|arthur loyd|bnp paribas real estate|jll|cushman|knight frank|savills|evolis|catella|forcaprimm|actimo|pharmacessions?|prolocaux|cession|fonds de commerce|immobilier d.entreprise|immobilier commercial|locaux commerciaux|bureaux et commerces|commerces?)\b/;
const T_ECARTES = [
  ['logement_social', /\b(oph|opac|hlm|office public|crous|adoma|action logement|un toit|loyer modere|logement social|alfa3a|erilia|batigere|halpades|arpej|unitoit|semcoda|soliha|habitat et humanisme|cdc habitat|in.li|anah|fondation)\b|habitat\b/],
  ['residences', /\b(residences?|hotels?|hotel|appart.?city|vacances?|vacanceole|zenitude|domitys|odalys|gites?|camping|airbnb|interhome|tourisme|resort|spa|conciergerie|majordome|homebox|location saisonniere|courte duree|seniors?)\b/],
  ['btp', /\b(btp|batiment|construction|constructeur|travaux|architectes?|architecture|bureau d.etudes|ingenierie|amenagement|amenageur|bouygues|vinci|eiffage|demathieu|implenia|algeco|spl|epfl?|maisons? individuelles?|promotion|promoteur)\b/],
  ['diagnostics', /\b(diagnostics?|expertises?|experts?|evaluation|tasacion|qualiconsult|geometres?)\b/],
  ['coworking', /\b(coworking|cowork|regus|workplace|centre d.affaires|business center|bureaux partages)\b/],
  ['public', /\b(ville de|mairie|metropole|departement|region|chambre de|technopole|safer|sncf|la poste|gares|ministere|agence de developpement)\b/],
  ['tech', /\b(bien.?ici|seloger|aviv|casavo|homiwoo|meilleursagents|proptech|software|logiciel|digital|data|startup|pap\.fr)\b/],
  ['investissement', /\b(invest\w*|foncieres?|asset|gestion d.actifs|capital|perial|mercialys|klepierre|apsys|altarea|banque|bank|bpce|credit|caisse d|financ\w*|wealth|private equity|scpi|reit)\b/],
  ['assurance', /\b(assurances?|assureur|mutuelle|axa|allianz|generali|groupama|swiss ?life)\b/],
];
const T_SYNDICS = /\b(syndic|syndics|copropriete|gestion locative|administrat\w* de biens|regie|gerance|property management|sergic|oralia|nexity lamy)\b/;
const T_AGENCES = /\b(immo\w*|agence|transaction|realty|real estate|estate|properties|propriete|home|maison)\b|immobili/;
const T_POSTES_TRANSACTION = /(negociat|agent immobilier|conseill\w* (en )?immobili|transaction|agent commercial|real estate (agent|advisor|consultant)|broker|chasseur)/;

/** Pure : le type d'une entreprise d'après son nom et les postes de ses gens. */
export function typeEntreprise(nom, postes = []) {
  const n = sa(nom);
  const t = sa(postes.join(' | '));
  if (T_COMMERCE.test(n)) return 'commerce';
  if (T_AGENCES_CONNUES.test(n)) return 'agences';
  for (const [k, re] of T_ECARTES) if (re.test(n)) return k;
  if (T_SYNDICS.test(n)) return 'syndics';
  if (T_AGENCES.test(n) || T_POSTES_TRANSACTION.test(t)) return 'agences';
  return 'autres';
}
export const TYPES_GARDES = new Set(['agences', 'commerce', 'syndics']);

/**
 * Une liste complète tirée des personnes, triée par type d'emblée (Nice, 18 nov. 2026) : les entreprises des types
 * gardés, chacune cherchée sur Maps (vitrine : téléphone, site, adresse ; sinon sans vitrine, ses collaborateurs
 * seuls), deux noms pour une même vitrine fondus ; les mandataires des réseaux un par ligne. `simuler` : compte seulement.
 */
export async function construireListe({ ville, nom, people, par = null, simuler = false, journal = console.log, deps = {} }) {
  const { nomCourt, posteFrancais } = await import('./agences-apollo.js');
  const parNom = new Map();
  for (const p of people) {
    const n = String(p?.organization?.name || '').trim();
    if (!n) continue;
    if (!parNom.has(n)) parNom.set(n, []);
    parNom.get(n).push(p);
  }
  const personne = (p) => ({ nom: nomCourt(p.first_name, p.last_name_obfuscated || p.last_name), prenom: String(p.first_name || '').trim(), masque: String(p.last_name_obfuscated || '').trim() || null, poste: posteFrancais(p.title), apollo_id: p.id });
  const types = {};
  const entreprises = [];
  const mandataires = [];
  for (const [n, gens] of parNom) {
    if (RESEAUX.test(sa(n)) && !/fnaim/.test(sa(n))) { for (const p of gens) mandataires.push({ reseau: n, g: personne(p) }); types.mandataires = (types.mandataires || 0) + gens.length; continue; }
    const type = typeEntreprise(n, gens.map((p) => p.title));
    types[type] = (types[type] || 0) + 1;
    if (!TYPES_GARDES.has(type)) continue;
    const ranges = [];
    for (const p of gens) ranges.push({ p, r: await rangDe(p.title) });
    ranges.sort((a, b) => (a.r ?? 9) - (b.r ?? 9));
    entreprises.push({ nom: n, type, gens: ranges.slice(0, COLLABORATEURS_MAX).map(({ p }) => personne(p)).filter((g) => g.nom) });
  }
  if (simuler) return { personnes: people.length, entreprises: parNom.size, types, gardees: entreprises.length, mandataires: mandataires.length };
  const M = await import('./agences-maps.js');
  const commune = deps.commune || await M.communeDe(ville);
  if (!commune) throw new Error(`La commune « ${ville} » est introuvable.`);
  const dep = String(commune.code || '').slice(0, 2);
  const zone = { ...commune, nom: '', codes_postaux: [] };
  const centre = commune.cadre ? { lat: (commune.cadre.sud + commune.cadre.nord) / 2, lon: (commune.cadre.ouest + commune.cadre.est) / 2 } : null;
  const chercher = deps.chercher || ((n) => M.chercherAgence(n, ville, { commune: zone, accepter: (lieu) => memeEnseigne(n, lieu.nom) && (!dep || String(lieu.code_postal || '').startsWith(dep)) && (!centre || lieu.lat == null || distanceKm(centre, lieu) <= RAYON_KM) }));
  const parFiche = new Map();
  const sansVitrine = [];
  let fait = 0;
  for (const e of entreprises) {
    let lieu = null;
    try { lieu = await chercher(e.nom); } catch (err) { journal(`[liste] ${e.nom} : Maps ${err?.message || err}`); }
    if (!deps.chercher) await pause(120);
    if (++fait % 100 === 0) journal(`[liste] ${nom} : ${fait} / ${entreprises.length} entreprises cherchées sur Maps`);
    if (!lieu?.place_id) { sansVitrine.push(e); continue; }
    const deja = parFiche.get(lieu.place_id);
    if (deja) { for (const g of e.gens) if (!deja.gens.some((x) => x.apollo_id === g.apollo_id)) deja.gens.push(g); deja.noms_apollo.push(e.nom); continue; }
    parFiche.set(lieu.place_id, { lieu, gens: [...e.gens], noms_apollo: [e.nom], type: e.type });
  }
  const le = maintenant();
  const texte = `Liste ${nom} tirée des personnes : ${people.length} personnes de l'immobilier à ${ville} chez Apollo, ${parNom.size} entreprises ; gardées par type (agences, commerce, syndics) : ${entreprises.length}, dont ${parFiche.size} vitrines Google Maps et ${sansVitrine.length} sans vitrine ; ${mandataires.length} mandataires des réseaux, un par ligne.`;
  const l = Records.create(LISTE, { ville: nom, commune: commune.nom, type: 'agences', source: 'personnes', etat: 'fini', lancee_par: par, lancee_le: le, fini_le: le, journal: [{ le, texte, ton: 'succes' }] });
  for (const { lieu, gens, noms_apollo, type } of parFiche.values()) Records.create(AGENCE, { liste_id: l.id, ...lieu, ville: commune.nom, type_entreprise: type, agents: [], gerants: [], site_source: lieu.site ? 'Google Maps' : null, sources: ['Apollo', 'Google Maps'], noms_apollo, apollo_equipe: { le, gens, par_personnes: true }, cree_le: le });
  for (const e of sansVitrine) Records.create(AGENCE, { liste_id: l.id, nom: e.nom, ville: commune.nom, type_entreprise: e.type, agents: [], gerants: [], sources: ['Apollo'], noms_apollo: [e.nom], sans_vitrine: true, apollo_equipe: { le, gens: e.gens, par_personnes: true }, cree_le: le });
  for (const { reseau, g } of mandataires) Records.create(AGENCE, { liste_id: l.id, nom: g.nom, ville: commune.nom, genre: 'mandataire', reseau_nom: reseau, agents: [], gerants: [], sources: ['Apollo'], noms_apollo: [reseau], apollo_equipe: { le, gens: [g], par_personnes: true }, cree_le: le });
  journal(`[liste] ${texte}`);
  return { liste: l.id, vitrines: parFiche.size, sans_vitrine: sansVitrine.length, mandataires: mandataires.length, types };
}

// --- Tous les collaborateurs d'une entreprise (18 nov. 2026, Jules : « dans certaines entreprises il n'y a pas tous les
// collaborateurs, il faut pour chacune que tu ailles dans l'entreprise ») ----------------------------------------------
// La recherche de départ ne prenait que les gens notés dans la ville même ; ceux de Meylan, d'Échirolles ou sans ville
// manquaient. Ici, pour chaque entreprise : ses gens dans le département, sous son nom Apollo exact (recherche gratuite),
// les postes utiles (ni location ni gestion, sauf transaction), ajoutés à ceux déjà là.
const COLLABORATEURS_TOUS = 40;

/** Pure : une personne est-elle un collaborateur à garder ? Un poste reconnu, ou un poste inconnu hors location et gestion. */
export async function collaborateurUtile(titre) {
  if ((await rangDe(titre)) != null) return true;
  const t = String(titre || '');
  return !!t.trim() && !HORS_SUJET.test(t);
}

export async function completerCollaborateurs({ ids, departement, journal = console.log, lire = fetch }) {
  const cle = (process.env.APOLLO_API_KEY || '').trim();
  if (!cle) throw new Error("Apollo n'est pas branché : APOLLO_API_KEY manque.");
  const { nomCourt, posteFrancais } = await import('./agences-apollo.js');
  const chercher = async (nom, page) => {
    const r = await lire('https://api.apollo.io/api/v1/mixed_people/api_search', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cle, 'cache-control': 'no-cache' }, body: JSON.stringify({ q_keywords: nom, person_locations: [`${departement}, France`], per_page: 100, page }), signal: AbortSignal.timeout(30_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Apollo a répondu ${r.status}`);
    return j;
  };
  const bilan = { entreprises: 0, ajoutes: 0 };
  let fait = 0;
  for (const id of ids) {
    const a = Records.get(AGENCE, id);
    if (!a || a.genre === 'mandataire' || !(a.noms_apollo || []).length) continue;
    const gens = [...(a.apollo_equipe?.gens || [])];
    let ajoutes = 0;
    for (const nom of a.noms_apollo) {
      for (let page = 1; page <= 3; page += 1) {
        let j;
        try { j = await chercher(nom, page); } catch (e) { journal(`[collaborateurs] ${nom} : ${e?.message || e}`); break; }
        const lot = j.people || [];
        for (const p of lot) {
          if (sa(p?.organization?.name).trim() !== sa(nom).trim() || gens.some((g) => g.apollo_id === p.id)) continue;
          if (!(await collaborateurUtile(p.title))) continue;
          const g = { nom: nomCourt(p.first_name, p.last_name_obfuscated || p.last_name), prenom: String(p.first_name || '').trim(), masque: String(p.last_name_obfuscated || '').trim() || null, poste: posteFrancais(p.title), apollo_id: p.id };
          if (g.nom) { gens.push(g); ajoutes += 1; }
        }
        if (lot.length < 100) break;
        await pause(250);
      }
      await pause(200);
    }
    if (ajoutes) {
      const ranges = [];
      for (const g of gens) ranges.push({ g, r: await rangDe(g.poste) });
      ranges.sort((x, y) => (x.r ?? 9) - (y.r ?? 9));
      const frais = Records.get(AGENCE, id);
      // Les nouveaux venus n'ont pas encore leur nom complet : la recherche des noms repassera.
      Records.update(AGENCE, id, { apollo_equipe: { ...(frais.apollo_equipe || {}), gens: ranges.slice(0, COLLABORATEURS_TOUS).map((x) => x.g), par_personnes: true, noms_cherches_le: null, completee_le: maintenant() } });
      bilan.entreprises += 1;
      bilan.ajoutes += ajoutes;
    }
    if (++fait % 50 === 0) journal(`[collaborateurs] ${fait} / ${ids.length} entreprises, ${bilan.ajoutes} collaborateurs ajoutés`);
  }
  return bilan;
}

/** La commune d'une liste : son champ `commune`, sinon son nom avant « · » (« Nice · Apollo » → Nice). */
export const communeDeListe = (l) => l?.commune || String(l?.ville || '').split(' · ')[0];
