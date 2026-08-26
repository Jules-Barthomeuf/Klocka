// Ce que le plan de travail propose, et ce qui en est fait.
//
// Les propositions étaient produites puis oubliées : rien ne disait lesquelles
// étaient suivies d'effet. Les priorités « à faire aujourd'hui / attendu /
// courant » restaient donc des constantes choisies à l'écriture, jamais
// confrontées à ce que les analystes traitent réellement en premier.
//
// Deux écritures suffisent : une quand la proposition est montrée, une quand
// elle est traitée. Le reste se déduit — le taux de traitement, le délai, et
// surtout ce qui traîne depuis des jours sans que personne n'y touche.

import { Records } from './db.js';

const cle = (p) => `${p.type}:${p.deal_id || p.mail_id || p.id}`;

/**
 * Note que ces propositions ont été montrées. Appelé à chaque construction du
 * plan de travail : la première vue fait foi, les suivantes comptent les
 * passages sans effet.
 */
export function noterVues(propositions, user) {
  const maintenant = new Date().toISOString();
  for (const p of propositions || []) {
    try {
      const k = cle(p);
      const existant = Records.filter('SuiviProposition', { cle: k }).find((s) => !s.traitee_le);
      if (existant) {
        Records.update('SuiviProposition', existant.id, { derniere_vue: maintenant, vues: (existant.vues || 1) + 1 });
      } else {
        Records.create('SuiviProposition', {
          cle: k,
          type: p.type,
          priorite: p.priorite,
          titre: p.titre,
          deal_id: p.deal_id || null,
          premiere_vue: maintenant,
          derniere_vue: maintenant,
          vues: 1,
          traitee_le: null,
          action: null,
          par: user?.email || null,
        });
      }
    } catch (e) {
      console.warn('[propositions] vue non notée :', e?.message || e);
    }
  }
}

/**
 * Note qu'une proposition a été traitée, et par quelle action.
 * @returns {object|null} l'entrée close, avec son délai
 */
export function noterTraitee({ type, deal_id, mail_id, id, action, user }) {
  const k = cle({ type, deal_id, mail_id, id });
  const entree = Records.filter('SuiviProposition', { cle: k }).find((s) => !s.traitee_le);
  if (!entree) return null;

  const maintenant = new Date().toISOString();
  const delai = Date.now() - new Date(entree.premiere_vue).getTime();
  return Records.update('SuiviProposition', entree.id, {
    traitee_le: maintenant,
    action: action || null,
    traitee_par: user?.email || null,
    delai_ms: delai,
  });
}

const JOUR = 86400000;

/**
 * Ce que deviennent les propositions, par type et par priorité.
 * @param {number} jours - fenêtre d'observation
 */
export function syntheseTraitement(jours = 30) {
  const depuis = new Date(Date.now() - jours * JOUR).toISOString();
  const lignes = Records.list('SuiviProposition').filter((s) => (s.premiere_vue || '') >= depuis);

  const grouper = (champ) => {
    const map = new Map();
    for (const s of lignes) {
      const k = String(s[champ] ?? 'inconnu');
      const e = map.get(k) || { cle: k, proposees: 0, traitees: 0, delais: [], en_attente: 0, plus_vieille_j: 0 };
      e.proposees += 1;
      if (s.traitee_le) {
        e.traitees += 1;
        if (s.delai_ms != null) e.delais.push(s.delai_ms);
      } else {
        e.en_attente += 1;
        const age = Math.floor((Date.now() - new Date(s.premiere_vue).getTime()) / JOUR);
        if (age > e.plus_vieille_j) e.plus_vieille_j = age;
      }
      map.set(k, e);
    }
    return [...map.values()]
      .map((e) => ({
        cle: e.cle,
        proposees: e.proposees,
        traitees: e.traitees,
        en_attente: e.en_attente,
        // Le taux dit si la proposition sert à quelque chose ; le délai, si
        // elle arrive au bon moment.
        taux: e.proposees ? Math.round((e.traitees / e.proposees) * 100) : 0,
        delai_median_h: mediane(e.delais),
        plus_vieille_j: e.plus_vieille_j,
      }))
      .sort((a, b) => b.proposees - a.proposees);
  };

  // Ce que personne ne traite : le signal le plus utile pour retoucher les
  // priorités, ou pour retirer une proposition qui n'intéresse personne.
  const ignorees = lignes
    .filter((s) => !s.traitee_le && (s.vues || 0) >= 3)
    .map((s) => ({
      titre: s.titre,
      type: s.type,
      vues: s.vues,
      jours: Math.floor((Date.now() - new Date(s.premiere_vue).getTime()) / JOUR),
      deal_id: s.deal_id,
    }))
    .sort((a, b) => b.vues - a.vues)
    .slice(0, 12);

  return {
    total: {
      proposees: lignes.length,
      traitees: lignes.filter((s) => s.traitee_le).length,
      en_attente: lignes.filter((s) => !s.traitee_le).length,
    },
    par_type: grouper('type'),
    par_priorite: grouper('priorite'),
    ignorees,
  };
}

function mediane(valeurs) {
  if (!valeurs.length) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = t.length % 2 ? t[(t.length - 1) / 2] : (t[t.length / 2 - 1] + t[t.length / 2]) / 2;
  return Math.round((m / 3600000) * 10) / 10;
}
