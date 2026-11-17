// Les photos des personnes d'une agence (17 nov. 2026, Jules : « mets le nom complet et la photo de la personne »), lues
// sur la page équipe du site de l'agence, gratuitement et sans IA. Une photo va à une personne quand son nom est écrit
// dans l'image (alt, title, nom du fichier), sinon quand c'est la dernière image avant son nom sur la page, sans autre
// nom entre les deux. Les logos et icônes sont écartés. Gardées 30 jours sur l'agence (`photos_equipe`).

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Records } from '../db.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const EQUIPE = /(equipe|équipe|team|nos-?conseillers|nos-?agents|nos-?collaborateurs|conseillers|collaborateurs|negociateurs|trombi|qui-sommes|a-propos|about)/i;
const PAS_PHOTO = /(logo|icon|picto|sprite|favicon|banner|banniere|bandeau|placeholder|avatar-default|blank|pixel|\.svg)/i;
const GARDE_MS = 30 * 86400000;

/** Pure : le nom ramené à sa forme de clé (minuscules, sans accents, mots séparés par une espace). */
export const cleNom = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/** Pure : les pages équipe parmi les pages lues d'un site (au plus deux). */
export function pagesEquipe(pages = []) {
  return [...new Set((pages || []).map(String).filter((u) => /^https?:\/\//.test(u) && EQUIPE.test(u)))]
    .sort((a, b) => Number(/qui-sommes|a-propos|about/i.test(a)) - Number(/qui-sommes|a-propos|about/i.test(b))).slice(0, 2);
}

/**
 * Pure : les photos d'une page pour les noms donnés. Rend { cleNom: url }.
 * @param {string} html @param {string[]} noms @param {string} base l'adresse de la page (pour les liens relatifs)
 */
export function photosDansHtml(html, noms, base, { proximite = true } = {}) {
  const h = String(html || '');
  const abs = (src) => { try { return new URL(src.replace(/&amp;/g, '&'), base).href; } catch { return null; } };
  const images = [...h.matchAll(/<img\b[^>]*>/gi)].map((m) => {
    const tag = m[0];
    const attr = (k) => tag.match(new RegExp(`\\b${k}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] || '';
    const src = attr('data-src') || attr('data-lazy-src') || attr('src') || (attr('srcset').split(/\s+/)[0] || '');
    return { i: m.index, src: src && !/^data:/.test(src) ? abs(src) : null, texte: cleNom(`${attr('alt')} ${attr('title')} ${decodeURIComponent(src.split('/').pop() || '').replace(/[-_.]/g, ' ')}`) };
  }).filter((x) => x.src && !PAS_PHOTO.test(x.src));
  const cles = [...new Set((noms || []).map(cleNom).filter((n) => n.split(' ').length >= 2))];
  // Le texte de la page aux mêmes positions que le HTML : balises en espaces, lettres sans accents, le reste en espaces.
  const plat = Array.from(h.replace(/<[^>]+>/g, (t) => ' '.repeat(t.length)), (c) => {
    const l = c.normalize('NFD')[0].toLowerCase();
    return /[a-z]/.test(l) ? l : ' '.repeat(c.length);
  }).join('');
  const out = {}; const prises = new Set();
  // 1. Le nom écrit dans l'image.
  for (const n of cles) {
    const mots = n.split(' ');
    const img = images.find((x) => !prises.has(x.src) && mots.every((m) => x.texte.includes(m)));
    if (img) { out[n] = img.src; prises.add(img.src); }
  }
  // 2. La dernière image avant le nom, à moins de 2 000 caractères, sans autre nom entre les deux. Sur une page d'équipe
  // seulement : ailleurs (un article, des avis), l'image d'avant le nom est souvent celle d'un bien.
  for (const n of proximite ? cles.filter((x) => !out[x]) : []) {
    const re = new RegExp(`\\b${n.split(' ').join('\\s+')}\\b`);
    const m = plat.match(re);
    if (!m) continue;
    const pos = m.index;
    const avant = images.filter((x) => x.i < pos && pos - x.i < 2000 && !prises.has(x.src)).pop();
    if (!avant) continue;
    const entre = plat.slice(avant.i, pos);
    if (cles.some((o) => o !== n && new RegExp(o.split(' ').join('\\s+')).test(entre))) continue;
    out[n] = avant.src; prises.add(avant.src);
  }
  return out;
}

/**
 * Les photos de l'équipe d'une agence, pour les noms donnés (ceux du site, de l'équipe Apollo une fois rapprochés).
 * Rend { cleNom: url } ; gardé 30 jours, relu si de nouveaux noms arrivent.
 */
export async function photosDeLAgence(agence, noms = [], { lire = fetch } = {}) {
  if (!agence) return {};
  const voulus = [...new Set((noms || []).map(cleNom).filter((n) => n.split(' ').length >= 2))];
  const garde = agence.photos_equipe;
  if (garde && Date.now() - Date.parse(garde.le) < GARDE_MS && voulus.every((n) => n in (garde.vus || {}))) return garde.par_nom || {};
  const pages = pagesEquipe(agence.pages_lues || []);
  const par_nom = { ...(garde?.par_nom || {}) };
  for (const url of pages) {
    try {
      const r = await lire(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      Object.assign(par_nom, photosDansHtml((await r.text()).slice(0, 800000), voulus.filter((n) => !par_nom[n]), r.url || url));
    } catch { /* page illisible : les initiales restent */ }
  }
  const vus = Object.fromEntries(voulus.map((n) => [n, !!par_nom[n]]));
  // Les photos trouvées sur internet restent (chercherPhotosWeb) : relire la page équipe ne les efface pas.
  const avant = agence.id ? Records.get('AgenceProspect', agence.id)?.photos_equipe : null;
  if (agence.id) Records.update('AgenceProspect', agence.id, { photos_equipe: { ...(avant || {}), le: new Date().toISOString(), par_nom: { ...(avant?.par_nom || {}), ...par_nom }, vus } });
  return par_nom;
}

// --- Les photos cherchées sur internet (17 nov. 2026) ----------------------------------------------------------------
// Jules : « je veux voir les photos des gens : tu vas sur internet, tu tapes leur nom et tu mets la photo ». Pour les
// personnes sans photo sur la page équipe : une recherche web, une seule par agence, donne pour chacune une page qui la
// présente (sa fiche de conseiller sur le site d'un réseau, un annuaire, un article) ; on y prend son portrait (l'image
// dont le texte porte son nom, sinon l'image de partage de la page) seulement si la page écrit son nom complet. Une
// photo douteuse vaut moins que les initiales : rien n'est pris sans ce nom.

/** Pure : les adresses rendues par la recherche, rangées par numéro de personne (« 2. https://… »). */
export function adressesParPersonne(texte, n) {
  const out = Array.from({ length: n }, () => []);
  for (const ligne of String(texte || '').split(/\n+/)) {
    const m = ligne.match(/^\s*(\d+)[.)]\s*(.*)$/);
    if (!m) continue;
    const i = Number(m[1]) - 1;
    if (i < 0 || i >= n) continue;
    for (const u of m[2].match(/https?:\/\/[^\s)\]>»"',]+/g) || []) out[i].push(u.replace(/[.;:]+$/, ''));
  }
  return out.map((l) => [...new Set(l)].slice(0, 3));
}

/** Pure : le portrait d'une personne sur une page qui la présente, ou null si la page n'écrit pas son nom. */
export function portraitDeLaPage(html, nom, base) {
  const h = String(html || '');
  const cle = cleNom(nom);
  const mots = cle.split(' ').filter((m) => m.length > 1);
  if (mots.length < 2) return null;
  const texte = cleNom(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
  if (!mots.every((m) => texte.includes(m))) return null;
  const parNom = photosDansHtml(h, [nom], base, { proximite: false })[cle];
  if (parNom) return parNom;
  const og = h.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] || h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
  if (!og || PAS_PHOTO.test(og)) return null;
  // L'image de partage n'est un portrait que sur la page de la personne : son nom dans le titre ET dans l'adresse de la
  // page (« /equipe/maxime-douce », « /conseiller/maxime-douce »). Un article ou une réalisation qui la cite a pour
  // image de partage la photo d'un bien (17 nov. 2026, Luckymmo).
  const titre = cleNom(h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  let chemin = '';
  try { chemin = cleNom(decodeURIComponent(new URL(base).pathname)); } catch { chemin = ''; }
  if (!mots.every((m) => titre.includes(m)) || !mots.slice(-1).every((m) => chemin.includes(m))) return null;
  try { return new URL(og, base).href; } catch { return null; }
}

const PHOTOS_WEB = new Map();

/**
 * Les photos des personnes de l'agence qui n'en ont pas, cherchées sur internet ; posées dans `photos_equipe.par_nom`.
 * Une seule recherche par agence à la fois, une seule fois (`photos_web_le`). `personnes` : [{ nom, poste }].
 */
export function chercherPhotosWeb(agenceId, personnes, { lire = fetch } = {}) {
  if (PHOTOS_WEB.has(agenceId)) return PHOTOS_WEB.get(agenceId);
  const p = (async () => {
    const a = Records.get('AgenceProspect', agenceId);
    if (!a || a.photos_equipe?.photos_web_le) return;
    const deja = a.photos_equipe?.par_nom || {};
    const sans = (personnes || []).filter((x) => x?.nom && cleNom(x.nom).split(' ').length >= 2 && !deja[cleNom(x.nom)]).slice(0, 10);
    const trouvees = {};
    if (sans.length && !process.env.NODE_TEST_CONTEXT) {
      try {
        const { invokeLLMGrounded } = await import('../llm.js');
        const liste = sans.map((x, i) => `${i + 1}. ${x.nom}${x.poste ? `, ${x.poste}` : ''}`).join('\n');
        const r = await invokeLLMGrounded({ via: 'anthropic', prompt: `Ces personnes travaillent à l'agence immobilière « ${a.nom} »${a.ville ? ` à ${a.ville}` : ''}${a.site ? ` (site ${a.site})` : ''}. Pour chacune, trouve une ou deux pages web publiques qui la présentent avec sa photo : sa fiche de conseiller sur le site de l'agence ou de son réseau (iad, Capifrance, Century 21, Orpi…), un annuaire professionnel, un article. Évite LinkedIn et Facebook (pages fermées).\n${liste}\n\nRéponds seulement par des lignes numérotées « 1. https://… https://… », une par personne, dans le même ordre ; « 1. aucune » si tu ne trouves pas.` });
        const adresses = adressesParPersonne(r?.final || r?.text, sans.length);
        await Promise.all(sans.map(async (x, i) => {
          for (const url of adresses[i]) {
            if (/linkedin\.com|facebook\.com|instagram\.com/i.test(url)) continue;
            try {
              const rep = await lire(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
              if (!rep.ok) continue;
              const photo = portraitDeLaPage((await rep.text()).slice(0, 800000), x.nom, rep.url || url);
              if (photo) { trouvees[cleNom(x.nom)] = photo; break; }
            } catch { /* page illisible : la suivante */ }
          }
        }));
      } catch (e) { console.warn(`[photos web] ${a.nom} : ${e?.message || e}`); }
    }
    const frais = Records.get('AgenceProspect', agenceId) || a;
    const pe = frais.photos_equipe || { le: new Date().toISOString(), par_nom: {}, vus: {} };
    Records.update('AgenceProspect', agenceId, { photos_equipe: { ...pe, par_nom: { ...(pe.par_nom || {}), ...trouvees }, photos_web_le: new Date().toISOString(), photos_web: Object.keys(trouvees) } });
  })().finally(() => PHOTOS_WEB.delete(agenceId));
  PHOTOS_WEB.set(agenceId, p);
  return p;
}

// --- Google Images par SerpAPI (17 nov. 2026) ---------------------------------------------------------------------
// Jules : « parfois on n'a pas les sites, mais tu peux chercher les noms et trouver leurs têtes ; moi je trouve tout le
// temps la tête des gens sur Google ». Pour chaque personne sans photo : « Prénom Nom agence ville » dans Google Images
// (SerpAPI, SERPAPI_KEY) ; on garde l'image dont le titre porte son prénom et son nom, le profil LinkedIn d'abord (une
// photo de profil), sinon une page qui la présente ; ni vidéo ni publication de réseau social. L'image est copiée chez
// nous (les liens LinkedIn expirent) et servie par /uploads, réservé aux connectés. Une recherche par personne, une fois.


// Les annuaires d'entreprises (une fiche, pas un visage), les salons et événements (une bannière).
const PAS_PORTRAIT = /(societe\.com|pappers|infogreffe|verif\.com|manageo|annuaire-entreprises|societeinfo|dirigeant\.|bodacc|figaro-?entreprises|kompass|summit|salon|event)/i;

/**
 * Pure : les images d'une recherche Google Images qui peuvent être la tête de cette personne, de la plus sûre à la moins
 * sûre : son titre porte son prénom et son nom ; ni vidéo, ni publication, ni annuaire d'entreprises, ni bannière trop
 * large ; le profil LinkedIn d'abord (une photo de profil).
 */
export function imagesCandidates(resultats, nom) {
  const mots = cleNom(nom).split(' ').filter((m) => m.length > 1);
  if (mots.length < 2) return [];
  const candidats = (resultats || []).filter((x) => {
    const lien = String(x.link || '');
    const t = cleNom(`${x.title || ''} ${decodeURIComponent(lien)}`);
    if (!mots.every((m) => t.includes(m))) return false;
    // Une vidéo, un reel, une publication : l'image est une vignette, pas un portrait.
    if (/\/(videos?|reel|reels|posts?|watch|p)\//i.test(lien) || /youtube|tiktok/i.test(lien)) return false;
    if (PAS_PORTRAIT.test(`${lien} ${x.source || ''} ${x.title || ''}`)) return false;
    const l = Number(x.original_width) || 0; const h = Number(x.original_height) || 0;
    if (l && h && (l / h > 1.4 || l / h < 0.55)) return false;
    return !!(x.original || x.thumbnail);
  });
  const profil = candidats.filter((x) => /linkedin\.com\/in\//i.test(String(x.link || '')));
  return [...profil, ...candidats.filter((x) => !profil.includes(x) && !/facebook|instagram/i.test(String(x.link || '')))].slice(0, 3);
}

/** Pure : la meilleure image, ou null (la première candidate). */
export const meilleureImage = (resultats, nom) => imagesCandidates(resultats, nom)[0] || null;

/** Une image est-elle le portrait d'une personne ? Le modèle regarde la vignette ; un doute vaut non. */
async function estUnPortrait(url, lire) {
  try {
    const r = await lire(url, { headers: { 'user-agent': UA, accept: 'image/*' }, signal: AbortSignal.timeout(8000) });
    const type = String(r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) return false;
    const buffer = Buffer.from(await r.arrayBuffer());
    const { generateFromDocument } = await import('../llm.js');
    const { mesurer } = await import('../llm-couts.js');
    const { resultat } = await mesurer({ operation: 'tête trouvée sur Google Images' }, () => generateFromDocument({ buffer, mimetype: type, nom: 'image', prompt: "Cette image est-elle le portrait d'une seule personne (photo ou dessin, visage bien visible) ? Pas un logo, une bannière, un document, un bâtiment, un groupe. Réponds par OUI ou NON, rien d'autre." }));
    return /^\s*oui/i.test(String(resultat || ''));
  } catch { return false; }
}

async function copierImage(url, lire) {
  const r = await lire(url, { headers: { 'user-agent': UA, accept: 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
  const type = String(r.headers.get('content-type') || '');
  if (!r.ok || !/^image\/(jpeg|png|webp|gif)/.test(type)) return null;
  const octets = Buffer.from(await r.arrayBuffer());
  if (octets.length < 1500 || octets.length > 4_000_000) return null;
  const { CHEMIN_UPLOADS } = await import('../db.js');
  const dossier = path.join(CHEMIN_UPLOADS, 'photos-personnes');
  fs.mkdirSync(dossier, { recursive: true });
  const nom = `${createHash('sha1').update(url).digest('hex').slice(0, 20)}.${type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'}`;
  fs.writeFileSync(path.join(dossier, nom), octets);
  return `/uploads/photos-personnes/${nom}`;
}

export const imagesBranchees = () => !!(process.env.SERPAPI_KEY || '').trim();
const PHOTOS_IMAGES = new Map();

/**
 * Les têtes des personnes sans photo, cherchées dans Google Images (au plus `max` par passage), posées dans
 * `photos_equipe.par_nom` ; chaque personne cherchée est notée dans `photos_equipe.cherches` pour ne pas repayer.
 */
export function chercherPhotosImages(agenceId, personnes, { max = 4, lire = fetch } = {}) {
  if (!imagesBranchees() || process.env.NODE_TEST_CONTEXT) return Promise.resolve();
  if (PHOTOS_IMAGES.has(agenceId)) return PHOTOS_IMAGES.get(agenceId);
  const p = (async () => {
    const a = Records.get('AgenceProspect', agenceId);
    if (!a) return;
    const pe0 = a.photos_equipe || {};
    // Pas un nom court (« Alfredo L. »), ni le nom de l'agence pris pour une personne (« Coast Life »).
    const a_chercher = (personnes || []).filter((x) => x?.nom && cleNom(x.nom).split(' ').length >= 2 && !/\s\p{L}\.$/u.test(x.nom.trim()) && !cleNom(a.nom).includes(cleNom(x.nom)))
      .filter((x) => !(pe0.par_nom || {})[cleNom(x.nom)] && !(pe0.cherches || {})[cleNom(x.nom)]).slice(0, max);
    const trouvees = {}; const cherches = {};
    const ville = a.ville || (a.liste_id && Records.get('ListeAgences', a.liste_id)?.ville) || '';
    await Promise.all(a_chercher.map(async (x) => {
      cherches[cleNom(x.nom)] = new Date().toISOString();
      try {
        const q = [x.nom, String(a.nom || '').replace(/\s*[-–|].*$/, '').slice(0, 40), ville].filter(Boolean).join(' ');
        const r = await lire(`https://serpapi.com/search.json?${new URLSearchParams({ engine: 'google_images', q, hl: 'fr', gl: 'fr', api_key: process.env.SERPAPI_KEY.trim() })}`, { signal: AbortSignal.timeout(20000) });
        const j = await r.json();
        // Les trois meilleures candidates, l'une après l'autre : la première que le modèle voit comme un portrait.
        for (const img of imagesCandidates(j.images_results || [], x.nom)) {
          if (!(await estUnPortrait(img.thumbnail || img.original, lire))) continue;
          const copie = (img.original && await copierImage(img.original, lire).catch(() => null)) || (img.thumbnail && await copierImage(img.thumbnail, lire).catch(() => null));
          if (copie) { trouvees[cleNom(x.nom)] = copie; break; }
        }
      } catch (e) { console.warn(`[google images] ${x.nom} : ${e?.message || e}`); }
    }));
    const frais = Records.get('AgenceProspect', agenceId) || a;
    const pe = frais.photos_equipe || { le: new Date().toISOString(), par_nom: {}, vus: {} };
    Records.update('AgenceProspect', agenceId, { photos_equipe: { ...pe, par_nom: { ...(pe.par_nom || {}), ...trouvees }, cherches: { ...(pe.cherches || {}), ...cherches } } });
  })().finally(() => PHOTOS_IMAGES.delete(agenceId));
  PHOTOS_IMAGES.set(agenceId, p);
  return p;
}
