// Ce qu'AK a servi, en chiffres : pas ce qu'il coûte (Coûts IA le dit),
// mais ce qu'il a fait, combien de fois on l'a corrigé, ce qu'il a annoncé
// de lui-même. À lire chaque mois avant de lui ajouter quoi que ce soit.

import { Records } from '../db.js';
import { issueDe } from '../assistant-journal.js';

const depuisJours = (jours) => new Date(Date.now() - jours * 86400000).toISOString();

/** Pure sur ses listes : testée sans réseau. */
export function bilanDe({ actions = [], couts = [], taches = [], lecons = [], jours = 30 }) {
  const depuis = depuisJours(jours);
  // AK dans Google Chat (« (AK pour Jules) ») et dans le chat de l'application
  // (« jules.b@… (AK dans l'application) ») : les deux comptent.
  const parAk = actions.filter((a) => /\(AK (pour |dans l'application)/.test(String(a.par || '')) && String(a.le || a.created_date || '') >= depuis);
  const parOutil = {};
  const parPersonne = {};
  const issues = { reussite: 0, question: 0, doublon: 0, echec: 0 };
  for (const a of parAk) {
    parOutil[a.outil] = (parOutil[a.outil] || 0) + 1;
    const p = String(a.par);
    const qui = (p.match(/\(AK pour ([^)]+)\)/) || [])[1] || (/AK dans l'application/.test(p) ? (p.split('@')[0].split('.')[0].replace(/^./, (x) => x.toUpperCase()) || '?') : '?');
    parPersonne[qui] = (parPersonne[qui] || 0) + 1;
    // Relu depuis le résultat : les actions consignées avant la règle actuelle
    // comptaient une lecture sans « ok » comme ratée.
    issues[a.resultat ? issueDe(a.resultat) : a.echec ? 'echec' : 'reussite'] += 1;
  }
  const c = couts.filter((x) => (x.operation === 'ak' || x.operation === 'boîte') && String(x.le || x.created_date || '') >= depuis);
  const t = taches.filter((x) => String(x.cree_le || '') >= depuis);
  const l = lecons.filter((x) => String(x.le || '') >= depuis);
  const demandes = c.length;
  return {
    jours,
    demandes,
    cout_total: Math.round(c.reduce((s, x) => s + (x.cout || 0), 0) * 100) / 100,
    cout_par_demande: demandes ? Math.round((c.reduce((s, x) => s + (x.cout || 0), 0) / demandes) * 1000) / 1000 : null,
    actions: parAk.length,
    reussites: issues.reussite,
    questions: issues.question,
    doublons: issues.doublon,
    echecs: issues.echec,
    // Les vrais échecs, outil par outil : la liste à corriger.
    echecs_par_outil: Object.entries(parAk.filter((a) => (a.resultat ? issueDe(a.resultat) : a.echec ? 'echec' : 'reussite') === 'echec')
      .reduce((o, a) => ({ ...o, [a.outil]: (o[a.outil] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).map(([outil, n]) => ({ outil, n })),
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
  l.push(`${b.demandes} demandes, ${b.cout_total} € en tout soit ${b.cout_par_demande} € la demande.`);
  l.push('');
  l.push(`${b.actions} actions : ${b.reussites} réussies, ${b.questions} questions posées (il manquait une information), ${b.doublons} doublons évités, ${b.echecs} vraiment ratées.`);
  if (b.echecs_par_outil?.length) l.push(`Les ratées, à corriger : ${b.echecs_par_outil.map((x) => `${x.outil} ×${x.n}`).join(' · ')}.`);
  l.push(`Repris par l'équipe : ${b.corrections} correction${b.corrections > 1 ? 's' : ''} (« non, pas ça »), ${b.compliments} compliment${b.compliments > 1 ? 's' : ''}, soit ${b.taux_correction ?? 0} % des demandes corrigées. C'est le chiffre à faire baisser.`);
  l.push('');
  if (b.par_outil.length) l.push(`Ce qu'il a fait : ${b.par_outil.slice(0, 8).map((x) => `${x.outil} ×${x.n}`).join(' · ')}.`);
  if (b.par_personne.length) l.push(`Pour qui : ${b.par_personne.map((x) => `${x.qui} ${x.n}`).join(' · ')}.`);
  if (b.taches.lancees) l.push(`Tâches de fond : ${b.taches.lancees} lancées, ${b.taches.finies} finies, ${b.taches.ratees} ratées (${Object.entries(b.taches.par_genre).map(([g, n]) => `${g} ${n}`).join(', ')}).`);
  l.push('');
  return l.join('\n');
}
