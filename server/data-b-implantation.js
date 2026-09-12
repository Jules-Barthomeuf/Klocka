// Data-B, module Expertise / ELM, « Étude d'implantation » : ce que vaut
// l'emplacement, au-delà du loyer.
//
// L'équipe le lisait à la main, page par page : le flux piéton et sa note sur
// cinq, le flux voiture, les commerces du tronçon numéro par numéro, la
// démographie, le revenu et les CSP+, les propriétaires. Ici le parcours est
// rejoué dans un vrai navigateur — l'assistant de lancement est en JavaScript,
// un simple appel HTTP ne le voit pas — puis la page de résultat est lue.
//
// Le parcours, relevé sur le site le 11 septembre 2026 :
//   connexion (#signin_email, #signin_password) → expertise.data-b.com/board
//   → button.actionBtn.type_etude (Étude d'implantation)
//   → 2e « Etape suivante » (Projet d'implantation : une adresse postale)
//   → span.dbAct__tags.input_activite → button#commerce
//   → #search_input_activite « Chercher un métier » → label.uxAdvPill → Valider
//   → #autocomplete (Google Places) → suggestion .pac-item
//   → « Lancer la recherche de l'adresse » → edition?o=…&expertise_format=etude_implantation
//
// UNE ÉTUDE CONSOMME UN CRÉDIT DATA-B. On garde donc chaque résultat trente
// jours par adresse et activité, et on ne relance que sur ordre (`forcer`).
// Rouvrir une étude existante (edition?o=…) peut aussi la régénérer : on ne
// rouvre jamais, on lit ce qu'on a gardé.
//
// La lecture (parseImplantation) est pure et testée hors ligne sur une page
// réelle : marche/fixtures/data-b-implantation.html.

import fs from 'fs';
import path from 'path';
import { Records, DATA_DIR } from './db.js';
import { resoudreAdresse } from './data-b.js';
import { ErreurSource, DEFINITIVE, SANS_DONNEE } from './marche/erreurs.js';
import { lancerNavigateur, aller, texteDe } from './marche/navigateur.js';

const EMAIL = (process.env.DATAB_EMAIL || '').trim();
const MDP = (process.env.DATAB_MOT_DE_PASSE || '').trim();
export const implantationConfiguree = () => !!(EMAIL && MDP);

const SESSION = path.join(DATA_DIR, 'data-b-session.json');
const CACHE_JOURS = 30;
const ACTIVITE_DEFAUT = 'Tous les commerces';
// Les flux ne sont PAS calculés avec l'étude : Data-B les propose à la demande,
// derrière un « TÉLÉCHARGER LE FLUX », un par type. Sans ce clic, la page dit
// « Flux piéton et voiture » et rien d'autre — c'est ce qui rendait les deux
// notes vides. On les déclenche donc, sauf si on l'interdit.
const FLUX_AUTO = !/^(0|false|non|no)$/i.test(process.env.DATAB_FLUX_AUTO || '');
// Le piéton arrive en une à deux minutes ; le voiture est plus lent. Cinq
// minutes plafonnent l'attente — au-delà, on rend l'étude sans lui plutôt que
// de bloquer la lecture de marché entière.
const FLUX_ATTENTE_MS = Number(process.env.DATAB_FLUX_ATTENTE_MS) || 300000;
const ETOILE_PLEINE = '#f7941d';

const nombre = (s) => {
  const m = String(s || '').match(/[-+]?\s*\d[\d\s\u202f\u00a0]*(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/[\s\u202f\u00a0]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// La page répète chaque titre de section dans un sommaire, en tête : la
// première occurrence est le sommaire, la vraie section est la dernière.
const derniere = (lignes, motif) => {
  for (let i = lignes.length - 1; i >= 0; i--) if (motif.test(lignes[i])) return i;
  return -1;
};

/** Les occurrences d'un titre réellement suivies de leur contenu (`ancre`). */
const sections = (lignes, titre, ancre, portee = 4) =>
  lignes.map((l, i) => i).filter((i) => titre.test(lignes[i]) && lignes.slice(i + 1, i + 1 + portee).some((x) => ancre.test(x)));

// ── La lecture de la page ──────────────────────────────────────────────────

/** Les étoiles d'un bloc : combien sont pleines, sur combien. */
function etoiles(html) {
  const pleines = (html.match(new RegExp(`<polygon fill="${ETOILE_PLEINE}"`, 'gi')) || []).length;
  const vides = (html.match(/<polygon fill="#cccccc"/gi) || []).length;
  return pleines + vides ? { note: pleines, sur: pleines + vides } : null;
}

/** « ENTRE 150 ET 200 PIÉTONS » → { min: 150, max: 200 }. */
function fourchette(ligne) {
  const m = String(ligne || '').replace(/\s/g, ' ').match(/entre\s+([\d\s]+)\s+et\s+([\d\s]+)/i);
  return m ? { min: nombre(m[1]), max: nombre(m[2]) } : null;
}

/**
 * Le bloc HTML d'une carte de flux. On cherche le marqueur de section
 * (`flowpedestrian`, `flowmotorized`) suivi d'étoiles à moins de 8 000
 * caractères — le sommaire porte le même marqueur, sans étoiles. À défaut,
 * la n-ième carte notée de la page : la première est le piéton, la seconde
 * la voiture. Le titre en clair n'est plus qu'un dernier recours.
 */
function carteDeFlux(html, { marqueur, rang, titre }) {
  const ETOILES = 'dbFlowCard__scoreStars';
  let debut = -1;
  for (let i = html.indexOf(marqueur); i >= 0; i = html.indexOf(marqueur, i + 1)) {
    const e = html.indexOf(ETOILES, i);
    if (e > 0 && e - i < 8000) { debut = i; break; }
  }
  if (debut < 0) {
    let e = -1;
    for (let k = 0; k <= rang; k++) e = html.indexOf(ETOILES, e + 1);
    if (e > 0) debut = Math.max(0, html.lastIndexOf('<div', e - 400));
  }
  if (debut < 0 && titre) debut = html.lastIndexOf(titre);
  if (debut < 0) return null;
  const fin = html.indexOf('Sources :', debut);
  return html.slice(debut, fin > 0 ? fin : debut + 20000);
}

/** Le flux piéton : la note globale, les sous-notes, les fourchettes. */
function lireFluxPieton(html, lignes) {
  const bloc = carteDeFlux(html, { marqueur: 'flowpedestrian', rang: 0, titre: 'Estimation du flux piéton dans la zone' });
  if (!bloc) return null;
  const score = bloc.match(/dbFlowCard__scoreStars[\s\S]*?<\/div>\s*<\/div>/i)?.[0] || '';
  const sousNotes = {};
  for (const m of bloc.matchAll(/dbFlowQuickStats__label">([^<]+)<\/span>\s*<span class="dbFlowQuickStats__value">([\s\S]*?)<\/span>/gi)) {
    const e = etoiles(m[2]);
    if (e) sousNotes[m[1].trim().toLowerCase()] = e;
  }
  const i = derniere(lignes, /^estimation du flux piéton dans la zone$/i);
  const zone = i >= 0 ? lignes.slice(i, i + 30) : [];
  const apres = (motif) => { const k = zone.findIndex((l) => motif.test(l)); return k >= 0 ? zone[k + 1] : null; };
  const jour = (motif) => { const k = zone.findIndex((l) => motif.test(l)); return k >= 0 ? fourchette(zone[k + 2]) : null; };
  return {
    note: etoiles(score),
    indisponible: fluxIndisponible(html, 'flowpedestrian'),
    sous_notes: sousNotes,
    par_heure: { basse: fourchette(apres(/^estimation basse par heure$/i)), haute: fourchette(apres(/^estimation haute par heure$/i)) },
    par_jour: { basse: jour(/^estimation basse par heure$/i), haute: jour(/^estimation haute par heure$/i) },
  };
}

/** Data-B a-t-il déclaré ce flux indisponible ? (`non_dispo` sans `hide`) */
function fluxIndisponible(html, marqueur) {
  const i = html.indexOf(marqueur);
  if (i < 0) return false;
  const zone = html.slice(i, i + 1200);
  return /class="non_dispo(?!\s+hide)/.test(zone);
}

/** Le flux voiture : la note sur cinq, et rien d'autre. */
function lireFluxVoiture(html) {
  const bloc = carteDeFlux(html, { marqueur: 'flowmotorized', rang: 1, titre: 'Estimation du flux voiture dans la zone' });
  if (!bloc) return null;
  const score = bloc.match(/dbFlowCard__scoreStars[\s\S]*?<\/div>\s*<\/div>/i)?.[0] || '';
  return { note: etoiles(score), indisponible: fluxIndisponible(html, 'flowmotorized') };
}

/**
 * Les commerces du tronçon, numéro par numéro, côté pair puis impair — tels
 * que la page les présente : activité, puis enseigne.
 */
function lireTroncon(lignes) {
  const debuts = sections(lignes, /^activité commerciale du tronçon de rue$/i, /^(côté pair|côté impair|N°)/i);
  if (!debuts.length) return null;
  const numeros = [];
  let cote = null;
  let courant = null;
  for (const i of debuts) for (let k = i + 1; k < lignes.length; k++) {
    const l = lignes[k];
    if (/^sources\s*:/i.test(l)) break;
    if (/^côté pair$/i.test(l)) { cote = 'pair'; continue; }
    if (/^côté impair$/i.test(l)) { cote = 'impair'; continue; }
    const num = l.match(/^N°\s*(\S+)$/i);
    if (num) { courant = { numero: num[1], cote, commerces: [] }; numeros.push(courant); continue; }
    if (!courant) continue;
    if (/^habitation$/i.test(l)) { courant.habitation = true; continue; }
    if (/^\d+ commerces?$/i.test(l)) continue;
    // Une activité est suivie de son enseigne sur la ligne d'après.
    const suivante = lignes[k + 1];
    if (suivante && !/^(N°|CÔTÉ|Sources|HABITATION|\d+ COMMERCE)/i.test(suivante)) {
      courant.commerces.push({ activite: l, enseigne: suivante });
      k += 1;
    }
  }
  const total = numeros.reduce((n, x) => n + x.commerces.length, 0);
  return { numeros, total };
}

/** Le tronçon en une ligne : « 19 commerces - tronçon premium », et sa note. */
function lirePresentationTroncon(html, lignes) {
  const i = derniere(lignes, /^commercialité du tronçon$/i);
  if (i < 0) return null;
  const j = html.lastIndexOf('Commercialité du tronçon');
  const bloc = j >= 0 ? html.slice(j, j + 6000) : '';
  return { libelle: lignes[i + 1] || null, note: etoiles(bloc.split('Entreprises dans le tronçon')[0]) };
}

/** La rue : combien de commerces, sur quelle longueur, par grande famille. */
function lireRue(lignes) {
  const l = lignes.find((x) => /^il y a \d+ commerces? en activité dans cette rue/i.test(x));
  if (!l) return null;
  const m = l.match(/il y a (\d+) commerces? en activité dans cette rue longue de ([\d\s]+)\s*m/i);
  const i = lignes.indexOf(l);
  const familles = [];
  for (let k = i + 1; k < i + 12; k++) {
    const f = (lignes[k] || '').match(/^(\d+) en (.+?)(?: \(dont .+\))?$/i);
    if (!f) break;
    familles.push({ n: Number(f[1]), famille: f[2] });
  }
  return { commerces: m ? Number(m[1]) : null, longueur_m: m ? nombre(m[2]) : null, familles };
}

/** « Revenu moyen et niveau de vie » : revenu, chômage, CSP+, retraités. */
function lireRevenu(lignes) {
  const [i] = sections(lignes, /^revenu moyen et niveau de vie$/i, /^revenu moyen$/i);
  if (i == null) return null;
  const zone = lignes.slice(i, i + 40);
  const apres = (motif) => { const k = zone.findIndex((l) => motif.test(l)); return k >= 0 ? zone[k + 1] : null; };
  const evolutions = (motif) => {
    const k = zone.findIndex((l) => motif.test(l));
    if (k < 0) return null;
    const trois = zone[k + 2], cinq = zone[k + 4];
    return { a_3_ans: nombre(trois), a_5_ans: nombre(cinq) };
  };
  return {
    revenu_moyen_annuel: nombre(apres(/^revenu moyen$/i)),
    revenu_evolution: evolutions(/^revenu moyen$/i),
    taux_chomage: nombre(apres(/^taux de chômage$/i)),
    csp_plus: nombre(apres(/^csp \+$/i)),
    csp_plus_evolution: evolutions(/^csp \+$/i),
    retraites: nombre(apres(/^retraités$/i)),
  };
}

/** L'étude démographique : habitants et leur évolution. */
function lireDemographie(lignes) {
  const [i] = sections(lignes, /^etude démographique de la zone$/i, /^habitants$/i);
  if (i == null) return null;
  const zone = lignes.slice(i, i + 30);
  const k = zone.findIndex((l) => /^habitants$/i.test(l));
  if (k < 0) return null;
  return {
    habitants: nombre(zone[k + 1]),
    evolution: { a_3_ans: nombre(zone[k + 2]), a_5_ans: nombre(zone[k + 4]), a_10_ans: nombre(zone[k + 6]) },
  };
}

/**
 * La zone de chalandise primaire (5 minutes à pied) : logements et
 * propriétaires. C'est la maille la plus fine que la page donne pour les
 * propriétaires — le nombre de copropriétaires de l'immeuble lui-même n'y est
 * pas : il relève du module Data Foncier.
 */
function lireZonePrimaire(lignes) {
  const i = derniere(lignes, /^zone de chalandise primaire à 5 minutes à pied$/i);
  const debut = lignes.findIndex((l, k) => k > i && /^logements$/i.test(l));
  if (i < 0 || debut < 0) return null;
  const zone = lignes.slice(debut, debut + 30);
  const apres = (motif) => { const k = zone.findIndex((l) => motif.test(l)); return k >= 0 ? nombre(zone[k + 1]) : null; };
  return {
    logements: apres(/^nombre de logements$/i),
    maisons: apres(/^maisons$/i),
    appartements: apres(/^appartements$/i),
    proprietaires: apres(/^propriétaires$/i),
    commerces: apres(/^nombre de commerces$/i),
    entreprises: apres(/^nombre d'entreprises$/i),
  };
}

/** Le descriptif de tête : revenu du quartier et CSP majoritaire. */
function lireEnTete(lignes) {
  const apres = (motif) => { const k = lignes.findIndex((l) => motif.test(l)); return k >= 0 ? lignes[k + 1] : null; };
  const revenu = apres(/^revenu annuel$/i);
  return {
    revenu_annuel_quartier: nombre(revenu),
    revenu_vs_france: revenu ? nombre(revenu.match(/FR\s*:\s*([-+]?[\d,.]+)%/i)?.[1]) : null,
    csp_majoritaire: apres(/^csp majoritaire$/i),
  };
}

/**
 * Lit une page « Étude d'implantation » de Data-B.
 * @param {string} html - le HTML complet de la page
 * @param {string[]} [lignes] - son texte visible ligne à ligne ; déduit du HTML sinon
 */
export function parseImplantation(html, lignes = null) {
  const l = lignes || html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const flux_pieton = lireFluxPieton(html, l);
  const flux_voiture = lireFluxVoiture(html);
  if (!flux_pieton && !flux_voiture && !lireTroncon(l)) return null;
  return {
    en_tete: lireEnTete(l),
    flux_pieton,
    flux_voiture,
    rue: lireRue(l),
    troncon: lirePresentationTroncon(html, l),
    commerces_troncon: lireTroncon(l),
    demographie: lireDemographie(l),
    revenu: lireRevenu(l),
    zone_primaire: lireZonePrimaire(l),
  };
}

// ── Le parcours dans le navigateur ─────────────────────────────────────────

async function seConnecter(p) {
  await aller(p, 'https://data-b.com/login', { service: 'Data-B', timeout: 90000 });
  await p.waitForTimeout(1500);
  const email = p.locator('#signin_email');
  if (!(await email.isVisible().catch(() => false))) return; // déjà connecté
  await email.fill(EMAIL);
  await p.locator('#signin_password').fill(MDP);
  await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}), p.click('button[type=submit]')]);
  await p.waitForTimeout(2000);
  if (/\/login/.test(p.url())) throw new ErreurSource('Connexion à Data-B refusée : vérifiez le compte dans .env.', { service: 'Data-B', classe: DEFINITIVE });
}

/**
 * Déclenche le calcul des flux et attend qu'ils arrivent.
 *
 * Chaque type a son propre déclencheur (`#flow_activate[flowtype=...]`), qui
 * poste sur activateflow.php ; la page affiche « CHARGEMENT EN COURS » puis
 * se remplit. On attend l'apparition des étoiles, type par type.
 *
 * @returns {Promise<string[]>} les flux effectivement obtenus
 */
async function declencherFlux(p) {
  const obtenus = [];
  for (const [type, rang] of [['pedestrian', 0], ['motorized', 1]]) {
    // Déjà là ? On ne redemande pas.
    const dejaLa = await p.evaluate((r) => document.querySelectorAll('.dbFlowCard__scoreStars').length > r, rang);
    if (dejaLa) { obtenus.push(type); continue; }
    const clique = await p.evaluate((t) => {
      const e = document.querySelector(`#flow_activate[flowtype="${t}"], .flowactivate[flowtype="${t}"]`);
      if (!e) return false;
      e.click();
      return true;
    }, type);
    if (!clique) continue;
    // Le calcul prend de quelques secondes à deux ou trois minutes.
    const debut = Date.now();
    let vu = false;
    while (Date.now() - debut < FLUX_ATTENTE_MS) {
      await p.waitForTimeout(5000);
      const n = await p.evaluate(() => document.querySelectorAll('.dbFlowCard__scoreStars').length);
      if (n > rang) { vu = true; break; }
    }
    if (vu) obtenus.push(type);
    else console.warn(`[data-b] flux ${type} : pas de réponse après ${FLUX_ATTENTE_MS / 1000} s.`);
  }
  return obtenus;
}

/** Choisit l'activité dans le sélecteur ; « Tous les commerces » à défaut. */
async function choisirActivite(p, activite) {
  await p.evaluate(() => document.querySelector('span.dbAct__tags.input_activite')?.click());
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelector('button#commerce')?.click());
  await p.waitForTimeout(2500);
  const recherche = p.locator('#search_input_activite');
  await recherche.waitFor({ state: 'visible', timeout: 15000 });
  const voulue = (activite || '').trim();
  let choisie = ACTIVITE_DEFAUT;
  if (voulue) {
    await recherche.fill('');
    await recherche.type(voulue.split(/[,/]/)[0].trim(), { delay: 40 });
    await p.waitForTimeout(1200);
    const pilule = p.locator('label.uxAdvPill').filter({ hasText: new RegExp(voulue.split(/[,/]/)[0].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
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

const cleCache = (a, activite) => `${a.numero} ${a.rue} ${a.code_postal} ${a.ville}|${(activite || ACTIVITE_DEFAUT).toLowerCase()}`.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * L'étude d'implantation d'une adresse, d'après Data-B.
 * @param {string} texteAdresse
 * @param {{activite?: string, forcer?: boolean, user?: object}} opts
 * @returns {Promise<{ok: true, resultat: object} | {ok: false, error: string, statut?, classe?}>}
 */
export async function etudeImplantation(texteAdresse, { activite = null, forcer = false, user = null } = {}) {
  if (!implantationConfiguree()) return { ok: false, error: 'Data-B n\'est pas configuré : DATAB_EMAIL et DATAB_MOT_DE_PASSE manquent dans .env.', classe: DEFINITIVE };
  let adresse;
  try {
    adresse = await resoudreAdresse(texteAdresse);
  } catch (e) {
    return { ok: false, error: e.message, statut: e.statut ?? null, classe: e.classe ?? null };
  }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texteAdresse || '').slice(0, 80)} ».`, classe: SANS_DONNEE };

  const cle = cleCache(adresse, activite);
  if (!forcer) {
    const recent = Records.filter('DataBImplantation', { cle })
      .filter((r) => Date.now() - Date.parse(r.le) < CACHE_JOURS * 86400000)
      .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, resultat: { ...recent.resultat, du_cache: true } };
  }

  let ctx = null;
  try {
    const b = await lancerNavigateur('Data-B');
    ctx = await b.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: 'fr-FR',
      ...(fs.existsSync(SESSION) ? { storageState: SESSION } : {}),
    });
    const p = await ctx.newPage();
    p.on('dialog', (d) => d.accept().catch(() => {}));

    await seConnecter(p);
    await aller(p, 'https://expertise.data-b.com/board', { service: 'Data-B', timeout: 90000 });
    await p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2500);
    if (/\/login/.test(p.url())) { await seConnecter(p); await aller(p, 'https://expertise.data-b.com/board', { service: 'Data-B', timeout: 90000 }); await p.waitForTimeout(2500); }

    // Étude d'implantation → Projet d'implantation (une adresse postale).
    const lanceur = p.locator('button.actionBtn.type_etude').first();
    await lanceur.waitFor({ state: 'visible', timeout: 20000 }).catch(() => { throw new ErreurSource('Data-B : le module Expertise / ELM est introuvable (abonnement ?).', { service: 'Data-B', classe: DEFINITIVE }); });
    await lanceur.click();
    await p.waitForTimeout(2500);
    await p.locator('text=Etape suivante').nth(1).click({ force: true, timeout: 10000 });
    await p.waitForTimeout(2500);

    const activiteChoisie = await choisirActivite(p, activite);

    // L'adresse, dans l'autocomplétion Google Places, puis sa suggestion.
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

    // C'est ici que le crédit part. La page de résultat est longue à se
    // construire : on attend son adresse, puis le premier flux.
    await p.locator('text=Lancer la recherche de l\'adresse').first().click({ force: true, timeout: 10000 });
    await p.waitForURL((u) => /\/edition/.test(u.pathname) && /etude_implantation/.test(u.search), { timeout: 120000 })
      .catch(() => { throw new ErreurSource('Data-B n\'a pas ouvert l\'étude : l\'adresse n\'a peut-être pas été reconnue.', { service: 'Data-B', classe: SANS_DONNEE }); });
    await p.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
    await p.waitForTimeout(6000);
    for (let y = 0; y < 14; y++) { await p.mouse.wheel(0, 1500); await p.waitForTimeout(350); }
    // Les flux, à la demande. Sans eux, deux notes sur trois manquent.
    const flux = FLUX_AUTO ? await declencherFlux(p) : [];
    if (FLUX_AUTO && flux.length < 2) {
      // Le calcul peut aboutir après coup : un rechargement le ramène.
      await p.reload({ waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
      await p.waitForTimeout(6000);
      for (let y = 0; y < 16; y++) { await p.mouse.wheel(0, 1500); await p.waitForTimeout(250); }
      await p.waitForTimeout(2500);
    }

    const html = await p.content();
    const lignes = await texteDe(p);
    // La page est gardée telle que lue : c'est elle qu'on rouvre quand un
    // champ revient vide, sans dépenser un nouveau crédit.
    try {
      const dossierPages = path.join(DATA_DIR, 'marche');
      fs.mkdirSync(dossierPages, { recursive: true });
      const code = new URL(p.url()).searchParams.get('o') || 'sans-code';
      fs.writeFileSync(path.join(dossierPages, `implantation-${code}.html`), html);
      fs.writeFileSync(path.join(dossierPages, `implantation-${code}.txt`), lignes.join('\n'));
    } catch { /* la trace ne doit pas faire échouer la lecture */ }
    const lecture = parseImplantation(html, lignes);
    if (!lecture) throw new ErreurSource('Data-B a ouvert l\'étude mais la page ne contient ni flux ni tronçon : l\'interface a peut-être changé.', { service: 'Data-B' });

    const resultat = {
      source: 'Data-B · Étude d\'implantation',
      adresse: adresse.label,
      activite: activiteChoisie,
      lien: p.url(),
      // Ce qui a été demandé et ce qui est revenu : une note vide se lit
      // autrement selon que le flux n'a pas été demandé ou n'a pas répondu.
      flux_demandes: FLUX_AUTO ? ['pedestrian', 'motorized'] : [],
      ...lecture,
      le: new Date().toISOString(),
      par: user?.email || null,
    };
    await ctx.storageState({ path: SESSION }).catch(() => {});
    Records.create('DataBImplantation', { cle, adresse: adresse.label, activite: activiteChoisie, resultat, le: resultat.le, par: resultat.par });
    console.log(
      `[data-b] étude d'implantation lue pour « ${adresse.label} » (${activiteChoisie})` +
      ` · flux piéton ${lecture.flux_pieton?.note ? `${lecture.flux_pieton.note.note}/5` : 'absent'}` +
      ` · flux voiture ${lecture.flux_voiture?.note ? `${lecture.flux_voiture.note.note}/5` : 'absent'}` +
      `${user?.email ? ` — ${user.email}` : ''}`
    );
    return { ok: true, resultat };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), statut: e?.statut ?? null, classe: e?.classe ?? null };
  } finally {
    await ctx?.close().catch(() => {});
  }
}
