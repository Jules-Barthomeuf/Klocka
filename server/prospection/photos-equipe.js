// Les photos des personnes d'une agence (17 nov. 2026, Jules : « mets le nom complet et la photo de la personne »), lues
// sur la page équipe du site de l'agence, gratuitement et sans IA. Une photo va à une personne quand son nom est écrit
// dans l'image (alt, title, nom du fichier), sinon quand c'est la dernière image avant son nom sur la page, sans autre
// nom entre les deux. Les logos et icônes sont écartés. Gardées 30 jours sur l'agence (`photos_equipe`).

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
