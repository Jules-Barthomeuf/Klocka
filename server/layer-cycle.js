// Le Layer, phase 4 (15 oct. 2026) : le cycle de vie des faits et la validation sans goulot.
//
// Après chaque extraction, une tâche `controler` passe sur les faits nouveaux :
//   1. leurs embeddings (pour comparer le sens) ;
//   2. les contradictions : un fait validé de la même fiche, du même type, sur
//      le même sujet (sens proche), et qui dit autre chose, selon un modèle
//      rapide. Le nouveau fait porte alors une proposition « remplace le fait X ? »
//      que le validateur tranche (remplacer, ou garder les deux) ;
//   3. la validation automatique, si tout est sûr : citation retrouvée mot pour
//      mot, confiance ≥ 0,9, rattachement sans ambiguïté (au moins une fiche,
//      aucun candidat en suspens), pas de contradiction. Statut `valide`,
//      `mode_validation: 'auto'`, toujours corrigeable ;
//   4. sinon, le fait va à son validateur : l'auteur de la source pour un
//      appel ou un débrief (l'analyste), Jules pour une réunion, un compte
//      rendu, un mail, un événement Monday. Jules voit tout.
// Chaque nuit (`planifier`) : les engagements dont l'échéance est passée
// d'un jour deviennent `echu`, et les faits dont toutes les fiches sont
// fermées (agent archivé ou « ne plus appeler », projet vendu) sont archivés.
// Le savoir n'est jamais archivé : il vaut au-delà d'une fiche.
//
// Toute bascule (auto, remplacement, échéance, archivage) laisse sa trace dans
// l'audit. Objectif mesuré : moins de 20 % de validation manuelle après deux
// semaines (`partManuelle`).

import { Records } from './db.js';
import { auditer } from './layer-schema.js';
import { enfiler, enregistrer } from './layer-taches.js';
import { ficheChangee } from './layer-syntheses.js';

const FAIT = 'CerveauFait';
const LIEN = 'CerveauLien';
const SOURCE = 'CerveauSource';
export const SEUIL_CONFIANCE = 0.9;
// Au-delà de ce cosinus, deux faits parlent du même sujet (vecteurs mistral-embed de norme 1).
export const SEUIL_MEME_SUJET = 0.82;
export const MODELE_RAPIDE = 'claude-haiku-4-5';
// Les sources dont l'auteur valide lui-même ses faits ; les autres vont à Jules.
const PAR_L_AUTEUR = ['appel', 'debrief'];

const maintenant = () => new Date().toISOString();
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const mots = (t) => new Set(norm(t).split(' ').filter((m) => m.length > 2));
const jaccard = (a, b) => { const x = mots(a); const y = mots(b); let c = 0; for (const m of x) if (y.has(m)) c += 1; return x.size + y.size - c ? c / (x.size + y.size - c) : 0; };
const liensDe = (faitId) => Records.list(LIEN).filter((l) => l.fait_id === faitId);
const superAdmins = () => (process.env.SUPER_ADMIN_EMAILS || 'jules.b@klocka.immo,jules.btmf@gmail.com,admin@klocka.local').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Pure : le validateur d'un fait selon sa source. Null : Jules (les super-admins). */
export function validateurDe(source) {
  if (source && PAR_L_AUTEUR.includes(source.type) && source.auteur) return String(source.auteur).toLowerCase();
  return null;
}

/** Peut-il valider ce fait ? Jules toujours ; sinon le validateur désigné. */
export function peutValiderFait(user, fait) {
  const e = String(user?.email || '').toLowerCase();
  if (!e || user?.role !== 'admin') return false;
  if (superAdmins().includes(e)) return true;
  return !!fait?.validateur && fait.validateur === e;
}

/** Pure : les raisons pour lesquelles un fait ne peut pas être validé seul (vide : il peut). */
export function obstaclesAuto(fait, { liens = [] } = {}) {
  const o = [];
  if (fait.statut !== 'a_valider') o.push(fait.statut === 'a_rattacher' ? 'rattachement ambigu' : `statut ${fait.statut}`);
  if (!fait.citation_verifiee) o.push('citation introuvable mot pour mot');
  if (!(Number(fait.confiance) >= SEUIL_CONFIANCE)) o.push(`confiance ${fait.confiance ?? 'absente'} < ${SEUIL_CONFIANCE}`);
  if (!liens.length) o.push('aucune fiche rattachée');
  if (fait.contradiction) o.push('contredit un fait validé');
  return o;
}

/** Les faits validés qui parlent du même sujet sur la même fiche, du plus proche au moins proche. */
export function memeSujet(fait, { vecteurs = null } = {}) {
  const fiches = new Set(liensDe(fait.id).map((l) => `${l.type_entite}:${l.entite_id}`));
  if (!fiches.size) return [];
  const voisins = new Set(Records.list(LIEN).filter((l) => fiches.has(`${l.type_entite}:${l.entite_id}`) && l.fait_id !== fait.id).map((l) => l.fait_id));
  const vf = vecteurs?.get(fait.id);
  return [...voisins].map((id) => Records.get(FAIT, id)).filter((f) => f && f.statut === 'valide' && f.type === fait.type && f.resume !== fait.resume)
    .map((f) => ({ f, proche: vf && vecteurs.get(f.id) ? cosinusRapide(vf, vecteurs.get(f.id)) : jaccard(f.resume, fait.resume) }))
    // Sans vecteurs, les mots communs (seuil bas : le juge tranche ensuite chaque paire, sur la même fiche et le même type).
    .filter((x) => x.proche >= (vf ? SEUIL_MEME_SUJET : 0.2))
    .sort((a, b) => b.proche - a.proche);
}
const cosinusRapide = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += a[i] * b[i]; return s; };

const SCHEMA_CONTRADICTION = {
  type: 'object',
  properties: { contredit: { type: 'boolean' }, raison: { type: 'string', description: 'une phrase : en quoi le nouveau fait rend l\'ancien faux ou dépassé, ou pourquoi les deux tiennent ensemble' } },
  required: ['contredit', 'raison'],
};

/** Le modèle rapide tranche : le nouveau fait rend-il l'ancien faux ou dépassé ? */
export async function contredit(nouveau, ancien, { juge = null } = {}) {
  if (juge) return juge(nouveau, ancien);
  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const prompt = `Deux faits de la mémoire de Klocka (immobilier commercial), sur la même fiche.
ANCIEN (validé) : « ${ancien.resume} »${ancien.citation ? ` — source : « ${String(ancien.citation).slice(0, 300)} »` : ''}
NOUVEAU : « ${nouveau.resume} »${nouveau.citation ? ` — source : « ${String(nouveau.citation).slice(0, 300)} »` : ''}
Le NOUVEAU rend-il l'ANCIEN faux ou dépassé ? Si la situation décrite par l'ANCIEN a changé depuis (un bien vendu ou retiré, un chiffre différent, une décision revue, un statut ou une date qui a bougé), l'ANCIEN est dépassé : contredit = true, même si le NOUVEAU raconte une suite logique. contredit = false seulement si l'ANCIEN reste vrai tel quel (le NOUVEAU ajoute un détail, une action à venir, ou dit la même chose autrement).`;
  const { resultat } = await mesurer({ operation: 'cerveau', libelle: 'contradiction', sur: nouveau.id }, () => invokeLLM({ prompt, response_json_schema: SCHEMA_CONTRADICTION, modele: MODELE_RAPIDE, max_tokens: 800 }));
  return { contredit: !!resultat?.contredit, raison: String(resultat?.raison || '').slice(0, 300) };
}

/**
 * Le contrôle des faits nouveaux d'une source : embeddings, contradictions,
 * validation automatique ou validateur désigné. Rend ce qui a été fait.
 */
export async function controler(sourceId, { juge = null, embedder = true } = {}) {
  const source = Records.get(SOURCE, sourceId);
  if (!source) return { ok: false, error: 'Source introuvable.' };
  const faits = Records.list(FAIT).filter((f) => f.source_id === sourceId && (f.statut === 'a_valider' || f.statut === 'a_rattacher'));
  if (!faits.length) return { ok: true, auto: 0, manuels: 0, contradictions: 0 };
  let vecteurs = null;
  try {
    const R = await import('./layer-recherche.js');
    if (embedder && (process.env.MISTRAL_API_KEY || '').trim()) await R.embedderFaits(faits.map((f) => f.id));
    vecteurs = R.vecteursDe([...new Set(faits.flatMap((f) => [f.id, ...voisinsIds(f)]))]);
  } catch { vecteurs = null; }
  let auto = 0; let manuels = 0; let contradictions = 0;
  for (const f of faits) {
    // La contradiction : le plus proche voisin de même sujet, jugé.
    for (const { f: ancien } of memeSujet(f, { vecteurs }).slice(0, 2)) {
      try {
        const j = await contredit(f, ancien, { juge });
        if (j.contredit) { Records.update(FAIT, f.id, { contradiction: { fait_id: ancien.id, raison: j.raison, resume: ancien.resume } }); contradictions += 1; break; }
      } catch { /* le juge ne répond pas : pas d'auto-validation sans lui */ Records.update(FAIT, f.id, { contradiction_inconnue: true }); }
    }
    const frais = Records.get(FAIT, f.id);
    const obstacles = [...obstaclesAuto(frais, { liens: liensDe(f.id) }), ...(frais.contradiction_inconnue ? ['contradiction non vérifiée'] : [])];
    if (!obstacles.length) {
      Records.update(FAIT, f.id, { statut: 'valide', mode_validation: 'auto', valide_par: 'auto', valide_le: maintenant(), candidats: [] });
      auditer({ par: 'auto', action: 'valider_auto', fait_id: f.id, avant: { statut: frais.statut }, apres: { statut: 'valide', confiance: frais.confiance } });
      ficheChangee(f.id);
      auto += 1;
    } else {
      Records.update(FAIT, f.id, { validateur: validateurDe(source), obstacles });
      manuels += 1;
    }
  }
  return { ok: true, auto, manuels, contradictions };
}
/** Les faits validés du même type qui partagent une fiche avec celui-ci (les candidats au même sujet). */
function voisinsIds(f) {
  const fiches = new Set(liensDe(f.id).map((l) => `${l.type_entite}:${l.entite_id}`));
  return [...new Set(Records.list(LIEN).filter((l) => fiches.has(`${l.type_entite}:${l.entite_id}`) && l.fait_id !== f.id).map((l) => l.fait_id))]
    .filter((id) => { const x = Records.get(FAIT, id); return x && x.statut === 'valide' && x.type === f.type; });
}
enregistrer('controler', async ({ source_id }) => { const r = await controler(source_id); if (!r.ok) throw new Error(r.error); });

/** Met le contrôle d'une source en file (après son extraction). */
export const planifierControle = (sourceId) => enfiler('controler', { source_id: sourceId }, { cle: `controler:${sourceId}` });

/** Le nouveau fait remplace l'ancien : l'ancien passe « remplacé », avec un lien vers son successeur. Le nouveau est validé. */
export function remplacer(nouveauId, ancienId, { par }) {
  const n = Records.get(FAIT, nouveauId); const a = Records.get(FAIT, ancienId);
  if (!n || !a) return { ok: false, error: 'Fait introuvable.' };
  Records.update(FAIT, a.id, { statut: 'remplace', remplace_par: n.id, remplace_le: maintenant() });
  auditer({ par, action: 'remplacer', fait_id: a.id, avant: { statut: a.statut }, apres: { statut: 'remplace', remplace_par: n.id } });
  Records.update(FAIT, n.id, { statut: 'valide', mode_validation: 'manuel', valide_par: par, valide_le: maintenant(), contradiction: null, candidats: [] });
  auditer({ par, action: 'valider', fait_id: n.id, avant: { statut: n.statut }, apres: { statut: 'valide', remplace: a.id } });
  ficheChangee(a.id); ficheChangee(n.id);
  return { ok: true };
}

/** Les deux tiennent ensemble : la proposition tombe, le nouveau reste à valider (ou se valide si on le dit). */
export function garderLesDeux(nouveauId, { par, valider = true }) {
  const n = Records.get(FAIT, nouveauId);
  if (!n) return { ok: false, error: 'Fait introuvable.' };
  Records.update(FAIT, n.id, { contradiction: null, ...(valider ? { statut: 'valide', mode_validation: 'manuel', valide_par: par, valide_le: maintenant(), candidats: [] } : {}) });
  auditer({ par, action: 'garder_les_deux', fait_id: n.id, avant: { contradiction: n.contradiction }, apres: { contradiction: null, statut: valider ? 'valide' : n.statut } });
  if (valider) ficheChangee(n.id);
  return { ok: true };
}

/** Un engagement tenu (ou rouvert) à la main. */
export function marquerEngagement(faitId, statut, { par }) {
  const f = Records.get(FAIT, faitId);
  if (!f || f.type !== 'engagement') return { ok: false, error: 'Engagement introuvable.' };
  if (!['ouvert', 'tenu', 'echu'].includes(statut)) return { ok: false, error: 'Statut inconnu.' };
  Records.update(FAIT, f.id, { statut_engagement: statut, ...(statut === 'tenu' ? { tenu_le: maintenant(), tenu_par: par } : {}) });
  auditer({ par, action: `engagement_${statut}`, fait_id: f.id, avant: { statut_engagement: f.statut_engagement }, apres: { statut_engagement: statut } });
  ficheChangee(f.id);
  return { ok: true };
}

/** Pure : une échéance (AAAA-MM-JJ) est-elle passée d'au moins un jour à cette date ? */
export const echu = (echeance, jour) => !!echeance && /^\d{4}-\d{2}-\d{2}$/.test(echeance) && echeance < jour;

/** Les engagements ouverts dont l'échéance est passée deviennent échus (J+1). Rend leur nombre. */
export function echeances({ maintenantD = new Date() } = {}) {
  const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(maintenantD);
  let n = 0;
  for (const f of Records.list(FAIT).filter((x) => x.type === 'engagement' && x.statut === 'valide' && (x.statut_engagement || 'ouvert') === 'ouvert' && echu(x.echeance, jour))) {
    Records.update(FAIT, f.id, { statut_engagement: 'echu', echu_le: maintenantD.toISOString() });
    auditer({ par: 'auto', action: 'engagement_echu', fait_id: f.id, avant: { statut_engagement: 'ouvert' }, apres: { statut_engagement: 'echu', echeance: f.echeance } });
    ficheChangee(f.id);
    n += 1;
  }
  return n;
}

/** Pure : cette fiche est-elle fermée ? (agent archivé ou « ne plus appeler », projet vendu) */
export function ficheFermee(type, id, { lire = (e, i) => Records.get(e, i) } = {}) {
  if (type === 'agent') { const a = lire('AgentImmo', id); return !!a && (a.statut === 'archive' || a.ne_plus_appeler === true); }
  if (type === 'projet') { const p = lire('Project', id); return !!p && ['vendu', 'cede'].includes(p.statut); }
  return false;
}

/** Archive les faits validés dont toutes les fiches sont fermées (le savoir excepté). Rend leur nombre. */
export function archiver() {
  let n = 0;
  for (const f of Records.list(FAIT).filter((x) => x.statut === 'valide' && x.type !== 'savoir')) {
    const liens = liensDe(f.id);
    if (!liens.length || !liens.every((l) => ficheFermee(l.type_entite, l.entite_id))) continue;
    Records.update(FAIT, f.id, { statut: 'archive', archive_le: maintenant() });
    auditer({ par: 'auto', action: 'archiver', fait_id: f.id, avant: { statut: 'valide' }, apres: { statut: 'archive', fiches: liens.map((l) => `${l.type_entite}:${l.entite_id}`) } });
    ficheChangee(f.id);
    n += 1;
  }
  return n;
}

/** La part des faits tranchés (hors réponses aux questions) validés à la main, sur les `jours` derniers jours. */
export function partManuelle({ jours = 14, maintenantD = new Date() } = {}) {
  const depuis = new Date(maintenantD.getTime() - jours * 86400000).toISOString();
  const tranches = Records.list(FAIT).filter((f) => f.valide_le && f.valide_le >= depuis && ['valide', 'remplace', 'archive', 'rejete'].includes(f.statut));
  const manuels = tranches.filter((f) => f.mode_validation !== 'auto');
  return { tranches: tranches.length, manuels: manuels.length, auto: tranches.length - manuels.length, part: tranches.length ? Math.round((manuels.length / tranches.length) * 100) : null, objectif: 20 };
}

/** Chaque nuit vers 5 h (Paris) : échéances et archivage. Sur Render, ou si LAYER_NUIT=true. */
export function planifier() {
  if (!process.env.RENDER && process.env.LAYER_NUIT !== 'true') return null;
  let dernier = null;
  const tour = () => {
    const d = new Date();
    const heure = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(d)) % 24;
    const j = d.toISOString().slice(0, 10);
    if (heure < 5 || dernier === j) return;
    dernier = j;
    try { const e = echeances(); const a = archiver(); console.log(`[layer] nuit : ${e} engagement(s) échu(s), ${a} fait(s) archivé(s)`); } catch (err) { console.warn('[layer] nuit :', err?.message || err); }
  };
  const t = setInterval(tour, 30 * 60000);
  t.unref?.();
  return t;
}
