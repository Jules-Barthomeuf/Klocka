// Le Figaro Immobilier : les prix et loyers du résidentiel, commune par commune
// et quartier par quartier.
//
// À quoi ça sert ici : donner un point de comparaison au commerce. Un
// investisseur qui hésite entre des murs commerciaux et un appartement doit
// pouvoir mettre les deux côte à côte — prix au m², loyer au m², et donc
// rendement. Le Figaro publie ces chiffres pour toute la France, page par page.
//
// Pas de compte, pas de clé : ce sont des pages publiques. Les chiffres sont
// dans le HTML rendu par leur serveur, et la carte des prix par quartier est
// servie par un point d'entrée à part, en GeoJSON.
//
// Les valeurs bougent une fois par mois : on garde chaque lecture trente jours.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
const BASE = 'https://immobilier.lefigaro.fr';
const DELAI_MS = 30000;
const CACHE_JOURS = 30;

async function page(url, referer = BASE) {
  let derniere;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'text/html,application/json,*/*', referer },
        redirect: 'follow',
        signal: AbortSignal.timeout(DELAI_MS),
      });
      if (!r.ok) throw new Error(`Le Figaro a répondu ${r.status}.`);
      return r;
    } catch (e) {
      derniere = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw derniere;
}

// « 10 726 €/m2 » → 10726, « +6 % » → 6, « -1 % » → -1.
//
// On ne lit que le nombre de tête. Tout retirer d'un coup collerait le « 2 »
// de « €/m2 » aux milliers, et Lyon se retrouvait à cinquante mille euros le
// mètre carré. L'espace des milliers est insécable dans leur HTML.
const nombre = (s) => {
  const t = String(s || '').replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').trim();
  const m = t.match(/^[+-]?\d[\d\s]*(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Le HTML ramené à ses lignes de texte, entités décodées. */
export function lignesDe(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&eacute;/g, 'é')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Les blocs du Figaro suivent tous le même ordre : une valeur, sa légende entre
// parenthèses, puis deux évolutions annoncées « sur 1 an » et « sur 5 ans ».
function blocEvolutions(lignes, iValeur) {
  const zone = lignes.slice(iValeur, iValeur + 8);
  const evo = (mot) => {
    const k = zone.findIndex((l) => l === mot);
    return k > 0 ? nombre(zone[k - 1]) : null;
  };
  return { sur_1_an: evo('sur 1 an'), sur_5_ans: evo('sur 5 ans') };
}

/**
 * Lit les chiffres d'une page « prix immobilier » du Figaro.
 * @returns {{prix, loyer}|null}
 */
export function lireChiffres(html) {
  const l = lignesDe(html);

  // Le prix médian : la première valeur suivie de « (prix médian) ».
  const iPrix = l.findIndex((x, k) => /^\(prix médian\)$/i.test(x) && k > 0);
  const prixMedian = iPrix > 0 ? nombre(l[iPrix - 1]) : null;

  // La fourchette, plus bas : « Prix bas », sa valeur, « Prix médian »…
  const valeurApres = (mot) => {
    const k = l.findIndex((x) => x.toLowerCase() === mot);
    return k >= 0 ? nombre(l[k + 1]) : null;
  };

  // Le loyer : « Loyer au m2 à <ville> », puis la valeur.
  const iLoyer = l.findIndex((x) => /^loyer au m2 /i.test(x));
  const loyerMedian = iLoyer >= 0 ? nombre(l[iLoyer + 1]) : null;

  const prix = prixMedian
    ? {
        median: prixMedian,
        bas: valeurApres('prix bas'),
        haut: valeurApres('prix haut'),
        ...blocEvolutions(l, iPrix),
      }
    : null;
  const loyer = loyerMedian
    ? {
        median: loyerMedian,
        // La fourchette existe aussi pour le loyer, plus bas dans la page.
        bas: valeurApres('loyer bas'),
        haut: valeurApres('loyer haut'),
        ...blocEvolutions(l, iLoyer + 1),
      }
    : null;

  if (!prix && !loyer) return null;
  return { prix, loyer };
}

/**
 * La carte des prix : un polygone par quartier, avec son prix médian au m².
 * L'adresse de ce service est inscrite dans la page, en attribut `data-leaflet`.
 */
export async function lireCarte(html, referer) {
  const m = html.match(/data-leaflet="([^"]+)"/);
  if (!m) return null;
  const chemin = m[1].replace(/&amp;/g, '&');
  const r = await page(BASE + chemin, referer);
  const d = await r.json().catch(() => null);
  const traits = d?.features?.features;
  if (!Array.isArray(traits) || !traits.length) return null;
  return {
    unite: d?.scale?.unit || '€/m²',
    quartiers: traits
      .map((t) => ({
        nom: t.properties?.name || null,
        prix: Number(t.properties?.value) || null,
        lien: t.properties?.link || null,
        contour: t.geometry || null,
      }))
      .filter((q) => q.nom),
  };
}

// Le point est-il dans le polygone ? Algorithme du rayon : on compte les
// croisements d'une demi-droite partant du point. Impair, on est dedans.
function dansPolygone(lon, lat, anneaux) {
  let dedans = false;
  for (const anneau of anneaux) {
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
      const [xi, yi] = anneau[i];
      const [xj, yj] = anneau[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
  }
  return dedans;
}

/** Le quartier qui contient ce point, parmi ceux de la carte. */
export function quartierDuPoint(quartiers, lat, lon) {
  for (const q of quartiers || []) {
    const g = q.contour;
    if (!g) continue;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
    for (const p of polys) if (dansPolygone(lon, lat, p)) return q;
  }
  return null;
}

// Paris, Lyon et Marseille ont un code INSEE par arrondissement, et Le Figaro
// n'y publie qu'à l'échelle de la commune. On remonte à la commune ; le
// quartier, lui, reste exact puisqu'il vient du point de l'adresse.
function communeDe(insee) {
  const n = Number(insee);
  if (n >= 75101 && n <= 75120) return '75056'; // Paris
  if (n >= 69381 && n <= 69389) return '69123'; // Lyon
  if (n >= 13201 && n <= 13216) return '13055'; // Marseille
  return String(insee);
}

// L'adresse d'une page commune : un intitulé lisible, puis le code INSEE qui
// fait foi. Le premier peut être approximatif, leur serveur redirige.
const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'ville';

/** Les contours des quartiers d'une commune, tels qu'ils ont été lus. */
export function contoursCommune(codeInsee) {
  const cle = communeDe(codeInsee);
  const x = Records.filter('FigaroPrix', { cle })
    .filter((r) => r.contours?.length)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
  return x ? { unite: x.resultat?.carte?.unite || '€/m²', quartiers: x.contours } : null;
}

/**
 * Les prix et loyers du résidentiel autour d'une adresse, d'après Le Figaro.
 * @param {string} texteAdresse
 * @param {{forcer?: boolean, user?: object}} opts
 * @returns {Promise<{ok: true, resultat: object} | {ok: false, error: string}>}
 */
export async function prixResidentiel(texteAdresse, { forcer = false, user = null } = {}) {
  const adresse = await resoudreAdresse(texteAdresse);
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texteAdresse || '').slice(0, 80)} ».` };
  if (!adresse.code_insee) return { ok: false, error: 'Commune non identifiée : le code INSEE manque.' };

  const cle = communeDe(adresse.code_insee);
  if (!forcer) {
    const recent = Records.filter('FigaroPrix', { cle })
      .filter((x) => Date.now() - Date.parse(x.le) < CACHE_JOURS * 86400000)
      .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, resultat: { ...recent.resultat, du_cache: true } };
  }

  const url = `${BASE}/prix-immobilier/${slug(adresse.ville)}/ville-${cle}`;
  let html;
  try {
    html = await (await page(url)).text();
  } catch (e) {
    return { ok: false, error: `Le Figaro n'a pas répondu pour ${adresse.ville} (${e.message}).` };
  }

  const chiffres = lireChiffres(html);
  if (!chiffres) return { ok: false, error: `Le Figaro ne publie pas de prix pour ${adresse.ville}.` };

  let carteDesPrix = null;
  try {
    carteDesPrix = await lireCarte(html, url);
  } catch { /* la commune n'a pas de découpage par quartier */ }
  const trouve = carteDesPrix ? quartierDuPoint(carteDesPrix.quartiers, adresse.lat, adresse.lon) : null;

  // La moyenne d'une commune ne dit rien d'une rue : Paris entier est à
  // 10 726 €/m², Clignancourt-Jules Joffrin à 9 383. On va donc lire la page du
  // quartier, qui porte les mêmes chiffres à la bonne échelle.
  let quartier = null;
  if (trouve?.lien) {
    try {
      const pageQuartier = await (await page(trouve.lien, url)).text();
      const c = lireChiffres(pageQuartier);
      if (c) quartier = { nom: trouve.nom, ...c, lien: trouve.lien };
    } catch { /* le quartier n'a pas de page : on garde son prix de la carte */ }
  }
  if (!quartier && trouve) {
    quartier = { nom: trouve.nom, prix: { median: trouve.prix }, loyer: null, lien: trouve.lien || null };
  }

  const resultat = {
    source: 'Le Figaro Immobilier',
    ville: adresse.ville,
    code_insee: cle,
    adresse: adresse.label,
    lat: adresse.lat,
    lon: adresse.lon,
    // Les deux échelles. Le quartier est celui qu'on compare au commerce ; la
    // commune sert de repère plus large.
    commune: { nom: adresse.ville, ...chiffres, lien: url },
    quartier,
    // La carte, sans ses contours : cent trente-deux polygones pèsent cent
    // vingt-six kilo-octets, qu'on ne recopie pas sur chaque dossier parisien.
    // Ils restent dans l'enregistrement de cache, servis par commune.
    carte: carteDesPrix
      ? { unite: carteDesPrix.unite, quartiers: carteDesPrix.quartiers.map(({ contour, ...q }) => q) }
      : null,
    lien: url,
    le: new Date().toISOString(),
    par: user?.email || null,
  };
  Records.create('FigaroPrix', {
    cle,
    ville: adresse.ville,
    resultat,
    // Les contours vivent ici, une fois par commune, pour tracer la carte.
    contours: carteDesPrix ? carteDesPrix.quartiers.filter((q) => q.contour) : null,
    le: resultat.le,
    par: resultat.par,
  });
  console.log(`[figaro] ${adresse.ville} ${chiffres.prix?.median ?? '—'} €/m²${quartier ? ` · ${quartier.nom} ${quartier.prix?.median ?? '—'} €/m², loyer ${quartier.loyer?.median ?? '—'} €/m²` : ' · sans quartier'}`);
  return { ok: true, resultat };
}
