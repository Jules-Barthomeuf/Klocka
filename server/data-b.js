// Data-B, module « Valeurs locatives » : la fourchette de loyer au m² d'une
// rue, de son quartier et de sa ville.
//
// Klocka s'y connecte avec le compte de service de l'équipe (DATAB_EMAIL,
// DATAB_MOT_DE_PASSE dans .env) — avec l'accord de Data-B, obtenu par Jules.
// Pas de navigateur : la connexion est un formulaire, la session tient dans un
// cookie partagé par les sous-domaines, et la recherche est une simple URL
// dont les composantes d'adresse (rue, ville, code postal, coordonnées)
// viennent chez nous de la Base Adresse Nationale, gratuite.
//
// Une recherche Data-B consomme probablement un crédit : on garde chaque
// résultat trente jours, par adresse, et on ne redemande que sur ordre.

import { Records } from './db.js';

const EMAIL = (process.env.DATAB_EMAIL || '').trim();
const MDP = (process.env.DATAB_MOT_DE_PASSE || '').trim();
export const dataBConfigure = () => !!(EMAIL && MDP);

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
const DELAI_MS = 40000;
const SESSION_MAX_MS = 20 * 60 * 1000;
const CACHE_JOURS = 30;

// --- La session ---------------------------------------------------------------------------
let session = { cookie: null, depuis: 0 };

async function appel(url, { method = 'GET', form = null, cookie = null, referer = null } = {}) {
  const headers = { 'user-agent': UA, accept: 'text/html,*/*' };
  if (cookie) headers.cookie = cookie;
  let body;
  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    // Data-B vérifie d'où vient l'appel : la connexion vient de sa page, le
    // chargement des résultats vient du module qui les demande.
    const base = referer ? new URL(referer).origin : 'https://data-b.com';
    headers.origin = base;
    headers.referer = referer || 'https://data-b.com/login';
    body = new URLSearchParams(form).toString();
  }
  // Le réseau hoquette parfois : trois essais espacés avant de renoncer.
  let derniere;
  for (let i = 0; i < 3; i++) {
    try {
      return await fetch(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(DELAI_MS) });
    } catch (e) {
      derniere = e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw derniere;
}

const cookieDe = (resp) => {
  for (const c of resp.headers.getSetCookie?.() || []) {
    const [kv] = c.split(';');
    if (kv.trim().startsWith('PHPSESSID=')) return kv.trim();
  }
  return null;
};

async function connecter() {
  if (!dataBConfigure()) throw new Error('Data-B n\'est pas configuré : DATAB_EMAIL et DATAB_MOT_DE_PASSE manquent dans .env.');
  const page = await appel('https://data-b.com/login');
  const cookie = cookieDe(page);
  if (!cookie) throw new Error('Data-B ne répond pas comme attendu (pas de session).');
  const r = await appel('https://data-b.com/user/register/inc/req/login.php', { method: 'POST', cookie, form: { type: 'email_login', email: EMAIL, password: MDP } });
  const verdict = (await r.text()).split(';')[0].trim();
  if (verdict !== 'login_ok') {
    const motif = verdict === 'login_suspend' ? 'compte suspendu' : verdict === 'login_fail' || !verdict ? 'identifiants refusés' : verdict;
    throw new Error(`Connexion à Data-B refusée (${motif}).`);
  }
  session = { cookie, depuis: Date.now() };
  return cookie;
}

async function cookieValide() {
  if (session.cookie && Date.now() - session.depuis < SESSION_MAX_MS) return session.cookie;
  return connecter();
}

/**
 * Une page de Data-B, session comprise. Une session périmée renvoie vers la
 * connexion : on se reconnecte une fois et on redemande.
 * @returns {Promise<string|null>} le HTML, ou null si la session est refusée
 */
export async function pageDataB(url) {
  for (let essai = 0; essai < 2; essai++) {
    const cookie = essai === 0 ? await cookieValide() : await connecter();
    const r = await appel(url, { cookie });
    if (r.status === 302 || r.status === 301) continue;
    if (!r.ok) throw new Error(`Data-B a répondu ${r.status}.`);
    return r.text();
  }
  return null;
}

/**
 * Un appel POST à Data-B, session comprise. Les modules chargent leurs
 * résultats ainsi, une fois la page de recherche obtenue.
 */
export async function postDataB(url, form) {
  for (let essai = 0; essai < 2; essai++) {
    const cookie = essai === 0 ? await cookieValide() : await connecter();
    const r = await appel(url, { method: 'POST', cookie, form, referer: url });
    if (r.status === 302 || r.status === 301) continue;
    if (!r.ok) throw new Error(`Data-B a répondu ${r.status}.`);
    return r.text();
  }
  return null;
}

/**
 * Les composantes d'adresse que les modules de Data-B attendent dans leur URL
 * de recherche. Elles viennent de la Base Adresse Nationale, gratuite.
 */
export function parametresAdresse(adresse) {
  return {
    submit: 'true',
    magic_btn: 'acheteur_potentiel',
    autocomplete: adresse.label + ', France',
    street_number: adresse.numero,
    route: adresse.rue,
    locality: adresse.ville,
    sublocality: '',
    administrative_area_level_1: adresse.region,
    administrative_area_level_2: adresse.departement,
    postal_code: adresse.code_postal,
    country: 'France',
    geometry: `${adresse.lat},${adresse.lon}`,
  };
}

// --- L'adresse, résolue par la Base Adresse Nationale ------------------------------------
/**
 * @returns {Promise<{label, code_insee, numero, rue, ville, code_postal, departement, region, lat, lon, score}|null>}
 */
export async function resoudreAdresse(texte) {
  const q = String(texte || '').trim();
  if (q.length < 4) return null;
  const r = await fetch(`https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const f = (await r.json()).features?.[0];
  if (!f || (f.properties?.score ?? 0) < 0.4) return null;
  const p = f.properties;
  // « 06, Alpes-Maritimes, Provence-Alpes-Côte d'Azur »
  const contexte = String(p.context || '').split(',').map((x) => x.trim());
  return {
    label: p.label,
    // Le code INSEE de la commune : c'est lui qui adresse les pages du Figaro.
    code_insee: p.citycode || '',
    numero: p.housenumber || '',
    rue: p.street || p.name || '',
    ville: p.city || '',
    code_postal: p.postcode || '',
    departement: contexte[1] || '',
    region: contexte[2] || '',
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    score: p.score,
  };
}

// --- La recherche -------------------------------------------------------------------------
const nombre = (s) => {
  const n = Number(String(s || '').replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Le HTML de Data-B ramené à ses lignes de texte. */
export function lignesDe(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Lit les trois fourchettes dans la page de résultats.
 * @returns {{rue, quartier, ville}|null} chaque niveau : { nom, basse, haute }
 */
export function lireEstimations(html) {
  const lignes = lignesDe(html);
  const debut = lignes.findIndex((l) => /estimation du loyer/i.test(l));
  if (debut < 0) return null;
  const zone = lignes.slice(debut, debut + 80);
  const niveaux = {};
  for (const cle of ['rue', 'quartier', 'ville']) {
    const i = zone.findIndex((l) => l.toLowerCase() === cle);
    if (i < 0) continue;
    const nom = zone[i + 1] || '';
    const iBasse = zone.findIndex((l, k) => k > i && /estimation basse/i.test(l));
    const iHaute = zone.findIndex((l, k) => k > i && /estimation haute/i.test(l));
    const basse = iBasse > 0 ? nombre(zone[iBasse + 1]) : null;
    const haute = iHaute > 0 ? nombre(zone[iHaute + 1]) : null;
    if (basse == null && haute == null) continue;
    niveaux[cle] = { nom, basse, haute };
  }
  return Object.keys(niveaux).length ? niveaux : null;
}

const cleCache = (a) => `${a.numero} ${a.rue} ${a.code_postal} ${a.ville}`.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * La fourchette de loyer au m² d'une adresse, d'après Data-B.
 * @param {string} texteAdresse
 * @param {{forcer?: boolean, user?: object}} opts - `forcer` ignore le cache
 * @returns {Promise<{ok: true, resultat: object} | {ok: false, error: string}>}
 */
export async function valeurLocative(texteAdresse, { forcer = false, user = null } = {}) {
  const adresse = await resoudreAdresse(texteAdresse);
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texteAdresse || '').slice(0, 80)} ».` };

  const cle = cleCache(adresse);
  if (!forcer) {
    const recent = Records.filter('DataBRecherche', { cle })
      .filter((r) => Date.now() - Date.parse(r.le) < CACHE_JOURS * 86400000)
      .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, resultat: { ...recent.resultat, du_cache: true } };
  }

  const url = `https://valeurlocative.data-b.com/search?${new URLSearchParams(parametresAdresse(adresse))}`;
  let html;
  try {
    html = await pageDataB(url);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (!html) return { ok: false, error: 'Data-B refuse la session : vérifiez le compte dans .env.' };

  const niveaux = lireEstimations(html);
  if (!niveaux) return { ok: false, error: 'Data-B n\'a pas rendu d\'estimation pour cette adresse.' };

  const resultat = {
    source: 'Data-B · Valeurs locatives',
    unite: '€ HT HC / m² / an',
    adresse: adresse.label,
    ...niveaux,
    lien: url,
    le: new Date().toISOString(),
    par: user?.email || null,
  };
  Records.create('DataBRecherche', { cle, adresse: adresse.label, resultat, le: resultat.le, par: resultat.par });
  console.log(`[data-b] valeur locative lue pour « ${adresse.label} »${user?.email ? ` (${user.email})` : ''}`);
  return { ok: true, resultat };
}
