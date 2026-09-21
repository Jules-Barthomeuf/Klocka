// Ce qu'AK a servi, en chiffres : pas ce qu'il coûte (Coûts IA le dit),
// mais ce qu'il a fait, combien de fois on l'a corrigé, ce qu'il a annoncé
// de lui-même. À lire chaque mois avant de lui ajouter quoi que ce soit.

import { Records } from '../db.js';

const depuisJours = (jours) => new Date(Date.now() - jours * 86400000).toISOString();

/** Pure sur ses listes : testée sans réseau. */
export function bilanDe({ actions = [], couts = [], taches = [], lecons = [], jours = 30 }) {
  const depuis = depuisJours(jours);
  const parAk = actions.filter((a) => /\(AK pour /.test(String(a.par || '')) && String(a.le || a.created_date || '') >= depuis);
  const parOutil = {};
  const parPersonne = {};
  for (const a of parAk) {
    parOutil[a.outil] = (parOutil[a.outil] || 0) + 1;
    const qui = (String(a.par).match(/\(AK pour ([^)]+)\)/) || [])[1] || '?';
    parPersonne[qui] = (parPersonne[qui] || 0) + 1;
  }
  const c = couts.filter((x) => x.operation === 'ak' && String(x.le || x.created_date || '') >= depuis);
  const t = taches.filter((x) => String(x.cree_le || '') >= depuis);
  const l = lecons.filter((x) => String(x.le || '') >= depuis);
  const demandes = c.length;
  return {
    jours,
    demandes,
    cout_total: Math.round(c.reduce((s, x) => s + (x.cout || 0), 0) * 100) / 100,
    cout_par_demande: demandes ? Math.round((c.reduce((s, x) => s + (x.cout || 0), 0) / demandes) * 1000) / 1000 : null,
    actions: parAk.length,
    echecs: parAk.filter((a) => a.echec).length,
    par_outil: Object.entries(parOutil).sort((a, b) => b[1] - a[1]).map(([outil, n]) => ({ outil, n })),
    par_personne: Object.entries(parPersonne).sort((a, b) => b[1] - a[1]).map(([qui, n]) => ({ qui, n })),
    taches: { lancees: t.length, finies: t.filter((x) => x.etat === 'finie').length, ratees: t.filter((x) => x.etat === 'ratee').length, par_genre: t.reduce((o, x) => ({ ...o, [x.genre]: (o[x.genre] || 0) + 1 }), {}) },
    corrections: l.filter((x) => x.verdict === 'correction').length,
    compliments: l.filter((x) => x.verdict === 'bien').length,
    taux_correction: demandes ? Math.round((l.filter((x) => x.verdict === 'correction').length / demandes) * 1000) / 10 : null,
  };
}

export function bilanAk(jours = 30) {
  return bilanDe({ actions: Records.list('AssistantAction'), couts: Records.list('CoutIA'), taches: Records.list('AkTache'), lecons: Records.list('AkLecon'), jours });
}

/** Le bilan en markdown, pour l'état de la plateforme. Pure. */
export function bilanEnMarkdown(b) {
  const l = [];
  l.push("## AK, l'assistant dans le chat");
  l.push('');
  if (!b.demandes) { l.push("Personne ne lui a parlé sur la période."); l.push(''); return l.join('\n'); }
  l.push(`${b.demandes} demandes, ${b.actions} actions faites (${b.echecs} ratées), ${b.cout_total} € en tout soit ${b.cout_par_demande} € la demande. ${b.corrections} correction${b.corrections > 1 ? 's' : ''} et ${b.compliments} compliment${b.compliments > 1 ? 's' : ''} de l'équipe : ${b.taux_correction} % des demandes ont été reprises.`);
  l.push('');
  if (b.par_outil.length) l.push(`Ce qu'il a fait : ${b.par_outil.slice(0, 8).map((x) => `${x.outil} ×${x.n}`).join(' · ')}.`);
  if (b.par_personne.length) l.push(`Pour qui : ${b.par_personne.map((x) => `${x.qui} ${x.n}`).join(' · ')}.`);
  if (b.taches.lancees) l.push(`Tâches de fond : ${b.taches.lancees} lancées, ${b.taches.finies} finies, ${b.taches.ratees} ratées (${Object.entries(b.taches.par_genre).map(([g, n]) => `${g} ${n}`).join(', ')}).`);
  l.push('');
  return l.join('\n');
}
