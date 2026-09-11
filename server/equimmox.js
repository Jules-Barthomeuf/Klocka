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
import { poserChemin } from './chromium.js';
import { ErreurSource } from './marche/erreurs.js';

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

// Un navigateur ailleurs : chez un hébergeur qui ne peut pas faire tourner
// Chromium, EQUIMMOX_CDP_URL désigne un navigateur distant (Browserless et
// consorts) et Klocka s'y connecte au lieu d'en lancer un.
const CDP = (process.env.EQUIMMOX_CDP_URL || '').trim();

let navigateur = null;
async function lancerNavigateur() {
  poserChemin();
  const { chromium } = await import('playwright-core');
  if (navigateur && navigateur.isConnected()) return navigateur;
  if (CDP) {
    navigateur = await chromium.connectOverCDP(CDP, { timeout: 30000 });
    return navigateur;
  }
  try {
    navigateur = await chromium.launch({
      executablePath: CHROMIUM,
      // Un Chromium tient facilement trois cents mégaoctets ; sur une petite
      // machine, c'est ce qui reste au serveur. On lui retire tout ce dont une
      // lecture de page n'a pas besoin.
      args: [
        '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
        '--disable-extensions', '--disable-background-networking',
        '--disable-default-apps', '--mute-audio', '--no-first-run',
        '--js-flags=--max-old-space-size=256',
      ],
    });
  } catch (e) {
    // Le message brut de Playwright parle d'un chemin et d'une commande npx :
    // il n'apprend rien à qui clique sur « Chercher sur Equimmox ».
    if (/Executable doesn't exist|ENOENT/i.test(e?.message || '')) {
      throw new Error(
        "Equimmox a besoin d'un navigateur, et le serveur n'en a pas. " +
        "Installez-le avec « npm run chromium » au déploiement, ou indiquez-en un " +
        "avec CHROMIUM_PATH, ou un navigateur distant avec EQUIMMOX_CDP_URL."
      );
    }
    throw e;
  }
  return navigateur;
}

// Aller sur une page EN REGARDANT ce que le serveur a répondu.
//
// Playwright ne se plaint pas d'un 502 : il rend la page d'erreur de Bubble et
// la suite échoue plus loin, sur un « le menu Analyse est introuvable » qui
// désigne le mauvais coupable. Une panne passagère passait ainsi pour un
// changement d'interface, et n'était jamais réessayée. On lit donc le statut
// tout de suite, et on le porte dans l'erreur : c'est lui qui décide s'il faut
// repasser dans cinq secondes ou prévenir tout de suite.
async function aller(p, url, timeout = 60000) {
  const r = await p.goto(url, { waitUntil: 'domcontentloaded', timeout });
  const statut = r?.status?.() ?? null;
  if (statut != null && statut >= 400) {
    throw new ErreurSource(`Equimmox a répondu ${statut}.`, { service: 'Equimmox', statut });
  }
  return r;
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
  await aller(p, 'https://app.equimmox.com/connexion');
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

  // Le lancement du navigateur fait partie de la recherche : s'il échoue, la
  // page reçoit une phrase, pas une trace de Playwright.
  let ctx = null;
  try {
    const b = await lancerNavigateur();
    ctx = await b.newContext({
      viewport: { width: 1400, height: 950 },
      locale: 'fr-FR',
      ...(fs.existsSync(SESSION) ? { storageState: SESSION } : {}),
    });
    const p = await ctx.newPage();
    p.on('dialog', (d) => d.accept().catch(() => {}));
    await aller(p, 'https://app.equimmox.com');
    await p.waitForTimeout(4000);
    if (/connexion/.test(p.url())) {
      await seConnecter(p);
      await aller(p, 'https://app.equimmox.com');
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
    // Le statut et la classe survivent au passage par `{ok:false}` : c'est
    // d'eux que dépend le réessai, plus loin, dans marche/connecteur.js.
    return {
      ok: false,
      error: e?.message || 'Equimmox n\'a pas répondu.',
      statut: e?.statut ?? null,
      classe: e?.classe ?? null,
    };
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    // Le navigateur ne survit pas à la recherche : le garder ouvert immobilisait
    // sa mémoire en permanence, et une petite machine finissait par tomber.
    // Sauf s'il est distant : celui-là ne nous appartient pas.
    if (!CDP && navigateur) {
      const n = navigateur;
      navigateur = null;
      await n.close().catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// La recherche en fond
// ---------------------------------------------------------------------------
//
// Elle prend une minute et demie. Une requête HTTP qui dure aussi longtemps
// meurt chez l'hébergeur, entre le proxy et ses délais : on rend la main tout
// de suite et la page vient demander où ça en est.

const travaux = new Map();
const PLAFOND_TRAVAUX = 50;

/** Démarre — ou retrouve — la recherche pour cette adresse et cette surface. */
export function lancerAnalyseLoyer(adresse, opts = {}) {
  const cle = cleCache(adresse, Number(opts.surface) > 0 ? Math.round(Number(opts.surface)) : null);
  const enCours = travaux.get(cle);
  if (enCours?.etat === 'en_cours') return { cle, ...enCours };

  const travail = { etat: 'en_cours', resultat: null, erreur: null, depuis: new Date().toISOString() };
  travaux.set(cle, travail);
  // Les travaux terminés s'oublient : on n'en garde qu'une poignée, le temps
  // que la page vienne chercher son résultat.
  if (travaux.size > PLAFOND_TRAVAUX) {
    for (const [k, t] of travaux) {
      if (t.etat !== 'en_cours') travaux.delete(k);
      if (travaux.size <= PLAFOND_TRAVAUX) break;
    }
  }

  analyseLoyer(adresse, opts)
    .then((r) => {
      travail.etat = r.ok ? 'pret' : 'erreur';
      travail.resultat = r.ok ? r.resultat : null;
      travail.erreur = r.ok ? null : r.error;
      if (r.ok && typeof opts.onFini === 'function') { try { opts.onFini(r.resultat); } catch { /* le résultat reste lisible */ } }
    })
    .catch((e) => {
      travail.etat = 'erreur';
      travail.erreur = e?.message || 'Equimmox n\'a pas répondu.';
    });

  return { cle, ...travail };
}

/** Où en est la recherche lancée pour cette clé. */
export function etatAnalyseLoyer(cle) {
  const t = travaux.get(cle);
  return t ? { cle, etat: t.etat, resultat: t.resultat, erreur: t.erreur, depuis: t.depuis } : null;
}

/** Le résultat déjà gardé pour cette adresse, s'il en existe un de moins de trente jours. */
export function analyseLoyerEnCache(adresse, surface = null) {
  const cle = cleCache(adresse, Number(surface) > 0 ? Math.round(Number(surface)) : null);
  const recent = Records.filter('EquimmoxRecherche', { cle })
    .filter((r) => Date.now() - Date.parse(r.le) < CACHE_JOURS * 86400000)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
  return recent ? { ...recent.resultat, du_cache: true } : null;
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
