// Monday → Twenty : la forme des données, sans réseau (27 oct. 2026).
// Un tableau Monday devient un objet Twenty, une colonne un champ, un élément un enregistrement. Fonctions pures,
// partagées par scripts/crm/schema-twenty.mjs (créer les objets) et scripts/crm/import-twenty.mjs (les remplir).
//
// Choix du premier jour :
// - les liens entre tableaux (board_relation) et les personnes Monday deviennent du texte (les noms) ; les ids liés
//   restent dans l'export, les vraies relations Twenty viendront ensuite ;
// - les colonnes calculées (formules, miroirs, boutons…) ne sont pas recopiées : Twenty les recalculera ou non ;
// - chaque enregistrement garde `mondayId` (clé d'import sans doublon) et `mondayGroupe` (le groupe Monday).
//
// Les formes composites (EMAILS, PHONES, LINKS, ADDRESS) sont celles de Twenty v2 ; à relire sur l'instance
// (/rest/open-api/core) avant le premier import.

/** Ce que devient chaque type de colonne Monday. null : la colonne n'est pas recopiée. */
export const TYPE_TWENTY = {
  text: 'TEXT',
  long_text: 'TEXT',
  numbers: 'NUMBER',
  rating: 'NUMBER',
  date: 'DATE',
  status: 'SELECT',
  color: 'SELECT',
  dropdown: 'MULTI_SELECT',
  email: 'EMAILS',
  phone: 'PHONES',
  link: 'LINKS',
  location: 'ADDRESS',
  checkbox: 'BOOLEAN',
  people: 'TEXT',
  multiple_person: 'TEXT',
  board_relation: 'TEXT',
  connect_boards: 'TEXT',
  timeline: 'TEXT',
  week: 'TEXT',
  hour: 'TEXT',
  country: 'TEXT',
  world_clock: 'TEXT',
  tags: 'TEXT',
  file: 'TEXT',
  dependency: 'TEXT',
  // Calculées ou propres à Monday : rien à recopier.
  name: null,
  formula: null,
  mirror: null,
  lookup: null,
  auto_number: null,
  creation_log: null,
  last_updated: null,
  button: null,
  subtasks: null,
  subitems: null,
  item_id: null,
  progress: null,
  time_tracking: null,
  doc: null,
  direct_doc: null,
  integration: null,
  vote: null,
  color_picker: null,
};

// Noms réservés par Twenty sur tout objet : un champ Monday qui y tomberait prend un suffixe.
const RESERVES = new Set(['id', 'name', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', 'position', 'searchVector', 'timelineActivities', 'favorites', 'attachments', 'noteTargets', 'taskTargets', 'mondayId', 'mondayGroupe', 'mondayCreeLe']);

const ascii = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** « Prochaine relance » → « prochaineRelance ». Toujours une lettre en tête, rien que des lettres et chiffres. */
export function camel(s) {
  const mots = ascii(s).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return 'champ';
  const c = mots.map((m, i) => (i === 0 ? m.toLowerCase() : m[0].toUpperCase() + m.slice(1).toLowerCase())).join('');
  return /^[a-z]/.test(c) ? c : `c${c}`;
}

/** La valeur d'une option de liste (SELECT) : « Sous offre » → « SOUS_OFFRE ». */
export function valeurOption(label) {
  const v = ascii(label).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return v ? (/^[A-Z]/.test(v) ? v : `V_${v}`) : 'VIDE';
}

export const OPTIONS_MAX = 50;

const COULEURS = ['green', 'turquoise', 'sky', 'blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'gray'];

const lireReglages = (col) => {
  try {
    return JSON.parse(col.settings_str || '{}') || {};
  } catch {
    return {};
  }
};

/** Les libellés possibles d'une colonne statut ou liste, dans l'ordre de Monday, sans doublon ni vide. */
export function libellesDe(col) {
  const r = lireReglages(col);
  let brut = [];
  if (Array.isArray(r.labels)) brut = r.labels.map((x) => x?.name ?? x?.label ?? x);
  else if (r.labels && typeof r.labels === 'object') brut = Object.entries(r.labels).sort(([a], [b]) => Number(a) - Number(b)).map(([, v]) => v);
  const vus = new Set();
  return brut.map((x) => String(x ?? '').trim()).filter((x) => x && !vus.has(valeurOption(x)) && vus.add(valeurOption(x)));
}

/** Les options d'un champ SELECT / MULTI_SELECT : celles de Monday, plus celles qu'on rencontre dans les données. */
export function optionsDe(libelles) {
  return libelles.map((label, position) => ({ value: valeurOption(label), label, color: COULEURS[position % COULEURS.length], position }));
}

/**
 * Le nom de l'objet Twenty d'un tableau : « Agent immobilier » → agentImmobilier / agentImmobilierListe.
 * Un préfixe pour l'espace KPARTNERS (« KP · ») ; un suffixe quand deux tableaux portent le même nom.
 */
export function objetDe(tableau, dejaPris = new Set()) {
  const espace = tableau.workspace?.name || tableau.espace?.name || '';
  const kp = /kpartners/i.test(espace);
  const label = `${kp ? 'KP · ' : ''}${String(tableau.name || tableau.nom || 'Tableau').trim()}`;
  let base = camel(`${kp ? 'kp ' : ''}${tableau.name || tableau.nom || 'tableau'}`);
  if (dejaPris.has(base)) base = `${base}${String(tableau.id).slice(-4)}`;
  dejaPris.add(base);
  return { nameSingular: base, namePlural: `${base}Liste`, labelSingular: label, labelPlural: label };
}

/**
 * Les champs Twenty d'un tableau, à partir de ses colonnes. Chaque champ garde la colonne Monday d'où il vient
 * (`mondayColonne`), pour l'import.
 */
export function champsDe(colonnes = []) {
  const pris = new Set(RESERVES);
  const champs = [];
  for (const col of colonnes) {
    let type = TYPE_TWENTY[col.type];
    if (!type) continue;
    // Une liste de plus de 50 choix (les 367 agences d'« Entreprise ») est un nom saisi, pas une liste fermée.
    if (type === 'MULTI_SELECT' && libellesDe(col).length > OPTIONS_MAX) type = 'TEXT';
    let nom = camel(col.title);
    while (pris.has(nom)) nom = `${nom}${champs.length + 2}`;
    pris.add(nom);
    const champ = { name: nom, label: String(col.title || nom).trim().slice(0, 60), type, mondayColonne: col.id, mondayType: col.type };
    if (type === 'SELECT' || type === 'MULTI_SELECT') champ.options = optionsDe(libellesDe(col));
    if (col.type === 'long_text') champ.description = 'Texte long (Monday)';
    champs.push(champ);
  }
  champs.push({ name: 'mondayId', label: 'Id Monday', type: 'TEXT', systeme: true });
  champs.push({ name: 'mondayGroupe', label: 'Groupe Monday', type: 'TEXT', systeme: true });
  champs.push({ name: 'mondayCreeLe', label: 'Créé dans Monday le', type: 'DATE_TIME', systeme: true });
  return champs;
}

const json = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const nombre = (t) => {
  const n = Number(String(t ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && String(t ?? '').trim() !== '' ? n : null;
};

/** Le téléphone Monday (« +33612345678 », pays « FR ») au format PHONES de Twenty. */
export function telephone(texte, brut) {
  const v = json(brut) || {};
  const numero = String(v.phone || texte || '').replace(/[^\d+]/g, '');
  if (!numero) return null;
  const pays = String(v.countryShortName || '').toUpperCase() || (numero.startsWith('+33') || /^0\d{9}$/.test(numero) ? 'FR' : '');
  if (numero.startsWith('+33')) return { primaryPhoneNumber: numero.slice(3), primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33' };
  if (/^0\d{9}$/.test(numero)) return { primaryPhoneNumber: numero.slice(1), primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33' };
  return { primaryPhoneNumber: numero, primaryPhoneCountryCode: pays, primaryPhoneCallingCode: '' };
}

/** Une valeur de colonne Monday (texte lisible et valeur brute) dans la forme du champ Twenty. null : rien à écrire. */
export function valeurTwenty(champ, { text, value } = {}) {
  const t = String(text ?? '').trim();
  switch (champ.type) {
    case 'TEXT':
      return t || null;
    case 'NUMBER':
      return nombre(t);
    case 'BOOLEAN':
      return json(value)?.checked === true || json(value)?.checked === 'true' || t === 'v';
    case 'DATE': {
      const d = json(value)?.date || (t.match(/^\d{4}-\d{2}-\d{2}/) || [])[0];
      return d || null;
    }
    case 'SELECT':
      return t ? valeurOption(t) : null;
    case 'MULTI_SELECT':
      return t ? [...new Set(t.split(/\s*,\s*/).filter(Boolean).map(valeurOption))] : null;
    case 'EMAILS': {
      const e = json(value)?.email || t;
      return e ? { primaryEmail: String(e).trim().toLowerCase(), additionalEmails: null } : null;
    }
    case 'PHONES':
      return telephone(t, value);
    case 'LINKS': {
      const v = json(value) || {};
      const url = v.url || (t.match(/https?:\/\/\S+/) || [])[0];
      return url ? { primaryLinkUrl: url, primaryLinkLabel: v.text || '', secondaryLinks: null } : null;
    }
    case 'ADDRESS': {
      const v = json(value) || {};
      const adresse = v.address || t;
      if (!adresse) return null;
      const lat = nombre(v.lat);
      const lng = nombre(v.lng);
      return { addressStreet1: adresse, addressCity: v.city?.long_name || '', addressCountry: v.country?.long_name || '', ...(lat != null && lng != null ? { addressLat: lat, addressLng: lng } : {}) };
    }
    default:
      return t || null;
  }
}

/** Un élément Monday (tel que l'exporte scripts/crm/export-monday.mjs) en enregistrement Twenty. */
export function enregistrementDe(element, champs) {
  const parColonne = new Map((element.column_values || []).map((c) => [c.id, c]));
  const r = { name: String(element.name || '').trim() || '(sans nom)', mondayId: String(element.id), mondayGroupe: element.group?.title || null, mondayCreeLe: element.created_at || null };
  for (const champ of champs) {
    if (champ.systeme || !champ.mondayColonne) continue;
    const v = valeurTwenty(champ, parColonne.get(champ.mondayColonne) || {});
    if (v !== null && v !== undefined && v !== '') r[champ.name] = v;
  }
  return r;
}

/** Les libellés rencontrés dans les données mais absents des réglages de la colonne (anciens statuts supprimés). */
export function libellesManquants(elements, champ) {
  if (champ.type !== 'SELECT' && champ.type !== 'MULTI_SELECT') return [];
  const connus = new Set((champ.options || []).map((o) => o.value));
  const manquants = new Map();
  for (const el of elements) {
    const c = (el.column_values || []).find((x) => x.id === champ.mondayColonne);
    const t = String(c?.text ?? '').trim();
    if (!t) continue;
    for (const l of champ.type === 'SELECT' ? [t] : t.split(/\s*,\s*/)) if (l && !connus.has(valeurOption(l))) manquants.set(valeurOption(l), l);
  }
  return [...manquants.values()];
}
