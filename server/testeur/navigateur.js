// L'agent testeur : le navigateur. Une session Playwright sur le bac à sable,
// avec le cookie du testeur, le thème et la taille d'écran voulus ; ce que la
// page contient (l'inventaire, numéroté pour que l'agent désigne un élément),
// les gestes (cliquer, saisir, choisir, touche, défiler, retour, aller), les
// erreurs qui surviennent (console, exceptions, réseau), les captures.

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { lancerNavigateur } from '../marche/navigateur.js';

export const VUES = { ordi: { width: 1440, height: 1000 }, portable: { width: 1024, height: 760 }, tel: { width: 390, height: 844 } };
// Ce que le navigateur a le droit d'appeler en dehors du bac à sable : la carte, les polices, les CDN du front.
const HOTES_PERMIS = /(^|\.)(googleapis\.com|gstatic\.com|google\.com|cdnjs\.cloudflare\.com|unpkg\.com|jsdelivr\.net|tailwindcss\.com|jquery\.com)$/i;

export const ouvrirNavigateur = () => lancerNavigateur("L'agent testeur");

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Les réglages du bac à sable que la page lit au premier rendu : thème, visites guidées déjà vues. */
const scriptInitial = ({ theme }) => {
  try {
    const brut = localStorage.getItem('klocka-personnalisation');
    const p = brut ? JSON.parse(brut) : {};
    localStorage.setItem('klocka-personnalisation', JSON.stringify({ ...p, theme }));
    for (const k of ['klocka.visite-mode-appel.v1', 'klocka.visite-off-market.v1']) localStorage.setItem(k, '1');
  } catch { /* navigation privée */ }
};

/**
 * Une session : un contexte, une page, les erreurs qu'elle rencontre, les
 * captures dans `dossier`. `vue` : ordi | portable | tel ; `theme` : sombre | clair.
 */
export async function ouvrirSession(navigateur, { base, jeton, vue = 'ordi', theme = 'sombre', id = 'run', dossier, journal = () => {} }) {
  const taille = VUES[vue] || VUES.ordi;
  const contexte = await navigateur.newContext({
    viewport: taille, locale: 'fr-FR', deviceScaleFactor: 1, isMobile: vue === 'tel', hasTouch: vue === 'tel',
    extraHTTPHeaders: { 'X-Agent-Run': id },
  });
  await contexte.addCookies([{ name: 'klocka_session', value: jeton, url: base }]);
  await contexte.addInitScript(scriptInitial, { theme });
  const origine = new URL(base);
  const bloquees = new Map();
  await contexte.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.host === origine.host || HOTES_PERMIS.test(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    bloquees.set(u.hostname, (bloquees.get(u.hostname) || 0) + 1);
    return route.abort();
  });
  await contexte.tracing.start({ screenshots: true, snapshots: true, sources: false }).catch(() => {});
  const page = await contexte.newPage();
  page.setDefaultTimeout(12000);
  const erreurs = [];
  const reseau = [];
  const noter = (e) => { if (erreurs.length < 300) erreurs.push({ le: new Date().toISOString(), ...e }); };
  page.on('pageerror', (e) => noter({ type: 'exception', texte: String(e?.message || e).slice(0, 300) }));
  // Les ressources qui ne chargent pas sont déjà comptées par le réseau (et les hôtes bloqués par le garde-fou ne sont pas des erreurs de la page).
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource/.test(m.text())) noter({ type: m.type() === 'error' ? 'console' : 'avertissement', texte: m.text().slice(0, 300) }); });
  page.on('requestfailed', (r) => { const u = new URL(r.url()); if (u.host === origine.host) noter({ type: 'reseau', texte: `${r.method()} ${u.pathname} : ${r.failure()?.errorText || 'échec'}` }); });
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.host !== origine.host) return;
    const t = r.request().timing?.();
    const duree = t && t.responseEnd > 0 ? Math.round(t.responseEnd) : null;
    if (u.pathname.startsWith('/api/')) reseau.push({ methode: r.request().method(), chemin: u.pathname, statut: r.status(), ms: duree });
    // Une image absente (upload d'un autre jour, devanture sans Street View) est un détail, pas une erreur de la page.
    if (r.status() === 404 && (u.pathname.startsWith('/uploads/') || /\/photo$/.test(u.pathname))) { session.images_manquantes += 1; return; }
    if (r.status() >= 400 && r.status() !== 401) noter({ type: 'http', texte: `${r.request().method()} ${u.pathname} → ${r.status()}` });
  });
  if (dossier) fs.mkdirSync(dossier, { recursive: true });
  let nCaptures = 0;
  let dernierHash = null;

  const session = {
    page, contexte, vue, theme, erreurs, reseau, base, bloquees, images_manquantes: 0,
    async aller(chemin) {
      const url = chemin.startsWith('http') ? chemin : `${base}${chemin.startsWith('/') ? '' : '/'}${chemin}`;
      if (!url.startsWith(base)) throw new Error('Hors du bac à sable.');
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await attendre(1200);
      return { ms: Date.now() - t0 };
    },
    /** Depuis combien le visible a changé : un condensé du texte et des éléments. */
    async empreinte() {
      const t = await page.evaluate(() => `${location.pathname}${location.search}|${document.body.innerText.slice(0, 20000)}|${document.querySelectorAll('button,a,input,select,textarea').length}`).catch(() => '');
      return createHash('sha1').update(t).digest('hex').slice(0, 12);
    },
    /** Une capture PNG si l'écran a changé (ou `forcer`), nommée et rangée. */
    async capturer(nom, { forcer = false, pleine = false } = {}) {
      const h = await session.empreinte();
      if (!forcer && h === dernierHash) return null;
      dernierHash = h;
      if (!dossier || nCaptures >= 60) return null;
      nCaptures += 1;
      const fichier = `${String(nCaptures).padStart(2, '0')}-${vue}-${theme}-${nom.replace(/[^a-z0-9à-ÿ-]+/gi, '-').slice(0, 40)}.png`;
      const chemin = path.join(dossier, fichier);
      await page.screenshot({ path: chemin, fullPage: pleine, animations: 'disabled' }).catch(() => null);
      if (!fs.existsSync(chemin)) return null;
      return { nom, fichier, chemin, vue, theme, url: await page.evaluate(() => location.pathname + location.search).catch(() => null) };
    },
    inventaire: () => inventaire(page, vue),
    agir: (action) => agir(page, action),
    async fermer(traceChemin = null) {
      if (traceChemin) await contexte.tracing.stop({ path: traceChemin }).catch(() => {});
      else await contexte.tracing.stop().catch(() => {});
      await contexte.close().catch(() => {});
    },
  };
  journal(`Session ${vue} ${theme} ouverte.`);
  return session;
}

/**
 * L'inventaire de l'écran : les éléments interactifs numérotés (un attribut
 * data-kt sur chacun, pour les retrouver), les champs, le texte visible, et
 * les défauts qu'on peut mesurer sans modèle (débordements, libellés absents,
 * zones trop petites au doigt, défilement horizontal, contraste faible).
 */
export function inventaire(page, vue = 'ordi') {
  return page.evaluate((vueCourante) => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width >= 2 && r.height >= 2 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < innerHeight * 3; };
    const dialogue = document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]');
    const racine = dialogue || document;
    const texteDe = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ');
    const elements = [];
    let n = 0;
    for (const el of racine.querySelectorAll('button, a[href], [role="button"], [role="menuitem"], [role="tab"], [role="link"], [role="checkbox"], [role="switch"], input, textarea, select, summary, [tabindex]:not([tabindex="-1"])')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      n += 1;
      el.setAttribute('data-kt', String(n));
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || (tag === 'a' ? 'lien' : tag === 'button' ? 'bouton' : ['input', 'textarea', 'select'].includes(tag) ? 'champ' : tag);
      const e = { n, role, tag, texte: texteDe(el).slice(0, 80), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') e.desactive = true;
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        e.type = el.type || tag;
        e.valeur = String(el.value || '').slice(0, 60);
        e.libelle = (el.labels?.[0]?.innerText || el.closest('label')?.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60) || null;
        e.placeholder = el.placeholder || null;
        if (tag === 'select') e.options = [...el.options].slice(0, 12).map((o) => o.text.trim().slice(0, 40));
      }
      if (el.getAttribute('aria-pressed') != null) e.presse = el.getAttribute('aria-pressed') === 'true';
      if (el.getAttribute('aria-expanded') != null) e.ouvert = el.getAttribute('aria-expanded') === 'true';
      if (tag === 'a') e.href = el.getAttribute('href');
      elements.push(e);
      if (elements.length >= 160) break;
    }
    // Les cartes et canevas : pas de bouton dedans, mais on peut y cliquer à une position (cliquer_a).
    for (const el of racine.querySelectorAll('.gm-style, canvas, [data-carte]')) {
      if (!visible(el) || el.closest('.gm-style') !== el && el.tagName !== 'CANVAS') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 120) continue;
      n += 1;
      el.setAttribute('data-kt', String(n));
      elements.push({ n, role: 'carte', tag: el.tagName.toLowerCase(), texte: 'carte ou canevas (cliquer_a avec x, y dans sa zone)', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      if (elements.length >= 170) break;
    }
    // Les défauts mesurables.
    const defauts = [];
    for (const e of elements) {
      if ((e.role === 'bouton' || e.role === 'lien') && !e.texte) defauts.push({ cle: 'sans_nom', n: e.n, texte: `Un ${e.role} sans nom accessible (${e.w}×${e.h} à ${e.x},${e.y})` });
      if (e.role === 'champ' && !e.libelle && !e.placeholder && e.type !== 'checkbox' && e.type !== 'hidden') defauts.push({ cle: 'sans_label', n: e.n, texte: `Un champ ${e.type} sans libellé ni indication` });
      if (vueCourante === 'tel' && (e.role === 'bouton' || e.role === 'lien') && e.w > 0 && (e.w < 36 || e.h < 36)) defauts.push({ cle: 'petite_zone', n: e.n, texte: `« ${e.texte || e.role} » fait ${e.w}×${e.h} px, trop petit au doigt` });
    }
    if (document.documentElement.scrollWidth > innerWidth + 2) defauts.push({ cle: 'defilement_horizontal', texte: `La page déborde horizontalement (${document.documentElement.scrollWidth} px pour ${innerWidth})` });
    let debordants = 0;
    for (const el of document.querySelectorAll('p, span, h1, h2, h3, td, th, li, a, button')) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el);
      if (s.overflow === 'hidden' && s.textOverflow === 'ellipsis') continue; // coupé exprès
      if (el.scrollWidth > el.clientWidth + 4 && s.whiteSpace === 'nowrap') { debordants += 1; if (debordants <= 5) defauts.push({ cle: 'texte_deborde', texte: `Texte qui déborde : « ${(el.innerText || '').trim().slice(0, 50)} »` }); }
    }
    // Le contraste : un calcul simple sur les textes de la page (luminance relative).
    const lum = (rgb) => { const m = rgb.match(/\d+(\.\d+)?/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const fond = (el) => { let e = el; while (e && e !== document.documentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(c) && c !== 'transparent') return c; e = e.parentElement; } return getComputedStyle(document.body).backgroundColor; };
    let faibles = 0;
    for (const el of document.querySelectorAll('p, span, a, button, label, td, li')) {
      if (!visible(el) || !(el.innerText || '').trim() || el.children.length) continue;
      const s = getComputedStyle(el);
      const l1 = lum(s.color); const l2 = lum(fond(el));
      if (l1 == null || l2 == null) continue;
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const grand = parseFloat(s.fontSize) >= 18;
      if (ratio < (grand ? 3 : 4.5)) { faibles += 1; if (faibles <= 4) defauts.push({ cle: 'contraste', texte: `Contraste ${ratio.toFixed(1)} sur « ${el.innerText.trim().slice(0, 40)} »` }); }
    }
    if (faibles > 4) defauts.push({ cle: 'contraste', texte: `${faibles} textes sous le contraste minimal au total` });
    const chargement = document.querySelectorAll('.animate-spin').length;
    return {
      url: location.pathname + location.search,
      titre: document.title,
      dialogue: dialogue ? (dialogue.getAttribute('aria-label') || texteDe(dialogue).slice(0, 80)) : null,
      elements,
      texte: (racine === document ? document.body.innerText : dialogue.innerText).replace(/\s+\n/g, '\n').slice(0, 3500),
      defauts,
      en_chargement: chargement,
      hauteur: document.documentElement.scrollHeight,
    };
  }, vue);
}

/** Un geste sur la page. L'élément est désigné par son numéro d'inventaire. */
export async function agir(page, action) {
  const cible = (n) => page.locator(`[data-kt="${n}"]`).first();
  const t0 = Date.now();
  try {
    switch (action.type) {
      case 'cliquer': {
        const el = cible(action.n);
        if (!(await el.count())) return { ok: false, erreur: `Élément ${action.n} introuvable (l'écran a changé)` };
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await el.click({ timeout: 8000 });
        break;
      }
      case 'saisir': {
        const el = cible(action.n);
        if (!(await el.count())) return { ok: false, erreur: `Champ ${action.n} introuvable` };
        await el.click({ timeout: 5000 }).catch(() => {});
        await el.fill(String(action.valeur ?? ''), { timeout: 8000 });
        if (action.entree) await el.press('Enter');
        break;
      }
      case 'choisir': {
        const el = cible(action.n);
        if (!(await el.count())) return { ok: false, erreur: `Liste ${action.n} introuvable` };
        await el.selectOption({ label: String(action.valeur) }, { timeout: 8000 }).catch(() => el.selectOption(String(action.valeur)));
        break;
      }
      case 'cliquer_a': await page.mouse.click(Number(action.x) || 0, Number(action.y) || 0); break;
      case 'double_cliquer_a': await page.mouse.dblclick(Number(action.x) || 0, Number(action.y) || 0); break;
      case 'touche': await page.keyboard.press(action.touche || 'Escape'); break;
      case 'defiler': await page.mouse.wheel(0, action.direction === 'haut' ? -700 : 700); break;
      case 'retour': await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}); break;
      case 'attendre': await new Promise((r) => setTimeout(r, Math.min(5000, Number(action.ms) || 1500))); break;
      case 'survoler': { const el = cible(action.n); if (await el.count()) await el.hover({ timeout: 5000 }); break; }
      default: return { ok: false, erreur: `Geste inconnu : ${action.type}` };
    }
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 700));
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, erreur: String(e?.message || e).split('\n')[0].slice(0, 200), ms: Date.now() - t0 };
  }
}

/** Le clavier : Tab plusieurs fois, et où va le focus (perdu, invisible, hors écran). */
export async function parcoursClavier(page, pas = 20) {
  const resultats = [];
  for (let i = 0; i < pas; i += 1) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { perdu: true };
      const rect = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const visible = rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight;
      const anneau = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none';
      return { texte: (el.innerText || el.getAttribute('aria-label') || el.placeholder || el.tagName).trim().slice(0, 40), visible, anneau };
    }).catch(() => ({ perdu: true }));
    resultats.push(r);
  }
  return {
    pas: resultats.length,
    perdus: resultats.filter((r) => r.perdu).length,
    hors_ecran: resultats.filter((r) => !r.perdu && !r.visible).length,
    sans_anneau: resultats.filter((r) => !r.perdu && !r.anneau).length,
    chemin: resultats.filter((r) => !r.perdu).map((r) => r.texte).slice(0, 20),
  };
}
