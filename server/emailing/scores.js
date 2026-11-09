// Les scores MQL et SQL (8 nov. 2026, Jules). Deux questions différentes :
//   MQL : cette personne s'intéresse-t-elle à l'immobilier commercial ? (ce qu'elle lit, clique, prend)
//   SQL : est-elle prête à parler affaires avec nous ? (call pris, réponse positive, budget donné, fiche envoyée)
// Les points perdent de leur valeur avec le temps : un clic d'il y a six mois ne dit plus rien. Le barème se règle
// à l'écran (page Scores) et le stade se lit Lead, MQL, SQL.

import { Records, Meta } from '../db.js';
import { E } from './schema.js';
import { emettre, evenementsDe, maintenant } from './journal.js';

const CLE = 'emailing:bareme';

export const BAREME_DEFAUT = {
  seuil_mql: 40,
  seuil_sql: 60,
  demi_vie_mql: 45,
  demi_vie_sql: 90,
  mql: [
    { evenement: 'ouvert', points: 1, plafond: 8, libelle: 'Mail ouvert' },
    { evenement: 'clique', points: 4, plafond: 20, libelle: 'Lien cliqué' },
    { evenement: 'lead_magnet_pris', points: 20, plafond: 40, libelle: 'Lead magnet pris' },
    { evenement: 'simulateur', points: 12, plafond: 24, libelle: 'Simulateur utilisé' },
    { evenement: 'quiz', points: 12, plafond: 12, libelle: 'Quiz terminé' },
    { evenement: 'vision', points: 12, plafond: 12, libelle: 'Vision retraite remplie' },
    { evenement: 'webinaire_inscrit', points: 10, plafond: 20, libelle: 'Inscrit à un webinaire' },
    { evenement: 'webinaire_present', points: 25, plafond: 50, libelle: 'Présent au webinaire' },
    { evenement: 'reponse', points: 10, plafond: 20, libelle: 'A répondu à un mail' },
    { evenement: 'clic_call', points: 15, plafond: 30, libelle: 'A cliqué pour un call' },
  ],
  sql: [
    { evenement: 'call_pris', points: 60, plafond: 60, libelle: 'Call pris' },
    { evenement: 'reponse_positive', points: 35, plafond: 70, libelle: 'Réponse positive' },
    { evenement: 'clic_call', points: 15, plafond: 30, libelle: 'A cliqué pour un call' },
    { evenement: 'fiche_recue', points: 50, plafond: 100, libelle: 'Fiche envoyée (agent)' },
    { evenement: 'appel_interesse', points: 30, plafond: 60, libelle: 'Intéressé au téléphone' },
    { evenement: 'desinteret', points: -40, plafond: 0, libelle: 'A dit ne pas être intéressé' },
  ],
  profil: [
    { champ: 'budget', points: 15, libelle: 'Budget renseigné' },
    { champ: 'objectif_revenu', points: 10, libelle: 'Objectif de revenu renseigné' },
    { champ: 'horizon', points: 5, libelle: 'Horizon renseigné' },
  ],
};

export function bareme() {
  const lu = Meta.get(CLE);
  try { return lu ? { ...BAREME_DEFAUT, ...(typeof lu === 'string' ? JSON.parse(lu) : lu) } : BAREME_DEFAUT; } catch { return BAREME_DEFAUT; }
}

/** Enregistre un barème après l'avoir nettoyé. */
export function poserBareme(b) {
  const nombre = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const regles = (l, modele) => (Array.isArray(l) ? l : modele).filter((r) => r?.evenement).map((r) => ({ evenement: String(r.evenement), points: nombre(r.points, -100, 100, 0), plafond: nombre(r.plafond, 0, 100, 0), libelle: String(r.libelle || r.evenement) }));
  const propre = {
    seuil_mql: nombre(b?.seuil_mql, 1, 100, BAREME_DEFAUT.seuil_mql), seuil_sql: nombre(b?.seuil_sql, 1, 100, BAREME_DEFAUT.seuil_sql),
    demi_vie_mql: nombre(b?.demi_vie_mql, 1, 720, BAREME_DEFAUT.demi_vie_mql), demi_vie_sql: nombre(b?.demi_vie_sql, 1, 720, BAREME_DEFAUT.demi_vie_sql),
    mql: regles(b?.mql, BAREME_DEFAUT.mql), sql: regles(b?.sql, BAREME_DEFAUT.sql),
    profil: (Array.isArray(b?.profil) ? b.profil : BAREME_DEFAUT.profil).filter((r) => r?.champ).map((r) => ({ champ: String(r.champ), points: nombre(r.points, -100, 100, 0), libelle: String(r.libelle || r.champ) })),
  };
  Meta.set(CLE, JSON.stringify(propre));
  return { ok: true, bareme: propre };
}

const vieillir = (points, ageJours, demiVie) => points * 0.5 ** (Math.max(0, ageJours) / demiVie);

function total(regles, evenements, demiVie, quand) {
  const raisons = [];
  let somme = 0;
  for (const r of regles) {
    const siens = evenements.filter((e) => e.type === r.evenement);
    if (!siens.length) continue;
    let brut = siens.reduce((s, e) => s + vieillir(r.points, (quand - Date.parse(e.le)) / 86400000, demiVie), 0);
    if (r.points > 0 && r.plafond) brut = Math.min(brut, r.plafond);
    somme += brut;
    if (Math.round(brut)) raisons.push({ libelle: r.libelle, points: Math.round(brut), fois: siens.length });
  }
  return { somme, raisons };
}

/** Pure : les deux scores d'un contact et ce qui les explique. */
export function calculer(evenements, contact = {}, b = BAREME_DEFAUT, quand = Date.now()) {
  const borner = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const m = total(b.mql, evenements, b.demi_vie_mql, quand);
  const s = total(b.sql, evenements, b.demi_vie_sql, quand);
  for (const p of b.profil) {
    if (String(contact.champs?.[p.champ] ?? '').trim()) {
      s.somme += p.points;
      s.raisons.push({ libelle: p.libelle, points: p.points, fois: 1 });
    }
  }
  const mql = borner(m.somme);
  const sql = borner(s.somme);
  return { mql, sql, stade: stadeDe(mql, sql, b), raisons_mql: m.raisons.sort((x, y) => y.points - x.points), raisons_sql: s.raisons.sort((x, y) => y.points - x.points) };
}

/** Pure : le stade d'après les deux scores. */
export const stadeDe = (mql, sql, b = BAREME_DEFAUT) => (sql >= b.seuil_sql ? 'sql' : mql >= b.seuil_mql ? 'mql' : 'lead');

const RANG = { lead: 0, mql: 1, sql: 2 };

async function prevenirSql(c, s) {
  if (process.env.NODE_TEST_CONTEXT) return;
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || c.email;
  try {
    (await import('../notifications.js')).notifier({ pour: c.suivi_par || null, titre: `${nom} est prêt à parler affaires`, texte: s.raisons_sql.slice(0, 3).map((r) => r.libelle).join(', '), lien: `/Emailing?p=contacts&c=${c.id}`, genre: 'succes', cle: `sql:${c.id}:${maintenant().slice(0, 7)}` });
    if (c.monday_id && (process.env.RENDER || process.env.EMAILING_REEL === 'true')) {
      await (await import('../monday.js')).commenter(c.monday_id, `Emailing : passé SQL (score ${s.sql}). ${s.raisons_sql.slice(0, 3).map((r) => r.libelle).join(', ')}.`);
    }
  } catch (e) { console.warn('[emailing] prévenir SQL :', e?.message || e); }
}

/** Recalcule un contact, enregistre si ça a changé, et annonce une montée de stade. Rend le contact à jour. */
export function recalculer(contactId, { quand = Date.now() } = {}) {
  const c = Records.get(E.CONTACT, contactId);
  if (!c) return null;
  const s = calculer(evenementsDe(c.email), c, bareme(), quand);
  const avant = c.stade || 'lead';
  if (c.score_mql === s.mql && c.score_sql === s.sql && avant === s.stade) return c;
  const maj = Records.update(E.CONTACT, c.id, { score_mql: s.mql, score_sql: s.sql, stade: s.stade, ...(avant !== s.stade ? { stade_le: new Date(quand).toISOString() } : {}), score_raisons: { mql: s.raisons_mql.slice(0, 5), sql: s.raisons_sql.slice(0, 5) } });
  if (RANG[s.stade] > RANG[avant]) {
    // Une seule annonce par stade et par mois : une note qui oscille autour du seuil ne relance pas les automatisations.
    emettre(`devenu_${s.stade}`, { email: c.email, contact_id: c.id, source: 'score', charge: { mql: s.mql, sql: s.sql }, cle: `stade:${s.stade}:${c.id}:${new Date(quand).toISOString().slice(0, 7)}` });
    if (s.stade === 'sql') prevenirSql(maj, s);
  }
  return maj;
}

/** Une fois par jour : les points vieillissent, les stades se corrigent. */
export function tourScores({ quand = new Date() } = {}) {
  const jour = quand.toISOString().slice(0, 10);
  if (Meta.get('emailing:scores_le') === jour) return 0;
  Meta.set('emailing:scores_le', jour);
  let n = 0;
  for (const c of Records.list(E.CONTACT)) {
    if (!c.score_mql && !c.score_sql) continue;
    recalculer(c.id, { quand: quand.getTime() });
    n += 1;
  }
  return n;
}

/** Recalcule tout, après un changement de barème. */
export function toutRecalculer() {
  let n = 0;
  for (const c of Records.list(E.CONTACT)) { recalculer(c.id); n += 1; }
  return n;
}

/** Combien de contacts à chaque stade. */
export function repartition() {
  const r = { lead: 0, mql: 0, sql: 0 };
  for (const c of Records.list(E.CONTACT)) r[c.stade || 'lead'] += 1;
  return r;
}
