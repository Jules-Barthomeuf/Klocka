// Les commerces d'une ville, lus dans l'annuaire des entreprises de l'État.
//
// Chaque établissement y a une adresse, un code APE, une enseigne, un état.
// Ce fichier dit ce qu'on en garde : lequel est un commerce de pied
// d'immeuble (une boutique, un restaurant, un coiffeur : ce que Klocka
// achète), lequel ne l'est pas (un cabinet au troisième, une SCI, un
// grossiste), comment on lit sa rue, et quel mot français mettre sur son
// code APE pour que les règles d'exclusion (server/deal/data/activites.json)
// le reconnaissent.

// --- Les codes APE des commerces de pied d'immeuble --------------------------------------
//
// Le libellé est écrit pour les mots-clés des règles : « snack » exclut la
// restauration rapide, « cabinet d'avocat » exclut la profession libérale,
// « café » range en restauration. Un code absent d'ici n'est pas un commerce
// de pied d'immeuble : on ne crée pas de cible pour lui.
const APE = [
  ['4711', 'Supérette, supermarché'],
  ['4719', 'Grand magasin, bazar'],
  ['4721', 'Primeur, fruits et légumes'],
  ['4722', 'Boucherie, charcuterie'],
  ['4723', 'Poissonnerie'],
  ['4724', 'Boulangerie, pâtisserie (commerce)'],
  ['4725', 'Caviste, vins et spiritueux'],
  ['4726', 'Tabac, presse'],
  ['4729', 'Épicerie fine, alimentation spécialisée'],
  ['4730', 'Station-service'],
  ['4741', 'Informatique, téléphonie'],
  ['4742', 'Téléphonie'],
  ['4743', 'Électronique, hifi'],
  ['4751', 'Tissus, mercerie'],
  ['4752', 'Bricolage, quincaillerie'],
  ['4753', 'Décoration, revêtements'],
  ['4754', 'Électroménager'],
  ['4759', 'Ameublement, meuble, décoration'],
  ['4761', 'Librairie'],
  ['4762', 'Presse, papeterie'],
  ['4763', 'Musique, vidéo'],
  ['4764', 'Articles de sport'],
  ['4765', 'Jouet'],
  ['4771', 'Prêt-à-porter, vêtement'],
  ['4772', 'Chaussure, maroquinerie'],
  ['4773', 'Pharmacie'],
  ['4774', 'Orthopédie, matériel médical'],
  ['4775', 'Parfumerie, cosmétique'],
  ['4776', 'Fleuriste, animalerie'],
  ['4777', 'Bijouterie, horlogerie'],
  ['4778', 'Optique, commerce spécialisé'],
  ['4779', 'Antiquités, brocante, occasion'],
  ['5610A', 'Restaurant, restauration assise'],
  ['5610B', 'Cafétéria, libre-service'],
  ['5610C', 'Restauration rapide (snack, sandwicherie)'],
  ['5621', 'Traiteur'],
  ['5630', 'Bar, café (débit de boissons)'],
  ['1071', 'Boulangerie, pâtisserie'],
  ['1013', 'Charcuterie'],
  ['1052', 'Glacier'],
  ['1085', 'Traiteur, plats préparés'],
  ['9601', 'Pressing, laverie'],
  ['9602', 'Coiffure, salon de beauté'],
  ['9604', 'Institut, spa, bien-être'],
  ['9521', 'Réparation électronique'],
  ['9523', 'Cordonnerie'],
  ['9525', 'Réparation horlogerie, bijouterie'],
  ['9529', 'Réparation, retouche'],
  ['6419', 'Banque'],
  ['6622', 'Courtier en assurance'],
  ['6831', 'Agence immobilière'],
  ['7911', 'Agence de voyage'],
  ['8553', 'Auto-école'],
  ['9313', 'Salle de sport, fitness'],
  ['7420', 'Photographe'],
  ['8690B', 'Laboratoire de biologie médicale'],
  ['4776', 'Fleuriste'],
];

// Ce qu'on croise à une adresse commerçante et qu'on ne prend pas : ce n'est
// pas un pied d'immeuble, ou pas un commerce. Le libellé sert au journal.
const HORS_PIED_D_IMMEUBLE = [
  ['46', 'grossiste'],
  ['478', 'commerce sur marchés, sans local'],
  ['479', 'vente à distance, sans local'],
  ['55', 'hôtel, hébergement'],
  ['6820', 'SCI, location immobilière'],
  ['64', 'holding, finance'],
  ['69', "profession libérale (cabinet d'avocat, expert-comptable)"],
  ['70', 'siège, conseil'],
  ['71', 'profession libérale (architecte, ingénierie)'],
  ['75', 'profession libérale (vétérinaire)'],
  ['86', 'profession libérale (cabinet médical)'],
  ['96', 'service à domicile, sans vitrine'],
];

const codePropre = (code) => String(code || '').replace(/\./g, '').toUpperCase();

/** Le mot français d'un code APE, pour l'écran et pour les règles. */
export function libelleApe(code) {
  const c = codePropre(code);
  if (!c) return null;
  const trouve = APE.find(([prefixe]) => c.startsWith(prefixe));
  return trouve ? trouve[1] : `APE ${c}`;
}

/**
 * Un commerce de pied d'immeuble, ou non. Rend { oui: true } ou
 * { oui: false, motif } : le motif nourrit le journal (« 12 ignorés :
 * professions libérales, SCI »).
 */
export function piedDImmeuble(code) {
  const c = codePropre(code);
  if (!c) return { oui: false, motif: 'sans code APE' };
  if (APE.some(([prefixe]) => c.startsWith(prefixe))) return { oui: true };
  const hors = HORS_PIED_D_IMMEUBLE.find(([prefixe]) => c.startsWith(prefixe));
  return { oui: false, motif: hors ? hors[1] : `hors commerce (APE ${c})` };
}

// --- L'adresse ------------------------------------------------------------------------------

const TYPES_DE_VOIE = {
  av: 'avenue', ave: 'avenue', avenue: 'avenue',
  bd: 'boulevard', bvd: 'boulevard', boulevard: 'boulevard',
  pl: 'place', place: 'place',
  all: 'allée', allee: 'allée', allée: 'allée',
  ch: 'chemin', che: 'chemin', chemin: 'chemin',
  rte: 'route', route: 'route',
  imp: 'impasse', impasse: 'impasse',
  qu: 'quai', quai: 'quai',
  crs: 'cours', cours: 'cours',
  sq: 'square', square: 'square',
  pas: 'passage', passage: 'passage',
  prom: 'promenade', promenade: 'promenade',
  espl: 'esplanade', esplanade: 'esplanade',
  trav: 'traverse', traverse: 'traverse',
  mte: 'montée', montee: 'montée', montée: 'montée',
  fbg: 'faubourg', faubourg: 'faubourg',
  rue: 'rue', r: 'rue',
  gal: 'galerie', galerie: 'galerie',
  rpt: 'rond-point', 'rond-point': 'rond-point',
  mail: 'mail', parvis: 'parvis', villa: 'villa', sentier: 'sentier', descente: 'descente', lot: 'lotissement', lotissement: 'lotissement', res: 'résidence', residence: 'résidence', résidence: 'résidence', zac: 'zac',
};
const TYPES = Object.keys(TYPES_DE_VOIE).sort((a, b) => b.length - a.length).join('|');

const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Une clé de rue comparable : sans accent, sans ponctuation, type de voie écrit en entier. */
export function cleRue(nom) {
  const mots = sansAccent(String(nom || '').toLowerCase())
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (mots.length && TYPES_DE_VOIE[mots[0]]) mots[0] = sansAccent(TYPES_DE_VOIE[mots[0]]);
  // Les articles ne distinguent pas deux rues : OpenStreetMap écrit
  // « Boulevard Président Wilson » sur un kilomètre sept et « Boulevard du
  // Président Wilson » sur trente-neuf mètres, et la clé qui gardait le « du »
  // en faisait deux rues — la petite était classée et parcourue, la vraie
  // oubliée. Le premier mot reste : « La Croisette » n'est pas « Croisette ».
  return mots.filter((m, i) => i === 0 || !ARTICLES.has(m)).join(' ');
}

/** Ce qui se retire d'une clé de rue : les articles et les prépositions de liaison. */
const ARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd']);

const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'sous', 'en', 'au', 'aux', 'a', 'à', 'l', 'd']);

/** « RUE D'ANTIBES » → « Rue d'Antibes ». Le type de voie en entier, les petits mots en bas de casse. */
export function joliNomDeRue(nom) {
  const brut = String(nom || '').trim().replace(/\s+/g, ' ');
  if (!brut) return null;
  const mots = brut.toLowerCase().split(' ');
  if (TYPES_DE_VOIE[mots[0]]) mots[0] = TYPES_DE_VOIE[mots[0]];
  return mots
    .map((m, i) =>
      m
        .split(/(['’-])/)
        .map((part, k, tout) => {
          if (part === "'" || part === '’' || part === '-') return part;
          const precedent = tout[k - 1];
          // « d'antibes » : le d reste bas, Antibes prend sa capitale.
          if (precedent === "'" || precedent === '’') return part.charAt(0).toUpperCase() + part.slice(1);
          if (i > 0 && PETITS.has(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join('')
    )
    .join(' ');
}

/**
 * « HESPERIDES DE CANNES 123 RUE D'ANTIBES 06400 CANNES » → numéro, rue,
 * code postal, ville. On prend le dernier « numéro + type de voie » avant le
 * code postal ; sans numéro, le type de voie seul.
 */
export function rueDe(adresse) {
  const a = String(adresse || '').replace(/\s+/g, ' ').trim();
  const m = a.match(new RegExp(`^(?:.*?\\s)??(\\d+\\s*(?:bis|ter|quater|[a-d])?)?\\s*\\b((?:${TYPES})\\b[^\\d]*?)\\s+(\\d{5})\\s+(.+)$`, 'i'));
  if (!m) {
    const n = a.match(/^(.*?)\s+(\d{5})\s+(.+)$/);
    return n ? { numero: null, rue: joliNomDeRue(n[1]), code_postal: n[2], ville: joliNomDeRue(n[3]) } : { numero: null, rue: null, code_postal: null, ville: null };
  }
  return {
    numero: m[1] ? m[1].replace(/\s+/g, '').toLowerCase() : null,
    rue: joliNomDeRue(m[2].trim()),
    code_postal: m[3],
    ville: joliNomDeRue(m[4]),
  };
}

// --- L'établissement ------------------------------------------------------------------------

/** Ce qu'ALX garde d'un établissement de l'annuaire. */
export function etablissementDe(unite, etab) {
  const e = etab || {};
  const u = unite || {};
  const ape = e.activite_principale || u.activite_principale || null;
  const adresse = rueDe(e.adresse);
  const enseigne = (e.liste_enseignes || []).find(Boolean) || e.nom_commercial || u.nom_complet || null;
  return {
    siret: e.siret || null,
    siren: u.siren || (e.siret ? String(e.siret).slice(0, 9) : null),
    nom: u.nom_complet || u.nom_raison_sociale || null,
    enseigne: enseigne ? String(enseigne).trim() : null,
    ape: ape ? codePropre(ape) : null,
    activite: libelleApe(ape),
    pied_d_immeuble: piedDImmeuble(ape),
    adresse: e.adresse || null,
    numero: adresse.numero,
    rue: adresse.rue,
    cle_rue: cleRue(adresse.rue),
    code_postal: e.code_postal || adresse.code_postal || null,
    ville: e.libelle_commune ? joliNomDeRue(e.libelle_commune) : adresse.ville,
    lat: e.latitude != null ? Number(e.latitude) : null,
    lon: e.longitude != null ? Number(e.longitude) : null,
    depuis: e.date_debut_activite || e.date_creation || null,
    actif: e.etat_administratif === 'A',
    // Une enseigne présente dans dix établissements ou plus : une chaîne, un
    // signe d'emplacement solide.
    chaine: Number(u.nombre_etablissements_ouverts || 0) >= 10 && !!(e.liste_enseignes || []).length,
  };
}
