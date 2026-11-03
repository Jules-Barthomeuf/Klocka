// La valeur d'un fonds de commerce (3 nov. 2026, Jules) : trois méthodes croisées pour une fourchette de négociation.
//
// 1. Le barème : un pourcentage du chiffre d'affaires HT moyen des trois derniers exercices. Simple et codifié, il
//    ignore la rentabilité.
// 2. La rentabilité : un multiple de l'EBE retraité moyen. La méthode des banquiers (elle dit si l'affaire rembourse
//    son emprunt) : elle pèse double.
// 3. Les comparables : les cessions de fonds de la même activité autour (Data-B, BODACC en secours).
//
// Les barèmes et les multiples sont ceux que Jules a donnés le 3 nov. 2026. Un secteur qui n'en a pas reste sans
// cette méthode, sauf si le mandataire dit le coefficient (bareme_ca_pct, multiple_ebe). Rien ne s'invente : une
// méthode sans base ne compte pas. Les chiffres se calculent ici ; le modèle n'écrit que les phrases.

const POIDS = { rentabilite: 2, bareme: 1, comparables: 1 };
const COMPARABLES_MIN = 3;
const ANNEES = 5;

// Les plus précis d'abord : un snack est de la restauration rapide avant d'être de la restauration.
export const SECTEURS = [
  { cle: 'restauration_rapide', libelle: 'Restauration rapide, snack', mots: /snack|kebab|burger|pizz|sandwich|restauration rapide|fast.?food|tacos|crepe|crêpe/, ca: [50, 105], ebe: [3, 4.5],
    // Le BODACC décrit souvent un snack en « restauration » : ses cessions comptent comme comparables.
    famille: /restau/ },
  { cle: 'restauration', libelle: 'Restauration', mots: /restau|brasserie|bistr|traiteur/, ca: [50, 105], ebe: null },
  { cle: 'pharmacie', libelle: "Pharmacie d'officine", mots: /pharmac|officine/, ca: [60, 120], ebe: [6, 9] },
  { cle: 'boulangerie', libelle: 'Boulangerie-pâtisserie', mots: /boulang|patiss|pâtiss|viennois/, ca: [50, 120], ebe: null },
  { cle: 'tabac', libelle: 'Tabac-presse-loto', mots: /tabac|presse|loto|fdj|pmu|buraliste/, ca: [80, 185], ebe: [4, 7] },
  { cle: 'coiffure', libelle: 'Coiffure', mots: /coiff|barbe?r/, ca: null, ebe: [2.5, 4] },
];

const sansAccent = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Pure : le secteur d'une activité dite ou lue, ou rien. */
export function secteurDe(activite) {
  const t = sansAccent(activite);
  if (!t) return null;
  return SECTEURS.find((s) => s.mots.test(t) || s.mots.test(String(activite).toLowerCase())) || null;
}

/** Pure : la moyenne des montants connus (un, deux ou trois exercices), ou rien. */
export function moyenne(montants) {
  const xs = (montants || []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

/** Pure : une fourchette dite par le mandataire, « 60 à 90 » ou « 4 », en [bas, haut]. */
export function fourchetteDite(v) {
  if (v == null || v === '') return null;
  if (Array.isArray(v)) return v.length ? [Number(v[0]), Number(v[v.length - 1])] : null;
  const ns = (String(v).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(',', '.'))).filter((x) => x > 0);
  if (!ns.length) return null;
  return [Math.min(...ns), Math.max(...ns)];
}

const milieu = ([a, b]) => (a + b) / 2;

/** Pure : la méthode du barème, sur le CA HT moyen. */
export function parBareme(caMoyen, coef) {
  if (!(caMoyen > 0) || !coef) return null;
  return { cle: 'bareme', nom: 'Barème (% du chiffre d\'affaires)', base: caMoyen, coefficient: coef, unite: '%',
    bas: Math.round(caMoyen * coef[0] / 100), milieu: Math.round(caMoyen * milieu(coef) / 100), haut: Math.round(caMoyen * coef[1] / 100) };
}

/** Pure : la méthode de la rentabilité, sur l'EBE retraité moyen. */
export function parRentabilite(ebeMoyen, coef) {
  if (!(ebeMoyen > 0) || !coef) return null;
  return { cle: 'rentabilite', nom: "Rentabilité (multiple de l'EBE)", base: ebeMoyen, coefficient: coef, unite: 'x',
    bas: Math.round(ebeMoyen * coef[0]), milieu: Math.round(ebeMoyen * milieu(coef)), haut: Math.round(ebeMoyen * coef[1]) };
}

function quantile(xs, q) {
  const t = [...xs].sort((a, b) => a - b);
  const i = (t.length - 1) * q;
  const bas = Math.floor(i); const haut = Math.ceil(i);
  return Math.round(t[bas] + (t[haut] - t[bas]) * (i - bas));
}

/**
 * Pure : la méthode des comparables. Les cessions de la même activité (le secteur, sinon les mots de l'activité),
 * de moins de cinq ans, avec un prix. Trois au moins, sinon la méthode ne compte pas. Le quart bas, la médiane et le
 * quart haut font la fourchette : une cession hors norme ne la tire pas.
 */
export function parComparables(transactions, { secteur = null, activite = null, maintenantMs = Date.now(), source = null } = {}) {
  const limite = maintenantMs - ANNEES * 365.25 * 86400000;
  const motsActivite = sansAccent(activite).split(/[^a-z]+/).filter((m) => m.length >= 5);
  const memeActivite = (t) => {
    const a = sansAccent(t.activite);
    if (!a) return false;
    if (secteur) return secteur.mots.test(a) || !!secteur.famille?.test(a);
    return motsActivite.some((m) => a.includes(m));
  };
  const retenues = (transactions || [])
    .filter((t) => Number(t.prix) > 0 && (!t.date || Date.parse(t.date) >= limite) && memeActivite(t))
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity) || String(b.date).localeCompare(String(a.date)));
  if (retenues.length < COMPARABLES_MIN) return { cle: 'comparables', nombre: retenues.length, insuffisant: true, source, retenues: retenues.slice(0, 5) };
  const prix = retenues.map((t) => Number(t.prix));
  return { cle: 'comparables', nom: 'Comparables (cessions de fonds)', nombre: retenues.length, source,
    bas: quantile(prix, 0.25), milieu: quantile(prix, 0.5), haut: quantile(prix, 0.75), retenues: retenues.slice(0, 5) };
}

/**
 * Pure : la valeur du fonds, du questionnaire et des cessions autour. Rend les méthodes retenues, leur poids, la
 * valeur et la fourchette croisées (moyennes pondérées), et ce qui manque pour la méthode écartée.
 */
export const RAYON_COMPARABLES = 1000;

export function evaluerFonds(q = {}, { transactions = [], source = null, maintenantMs = Date.now() } = {}) {
  const activite = q.activite_fonds || q.activite_locataire || q.activite || null;
  const secteur = secteurDe(activite);
  const caMoyen = moyenne([q.ca_n, q.ca_n1, q.ca_n2]);
  const ebeMoyen = moyenne([q.ebe_n, q.ebe_n1, q.ebe_n2]);
  const coefCa = fourchetteDite(q.bareme_ca_pct) || secteur?.ca || null;
  const coefEbe = fourchetteDite(q.multiple_ebe) || secteur?.ebe || null;
  const bareme = parBareme(caMoyen, coefCa);
  const rentabilite = parRentabilite(ebeMoyen, coefEbe);
  const comparables = parComparables(transactions, { secteur, activite, maintenantMs, source });
  const retenues = [rentabilite, bareme, comparables?.insuffisant ? null : comparables].filter(Boolean)
    .map((m) => ({ ...m, poids: POIDS[m.cle] }));
  const ecartees = [];
  if (!rentabilite) ecartees.push({ cle: 'rentabilite', raison: !ebeMoyen ? "l'EBE n'est pas connu" : "pas de multiple d'EBE pour ce secteur" });
  if (!bareme) ecartees.push({ cle: 'bareme', raison: !caMoyen ? "le chiffre d'affaires n'est pas connu" : 'pas de barème pour ce secteur' });
  if (!retenues.some((m) => m.cle === 'comparables')) ecartees.push({ cle: 'comparables', raison: `${comparables.nombre} cession${comparables.nombre > 1 ? 's' : ''} de la même activité autour, il en faut ${COMPARABLES_MIN}` });
  const total = retenues.reduce((a, m) => a + m.poids, 0);
  const pondere = (k) => (total ? Math.round(retenues.reduce((a, m) => a + m[k] * m.poids, 0) / total) : null);
  return {
    activite, secteur: secteur ? { cle: secteur.cle, libelle: secteur.libelle } : null,
    ca_moyen: caMoyen, ebe_moyen: ebeMoyen,
    exercices: { ca: [q.ca_n, q.ca_n1, q.ca_n2].filter((x) => Number(x) > 0).length, ebe: [q.ebe_n, q.ebe_n1, q.ebe_n2].filter((x) => Number(x) > 0).length },
    methodes: retenues, ecartees,
    comparables: { nombre: comparables.nombre, source, retenues: comparables.retenues || [] },
    moyenne: pondere('milieu'), basse: pondere('bas'), haute: pondere('haut'),
  };
}
