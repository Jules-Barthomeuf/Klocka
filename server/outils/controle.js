// Le contrôle d'un lancement (12 nov. 2026, Jules : « vérifier que chaque bloc fonctionne parfaitement ») : ce qu'un
// résultat doit porter pour s'afficher sans trou ni « [object Object] ». Pur ; servi par le banc scripts/marche-banc.mjs
// et par les tests. Un défaut est une phrase, pour qu'on sache quoi corriger.

import { OUTILS } from './lancements.js';

const STATUTS = ['ok', 'a_voir', 'alerte', 'vide'];
// Les points que chaque outil écrit toujours, dans cet ordre.
export const POINTS_ATTENDUS = {
  locataire: ['societe', 'procedures', 'comptes', 'avis'],
  loyer: ['loyer_marche'],
  prix: ['verdict_prix', 'rendement'],
  emplacement: ['passage', 'rotation', 'vacance', 'enseignes'],
  ville: ['population', 'revenu', 'chomage'],
};

/** Pure : ce qui, dans un texte, trahit une valeur mal écrite. L'espace avant « ; » ou « : » est la typographie française. */
export function texteDouteux(t) {
  const s = String(t ?? '');
  if (!s.trim()) return 'texte vide';
  const m = s.match(/\[object Object\]|\bundefined\b|\bNaN\b|\bnull\b|\s\s|\s[.,]|\(\)|%\s%|€\s€/);
  return m ? `« ${m[0].trim() || 'double espace'} » dans « ${s.slice(0, 80)} »` : null;
}

/** Pure : les défauts d'un point. */
export function controlerPoint(p) {
  const d = [];
  if (!p || typeof p !== 'object') return ['point absent'];
  if (!p.cle) d.push('point sans clé');
  if (!p.libelle) d.push(`${p.cle} : sans libellé`);
  if (!STATUTS.includes(p.statut)) d.push(`${p.cle} : statut inconnu « ${p.statut} »`);
  if (typeof p.resultat !== 'string') d.push(`${p.cle} : résultat qui n'est pas une phrase (${typeof p.resultat})`);
  else { const t = texteDouteux(p.resultat); if (t) d.push(`${p.cle} : ${t}`); }
  if (p.statut !== 'vide' && !p.source) d.push(`${p.cle} : lu sans source`);
  // Un lien est une adresse web, ou un fichier servi par Klocka (/uploads/…, la capture Equimmox).
  if (p.lien && !/^(https?:\/\/|\/)/.test(p.lien)) d.push(`${p.cle} : lien qui n'en est pas un (${String(p.lien).slice(0, 40)})`);
  return d;
}

/** Pure : les défauts d'un lancement fini (statut, conclusion, points attendus, note de l'IA). */
export function controlerLancement(l) {
  const d = [];
  if (!l) return ['lancement absent'];
  if (l.statut === 'echec') return [`échec : ${l.erreur || 'sans raison'}`];
  if (l.statut === 'en_cours') return ['toujours en cours'];
  const r = l.resultat;
  if (!r) return ['fini sans résultat'];
  if (!STATUTS.includes(r.statut)) d.push(`statut du résultat inconnu « ${r.statut} »`);
  const tc = texteDouteux(r.conclusion);
  if (tc) d.push(`conclusion : ${tc}`);
  const attendus = POINTS_ATTENDUS[l.outil] || [];
  const cles = (r.points || []).map((p) => p.cle);
  for (const k of attendus) if (!cles.includes(k)) d.push(`point ${k} manquant`);
  for (const k of cles) if (attendus.length && !attendus.includes(k)) d.push(`point inattendu ${k}`);
  for (const p of r.points || []) d.push(...controlerPoint(p));
  // `rue` est l'analyse de l'outil Rue entière ; la rue cellule par cellule est dedans (rue.rue.cellules).
  if (l.outil === 'emplacement' && r.points?.some((p) => p.statut !== 'vide') && !r.rue?.rue?.cellules) d.push('emplacement lu sans la rue');
  if (r.note_ia) {
    if (r.note_ia.erreur) d.push(`note de l'IA en erreur : ${r.note_ia.erreur}`);
    else {
      const n = String(r.note_ia.avis || '');
      const phrases = n.match(/[^.!?]+[.!?]+/g) || [];
      if (!n.trim()) d.push("note de l'IA vide");
      if (phrases.length > 2) d.push(`note de l'IA en ${phrases.length} phrases`);
      if (n.split(/\s+/).length > 60) d.push(`note de l'IA trop longue (${n.split(/\s+/).length} mots)`);
      if (/[—]/.test(n)) d.push("note de l'IA avec un tiret cadratin");
    }
  }
  return d;
}

/** Pure : la ligne du banc pour un lancement : l'outil, le statut, un mot par point, les défauts. */
export function resumerLancement(l) {
  const def = OUTILS.find((o) => o.cle === l?.outil);
  const pts = (l?.resultat?.points || []).map((p) => `${p.cle}=${p.statut}`).join(' ');
  return { outil: def?.nom || l?.outil, statut: l?.statut === 'fini' ? l.resultat?.statut : l?.statut, points: pts, defauts: controlerLancement(l) };
}
