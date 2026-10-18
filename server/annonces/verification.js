// La vérification des sites d'agences avant toute collecte (18 oct. 2026, lot 3 de la boîte à outils de Haka).
//
// Règle de Jules : on ne collecte que là où rien ne l'interdit. Pour chaque site :
//   - robots.txt bloque les pages d'annonces ou de recherche, ou tout le site → interdit ;
//   - les conditions d'utilisation ou les mentions légales interdisent les robots, l'extraction ou la
//     réutilisation de la base → interdit ;
//   - une mention générale « reproduction interdite » qui ne parle pas d'extraction → douteux : pas de
//     collecte, la phrase exacte va à Jules qui tranche ;
//   - sinon → autorisé.
// La date de vérification et la phrase lue sont gardées (SiteAgence). Revérifié une fois par mois : un site
// devenu interdit sort de la collecte de lui-même. Rien n'est collecté ici : on lit robots.txt, la page
// d'accueil et deux ou trois pages légales, avec un user-agent qui nomme Klocka.

import { Records } from '../db.js';

export const UA = 'KlockaBot/1.0 (+https://klocka.immo ; sourcing@klocka.immo) collecte de loyers de locaux commerciaux, une lecture par jour';
const ENTITE = 'SiteAgence';
const DELAI_MS = 20000;

// --- Pur : robots.txt ------------------------------------------------------------------------------

/** Pure : les règles qui s'appliquent à notre robot (groupe KlockaBot, sinon `*`). */
export function reglesRobots(texte, agent = 'klockabot') {
  const groupes = [];
  let courant = null;
  let dernierEtaitAgent = false;
  for (const brute of String(texte || '').split(/\r?\n/)) {
    const ligne = brute.replace(/#.*$/, '').trim();
    if (!ligne) continue;
    const m = ligne.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, cle, valeur] = m;
    const k = cle.toLowerCase();
    if (k === 'user-agent') {
      if (!dernierEtaitAgent) { courant = { agents: [], disallow: [], allow: [] }; groupes.push(courant); }
      courant.agents.push(valeur.toLowerCase());
      dernierEtaitAgent = true;
    } else {
      dernierEtaitAgent = false;
      if (!courant) continue;
      if (k === 'disallow') courant.disallow.push(valeur);
      if (k === 'allow') courant.allow.push(valeur);
    }
  }
  const pourNous = groupes.find((g) => g.agents.some((a) => a !== '*' && agent.includes(a)));
  const pourTous = groupes.find((g) => g.agents.includes('*'));
  return pourNous || pourTous || { agents: [], disallow: [], allow: [] };
}

// Les chemins qui portent des annonces ou une recherche, quel que soit le logiciel du site.
const RE_CHEMIN_ANNONCES = /annonce|recherche|search|r[ée]sultat|liste|listing|location|louer|vente|vendre|offre|catalog|programme|propert|\/biens?\b|\/biens?[-_]|immobilier\/|\/ads?\//i;

/** Pure : le verdict de robots.txt. Bloqué si tout le site l'est, ou si une règle vise les annonces ou la recherche. */
export function verdictRobots(texte) {
  if (texte == null) return { bloque: false, absent: true, lignes: [] };
  const r = reglesRobots(texte);
  const lignes = r.disallow.filter(Boolean);
  if (lignes.some((d) => d.trim() === '/' || d.trim() === '/*')) return { bloque: true, lignes: lignes.filter((d) => ['/', '/*'].includes(d.trim())), raison: 'tout le site est fermé aux robots' };
  const visees = lignes.filter((d) => RE_CHEMIN_ANNONCES.test(d));
  return visees.length ? { bloque: true, lignes: visees, raison: 'pages d\'annonces ou de recherche fermées aux robots' } : { bloque: false, lignes };
}

// --- Pur : les textes légaux -----------------------------------------------------------------------

/** Pure : le texte lisible d'une page HTML. */
export function texteDe(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à').replace(/&ccedil;/g, 'ç').replace(/&ecirc;/g, 'ê').replace(/&ocirc;/g, 'ô').replace(/&rsquo;|&#8217;|&#039;|&apos;/g, "'").replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*/g, '\n').trim();
}

const phrases = (texte) => String(texte || '').split(/(?<=[.!?;])\s+|\n+/).map((p) => p.trim()).filter((p) => p.length > 15 && p.length < 900);

const RE_OBJET_INTERDIT = /\b(robots?|spiders?|crawl\w*|scrap\w*|aspir\w*|extraction|extraire|r[ée]utilis\w*|indexation automatique|moyens? automatis\w*|proc[ée]d[ée]s? automatis\w*|base[s]? de donn[ée]es)\b/i;
const RE_INTERDICTION = /interdit\w*|prohib\w*|sans (l'|leur |son |notre )?(autorisation|accord|consentement)|ne (peut|peuvent|saurait|sauraient|pourra|pourront) |strictement|formellement|il est d[ée]fendu|n'est pas autoris/i;
// Le bruit des bandeaux de cookies et des politiques de confidentialité (« informations extraites à cette seule
// fin », « assignation à comparaître », « vos données personnelles ») : ces phrases ne parlent pas de la base d'annonces.
const RE_BRUIT = /cookie|traceur|assignation|fournisseur d'acc[èe]s|statistiques? anonymes|donn[ée]es (à caract[èe]re )?personnelles|rgpd|cnil|vos donn[ée]es|vous identifier|newsletter/i;
const RE_REPRODUCTION = /\b(reproduction|reproduire|repr[ée]sentation|copie|copier|diffusion|exploitation)\b/i;

/**
 * Pure : le verdict d'un texte légal. `interdit` quand une phrase interdit les robots, l'extraction ou la
 * réutilisation (ou la base de données) ; `douteux` quand seule une interdiction générale de reproduction
 * apparaît ; `rien` sinon. Rend la phrase exacte.
 */
export function verdictTexte(texte) {
  const ps = phrases(texte);
  const utiles = ps.filter((p) => !RE_BRUIT.test(p));
  const interdit = utiles.find((p) => RE_OBJET_INTERDIT.test(p) && RE_INTERDICTION.test(p));
  if (interdit) return { verdict: 'interdit', phrase: interdit };
  const douteux = utiles.find((p) => RE_REPRODUCTION.test(p) && RE_INTERDICTION.test(p));
  if (douteux) return { verdict: 'douteux', phrase: douteux };
  return { verdict: 'rien', phrase: null };
}

/** Pure : les liens d'une page d'accueil vers ses pages légales (mentions, CGU, conditions, politique). */
export function liensLegaux(html, base) {
  const liens = [];
  for (const m of String(html || '').matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, href, contenu] = m;
    const libelle = texteDe(contenu).toLowerCase();
    if (/mentions?\s*l[ée]gales|cgu|conditions\s*(g[ée]n[ée]rales)?\s*d'?utilisation|conditions\s*g[ée]n[ée]rales|legal|informations\s*l[ée]gales/.test(`${libelle} ${href.toLowerCase()}`)) {
      try { liens.push(new URL(href, base).href); } catch { /* lien illisible */ }
    }
  }
  return [...new Set(liens)].slice(0, 3);
}

// Les empreintes des logiciels de sites d'agences, relevées dans le HTML (générateur, hôtes de scripts et d'images).
// Seules les marques vues dans les pages sont retenues ; une empreinte inconnue garde ses hôtes pour être classée ensuite.
export const EMPREINTES = [
  ['hektor', /hektor|la-boite-immo|laboiteimmo/i],
  ['apimo', /apimo/i],
  ['ac3', /\bac3[-.]|ac3-distribution|ac3distribution/i],
  ['netty', /netty\.fr|nettyimmo|\bnetty\b/i],
  ['adaptimmo', /adapt-?immo/i],
  ['immo-facile', /immo-?facile/i],
  ['twimmo', /twimmo/i],
  ['ubiflow', /ubiflow/i],
  ['pericles', /pericles/i],
  ['modelo', /\bmodelo\b/i],
  ['immofacile', /immofacile/i],
  ['wordpress', /wp-content|wordpress/i],
  ['wix', /wix\.com|wixstatic/i],
];

/** Pure : le logiciel du site et les hôtes tiers vus dans la page. */
export function logicielDe(html) {
  const h = String(html || '');
  const generateur = (h.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i) || [])[1] || null;
  const hotes = [...new Set([...h.matchAll(/(?:src|href)=["']https?:\/\/([^/"']+)/gi)].map((m) => m[1].toLowerCase()))];
  const metier = EMPREINTES.filter(([nom]) => !['wordpress', 'wix'].includes(nom)).find(([, re]) => re.test(h));
  const generique = EMPREINTES.filter(([nom]) => ['wordpress', 'wix'].includes(nom)).find(([, re]) => re.test(h));
  return { logiciel: metier?.[0] || generique?.[0] || 'inconnu', generateur, hotes: hotes.slice(0, 20) };
}

/** Pure : la catégorie d'un site, de ses trois lectures. */
export function categorie({ robots, textes }) {
  if (robots?.bloque) return { categorie: 'interdit', motif: `robots.txt : ${robots.raison}`, phrase: robots.lignes.map((l) => `Disallow: ${l}`).join(' ; ') };
  const interdit = textes.find((t) => t.verdict === 'interdit');
  if (interdit) return { categorie: 'interdit', motif: 'conditions ou mentions légales', phrase: interdit.phrase, page: interdit.page };
  const douteux = textes.find((t) => t.verdict === 'douteux');
  if (douteux) return { categorie: 'douteux', motif: 'reproduction interdite, sans parler d\'extraction', phrase: douteux.phrase, page: douteux.page };
  return { categorie: 'autorise', motif: textes.length ? 'rien n\'interdit la collecte' : 'aucune page légale trouvée, rien n\'interdit la collecte', phrase: null };
}

// --- Le réseau ----------------------------------------------------------------------------------------

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function lire(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(DELAI_MS) });
    if (!r.ok) return { statut: r.status, texte: null, url: r.url };
    return { statut: r.status, texte: (await r.text()).slice(0, 1_500_000), url: r.url };
  } catch (e) {
    return { statut: 0, texte: null, erreur: e?.name === 'TimeoutError' ? 'délai dépassé' : e?.message || String(e) };
  }
}

/** Pure : l'origine d'un site (« https://www.agence.fr »), ou null. */
export function origineDe(url) {
  try { const u = new URL(/^https?:/i.test(url) ? url : `https://${url}`); return `${u.protocol}//${u.host.toLowerCase()}`; } catch { return null; }
}

/** Vérifie un site : robots.txt, page d'accueil, pages légales. Garde le verdict daté. Rien n'est collecté. */
export async function verifierSite(origineDemandee, { agences = [], pause = 1200 } = {}) {
  let origine = origineDemandee;
  // Un certificat ou un protocole en défaut : on réessaie avec l'autre (http ou https) avant de dire injoignable.
  let robotsLu = await lire(`${origine}/robots.txt`);
  if (robotsLu.statut === 0) {
    const autre = origine.startsWith('https:') ? origine.replace(/^https:/, 'http:') : origine.replace(/^http:/, 'https:');
    const essai = await lire(`${autre}/robots.txt`);
    if (essai.statut !== 0) { robotsLu = essai; origine = autre; }
  }
  await attendre(pause);
  const robots = verdictRobots(robotsLu.statut === 200 ? robotsLu.texte : null);
  const accueil = await lire(`${origine}/`);
  const base = accueil.url || `${origine}/`;
  const logiciel = logicielDe(accueil.texte);
  const textes = [];
  if (!robots.bloque) {
    for (const lien of liensLegaux(accueil.texte, base)) {
      await attendre(pause);
      const p = await lire(lien);
      if (p.texte) textes.push({ ...verdictTexte(texteDe(p.texte)), page: lien });
    }
  }
  const c = accueil.texte == null && robotsLu.texte == null
    ? { categorie: 'injoignable', motif: accueil.erreur || `réponse ${accueil.statut}`, phrase: null }
    : categorie({ robots, textes });
  const fiche = {
    origine, agences, ...c,
    robots: { lu: robotsLu.statut === 200, lignes: robots.lignes?.slice(0, 12) || [] },
    pages_legales: textes.map((t) => ({ page: t.page, verdict: t.verdict })),
    logiciel: logiciel.logiciel, generateur: logiciel.generateur, hotes: logiciel.hotes,
    verifie_le: new Date().toISOString(),
  };
  const garde = Records.filter(ENTITE, { origine: origineDemandee })[0] || Records.filter(ENTITE, { origine })[0];
  return garde ? Records.update(ENTITE, garde.id, { ...fiche, historique: [...(garde.historique || []), { le: garde.verifie_le, categorie: garde.categorie }].slice(-12) }) : Records.create(ENTITE, fiche);
}

/** Les sites vérifiés. */
export const sitesVerifies = () => Records.list(ENTITE);

/** Un site peut-il être collecté aujourd'hui ? Autorisé, et vérifié il y a moins de 31 jours. */
export function collectable(site, now = Date.now()) {
  return site?.categorie === 'autorise' && now - Date.parse(site.verifie_le) < 31 * 86400000;
}
