// DVF — ce que les locaux commerciaux se sont VRAIMENT vendu, autour du bien.
//
// Toutes les autres sources du module parlent de demandes : un loyer affiché,
// une estimation, un prix d'annonce. DVF est la seule qui dise ce qui a été
// payé, parce qu'elle vient des actes notariés transmis à l'administration.
//
// C'est ce qui manquait pour juger un prix. Jusqu'ici la valorisation se
// faisait en capitalisant le loyer de marché AU TAUX ANNONCÉ PAR LE VENDEUR —
// le seul taux que le dossier possédait. Honnête, mais circulaire : c'est le
// vendeur qui fixait l'étalon avec lequel on jugeait son prix. Une médiane de
// ventes réelles à trois cents mètres est un second point de vue, qui ne lui
// doit rien.
//
// La donnée est publique et gratuite : un fichier CSV par commune et par
// année, publié par Etalab à partir des données de la DGFiP.
//
// Trois limites, dites ici parce qu'elles décident de ce qu'on affiche :
//   — DVF ne couvre PAS l'Alsace-Moselle (57, 67, 68) ni Mayotte, qui ont leur
//     propre régime de publicité foncière. Ce n'est pas une panne ;
//   — une mutation peut porter plusieurs biens de natures différentes, et son
//     prix n'est alors attribuable à aucun. On ne garde que les ventes dont
//     TOUS les locaux sont commerciaux ;
//   — DVF contient des cessions à l'euro symbolique, entre sociétés d'un même
//     groupe. Elles ne disent rien du marché et sont écartées, en le disant.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';
import { ErreurSource, SANS_DONNEE } from './marche/erreurs.js';

// DVF paraît deux fois par an : un cache plus long que les autres sources n'a
// aucun coût de fraîcheur, et évite de retélécharger cinq fichiers.
const CACHE_JOURS = 120;
// Cinq millésimes : moins ne donne pas d'échantillon en commerce, où une rue
// voit deux ou trois ventes par an. Voir le seuil N_MINIMUM plus bas.
const ANNEES = 5;
const RAYON_DEFAUT = 500;
// Sous ce nombre de ventes, aucune médiane n'est publiée. « Une case vide se
// voit et se comble ; un chiffre inventé se recopie dans une note
// d'investissement » — une médiane sur deux ventes est de cette famille.
export const N_MINIMUM = 5;
// En dessous, ce n'est pas un prix de marché : euro symbolique, apport, cession
// intragroupe. On les compte et on le dit, on ne les moyenne pas.
const PRIX_PLANCHER = 1000;
// Les départements où la publicité foncière relève du Livre foncier : la DGFiP
// n'y produit pas DVF.
const SANS_DVF = { 57: 'Moselle', 67: 'Bas-Rhin', 68: 'Haut-Rhin', 976: 'Mayotte' };

const TYPE_COMMERCIAL = 'Local industriel. commercial ou assimilé';
const racine = process.env.DVF_RACINE || 'https://files.data.gouv.fr/geo-dvf/latest/csv';

/** Le département d'un code INSEE : « 92026 » → « 92 », « 97411 » → « 974 ». */
export function departementDe(insee) {
  const c = String(insee || '');
  if (!/^\d{5}$/.test(c)) return null;
  return c.startsWith('97') ? c.slice(0, 3) : c.slice(0, 2);
}

/** Distance en mètres entre deux points, à la surface de la Terre. */
export function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * p) / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Un CSV en lignes d'objets. DVF n'échappe pas ses champs : un split suffit. */
export function lireCsv(texte) {
  const lignes = String(texte || '').split('\n').filter((l) => l.trim());
  if (lignes.length < 2) return [];
  const entetes = lignes[0].split(',');
  return lignes.slice(1).map((l) => {
    const cases = l.split(',');
    const o = {};
    entetes.forEach((e, i) => { o[e] = cases[i] ?? ''; });
    return o;
  });
}

const nombre = (v) => {
  const n = Number(String(v || '').trim());
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** Le quantile d'une série triée, au plus proche rang. */
const quantile = (tries, q) => (tries.length ? tries[Math.min(tries.length - 1, Math.floor(q * tries.length))] : null);

/**
 * Regroupe les lignes DVF en mutations exploitables pour le commerce.
 *
 * Une mutation = un acte. DVF en publie une ligne par local, et le prix est
 * porté par l'acte entier : c'est pourquoi on ne peut rapporter un prix à une
 * surface que si tout l'acte est commercial.
 *
 * @param {Array} lignes - les lignes CSV de toutes les années
 * @returns {{ventes: Array, ecartees: {mixtes: number, symboliques: number, sans_surface: number}}}
 */
export function ventesCommerciales(lignes) {
  const parMutation = new Map();
  for (const l of lignes) {
    if (!l.id_mutation) continue;
    if (!parMutation.has(l.id_mutation)) parMutation.set(l.id_mutation, []);
    parMutation.get(l.id_mutation).push(l);
  }

  const ventes = [];
  const ecartees = { mixtes: 0, symboliques: 0, sans_surface: 0 };
  for (const [id, lot] of parMutation) {
    if (lot[0].nature_mutation !== 'Vente') continue;
    const types = new Set(lot.map((l) => l.type_local).filter(Boolean));
    if (!types.size) continue;
    if (types.size > 1 || !types.has(TYPE_COMMERCIAL)) {
      if (types.has(TYPE_COMMERCIAL)) ecartees.mixtes++;
      continue;
    }
    const prix = nombre(lot[0].valeur_fonciere);
    const surface = lot.reduce((t, l) => t + (nombre(l.surface_reelle_bati) || 0), 0);
    const situe = lot.find((l) => l.latitude && l.longitude);
    if (!prix || !situe) continue;
    if (prix < PRIX_PLANCHER) { ecartees.symboliques++; continue; }
    if (!surface) { ecartees.sans_surface++; continue; }
    ventes.push({
      id,
      date: lot[0].date_mutation,
      prix,
      surface,
      prix_m2: Math.round(prix / surface),
      // La parcelle et le nombre de lots : c'est ce qui dit si la vente est
      // celle du local qu'on regarde, ou celle d'un immeuble entier.
      parcelle: lot[0].id_parcelle || null,
      lots: lot.length,
      numero: lot[0].adresse_numero ? String(lot[0].adresse_numero) + String(lot[0].adresse_suffixe || '').toLowerCase() : null,
      adresse: [lot[0].adresse_numero, lot[0].adresse_suffixe, lot[0].adresse_nom_voie].filter(Boolean).join(' ').trim(),
      lat: Number(situe.latitude),
      lon: Number(situe.longitude),
    });
  }
  return { ventes, ecartees };
}

/** Les millésimes disponibles, du plus récent au plus ancien. */
// Les fichiers d'une commune, gardés en mémoire quelques heures : un parcours
// ALX lit cinquante adresses de la même commune d'affilée, et chaque fichier
// annuel pèse plusieurs mégaoctets.
const MEMO_MS = 6 * 3600 * 1000;
const memoFichiers = new Map();

// Les ventes commerciales d'une commune, lues et triées une fois : l'analyse
// des fichiers coûte plus que leur téléchargement.
const memoVentes = new Map();
function ventesDeCommune(dep, insee, millesimes) {
  const cle = `${dep}/${insee}/${millesimes.map((m) => m.annee).join(',')}`;
  const connu = memoVentes.get(cle);
  if (connu && Date.now() - connu.le < MEMO_MS) return connu.resultat;
  const resultat = ventesCommerciales(millesimes.flatMap((m) => lireCsv(m.texte)));
  memoVentes.set(cle, { le: Date.now(), resultat });
  return resultat;
}

async function fichiers(dep, insee) {
  const cle = `${dep}/${insee}`;
  const connu = memoFichiers.get(cle);
  if (connu && Date.now() - connu.le < MEMO_MS) return connu.textes;
  const textes = await telechargerFichiers(dep, insee);
  memoFichiers.set(cle, { le: Date.now(), textes });
  return textes;
}

async function telechargerFichiers(dep, insee) {
  const annee = new Date().getFullYear();
  // On interroge DEUX années de plus qu'il n'en faut : l'année en cours n'est
  // jamais publiée, parfois la précédente non plus, et sans cette marge on
  // perdait un millésime entier — celui qui, sur le 93 avenue Marceau, portait
  // la vente de l'immeuble lui-même.
  const essais = [];
  for (let a = annee; a > annee - ANNEES - 2; a--) essais.push(a);
  const textes = await Promise.all(
    essais.map(async (a) => {
      try {
        const r = await fetch(`${racine}/${a}/communes/${dep}/${insee}.csv`, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) return null;
        return { annee: a, texte: await r.text() };
      } catch (e) {
        // Une année absente n'est pas une panne ; un réseau coupé en est une.
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new ErreurSource(`DVF n'a pas répondu (${a}).`, { service: 'DVF', cause: e });
        return null;
      }
    })
  );
  // Les plus récents d'abord, et pas plus que demandé.
  return textes.filter(Boolean).sort((a, b) => b.annee - a.annee).slice(0, ANNEES);
}

// Les lignes d'une commune, lues une fois : cinq fichiers à découper à chaque
// cible ferait le même travail cinquante fois par rue.
const memoLignes = new Map();
function lignesDeCommune(dep, insee, millesimes) {
  const cle = `${dep}/${insee}/${millesimes.map((m) => m.annee).join(',')}`;
  const connu = memoLignes.get(cle);
  if (connu && Date.now() - connu.le < MEMO_MS) return connu.lignes;
  const lignes = millesimes.flatMap((m) => lireCsv(m.texte));
  memoLignes.set(cle, { le: Date.now(), lignes });
  return lignes;
}

/**
 * Toutes les mutations d'une parcelle sur les derniers millésimes, tous types
 * de locaux confondus : c'est ce qui dit si un autre lot de l'immeuble vient
 * de se vendre (une découpe en cours, un immeuble qui change de mains). Une
 * ligne par acte, avec les types de locaux qu'il porte.
 *
 * @param {string} codeInsee
 * @param {string} parcelle - l'identifiant DVF de la parcelle (« 06004000DR0134 »)
 * @returns {Promise<{id: string, date: string, types: string[], lots: number, prix: number|null, commercial_pur: boolean}[]>}
 */
export async function mutationsDeLaParcelle(codeInsee, parcelle) {
  const dep = departementDe(codeInsee);
  if (!dep || SANS_DVF[dep] || !parcelle) return [];
  const millesimes = await fichiers(dep, codeInsee);
  const parMutation = new Map();
  for (const l of lignesDeCommune(dep, codeInsee, millesimes)) {
    if (l.id_parcelle !== parcelle || !l.id_mutation) continue;
    if (!parMutation.has(l.id_mutation)) parMutation.set(l.id_mutation, []);
    parMutation.get(l.id_mutation).push(l);
  }
  return [...parMutation.entries()]
    .map(([id, lot]) => {
      const types = [...new Set(lot.map((l) => l.type_local).filter(Boolean))];
      return {
        id,
        date: lot[0].date_mutation,
        nature: lot[0].nature_mutation,
        types,
        lots: lot.length,
        prix: nombre(lot[0].valeur_fonciere),
        commercial_pur: types.length === 1 && types[0] === TYPE_COMMERCIAL,
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/**
 * Les ventes de locaux commerciaux autour d'une adresse, d'après DVF.
 *
 * @param {string} texteAdresse
 * @param {{rayon?: number, forcer?: boolean, user?: object}} opts
 */
export async function ventesAutour(texteAdresse, { rayon = RAYON_DEFAUT, forcer = false, user = null } = {}) {
  let adresse;
  try {
    adresse = await resoudreAdresse(texteAdresse);
  } catch (e) {
    return { ok: false, error: e.message, statut: e.statut ?? null, classe: e.classe ?? null };
  }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texteAdresse || '').slice(0, 80)} ».` };

  const dep = departementDe(adresse.code_insee);
  if (!dep) return { ok: false, error: `Code INSEE inexploitable pour « ${adresse.label} ».`, classe: SANS_DONNEE };
  if (SANS_DVF[dep]) {
    return {
      ok: false,
      classe: SANS_DONNEE,
      error: `DVF ne couvre pas ${SANS_DVF[dep]} : la publicité foncière y relève du Livre foncier, et la DGFiP n'y publie pas de valeurs foncières.`,
    };
  }

  const cle = `${adresse.code_insee}|${Math.round(adresse.lat * 1e5)}|${Math.round(adresse.lon * 1e5)}|${rayon}`;
  if (!forcer) {
    const recent = Records.filter('DvfRecherche', { cle })
      .filter((x) => Date.now() - Date.parse(x.le) < CACHE_JOURS * 86400000)
      .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, resultat: { ...recent.resultat, du_cache: true } };
  }

  let millesimes;
  try {
    millesimes = await fichiers(dep, adresse.code_insee);
  } catch (e) {
    return { ok: false, error: e.message, classe: e.classe ?? null };
  }
  if (!millesimes.length) {
    return { ok: false, classe: SANS_DONNEE, error: `DVF n'a aucun fichier pour ${adresse.ville} (${adresse.code_insee}).` };
  }

  const { ventes, ecartees } = ventesDeCommune(dep, adresse.code_insee, millesimes);
  const proches = ventes
    .map((v) => ({ ...v, distance_m: Math.round(distanceM(adresse.lat, adresse.lon, v.lat, v.lon)) }))
    .filter((v) => v.distance_m <= rayon)
    .sort((a, b) => a.distance_m - b.distance_m);

  const parM2 = proches.map((v) => v.prix_m2).sort((a, b) => a - b);
  const assez = parM2.length >= N_MINIMUM;
  const dates = proches.map((v) => v.date).filter(Boolean).sort();

  const resultat = {
    source: 'DVF · Demandes de valeurs foncières',
    unite: '€ / m²',
    adresse: adresse.label,
    commune: adresse.ville,
    code_insee: adresse.code_insee,
    rayon,
    annees: millesimes.map((m) => m.annee).sort(),
    // Le prix au m² des ventes de locaux commerciaux, s'il y en a assez.
    prix_m2: assez
      ? { bas: quantile(parM2, 0.25), median: quantile(parM2, 0.5), haut: quantile(parM2, 0.75) }
      : null,
    n: parM2.length,
    n_minimum: N_MINIMUM,
    periode: dates.length ? { du: dates[0], au: dates[dates.length - 1] } : null,
    ventes: proches.slice(0, 40),
    ecartees,
    lien: `https://app.dvf.etalab.gouv.fr/?lat=${adresse.lat}&lon=${adresse.lon}&zoom=17`,
    le: new Date().toISOString(),
    par: user?.email || null,
  };

  Records.create('DvfRecherche', { cle, adresse: adresse.label, rayon, resultat, le: resultat.le, par: resultat.par });
  console.log(`[dvf] ${resultat.n} vente(s) commerciale(s) dans ${rayon} m de « ${texteAdresse} » (${resultat.annees.join(', ')})`);
  return { ok: true, resultat };
}
