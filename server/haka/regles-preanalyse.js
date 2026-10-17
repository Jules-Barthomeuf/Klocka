// Haka, compétence « Pré-analyse d'une fiche » : le verdict, appliqué par le CODE
// sur les valeurs que Haka a lues (17 oct. 2026, Jules). L'IA fournit des valeurs
// avec leur source ; ici les seuils de l'en-tête de la compétence (`regles`) font
// le reste, sans aucun appel à un modèle. Un seuil ne vit jamais seulement dans
// le texte libre de la compétence.
//
// Pure : mêmes valeurs et mêmes règles, même verdict. C'est ce qui permet de
// tester un brouillon de compétence sur des dossiers sans rien écrire.

export const REGLES_PAR_DEFAUT = {
  rendement_brut_min: 5, // %, loyer annuel HT HC / prix FAI
  prix_max: 3000000, // €
  ecart_marche_max: 15, // %, au-dessus du marché seulement
  vacance_max: 15, // %, rue ou quartier
  activites_exclues: ['bureaux', 'professions libérales', 'établissements de nuit', 'kebab'],
  activites_a_verifier: ['restauration rapide hors kebab'],
};

const sans = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const nombre = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const pct = (x) => `${(Math.round(x * 10) / 10).toString().replace('.', ',')} %`;
const euros = (x) => `${Math.round(x).toLocaleString('fr-FR')} €`;

/** Les mots qui reconnaissent une activité de la liste (« établissements de nuit » : boîte, discothèque…). */
const MOTS = {
  // « bureau de tabac » est un commerce : seuls les bureaux comme activité excluent.
  'bureaux': ['bureaux', 'plateau de bureau', 'local de bureau', 'usage de bureau'],
  'professions liberales': ['profession liberale', 'cabinet medical', 'cabinet d\'avocat', 'notaire', 'kinesitherapeute', 'dentiste', 'medecin'],
  'etablissements de nuit': ['boite de nuit', 'discotheque', 'bar de nuit', 'etablissement de nuit', 'night club', 'nightclub'],
  'kebab': ['kebab'],
  'restauration rapide hors kebab': ['tacos', 'burger', 'pizza a emporter', 'restauration rapide', 'fast food', 'snack'],
};
function correspond(texte, activite) {
  const t = sans(texte);
  const cle = sans(activite);
  const mots = MOTS[cle] || [cle.replace(/s$/, '')];
  return mots.some((m) => t.includes(m));
}

/**
 * @param {object} v   valeurs lues : prix_fai, loyer_annuel_ht_hc, occupe, promesse_bail, activite, enseigne,
 *                     enseigne_connue, loyer_marche, prix_marche, vacance_pct, non_renseignees[]
 * @param {object} regles  les règles de l'en-tête (sinon celles par défaut)
 */
export function verdictPreanalyse(v = {}, regles = {}) {
  const r = { ...REGLES_PAR_DEFAUT, ...Object.fromEntries(Object.entries(regles || {}).filter(([, x]) => x !== undefined && x !== null)) };
  const prix = nombre(v.prix_fai);
  const loyer = nombre(v.loyer_annuel_ht_hc);
  const rendement = prix && loyer ? (loyer / prix) * 100 : null;
  const texteActivite = [v.activite, v.enseigne].filter(Boolean).join(' ');

  // 1. Critères éliminatoires : un seul suffit.
  const motifs = [];
  const exclue = (r.activites_exclues || []).find((a) => correspond(texteActivite, a));
  if (exclue) {
    const dit = Object.entries(MOTS).find(([cle]) => cle === sans(exclue))?.[1]?.find((m) => sans(texteActivite).includes(m));
    motifs.push({ code: 'activite_exclue', motif: `Activité exclue : ${dit || exclue}` });
  }
  if (rendement !== null && rendement < r.rendement_brut_min) motifs.push({ code: 'rendement', motif: `Rendement brut de ${pct(rendement)}, sous le minimum de ${pct(r.rendement_brut_min)}` });
  if (prix !== null && prix > r.prix_max) motifs.push({ code: 'prix', motif: `Prix de ${euros(prix)}, au-dessus du maximum de ${euros(r.prix_max)}` });
  if (v.occupe === false && !v.promesse_bail) motifs.push({ code: 'vacant', motif: "Local vacant sans promesse de bail d'un locataire" });
  if (motifs.length) return { verdict: 'ecarte', motif: motifs[0].motif, motifs, points: [], rendement };

  // 2. Points à vérifier : le dossier passe, ces points sont signalés.
  const points = [];
  const loyerMarche = nombre(v.loyer_marche);
  if (loyer !== null && loyerMarche) {
    const ecart = (loyer / loyerMarche - 1) * 100;
    if (ecart > r.ecart_marche_max) {
      const recalcule = prix ? (loyerMarche / prix) * 100 : null;
      points.push({ code: 'loyer_marche', impact: ecart, phrase: `Loyer à +${Math.round(ecart)} % du marché${recalcule !== null ? ` : à loyer de marché, le rendement tomberait à ${pct(recalcule)}` : ''}` });
    }
  }
  const prixMarche = nombre(v.prix_marche);
  if (prix !== null && prixMarche) {
    const ecart = (prix / prixMarche - 1) * 100;
    if (ecart > r.ecart_marche_max) points.push({ code: 'prix_marche', impact: ecart * 0.9, phrase: `Prix à +${Math.round(ecart)} % du marché (DVF)` });
  }
  const vacance = nombre(v.vacance_pct);
  if (vacance !== null && vacance > r.vacance_max) points.push({ code: 'vacance', impact: vacance * 0.8, phrase: `Vacance commerciale de ${pct(vacance)}, au-dessus de ${pct(r.vacance_max)}` });
  const aVerifier = (r.activites_a_verifier || []).find((a) => correspond(texteActivite, a));
  if (aVerifier) points.push({ code: 'activite', impact: 10, phrase: `Activité à vérifier : ${v.activite || v.enseigne}` });
  if (v.enseigne && v.enseigne_connue === false) points.push({ code: 'enseigne', impact: 5, phrase: `Enseigne absente du référentiel : ${v.enseigne}` });
  for (const champ of v.non_renseignees || []) points.push({ code: `non_renseigne:${champ}`, impact: 1, phrase: `${champ} : non renseigné` });
  points.sort((a, b) => b.impact - a.impact);

  return points.length
    ? { verdict: 'a_verifier', motif: points[0].phrase, motifs: [], points, rendement }
    : { verdict: 'conforme', motif: null, motifs: [], points: [], rendement };
}

/** Les règles d'un en-tête de compétence, nettoyées (nombres, listes). */
export function nettoyerRegles(regles) {
  const sortie = {};
  for (const [nom, valeur] of Object.entries(regles && typeof regles === 'object' ? regles : {})) {
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(nom)) continue;
    if (Array.isArray(valeur)) sortie[nom] = valeur.map((x) => String(x).trim()).filter(Boolean).slice(0, 40);
    else if (typeof valeur === 'boolean') sortie[nom] = valeur;
    else if (typeof valeur === 'number' && Number.isFinite(valeur)) sortie[nom] = valeur;
    else if (typeof valeur === 'string' && valeur.trim() !== '' && Number.isFinite(Number(valeur.replace(',', '.')))) sortie[nom] = Number(valeur.replace(',', '.'));
    else if (typeof valeur === 'string' && valeur.trim()) sortie[nom] = valeur.trim().slice(0, 200);
  }
  return sortie;
}
