// Lecteur d'articles : récupère une page publique et n'en renvoie que le
// contenu rédactionnel, nettoyé.
//
// Pourquoi côté serveur : les sites visés (service-public, Légifrance, INSEE…)
// interdisent l'affichage en iframe via X-Frame-Options / CSP. Passer par le
// serveur permet d'afficher l'article dans la fiche, à côté du commentaire.
//
// Deux garde-fous : une liste blanche de domaines (pas de SSRF vers une adresse
// interne) et un cache mémoire pour ne pas marteler les sources.

const DOMAINES_AUTORISES = [
  'insee.fr',
  'legifrance.gouv.fr',
  'service-public.fr',
  'service-public.gouv.fr',
  'entreprendre.service-public.fr',
  'entreprendre.service-public.gouv.fr',
  'ecologie.gouv.fr',
  'georisques.gouv.fr',
  'geoportail-urbanisme.gouv.fr',
  'cadastre.data.gouv.fr',
  'app.dvf.etalab.gouv.fr',
  'annuaire-entreprises.data.gouv.fr',
  'infogreffe.fr',
  'bodacc.fr',
  'ademe.fr',
  'observatoire-dpe-audit.ademe.fr',
  'anil.org',
  'economie.gouv.fr',
  'bpifrance-creation.fr',
];

const BALISES_GARDEES = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i',
  'a', 'br', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'dl', 'dt', 'dd',
]);

// Blocs de gabarit récurrents sur les sites publics : partage social, bandeaux
// cookies, encarts d'abonnement. Ils polluent la lecture sans rien apporter.
const BOILERPLATE = [
  /partager la page/i,
  /ce sujet vous int[ée]resse/i,
  /ajoutez cette page [àa] vos favoris/i,
  /param[èe]tres d'affichage/i,
  /version facile [àa] lire/i,
  /cookies?/i,
  /newsletter/i,
  /lettre d'information/i,
  /accessibilit[ée] : (non|partiellement)/i,
  /^(accueil|menu|recherche|connexion|s'abonner|imprimer|partager)$/i,
  /votre abonnement a bien [ée]t[ée]/i,
  /vous devez activer le javascript/i,
  /facebook\s+x\s+linkedin/i,
  /lien copi[ée]/i,
  /ce sujet a [ée]t[ée] ajout[ée]/i,
  /vous recevrez un courriel/i,
  /^(publi[ée] le|mis [àa] jour le|temps de lecture|v[ée]rifi[ée] le)/i,
  /fortes chaleurs/i,
  /^cette page vous a-t-elle/i,
  /^(sommaire|sur le m[êe]me sujet|voir aussi|pour en savoir plus)$/i,
  /supprimer votre abonnement/i,
  /votre abonnement n['’]a pas pu/i,
  /espace personnel/i,
  /mes alertes/i,
  /s['’]abonner [àa] la mise [àa] jour/i,
  /^(oui|non)$/i,
];

const TTL_MS = 24 * 60 * 60 * 1000;
const TAILLE_MAX = 400_000; // caractères d'HTML nettoyé
const cache = new Map();

function domaineAutorise(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  return DOMAINES_AUTORISES.some((d) => host === d || host.endsWith(`.${d}`));
}

function retirerBloc(html, balise) {
  const re = new RegExp(`<${balise}\\b[^>]*>[\\s\\S]*?<\\/${balise}>`, 'gi');
  let precedent;
  do {
    precedent = html;
    html = html.replace(re, ' ');
  } while (html !== precedent); // imbrications
  return html;
}

function extraireCorps(html) {
  // On privilégie <main>, puis <article>, sinon <body>.
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1];
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return article[1];
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1] : html;
}

function nettoyer(html, baseUrl) {
  html = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const b of ['script', 'style', 'noscript', 'svg', 'iframe', 'form', 'button', 'select', 'video', 'audio', 'canvas', 'template']) {
    html = retirerBloc(html, b);
  }
  html = extraireCorps(html);
  for (const b of ['nav', 'header', 'footer', 'aside']) {
    html = retirerBloc(html, b);
  }

  // Réécriture des liens en absolu, puis suppression de tous les attributs.
  html = html.replace(/<a\b([^>]*)>/gi, (balise, attrs) => {
    const href = /href\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1];
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return '<a>';
    let absolu;
    try {
      absolu = new URL(href, baseUrl).href;
    } catch {
      return '<a>';
    }
    return `<a href="${absolu.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">`;
  });

  // Toute balise hors liste blanche est retirée, son contenu textuel reste.
  html = html.replace(/<\/?([a-zA-Z0-9-]+)\b[^>]*>/g, (balise, nom) => {
    const n = nom.toLowerCase();
    if (!BALISES_GARDEES.has(n)) return ' ';
    if (n === 'a' && balise.startsWith('<a ')) return balise; // href déjà assaini
    if (balise.startsWith('</')) return `</${n}>`;
    return `<${n}>`;
  });

  // On ne conserve que les blocs de contenu : le texte resté hors balise après
  // le nettoyage est du résidu de gabarit (compteurs, identifiants, menus).
  const blocs = html.match(/<(h1|h2|h3|h4|h5|p|ul|ol|table|blockquote|dl)\b[^>]*>[\s\S]*?<\/\1>/gi) || [];
  html = blocs
    .map((b) => b.replace(/\s+/g, ' ').trim())
    .filter((b) => {
      const texte = b.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (texte.length <= 2) return false;
      return !BOILERPLATE.some((re) => re.test(texte));
    })
    .join('\n');

  return html.slice(0, TAILLE_MAX).trim();
}

function titreDe(html) {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return t ? t[1].replace(/\s+/g, ' ').trim() : null;
}

/**
 * Récupère une page autorisée et renvoie son contenu nettoyé.
 * @param {string} url
 * @returns {Promise<{titre: string|null, html: string, url: string}>}
 */
export async function lireArticle(url) {
  if (!domaineAutorise(url)) {
    const e = new Error("Cette source n'est pas autorisée à la lecture intégrée.");
    e.statut = 400;
    throw e;
  }

  const enCache = cache.get(url);
  if (enCache && Date.now() - enCache.at < TTL_MS) return enCache.data;

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 12_000);
  let reponse;
  try {
    reponse = await fetch(url, {
      signal: controleur.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KlockaReader/1.0)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    });
  } catch {
    const e = new Error('Source injoignable.');
    e.statut = 502;
    throw e;
  } finally {
    clearTimeout(minuteur);
  }

  if (!reponse.ok) {
    const e = new Error(`La source a répondu ${reponse.status}.`);
    e.statut = 502;
    throw e;
  }
  const type = reponse.headers.get('content-type') || '';
  if (!type.includes('html')) {
    const e = new Error("Cette source n'est pas une page lisible.");
    e.statut = 415;
    throw e;
  }

  const brut = await reponse.text();
  const data = { titre: titreDe(brut), html: nettoyer(brut, reponse.url || url), url: reponse.url || url };
  cache.set(url, { at: Date.now(), data });
  return data;
}

export const DOMAINES_LECTURE = DOMAINES_AUTORISES;
