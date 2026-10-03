// Data-B, module Expertise / ELM, « Estimation des murs commerciaux ».
//
// Data-B estime les murs par le rendement : il fournit, pour une adresse et
// une activité, le taux de rendement attendu par les investisseurs sur ce
// secteur (champ caché `rendement__ratio_metier_moy` de la page d'édition),
// puis sa page l'ajuste selon le bien et le bail, et divise le loyer par le
// taux. Tout ce calcul tourne dans le navigateur, en clair : il est recopié
// ici à l'identique (relevé le 1er octobre 2026), testé, et seul le taux de
// base se va chercher chez Data-B.
//
// Le parcours, relevé le même jour :
//   expertise.data-b.com/board → button.type_etude « Estimation des murs commerciaux »
//   → #dbActTrigger → button#commerce → #search_input_activite → label.uxAdvPill → Valider
//   → #autocomplete (Google Places) → .pac-item → « Lancer la recherche de l'adresse »
//   → edition?o=…&expertise_format=estimation_murs_commerciaux
//
// LANCER UNE EXPERTISE CONSOMME UN CRÉDIT DATA-B. Le taux de base se garde
// donc par adresse et activité, et ne se redemande que sur ordre (`forcer`).

import fs from 'fs';
import path from 'path';
import { Records, DATA_DIR } from './db.js';
import { resoudreAdresse } from './data-b.js';
import { ErreurSource, DEFINITIVE, SANS_DONNEE } from './marche/erreurs.js';
import { lancerNavigateur, aller } from './marche/navigateur.js';

const EMAIL = (process.env.DATAB_EMAIL || '').trim();
const MDP = (process.env.DATAB_MOT_DE_PASSE || '').trim();
export const mursConfigure = () => !!(EMAIL && MDP);

const SESSION = path.join(DATA_DIR, 'data-b-session.json');
const CACHE_JOURS = 180;
const ACTIVITE_DEFAUT = 'Tous les commerces';

// --- Le barème de Data-B, recopié de sa page (ajusterTauxRendement) ----------

/** Les réponses possibles, telles que Data-B les attend. */
export const CRITERES_MURS = {
  etat_immeuble: ['parfait', 'usage', 'travaux', 'renover', 'grosoeuvre'],
  etat_local: ['parfait', 'usage', 'travaux', 'brut'],
  angle: ['oui', 'non', 'nc'],
  extraction: ['oui', 'non', 'nc'],
  parking: ['oui', 'non', 'nc'],
  pmr: ['locaux_aux_normes', 'adap_en_cours', 'travaux_a_realiser', 'local_sans_public'],
  franchise: ['oui', 'non', 'nc'],
  anciennete_locataire: ['moins1an', 'de1a3ans', 'de3a6ans', 'de6a9ans', 'plus9ans'],
  retards_paiement: ['oui', 'non', 'nc'],
  licence_4: ['oui', 'non', 'nc'],
};

/** Pure : « 12/03/2029 », « 2029-03-12 », « mars 2029 » → Date, ou null. */
export function dateDe(t) {
  const s = String(t || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const mois = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const n = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  m = n.match(/(?:(\d{1,2})\s+)?([a-z]+)\s+(\d{4})/);
  if (m && mois.includes(m[2])) return new Date(Number(m[3]), mois.indexOf(m[2]), Number(m[1] || 1));
  m = n.match(/^(\d{4})$/);
  if (m) return new Date(Number(m[1]), 11, 31);
  return null;
}

/**
 * Pure : le taux ajusté, comme Data-B. Chaque critère pèse ce que pèse le
 * curseur de Data-B ; la liste des ajustements dit pourquoi le taux bouge.
 */
export function ajusterRendement(base, c = {}, aujourdhui = new Date()) {
  const ajustements = [];
  const ajoute = (delta, motif) => { if (delta) ajustements.push({ delta, motif }); };
  if (c.etat_immeuble === 'travaux' || c.etat_immeuble === 'renover') ajoute(0.5, 'immeuble à rénover');
  if (c.etat_immeuble === 'grosoeuvre') ajoute(1, 'gros œuvre à reprendre');
  if (c.etat_local === 'travaux' || c.etat_local === 'brut') ajoute(0.5, 'local à reprendre');
  if (c.extraction === 'oui') ajoute(-0.5, 'extraction en place');
  if (c.extraction === 'non') ajoute(0.5, "pas d'extraction");
  if (c.parking === 'oui') ajoute(-0.25, 'stationnement');
  if (c.angle === 'oui') ajoute(-0.25, "local d'angle");
  if (c.pmr === 'travaux_a_realiser') ajoute(0.5, 'accessibilité à mettre aux normes');
  if (c.franchise === 'oui') ajoute(-0.5, 'locataire sous enseigne');
  if (c.anciennete_locataire === 'plus9ans') ajoute(-0.25, 'locataire en place depuis plus de 9 ans');
  if (c.retards_paiement === 'oui') ajoute(0.5, 'retards de paiement');
  if (c.licence_4 === 'oui') ajoute(0.5, 'licence IV');
  const renouvellement = dateDe(c.date_renouvellement);
  if (renouvellement) {
    const annees = (renouvellement - aujourdhui) / (365 * 86400000);
    if (annees < 1) ajoute(0.5, 'bail proche de son renouvellement');
    else if (annees > 3) ajoute(-0.25, 'bail sécurisé plus de 3 ans');
  }
  const taux = Number(Math.max(base + ajustements.reduce((t, a) => t + a.delta, 0), 0).toFixed(1));
  return { taux, ajustements };
}

/** Pure : l'arrondi de Data-B, au millier inférieur. */
export const arrondirMilliers = (n) => Math.floor(Number(n) / 1000) * 1000;

/**
 * Pure : l'estimation de Data-B. Valeur = loyer ÷ taux ajusté ; basse et
 * haute à 80 % et 120 %, arrondies au millier inférieur.
 */
export function estimerMurs({ base, loyer, criteres = {}, aujourdhui = new Date() }) {
  const b = Number(base);
  const l = Number(loyer);
  if (!(b > 0) || !(l > 0)) return null;
  const { taux, ajustements } = ajusterRendement(b, criteres, aujourdhui);
  if (!(taux > 0)) return null;
  const finale = l / (taux / 100);
  return {
    taux_base: b,
    taux,
    ajustements,
    basse: arrondirMilliers(Math.round(finale * 0.8)),
    moyenne: arrondirMilliers(Math.round(finale)),
    haute: arrondirMilliers(Math.round(finale * 1.2)),
  };
}

// --- Le taux de base, chez Data-B --------------------------------------------

const cleCache = (a, activite) => `${a.numero} ${a.rue} ${a.code_postal} ${a.ville}|${(activite || ACTIVITE_DEFAUT).toLowerCase()}`.toLowerCase().replace(/\s+/g, ' ').trim();

async function fermerCookies(p) {
  await p.locator('#CybotCookiebotDialogBodyButtonDecline, #CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll').first().click({ timeout: 3000 }).catch(() => {});
  await p.locator('#CybotCookiebotDialog').evaluate((el) => el.remove(), null, { timeout: 2000 }).catch(() => {});
}

async function seConnecter(p) {
  await aller(p, 'https://data-b.com/login', { service: 'Data-B', timeout: 90000 });
  await p.waitForTimeout(1500);
  await fermerCookies(p);
  const email = p.locator('#signin_email');
  if (!(await email.isVisible().catch(() => false))) return;
  await email.fill(EMAIL);
  await p.locator('#signin_password').fill(MDP);
  await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}), p.click('button[type=submit]')]);
  await p.waitForTimeout(2000);
  if (/\/login/.test(p.url())) throw new ErreurSource('Connexion à Data-B refusée : vérifiez le compte dans .env.', { service: 'Data-B', classe: DEFINITIVE });
}

async function choisirActivite(p, activite) {
  await p.locator('#dbActTrigger').click({ timeout: 10000 });
  await p.waitForTimeout(1500);
  await p.locator('button#commerce').click({ timeout: 10000 });
  await p.waitForTimeout(2000);
  const recherche = p.locator('#search_input_activite');
  await recherche.waitFor({ state: 'visible', timeout: 15000 });
  const mot = String(activite || '').split(/[,/]/)[0].trim();
  let choisie = ACTIVITE_DEFAUT;
  if (mot) {
    await recherche.fill('');
    await recherche.type(mot, { delay: 40 });
    await p.waitForTimeout(1200);
    const pilule = p.locator('label.uxAdvPill').filter({ hasText: new RegExp(mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
    if (await pilule.isVisible().catch(() => false)) {
      choisie = (await pilule.innerText()).split('\n')[0].trim();
      await pilule.click({ force: true });
    }
  }
  if (choisie === ACTIVITE_DEFAUT) {
    await recherche.fill('');
    await p.waitForTimeout(600);
    await p.locator('label.uxAdvPill.uxAdvPill__all').first().click({ force: true });
  }
  await p.waitForTimeout(600);
  await p.locator('button, a, span').filter({ hasText: /^Valider$/ }).first().click({ force: true, timeout: 10000 });
  await p.waitForTimeout(1500);
  return choisie;
}

/**
 * Le taux de rendement de base de Data-B pour une adresse et une activité.
 * @returns {Promise<{ok: true, resultat: {taux_base, activite, adresse, lien, le}} | {ok: false, error: string}>}
 */
export async function rendementDeBase(texteAdresse, { activite = null, forcer = false, user = null } = {}) {
  if (!mursConfigure()) return { ok: false, error: 'Data-B n\'est pas configuré : DATAB_EMAIL et DATAB_MOT_DE_PASSE manquent dans .env.', classe: DEFINITIVE };
  let adresse;
  try {
    adresse = await resoudreAdresse(texteAdresse);
  } catch (e) {
    return { ok: false, error: e.message, classe: e.classe ?? null };
  }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texteAdresse || '').slice(0, 80)} ».`, classe: SANS_DONNEE };

  const cle = cleCache(adresse, activite);
  if (!forcer) {
    const recent = Records.filter('DataBMurs', { cle })
      .filter((r) => Date.now() - Date.parse(r.le) < CACHE_JOURS * 86400000)
      .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, resultat: { ...recent.resultat, du_cache: true } };
  }

  let ctx = null;
  try {
    const b = await lancerNavigateur('Data-B');
    ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fr-FR', ...(fs.existsSync(SESSION) ? { storageState: SESSION } : {}) });
    const p = await ctx.newPage();
    p.on('dialog', (d) => d.accept().catch(() => {}));
    await seConnecter(p);
    await aller(p, 'https://expertise.data-b.com/board', { service: 'Data-B', timeout: 90000 });
    await p.waitForTimeout(2500);
    if (/\/login/.test(p.url())) { await seConnecter(p); await aller(p, 'https://expertise.data-b.com/board', { service: 'Data-B', timeout: 90000 }); await p.waitForTimeout(2500); }
    await fermerCookies(p);

    const lanceur = p.locator('button.type_etude', { hasText: 'Estimation des murs commerciaux' }).first();
    await lanceur.waitFor({ state: 'visible', timeout: 20000 }).catch(() => { throw new ErreurSource('Data-B : l\'estimation des murs est introuvable (abonnement ?).', { service: 'Data-B', classe: DEFINITIVE }); });
    await lanceur.click();
    await p.waitForTimeout(2500);
    const activiteChoisie = await choisirActivite(p, activite);

    const champ = p.locator('#autocomplete');
    await champ.waitFor({ state: 'visible', timeout: 15000 });
    await champ.click();
    await champ.fill('');
    await champ.type(`${adresse.numero ? adresse.numero + ' ' : ''}${adresse.rue}, ${adresse.code_postal} ${adresse.ville}`, { delay: 50 });
    await p.locator('.pac-item').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(600);
    const suggestion = p.locator('.pac-item').first();
    if (await suggestion.isVisible().catch(() => false)) await suggestion.click({ force: true });
    else await champ.press('ArrowDown').then(() => champ.press('Enter'));
    await p.waitForTimeout(1500);

    // C'est ici que le crédit part.
    await p.locator('text=Lancer la recherche de l\'adresse').first().click({ force: true, timeout: 10000 });
    await p.waitForURL((u) => /\/edition/.test(u.pathname) && /estimation_murs/.test(u.search), { timeout: 120000 })
      .catch(() => { throw new ErreurSource('Data-B n\'a pas ouvert l\'estimation : l\'adresse n\'a peut-être pas été reconnue.', { service: 'Data-B', classe: SANS_DONNEE }); });
    await p.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
    await p.locator('#rendement__ratio_metier_moy').waitFor({ state: 'attached', timeout: 60000 }).catch(() => {});
    const brut = await p.locator('#rendement__ratio_metier_moy').inputValue().catch(() => '');
    const taux = Number(String(brut).replace(',', '.'));
    if (!(taux > 0)) throw new ErreurSource('Data-B a ouvert l\'estimation sans taux de rendement : l\'interface a peut-être changé.', { service: 'Data-B' });

    const resultat = { source: 'Data-B · Estimation des murs commerciaux', taux_base: taux, activite: activiteChoisie, adresse: adresse.label, lien: p.url(), le: new Date().toISOString(), par: user?.email || null };
    await ctx.storageState({ path: SESSION }).catch(() => {});
    Records.create('DataBMurs', { cle, adresse: adresse.label, activite: activiteChoisie, resultat, le: resultat.le, par: resultat.par });
    console.log(`[data-b] taux de rendement des murs lu pour « ${adresse.label} » (${activiteChoisie}) : ${taux} %${user?.email ? ` — ${user.email}` : ''}`);
    return { ok: true, resultat };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), classe: e?.classe ?? null };
  } finally {
    await ctx?.close().catch(() => {});
  }
}
