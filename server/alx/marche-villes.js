// Le marché par ville : à quel rendement une ville se traite, quel emplacement
// y domine, et ce qu'un budget donné y achète concrètement.
//
// Le tableau de référence (data/marche-villes.json) dit la règle du métier :
// plus le rendement visé est haut, plus la ville et l'emplacement descendent.
// Paris sort à 5-7 %, une sous-préfecture à 8-9 %, un retail park de
// périphérie à 10-11 %. On ne l'invente pas, on le lit.
//
// À partir de là, un budget et un rendement donnent un loyer à chercher
// (prix x taux), et le loyer moyen au mètre que la ville a déjà livré donne
// la surface à chercher. C'est ce qui transforme « 250 000 € à 8 % » en
// « un local de 25 a 40 m² sur l'axe Libération à Dijon, loyer 20 000 €/an ».

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from '../db.js';

const ici = path.dirname(fileURLToPath(import.meta.url));

let cacheReference = null;

/** Le tableau des villes, lu une fois. */
export function reference() {
  if (!cacheReference) {
    const brut = JSON.parse(fs.readFileSync(path.join(ici, 'data', 'marche-villes.json'), 'utf8'));
    cacheReference = { ...brut, villes: brut.villes.map((v) => ({ ...v, famille: familleDe(v.typologie) })) };
  }
  return cacheReference;
}

const FAMILLES = [
  [/^Paris Intra-muros/i, 'Paris intra-muros'],
  [/Couronne IDF/i, 'Couronne parisienne'],
  [/^Grande Métropole/i, 'Grande métropole'],
  [/Station Balnéaire|Ville Littorale|Littoral|Lac Léman|Station de Montagne|Front de Mer/i, 'Littoral et stations'],
  [/Retail|ZAC|Périphérie|Zone Commerciale|Est Lyonnais/i, 'Périphérie et retail'],
  [/Métropole Secondaire|Métropole Riviera|Agglomération|Capitale Régionale|Capitale Corse|Chef-Lieu Régional/i, 'Métropole secondaire'],
  [/Sous-préfecture|Chef-Lieu|Bassin|Sud Vendée|Arrière-pays/i, 'Ville moyenne'],
];

/** La famille d'une typologie, pour filtrer sans lire quatre-vingt-onze libellés. */
export function familleDe(typologie) {
  for (const [motif, nom] of FAMILLES) if (motif.test(typologie || '')) return nom;
  return 'Autres';
}

/** Les familles présentes dans le tableau, de la plus chère à la plus rentable. */
export function familles() {
  const ordre = FAMILLES.map(([, n]) => n).concat('Autres');
  const vues = new Set(reference().villes.map((v) => v.famille));
  return ordre.filter((f) => vues.has(f));
}

/** L'intersection de deux fourchettes, ou null si elles ne se touchent pas. */
export function chevauchement(a, b) {
  if (!a || !b) return null;
  const bas = Math.max(a[0], b[0]);
  const haut = Math.min(a[1], b[1]);
  return bas <= haut ? [bas, haut] : null;
}

/**
 * Deux codes INSEE désignent la même ville quand ils sont égaux, ou quand
 * l'un est un arrondissement de l'autre : ALX tient « Paris » en 75056, le
 * tableau tient le 3e en 75103.
 */
export function memeCommune(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const paires = [['75056', /^751\d\d$/], ['69123', /^693(8[1-9])$/], ['13055', /^132(0[1-9]|1[0-6])$/]];
  for (const [mere, arr] of paires) {
    if (a === mere && arr.test(b)) return true;
    if (b === mere && arr.test(a)) return true;
  }
  return false;
}

const median = (liste) => {
  const t = liste.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  return t.length ? t[Math.floor(t.length / 2)] : null;
};

/**
 * Ce qu'ALX sait déjà de chaque ville prospectée : son loyer au mètre médian
 * (celui des cibles relevées), et le compte des cibles par pile.
 * @returns {{id, nom, code_insee, loyer_m2, cibles, cibles_total}[]}
 */
export function villesProspectees() {
  const cibles = Records.list('Cible');
  const parVille = new Map();
  for (const c of cibles) {
    if (!c.ville_id) continue;
    if (!parVille.has(c.ville_id)) parVille.set(c.ville_id, []);
    parVille.get(c.ville_id).push(c);
  }
  return Records.list('Ville')
    .filter((v) => !v.cachee)
    .map((v) => {
      const liste = parVille.get(v.id) || [];
      return {
        id: v.id,
        nom: v.nom,
        code_insee: v.code_insee || null,
        carte_id: v.carte_id || null,
        loyer_m2: median(liste.map((c) => c.valorisation?.loyer_m2_marche)),
        cibles_total: liste.length,
        rues: (v.rues || []).length,
      };
    });
}

/** Le loyer annuel qu'un prix doit porter pour sortir au taux demandé. */
export const loyerPour = (prix, taux) => Math.round((prix * taux) / 100);

/**
 * Les villes où chercher, pour un budget et un rendement.
 *
 * Une ville est retenue quand sa fourchette constatée touche le rendement
 * demandé. On rend l'intersection : c'est à ce taux-là qu'on y achètera, pas
 * au taux rêvé. Le loyer et la surface à chercher en découlent.
 *
 * @param {{prix_min?, prix_max?, rendement_min?, rendement_max?, famille?, texte?}} criteres
 */
export function chercherVilles(criteres = {}) {
  const { prix_min = null, prix_max = null, rendement = null, rendement_min = null, rendement_max = null, famille = null, texte = null } = criteres;
  // Un rendement visé est un point, pas une fourchette : on garde les villes
  // qui le traitent, c est-a-dire celles dont la fourchette le contient.
  const vise = rendement != null ? [rendement, rendement]
    : (rendement_min != null || rendement_max != null) ? [rendement_min ?? 0, rendement_max ?? 99]
    : null;
  const connues = villesProspectees();
  const mot = String(texte || '').trim().toLowerCase();

  const out = [];
  for (const v of reference().villes) {
    if (famille && v.famille !== famille) continue;
    if (mot && !`${v.ville} ${v.typologie} ${v.emplacement} ${v.code_postal}`.toLowerCase().includes(mot)) continue;
    const commun = vise ? chevauchement(v.rendement, vise) : v.rendement;
    if (vise && !commun) continue;
    const taux = commun || v.rendement;
    const prospectee = connues.find((c) => memeCommune(c.code_insee, v.insee)) || null;
    // Le loyer à chercher : le bas du budget au bas du taux, le haut au haut.
    const loyer = prix_min != null && prix_max != null
      ? [loyerPour(prix_min, taux[0]), loyerPour(prix_max, taux[1])]
      : null;
    const loyer_m2 = prospectee?.loyer_m2 || null;
    const surface = loyer && loyer_m2
      ? [Math.round(loyer[0] / loyer_m2), Math.round(loyer[1] / loyer_m2)]
      : null;
    out.push({
      ...v,
      taux,
      ecart: vise ? Math.abs((v.rendement[0] + v.rendement[1]) / 2 - (vise[0] + vise[1]) / 2) : 0,
      loyer,
      loyer_m2: loyer_m2 ? Math.round(loyer_m2) : null,
      surface,
      ville_id: prospectee?.id || null,
      carte_id: prospectee?.carte_id || null,
      cibles: prospectee?.cibles_total || 0,
    });
  }
  // La ville la plus centrée sur le rendement demandé d'abord ; à égalité,
  // celle qu'ALX a déjà relevée, puis l'ordre du tableau.
  out.sort((a, b) => a.ecart - b.ecart || b.cibles - a.cibles || a.ville.localeCompare(b.ville, 'fr'));
  return out;
}

/**
 * Le rendement qu'une cible sort à un prix donné, et le prix qu'il faut payer
 * pour un rendement donné. C'est le seul calcul qui compte en visite.
 */
export function rendementDe(loyer_annuel, prix) {
  if (!loyer_annuel || !prix) return null;
  return Math.round((loyer_annuel / prix) * 1000) / 10;
}

/**
 * Le loyer annuel d'une cible : celui que la valorisation a calculé, sinon
 * celui que le loyer de marché au mètre et la surface donnent. La deuxième
 * voie est une estimation, et se dit comme telle.
 * @returns {{montant: number, estime: boolean}|null}
 */
export function loyerAnnuelDe(cible) {
  const v = cible?.valorisation || {};
  if (v.loyer_annuel) return { montant: Math.round(v.loyer_annuel), estime: false };
  const surface = v.surface || v.surface_estimee;
  if (v.loyer_m2_marche && surface) return { montant: Math.round(v.loyer_m2_marche * surface), estime: true };
  return null;
}

/**
 * Les cibles déjà relevées qui tiennent dans le budget au rendement demandé.
 *
 * Une cible n'a pas de prix affiché : elle a un loyer. Le prix qui donne le
 * rendement visé s'en déduit (loyer / taux), et la cible passe si ce prix
 * tombe dans le budget. On rend le prix à proposer, pas une estimation.
 */
export function chercherCibles(criteres = {}, { limite = 60 } = {}) {
  const { prix_min = null, prix_max = null, rendement = null, rendement_min = null, rendement_max = null, villes = null } = criteres;
  if (prix_min == null || prix_max == null) return [];
  const bas = rendement ?? rendement_min ?? 5;
  const haut = rendement ?? rendement_max ?? 12;
  const noms = new Map(Records.list('Ville').map((v) => [v.id, v.nom]));
  const out = [];
  for (const c of Records.list('Cible')) {
    if (villes && villes.length && !villes.includes(c.ville_id)) continue;
    const brut = loyerAnnuelDe(c);
    if (!brut) continue;
    const loyer = brut.montant;
    // Les prix qui donnent un rendement dans la fourchette demandée.
    const prix = chevauchement([Math.round((loyer / haut) * 100), Math.round((loyer / bas) * 100)], [prix_min, prix_max]);
    if (!prix) continue;
    const propose = Math.round((prix[0] + prix[1]) / 2 / 1000) * 1000;
    out.push({
      id: c.id,
      nom: c.enseigne || c.activite || 'Local commercial',
      activite: c.activite || null,
      adresse: c.adresse || null,
      rue: c.rue || null,
      ville_id: c.ville_id,
      ville: noms.get(c.ville_id) || null,
      pile: c.pile || 'surveiller',
      surface: c.valorisation?.surface || c.valorisation?.surface_estimee || null,
      loyer_annuel: loyer,
      loyer_estime: brut.estime,
      loyer_m2: c.valorisation?.loyer_m2_marche ? Math.round(c.valorisation.loyer_m2_marche) : null,
      prix: [Math.round(prix[0]), Math.round(prix[1])],
      prix_propose: propose,
      rendement: rendementDe(loyer, propose),
      proprietaire: c.proprietaire?.nom || null,
      score_ml: c.score_ml?.tranche || null,
      proba: c.score_ml?.proba ?? null,
    });
  }
  // La pile d'abord (on appelle avant d'écrire), puis ce que le modèle donne
  // à la parcelle, puis le loyer sûr avant le loyer estimé.
  const rang = { appeler: 0, ecrire: 1, surveiller: 2 };
  out.sort((a, b) => (rang[a.pile] ?? 3) - (rang[b.pile] ?? 3)
    || (b.proba ?? 0) - (a.proba ?? 0)
    || (a.loyer_estime ? 1 : 0) - (b.loyer_estime ? 1 : 0)
    || b.loyer_annuel - a.loyer_annuel);
  return out.slice(0, limite);
}

/** La recherche complète : les villes où aller, les cibles déjà tenues. */
export function chercher(criteres = {}) {
  return {
    criteres,
    villes: chercherVilles(criteres),
    cibles: chercherCibles(criteres),
    familles: familles(),
    source: reference().source,
  };
}
