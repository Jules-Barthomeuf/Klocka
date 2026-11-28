// La page donnée par l'équipe (28 nov. 2026, Jules : « je te donne juste les liens, la page équipe ou la page de Loïc
// Borges sur son site efficity ; toi tu vas chercher dans la page son numéro, son adresse mail… »). Aucune recherche web :
// le lien est donné, la page est lue une fois, puis gardée sur l'agence.
//
// Deux sortes de pages :
//   - la page d'une personne (sa page de conseiller sur le site de l'agence ou de son réseau) : son portable, son mail,
//     sa note et ses avis, sa spécialité, et quelques-uns de ses biens (type, surface, ville, prix, lien) ;
//   - la page équipe d'une agence : chaque personne, son poste, son numéro et son mail quand la page les écrit, et le
//     lien de sa page à elle quand la page équipe y mène.
// Ce que la page écrit en clair se lit sans modèle : les liens tel: et mailto:, les mails masqués par Cloudflare
// (data-cfemail, /cdn-cgi/l/email-protection), les données structurées (ld+json). Un petit modèle range le reste ; ce
// qu'il rend n'est gardé que si la page l'écrit (un numéro, un mail lus dans le texte).
// Les personnes rejoignent celles de l'agence (`agents`, source « page du conseiller » ou « page équipe du site ») : la
// carte d'appel, la fiche du CRM et la colonne Interlocuteurs de Twenty les montrent.

import { Records } from '../db.js';
import { memePersonne } from './page-personne.js';

const AGENCE = 'AgenceProspect';
const MODELE_RAPIDE = 'claude-haiku-4-5';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_BIENS = 8;

/** Pure : un mail masqué par Cloudflare (la clé est le premier octet, chaque octet suivant lui est combiné). */
export function decoderCfemail(hex) {
  const h = String(hex || '').trim();
  if (!/^[0-9a-f]{4,}$/i.test(h) || h.length % 2) return null;
  const cle = parseInt(h.slice(0, 2), 16);
  let s = '';
  for (let i = 2; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16) ^ cle);
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s) ? s.toLowerCase() : null;
}

/** Pure : la page avec ses mails Cloudflare remis en clair (le lien devient un mailto:, le texte masqué le mail). */
export function demasquer(html) {
  return String(html || '')
    .replace(/href="[^"]*\/cdn-cgi\/l\/email-protection#([0-9a-f]+)"/gi, (m, h) => { const e = decoderCfemail(h); return e ? `href="mailto:${e}"` : m; })
    .replace(/<([a-z]+)[^>]*data-cfemail="([0-9a-f]+)"[^>]*>[\s\S]*?<\/\1>/gi, (m, t, h) => decoderCfemail(h) || m);
}

/** Pure : un numéro français écrit par paires (« 06 27 57 37 99 ») ; rien si ce n'en est pas un. */
export function numero(t) {
  let d = String(t || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+33')) d = `0${d.slice(3)}`;
  else if (d.startsWith('0033')) d = `0${d.slice(4)}`;
  d = d.replace(/^0+(?=0\d{9}$)/, '');
  if (!/^0[1-9]\d{8}$/.test(d)) return null;
  return d.replace(/(\d{2})(?=\d)/g, '$1 ');
}
const portable = (n) => /^0[67]/.test(String(n || ''));

/** Pure : ce que la page écrit en clair : numéros (liens tel:), mails (mailto: et démasqués), données structurées. */
export function ceQueLaPageEcrit(html) {
  const h = demasquer(html);
  const tels = [...new Set([...h.matchAll(/href="tel:([^"]+)"/gi)].map((m) => numero(decodeURIComponent(m[1]))).filter(Boolean))];
  const mails = [...new Set([...h.matchAll(/href="mailto:([^"?]+)/gi)].map((m) => decodeURIComponent(m[1]).trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)))];
  let note = null, nb_avis = null;
  for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    const tous = [];
    const parcourir = (x) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach(parcourir); return; } tous.push(x); Object.values(x).forEach(parcourir); };
    parcourir(j);
    for (const x of tous) {
      if (x.telephone) { const n = numero(x.telephone); if (n && !tels.includes(n)) tels.push(n); }
      if (typeof x.email === 'string') { const e = x.email.replace(/^mailto:/i, '').trim().toLowerCase(); if (e.includes('@') && !mails.includes(e)) mails.push(e); }
      if (x.aggregateRating && note == null) { note = Number(x.aggregateRating.ratingValue) || null; nb_avis = Number(x.aggregateRating.reviewCount || x.aggregateRating.ratingCount) || null; }
    }
  }
  return { tels, mails, note, nb_avis, html: h };
}

/** Pure : le texte de la page, numéros et mails des liens gardés, sans scripts ni balises. */
export function texteDe(html) {
  // Une balise entière, même quand ses attributs contiennent « > » (le code des sites en Alpine ou Vue : « () => … »).
  const BALISE = /<[a-zA-Z/!](?:"[^"]*"|'[^']*'|[^'">])*>/g;
  return String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>|<template[\s\S]*?<\/template>/gi, ' ')
    .replace(/<a\s(?:"[^"]*"|'[^']*'|[^'">])*?href="(?:tel|mailto):([^"]+)"(?:"[^"]*"|'[^']*'|[^'">])*>/gi, ' $1 ').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section|article)>/gi, '\n')
    .replace(BALISE, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, "'").replace(/&euro;/g, '€').replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/** Pure : les liens du même site, avec leur texte (les pages des personnes, les annonces) ; au plus `max`. */
export function liensDe(html, base, max = 120) {
  let origine;
  try { origine = new URL(base).hostname.replace(/^www\./, ''); } catch { return []; }
  const vus = new Set();
  const out = [];
  for (const m of String(html || '').matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let u;
    try { u = new URL(m[1], base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, '') !== origine) continue;
    const texte = texteDe(m[2]).replace(/\s+/g, ' ').trim().slice(0, 90);
    const cle = u.href.replace(/\/$/, '');
    if (!texte || vus.has(cle)) continue;
    vus.add(cle);
    out.push(`${texte} -> ${cle}`);
    if (out.length >= max) break;
  }
  return out;
}

const SCHEMA_PERSONNE = {
  type: 'object',
  properties: {
    nom: { type: 'string' }, poste: { type: 'string' }, telephone: { type: 'string' }, email: { type: 'string' },
    note: { type: 'number' }, nb_avis: { type: 'number' }, specialite: { type: 'string' }, secteur: { type: 'string' },
    biens: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, surface: { type: 'number' }, ville: { type: 'string' }, prix: { type: 'number' }, vendu: { type: 'boolean' }, lien: { type: 'string' } } } },
    personnes: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, poste: { type: 'string' }, telephone: { type: 'string' }, email: { type: 'string' }, page: { type: 'string' } } } },
  },
};

/** Pure : la consigne du petit modèle, pour la page d'une personne (`nom`) ou la page équipe d'une agence (sans nom). */
export function consignePage({ nom = null, agence = '', url = '', texte = '', liens = [] }) {
  const commun = [
    `Page web : ${url}`,
    'Ne relève que ce que la page écrit : rien de deviné, rien de reformulé. Laisse vide ce qui manque.',
    'Numéros au format français (06 12 34 56 78). Le numéro du service client national d\'un réseau n\'est celui de personne.',
  ];
  const fin = ['', 'Liens de la page (texte -> adresse) :', ...liens, '', 'Texte de la page :', texte];
  if (nom) {
    return [
      `Page d'un agent immobilier : ${nom}${agence ? `, agence ${agence}` : ''}.`,
      ...commun,
      'Donne son nom complet tel qu\'écrit, son poste, son numéro à lui (son portable plutôt que celui de l\'agence), son mail, sa note et son nombre d\'avis, sa spécialité et son secteur (villes, quartiers).',
      `Puis ses biens montrés sur la page, au plus ${MAX_BIENS}, ceux à vendre d'abord : type (Maison, Appartement, Local commercial, Terrain…), surface en m², ville, prix en euros, vendu ou non, lien de l'annonce pris dans la liste des liens. Laisse « personnes » vide.`,
      ...fin,
    ].join('\n');
  }
  return [
    `Page équipe d'une agence immobilière${agence ? ` : ${agence}` : ''}.`,
    ...commun,
    'Donne dans « personnes » chaque personne de l\'équipe : nom complet tel qu\'écrit (jamais un prénom seul), poste, son numéro et son mail s\'ils sont écrits à côté de son nom, et le lien de sa page à elle s\'il est dans la liste des liens. Pas le nom de l\'agence, pas un client cité dans un avis.',
    ...fin,
  ].join('\n');
}

/** Pure : un mail est celui de la personne (son nom ou son prénom dans la partie avant @). */
const mailDe = (email, nom) => {
  const avant = String(email || '').split('@')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mots = String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter((m) => m.length >= 3);
  return mots.some((m) => avant.includes(m));
};

/** Pure : un bien rendu par le modèle, gardé s'il dit au moins quoi et où, ou un prix. */
export function bienPropre(b, base) {
  if (!b || typeof b !== 'object') return null;
  const type = String(b.type || '').trim().slice(0, 40) || null;
  const ville = String(b.ville || '').trim().slice(0, 60) || null;
  const prix = Number(b.prix) > 1000 ? Math.round(Number(b.prix)) : null;
  if (!type && !prix) return null;
  let lien = null;
  try { lien = b.lien ? new URL(b.lien, base).href : null; } catch { lien = null; }
  return { type, surface: Number(b.surface) > 0 ? Math.round(Number(b.surface)) : null, ville, prix, vendu: !!b.vendu, lien };
}

/**
 * Pure : ce que la page dit d'une personne, contrôlé par ce qu'elle écrit en clair. Le numéro : celui que le modèle a lu
 * s'il est écrit sur la page, sinon le seul portable des liens tel: ; jamais le standard de l'agence.
 */
export function profilDeLaPage(r, ecrit, { nom, url, standard = null }) {
  const texte = ecrit.texte || '';
  const chiffres = texte.replace(/\D/g, '');
  const std = numero(standard);
  const lu = numero(r?.telephone);
  const ecritSurLaPage = (n) => !!n && (ecrit.tels.includes(n) || chiffres.includes(n.replace(/\D/g, '')));
  let telephone = lu && ecritSurLaPage(lu) && lu !== std ? lu : null;
  const portables = ecrit.tels.filter((n) => portable(n) && n !== std);
  if (!telephone && portables.length === 1) telephone = portables[0];
  const mailLu = String(r?.email || '').trim().toLowerCase();
  const mails = ecrit.mails.filter((e) => !/^(contact|info|accueil|agence|service|noreply|no-reply|support)@/.test(e));
  const email = (mailLu && (ecrit.mails.includes(mailLu) || texte.toLowerCase().includes(mailLu)) ? mailLu : null)
    || mails.find((e) => mailDe(e, r?.nom || nom)) || (mails.length === 1 ? mails[0] : null);
  const note = Number(r?.note) > 0 && Number(r.note) <= 10 ? Number(r.note) : ecrit.note;
  return {
    nom: String(r?.nom || '').trim() || nom,
    poste: String(r?.poste || '').trim() || null,
    telephone,
    email,
    note: note || null,
    nb_avis: Number(r?.nb_avis) > 0 ? Math.round(Number(r.nb_avis)) : ecrit.nb_avis || null,
    specialite: String(r?.specialite || '').trim().slice(0, 120) || null,
    secteur: String(r?.secteur || '').trim().slice(0, 160) || null,
    biens: (r?.biens || []).map((b) => bienPropre(b, url)).filter(Boolean).slice(0, MAX_BIENS),
    page: url,
  };
}

/** Pure : les personnes d'une page équipe, contrôlées par ce qu'elle écrit (numéro et mail présents sur la page). */
export function equipeDeLaPage(r, ecrit, { url, standard = null }) {
  const chiffres = (ecrit.texte || '').replace(/\D/g, '');
  const std = numero(standard);
  const bas = (ecrit.texte || '').toLowerCase();
  const vus = new Set();
  return (r?.personnes || []).map((x) => {
    const nom = String(x?.nom || '').trim();
    if (!nom || nom.split(/\s+/).length < 2 || nom.length > 60 || /^\S+\s+\p{L}\.?$/u.test(nom)) return null;
    const k = nom.toLowerCase();
    if (vus.has(k)) return null;
    vus.add(k);
    const n = numero(x.telephone);
    const e = String(x.email || '').trim().toLowerCase();
    let page = null;
    try { page = x.page ? new URL(x.page, url).href : null; } catch { page = null; }
    return {
      nom,
      fonction: String(x.poste || '').trim() || null,
      telephone: n && n !== std && (ecrit.tels.includes(n) || chiffres.includes(n.replace(/\D/g, ''))) ? n : null,
      email: e && (ecrit.mails.includes(e) || bas.includes(e)) ? e : null,
      page: page && page.replace(/\/$/, '') !== String(url).replace(/\/$/, '') ? page : null,
    };
  }).filter(Boolean);
}

/** Pure : les personnes de l'agence, la personne lue rangée dedans (un nom déjà connu prend ce que la page dit d'elle). */
export function rangerDansLesAgents(agents, p, { source, nomDonne = null }) {
  const out = (agents || []).map((x) => ({ ...x }));
  const y = out.find((z) => z.nom && (memePersonne(z.nom, p.nom) || (nomDonne && memePersonne(z.nom, nomDonne))));
  const lu = Object.fromEntries(Object.entries({
    fonction: p.fonction || p.poste || null, telephone: p.telephone, email: p.email, page: p.page, note: p.note, nb_avis: p.nb_avis,
    specialite: p.specialite, secteur: p.secteur, biens_page: p.biens?.length ? p.biens : null, page_lue_le: p.page_lue_le || null,
  }).filter(([, v]) => v != null && v !== ''));
  if (y) {
    // La page de la personne fait foi (c'est l'équipe qui l'a donnée) ; une page équipe ne remplit que ce qui manque.
    const fort = source === 'page du conseiller';
    for (const [k, v] of Object.entries(lu)) if (fort || y[k] == null || y[k] === '') y[k] = v;
    if (fort && p.nom && p.nom.split(/\s+/).length >= 2 && p.nom.length > String(y.nom).length) y.nom = p.nom;
  } else out.push({ nom: p.nom, ...lu, source });
  return out;
}

/**
 * Pure : la partie du texte que lit le modèle (au plus 30 000 caractères). Une page équipe met souvent ses noms loin
 * après l'accueil, les services et le quartier (28 nov. 2026 : Century 21 Indarra, l'équipe au 18 000e caractère) : la
 * lecture part du titre de l'équipe ; la page d'une personne, de son nom.
 */
export function fenetre(texte, nom = null, max = 30000) {
  const t = String(texte || '');
  if (t.length <= max) return t;
  const bas = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nomFamille = String(nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/).filter((m) => m.length >= 3).pop();
  const i = nom && nomFamille ? bas.indexOf(nomFamille) : bas.search(/notre equipe|nos equipes|l'equipe|equipe de l'agence|nos conseillers|nos collaborateurs|nos agents|notre team|our team|team\b/);
  const debut = i > 0 ? Math.max(0, i - 800) : 0;
  return t.slice(debut, debut + max);
}

const EN_COURS = new Map();

/**
 * Lit la page donnée et range ce qu'elle dit sur l'agence. `nom` : la personne dont c'est la page ; sans nom, c'est la
 * page équipe de l'agence. Rend { ok, personne } ou { ok, personnes }, ou { ok: false, error }.
 */
export function lirePageDonnee(agenceId, { url, nom = null, lire = fetch, lireModele = null } = {}) {
  let adresse;
  try { adresse = new URL(/^https?:\/\//i.test(String(url || '').trim()) ? String(url).trim() : `https://${String(url || '').trim()}`); } catch { return Promise.resolve({ ok: false, error: 'Ce lien n\'est pas une adresse web.' }); }
  if (!/^https?:$/.test(adresse.protocol) || !adresse.hostname.includes('.')) return Promise.resolve({ ok: false, error: 'Ce lien n\'est pas une adresse web.' });
  const cle = `${agenceId}|${adresse.href}|${nom || ''}`;
  if (EN_COURS.has(cle)) return EN_COURS.get(cle);
  const p = (async () => {
    const a = Records.get(AGENCE, agenceId);
    if (!a) return { ok: false, error: 'Agence introuvable.' };
    let html, finale = adresse.href;
    try {
      const r = await lire(adresse.href, { headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'fr-FR,fr;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { ok: false, error: `La page ne s'ouvre pas (erreur ${r.status}).` };
      if (!String(r.headers.get('content-type') || '').includes('html')) return { ok: false, error: 'Ce lien ne mène pas à une page web.' };
      html = (await r.text()).slice(0, 1_500_000);
      finale = r.url || finale;
    } catch (e) {
      return { ok: false, error: `La page ne s'ouvre pas (${e?.name === 'TimeoutError' ? 'trop lente' : 'injoignable'}).` };
    }
    const ecrit = ceQueLaPageEcrit(html);
    ecrit.texte = texteDe(ecrit.html);
    if (ecrit.texte.length < 200) return { ok: false, error: 'La page est vide sans navigateur : elle ne se lit pas ainsi.' };
    const prompt = consignePage({ nom, agence: a.nom, url: finale, texte: fenetre(ecrit.texte, nom), liens: liensDe(ecrit.html, finale, nom ? 80 : 150) });
    let r;
    if (lireModele) r = await lireModele(prompt);
    else {
      const { invokeLLM } = await import('../llm.js');
      const { mesurer } = await import('../llm-couts.js');
      r = (await mesurer({ operation: 'lire une page donnée (personne ou équipe)', sur: agenceId }, () => invokeLLM({ prompt, response_json_schema: SCHEMA_PERSONNE, modele: MODELE_RAPIDE, max_tokens: 8000 }))).resultat;
    }
    const le = new Date().toISOString();
    const frais = Records.get(AGENCE, agenceId) || a;
    if (nom) {
      const personne = { ...profilDeLaPage(r, ecrit, { nom, url: finale, standard: a.telephone }), page_lue_le: le };
      Records.update(AGENCE, agenceId, { agents: rangerDansLesAgents(frais.agents, personne, { source: 'page du conseiller', nomDonne: nom }) });
      return { ok: true, personne };
    }
    const personnes = equipeDeLaPage(r, ecrit, { url: finale, standard: a.telephone });
    let agents = frais.agents || [];
    for (const x of personnes) agents = rangerDansLesAgents(agents, x, { source: 'page équipe du site' });
    Records.update(AGENCE, agenceId, { agents, page_equipe_donnee: { url: finale, le, personnes: personnes.length }, pages_lues: [...new Set([...(frais.pages_lues || []), finale])] });
    return { ok: true, personnes };
  })().finally(() => EN_COURS.delete(cle));
  EN_COURS.set(cle, p);
  return p;
}
