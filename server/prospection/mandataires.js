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
export const ORDRE_TELEPHONE = ['annuaire', 'annonce', 'registre', 'apollo'];

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
