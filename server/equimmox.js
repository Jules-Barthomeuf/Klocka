// Equimmox, « Analyse de loyer » : la fourchette de loyer au m² autour d'une
// adresse, pour des locaux de surface comparable.
//
// Equimmox est une application Bubble : ses échanges internes sont opaques et
// liés à la version de l'application, on ne peut pas les rejouer en HTTP comme
// avec Data-B. Klocka pilote donc un vrai navigateur, sans écran, et refait le
// parcours que l'équipe suivait à la main : Analyse → Analyse de loyer →
// l'adresse, la suggestion, le rayon à 500 m, la surface à ±30 %, Lancer, puis
// lire Bas, Moyenne et Haut.
//
// Le compte de service est dans .env (EQUIMMOX_EMAIL, EQUIMMOX_MOT_DE_PASSE).
// La session est gardée sur disque entre deux recherches : on ne se
// reconnecte que quand elle a expiré. Chaque résultat est gardé trente jours
// par adresse et surface : une recherche coûte du temps et sollicite leur
// service, on ne la refait que sur ordre.

import fs from 'fs';
import path from 'path';
import { Records, DATA_DIR } from './db.js';
import { resoudreAdresse } from './data-b.js';

const EMAIL = (process.env.EQUIMMOX_EMAIL || '').trim();
const MDP = (process.env.EQUIMMOX_MOT_DE_PASSE || '').trim();
export const equimmoxConfigure = () => !!(EMAIL && MDP);

// Le navigateur : celui de Playwright s'il est installé, sinon CHROMIUM_PATH.
const CHROMIUM = (process.env.CHROMIUM_PATH || '').trim() || undefined;
const SESSION = path.join(DATA_DIR, 'equimmox-session.json');
const CACHE_JOURS = 30;
const RAYON_METRES = 500;
const ECART_SURFACE = 0.3;

const cleCache = (adresse, surface) => `${String(adresse).toLowerCase().replace(/\s+/g, ' ').trim()}|${surface || 0}`;

const nombre = (s) => {
  const n = Number(String(s || '').replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** « Bas : 165€/an/m² » → 165. */
function lireLigne(lignes, motif) {
  const l = lignes.find((x) => motif.test(x));
  if (!l) return null;
  const m = l.match(/:\s*([\d\s.,]+)\s*€/);
  return m ? nombre(m[1]) : null;
}

let navigateur = null;
async function lancerNavigateur() {
  const { chromium } = await import('playwright-core');
  if (navigateur && navigateur.isConnected()) return navigateur;
  navigateur = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  return navigateur;
}

const texteDe = async (p) => (await p.evaluate(() => document.body.innerText)).split('\n').map((l) => l.trim()).filter(Boolean);
const cliquerTexte = async (p, motif, delai = 2000) => {
  const el = p.locator(`text=${motif}`).first();
  if (!(await el.isVisible().catch(() => false))) return false;
  await el.click({ force: true });
  await p.waitForTimeout(delai);
  return true;
};

async function seConnecter(p) {
  await p.goto('https://app.equimmox.com/connexion', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(3000);
  const email = p.locator('input[type="email"]').first();
  const mdp = p.locator('input[type="password"]').first();
  if (!(await email.isVisible().catch(() => false))) return; // déjà connecté
  await email.fill(EMAIL);
  await mdp.fill(MDP);
  await mdp.press('Enter');
  await p.waitForURL((u) => !/connexion/.test(u.pathname), { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(3000);
  if (/connexion/.test(p.url())) throw new Error('Connexion à Equimmox refusée : vérifiez le compte dans .env.');
}

/**
 * La fourchette de loyer autour d'une adresse, d'après Equimmox.
 * @param {string} adresse - « 9 rue Gazan, 06130 Grasse »
 * @param {{surface?: number, forcer?: boolean, user?: object}} opts - la surface
 *   du local en m² (la recherche porte sur ±30 % autour) ; `forcer` ignore le cache
 */
export async function analyseLoyer(adresse, { surface = null, forcer = false, user = null } = {}) {
  if (!equimmoxConfigure()) return { ok: false, error: 'Equimmox n\'est pas configuré : EQUIMMOX_EMAIL et EQUIMMOX_MOT_DE_PASSE manquent dans .env.' };
  const texteAdresse = String(adresse || '').trim();
  if (texteAdresse.length < 4) return { ok: false, error: 'Adresse trop courte.' };
  const s = Number(surface) > 0 ? Math.round(Number(surface)) : null;
  const cle = cleCache(texteAdresse, s);
  if (!forcer) {
    const recent = Records.filter('EquimmoxRecherche', { cle })
      .filter((r) => Date.now() - Date.parse(r.le) < CACHE_JOURS * 86400000)
      .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, resultat: { ...recent.resultat, du_cache: true } };
  }

  const b = await lancerNavigateur();
  const ctx = await b.newContext({
    viewport: { width: 1400, height: 950 },
    locale: 'fr-FR',
    ...(fs.existsSync(SESSION) ? { storageState: SESSION } : {}),
  });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept().catch(() => {}));
  try {
    await p.goto('https://app.equimmox.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(4000);
    if (/connexion/.test(p.url())) {
      await seConnecter(p);
      await p.goto('https://app.equimmox.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(4000);
    }
    // Les avertissements d'entrée, s'ils se présentent.
    await cliquerTexte(p, 'Continuer quand même', 1200);
    await cliquerTexte(p, 'Je comprends', 1200);

    // Analyse → Analyse de loyer, et la question « Quitter cette page ».
    if (!(await cliquerTexte(p, 'Analyse', 2500))) throw new Error('Equimmox : le menu Analyse est introuvable.');
    if (!(await cliquerTexte(p, 'Analyse de loyer', 3000))) throw new Error('Equimmox : « Analyse de loyer » est introuvable (plan Premium ?).');
    await cliquerTexte(p, 'Quitter cette page', 2000);
    await cliquerTexte(p, 'Commerce', 800);

    // L'adresse, tapée comme l'équipe la tape : « 9 Rue Gazan, Grasse ». Un
    // code postal dans la saisie laisse leur autocomplétion muette. La Base
    // Adresse Nationale la remet dans ce format ; à défaut, on tape tel quel.
    const ban = await resoudreAdresse(texteAdresse).catch(() => null);
    const saisie = ban ? `${ban.numero ? ban.numero + ' ' : ''}${ban.rue}, ${ban.ville}`.trim() : texteAdresse.replace(/\b\d{5}\b\s*/g, '');
    const champ = p.locator('#address-search');
    await champ.waitFor({ state: 'visible', timeout: 15000 });
    await champ.click();
    await champ.fill('');
    await champ.type(saisie, { delay: 60 });
    // La suggestion est un « .result-name » ; on lui laisse jusqu'à dix
    // secondes, puis on prend celle qui porte le nom de la rue, la première sinon.
    await p.locator('.result-name').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(800);
    const motRue = (ban?.rue || saisie.split(',')[0]).replace(/^\d+\s*(bis|ter)?\s*/i, '').trim().split(/\s+/).slice(-1)[0];
    const motif = new RegExp(motRue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    let suggestion = p.locator('.result-name').filter({ hasText: motif }).first();
    if (!(await suggestion.isVisible().catch(() => false))) suggestion = p.locator('.result-name').first();
    if (!(await suggestion.isVisible().catch(() => false))) throw new Error(`Equimmox ne propose aucune adresse pour « ${saisie} ».`);
    await suggestion.click({ force: true, timeout: 10000 });
    await p.waitForTimeout(3000);

    // Le rayon : le curseur n'existe qu'une fois l'adresse choisie.
    const curseur = p.locator('input[type="range"]').first();
    await curseur.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { throw new Error('Equimmox : l\'adresse n\'a pas été reconnue (pas de curseur de rayon).'); });
    const rayonLu = await reglerRayon(p, curseur, RAYON_METRES);
    if (!rayonLu) throw new Error(`Equimmox : impossible de régler le rayon à ${RAYON_METRES} m.`);

    // La surface : ±30 % autour de celle du local.
    if (s) {
      const min = p.locator('input[placeholder="m² min."]').first();
      const max = p.locator('input[placeholder="m² max."]').first();
      await min.click(); await min.fill(String(Math.round(s * (1 - ECART_SURFACE)))); await min.press('Tab');
      await max.click(); await max.fill(String(Math.round(s * (1 + ECART_SURFACE)))); await max.press('Tab');
      await p.waitForTimeout(600);
    }

    await p.locator('button, div, a').filter({ hasText: /^Lancer$/ }).first().click({ force: true, timeout: 10000 });
    // Les chiffres arrivent quand « Bas : » apparaît.
    await p.locator('text=/^Bas\\s*:/').first().waitFor({ state: 'visible', timeout: 45000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const lignes = await texteDe(p);
    const bas = lireLigne(lignes, /^Bas\s*:/i);
    const moyenne = lireLigne(lignes, /^Moyenne\s*:/i);
    const haut = lireLigne(lignes, /^Haut\s*:/i);
    if (bas == null && moyenne == null && haut == null) throw new Error('Equimmox n\'a rendu aucune fourchette pour cette adresse.');
    const delai = lignes.find((l) => /^\d+\s*jours$/i.test(l));


    const resultat = {
      source: 'Equimmox · Analyse de loyer',
      unite: '€ / m² / an',
      adresse: ban?.label || texteAdresse,
      surface: s,
      surface_min: s ? Math.round(s * (1 - ECART_SURFACE)) : null,
      surface_max: s ? Math.round(s * (1 + ECART_SURFACE)) : null,
      rayon: rayonLu.replace(/^\+\s*/, ''),
      classe: 'Commerce',
      bas, moyenne, haut,
      delai_jours: delai ? nombre(delai) : null,
      le: new Date().toISOString(),
      par: user?.email || null,
    };
    await ctx.storageState({ path: SESSION }).catch(() => {});
    Records.create('EquimmoxRecherche', { cle, adresse: texteAdresse, surface: s, resultat, le: resultat.le, par: resultat.par });
    console.log(`[equimmox] analyse de loyer lue pour « ${texteAdresse} »${s ? ` (${s} m²)` : ''}${user?.email ? ` (${user.email})` : ''}`);
    return { ok: true, resultat };
  } catch (e) {
    return { ok: false, error: e?.message || 'Equimmox n\'a pas répondu.' };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// Le curseur de rayon a neuf crans ; leur valeur en mètres se lit dans le
// libellé affiché à côté. On avance cran par cran jusqu'au libellé voulu.
async function reglerRayon(p, curseur, metres) {
  const voulu = metres >= 1000 ? `${metres / 1000}km` : `${metres}m`;
  const poser = (v) => curseur.evaluate((el, val) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(v));
  const min = Number(await curseur.getAttribute('min')) || 1;
  const max = Number(await curseur.getAttribute('max')) || 9;
  for (let v = min; v <= max; v++) {
    await poser(v);
    await p.waitForTimeout(500);
    const libelle = (await texteDe(p)).find((l) => /^\+?\s*\d+([.,]\d+)?\s*(m|km)$/i.test(l));
    if (libelle && libelle.replace(/[+\s]/g, '').toLowerCase() === voulu) return libelle;
  }
  return null;
}
