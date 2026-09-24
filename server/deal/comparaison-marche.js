// Le bien face au marché autour : son prix au m² face aux ventes de locaux
// commerciaux voisines, son loyer au m² face aux loyers de la rue.
//
// Le prix vient de DVF (les ventes réelles, publiques, à 300 m) ; la liste
// des ventes et le lien vers l'application DVF accompagnent le chiffre, pour
// qu'on juge sur pièces. Le loyer vient d'Equimmox quand une analyse a déjà
// été faite à cette adresse (loyers constatés) ; sinon de la rue selon ALX,
// qui le déduit des ventes DVF — et le dit.

import { Records } from '../db.js';

const val = (c) => (c && typeof c === 'object' && 'valeur' in c ? (c.absent === false || c.absent === undefined ? c.valeur : null) : c);
const RAYON = 300;
const JOURS_GARDE = 7;
// Au-delà de 15 % d'écart, on le dit ; en deçà, c'est le bruit du marché.
const SEUIL = 15;

/** Pure : le prix FAI du lot — le prix de la fiche, plus les honoraires quand elle les exclut. */
export function prixFaiDuLot(lot) {
  const prix = Number(val(lot?.prix_fai)) || null;
  const honoraires = Number(val(lot?.montant_honoraires)) || 0;
  const hors = val(lot?.honoraires_inclus) === false && honoraires > 0;
  return prix == null ? null : hors ? prix + honoraires : prix;
}

/** Pure : où se situe une valeur face au marché. */
export function jugement(valeur, marche) {
  if (!(valeur > 0) || !marche) return null;
  const { bas, median, haut } = marche;
  if (bas != null && haut != null && median == null) {
    if (valeur > haut * (1 + SEUIL / 100)) return { mot: 'au-dessus du marché', sens: 'haut', ecart: Math.round(((valeur / haut) - 1) * 100) };
    if (valeur < bas * (1 - SEUIL / 100)) return { mot: 'sous le marché', sens: 'bas', ecart: Math.round(((valeur / bas) - 1) * 100) };
    return { mot: 'dans le marché', sens: 'juste', ecart: null };
  }
  if (!(median > 0)) return null;
  const ecart = Math.round(((valeur / median) - 1) * 100);
  if (ecart > SEUIL) return { mot: 'au-dessus du marché', sens: 'haut', ecart };
  if (ecart < -SEUIL) return { mot: 'sous le marché', sens: 'bas', ecart };
  return { mot: 'dans le marché', sens: 'juste', ecart };
}

/** Pure : l'adresse du lot en une ligne, ou le repère quand la fiche n'a pas de rue. */
export function adresseDuLot(entree) {
  const a = val(entree?.lot?.adresse) || {};
  const ville = a.ville || entree?.enrichissement?.commune?.nom || '';
  if (a.rue) return [a.rue, [a.code_postal, ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (entree?.lieu?.repere && ville) return `${entree.lieu.repere.replace(/^(?:m[ée]tro|station)\s+/i, '')}, ${ville}`;
  return null;
}

/** Pure : premier quartile, médiane, troisième quartile. */
export function quartiles(valeurs) {
  const t = (valeurs || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!t.length) return null;
  const q = (p) => {
    const i = (t.length - 1) * p;
    const b = Math.floor(i);
    return Math.round(t[b] + (t[Math.min(b + 1, t.length - 1)] - t[b]) * (i - b));
  };
  return { bas: q(0.25), median: q(0.5), haut: q(0.75) };
}

const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Le loyer de la rue : Equimmox déjà lu à cette adresse, sinon ALX. */
async function loyerDeLaRue(adresse) {
  const cle = normaliser(adresse);
  const equimmox = Records.list('ValeurLocativeRecherche')
    .filter((x) => normaliser(x.adresse) === cle && x.resultat?.rue?.moyenne)
    .sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')))[0];
  if (equimmox) {
    const r = equimmox.resultat.rue;
    return { bas: r.basse, median: r.moyenne, haut: r.haute, source: `Equimmox, loyers constatés à ${r.rayon || '200 m'}`, constate: true };
  }
  const { emplacementDeLAdresse } = await import('../alx/emplacement.js');
  const e = await emplacementDeLAdresse(adresse);
  const [bas, haut] = Array.isArray(e?.loyer) ? e.loyer : [null, null];
  if (bas == null || haut == null) return null;
  return {
    bas, haut, median: Math.round((bas + haut) / 2),
    source: `${e.rue || 'la rue'} selon ALX : déduit des ventes DVF et du rang de la rue`,
    constate: false,
    lien: null,
  };
}

/**
 * La comparaison d'un lot au marché. Gardée sept jours sur le lot : les
 * ventes DVF ne bougent pas d'une heure à l'autre.
 * @returns {Promise<object>}
 */
export async function comparerAuMarche(deal, index = 0, { forcer = false } = {}) {
  const entree = deal?.lots?.[index];
  if (!entree) return { ok: false, error: 'Lot introuvable' };
  const adresse = adresseDuLot(entree);
  const surface = Number(val(entree.lot?.surface_m2)) || null;
  const fai = prixFaiDuLot(entree.lot);
  const loyer = Number(val(entree.lot?.loyer_annuel_ht_hc)) || null;
  const cle = JSON.stringify([adresse, surface, fai, loyer]);
  const garde = entree.comparaison_marche;
  if (!forcer && garde?.cle === cle && Date.now() - Date.parse(garde.le) < JOURS_GARDE * 86400000) return { ok: true, ...garde };

  const bien = {
    surface,
    prix_fai: fai,
    prix_m2: fai && surface ? Math.round(fai / surface) : null,
    loyer,
    loyer_m2: loyer && surface ? Math.round(loyer / surface) : null,
  };
  if (!adresse) return { ok: true, cle, le: new Date().toISOString(), adresse: null, bien, prix: null, loyer: null, manque: "La fiche ne donne pas d'adresse : pas de marché à comparer." };

  const [ventes, rue] = await Promise.all([
    import('../dvf.js').then(({ ventesAutour }) => ventesAutour(adresse, { rayon: RAYON })).catch(() => null),
    loyerDeLaRue(adresse).catch(() => null),
  ]);
  const d = ventes?.ok ? ventes.resultat : null;
  // Le prix au m² dépend de la surface : un local de 30 m² se vend plus cher
  // au m² qu'un plateau de 500. On compare d'abord aux ventes de surface
  // voisine (de la moitié au double) ; s'il n'y en a pas assez, à toutes.
  const semblables = surface ? (d?.ventes || []).filter((v) => v.surface >= surface / 2 && v.surface <= surface * 2) : [];
  const parSurface = semblables.length >= 5;
  const retenues = parSurface ? semblables : d?.ventes || [];
  const bande = parSurface ? quartiles(semblables.map((v) => v.prix_m2)) : d?.prix_m2 || null;
  const n = parSurface ? semblables.length : d?.n || 0;
  const prix = bande
    ? {
        ...bande,
        n,
        rayon: RAYON,
        periode: d.periode,
        source: parSurface
          ? `DVF, ${n} ventes de locaux commerciaux de ${Math.round(surface / 2)} à ${Math.round(surface * 2)} m² à ${RAYON} m`
          : `DVF, ${n} vente${n > 1 ? 's' : ''} de locaux commerciaux à ${RAYON} m, toutes surfaces`,
        lien: d.lien,
        ventes: retenues.slice(0, 15).map((v) => ({ date: v.date, adresse: v.adresse, surface: v.surface, prix: v.prix, prix_m2: v.prix_m2, distance_m: v.distance_m })),
        jugement: jugement(bien.prix_m2, bande),
      }
    : null;
  const loyerMarche = rue ? { ...rue, jugement: jugement(bien.loyer_m2, rue) } : null;

  const resultat = {
    cle,
    le: new Date().toISOString(),
    adresse,
    bien,
    prix,
    loyer: loyerMarche,
    manque: !surface ? "La surface manque : le prix et le loyer au m² ne se calculent pas." : !prix ? (ventes?.error || 'Pas assez de ventes DVF autour pour un prix de marché.') : null,
  };
  const lots = [...deal.lots];
  lots[index] = { ...entree, comparaison_marche: resultat };
  Records.update('Deal', deal.id, { lots });
  return { ok: true, ...resultat };
}
