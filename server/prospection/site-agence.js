// Le site de l'agence, lu pour la carte d'appel (17 nov. 2026, Jules : « tu vas dans leur page équipe, c'est très facile
// de voir qui fait quoi, et leur numéro perso » ; « dans le résumé IA, dis plutôt "nous intervenons principalement sur
// Nice, Antibes, Cannes", "11 collaborateurs", ce qu'ils ont dans leurs offres »).
//
// Une fois par agence (gardé 60 jours, `site_lu`) : l'accueil, la page équipe et la page « qui sommes-nous », et la liste
// des liens vers les offres. Un modèle rapide en tire les personnes (nom complet, poste, numéro et mail écrits à côté),
// les villes où l'agence dit intervenir, la taille de l'équipe et ce qu'elle a en offre. Les personnes rejoignent celles
// de l'agence (`agents`, source « page équipe du site ») ; le reste nourrit le résumé IA (resume-agence.js).

import { Records } from '../db.js';

const AGENCE = 'AgenceProspect';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const GARDE_MS = 60 * 86400000;
const EQUIPE = /(equipe|équipe|team|nos-?conseillers|nos-?agents|nos-?collaborateurs|conseillers|collaborateurs|negociateurs|trombi)/i;
const QUI = /(qui-sommes|quisommes|a-propos|apropos|about|notre-agence|l-agence|le-cabinet|cabinet|presentation|histoire)/i;
const OFFRES = /(offre|annonce|vente|location|a-vendre|a-louer|biens|catalogue|nos-biens|immobilier\/)/i;
const MODELE_RAPIDE = 'claude-haiku-4-5';
const CHEMINS_EQUIPE = ['/equipe', '/notre-equipe', '/l-equipe', '/equipe/', '/team', '/nos-collaborateurs', '/nos-conseillers', '/qui-sommes-nous', '/fr/equipe', '/agence/equipe'];

/** Pure : le texte d'une page HTML (numéros et mails des liens gardés), sans scripts ni balises. */
export function texteDeLaPage(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<a[^>]+href="(tel|mailto):([^"]+)"[^>]*>/gi, ' $2 ').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, "'").replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/** Pure : les liens du même site, rangés en pages équipe, pages « qui sommes-nous » et offres. */
export function liensDuSite(html, base) {
  let b; try { b = new URL(base); } catch { return { equipe: [], qui: [], offres: [] }; }
  const meme = (u) => u.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');
  const liens = [...String(html || '').matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)]
    .map((m) => { try { return new URL(m[1].trim(), b); } catch { return null; } })
    .filter((u) => u && /^https?:$/.test(u.protocol) && meme(u))
    .map((u) => `${u.origin}${u.pathname}`);
  const uniques = [...new Set(liens)];
  const chemin = (u) => decodeURIComponent(new URL(u).pathname);
  return {
    equipe: uniques.filter((u) => EQUIPE.test(chemin(u)) && !/\/\d{3,}\/?$/.test(chemin(u))).slice(0, 2),
    qui: uniques.filter((u) => QUI.test(chemin(u)) && !EQUIPE.test(chemin(u))).slice(0, 1),
    offres: uniques.filter((u) => OFFRES.test(chemin(u)) && chemin(u).length > 8).slice(0, 80).map(chemin),
  };
}

const domaineDe = (site) => { try { return new URL(/^https?:/.test(site) ? site : `https://${site}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; } };
const cleDeNom = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
const normTel = (t) => { const d = String(t || '').replace(/\D/g, '').replace(/^330?/, '0'); return d.length === 10 ? d.replace(/(\d{2})(?=\d)/g, '$1 ').trim() : null; };

const SCHEMA = {
  type: 'object',
  properties: {
    personnes: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, fonction: { type: 'string' }, telephone: { type: 'string' }, email: { type: 'string' } }, required: ['nom'] } },
    zones: { type: 'array', items: { type: 'string' } },
    collaborateurs: { type: 'number' },
    specialite: { type: 'string' },
    offres: { type: 'string' },
    faits: { type: 'array', items: { type: 'string' } },
  },
  required: ['personnes'],
};

/** Pure : la consigne donnée au modèle. */
export function consigneSite(nom, pages, offres, standard = null) {
  return `Voici le texte du site de l'agence immobilière « ${nom} » (accueil, page équipe, page de présentation) et les adresses de ses offres.${standard ? ` Le standard de l'agence est le ${standard} : ce n'est le numéro de personne en particulier.` : ''}

Relève :
- personnes : chaque personne qui y travaille, nommée dans le texte : nom complet tel qu'écrit, fonction (« Conseiller en transaction », « Assistante administrative »…), son téléphone personnel (portable ou ligne directe) et son mail s'ils sont écrits à côté de son nom ; jamais le standard de l'agence, même répété sous chaque nom (téléphone vide alors). Pas de clients, pas d'auteurs d'avis.
- zones : les villes ou secteurs où l'agence dit intervenir (« nous intervenons sur Nice, Antibes et Cannes ») ; vide si le site ne le dit pas.
- collaborateurs : le nombre de collaborateurs si le site le dit, ou le nombre de personnes de la page équipe ; 0 sinon.
- specialite : ce que fait l'agence, en quelques mots (« immobilier d'entreprise et commerces », « résidentiel », « transaction et gestion »).
- offres : en une phrase, ce qu'elle a en offre d'après les adresses (vente ou location, types de biens, villes), par exemple « surtout des locaux commerciaux et bureaux à louer à Nice, Cannes et Antibes, quelques ventes » ; vide sans offre.
- faits : deux ou trois faits utiles avant de les appeler, écrits par le site (années d'existence, réseau, spécialité rare, membre d'une fédération) ; pas de slogans.
N'invente rien ; un champ absent reste vide.

${pages.map((p) => `### ${p.url}\n${p.texte}`).join('\n\n').slice(0, 16000)}

### Adresses des offres
${offres.join('\n') || '(aucune)'}`;
}

const MAILS_PERSO = /^(gmail|googlemail|hotmail|yahoo|orange|wanadoo|free|sfr|outlook|live|icloud|laposte|neuf|aol|me|msn|bbox|numericable|club-internet|proton|protonmail)\./i;
const cleNom = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const chiffres = (t) => { const d = String(t || '').replace(/\D/g, '').replace(/^330?/, '0'); return d.length === 10 ? d : null; };

/**
 * Pure : le site d'une agence qui n'en a pas, d'après ce que Klocka sait déjà. Une autre fiche de la même agence (même
 * numéro, ou un nom qui contient l'autre : « Azurea Commerces » et « Azurea Commerces & Entreprises »), ou le domaine
 * d'un e-mail professionnel. null sinon.
 */
export function siteConnu(a, autres = []) {
  const tel = chiffres(a?.telephone);
  const nom = cleNom(a?.nom);
  const soeur = autres.find((b) => b.id !== a.id && b.site && ((tel && chiffres(b.telephone) === tel)
    || (nom.length >= 6 && cleNom(b.nom).length >= 6 && (cleNom(b.nom).startsWith(nom) || nom.startsWith(cleNom(b.nom))))));
  if (soeur) return { site: soeur.site, source: 'autre fiche de l\'agence' };
  const domaine = String(a?.email || '').split('@')[1]?.trim().toLowerCase();
  if (domaine && /\./.test(domaine) && !MAILS_PERSO.test(domaine)) return { site: `https://${domaine}`, source: 'domaine de l\'e-mail' };
  return null;
}

/** Pure : l'adresse du site dans la réponse de la recherche ; null pour un annuaire, un portail ou « aucune ». */
export function siteDeLaReponse(texte) {
  const m = String(texte || '').match(/https?:\/\/[^\s)"'<>\]]+/i);
  if (!m) return null;
  let u; try { u = new URL(m[0].replace(/[.,;]+$/, '')); } catch { return null; }
  const PORTAILS = /(pagesjaunes|google|facebook|linkedin|instagram|seloger|leboncoin|bienici|logic-immo|meilleursagents|societe\.com|pappers|infogreffe|annuaire|yelp|tripadvisor|bodacc|verif\.com|manageo|kompass|youtube|tiktok|twitter|x\.com|apollo\.io|immo-entreprise\.com|cessionpme|geolocaux|bureauxlocaux)/i;
  if (PORTAILS.test(u.hostname)) return null;
  return `${u.origin}/`;
}

/**
 * Le site d'une agence qui n'en a pas (17 nov. 2026, Jules : « sur leur site ils mettent plein d'autres trucs ») : ce
 * que Klocka sait déjà, sinon une recherche web, une seule fois par agence (`site_cherche_le`). Les mandataires n'ont
 * pas de site à eux : on ne cherche pas. Pose `site` et `site_source` sur l'agence ; rend le site ou null.
 */
export async function trouverSite(agenceId, { chercher = null } = {}) {
  const a = Records.get(AGENCE, agenceId);
  if (!a || a.site) return a?.site || null;
  if (a.genre === 'mandataire' || a.site_cherche_le) return null;
  const connu = siteConnu(a, Records.list(AGENCE));
  if (connu) {
    Records.update(AGENCE, agenceId, { site: connu.site, site_source: connu.source, site_cherche_le: new Date().toISOString() });
    return connu.site;
  }
  // Sans numéro ni adresse, rien ne permet de vérifier ce que la recherche rend : on ne cherche pas (17 nov. 2026).
  if (!chiffres(a.telephone) && !a.adresse) return null;
  Records.update(AGENCE, agenceId, { site_cherche_le: new Date().toISOString() });
  const ville = (a.liste_id && Records.get('ListeAgences', a.liste_id)?.ville) || a.ville || '';
  const prompt = [
    `Trouve le site internet de l'agence immobilière « ${a.nom} »${ville ? ` à ${ville}` : ''}${a.adresse ? ` (${a.adresse})` : ''}${a.telephone ? `, téléphone ${a.telephone}` : ''}.`,
    'Son site à elle, celui de l\'agence ou sa page sur le site de son réseau ; jamais un annuaire, un portail d\'annonces ni un réseau social.',
    'Vérifie que c\'est bien cette agence (même nom, même ville). Réponds par la seule adresse, sans rien d\'autre ; « aucune » si tu ne la trouves pas.',
  ].join('\n');
  let texte;
  if (chercher) texte = await chercher(prompt);
  else {
    const { invokeLLMGrounded } = await import('../llm.js');
    const { mesurer } = await import('../llm-couts.js');
    const r = (await mesurer({ operation: 'site d\'une agence (recherche web)', sur: agenceId }, () => invokeLLMGrounded({ prompt, via: 'anthropic' }))).resultat;
    texte = r?.final || r?.text;
  }
  const site = siteDeLaReponse(texte);
  if (site) Records.update(AGENCE, agenceId, { site, site_source: 'recherche web' });
  return site;
}

// Les mots qui ne distinguent pas une agence d'une autre.
const MOTS_COMMUNS = new Set(['agence', 'agences', 'immobilier', 'immobiliere', 'immobilieres', 'immo', 'cabinet', 'commercial', 'commerciale', 'commerces', 'commerce', 'entreprise', 'entreprises', 'conseil', 'conseils', 'transaction', 'transactions', 'gestion', 'groupe', 'group', 'real', 'estate', 'properties', 'property', 'patrimoine', 'invest', 'investissement', 'nice', 'cannes', 'antibes', 'rennes', 'cote', 'azur', 'riviera', 'france', 'les', 'des', 'and', 'the', 'sas', 'sarl']);

/** Pure : le site parle-t-il de cette agence ? Son numéro, ou tous les mots propres de son nom (« dësk », « ACR »). */
export function siteCorrespond(texte, a) {
  const t = cleNom(texte);
  const tel = chiffres(a?.telephone);
  if (tel && String(texte || '').replace(/\D/g, '').replace(/33(\d{9})/g, '0$1').includes(tel)) return true;
  const propres = cleNom(a?.nom).split(' ').filter((m) => m.length >= 3 && !MOTS_COMMUNS.has(m));
  if (!propres.length) return false;
  // Un mot court doit être entier (« desk » n'est pas « desktop ») ; un plus long peut être collé (un domaine, une marque).
  return propres.every((m) => (m.length <= 4 ? new RegExp(`(^| )${m}( |$)`).test(t) : t.includes(m) || t.replace(/ /g, '').includes(m)));
}

const EN_COURS = new Map();

/**
 * Lit le site de l'agence (une fois tous les 60 jours) et pose ce qu'il dit sur l'agence. Rend `site_lu`, ou null sans
 * site lisible. `lire` remplace fetch, `lireModele` le modèle, dans les tests.
 */
export function lireSiteAgence(agenceId, { lire = fetch, lireModele = null, refaire = false, chercher = null } = {}) {
  if (EN_COURS.has(agenceId)) return EN_COURS.get(agenceId);
  const p = (async () => {
    // Sans site connu, on le trouve d'abord (17 nov. 2026).
    if (!Records.get(AGENCE, agenceId)?.site) await trouverSite(agenceId, { chercher });
    const a = Records.get(AGENCE, agenceId);
    if (!a?.site) return null;
    if (!refaire && a.site_lu && Date.now() - Date.parse(a.site_lu.le) < GARDE_MS) return a.site_lu;
    // Une autre fiche du même site déjà lue (17 nov. 2026 : sept fiches Azurea en double dans la liste de Nice) : sa
    // lecture et ses photos se reprennent, sans relire le site ni repayer le modèle.
    const domaine = domaineDe(a.site);
    const soeur = !refaire && domaine ? Records.list(AGENCE).find((x) => x.id !== a.id && x.site_lu && !x.site_lu.illisible && Date.now() - Date.parse(x.site_lu.le) < GARDE_MS && domaineDe(x.site) === domaine) : null;
    if (soeur) {
      const agents = [...(a.agents || [])];
      for (const x of soeur.site_lu.personnes || []) {
        const y = agents.find((z) => z.nom && cleDeNom(z.nom) === cleDeNom(x.nom));
        if (y) { y.fonction = y.fonction || x.fonction; y.telephone = y.telephone || x.telephone; y.email = y.email || x.email; } else agents.push({ ...x, source: 'page équipe du site' });
      }
      Records.update(AGENCE, agenceId, {
        site_lu: { ...soeur.site_lu, repris_de: soeur.id }, agents,
        pages_lues: [...new Set([...(a.pages_lues || []), ...(soeur.site_lu.pages || [])])],
        ...(soeur.photos_equipe && !a.photos_equipe ? { photos_equipe: { ...soeur.photos_equipe, photos_web_le: undefined } } : {}),
      });
      return soeur.site_lu;
    }
    const charger = async (url) => {
      try {
        const r = await lire(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
        if (!r.ok || !String(r.headers.get('content-type') || '').includes('html')) return null;
        return { url: r.url || url, html: (await r.text()).slice(0, 800000) };
      } catch { return null; }
    };
    const accueil = await charger(/^https?:/.test(a.site) ? a.site : `https://${a.site}`);
    if (!accueil) {
      Records.update(AGENCE, agenceId, { site_lu: { le: new Date().toISOString(), illisible: true } });
      return null;
    }
    // Un site trouvé par la recherche web n'est gardé que s'il parle de cette agence (17 nov. 2026 : « dësk » menait au site
    // d'une autre agence niçoise, « ACR Immobilier » à un homonyme de Monaco).
    if (a.site_source === 'recherche web' && !siteCorrespond(`${accueil.url} ${texteDeLaPage(accueil.html)}`, a)) {
      Records.update(AGENCE, agenceId, { site: null, site_source: null, site_rejete: a.site, site_lu: null });
      return null;
    }
    const liens = liensDuSite(accueil.html, accueil.url);
    // Une page équipe que l'accueil ne relie pas (menu écrit en JavaScript, 17 nov. 2026 : Azurea et son /equipe) :
    // les adresses courantes s'essaient, la première qui répond avec des noms est gardée.
    if (!liens.equipe.length) {
      const racine = new URL(accueil.url).origin;
      for (const chemin of CHEMINS_EQUIPE) {
        const p = await charger(`${racine}${chemin}`);
        if (p && texteDeLaPage(p.html).length > 400 && !/(404|introuvable|not found)/i.test(texteDeLaPage(p.html).slice(0, 300))) { liens.equipe.push(p.url); break; }
      }
    }
    const autres = (await Promise.all([...liens.equipe, ...liens.qui].map(charger))).filter(Boolean);
    const pages = [accueil, ...autres].map((x) => ({ url: x.url, texte: texteDeLaPage(x.html).slice(0, 7000) }));
    const prompt = consigneSite(a.nom, pages, liens.offres, a.telephone || null);
    let r;
    if (lireModele) r = await lireModele(prompt);
    else {
      const { invokeLLM } = await import('../llm.js');
      const { mesurer } = await import('../llm-couts.js');
      r = (await mesurer({ operation: 'lecture du site d\'une agence', sur: agenceId }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, modele: MODELE_RAPIDE, max_tokens: 2500 }))).resultat;
    }
    const personnes = (r?.personnes || []).filter((x) => x?.nom && x.nom.trim().split(/\s+/).length >= 2 && x.nom.length < 60)
      .map((x) => ({ nom: x.nom.trim(), fonction: String(x.fonction || '').trim() || null, telephone: normTel(x.telephone), email: String(x.email || '').trim().toLowerCase() || null }));
    const site_lu = {
      le: new Date().toISOString(),
      pages: pages.map((x) => x.url),
      personnes,
      zones: (r?.zones || []).map((z) => String(z).trim()).filter(Boolean).slice(0, 12),
      collaborateurs: Number(r?.collaborateurs) > 0 ? Math.round(Number(r.collaborateurs)) : null,
      specialite: String(r?.specialite || '').trim() || null,
      offres: String(r?.offres || '').trim() || null,
      faits: (r?.faits || []).map((f) => String(f).trim()).filter(Boolean).slice(0, 3),
    };
    // Les personnes rejoignent celles de l'agence : un nom déjà connu prend le poste, le numéro et le mail qui manquaient.
    const frais = Records.get(AGENCE, agenceId) || a;
    const agents = [...(frais.agents || [])];
    const cle = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    for (const x of personnes) {
      const y = agents.find((z) => z.nom && cle(z.nom) === cle(x.nom));
      if (y) { y.fonction = y.fonction || x.fonction; y.telephone = y.telephone || x.telephone; y.email = y.email || x.email; }
      else agents.push({ ...x, source: 'page équipe du site' });
    }
    const pages_lues = [...new Set([...(frais.pages_lues || []), ...site_lu.pages])];
    Records.update(AGENCE, agenceId, { site_lu, agents, pages_lues });
    return site_lu;
  })().finally(() => EN_COURS.delete(agenceId));
  EN_COURS.set(agenceId, p);
  return p;
}
