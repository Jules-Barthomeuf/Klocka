// Choisir la bonne adresse parmi ce que la Base Adresse Nationale propose.
//
// La BAN classe ses réponses par un score qui lui est propre, et prendre la
// première coûtait cher. « Place de Béthune » avec le code postal 59000 rendait
// « Rue du Faubourg de Béthune 59000 Lille » à 0,43, juste au-dessus du seuil
// d'acceptation : la Place de Béthune est en 59800, et un code postal erroné
// suffisait à faire gagner une voie qui ne partage que la moitié du nom. Toute
// l'analyse de marché partait ensuite sur cette adresse — Data-B et Equimmox
// reçoivent le libellé retenu, ils ne le contestent pas.
//
// On compare donc ce qui a été tapé à ce qui est proposé, mot à mot, avec deux
// idées simples :
//
//   LE TYPE DE VOIE TRANCHE. Une place demandée n'est pas une rue. C'est ce
//   seul critère qui sépare la Place de Béthune de la Rue du Faubourg de
//   Béthune, puisque le nom « Béthune » est dans les deux.
//
//   UN MOT EN TROP COMPTE. « Faubourg » n'a pas été tapé ; une proposition qui
//   l'ajoute s'éloigne de la demande, même si tous les mots demandés y sont.
//
// Le code postal, lui, ne départage pas : se tromper de code postal est plus
// courant que se tromper de nom de rue. Quand le code retenu n'est pas celui
// qui a été tapé, on le dit plutôt que de le taire.

/** Les types de voie, sous leur forme longue. */
const TYPES = new Set([
  'rue', 'avenue', 'boulevard', 'place', 'cours', 'chemin', 'impasse', 'allee',
  'quai', 'route', 'traverse', 'montee', 'descente', 'promenade', 'square',
  'corniche', 'passage', 'galerie', 'esplanade', 'parvis', 'sentier', 'voie',
  'chaussee', 'digue', 'mail', 'villa', 'hameau', 'residence', 'rond',
]);

/** Ce que le registre et les gens abrègent. */
const ABREGES = {
  av: 'avenue', ave: 'avenue', bd: 'boulevard', bld: 'boulevard', boul: 'boulevard',
  pl: 'place', rte: 'route', ch: 'chemin', imp: 'impasse', all: 'allee',
  sq: 'square', crs: 'cours', fbg: 'faubourg', st: 'saint', ste: 'sainte',
};

/** Les mots qui ne portent aucun sens propre dans une adresse. */
// « bis » et « ter » précisent le numéro, pas le nom de la voie : les compter
// comme des mots à retrouver faisait passer « 31 bis rue Michel Ange » pour
// une demande à moitié comprise.
const VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux', 'france', 'sur', 'sous', 'en', 'bis', 'ter', 'quater']);

export const normaliser = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Les mots d'un texte, abréviations dépliées. */
export const motsDe = (s) => normaliser(s).split(' ').filter(Boolean).map((m) => ABREGES[m] || m);

/** « bethunes » et « bethune » sont le même mot. */
const racine = (m) => (m.length > 3 ? m.replace(/s$/, '') : m);

const estCodePostal = (m) => /^\d{5}$/.test(m);

/** Le type de voie d'une suite de mots, s'il y en a un. Pure. */
export function typeDeVoie(mots) {
  for (const m of mots) if (TYPES.has(racine(m))) return racine(m);
  return null;
}

/**
 * Le numéro dans la voie, quand la demande commence par lui. Pure.
 *
 * Seulement en tête : « 49 rue Dabray » commence par son numéro, « Rue du 8
 * Mai 1945 » porte une date dans son nom, et confondre les deux ferait perdre
 * un mot qui identifie la voie.
 */
export function numeroDe(mots) {
  const m = mots?.[0];
  if (!m || estCodePostal(m)) return null;
  return /^\d{1,4}(bis|ter|quater|[a-z])?$/.test(m) ? m : null;
}

/** Les mots qui portent le sens : ni type de voie, ni mot vide, ni code postal. */
const utiles = (mots, aExclure = new Set()) => mots
  .filter((m) => !VIDES.has(m) && !TYPES.has(racine(m)) && !estCodePostal(m) && !aExclure.has(racine(m)))
  .map(racine);

/**
 * À quel point une proposition répond à ce qui a été tapé. Pure : testée sans
 * réseau.
 *
 * @param {string} requete ce que l'utilisateur a écrit
 * @param {{street?:string, name?:string, city?:string, postcode?:string, label?:string, score?:number}} candidat
 */
export function concordance(requete, candidat) {
  const motsRequete = motsDe(requete);
  const ville = new Set(motsDe(candidat?.city || '').map(racine));
  // Le numéro vit dans son propre champ, pas dans le nom de la voie : le
  // laisser parmi les mots à retrouver faisait passer « 49 rue Dabray » pour
  // une demande à moitié comprise.
  const numero = numeroDe(motsRequete);
  const corps = numero ? motsRequete.slice(1) : motsRequete;
  // La ville n'est pas un mot de la voie : elle ne compte ni comme trouvée ni
  // comme superflue, qu'elle ait été tapée ou non.
  const demandes = utiles(corps, ville);
  const voie = candidat?.street || candidat?.name || candidat?.label || '';
  const proposes = utiles(motsDe(voie), ville);

  const ensembleProposes = new Set(proposes);
  const ensembleDemandes = new Set(demandes);
  const trouves = demandes.filter((m) => ensembleProposes.has(m)).length;
  const superflus = proposes.filter((m) => !ensembleDemandes.has(m)).length;

  const typeDemande = typeDeVoie(corps);
  const typePropose = typeDeVoie(motsDe(voie));

  const cpDemande = motsRequete.find(estCodePostal) || null;
  const cpPropose = String(candidat?.postcode || '') || null;

  return {
    part: demandes.length ? trouves / demandes.length : 0,
    bruit: proposes.length ? superflus / proposes.length : 0,
    type_demande: typeDemande,
    type_propose: typePropose,
    // Une place demandée et une rue proposée : ce n'est pas la même voie.
    type_contredit: !!(typeDemande && typePropose && typeDemande !== typePropose),
    numero_demande: numero,
    numero_propose: String(candidat?.housenumber || '') || null,
    // « 31 » et « 31 bis » ne se contredisent pas : l'un précise l'autre.
    numero_contredit: (() => {
      const nd = normaliser(numero || '');
      const np = normaliser(candidat?.housenumber || '');
      return !!(nd && np && !np.startsWith(nd) && !nd.startsWith(np));
    })(),
    numero_absent: !!(numero && !candidat?.housenumber),
    code_postal_demande: cpDemande,
    code_postal_propose: cpPropose,
    code_postal_contredit: !!(cpDemande && cpPropose && cpDemande !== cpPropose),
  };
}

/**
 * Les propositions, de la plus fidèle à la moins fidèle. Pure.
 *
 * La note mêle trois choses : les mots demandés qu'on retrouve, les mots en
 * trop, et le score de la BAN. Un type de voie contredit la divise : il faut
 * que la proposition soit bien meilleure par ailleurs pour repasser devant.
 */
export function classer(requete, candidats) {
  return (candidats || [])
    .map((c) => {
      const k = concordance(requete, c);
      // Un type de voie contredit divise la note : une place n'est pas une rue.
      const facteurType = k.type_contredit ? 0.2 : 1;
      // Un numéro demandé et non rendu, c'est la bonne voie sans le point
      // précis : on préfère la proposition qui le porte, sans écarter l'autre.
      const facteurNumero = k.numero_contredit ? 0.6 : k.numero_absent ? 0.8 : 1;
      const note = facteurType * facteurNumero
        * (0.55 * k.part + 0.25 * (1 - k.bruit) + 0.2 * Math.max(0, Math.min(1, c?.score ?? 0)));
      return { ...c, concordance: k, note: Math.round(note * 1000) / 1000 };
    })
    .sort((a, b) => b.note - a.note || (b.score ?? 0) - (a.score ?? 0));
}

/** En deçà, la proposition ne répond pas vraiment à ce qui a été demandé. */
export const NOTE_SUFFISANTE = 0.55;

/**
 * Faut-il redemander sans le code postal ? Pure.
 *
 * Un code postal erroné tire la réponse vers une autre voie du même code. Si
 * la meilleure proposition contredit le type de voie demandé, ou laisse des
 * mots demandés de côté, on repose la question sans lui.
 */
export function redemanderSansCodePostal(requete, meilleur) {
  if (!motsDe(requete).some(estCodePostal)) return null;
  const k = meilleur?.concordance;
  if (meilleur && !k?.type_contredit && (k?.part ?? 0) >= 1 && (meilleur.note ?? 0) >= NOTE_SUFFISANTE) return null;
  const sans = motsDe(requete).filter((m) => !estCodePostal(m)).join(' ');
  return sans.length >= 4 ? sans : null;
}
