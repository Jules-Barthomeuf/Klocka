// L'estimation multicritères d'Equimmox (26 oct. 2026, Jules) : la valeur d'un bien professionnel par quatre
// méthodes pondérées, offres actuelles (2), offres anciennes (1), transactions DVF (1) et capitalisation (2). Klocka
// refait le parcours de l'écran « Estimation » d'Equimmox dans un navigateur sans écran : type (prix de vente),
// classe d'actif, informations du bien, méthodes et coefficients, puis il choisit lui-même les comparables de chaque
// méthode (règle ci-dessous, chaque choix gardé avec sa raison), remplit la capitalisation et génère le rapport.
// Le rapport, lu ici, est la source de l'avis de valeur et du deck : ils ne recalculent rien.
//
// L'écran vit dans une page intégrée (platform.equimmox.com/estimation, dans app.equimmox.com/estimation-3).

import { Records } from './db.js';

export const COEFFICIENTS = { offres_actuelles: 2, offres_anciennes: 1, transactions: 1, capitalisation: 2 };
export const METHODES = [
  ['offres_actuelles', 'Offre actuelle', 'Offres actuelles'],
  ['offres_anciennes', 'Offre ancienne', 'Offres anciennes'],
  ['transactions', 'Transactions', 'Transactions DVF'],
  ['capitalisation', 'Valeur de capitalisation', 'Capitalisation des revenus'],
];
/** La classe d'actif Equimmox d'un type de bien de l'avis (null : Equimmox ne sait pas l'estimer). */
export const CLASSE_DU_TYPE = { murs_commerce: 'Commerce', bureaux: 'Bureaux', local_activite: "Local d'activité" };
const MAX_PAR_METHODE = 5;
const ECART_MEDIANE = 0.4;

const nombre = (t) => {
  if (t == null) return null;
  const n = Number(String(t).replace(/[\s\u202f\u00a0€]/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && /\d/.test(String(t)) ? n : null;
};
const MOIS = { janv: 0, 'févr': 1, fevr: 1, mars: 2, 'avr': 3, mai: 4, juin: 5, juil: 6, 'août': 7, aout: 7, sept: 8, oct: 9, nov: 10, 'déc': 11, dec: 11 };
/** « 13 mars 2026 », « 5 févr. 2025 » → AAAA-MM-JJ. */
export function dateFr(t) {
  const m = String(t || '').toLowerCase().match(/(\d{1,2})\s+([a-zéû]+)\.?\s+(\d{4})/);
  if (!m) return null;
  const mois = MOIS[m[2]] ?? MOIS[m[2].slice(0, 4)] ?? MOIS[m[2].slice(0, 3)];
  if (mois == null) return null;
  return `${m[3]}-${String(mois + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Pure : une carte de comparable, lue ligne à ligne (prix, €/m², surface, adresse, distance, date). */
export function lireCarte(texte) {
  const lignes = String(texte || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const prix = nombre(lignes.find((l) => /€$/.test(l) && !/€\/m²/.test(l)));
  const prixM2 = nombre(lignes.find((l) => /€\/m²$/.test(l)));
  const surface = nombre(lignes.find((l) => /^[\d\s\u202f.,]+\s*m²$/.test(l)));
  const distance = lignes.find((l) => /du bien estimé/.test(l)) || '';
  const d = distance.match(/~?\s*([\d\s.,]+)\s*(km|m)\b/);
  const distanceM = d ? Math.round(nombre(d[1]) * (d[2] === 'km' ? 1000 : 1)) : null;
  const date = dateFr(lignes.find((l) => /\d{4}$/.test(l) && /[a-zéû]/i.test(l) && !/€/.test(l)));
  // L'adresse : la ligne avant « (06) » (les ventes DVF n'ont pas de code postal), sinon celle qui en a un.
  const iDep = lignes.findIndex((l) => /^\(\d{2,3}\)$/.test(l));
  const adresse = (iDep > 0 ? lignes[iDep - 1] : null) || lignes.find((l) => /\(\d{2}\)$/.test(l) || /\d{5}/.test(l)) || null;
  return { prix, prix_m2: prixM2, surface, adresse: adresse ? adresse.replace(/\s*\(\d{2}\)$/, '').trim() : null, distance_m: distanceM, date };
}

const mediane = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/**
 * Pure : les comparables retenus pour une méthode (règle validée par Jules le 26 oct. 2026) : ceux qui ont un prix au
 * m², sans ceux qui s'écartent de plus de 40 % de la médiane, les plus proches d'abord (pour les offres actuelles, les
 * plus récentes départagent), cinq au plus. Chacun garde l'index de sa carte et sa raison.
 */
export function choisirComparables(cartes, { methode = 'offres_actuelles', max = MAX_PAR_METHODE, ecart = ECART_MEDIANE } = {}) {
  const avec = cartes.map((c, index) => ({ ...c, index })).filter((c) => c.prix_m2 > 0);
  const med = mediane(avec.map((c) => c.prix_m2));
  const gardes = avec.filter((c) => !med || Math.abs(c.prix_m2 - med) / med <= ecart);
  const pool = gardes.length ? gardes : avec;
  const tri = [...pool].sort((a, b) => {
    const da = a.distance_m ?? 1e9, db = b.distance_m ?? 1e9;
    // À 250 m près, la plus récente d'abord pour les offres actuelles.
    if (methode === 'offres_actuelles' && Math.abs(da - db) <= 250) return String(b.date || '').localeCompare(String(a.date || ''));
    return da - db;
  });
  return tri.slice(0, max).map((c) => ({
    ...c,
    raison: [c.distance_m != null ? (c.distance_m >= 1000 ? `${(c.distance_m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km` : `${c.distance_m} m`) : null, c.surface ? `${c.surface} m²` : null, c.date ? c.date.slice(0, 7) : null, med ? `${Math.round(((c.prix_m2 - med) / med) * 100)} % de la médiane` : null].filter(Boolean).join(', '),
  }));
}

/** Pure : le rapport Equimmox, lu dans le texte de sa page. null s'il n'a pas de valeur finale. */
export function lireRapport(texte) {
  const t = String(texte || '');
  const lignes = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const iValeur = lignes.findIndex((l) => /^Valeur finale estimée/i.test(l));
  if (iValeur < 0) return null;
  const valeur = nombre(lignes[iValeur + 1]);
  const valeurM2 = nombre((lignes[iValeur + 2] || '').replace(/[()]/g, ''));
  const methodes = [];
  // Le bloc « Méthodes de valorisation utilisées » : « Méthode n : Nom », la valeur, la fourchette ou le taux, « Coefficient : » et sa valeur.
  const debut = lignes.findIndex((l) => /^Méthodes de valorisation utilisées$/i.test(l));
  if (debut >= 0) {
    for (let i = debut + 1; i < lignes.length; i += 1) {
      const m = lignes[i].match(/^Méthode \d : (.+)$/);
      if (!m) continue;
      if (methodes.some((x) => x.nom === m[1])) break; // le détail des méthodes recommence
      const val = nombre(lignes[i + 1]);
      const det = lignes[i + 2] || '';
      const f = det.match(/Fourchette\s*:\s*([\d\s\u202f]+)\s*€\/m²\s*-\s*([\d\s\u202f]+)\s*€\/m².*Moyenne\s*:\s*([\d\s\u202f]+)/);
      const taux = det.match(/Taux de capitalisation\s*:\s*([\d.,]+)/);
      const iCoef = lignes.slice(i, i + 6).findIndex((l) => /^Coefficient/.test(l));
      const coef = iCoef >= 0 ? nombre(lignes[i + iCoef + 1]) : null;
      const cle = /actuelles/i.test(m[1]) ? 'offres_actuelles' : /anciennes/i.test(m[1]) ? 'offres_anciennes' : /DVF|Transactions/i.test(m[1]) ? 'transactions' : /Capitalisation/i.test(m[1]) ? 'capitalisation' : m[1];
      methodes.push({ cle, nom: m[1], valeur: val, bas_m2: f ? nombre(f[1]) : null, haut_m2: f ? nombre(f[2]) : null, moyenne_m2: f ? nombre(f[3]) : null, taux: taux ? nombre(taux[1]) : null, coefficient: coef });
    }
  }
  const apres = (motif, n = 1) => { const i = lignes.findIndex((l) => motif.test(l)); return i >= 0 ? lignes[i + n] : null; };
  const capitalisation = {
    loyer: nombre(apres(/^Loyer annuel$/, 2)),
    taux: nombre(apres(/^Taux de capitalisation$/, 2)),
    brute: nombre(apres(/^Valeur brute$/, 2)),
    investissement: nombre(apres(/^Investissement à prévoir$/, 2)),
    nette: nombre(apres(/^VALEUR NETTE ESTIMÉE$/)),
  };
  // L'environnement : les lignes sous « Environnement et accessibilité », jusqu'à « Synthèse ».
  const iEnv = lignes.findIndex((l) => /^Environnement et accessibilité$/i.test(l));
  const iSyn = lignes.findIndex((l) => /^Synthèse$/i.test(l));
  const environnement = iEnv >= 0 ? lignes.slice(iEnv + 1, iSyn > iEnv ? iSyn : iEnv + 20).filter((l) => !/@|^\d{2} \d{2}|^Klocka$|^Paul De/.test(l)) : [];
  const surface = nombre(apres(/^SURFACE$/));
  return { valeur, valeur_m2: valeurM2, surface, methodes, capitalisation: capitalisation.brute ? capitalisation : null, environnement };
}

/**
 * Pure : la fourchette, la même moyenne pondérée que la valeur, faite sur le bas puis sur le haut de chaque méthode
 * (la capitalisation n'a qu'une valeur). Arrondie à 5 000 €.
 */
export function fourchetteDe(rapport) {
  const ms = (rapport?.methodes || []).filter((m) => m.valeur && m.coefficient);
  const s = rapport?.surface || null;
  if (!ms.length) return null;
  const poids = ms.reduce((t, m) => t + m.coefficient, 0);
  const borne = (cle) => ms.reduce((t, m) => t + m.coefficient * (m[cle] && s ? m[cle] * s : m.valeur), 0) / poids;
  const arr = (v) => Math.round(v / 5000) * 5000;
  const bas = arr(borne('bas_m2')), haut = arr(borne('haut_m2'));
  return { bas: Math.min(bas, rapport.valeur), haut: Math.max(haut, rapport.valeur) };
}

/** Pure : l'état du bien pour Equimmox (Neuf, Bon état, Travaux à prévoir), depuis les réponses de l'avis. */
export function etatEquimmox(q = {}) {
  const l = String(q.etat_local || '').toLowerCase();
  if (l === 'parfait') return /neuf|rénov|renov/i.test(String(q.etat || '')) ? 'Neuf' : 'Bon état';
  if (l === 'usage') return 'Bon état';
  if (l === 'travaux' || l === 'brut') return 'Travaux à prévoir';
  const t = String(q.etat || '').toLowerCase();
  if (/neuf|rénové|renove|refait/.test(t)) return 'Neuf';
  if (/travaux|rénover|renover|vétuste|vetuste|brut/.test(t)) return 'Travaux à prévoir';
  if (/bon|correct|entretenu|usage/.test(t)) return 'Bon état';
  return null;
}

/** Pure : ce qu'il manque pour lancer Equimmox (la liste vide : on peut). */
export function manqueEquimmox({ classe, adresse, surface, etat, loyer, occupe }) {
  return [
    !classe && 'type de bien estimable (murs commerciaux, bureaux, local d\u2019activité)',
    !adresse && 'adresse',
    !(Number(surface) > 0) && 'surface',
    !etat && 'état du bien (neuf, bon état, travaux à prévoir)',
    occupe && !(Number(loyer) > 0) && 'loyer annuel',
  ].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Le parcours dans le navigateur
// ---------------------------------------------------------------------------

const attendre = (p, ms) => p.waitForTimeout(ms);
const texteDe = async (f) => String(await f.evaluate(() => document.body?.innerText || ''));

async function cadreEstimation(p) {
  for (let i = 0; i < 30; i += 1) {
    const f = p.frames().find((x) => /platform\.equimmox\.com\/estimation/.test(x.url()));
    if (f && /Type d.estimation|Classe d.actif|Informations du bien/.test(await texteDe(f).catch(() => ''))) return f;
    await attendre(p, 1000);
  }
  throw new Error('Equimmox : l\u2019écran Estimation ne s\u2019est pas ouvert.');
}

/** Les cartes de l'étape en cours : le texte de chacune, dans l'ordre de l'écran. */
async function cartesDe(f) {
  const reperes = f.locator('text=/du bien estimé/');
  const n = await reperes.count();
  const cartes = [];
  for (let i = 0; i < n; i += 1) {
    const t = await reperes.nth(i).locator('xpath=ancestor::*[contains(., "€/m²")][1]').innerText().catch(() => '');
    cartes.push(lireCarte(t));
  }
  return { reperes, cartes };
}

const suivant = (f) => f.locator('button', { hasText: /^Suivant/ }).first();

/**
 * Le parcours complet. `params` : { classe, adresse, surface, etat, annee, loyer, taux, investissement, occupe }.
 * Rend { ok, rapport, comparables, texte } ou { ok: false, error }.
 */
async function parcours(params, { surEtape = null } = {}) {
  const E = await import('./equimmox.js');
  if (!E.equimmoxConfigure()) return { ok: false, error: 'Equimmox n\u2019est pas configuré (EQUIMMOX_EMAIL, EQUIMMOX_MOT_DE_PASSE).' };
  const { resoudreAdresse } = await import('./adresse-ban.js');
  const ban = await resoudreAdresse(params.adresse).catch(() => null);
  const saisie = ban ? `${ban.numero ? `${ban.numero} ` : ''}${ban.rue}, ${ban.ville}` : String(params.adresse).replace(/\b\d{5}\b\s*/g, '');
  const avecCapitalisation = !!(params.occupe && params.loyer > 0 && params.taux > 0);
  let ctx = null;
  try {
    ctx = await E.contexteEquimmox();
    const p = await ctx.newPage();
    p.on('dialog', (d) => d.accept().catch(() => {}));
    surEtape?.('Equimmox : connexion');
    await E.allerEquimmox(p, 'https://app.equimmox.com');
    await attendre(p, 4000);
    if (/connexion/.test(p.url())) { await E.connecterEquimmox(p); await E.allerEquimmox(p, 'https://app.equimmox.com'); await attendre(p, 4000); }
    for (const t of ['Continuer quand même', 'Je comprends']) { const e = p.locator(`text=${t}`).first(); if (await e.isVisible().catch(() => false)) { await e.click({ force: true }); await attendre(p, 1200); } }
    const menu = p.locator('text=/^Estimation$/').first();
    if (!(await menu.isVisible().catch(() => false))) throw new Error('Equimmox : le menu Estimation est introuvable.');
    await menu.click({ force: true });
    await attendre(p, 3000);
    const plusTard = p.locator('text=Je complèterai plus tard').first();
    if (await plusTard.isVisible().catch(() => false)) { await plusTard.click({ force: true }); await attendre(p, 2000); }
    const f = await cadreEstimation(p);

    surEtape?.(`Equimmox : estimation de prix de vente, classe ${params.classe}`);
    await f.locator('text=Estimation de prix de vente').first().click();
    await attendre(p, 2500);
    await f.locator(`text=/^${params.classe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$/`).first().click();
    await attendre(p, 800);
    await suivant(f).click();
    await attendre(p, 2500);

    surEtape?.(`Equimmox : ${saisie}, ${params.surface} m², ${params.etat.toLowerCase()}`);
    const adr = f.locator('input').first();
    await adr.click();
    await adr.type(saisie, { delay: 50 });
    await attendre(p, 3500);
    const motRue = (ban?.rue || saisie.split(',')[0]).replace(/^\d+\s*(bis|ter)?\s*/i, '').trim().split(/\s+/).slice(-1)[0];
    // La suggestion porte la rue et le code postal (« 1 Avenue Mirabeau 06000 Nice »).
    const sugg = f.getByText(new RegExp(`${motRue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\d{5}`, 'i')).first();
    if (!(await sugg.isVisible().catch(() => false))) throw new Error(`Equimmox ne propose aucune adresse pour « ${saisie} ».`);
    await sugg.click();
    await attendre(p, 2500);
    await f.locator('input[placeholder="Surface"]').first().fill(String(Math.round(params.surface)));
    if (params.annee) await f.locator('input[placeholder="1990"]').first().fill(String(params.annee)).catch(() => {});
    await f.locator(`text=/^${params.etat}$/`).first().click();
    await attendre(p, 600);
    await suivant(f).click();
    await attendre(p, 3000);
    if (/Veuillez sélectionner|doivent être supérieures/.test(await texteDe(f))) throw new Error('Equimmox refuse les informations du bien (adresse ou surface).');

    surEtape?.(`Equimmox : méthodes ${avecCapitalisation ? '2-1-1-2' : '2-1-1 (sans loyer, pas de capitalisation)'}`);
    const choisies = METHODES.filter(([cle]) => cle !== 'capitalisation' || avecCapitalisation);
    for (const [, libelle] of choisies) { await f.locator(`text=${libelle}`).first().click(); await attendre(p, 500); }
    const coefs = f.locator('input[type=number]');
    for (let i = 0; i < choisies.length; i += 1) await coefs.nth(i).fill(String(COEFFICIENTS[choisies[i][0]]));
    await attendre(p, 600);
    await suivant(f).click();

    const comparables = {};
    for (const [cle, , nom] of choisies.filter(([c]) => c !== 'capitalisation')) {
      await attendre(p, 7000);
      let { reperes, cartes } = await cartesDe(f);
      if (!cartes.length) {
        // Aucune carte : le rayon s'élargit une fois (3 km), puis on renonce.
        await f.locator('input[type=number]').first().fill('3000').catch(() => {});
        await f.locator('button', { hasText: /Appliquer/ }).first().click().catch(() => {});
        await attendre(p, 7000);
        ({ reperes, cartes } = await cartesDe(f));
      }
      if (!cartes.length) throw new Error(`Equimmox : aucun comparable pour « ${nom} », même à 3 km.`);
      const retenus = choisirComparables(cartes, { methode: cle });
      for (const c of retenus) { await reperes.nth(c.index).click({ force: true }); await attendre(p, 400); }
      comparables[cle] = { proposes: cartes.length, retenus: retenus.map(({ index, ...c }) => c) };
      surEtape?.(`Equimmox : ${nom}, ${retenus.length} retenu${retenus.length > 1 ? 's' : ''} sur ${cartes.length}`);
      await attendre(p, 800);
      await suivant(f).click();
    }

    if (avecCapitalisation) {
      await attendre(p, 4000);
      surEtape?.(`Equimmox : capitalisation, ${Math.round(params.loyer).toLocaleString('fr-FR')} € à ${String(params.taux).replace('.', ',')} %`);
      const cap = f.locator('input[type=number]');
      await cap.nth(0).fill(String(Math.round(params.loyer)));
      await cap.nth(1).fill(String(params.taux));
      if (params.investissement > 0) await cap.nth(2).fill(String(Math.round(params.investissement)));
      await attendre(p, 600);
    }
    surEtape?.('Equimmox : génération du rapport');
    await f.locator('button', { hasText: /Générer le rapport/ }).first().click();
    let rapport = null, texte = '';
    for (let i = 0; i < 60 && !rapport; i += 1) {
      await attendre(p, 2000);
      const r = p.frames().find((x) => /estimation\/report/.test(x.url()));
      if (!r) continue;
      texte = await texteDe(r).catch(() => '');
      if (/Chargement…|Chargement\.\.\./.test(texte) && i < 20) continue;
      rapport = lireRapport(texte);
    }
    if (!rapport?.valeur) throw new Error('Equimmox n\u2019a pas rendu de rapport lisible.');
    await ctx.storageState({ path: E.SESSION_EQUIMMOX }).catch(() => {});
    return { ok: true, rapport, comparables, texte: texte.slice(0, 20000) };
  } catch (e) {
    return { ok: false, error: e?.message || 'Equimmox n\u2019a pas répondu.' };
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    await E.fermerNavigateurEquimmox();
  }
}

/**
 * L'estimation Equimmox d'une estimation du mandataire : le parcours (dans la file Equimmox), puis le résultat gardé
 * sur l'estimation (`equimmox`), source de l'avis et du deck. Rend { ok, equimmox } ou { ok: false, error, manque }.
 */
export async function estimerSurEquimmox(estimationId, params, { surEtape = null, user = null } = {}) {
  const manque = manqueEquimmox(params);
  if (manque.length) return { ok: false, manque, error: `Pour Equimmox, il manque : ${manque.join(', ')}.` };
  const E = await import('./equimmox.js');
  const r = await E.fileEquimmox(() => parcours(params, { surEtape }));
  if (!r.ok) return r;
  const equimmox = {
    le: new Date().toISOString(), par: user?.email || null,
    params: { ...params },
    coefficients: COEFFICIENTS,
    rapport: r.rapport,
    fourchette: fourchetteDe(r.rapport),
    comparables: r.comparables,
    source: 'Equimmox · Estimation multicritères',
  };
  if (estimationId && Records.get('EstimationMandataire', estimationId)) Records.update('EstimationMandataire', estimationId, { equimmox });
  console.log(`[equimmox] estimation : ${r.rapport.valeur.toLocaleString('fr-FR')} € pour « ${params.adresse} »${user?.email ? ` (${user.email})` : ''}`);
  return { ok: true, equimmox };
}
