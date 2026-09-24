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
// Sans adresse, on lit le quartier : un cercle plus large, pour avoir assez de ventes.
const RAYON_QUARTIER = 600;
const RAYON_ELARGI = 1500;
const BAN = 'https://api-adresse.data.gouv.fr';
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

/**
 * Sans rue dans la fiche, le quartier suffit à se faire une idée : le repère
 * qu'elle donne s'il a été situé, sinon l'arrondissement ou la commune. On en
 * tire un point, puis la rue la plus proche, et le marché se lit autour —
 * approché, et marqué comme tel.
 * @returns {Promise<{lat, lon, libelle, mode}|null>}
 */
async function pointApproche(deal, entree) {
  if (entree?.lieu?.lat != null && entree?.lieu?.lon != null) {
    return { lat: entree.lieu.lat, lon: entree.lieu.lon, libelle: entree.lieu.repere, mode: 'repere' };
  }
  const a = val(entree?.lot?.adresse) || {};
  // Le repère de la fiche, même quand la page ne l'a pas encore situé.
  try {
    const { repereNet, repereDuTexte, localiserRepere } = await import('./repere.js');
    const repere = repereNet(a.repere) || repereDuTexte(deal?.source?.texte || '');
    // Sans ville, le repère se cherche seul : OpenStreetMap trouve la
    // station Rambuteau à Paris sans qu'on le lui dise.
    const ville = a.ville || entree?.enrichissement?.commune?.nom || null;
    if (repere) {
      const r = await localiserRepere(repere, ville);
      if (r) return { lat: r.lat, lon: r.lon, libelle: repere, mode: 'repere' };
    }
  } catch { /* le quartier prend le relais */ }
  const q = [a.code_postal, a.ville].filter(Boolean).join(' ') || entree?.enrichissement?.commune?.nom || '';
  if (q) {
    try {
      const r = await fetch(`${BAN}/search/?limit=1&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(6000) });
      const f = r.ok ? (await r.json()).features?.[0] : null;
      if (f) return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], libelle: f.properties?.label || q, mode: 'quartier' };
    } catch { /* la commune de l'enrichissement prend le relais */ }
  }
  const c = entree?.enrichissement?.commune?.centre;
  return c?.lat != null ? { lat: c.lat, lon: c.lon, libelle: entree.enrichissement.commune.nom, mode: 'commune' } : null;
}

/** La rue la plus proche d'un point, en adresse lisible par DVF et ALX. */
async function adresseProche(point) {
  try {
    // Une adresse au numéro : sans ce filtre, le centre d'une commune
    // renvoyait la commune elle-même, que ni DVF ni ALX ne savent lire.
    const r = await fetch(`${BAN}/reverse/?lon=${point.lon}&lat=${point.lat}&limit=1&type=housenumber`, { signal: AbortSignal.timeout(6000) });
    const pr = r.ok ? (await r.json()).features?.[0]?.properties : null;
    if (!pr) return null;
    // « 26 Rue Beaubourg, 75003 Paris » : la virgule sépare la rue de la
    // ville, et c'est d'elle qu'ALX a besoin pour les retrouver.
    return pr.name && pr.postcode && pr.city ? `${pr.name}, ${pr.postcode} ${pr.city}` : pr.label || null;
  } catch {
    return null;
  }
}


/**
 * Le loyer de marché d'une adresse, par K-Data Valeur locative : Equimmox
 * (loyers constatés à 200 m, 500 m, 1 km) et DVF en second regard. La lecture
 * prend plusieurs minutes : si elle n'a pas encore été faite, on la lance une
 * fois comme analyse K-Data rangée dans le dossier, et l'estimation d'ALX tient
 * la place en attendant, marquée provisoire.
 */
async function loyerDeLaRue(adresse, deal) {
  const { resoudreAdresse } = await import('../adresse-ban.js');
  const point = await resoudreAdresse(adresse).catch(() => null);
  const cle = String(point?.label || adresse).toLowerCase().replace(/\s+/g, ' ').trim();
  const lue = Records.filter('ValeurLocativeRecherche', { cle })
    .filter((x) => Date.now() - Date.parse(x.le) < 30 * 86400000)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
  if (lue?.resultat) {
    const r = lue.resultat;
    const niveau = r.rue || r.quartier || r.ville;
    if (niveau) {
      const constate = niveau.source === 'Equimmox';
      return {
        bas: niveau.basse, median: niveau.moyenne ?? Math.round((niveau.basse + niveau.haute) / 2), haut: niveau.haute,
        source: constate
          ? `K-Data Valeur locative · Equimmox, loyers constatés ${niveau === r.rue ? 'dans la rue' : niveau === r.quartier ? 'dans le quartier' : 'dans la ville'} (${niveau.rayon})`
          : `K-Data Valeur locative · déduit des ventes DVF (${niveau.rayon}) : Equimmox n'a pas répondu`,
        constate,
        second_regard: r.dvf
          ? {
              bas: r.dvf.basse, median: r.dvf.moyenne, haut: r.dvf.haute,
              // Le taux arrive en fourchette : { bas, moyen, haut }.
              source: `DVF à ${r.dvf.rayon}, prix des murs × ${String(r.dvf.taux?.moyen ?? r.dvf.taux ?? '').replace('.', ',')} % de rendement`,
            }
          : null,
        kdata: { id: lue.id, le: lue.le },
      };
    }
  }

  // Pas encore lue : K-Data part une fois pour ce dossier, rangée dedans.
  const deja = deal?.lots?.[0]?.kdata_loyer;
  const lancee = deja && deja.adresse === cle && Date.now() - Date.parse(deja.le) < 2 * 3600000;
  if (!lancee && deal?.deal_id) {
    try {
      const { lancerAnalyses, ranger } = await import('../kdata.js');
      const r = lancerAnalyses({ adresse, outils: ['valeur-locative'] });
      if (r.ok) {
        ranger(r.ids, deal.deal_id);
        const frais = Records.get('Deal', deal.id);
        const lots = [...(frais.lots || [])];
        lots[0] = { ...lots[0], kdata_loyer: { adresse: cle, ids: r.ids, le: new Date().toISOString() } };
        Records.update('Deal', deal.id, { lots });
      }
    } catch { /* l'estimation d'ALX reste */ }
  }
  const provisoire = await estimationAlx(adresse);
  return provisoire ? { ...provisoire, kdata_en_cours: true } : { kdata_en_cours: true, source: 'K-Data Valeur locative en cours (Equimmox)' };
}

/** L'estimation d'ALX : le loyer de la rue déduit des ventes DVF et du rang de la rue. */
async function estimationAlx(adresse) {
  const { emplacementDeLAdresse } = await import('../alx/emplacement.js');
  const e = await emplacementDeLAdresse(adresse).catch(() => null);
  const [bas, haut] = Array.isArray(e?.loyer) ? e.loyer : [null, null];
  if (bas == null || haut == null) return null;
  return {
    bas, haut, median: Math.round((bas + haut) / 2),
    source: `Estimation provisoire d'ALX pour ${e.rue || 'la rue'} (déduite des ventes DVF), en attendant K-Data`,
    constate: false,
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
  let adresse = adresseDuLot(entree);
  const surface = Number(val(entree.lot?.surface_m2)) || null;
  const fai = prixFaiDuLot(entree.lot);
  const loyer = Number(val(entree.lot?.loyer_annuel_ht_hc)) || null;
  // La version entre dans la clé : une comparaison faite avant K-Data se refait.
  const cle = JSON.stringify([3, adresse, surface, fai, loyer]);
  const garde = entree.comparaison_marche;
  if (!forcer && garde?.cle === cle && Date.now() - Date.parse(garde.le) < JOURS_GARDE * 86400000) return { ok: true, ...garde };

  const bien = {
    surface,
    prix_fai: fai,
    prix_m2: fai && surface ? Math.round(fai / surface) : null,
    loyer,
    loyer_m2: loyer && surface ? Math.round(loyer / surface) : null,
  };
  // Pas d'adresse : on lit le quartier, et on le dit.
  let approche = null;
  if (!adresse) {
    const point = await pointApproche(deal, entree);
    const proche = point ? await adresseProche(point) : null;
    if (!proche) return { ok: true, cle, le: new Date().toISOString(), adresse: null, bien, prix: null, loyer: null, manque: "Ni adresse ni quartier situable : pas de marché à comparer." };
    adresse = proche;
    approche = { mode: point.mode, libelle: point.libelle };
  }
  let rayon = approche ? RAYON_QUARTIER : RAYON;
  const lireVentes = (r) => import('../dvf.js').then(({ ventesAutour }) => ventesAutour(adresse, { rayon: r })).catch(() => null);

  let [ventes, rue] = await Promise.all([lireVentes(rayon), loyerDeLaRue(adresse, deal).catch(() => null)]);
  // Dans une petite ville, le quartier compte trop peu de ventes : on élargit.
  if (approche && !(ventes?.ok && ventes.resultat?.prix_m2)) {
    rayon = RAYON_ELARGI;
    ventes = await lireVentes(rayon);
  }
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
        rayon,
        periode: d.periode,
        source: parSurface
          ? `DVF, ${n} ventes de locaux commerciaux de ${Math.round(surface / 2)} à ${Math.round(surface * 2)} m² à ${rayon} m`
          : `DVF, ${n} vente${n > 1 ? 's' : ''} de locaux commerciaux à ${rayon} m, toutes surfaces`,
        lien: d.lien,
        ventes: retenues.slice(0, 15).map((v) => ({ date: v.date, adresse: v.adresse, surface: v.surface, prix: v.prix, prix_m2: v.prix_m2, distance_m: v.distance_m })),
        jugement: jugement(bien.prix_m2, bande),
      }
    : null;
  const loyerMarche = rue ? { ...rue, jugement: rue.median != null || rue.bas != null ? jugement(bien.loyer_m2, rue) : null } : null;
  // Lu sur le quartier : le chiffre donne une idée, pas un verdict.
  const reserve = approche
    ? `Estimé autour de ${approche.mode === 'repere' ? `« ${approche.libelle} »` : approche.libelle}, faute d'adresse dans la fiche : à vérifier.`
    : null;
  for (const m of [prix, loyerMarche]) {
    if (m && approche) { m.approche = approche; m.reserve = reserve; }
  }

  const resultat = {
    cle,
    le: new Date().toISOString(),
    adresse,
    approche,
    bien,
    prix,
    loyer: loyerMarche,
    manque: !surface ? "La surface manque : le prix et le loyer au m² ne se calculent pas." : !prix ? (ventes?.error || 'Pas assez de ventes DVF autour pour un prix de marché.') : null,
  };
  // Tant que K-Data tourne, rien n'est gardé : la lecture suivante reprend
  // son résultat dès qu'il existe.
  if (!loyerMarche?.kdata_en_cours) {
    const frais = Records.get('Deal', deal.id) || deal;
    const lots = [...frais.lots];
    lots[index] = { ...lots[index], comparaison_marche: resultat };
    Records.update('Deal', deal.id, { lots });
  }
  return { ok: true, ...resultat };
}
