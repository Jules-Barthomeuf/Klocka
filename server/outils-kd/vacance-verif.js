// La vérification de K-Vacance (19 oct. 2026, Jules : « comment savoir si c'est bon, si ça donne les bonnes
// informations et si c'est fiable ? »). Trois mesures, de la moins chère à la plus sûre :
//
//   1. LE RÉTRO-TEST DES SIGNAUX (rétro-test, sur les données) : un signal annoncé il y a six mois ou plus
//      (liquidation, redressement, radiation, cession) a-t-il été suivi d'une fermeture au registre ? Mesure si
//      un signal « annonce » vraiment un local qui se libère. Aucun appel, tout est en base.
//   2. L'ÉCHANTILLON TERRAIN : une feuille de locaux que l'outil classe vacants, occupés ou incertains, à vérifier
//      sur place ou sur Street View, puis l'évaluation : précision des « vacants », faux « occupés », et le
//      taux de vacance corrigé avec son intervalle.
//   3. LA COMPARAISON AVEC LES TAUX PUBLIÉS (national, par type d'emplacement) : un contrôle de vraisemblance,
//      pas une preuve.
//
// Ce module est pur : aucune base, aucun réseau. Les scripts et les tests l'appellent.

/** Pure : l'intervalle de Wilson à 95 % d'une proportion k/n, en pourcentage. */
export function wilson(k, n, z = 1.96) {
  if (!n) return { pct: null, bas: null, haut: null, n: 0 };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const r = (x) => Math.round(x * 1000) / 10;
  return { pct: r(p), bas: r(Math.max(0, (c - m) / d)), haut: r(Math.min(1, (c + m) / d)), n };
}

/** Les types de signaux qui annoncent une cessation, du plus fort au plus faible. */
export const TYPES_FORTS = ['liquidation', 'redressement', 'sauvegarde', 'radiation', 'cession'];

/**
 * Pure : le rétro-test des signaux. `signaux` : [{ type, date, siret }] ; `etat` : Map siret → { etat: 'A'|'F', date_fin }.
 * Seuls comptent les signaux d'au moins `delaiJours` jours. Un signal sans établissement connu est écarté et compté.
 */
export function retroTest(signaux, etat, { aujourdhui = Date.now(), delaiJours = 180 } = {}) {
  const limite = aujourdhui - delaiJours * 86400000;
  const par = {};
  let sansEtablissement = 0;
  for (const s of signaux) {
    if (!TYPES_FORTS.includes(s.type) || !s.date || Date.parse(s.date) > limite) continue;
    const e = etat.get(s.siret);
    if (!e) { sansEtablissement++; continue; }
    const t = (par[s.type] ||= { n: 0, fermes: 0, delais: [] });
    t.n++;
    if (e.etat === 'F') {
      t.fermes++;
      if (e.date_fin) t.delais.push(Math.round((Date.parse(e.date_fin) - Date.parse(s.date)) / (30.44 * 86400000)));
    }
  }
  const mediane = (a) => { const t = [...a].sort((x, y) => x - y); return t.length ? t[Math.floor(t.length / 2)] : null; };
  return {
    delai_jours: delaiJours,
    sans_etablissement: sansEtablissement,
    par_type: Object.fromEntries(Object.entries(par).map(([k, v]) => [k, { n: v.n, fermes: v.fermes, ...wilson(v.fermes, v.n), delai_median_mois: mediane(v.delais) }])),
  };
}

/**
 * Pure : l'évaluation d'une feuille de terrain remplie. Chaque ligne : { etat_outil: 'vacant'|'occupe'|'incertain',
 * constat: 'vide'|'occupe'|'travaux'|'autre'|'' }. Les lignes sans constat sont écartées.
 *  - précision : parmi les locaux que l'outil dit vacants, la part vraiment vide ;
 *  - faux occupés : parmi ceux qu'il dit occupés, la part en réalité vide (ce qu'il rate) ;
 *  - taux corrigé : le taux de l'outil repondéré par ces deux mesures, sur les effectifs de la zone.
 * @param {{vacants: number, occupes: number, incertains: number}} zone les effectifs de la zone échantillonnée
 */
export function evaluerFeuille(lignes, zone = null) {
  const lues = lignes.filter((l) => ['vide', 'occupe', 'travaux', 'autre'].includes(String(l.constat || '').trim().toLowerCase()));
  const groupe = (etat) => lues.filter((l) => l.etat_outil === etat);
  const vide = (l) => String(l.constat).trim().toLowerCase() === 'vide';
  const v = groupe('vacant'); const o = groupe('occupe'); const i = groupe('incertain');
  const precision = wilson(v.filter(vide).length, v.length);
  const fauxOccupes = wilson(o.filter(vide).length, o.length);
  const incertainsVides = wilson(i.filter(vide).length, i.length);
  let corrige = null;
  if (zone && v.length && o.length) {
    const total = zone.vacants + zone.occupes + (zone.incertains || 0);
    const estimes = zone.vacants * (precision.pct / 100) + zone.occupes * (fauxOccupes.pct / 100) + (zone.incertains || 0) * ((incertainsVides.pct ?? 0) / 100);
    const bas = zone.vacants * (precision.bas / 100) + zone.occupes * (fauxOccupes.bas / 100);
    const haut = zone.vacants * (precision.haut / 100) + zone.occupes * (fauxOccupes.haut / 100) + (zone.incertains || 0);
    corrige = {
      taux_outil: Math.round((zone.vacants / total) * 1000) / 10,
      taux_corrige: Math.round((estimes / total) * 1000) / 10,
      bas: Math.round((bas / total) * 1000) / 10, haut: Math.round((haut / total) * 1000) / 10,
    };
  }
  return { lignes: lignes.length, constats: lues.length, precision_vacants: precision, faux_occupes: fauxOccupes, incertains_vides: incertainsVides, taux_corrige: corrige };
}

/**
 * Pure : l'échantillon d'une feuille de terrain, tiré à intervalle régulier dans chaque état pour couvrir toute la
 * zone (pas les plus proches seulement). Le tirage est déterministe : la même zone donne la même feuille.
 */
export function echantillonner(locaux, { vacants = 25, occupes = 25, incertains = 10 } = {}) {
  const regulier = (liste, n) => {
    if (liste.length <= n) return liste;
    const pas = liste.length / n;
    return Array.from({ length: n }, (_, k) => liste[Math.floor(k * pas)]);
  };
  const tries = (etat) => locaux.filter((l) => l.etat === etat).sort((a, b) => String(a.adresse).localeCompare(String(b.adresse), 'fr'));
  return [...regulier(tries('vacant'), vacants), ...regulier(tries('occupe'), occupes), ...regulier(tries('incertain'), incertains)];
}

/** Les repères publiés, pour un contrôle de vraisemblance (jamais une preuve). Sources dans docs/plans. */
export const REPERES_PUBLIES = [
  { libelle: 'Tous commerces, France, 2025', taux: 11.6, source: 'Codata Digest 2026, repris par le Conseil national du commerce' },
  { libelle: "Commerces en pied d'immeuble, France, 2025", taux: 11.7, source: 'Codata, repris dans la proposition de loi AN n° 2566' },
  { libelle: 'Tous commerces, France, 2024 (comptage Procos)', taux: 10.64, source: 'Procos, bilan présenté en février 2025' },
  { libelle: 'Paris, 2024', taux: 7.9, source: 'Codata' },
];

/** Pure : la feuille CSV d'un échantillon, séparateur « ; », avec les colonnes à remplir. */
export function feuilleCsv(echantillon, { commune = '', date = '' } = {}) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ')}"`;
  const lien = (l) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${l.lat},${l.lon}`;
  const entete = ['commune', 'date_outil', 'adresse', 'etat_outil', 'confiance_outil', 'raison_outil', 'street_view', 'constat (vide / occupe / travaux / autre)', 'commentaire'];
  return [entete.join(';'), ...echantillon.map((l) => [commune, date, l.adresse, l.etat, l.confiance, l.raison, l.lat != null ? lien(l) : '', '', ''].map(esc).join(';'))].join('\n') + '\n';
}

/** Pure : lit une feuille CSV remplie (séparateur « ; », guillemets) en lignes { etat_outil, constat, adresse }. */
export function lireFeuille(texte) {
  const lignes = String(texte || '').split(/\r?\n/).filter(Boolean);
  const decouper = (l) => { const c = []; let cur = ''; let q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === ';' && !q) { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return c; };
  const [tete, ...corps] = lignes.map(decouper);
  const idx = (nom) => tete.findIndex((t) => t.trim().toLowerCase().startsWith(nom));
  const iA = idx('adresse'); const iE = idx('etat_outil'); const iC = idx('constat');
  return corps.map((c) => ({ adresse: c[iA] || '', etat_outil: (c[iE] || '').trim().toLowerCase(), constat: (c[iC] || '').trim().toLowerCase() }));
}
