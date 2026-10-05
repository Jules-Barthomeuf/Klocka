// Data Prospective, le moteur de prospection du mandataire.
//
// ALX parcourait les rues ; Data-B, lui, a déjà tout en base : chaque
// établissement avec son téléphone, son mail, la typologie de sa rue (n°1 →
// résidentielle), l'effectif, la solvabilité, l'ancienneté, indépendant ou
// enseigne. La prospection devient : choisir une zone (dans son secteur),
// éventuellement une rue, des métiers et des critères — ou laisser la
// suggestion intelligente poser des critères sains — et lire les résultats.
//
// Le parcours HTTP, relevé sur le site le 1er octobre 2026 :
//   POST frontend/query/construct_adresse_simple.php (type=territoire,
//        ville=<valeur du sélecteur>, metier[]=<ids>, filtres s_tranche_*)
//        → « territoire|<t> »
//   GET  carte?t=<t> → la page porte token et requête sérialisée
//   POST cV4.json?token&param=…&page=N → les documents Solr, 50 par page
//
// Une prospective lancée reste chez Data-B (« Prospectives réalisées ») ; on
// garde ici le jeton et les critères, et on relit les pages à la demande.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from './db.js';
import { postDataB, postDataBCorps, pageDataB } from './data-b.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));

/** Les métiers de Data-B : libellé → identifiant, relevés du formulaire. */
export const METIERS = JSON.parse(fs.readFileSync(path.join(ICI, 'metiers-datab.json'), 'utf8'));

export const TYPES_RUE = { 5: 'Rue N°1', 4: 'Rue très commerçante', 3: 'Rue commerçante', 2: 'Rue semi commerçante', 1: 'Rue résidentielle' };
export const SOLVABILITES = {
  100: 'En liquidation', 0: 'Cessation en cours', '1-1': 'Procédure collective', '1-2': 'Risque avéré',
  '3-5': 'Risque très élevé', '6-8': 'Risque élevé', '9-12': 'Risque moyen', '13-16': 'Risque faible',
  '17-20': 'Risque très faible', 101: 'Sur demande',
};
export const EFFECTIFS = {
  0: 'Aucun salarié', 1: '1 ou 2', 2: '3 à 5', 3: '6 à 9', 11: '10 à 19', 12: '20 à 49', 21: '50 à 99',
  22: '100 à 199', 31: '200 à 249', 32: '250 à 499', 41: '500 à 999', 42: '1 000+', 51: '2 000+', 52: '5 000+', 53: '10 000+',
};

// Les critères du formulaire, tels que le site les nomme : on les passe tels
// quels. (valeurs ↔ libellés relevés du formulaire « territoire »)
export const FILTRES = {
  type_entreprise: { champ: 's_tranche_type_entreprise[]', valeurs: { 1: 'Entreprise', 2: 'Entrepreneur individuel' } },
  nb_etablissements: { champ: 'nbre_etab[]', valeurs: { 1: '1 seul', 2: '2', 3: '3 à 5', 6: '6 à 10', 10: 'Plus de 10' } },
  solvabilite: { champ: 's_trancheSolvabilites[]', valeurs: SOLVABILITES },
  type_rue: { champ: 's_tranche_type_rue[]', valeurs: TYPES_RUE },
  effectif: { champ: 'trancheEffectif[]', valeurs: EFFECTIFS },
  date_creation: { champ: 's_tranche_date_creation[]', valeurs: { 0: 'Moins de 1 an', 1: '1 à 3 ans', 3: '3 à 6 ans', 6: '6 à 9 ans', 9: 'Plus de 9 ans' } },
  inde_enseigne: { champ: 's_tranche_inde_enseigne[]', valeurs: { 1: 'Indépendant', 2: 'Enseigne' } },
  immobilier: { champ: 's_tranche_immobilier[]', valeurs: { GERANTPROPRIETAIRE: 'Propriétaire exploitant', FONCIER: 'Avec propriétaire du foncier', COPRO: 'Avec copropriété', RENEWBAIL: 'Bail à renouveler sous 6 mois', SBOCESSIONPRIX: "Avec prix d'acquisition" } },
  age_gerant: { champ: 's_tranche_age_gerant[]', valeurs: { 60: '60 ans et plus', 59: '45 à 59 ans', 45: 'Moins de 45 ans' } },
  contact: { champ: 's_tranche_contact[]', valeurs: { TELS: 'Avec téléphone', EMAILS: 'Avec email' } },
};

// La suggestion intelligente : ce qu'un mandataire sensé cocherait pour une
// première passe — des indépendants, en rue au moins commerçante, solvables,
// joignables. Les métiers restent ouverts.
export const SUGGESTION = {
  inde_enseigne: ['1'],
  type_rue: ['5', '4', '3'],
  solvabilite: ['9-12', '13-16', '17-20'],
  contact: ['TELS'],
};

const decoder = (t) => String(t || '').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

// ---------------------------------------------------------------------------
// Les sélecteurs du site : villes, rues.
// ---------------------------------------------------------------------------

/** Les villes que Data-B connaît sous ce nom, avec la valeur exacte de son sélecteur. */
export async function chercherVilles(recherche) {
  const html = await postDataB('https://prospective.data-b.com/frontend/load/inc/ter_situation_ville.php', { search: String(recherche || '').trim(), dep: '' });
  const villes = [];
  for (const m of String(html).matchAll(/<input[^>]*lat="([^"]+)"[^>]*lng="([^"]+)"[^>]*name="ville"[^>]*value="([^"]+)"[^>]*lib="([^"]+)"/g)) {
    villes.push({ valeur: m[3], nom: decoder(m[4]), lat: Number(m[1]), lon: Number(m[2]) });
  }
  // L'ordre des attributs varie : seconde lecture, plus souple.
  if (!villes.length) {
    for (const m of String(html).matchAll(/<input([^>]*name="ville"[^>]*)>/g)) {
      const a = (nom) => (m[1].match(new RegExp(`${nom}="([^"]+)"`)) || [])[1];
      if (a('value')) villes.push({ valeur: a('value'), nom: decoder(a('lib') || a('value').split('|')[2] || ''), lat: Number(a('lat')), lon: Number(a('lng')) });
    }
  }
  return villes;
}

/**
 * Les rues de la ville choisie. Le sélecteur du site les nomme « place »
 * (name="place"), avec la typologie en option : on la propage.
 */
export async function chercherRues(recherche, villeValeur, { type_rue = '' } = {}) {
  const html = await postDataB('https://prospective.data-b.com/frontend/load/inc/ter_situation_rue.php', { search: String(recherche || '').trim(), ville: villeValeur, type_rue: String(type_rue || '') });
  const rues = [];
  for (const m of String(html).matchAll(/<input([^>]*name="place"[^>]*)>/g)) {
    const a = (nom) => (m[1].match(new RegExp(`${nom}="([^"]+)"`)) || [])[1];
    if (a('value')) rues.push({ valeur: a('value'), nom: decoder(a('lib') || a('value').split('|')[2] || ''), lat: Number(a('lat')) || null, lon: Number(a('lng')) || null });
  }
  return rues;
}

// ---------------------------------------------------------------------------
// Lancer, puis lire.
// ---------------------------------------------------------------------------

const ENTITE = 'ProspectiveDataB';
const moi = (user) => String(user?.email || '').toLowerCase();

/**
 * Lance une prospective territoire chez Data-B et garde le jeton.
 * `filtres` : { type_rue: ['5','4'], solvabilite: [...], ... } (clés de FILTRES).
 */
export async function lancerProspective({ nom, ville, rue = null, metiers = [], filtres = {} }, user) {
  if (!ville?.valeur) return { ok: false, error: 'Choisissez la ville à prospecter.' };
  const form = { type: 'territoire', prospective_name: String(nom || `Prospective ${ville.nom}`).slice(0, 80), ville: ville.valeur };
  if (rue?.valeur) form.place = rue.valeur;
  const listes = { 'metier[]': (metiers || []).map(String) };
  for (const [cle, valeurs] of Object.entries(filtres || {})) {
    const def = FILTRES[cle];
    if (!def || !Array.isArray(valeurs) || !valeurs.length) continue;
    listes[def.champ] = valeurs.map(String);
    if (def.champ.startsWith('s_')) form.activate_advanced_search = 'on';
  }
  // postDataB sérialise un objet plat : les champs répétés passent par URLSearchParams.
  const corps = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) corps.append(k, v);
  for (const [k, vs] of Object.entries(listes)) for (const v of vs) corps.append(k, v);
  const reponse = await postDataBCorps('https://prospective.data-b.com/frontend/query/construct_adresse_simple.php', corps.toString());
  const [type, jeton] = String(reponse || '').trim().split('|');
  if (!jeton || type === 'error') return { ok: false, error: `Data-B refuse le lancement${jeton ? ` (${jeton})` : ''}.` };
  const p = Records.create(ENTITE, {
    mandataire_email: moi(user),
    jeton,
    nom: form.prospective_name,
    criteres: { ville: { nom: ville.nom, valeur: ville.valeur, lat: ville.lat ?? null, lon: ville.lon ?? null }, rue: rue || null, metiers, filtres },
    cree_le: new Date().toISOString(),
  });
  console.log(`[data-b] prospective lancée : ${form.prospective_name} (${moi(user)})`);
  return { ok: true, prospective: p };
}

/** Les prospectives de ce mandataire, la plus récente d'abord. */
export function mesProspectives(user) {
  return Records.list(ENTITE)
    .filter((p) => p.mandataire_email === moi(user))
    .sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)));
}

const telPropre = (t) => {
  const n = String(t || '').replace(/\D/g, '');
  return n.length === 10 ? n.replace(/(\d{2})(?=\d)/g, '$1 ').trim() : null;
};

/** Pure : un document Solr devient une ligne lisible. */
export function normaliserDoc(d) {
  const adresse = [d.NUMVOIE, d.TYPVOIE, d.LIBVOIE].filter(Boolean).join(' ').trim() || d.ADRESSE_COURT || null;
  const complet = decoder(d.ADRESSE_COMPLETE_DECLAREE || '');
  const villeM = complet.match(/\b\d{5}\s+(.+)$/);
  return {
    siret: d.SIRET || null,
    siren: d.SIREN || null,
    nom: decoder(d.NOM_1 || d.SBODENOMINATION || ''),
    enseigne: decoder(d.ENSEIGNE || '') || null,
    societe: decoder(d.NOM_3 || '') || null,
    metier_id: d.config_metiers_id ?? null,
    adresse,
    code_postal: d.CODPOS || null,
    ville: villeM ? villeM[1] : null,
    type_rue: d.TYPE_RUE ?? null,
    type_rue_mot: TYPES_RUE[d.TYPE_RUE] || null,
    telephone: telPropre(d.TEL_1) || telPropre(String(d.TELS || '').split(';')[0]),
    emails: [d.EMAIL_1, d.EMAIL_2, d.EMAIL_3].filter((e) => e && /@/.test(e)),
    site: d.URL_SITE || null,
    lat: d.PLACE_LAT ?? null,
    lon: d.PLACE_LNG ?? null,
    independant: d.INDE === 1,
    effectif: EFFECTIFS[d.TEFET] || null,
    solvabilite: SOLVABILITES[d.SECOSOLVABILITE] || null,
    solvabilite_code: d.SECOSOLVABILITE ?? null,
    creation: (Array.isArray(d.SDIR_AAAAS) && d.SDIR_AAAAS[0]) || (d.DCRET_AAAA && d.DCRET_AAAA > 1900 ? String(d.DCRET_AAAA) : null),
    debut_activite: d.DDEBACT || null,
    ca: d.SECOKCA || null,
    surface: d.SURFACE || null,
    nb_etablissements: d.NRE_ETABS ?? d.SDIR_KEY_COUNT ?? null,
    proprietaire_exploitant: d.GERANTPROPRIETAIRE === 1,
    foncier_connu: d.HAS_FONCIER === 1,
    bail_a_renouveler: d.RENEW_BAIL === 1,
    en_nom_propre: d.EN_NOM_PROPRE === 1 || d.EN_NOM_PROPRE === '1',
    ferme: d.IS_CLOSED === 1,
    grade: d.grade ?? null,
  };
}

/**
 * Une page de résultats d'une prospective : la carte se relit pour le jeton
 * de session de la page, puis cV4.json rend les documents.
 */
export async function resultats(jeton, { page = 1, user } = {}) {
  const p = Records.list(ENTITE).find((x) => x.jeton === jeton && x.mandataire_email === moi(user));
  if (!p) return { ok: false, error: 'Prospective introuvable.' };
  const html = await pageDataB(`https://prospective.data-b.com/carte?t=${encodeURIComponent(jeton)}`);
  const token = String(html).match(/\.prospective\(\{[^}]*token:'([^']+)'/s)?.[1];
  const request = String(html).match(/request:'([^']+)'/s)?.[1];
  if (!token || !request) return { ok: false, error: 'Data-B n\'a pas rendu la carte de cette prospective.' };
  const qs = new URLSearchParams({ token, s: '', page: String(page), param: request, enseigne: '', facet_name: '', facet_value: '', param_free_name: '', param_free_value: '' });
  const brut = await postDataB(`https://prospective.data-b.com/cV4.json?${qs}`, { zone: '', multi_zone: '' });
  let j;
  try { j = JSON.parse(brut); } catch { return { ok: false, error: 'Réponse illisible de Data-B.' }; }
  if (j?.fullresult?.error) return { ok: false, error: `Data-B : ${j.fullresult.error.msg || 'erreur de requête'}.` };
  const docs = j?.fullresult?.response?.docs || [];
  const total = j?.fullresult?.response?.numFound ?? docs.length;
  const lignes = docs.map(normaliserDoc).filter((l) => !l.ferme);
  return {
    ok: true,
    prospective: { jeton: p.jeton, nom: p.nom, criteres: p.criteres, cree_le: p.cree_le },
    page: Number(page),
    par_page: 50,
    total,
    pages: Math.max(1, Math.ceil(total / 50)),
    resultats: lignes,
  };
}

// ---------------------------------------------------------------------------
// Le chat de la prospection : la même structure que le chat du dashboard.
// Le modèle pose les questions (zone → rue → multicritère ou suggestion),
// les outils font le reste. Le formulaire multicritère s'affiche DANS le chat
// (le front le montre quand l'outil formulaire_multicriteres est appelé).
// ---------------------------------------------------------------------------

/** La ville demandée est-elle dans le secteur du mandataire ? */
export async function villeDansSecteurDe(ville, user) {
  const { secteurDe, communeDansSecteur } = await import('./mandataire-espace.js');
  const secteur = secteurDe(user);
  if (!secteur) return { ok: false, error: 'Aucun secteur ne vous est attribué : demandez à Klocka de le tracer.' };
  if (user?.role === 'admin') return { ok: true, secteur };
  try {
    const r = await fetch(`https://geo.api.gouv.fr/communes?lat=${ville.lat}&lon=${ville.lon}&fields=nom,code,codeDepartement,codeRegion&limit=1`, { signal: AbortSignal.timeout(10000) });
    const c = r.ok ? (await r.json())[0] : null;
    if (c && !communeDansSecteur({ ...c, lat: ville.lat, lon: ville.lon }, secteur)) {
      return { ok: false, error: `« ${ville.nom} » n'est pas dans votre secteur « ${secteur.nom} ».` };
    }
  } catch { /* API Géo muette : on ne bloque pas */ }
  return { ok: true, secteur };
}

const normMetier = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pure : des libellés dits en langage courant vers les ids métiers Data-B. */
export function metiersDepuisLibelles(libelles = []) {
  const entrees = Object.entries(METIERS);
  const ids = [];
  const inconnus = [];
  for (const lib of libelles) {
    const q = normMetier(lib).replace(/s\b/g, '');
    const trouve = entrees.find(([k]) => normMetier(k).includes(q) || q.includes(normMetier(k).split(',')[0]));
    if (trouve) ids.push(trouve[1]);
    else inconnus.push(lib);
  }
  return { ids: [...new Set(ids)], inconnus };
}

const ARTICLES = /^(la|le|les|l'|l’)\s*/;
const TYPES_VOIE = /^(rue|place|avenue|av|boulevard|bd|quai|chemin|allee|impasse|cours|route|square|passage|promenade|esplanade)\b\.?\s*/;

/** Pure : « la rue Carnot » → { complet: 'rue carnot', cle: 'carnot', type: 'rue' }. */
export function lireRue(texte) {
  const complet = normMetier(texte).trim().replace(ARTICLES, '').replace(/\s+/g, ' ');
  const type = (complet.match(TYPES_VOIE) || [])[1] || null;
  const cle = complet.replace(TYPES_VOIE, '').trim() || complet;
  return { complet, cle, type };
}

/** Pure : parmi les rues rendues, celle qui répond exactement (type compris), sinon null. */
export function rueExacte(rues, texte) {
  const { complet, cle, type } = lireRue(texte);
  return rues.find((r) => normMetier(r.nom) === complet)
    || (type ? rues.find((r) => { const n = normMetier(r.nom); return n.startsWith(type) && n.endsWith(cle); }) : null)
    || null;
}

/** Les rues d'une ville pour une rue dite en clair (la recherche Data-B veut le mot-clé). */
async function chercherRuesEnClair(texte, villeValeur) {
  const { cle } = lireRue(texte);
  return chercherRues(cle, villeValeur);
}

/**
 * La zone dite en clair → la ville (et la rue) exactes de Data-B, secteur
 * vérifié. Le chat ne garde que le texte des tours précédents : la valeur du
 * sélecteur se retrouve ici plutôt que de compter sur la mémoire du modèle.
 */
export async function resoudreZone({ ville_nom, rue_nom = null }, user, { indices = [] } = {}) {
  const nom = String(ville_nom || '').trim();
  if (!nom) return { ok: false, error: 'Il manque la ville.' };
  const villes = await chercherVilles(nom);
  const n = normMetier(nom);
  const ville = villes.find((v) => normMetier(v.nom) === n) || villes.find((v) => normMetier(v.nom).startsWith(n)) || villes[0] || null;
  if (!ville) return { ok: false, error: `Data-B ne connaît pas « ${nom} ».` };
  const garde = await villeDansSecteurDe(ville, user);
  if (!garde.ok) return garde;
  let rue = null;
  if (String(rue_nom || '').trim()) {
    const rues = await chercherRuesEnClair(rue_nom, ville.valeur);
    // Le modèle abrège parfois (« Carnot ») : ce que le mandataire a tapé
    // (« la rue Carnot ») tranche entre la rue et la place.
    rue = rueExacte(rues, rue_nom) || indices.map((t) => rueExacte(rues, t)).find(Boolean) || (rues.length === 1 ? rues[0] : null);
    if (!rue) {
      return rues.length
        ? { ok: false, ambigu: true, choix: rues.slice(0, 5).map((x) => x.nom), error: 'Plusieurs voies répondent : demande laquelle en une ligne.' }
        : { ok: false, error: `Pas de « ${rue_nom} » à ${ville.nom} chez Data-B.` };
    }
  }
  return { ok: true, ville, rue };
}

const OUTILS_PROSPECTIVE = [
  {
    name: 'villes_datab',
    description: 'Les villes que Data-B connaît sous ce nom (avec leur valeur exacte, à repasser au lancement). À appeler dès que le mandataire nomme une zone.',
    input_schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  },
  {
    name: 'rues_datab',
    description: "Retrouve une voie précise dans la ville déjà choisie. Rend la rue exacte (prends-la sans redemander, passe à la question suivante) ou les voies possibles (demande laquelle en une ligne).",
    input_schema: {
      type: 'object',
      properties: {
        ville_nom: { type: 'string', description: 'La ville déjà choisie, en clair' },
        q: { type: 'string', description: 'La voie telle que le mandataire l\'a dite, type compris (« la rue Carnot »)' },
      },
      required: ['ville_nom', 'q'],
    },
  },
  {
    name: 'proposer_mode',
    description: "Étape 3 : la zone et la rue sont connues. Appelle cet outil : deux boutons « Recherche multicritère » et « Suggestion intelligente » s'affichent sous ta question. Pose la question en une ligne, sans énumérer les options.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'formulaire_multicriteres',
    description: "Le mandataire choisit la recherche multicritère : appelle cet outil avec la ville (et la rue si une rue précise a été choisie) déjà dites dans la conversation. Le formulaire s'ouvre en grand par-dessus la page, la zone déjà remplie : ne la redemande jamais. Réponds UNE ligne (« Le formulaire est ouvert : cochez ce qui compte, puis lancez. »).",
    input_schema: {
      type: 'object',
      properties: { ville_nom: { type: 'string', description: 'La ville déjà choisie' }, rue_nom: { type: 'string', description: 'La voie précise si choisie, type compris (« rue Carnot », pas « Carnot »)' } },
      required: ['ville_nom'],
    },
  },
  {
    name: 'lancer_prospective_datab',
    description:
      "Lance la prospective Data-B. `suggestion: true` pose les critères sains (indépendants, rues commerçantes et mieux, solvables, avec téléphone). `metiers_libelles` : les métiers dits en clair (« boulangeries », « pharmacies »), vide = tous. La ville vient de villes_datab (valeur exacte). Rend le jeton : la page de résultats s'ouvre toute seule, dis-le en une ligne.",
    input_schema: {
      type: 'object',
      properties: {
        ville_nom: { type: 'string', description: 'La ville, en clair (préféré)' },
        rue_nom: { type: 'string', description: 'La rue précise, si choisie' },
        ville: { type: 'object', properties: { valeur: { type: 'string' }, nom: { type: 'string' }, lat: { type: 'number' }, lon: { type: 'number' } }, required: ['valeur', 'nom'] },
        rue: { type: 'object', properties: { valeur: { type: 'string' }, nom: { type: 'string' } } },
        metiers_libelles: { type: 'array', items: { type: 'string' } },
        suggestion: { type: 'boolean' },
      },
    },
  },
];

/** Les deux boutons de l'étape 3 : un clic envoie le libellé, comme tapé. */
export const BOUTONS_MODE = [
  { cle: 'multicritere', libelle: 'Recherche multicritère', texte: 'Recherche multicritère', detail: 'Métiers, solvabilité, type de rue, effectif, ancienneté…' },
  { cle: 'suggestion', libelle: 'Suggestion intelligente', texte: 'Suggestion intelligente', detail: 'Indépendants, rues commerçantes, solvables, joignables', principal: true },
];

/** Pure : la réponse pose-t-elle la question du mode (filet si l'outil n'a pas été appelé) ? */
export const poseLaQuestionDuMode = (texte) => /multicrit[eè]re/i.test(texte || '') && /suggestion/i.test(texte || '') && /\?\s*$/.test(String(texte || '').trim());

/**
 * Un tour du chat de prospection.
 * @returns {Promise<{texte, formulaire: string|null, prospective: {jeton, nom}|null, ville: object|null}>}
 */
export async function discuterProspection({ historique = [], texte, user, surEtape = null }) {
  const { runAgent } = await import('./llm.js');
  const { secteurDe } = await import('./mandataire-espace.js');
  const secteur = secteurDe(user);
  const communes = (secteur?.unites || []).map((u) => u.nom);
  let formulaire = null;
  let prospective = null;
  let villeChoisie = null;
  let boutons = null;

  const consigne = `Tu guides un mandataire K Partners dans sa prospection Data-B. Le dialogue, UNE question à la fois, court, en français, sans markdown :
1. Quelle zone ? ${communes.length ? `Son secteur : ${communes.join(', ')}.` : ''} Une ville hors secteur se refuse en une ligne. Dès qu'il nomme une zone, villes_datab la retrouve (plusieurs villes du même nom : demande laquelle).
2. Une rue précise, ou toute la ville ? S'il nomme une voie, rues_datab avec ville_nom et la voie telle qu'il l'a dite ; voie trouvée : passe à la question 3 sans la redemander. Demande seulement si l'outil rend plusieurs voies possibles (« Carnot » seul : rue ou place ?).
3. Recherche multicritère, ou suggestion intelligente ? Pose cette question en appelant proposer_mode (deux boutons s'affichent). Réponse « Recherche multicritère » : formulaire_multicriteres avec ville_nom (et rue_nom) déjà dits — le formulaire s'ouvre en grand, ne redemande jamais la zone. Réponse « Suggestion intelligente » : lancer_prospective_datab avec ville_nom (et rue_nom) et suggestion: true.
Raccourcis : s'il dit tout d'un coup (« les boulangeries indépendantes à Mâcon »), ne redemande rien, lance directement avec ville_nom et metiers_libelles. S'il nomme des métiers, passe-les en clair. Après un lancement, UNE ligne : la page s'ouvre avec les résultats.`;

  const indices = [texte, ...(Array.isArray(historique) ? historique : []).filter((m) => m.role === 'user').map((m) => m.contenu).reverse()]
    .filter((t) => typeof t === 'string' && t.trim());
  const messages = [...(Array.isArray(historique) ? historique : []), { role: 'user', contenu: texte }]
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.contenu === 'string' && m.contenu.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.contenu }));

  const { text } = await runAgent({
    system: consigne,
    messages,
    tools: OUTILS_PROSPECTIVE,
    onTool: async ({ name, input: entree = {} }) => {
      let input = entree;
      if (name === 'villes_datab') {
        surEtape?.(`Recherche de « ${input.q} » chez Data-B`);
        const villes = (await chercherVilles(input.q)).slice(0, 5);
        return { villes };
      }
      if (name === 'rues_datab') {
        surEtape?.(`Recherche de « ${input.q} » à ${input.ville_nom}`);
        // La ville se résout par son nom : d'un tour à l'autre, seul le texte reste.
        const z = await resoudreZone({ ville_nom: input.ville_nom, rue_nom: input.q }, user, { indices });
        if (z.ok) return { ok: true, ville: z.ville.nom, rue: z.rue?.nom || null, note: 'Voie trouvée : ne la redemande pas, pose la question suivante.' };
        return z;
      }
      if (name === 'proposer_mode') {
        boutons = BOUTONS_MODE;
        return { ok: true, note: 'Les deux boutons s\'affichent sous ta question : pose-la en une ligne.' };
      }
      if (name === 'formulaire_multicriteres') {
        const z = await resoudreZone(input, user, { indices });
        if (!z.ok) return z;
        formulaire = { type: 'multicriteres', ville: z.ville, rue: z.rue };
        return { ok: true, ville: z.ville.nom, rue: z.rue?.nom || null, note: 'Le formulaire est ouvert, zone remplie : ne liste pas les critères toi-même.' };
      }
      if (name === 'lancer_prospective_datab') {
        // La zone en clair se résout ici ; un objet ville passé tel quel se vérifie.
        if (!input.ville?.valeur) {
          const z = await resoudreZone({ ville_nom: input.ville_nom || input.ville?.nom, rue_nom: input.rue_nom || input.rue?.nom || null }, user, { indices });
          if (!z.ok) return z;
          input = { ...input, ville: z.ville, rue: z.rue };
        } else {
          const garde = await villeDansSecteurDe(input.ville, user);
          if (!garde.ok) return { ok: false, error: garde.error };
        }
        const { ids, inconnus } = metiersDepuisLibelles(input.metiers_libelles || []);
        if (inconnus.length && !ids.length) return { ok: false, error: `Métier inconnu chez Data-B : ${inconnus.join(', ')}. Demande de reformuler.` };
        surEtape?.(`Lancement de la prospective sur ${input.ville.nom}`);
        const r = await lancerProspective({
          nom: [input.ville.nom, input.rue?.nom, (input.metiers_libelles || []).join(', ') || null].filter(Boolean).join(' · '),
          ville: input.ville,
          rue: input.rue || null,
          metiers: ids,
          filtres: input.suggestion ? SUGGESTION : {},
        }, user);
        if (!r.ok) return r;
        prospective = { jeton: r.prospective.jeton, nom: r.prospective.nom };
        villeChoisie = input.ville;
        return { ok: true, jeton: r.prospective.jeton, nom: r.prospective.nom, ...(inconnus.length ? { note: `Métiers ignorés (inconnus) : ${inconnus.join(', ')}` } : {}) };
      }
      return { ok: false, error: `Outil inconnu : ${name}` };
    },
  });
  const reponse = String(text || '').trim();
  // Le filet : la question du mode est posée sans l'outil, les boutons suivent quand même.
  if (!boutons && !formulaire && !prospective && poseLaQuestionDuMode(reponse)) boutons = BOUTONS_MODE;
  return { texte: reponse, formulaire, prospective, ville: villeChoisie, boutons };
}

// ---------------------------------------------------------------------------
// Un établissement Data-B devient une cible ALX : la recherche du propriétaire
// des murs (cadastre, DGFiP) et de son numéro (Pages Blanches) tourne dessus
// comme sur un commerce lu par ALX. Le numéro de Data-B est celui du COMMERCE.
// ---------------------------------------------------------------------------

const EMPLACEMENT_DE_RUE = { 5: 1, 4: 1.5, 3: 2 };
const libelleMetier = (id) => Object.keys(METIERS).find((k) => String(METIERS[k]) === String(id)) || null;

/** Pure : « LYON 5EME », « PARIS 11 », « MARSEILLE CEDEX 08 » → la commune seule (« LYON »). */
export function baseCommune(ville) {
  return String(ville || '').replace(/\s+cedex\b.*$/i, '').replace(/\s+\d{1,2}\s*(er|eme|ème|e)?\b.*$/i, '').trim() || null;
}

/**
 * Pure : l'arrondissement de Paris, Lyon ou Marseille, par le code postal
 * (69005 → « Lyon 5e », 75116 → « Paris 16e », 13001 → « Marseille 1er »).
 * Ailleurs, rien.
 */
export function arrondissementDe(cp) {
  const c = String(cp || '').trim();
  let m;
  const rang = (ville, n) => `${ville} ${n === 1 ? '1er' : `${n}e`}`;
  if (c === '75116') return rang('Paris', 16);
  if ((m = c.match(/^750(\d{2})$/)) && +m[1] >= 1 && +m[1] <= 20) return rang('Paris', +m[1]);
  if ((m = c.match(/^6900(\d)$/)) && +m[1] >= 1) return rang('Lyon', +m[1]);
  if ((m = c.match(/^130(\d{2})$/)) && +m[1] >= 1 && +m[1] <= 16) return rang('Marseille', +m[1]);
  return null;
}

export async function cibleDepuisDataB(l, { villeNom = null, centre = null, user = null, horsCommune = 'garder' } = {}) {
  const { creerVille, creerCible } = await import('./alx/index.js');
  // Data-B écrit les villes en capitales sans accent (« MACON »), et Paris,
  // Lyon, Marseille avec leur arrondissement (« LYON 5EME ») : la commune de
  // la prospective (« Mâcon », « Lyon ») fait foi quand c'est la même, sinon
  // le nom est remis en casse ordinaire. L'arrondissement se garde à part,
  // lu au code postal : la commune reste Lyon, pour ses listes et les villes Klocka.
  const cle = (t) => normMetier(t).replace(/[^a-z]/g, '');
  const base = baseCommune(l.ville);
  const memeVille = base && villeNom && cle(base) === cle(villeNom);
  // L'agent ne garde que la commune qu'il lit : Data-B place parfois sur la
  // carte de Lyon un commerce de Marseille (« 39 rue de Lyon, 13015 »).
  if (horsCommune === 'ignorer' && base && villeNom && !memeVille) return { ok: false, hors: true, error: `${l.adresse || l.nom} est à ${l.ville}, pas à ${villeNom}.` };
  const casse = (t) => String(t).toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  const nomVille = memeVille || !base ? villeNom : casse(base);
  if (!nomVille) return { ok: false, error: 'Ville inconnue.' };
  const existante = Records.list('Ville').find((v) => cle(v.nom) === cle(nomVille));
  const cv = existante ? { ok: true, ville: existante } : creerVille({ nom: nomVille, code_postal: l.code_postal || null, user });
  if (!cv.ok) return cv;
  const v = Records.get('Ville', cv.ville.id);
  if (!v.centre && (centre || (l.lat != null && l.lon != null))) Records.update('Ville', v.id, { centre: centre || { lat: Number(l.lat), lon: Number(l.lon) } });
  const r = creerCible({
    ville_id: v.id,
    adresse: l.adresse || l.nom,
    enseigne: l.enseigne || l.nom || null,
    activite: libelleMetier(l.metier_id) || null,
    siret: l.siret || null,
    lat: l.lat != null ? Number(l.lat) : null,
    lon: l.lon != null ? Number(l.lon) : null,
    telephone: l.telephone || null,
    source: 'Data-B',
    user,
  });
  if (!r.ok) return r;
  const arrondissement = arrondissementDe(l.code_postal);
  if (l.code_postal && (r.cible.code_postal !== l.code_postal || (arrondissement && r.cible.arrondissement !== arrondissement))) {
    Records.update('Cible', r.cible.id, { code_postal: l.code_postal, ...(arrondissement ? { arrondissement } : {}) });
  }
  if (!r.deja || r.cible.emplacement == null) {
    Records.update('Cible', r.cible.id, {
      emplacement: r.cible.emplacement ?? EMPLACEMENT_DE_RUE[l.type_rue] ?? null,
      datab: { type_rue: l.type_rue_mot || null, solvabilite: l.solvabilite || null, effectif: l.effectif || null, independant: !!l.independant, creation: l.creation || null, site: l.site || null, emails: l.emails || [] },
      ...(r.cible.telephone ? {} : { telephone: l.telephone || null }),
    });
  }
  return { ok: true, cible: Records.get('Cible', r.cible.id), deja: !!r.deja };
}
