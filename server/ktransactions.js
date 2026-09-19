// K-Transactions : ce que les murs et les fonds se sont vraiment vendus.
//
// Deux marchés distincts, deux sources, et il ne faut pas les confondre :
//
//   LES MURS, c'est l'immobilier. DVF publie chaque vente enregistrée par
//   l'administration fiscale : prix net vendeur, surface, date, parcelle. Le
//   module dvf.js le lit déjà pour la pré-analyse ; on s'en sert tel quel.
//
//   LES FONDS DE COMMERCE, c'est autre chose : on achète une clientèle, un
//   bail, un matériel. Le prix n'est pas au cadastre, il est au BODACC, que
//   la DILA publie en open data. La phrase « acquis par achat au prix stipulé
//   de 80000.00 euros » s'y lit en clair dans l'origine du fonds.
//
// Le BODACC ne porte pas de coordonnées, mais il porte l'adresse du fonds
// jusqu'au numéro de voie : les comparables se rapprochent par le nom de rue,
// pas par un rayon. C'est dit à l'écran, parce qu'une distance inventée serait
// pire qu'une distance absente.
//
// Tout est gratuit et public. Aucun crédit n'est dépensé.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';

const BODACC = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 30000;
const CACHE = 'CacheCessionsBodacc';
// Le BODACC paraît chaque jour, mais une cession d'hier ne change pas une
// médiane : une semaine de cache épargne le service et ne coûte rien.
const CACHE_JOURS = 7;
const ANNEES_DEFAUT = 5;
const RECHERCHE = 'RechercheTransactions';

/**
 * Le prix d'une cession, lu dans l'origine du fonds. Pure : testée sans réseau.
 *
 * Le BODACC n'a pas de champ « prix » : la somme est dans une phrase, et les
 * greffes ne l'écrivent pas tous pareil. On accepte les tournures relevées,
 * et on rend null plutôt que de deviner — une annonce sans prix reste une
 * annonce sans prix.
 */
export function prixDuFonds(texte) {
  const t = String(texte || '');
  const motifs = [
    /prix\s+stipul[ée]\s+de\s+([\d\s.,]+)\s*euros/i,
    /moyennant\s+le\s+prix\s+de\s+([\d\s.,]+)\s*euros/i,
    /au\s+prix\s+de\s+([\d\s.,]+)\s*euros/i,
    /prix\s*:\s*([\d\s.,]+)\s*euros/i,
  ];
  for (const m of motifs) {
    const trouve = t.match(m);
    if (!trouve) continue;
    // « 80000.00 » et « 80 000,00 » disent la même somme.
    const brut = trouve[1].replace(/\s/g, '').replace(/,(\d{2})$/, '.$1').replace(/,/g, '');
    const n = Number(brut);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

const normaliserRue = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\b(rue|avenue|av|boulevard|bd|place|pl|cours|chemin|impasse|allee|allees|quai|route|rte)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Le BODACC rend ses champs composés en CHAÎNE JSON échappée, pas en objet :
// « listeetablissements » arrive comme "{\"etablissement\": {…}}". Lu comme un
// objet, il ne rendait jamais de prix — six cent vingt cessions, zéro montant.
// On accepte les deux formes, au cas où le service changerait d'avis.
const objet = (v) => {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
};
// Une annonce peut porter plusieurs établissements : on garde le premier, qui
// est le fonds cédé.
const premier = (v) => (Array.isArray(v) ? v[0] || {} : v || {});

/** Une cession, telle qu'on la garde. Pure : testée sans réseau. */
export function lireCession(a) {
  const etab = premier(objet(a?.listeetablissements).etablissement);
  const adresse = premier(etab.adresse);
  const prix = prixDuFonds(etab.origineFonds);
  const vendeur = premier(objet(a?.listeprecedentproprietaire).personne) || premier(objet(a?.listeprecedentexploitant).personne);
  return {
    id: a?.id || null,
    date: a?.dateparution || null,
    acquereur: a?.commercant || null,
    vendeur: vendeur?.denomination || [vendeur?.prenom, vendeur?.nom].filter(Boolean).join(' ') || null,
    prix,
    activite: etab.activite ? String(etab.activite).slice(0, 220) : null,
    qualite: etab.qualiteEtablissement || null,
    categorie: objet(a?.acte)?.vente?.categorieVente || null,
    adresse: [adresse.numeroVoie, adresse.typeVoie, adresse.nomVoie].filter(Boolean).join(' ') || null,
    rue: normaliserRue([adresse.typeVoie, adresse.nomVoie].filter(Boolean).join(' ')),
    code_postal: adresse.codePostal || a?.cp || null,
    ville: adresse.ville || a?.ville || null,
    tribunal: a?.tribunal || null,
  };
}

const mediane = (xs) => {
  if (!xs.length) return null;
  const t = [...xs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : Math.round((t[m - 1] + t[m]) / 2);
};

/**
 * Le marché des fonds : la médiane, l'étendue, et les comparables de la rue.
 * Pure : testée sans réseau.
 */
export function marcheDesFonds(cessions, rueVisee = null) {
  const avecPrix = cessions.filter((c) => c.prix != null);
  const prix = avecPrix.map((c) => c.prix);
  const rue = normaliserRue(rueVisee);
  const memeRue = rue ? avecPrix.filter((c) => c.rue === rue) : [];
  return {
    n: cessions.length,
    n_avec_prix: avecPrix.length,
    // Une annonce de vente sur deux ne dit pas son prix : une fusion, un apport,
    // une cession entre associés n'en portent pas. On le dit plutôt que de
    // laisser croire que la médiane porte sur tout.
    prix: prix.length
      ? { median: mediane(prix), bas: mediane(prix.filter((p) => p <= mediane(prix))), haut: mediane(prix.filter((p) => p >= mediane(prix))), min: Math.min(...prix), max: Math.max(...prix) }
      : null,
    rue: rue || null,
    comparables_rue: memeRue.slice(0, 10),
    prix_rue: memeRue.length ? mediane(memeRue.map((c) => c.prix)) : null,
  };
}

/**
 * Beaucoup de ventes, ou pas ? Pure : testée sans réseau.
 *
 * Un nombre de ventes ne veut rien dire seul : cent ventes dans un quartier de
 * mille locaux, ce n'est pas cent ventes dans un quartier de cent. On rapporte
 * donc les ventes au parc, et on rend le résultat en DURÉE plutôt qu'en score :
 * « un local change de main tous les X ans » se juge sans barème, là où
 * « rotation élevée » demanderait un seuil que personne n'a fixé.
 *
 * Beaucoup de transactions n'est d'ailleurs pas bon en soi : cela peut dire un
 * quartier recherché comme un quartier dont on sort. L'écran le dit.
 */
export function rotationDesMurs(nVentes, nAnnees, locaux) {
  const n = Number(nVentes) || 0;
  const annees = Number(nAnnees) || 0;
  const parc = Number(locaux) || 0;
  if (!n || !annees || !parc) return null;
  const par_an = n / annees;
  return {
    ventes: n,
    annees,
    locaux: parc,
    ventes_par_an: Math.round(par_an * 10) / 10,
    part_annuelle: Math.round((par_an / parc) * 1000) / 10,
    // Le temps qu'il faudrait, à ce rythme, pour que tout le parc soit vendu.
    periode_ans: Math.round((parc / par_an) * 10) / 10,
  };
}

/**
 * Cette rue bouge-t-elle plus que les autres ? Pure : testée sans réseau.
 *
 * Le BODACC ne donne pas de coordonnées, donc pas de densité : la seule
 * comparaison honnête est celle des rues entre elles, dans la même commune et
 * sur la même période.
 */
export function tensionDeLaRue(cessions, rueVisee) {
  const rue = normaliserRue(rueVisee);
  const parRue = new Map();
  for (const c of cessions || []) {
    if (!c?.rue) continue;
    parRue.set(c.rue, (parRue.get(c.rue) || 0) + 1);
  }
  const comptes = [...parRue.values()].sort((a, b) => a - b);
  if (!comptes.length) return null;
  const q = (p) => comptes[Math.min(comptes.length - 1, Math.floor(comptes.length * p))];
  const n_rue = rue ? parRue.get(rue) || 0 : null;
  return {
    rue: rue || null,
    n_rue,
    rues_comptees: comptes.length,
    mediane_par_rue: q(0.5),
    haut_par_rue: q(0.75),
    // La part des rues de la commune qui ont eu moins de cessions que celle-ci.
    rang: n_rue == null ? null : Math.round((comptes.filter((x) => x < n_rue).length / comptes.length) * 100),
  };
}

async function lireBodacc(params) {
  const r = await fetch(`${BODACC}?${new URLSearchParams(params)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(DELAI_MS),
  });
  if (!r.ok) throw new Error(`Le BODACC a répondu ${r.status}`);
  return r.json();
}

/** Les cessions de fonds d'une commune, sur les dernières années. */
export async function cessionsDeLaCommune(codePostal, ville, { annees = ANNEES_DEFAUT, forcer = false } = {}) {
  const cle = `${codePostal}|${annees}`;
  const garde = Records.filter(CACHE, { cle })[0];
  if (garde && !forcer && Date.now() - Date.parse(garde.le) < CACHE_JOURS * 86400000) {
    return { ok: true, cessions: garde.cessions, du_cache: true, le: garde.le };
  }
  const depuis = new Date();
  depuis.setFullYear(depuis.getFullYear() - annees);
  const where = `familleavis="vente" and cp="${codePostal}" and dateparution>"${depuis.toISOString().slice(0, 10)}"`;
  const cessions = [];
  try {
    // L'API plafonne à cent par page ; on s'arrête à mille, largement assez
    // pour une commune sur cinq ans.
    for (let offset = 0; offset < 1000; offset += 100) {
      const d = await lireBodacc({ where, limit: '100', offset: String(offset), order_by: 'dateparution desc' });
      const lot = (d.results || []).map(lireCession);
      cessions.push(...lot);
      if (lot.length < 100 || cessions.length >= (d.total_count || 0)) break;
    }
  } catch (e) {
    if (garde) return { ok: true, cessions: garde.cessions, du_cache: true, perime: true, le: garde.le };
    return { ok: false, error: e?.message || String(e) };
  }
  const le = new Date().toISOString();
  if (garde) Records.update(CACHE, garde.id, { cessions, le });
  else Records.create(CACHE, { cle, code_postal: codePostal, ville, cessions, le });
  return { ok: true, cessions, le };
}

/** Une adresse : le marché des murs, celui des fonds, et les comparables. */
export async function analyser(texte, { annees = ANNEES_DEFAUT, rayon = 500, user = null } = {}) {
  let adresse;
  try { adresse = await resoudreAdresse(texte); }
  catch (e) { return { ok: false, error: e.message }; }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };

  const [murs, fonds, locaux] = await Promise.all([
    (async () => {
      try {
        const { ventesAutour } = await import('./dvf.js');
        const r = await ventesAutour(adresse.label, { rayon, user });
        return r.ok ? r.resultat : { erreur: r.error };
      } catch (e) { return { erreur: e?.message || String(e) }; }
    })(),
    cessionsDeLaCommune(adresse.code_postal, adresse.ville, { annees }),
    // Le parc de locaux du secteur, relevé sur OpenStreetMap : sans lui, un
    // nombre de ventes ne peut pas se juger. Gratuit, et déjà en cache.
    (async () => {
      try {
        const { commercesDeLaZone } = await import('./kzoning-commerces.js');
        const { TOUS_LES_COMMERCES } = await import('./kzoning-metiers.js');
        const r = await commercesDeLaZone({ lat: adresse.lat, lon: adresse.lon, rayon_m: rayon, filtres: TOUS_LES_COMMERCES.filtres });
        return r.ok ? (r.commerces || []).length : null;
      } catch { return null; }
    })(),
  ]);

  const marche = fonds.ok ? marcheDesFonds(fonds.cessions, adresse.rue) : null;
  const rotation = murs?.erreur ? null : rotationDesMurs(murs?.n, (murs?.annees || []).length, locaux);
  const tension = fonds.ok ? tensionDeLaRue(fonds.cessions, adresse.rue) : null;
  const point = { lat: adresse.lat, lon: adresse.lon, label: adresse.label, ville: adresse.ville, code_postal: adresse.code_postal, rue: adresse.rue };

  const existante = Records.list(RECHERCHE).find((x) => x.adresse === adresse.label);
  const le = new Date().toISOString();
  if (existante) Records.update(RECHERCHE, existante.id, { le, par: user?.email || existante.par });
  else Records.create(RECHERCHE, { adresse: adresse.label, point, le, par: user?.email || null }, user?.email);

  return {
    ok: true,
    point,
    annees,
    rayon,
    murs: murs?.erreur ? null : murs,
    murs_erreur: murs?.erreur || null,
    locaux,
    rotation,
    tension_rue: tension,
    fonds: marche,
    fonds_erreur: fonds.ok ? null : fonds.error,
    cessions: fonds.ok ? fonds.cessions.filter((c) => c.prix != null).slice(0, 60) : [],
    du_cache: !!fonds.du_cache,
  };
}

export function listerRecherches(limite = 30) {
  const vues = new Set();
  return Records.list(RECHERCHE)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .filter((x) => !vues.has(x.adresse) && vues.add(x.adresse))
    .slice(0, limite)
    .map(({ id, adresse, point, le, par }) => ({ id, adresse, point, le, par }));
}
