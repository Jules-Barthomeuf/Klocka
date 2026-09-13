// Écarter un commerce, et apprendre de ce « non ».
//
// Quand l'équipe écarte une cible, elle dit pourquoi, et sur quoi ça se
// généralise : cette activité, ce propriétaire, cette enseigne. Ce choix
// devient une règle (RegleEcart) que le classement applique ensuite à toute
// nouvelle cible qui lui ressemble, et qu'on rejoue tout de suite sur la
// ville pour proposer les semblables à écarter aussi. L'équipe garde la main :
// une règle se voit, se retire, et une cible écartée se reprend.

import { Records } from '../db.js';
import { reclasser } from './index.js';

const maintenant = () => new Date().toISOString();
const simple = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Ce qui, dans une cible, peut se généraliser. */
export function criteresDe(c) {
  return {
    activite: c.activite || null,
    type: c.type || c.occupant?.ape || null,
    proprietaire: c.proprietaire?.siren || (c.proprietaire?.nom ? simple(c.proprietaire.nom) : null),
    proprietaire_nom: c.proprietaire?.nom || null,
    enseigne: c.enseigne ? simple(c.enseigne) : null,
    enseigne_nom: c.enseigne || null,
  };
}

/** Une règle touche-t-elle cette cible ? Rend le critère qui matche, ou null. */
export function regleTouche(regle, c) {
  const k = criteresDe(c);
  const s = regle.sur || {};
  if (s.activite && regle.criteres.activite && k.activite && simple(k.activite) === simple(regle.criteres.activite)) return `même activité (${regle.criteres.activite})`;
  if (s.proprietaire && regle.criteres.proprietaire && k.proprietaire && k.proprietaire === regle.criteres.proprietaire) return `même propriétaire (${regle.criteres.proprietaire_nom})`;
  if (s.enseigne && regle.criteres.enseigne && k.enseigne && k.enseigne === regle.criteres.enseigne) return `même enseigne (${regle.criteres.enseigne_nom})`;
  return null;
}

export const reglesActives = () => Records.list('RegleEcart').filter((r) => r.active !== false);

/** La première règle active qui touche la cible, avec son motif. */
export function regleQuiEcarte(c) {
  for (const r of reglesActives()) {
    const pourquoi = regleTouche(r, c);
    if (pourquoi) return { regle_id: r.id, motif: r.motif, pourquoi };
  }
  return null;
}

/**
 * Les cibles de la même ville qui ressemblent à celle-ci, avec la raison,
 * les plus proches d'abord. Pas plus de `n`.
 */
export function semblables(c, sur = {}, n = 5) {
  const k = criteresDe(c);
  const out = [];
  for (const x of Records.filter('Cible', { ville_id: c.ville_id })) {
    if (x.id === c.id || x.pile === 'ecartee') continue;
    const kx = criteresDe(x);
    const raisons = [];
    if (k.proprietaire && kx.proprietaire === k.proprietaire) raisons.push(`même propriétaire (${k.proprietaire_nom})`);
    if (k.enseigne && kx.enseigne === k.enseigne) raisons.push(`même enseigne`);
    if (k.activite && kx.activite && simple(kx.activite) === simple(k.activite)) raisons.push(`même activité (${k.activite})`);
    if (!raisons.length) continue;
    // Ce que l'équipe a coché pèse plus que le reste.
    const poids = raisons.reduce((a, r) => a + ((sur.proprietaire && /propri/.test(r)) || (sur.enseigne && /enseigne/.test(r)) || (sur.activite && /activit/.test(r)) ? 2 : 1), 0);
    out.push({ cible: x, raisons, poids });
  }
  return out.sort((a, b) => b.poids - a.poids).slice(0, n).map(({ cible, raisons }) => ({ id: cible.id, enseigne: cible.enseigne, adresse: cible.adresse, activite: cible.activite, proprietaire: cible.proprietaire?.nom || null, pile: cible.pile, raisons }));
}

/**
 * Écarte une cible avec un motif, crée la règle si l'équipe généralise, et
 * rend les semblables à écarter aussi.
 * @param {{motif?:string, sur?:{activite?:boolean, proprietaire?:boolean, enseigne?:boolean}, user?:object}} o
 */
export function ecarter(id, { motif = null, sur = {}, user = null } = {}) {
  const c = Records.get('Cible', id);
  if (!c) return { ok: false, error: 'Cible introuvable.' };
  const generalise = !!(sur.activite || sur.proprietaire || sur.enseigne);
  let regle = null;
  if (generalise) {
    regle = Records.create('RegleEcart', {
      motif: motif || null,
      sur: { activite: !!sur.activite, proprietaire: !!sur.proprietaire, enseigne: !!sur.enseigne },
      criteres: criteresDe(c),
      depuis_cible: c.id,
      ville_id: c.ville_id,
      active: true,
      cree_le: maintenant(),
      cree_par: user?.email || null,
    }, user?.email);
  }
  Records.update('Cible', id, { ecartee_equipe: true, ecartee_motif: motif || null, ecartee_le: maintenant(), ecartee_par: user?.email || null, ecartee_regle_id: regle?.id || null });
  const cible = reclasser(id);
  return { ok: true, cible, regle, semblables: semblables(c, sur) };
}

/** Écarte plusieurs cibles d'un coup, avec le même motif (les semblables retenus). */
export function ecarterPlusieurs(ids, { motif = null, regle_id = null, user = null } = {}) {
  const cibles = [];
  for (const id of ids || []) {
    const c = Records.get('Cible', id);
    if (!c) continue;
    Records.update('Cible', id, { ecartee_equipe: true, ecartee_motif: motif || null, ecartee_le: maintenant(), ecartee_par: user?.email || null, ecartee_regle_id: regle_id || null });
    cibles.push(reclasser(id));
  }
  return { ok: true, cibles };
}

/** Reprend une cible écartée à la main. */
export function reprendre(id, { user = null } = {}) {
  const c = Records.get('Cible', id);
  if (!c) return { ok: false, error: 'Cible introuvable.' };
  Records.update('Cible', id, { ecartee_equipe: false, ecartee_motif: null, ecartee_le: null, ecartee_par: user?.email || null, ecartee_regle_id: null, ecartee_regle: null, reprise_equipe: true });
  return { ok: true, cible: reclasser(id) };
}

/** Retire une règle : les cibles qu'elle écartait seule sont reclassées. */
export function retirerRegle(regleId) {
  const r = Records.get('RegleEcart', regleId);
  if (!r) return { ok: false, error: 'Règle introuvable.' };
  Records.update('RegleEcart', regleId, { active: false, retiree_le: maintenant() });
  let n = 0;
  for (const c of Records.filter('Cible', { ville_id: r.ville_id })) {
    if (c.ecartee_regle?.regle_id === regleId) { reclasser(c.id); n += 1; }
  }
  return { ok: true, reclassees: n };
}
