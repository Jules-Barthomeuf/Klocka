// Passerelle vers Twenty, le CRM de Klocka depuis le 27 oct. 2026 (il remplace Monday).
//
// API REST de l'instance (relue sur /rest/open-api/core et /rest/open-api/metadata, v2.51) :
//   GET    /rest/{pluriel}?filter=champ[eq]:"v"&limit=200&starting_after=…  → { data: { pluriel: [...] }, pageInfo }
//   POST   /rest/{pluriel}                                                 → { data: { createSingulier } }
//   POST   /rest/batch/{pluriel}   (60 au plus)                            → { data: { createPluriel: [...] } }
//   PATCH  /rest/{pluriel}/{id}                                            → { data: { updateSingulier } }
//   DELETE /rest/{pluriel}/{id}?soft_delete=true
//   POST   /rest/metadata/objects, /rest/metadata/fields                    (le schéma)
// Jeton en en-tête Bearer, jamais dans l'adresse. Plafond : 100 requêtes par minute ; on en garde une marge.
// Une intégration absente n'est jamais bloquante : sans jeton, chaque fonction le dit et rend la main.

const URL_ = () => String(process.env.TWENTY_URL || '').trim().replace(/\/+$/, '');
const CLE = () => String(process.env.TWENTY_API_KEY || '').trim();
export const twentyConfigure = () => !!(URL_() && CLE());

export const LOT_MAX = 60;
const ESPACEMENT_MS = 700;
let dernier = 0;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function cadence() {
  const ecart = dernier + ESPACEMENT_MS - Date.now();
  dernier = Math.max(Date.now(), dernier + ESPACEMENT_MS);
  if (ecart > 0) await attendre(ecart);
}

/** Une requête à l'API de Twenty. Reprend seule sur un 429 ou une coupure ; lève l'erreur de Twenty sinon. */
export async function requeteTwenty(methode, chemin, corps = null, { essai = 0 } = {}) {
  if (!twentyConfigure()) throw new Error('Twenty non configuré : renseignez TWENTY_URL et TWENTY_API_KEY.');
  await cadence();
  let resp;
  try {
    resp = await fetch(`${URL_()}/rest${chemin}`, {
      method: methode,
      headers: { Authorization: `Bearer ${CLE()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: corps == null ? undefined : JSON.stringify(corps),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    if (essai < 4) {
      await attendre(5_000 * (essai + 1));
      return requeteTwenty(methode, chemin, corps, { essai: essai + 1 });
    }
    throw e;
  }
  if ((resp.status === 429 || resp.status >= 502) && essai < 6) {
    await attendre(resp.status === 429 ? 20_000 : 5_000 * (essai + 1));
    return requeteTwenty(methode, chemin, corps, { essai: essai + 1 });
  }
  const texte = await resp.text();
  let data = {};
  try {
    data = texte ? JSON.parse(texte) : {};
  } catch {
    data = { brut: texte.slice(0, 300) };
  }
  if (!resp.ok) {
    const msg = data.messages?.join(' ; ') || data.message || data.error || data.brut || `Twenty a répondu ${resp.status}`;
    const err = new Error(`Twenty ${resp.status} ${methode} ${chemin.split('?')[0]} : ${Array.isArray(msg) ? msg.join(' ; ') : msg}`);
    err.status = resp.status;
    err.details = data;
    throw err;
  }
  return data;
}

/** La seule valeur de `data` (Twenty l'emballe sous un nom qui dépend de l'opération). */
const charge = (r) => {
  const v = Object.values(r?.data || {});
  return v.length === 1 ? v[0] : r?.data;
};

/** Une valeur de filtre : les textes entre guillemets, les nombres tels quels. */
const filtreValeur = (v) => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(String(v)));

/** filtre({ mondayId: '42', ville: 'Nice' }) → mondayId[eq]:"42",ville[eq]:"Nice" */
export const filtre = (egalites = {}) => Object.entries(egalites).map(([k, v]) => `${k}[eq]:${filtreValeur(v)}`).join(',');

/** Les enregistrements d'un objet, toutes pages, avec un filtre facultatif. */
export async function lister(pluriel, { filtre: f = '', champs = '', limite = Infinity } = {}) {
  const lignes = [];
  let apres = null;
  while (lignes.length < limite) {
    const q = new URLSearchParams({ limit: '200', depth: '0' });
    if (f) q.set('filter', f);
    if (champs) q.set('fields', champs);
    if (apres) q.set('starting_after', apres);
    const r = await requeteTwenty('GET', `/${pluriel}?${q}`);
    const lot = r?.data?.[pluriel] || charge(r) || [];
    lignes.push(...lot);
    if (!r?.pageInfo?.hasNextPage || !lot.length) break;
    apres = r.pageInfo.endCursor;
  }
  return lignes.slice(0, limite);
}

/** Le premier enregistrement qui répond au filtre, ou null. */
export async function trouver(pluriel, egalites) {
  const [x] = await lister(pluriel, { filtre: filtre(egalites), limite: 1 });
  return x || null;
}

export const lire = async (pluriel, id) => charge(await requeteTwenty('GET', `/${pluriel}/${id}?depth=0`));
export const creer = async (pluriel, valeurs) => charge(await requeteTwenty('POST', `/${pluriel}`, valeurs));
export const modifier = async (pluriel, id, valeurs) => charge(await requeteTwenty('PATCH', `/${pluriel}/${id}`, valeurs));
/** Mise à la corbeille (récupérable dans Twenty), jamais une suppression définitive. */
export const supprimer = async (pluriel, id) => charge(await requeteTwenty('DELETE', `/${pluriel}/${id}?soft_delete=true`));

/** Crée par lots de 60. Rend les enregistrements créés, dans l'ordre. */
export async function creerEnLot(pluriel, liste) {
  const crees = [];
  for (let i = 0; i < liste.length; i += LOT_MAX) {
    const r = await requeteTwenty('POST', `/batch/${pluriel}`, liste.slice(i, i + LOT_MAX));
    crees.push(...(charge(r) || []));
  }
  return crees;
}

/**
 * Écrit ou met à jour un enregistrement retrouvé par une clé (mondayId, e-mail…) ou par son id. Rejouer ne crée pas
 * de doublon : même contrat que poserElement de server/monday.js.
 */
export async function poser(pluriel, { id = null, cle = null, valeurs = {} }) {
  const existant = id ? { id } : cle ? await trouver(pluriel, cle) : null;
  if (existant?.id) {
    try {
      return { id: existant.id, cree: false, ...(await modifier(pluriel, existant.id, valeurs)) };
    } catch (e) {
      if (e.status !== 404 || !cle) throw e;
    }
  }
  return { ...(await creer(pluriel, { ...(cle || {}), ...valeurs })), cree: true };
}

/** Ajoute une note rattachée à un enregistrement (le fil d'une fiche, comme les mises à jour Monday). */
export async function noter(cibleChamp, cibleId, titre, texte) {
  const note = await creer('notes', { title: String(titre || 'Note').slice(0, 200), bodyV2: { markdown: String(texte || '') } });
  await creer('noteTargets', { noteId: note.id, [cibleChamp]: cibleId });
  return note;
}

/** L'adresse d'une fiche dans Twenty. */
export const lienFiche = (singulier, id) => (URL_() && id ? `${URL_()}/object/${singulier}/${id}` : null);

// --- Le schéma (API metadata) ---

export async function objetsTwenty() {
  const r = await requeteTwenty('GET', '/metadata/objects?limit=1000');
  // Un tableau direct, ou l'ancienne enveloppe { objects } selon un réglage de l'espace.
  return Array.isArray(r?.data) ? r.data : r?.data?.objects || [];
}

export const creerObjet = async (objet) => charge(await requeteTwenty('POST', '/metadata/objects', objet));
export const creerChamp = async (champ) => charge(await requeteTwenty('POST', '/metadata/fields', champ));
export const modifierChamp = async (id, champ) => charge(await requeteTwenty('PATCH', `/metadata/fields/${id}`, champ));
