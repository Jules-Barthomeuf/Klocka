// Les cartes de prospection : on ne cherche pas « dans une ville », on cherche
// pour quelqu'un.
//
// Une carte porte un nom libre (« Investisseur Machin »), des critères (un
// budget, un rendement visé, une famille de villes) et les villes qu'on
// prospecte pour lui. Les critères disent où aller : le tableau de marché
// rend les villes qui sortent à ce rendement-là, et les cibles déjà relevées
// qui tiennent dans le budget.
//
// Une ville reste une ville : elle est rattachée à une carte par carte_id, et
// se détache sans rien perdre. Une ville sans carte reste visible ailleurs.

import { Records } from '../db.js';
import { chercherCibles, chercherVilles, familles, reference } from './marche-villes.js';

const maintenant = () => new Date().toISOString();

// « 8,5 » et « 300 000 € » se tapent comme on les dit : la virgule décimale
// vaut un point, le reste tombe.
const nombre = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Les critères, nettoyés : des nombres, une famille connue, rien d'autre. */
export function criteresPropres(brut = {}) {
  const connues = familles();
  const prix_min = nombre(brut.prix_min);
  const prix_max = nombre(brut.prix_max);
  // Un seul rendement, pas une fourchette : un investisseur vise un taux.
  // Les cartes écrites avant gardent leur borne basse, qui était ce taux.
  const rendement = nombre(brut.rendement) ?? nombre(brut.rendement_min) ?? nombre(brut.rendement_max);
  return {
    prix_min: prix_min && prix_max ? Math.min(prix_min, prix_max) : prix_min,
    prix_max: prix_min && prix_max ? Math.max(prix_min, prix_max) : prix_max,
    rendement,
    famille: connues.includes(brut.famille) ? brut.famille : null,
    note: String(brut.note || '').trim() || null,
  };
}

/** Les critères en une phrase, celle qu'on lit sur la carte. */
export function phraseCriteres(c = {}) {
  const euros = (n) => `${Math.round(n / 1000)} k€`;
  const taux = (n) => String(n).replace('.', ',');
  const bouts = [];
  if (c.prix_min && c.prix_max) bouts.push(`${euros(c.prix_min)} à ${euros(c.prix_max)}`);
  else if (c.prix_max) bouts.push(`jusqu'à ${euros(c.prix_max)}`);
  else if (c.prix_min) bouts.push(`à partir de ${euros(c.prix_min)}`);
  if (c.rendement) bouts.push(`${taux(c.rendement)} %`);
  if (c.famille) bouts.push(c.famille.toLowerCase());
  return bouts.length ? bouts.join(' · ') : 'Aucun critère posé';
}

function villesDeLaCarte(id) {
  return Records.filter('Ville', { carte_id: id }).filter((v) => !v.cachee);
}

function compterCibles(villeId) {
  const out = { appeler: 0, ecrire: 0, surveiller: 0, total: 0 };
  for (const c of Records.filter('Cible', { ville_id: villeId })) {
    out[c.pile || 'surveiller'] = (out[c.pile || 'surveiller'] || 0) + 1;
    out.total += 1;
  }
  return out;
}

/** Toutes les cartes, la plus récente d'abord, avec ce qu'elles tiennent. */
export function listerCartes() {
  return Records.list('Carte', { sort: '-created_date' }).map((brut) => {
    const carte = { ...brut, criteres: criteresPropres(brut.criteres || {}) };
    const villes = villesDeLaCarte(carte.id);
    const cibles = villes.reduce((a, v) => {
      const c = compterCibles(v.id);
      return { appeler: a.appeler + c.appeler, ecrire: a.ecrire + c.ecrire, surveiller: a.surveiller + c.surveiller, total: a.total + c.total };
    }, { appeler: 0, ecrire: 0, surveiller: 0, total: 0 });
    return {
      ...carte,
      phrase: phraseCriteres(carte.criteres || {}),
      villes: villes.map((v) => ({ id: v.id, nom: v.nom, etat: v.parcours?.etat || null })),
      cibles,
    };
  });
}

export function creerCarte({ nom, client = null, criteres = {}, user = null }) {
  const propre = String(nom || '').trim();
  if (!propre) return { ok: false, error: 'Donnez un nom à la carte.' };
  const existante = Records.list('Carte').find((c) => c.nom.toLowerCase() === propre.toLowerCase());
  if (existante) return { ok: true, carte: existante, deja: true };
  const carte = Records.create(
    'Carte',
    {
      nom: propre,
      client: String(client || '').trim() || null,
      criteres: criteresPropres(criteres),
      cree_le: maintenant(),
      cree_par: user?.email || null,
    },
    user?.email
  );
  return { ok: true, carte };
}

export function majCarte(id, { nom, client, criteres }) {
  const carte = Records.get('Carte', id);
  if (!carte) return { ok: false, error: 'Carte introuvable.' };
  const patch = {};
  if (nom !== undefined && String(nom).trim()) patch.nom = String(nom).trim();
  if (client !== undefined) patch.client = String(client || '').trim() || null;
  if (criteres !== undefined) patch.criteres = criteresPropres({ ...(carte.criteres || {}), ...criteres });
  return { ok: true, carte: Records.update('Carte', id, patch) };
}

/** Effacer la carte laisse les villes en place : elles se détachent, rien de plus. */
export function supprimerCarte(id) {
  const carte = Records.get('Carte', id);
  if (!carte) return { ok: false, error: 'Carte introuvable.' };
  for (const v of villesDeLaCarte(id)) Records.update('Ville', v.id, { carte_id: null });
  Records.delete('Carte', id);
  return { ok: true };
}

export function rattacherVille(carteId, villeId) {
  const carte = Records.get('Carte', carteId);
  const ville = Records.get('Ville', villeId);
  if (!carte || !ville) return { ok: false, error: 'Carte ou ville introuvable.' };
  return { ok: true, ville: Records.update('Ville', villeId, { carte_id: carteId }) };
}

export function detacherVille(villeId) {
  const ville = Records.get('Ville', villeId);
  if (!ville) return { ok: false, error: 'Ville introuvable.' };
  return { ok: true, ville: Records.update('Ville', villeId, { carte_id: null }) };
}

/**
 * La carte ouverte : ses critères, les villes déjà prospectées pour elle, les
 * villes que le tableau de marché conseille, et les cibles qui tiennent dans
 * le budget.
 */
export function detailCarte(id) {
  const carte = Records.get('Carte', id);
  if (!carte) return null;
  const criteres = criteresPropres(carte.criteres || {});
  const villes = villesDeLaCarte(id).map((v) => ({ ...v, cibles: compterCibles(v.id) }));
  const ids = new Set(villes.map((v) => v.id));
  const conseillees = chercherVilles(criteres);
  return {
    carte: { ...carte, criteres, phrase: phraseCriteres(criteres) },
    villes,
    // Les villes conseillées qu'on ne prospecte pas encore pour cette carte.
    conseillees: conseillees.filter((c) => !c.ville_id || !ids.has(c.ville_id)),
    prospectees: conseillees.filter((c) => c.ville_id && ids.has(c.ville_id)),
    cibles: chercherCibles({ ...criteres, villes: [...ids] }),
    familles: familles(),
    source: reference().source,
  };
}
