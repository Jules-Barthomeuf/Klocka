// Off-market, mode Simple : les versions du score « Zone » (11 oct. 2026).
// La version 0 est la somme pondérée (score.js), dont les poids bougent après
// chaque jugement. À partir de 150 jugements exploitables, une régression
// logistique est entraînée chaque nuit à 3 h (Render seulement, ou à la main
// depuis la page admin) ; elle ne remplace la version active que si elle la
// bat d'au moins 0,02 d'AUC sur les mêmes exemples mis de côté. Chaque
// changement est journalisé, et on peut revenir à la version d'avant.
//
// Le gradient boosting (prévu à partir de 500 jugements) n'est pas écrit : il
// le sera quand on en approchera, avec la même validation.

import { Records } from '../../db.js';
import { CONFIG, POIDS_INITIAUX, ajusterPoids, scoreRegles } from './score.js';
import { auc, decoupageStratifie, entrainer, precisionHaut, raisonsLogistique, scoreLogistique } from './logistique.js';

export const MODELE = 'ZoneModele';
export const JUGEMENT = 'ZoneJugement';
export const JOURNAL = 'ZoneJournal';
const maintenant = () => new Date().toISOString();

export function journaliser(type, detail = {}) {
  return Records.create(JOURNAL, { type, ...detail, le: maintenant() });
}

/** Les versions, la plus récente d'abord. */
export const versions = () => Records.list(MODELE).sort((a, b) => b.version - a.version);

/** La version active ; à la première lecture, la version 0 à règles est créée avec les poids de départ. */
export function modeleActif() {
  const actif = Records.list(MODELE).find((m) => m.actif);
  if (actif) return actif;
  if (Records.list(MODELE).length) return versions()[0];
  const m = Records.create(MODELE, { version: 0, type: 'regles', parametres: { poids: { ...POIDS_INITIAUX } }, metriques: {}, trained_at: maintenant(), nb_exemples: 0, actif: true, active_depuis: maintenant() });
  journaliser('creation', { version: 0, detail: 'version à règles, poids de poids-v0.json' });
  return m;
}

/** Pure : le score d'un point par une version donnée : { score, raisons, version }. */
export function scorer(f, modele) {
  if (!modele) return { score: null, raisons: [], version: null };
  if (modele.type === 'logistique') return { score: scoreLogistique(f, modele.parametres), raisons: raisonsLogistique(f, modele.parametres), version: modele.version };
  const r = scoreRegles(f, modele.parametres?.poids);
  return { ...r, version: modele.version };
}

/**
 * Pure : les jugements qui servent à apprendre. Le dernier jugement de chaque
 * point fait foi ; « À revoir » et un jugement sans explication n'entrent
 * jamais. Les caractéristiques sont celles gardées au moment du jugement.
 */
export function exemplesExploitables(jugements) {
  const dernier = new Map();
  for (const j of jugements) {
    const d = dernier.get(j.point_id);
    if (!d || String(j.created_at) > String(d.created_at)) dernier.set(j.point_id, j);
  }
  return [...dernier.values()]
    .filter((j) => (j.verdict === 'interessant' || j.verdict === 'pas_interessant') && String(j.commentaire || '').trim().length >= 3 && j.features_snapshot)
    .map((j) => ({ f: j.features_snapshot, y: j.verdict === 'interessant' ? 1 : 0, le: j.created_at, point_id: j.point_id }));
}

/** Pure : un nouveau modèle ne remplace l'actif que s'il le bat d'au moins `gain` d'AUC. Sans AUC mesurable pour l'actif, il le remplace s'il en a une. */
export function choisirActivation(aucNouveau, aucActif, gain = CONFIG.gain_auc_minimum) {
  if (aucNouveau == null) return false;
  if (aucActif == null) return true;
  return aucNouveau >= aucActif + gain - 1e-9;
}

/** Rend une version active (et seulement elle). */
export function activer(id, { motif = null } = {}) {
  const m = Records.get(MODELE, id);
  if (!m) return null;
  for (const x of Records.list(MODELE)) if (x.actif && x.id !== id) Records.update(MODELE, x.id, { actif: false });
  const a = Records.update(MODELE, id, { actif: true, active_depuis: maintenant() });
  journaliser('activation', { version: m.version, motif });
  return a;
}

/** Revient à la version active juste avant celle-ci. */
export function revenir() {
  const actuel = modeleActif();
  const avant = Records.list(MODELE).filter((m) => m.id !== actuel.id && m.active_depuis).sort((a, b) => String(b.active_depuis).localeCompare(String(a.active_depuis)))[0];
  if (!avant) return { ok: false, error: 'Aucune version précédente à rétablir.' };
  activer(avant.id, { motif: `retour depuis la version ${actuel.version}` });
  return { ok: true, version: avant.version };
}

/** Après un jugement : la version à règles bouge ses poids ; une version apprise attend la nuit. */
export function ajusterApresJugement(j) {
  const m = modeleActif();
  if (m.type !== 'regles' || !j?.features_snapshot) return null;
  const { poids, journal } = ajusterPoids(m.parametres.poids, j.features_snapshot, j.verdict);
  if (!journal.length) return null;
  Records.update(MODELE, m.id, { parametres: { ...m.parametres, poids } });
  journaliser('ajustement', { version: m.version, jugement_id: j.id, verdict: j.verdict, changements: journal });
  return journal;
}

/**
 * L'entraînement : 20 % des exemples mis de côté (même part d'intéressants),
 * une régression sur le reste, comparée à la version active sur ces mêmes
 * exemples. Gardée dans tous les cas ; activée seulement si elle gagne.
 */
export function trainZoneModel({ forcer = false, maintenantD = new Date(), graine = 7, jugements = null } = {}) {
  const ex = exemplesExploitables(jugements || Records.list(JUGEMENT));
  const minimum = CONFIG.jugements_pour_apprendre;
  if (ex.length < minimum && !forcer) {
    journaliser('entrainement_reporte', { exemples: ex.length, minimum });
    return { ok: false, raison: `${ex.length} jugements exploitables sur les ${minimum} qu'il faut pour apprendre.`, exemples: ex.length };
  }
  const y = ex.map((e) => e.y);
  if (!y.some(Boolean) || y.every(Boolean)) {
    journaliser('entrainement_reporte', { exemples: ex.length, motif: 'une seule sorte de verdict' });
    return { ok: false, raison: 'Il faut des points intéressants et des points sans intérêt pour apprendre.', exemples: ex.length };
  }
  const test = decoupageStratifie(y, { graine });
  const app = ex.filter((_, i) => !test.has(i));
  const val = ex.filter((_, i) => test.has(i));
  const parametres = entrainer(app.map((e) => e.f), app.map((e) => e.y));
  const nouveau = { type: 'logistique', parametres };
  const actif = modeleActif();
  const cibles = val.map((e) => e.y);
  const sNouveau = val.map((e) => scorer(e.f, nouveau).score);
  const sActif = val.map((e) => scorer(e.f, actif).score ?? 50);
  const semaine = new Date(maintenantD.getTime() - 7 * 864e5).toISOString();
  const recents = ex.filter((e) => String(e.le) >= semaine);
  const metriques = {
    auc: auc(sNouveau, cibles),
    auc_actif: auc(sActif, cibles),
    version_actif: actif.version,
    precision_20: precisionHaut(sNouveau, cibles, 20),
    accord_7j: recents.length ? recents.filter((e) => (scorer(e.f, nouveau).score >= 50 ? 1 : 0) === e.y).length / recents.length : null,
    n_apprentissage: app.length,
    n_validation: val.length,
  };
  const version = Math.max(0, ...Records.list(MODELE).map((m) => m.version)) + 1;
  const m = Records.create(MODELE, { version, type: 'logistique', parametres, metriques, trained_at: maintenantD.toISOString(), nb_exemples: ex.length, actif: false });
  const gagne = choisirActivation(metriques.auc, metriques.auc_actif);
  journaliser('entrainement', { version, metriques, active: gagne });
  if (gagne) activer(m.id, { motif: `AUC ${metriques.auc?.toFixed(3)} contre ${metriques.auc_actif?.toFixed(3) ?? '?'} pour la version ${actif.version}` });
  else journaliser('refus', { version, motif: `AUC ${metriques.auc?.toFixed(3) ?? '?'} : pas assez au-dessus de la version ${actif.version} (${metriques.auc_actif?.toFixed(3) ?? '?'}, il faut +${CONFIG.gain_auc_minimum})` });
  return { ok: true, version, active: gagne, metriques };
}

/** Chaque nuit à 3 h (heure de Paris), sur Render seulement, ou si ZONE_AUTO=true : un entraînement par nuit. */
export function planifier() {
  if (!process.env.RENDER && process.env.ZONE_AUTO !== 'true') return null;
  const tour = async () => {
    const { heureDe, jourDe } = await import('../../prospection/regles.js');
    const now = new Date();
    if (heureDe(now) !== 3) return;
    if (Records.filter(JOURNAL, { type: 'nuit' }).some((j) => jourDe(new Date(j.le)) === jourDe(now))) return;
    try {
      const r = trainZoneModel({ maintenantD: now });
      journaliser('nuit', { resultat: r.ok ? `version ${r.version}${r.active ? ' active' : ' refusée'}` : r.raison });
    } catch (e) { console.error('[zone] entraînement impossible :', e?.message || e); }
  };
  const t = setInterval(tour, 15 * 60 * 1000);
  t.unref?.();
  return t;
}
