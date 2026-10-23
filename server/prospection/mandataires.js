// Les mandataires de la Prospection (23 oct. 2026, Jules : « en plus des agences, mettre aussi des mandataires »).
//
// Un mandataire est une personne, pas une agence : un conseiller d'un réseau (IAD, SAFTI, Capifrance…) ou un agent
// immatriculé en nom propre. Chacun est un contact à part entière : nom, réseau, ville, téléphone (et d'où il vient),
// SIREN, publie-t-il du commerce, combien d'annonces.
//
// D'où ils viennent, sans lire aucun site depuis cette machine :
//   - Data-B (68.31Z) : les immatriculés en nom propre (« Monsieur Vito Schiavone ») : SIREN, création, adresse ;
//   - les annonces Equimmox : « Prénom Nom - IAD France » est un mandataire IAD de la ville, pas une agence IAD ;
//     c'est aussi le meilleur signal de priorité (il publie déjà du commerce) ;
//   - les annuaires des réseaux : pas encore lus (voir ANNUAIRES : vérification sur le serveur d'abord).
// Le téléphone se prend dans cet ordre : annuaire du réseau, annonce, registre (Data-B), Apollo en dernier (payant).
// Doublons : même SIREN, sinon même numéro ou même mail, sinon même nom dans le même réseau (ou un réseau inconnu).

/**
 * Les réseaux de mandataires. `motif` reconnaît le réseau dans un nom d'annonce ; `domaines` dans un mail ou un site
 * (un indice de plus : un domaine inexact ne fait que manquer une reconnaissance).
 */
export const RESEAUX = [
  { cle: 'iad', nom: 'IAD', motif: /\biad\b/i, domaines: ['iadfrance.fr', 'iad.fr'] },
  { cle: 'safti', nom: 'SAFTI', motif: /\bsafti\b/i, domaines: ['safti.fr'] },
  { cle: 'capifrance', nom: 'Capifrance', motif: /\bcapi\s*france\b/i, domaines: ['capifrance.fr'] },
  { cle: 'optimhome', nom: 'Optimhome', motif: /\boptim\s*home\b/i, domaines: ['optimhome.com'] },
  { cle: 'proprietes_privees', nom: 'Propriétés-privées', motif: /\bpropri[ée]t[ée]s[\s-]*priv[ée]es\b/i, domaines: ['proprietes-privees.com'] },
  { cle: 'megagence', nom: 'Megagence', motif: /\bmegagence\b/i, domaines: ['megagence.com'] },
  { cle: 'exp', nom: 'eXp', motif: /\bexp\s*(france|realty)\b/i, domaines: ['expfrance.fr'] },
  // Keller Williams a aussi des bureaux locaux (« Keller Williams Nice ») : une agence de la ville qui a une fiche Maps reste une agence.
  { cle: 'keller_williams', nom: 'Keller Williams', motif: /\bkeller\s*williams\b|\bkw\s*france\b/i, domaines: ['kwfrance.com'] },
  { cle: 'bsk', nom: 'BSK', motif: /\bbsk\b/i, domaines: ['bskimmobilier.com'] },
  { cle: 'efficity', nom: 'Efficity', motif: /\befficity\b/i, domaines: ['efficity.com'] },
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const CIVILITE = /^(monsieur|madame|mademoiselle|m\.|mme|mlle)\s+/i;

/** Pure : le réseau d'un nom d'agence, d'un mail ou d'un site (null s'il n'en nomme aucun). */
export function reseauDe(...textes) {
  for (const t of textes.filter(Boolean)) {
    const s = String(t);
    const dom = s.toLowerCase().replace(/^.*@/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0];
    const r = RESEAUX.find((x) => x.motif.test(s) || x.domaines.some((d) => dom === d || dom.endsWith(`.${d}`)));
    if (r) return r;
  }
  return null;
}

/** Pure : le nom d'une personne, sans civilité (« Monsieur Vito SCHIAVONE » → « Vito Schiavone »). */
export function nomPersonne(nom) {
  return String(nom || '').replace(CIVILITE, '').trim().toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
}

/** Pure : la clé d'une personne, insensible à l'ordre prénom / nom (« Schiavone Vito » = « Vito Schiavone »). */
export const clePersonne = (nom) => norm(nomPersonne(nom)).split(/[\s-]+/).filter((m) => m.length > 1).sort().join(' ');

// Une adresse de service (« recup.email@ », « contact.nice@ ») n'est pas une personne : c'est le réseau qui répond.
const GENERIQUE = /\b(contact|e?mail|recup|info|infos|accueil|agence|service|services|bonjour|noreply|admin|direction|siege|transaction|transactions|support|equipe|team|immobilier|immo|nice|france)\b/i;
/** Pure : ce nom peut-il être celui d'une personne (deux mots au moins, aucun mot de service) ? */
export const estUnePersonne = (nom) => { const t = nomPersonne(nom); return t.split(/\s+/).length >= 2 && !GENERIQUE.test(t) && !/\d|@/.test(t); };

/** Pure : un nom est-il celui d'une personne en nom propre (« Monsieur … », « Madame … ») ? */
export const estEnNomPropre = (nom) => CIVILITE.test(String(nom || '').trim());

/** L'ordre des sources du téléphone : la plus sûre d'abord. */
export const ORDRE_TELEPHONE = ['annuaire', 'annonce', 'maps', 'registre', 'apollo'];

/** Pure : le téléphone à garder entre l'ancien et le nouveau, selon la source. */
export function telephoneAGarder(ancien, nouveau) {
  if (!nouveau?.telephone) return ancien?.telephone ? ancien : null;
  if (!ancien?.telephone) return nouveau;
  const rang = (s) => { const i = ORDRE_TELEPHONE.indexOf(s); return i < 0 ? ORDRE_TELEPHONE.length : i; };
  return rang(nouveau.source) < rang(ancien.source) ? nouveau : ancien;
}

/**
 * Pure : le mandataire déjà dans la liste. Même SIREN ; sinon même numéro ou même mail ; sinon même personne (nom,
 * dans n'importe quel ordre) dans le même réseau, ou quand l'un des deux n'a pas de réseau connu.
 */
export function retrouverMandataire(lignes, m, { normTel = (t) => String(t || '').replace(/\D/g, '').slice(-9) } = {}) {
  const mandataires = lignes.filter((x) => x.genre === 'mandataire' && !x.fusionnee_dans);
  const tel = normTel(m.telephone);
  const mail = String(m.email || '').toLowerCase();
  const cle = clePersonne(m.nom);
  return (m.siren && mandataires.find((x) => x.siren && x.siren === m.siren))
    || (tel && tel.length >= 9 && mandataires.find((x) => normTel(x.telephone) === tel))
    || (mail && mandataires.find((x) => String(x.email || '').toLowerCase() === mail))
    || (cle && cle.includes(' ') && mandataires.find((x) => clePersonne(x.nom) === cle && (!x.reseau || !m.reseau || x.reseau === m.reseau)))
    || null;
}

/**
 * Les annuaires des réseaux (« trouver un conseiller » par ville) : la meilleure source, avec un numéro appelable.
 * Rien n'en est lu depuis cette machine. Chaque réseau passe d'abord par la vérification des sites d'agences
 * (robots.txt, conditions d'utilisation : server/annonces/verification.js), sur le serveur seulement ; un lecteur
 * n'est écrit qu'après, pour un réseau autorisé, sur la structure réelle de sa page.
 */
export const ANNUAIRES = RESEAUX.map((r) => ({ reseau: r.cle, nom: r.nom, origine: `https://www.${r.domaines[0]}`, lecteur: null }));

// ---------------------------------------------------------------------------
// Coller une page d'annuaire (23 oct. 2026, Jules : « sur IAD à Nice il y en a 90, j'en cherche une, elle n'est pas
// dans la liste »). La personne fait sa recherche sur le site du réseau, comme d'habitude, copie la page (ou les
// fiches, numéros affichés) et la colle : Klocka lit les noms et les numéros. Rien n'est lu par une machine sur le site.
// ---------------------------------------------------------------------------

const TEL = /(?:\+33\s?\(?0?\)?\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
const PAS_UN_NOM = /\b(conseill[eè]re?|mandataire|immobilier|immobili[eè]re|agent|commercial|afficher|voir|contacter|contact|num[ée]ro|t[ée]l[ée]phone|profil|annonces?|biens?|secteur|nice|france|iad|safti|capifrance|optimhome|megagence|efficity|bsk|r[ée]seau|propri[ée]t[ée]s|priv[ée]es|avis|note|[ée]toiles?|km|ville|rechercher|r[ée]sultats?|trier|filtrer|page|suivant|pr[ée]c[ée]dent|accueil|menu)\b/i;

const PARTICULES = new Set(['de', 'du', 'des', 'la', 'le', 'van', 'von', 'der', 'den', 'di', 'da', 'dos', 'del']);

/** Pure : une ligne qui peut être un nom de personne (deux à quatre mots, sans chiffre ni mot de page). */
export function ligneNom(l) {
  const t = String(l || '').replace(/[•·|]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 60 || /[\d@:/]/.test(t) || PAS_UN_NOM.test(t)) return null;
  const mots = t.split(' ');
  if (mots.length < 2 || mots.length > 4) return null;
  if (!mots.every((m) => /^[A-ZÀ-Ýa-zà-ÿ][A-Za-zÀ-ÿ'’-]*$/.test(m))) return null;
  // Chaque mot d'un nom prend une majuscule (« Claire MARTIN », « Marc-Henry Paturot ») ; seule une particule, jamais
  // en tête, s'écrit en minuscules (« Anne de Villiers »). Les libellés d'une page (« Sous compromis », « Mentions
  // légales », « Faire gérer ») ont un mot en minuscules : ce ne sont pas des personnes.
  if (!mots.every((m, i) => /^[A-ZÀ-Ý]/.test(m) || (i > 0 && i < mots.length - 1 && PARTICULES.has(m)))) return null;
  return nomPersonne(t);
}

/** Pure : un numéro français écrit « 06 12 34 56 78 ». */
export function telFrancais(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('33')) d = `0${d.slice(2).replace(/^0/, '')}`;
  if (d.length !== 10 || !d.startsWith('0')) return null;
  return d.match(/.{2}/g).join(' ');
}

/**
 * Pure : les personnes d'une page collée, dans l'ordre. Chaque numéro va au dernier nom vu qui n'en a pas encore ;
 * un nom sans numéro est gardé (on saura qu'il existe). Les doublons d'une même page se fondent.
 */
export function lireCollage(texte) {
  const gens = [];
  for (const brute of String(texte || '').split(/\r?\n/)) {
    const tels = (brute.match(TEL) || []).map(telFrancais).filter(Boolean);
    const sansTel = brute.replace(TEL, ' ');
    // « Claire BourgeoisNice (06000) » (la fiche IAD) : le nom collé à sa ville et son code postal.
    const derniere = gens[gens.length - 1];
    const cp = String(brute).trim().match(/\((\d{5})\)\s*$/);
    if (derniere && cp && sansAccentsBas(brute).startsWith(sansAccentsBas(derniere.nom_brut || derniere.nom))) {
      if (!derniere.code_postal) derniere.code_postal = cp[1];
      continue;
    }
    const nom = ligneNom(sansTel);
    if (nom) {
      const deja = gens.find((g) => clePersonne(g.nom) === clePersonne(nom));
      if (!deja) gens.push({ nom, nom_brut: sansTel.replace(/\s+/g, ' ').trim(), telephone: null });
    }
    for (const tel of tels) {
      const cible = [...gens].reverse().find((g) => !g.telephone);
      if (cible && !gens.some((g) => g.telephone === tel)) cible.telephone = tel;
    }
  }
  return gens.map(({ nom_brut, ...g }) => (g.code_postal ? g : { nom: g.nom, telephone: g.telephone }));
}
const sansAccentsBas = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

