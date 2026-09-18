// La société derrière une devanture.
//
// OpenStreetMap donne le SIRET d'environ deux commerces sur trois. À partir de
// lui, deux sources publiques et sans clé complètent la fiche :
//
//   1. « recherche-entreprises » (annuaire des entreprises, DINUM) : identité,
//      siège, dirigeants, établissements, effectif. Une particularité relevée
//      à l'usage : interrogée par SIREN elle ne rend aucun établissement ;
//      interrogée par raison sociale elle les rend tous. On fait donc deux
//      appels, le second par le nom que le premier a donné.
//
//   2. « ratios_inpi_bce » (data.economie.gouv.fr) : les comptes déposés,
//      exercice par exercice. Neuf années pour une société établie.
//
// Ce que ces sources ne donnent pas ne s'invente pas : ni le capital social,
// ni les fonds propres, ni la trésorerie, ni le téléphone. Les champs absents
// restent absents, et l'écran le dit.

import { Records } from './db.js';

const ANNUAIRE = 'https://recherche-entreprises.api.gouv.fr/search';
const RATIOS = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/ratios_inpi_bce/records';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 25000;
// Une société bouge peu : ses comptes une fois l'an, son siège rarement.
const CACHE_JOURS = 7;
const CACHE = 'CacheSocieteKZoning';

// Les catégories juridiques de l'INSEE sont un code à quatre chiffres. Aucune
// table publique interrogeable n'a répondu (trois essais), on garde donc les
// formes que l'équipe rencontre, et le code brut pour les autres.
const FORMES = {
  1000: 'Entrepreneur individuel',
  5202: 'SNC', 5306: 'Société en commandite simple', 5385: 'Société en commandite par actions',
  5410: 'SARL', 5415: 'SARL', 5426: 'SARL', 5442: 'SARL', 5451: 'SARL', 5454: 'SARL', 5498: 'SARL', 5499: 'SARL',
  5505: 'SA', 5510: 'SA', 5515: 'SA', 5520: 'SA', 5530: 'SA', 5599: 'SA',
  5710: 'SAS', 5720: 'SASU', 5785: 'SAS',
  6540: 'SCI', 6220: 'GIE', 9220: 'Association',
};

const nb = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const jour = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null);

async function lire(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(DELAI_MS) });
  if (!r.ok) throw new Error(`la source a répondu ${r.status}`);
  return r.json();
}

/** Les comptes déposés, du plus récent au plus ancien. */
export async function comptesDe(siren) {
  const url = `${RATIOS}?${new URLSearchParams({
    where: `siren="${siren}"`, limit: '20', order_by: 'date_cloture_exercice DESC',
  })}`;
  const d = await lire(url);
  return (d.results || []).map((r) => ({
    exercice: (r.date_cloture_exercice || '').slice(0, 4),
    cloture: jour(r.date_cloture_exercice),
    chiffre_affaires: nb(r.chiffre_d_affaires),
    resultat_net: nb(r.resultat_net),
    marge_brute: nb(r.marge_brute),
    excedent_brut: nb(r.ebe),
    resultat_exploitation: nb(r.ebit),
    taux_endettement: nb(r.taux_d_endettement),
    autonomie_financiere: nb(r.autonomie_financiere),
    ratio_liquidite: nb(r.ratio_de_liquidite),
  })).filter((x) => x.exercice);
}

/**
 * La fiche d'une société, d'après son SIRET ou son nom.
 * @param {{siret?: string, nom?: string, forcer?: boolean}} p
 */
// `leger` : la fiche seule, sans établissements ni comptes — deux appels de
// moins, pour qui n'a besoin que du siège et des dirigeants (K-Foncier).
export async function societe({ siret = null, nom = null, forcer = false, leger = false }) {
  const q = String(siret || nom || '').trim();
  if (!q) return { ok: false, error: 'Ni SIRET ni nom : rien à chercher.' };

  const cle = `q:${q.toLowerCase()}${leger ? ':leger' : ''}`;
  const garde = Records.findBy(CACHE, 'cle', cle);
  const frais = garde?.garde_le && Date.now() - new Date(garde.garde_le).getTime() < CACHE_JOURS * 86400000;
  if (garde && frais && !forcer) return { ok: true, societe: garde.societe, garde_le: garde.garde_le, du_cache: true };

  let brut;
  try {
    brut = await lire(`${ANNUAIRE}?${new URLSearchParams({ q, per_page: '1' })}`);
  } catch (e) {
    if (garde) return { ok: true, societe: garde.societe, garde_le: garde.garde_le, du_cache: true, perime: true };
    return { ok: false, error: `L'annuaire des entreprises n'a pas répondu : ${e?.message || e}` };
  }
  const r = (brut.results || [])[0];
  if (!r) return { ok: false, error: 'Aucune société ne correspond.' };

  // Second appel, par le nom : c'est le seul qui rende les établissements.
  let etablissements = [];
  if (!leger) try {
    const parNom = await lire(`${ANNUAIRE}?${new URLSearchParams({
      q: r.nom_raison_sociale || r.nom_complet, per_page: '1', limite_matching_etablissement: '25',
    })}`);
    const m = (parNom.results || [])[0];
    if (m?.siren === r.siren) {
      etablissements = (m.matching_etablissements || []).map((e) => ({
        siret: e.siret,
        adresse: e.adresse,
        code_postal: e.code_postal,
        commune: e.libelle_commune,
        enseigne: (e.liste_enseignes || [])[0] || null,
        actif: e.etat_administratif === 'A',
        siege: e.siret === r.siege?.siret,
        activite: e.activite_principale,
        lat: nb(e.latitude),
        lon: nb(e.longitude),
      })).sort((a, b) => (b.siege ? 1 : 0) - (a.siege ? 1 : 0) || (b.actif ? 1 : 0) - (a.actif ? 1 : 0));
    }
  } catch { /* les établissements manqueront, le reste de la fiche tient */ }

  let comptes = [];
  if (!leger) try {
    comptes = await comptesDe(r.siren);
  } catch { /* les comptes manqueront, le reste de la fiche tient */ }

  const forme = FORMES[Number(r.nature_juridique)] || null;
  const fiche = {
    siren: r.siren,
    siret: r.siege?.siret || null,
    nom: r.nom_complet,
    raison_sociale: r.nom_raison_sociale,
    sigle: r.sigle || null,
    forme,
    forme_code: r.nature_juridique,
    activite_code: r.activite_principale,
    active: r.etat_administratif === 'A',
    creation: jour(r.date_creation),
    annee_creation: (r.date_creation || '').slice(0, 4),
    categorie: r.categorie_entreprise || null,
    effectif_societe: r.tranche_effectif_salarie || null,
    etablissements_total: r.nombre_etablissements ?? null,
    etablissements_ouverts: r.nombre_etablissements_ouverts ?? null,
    siege: r.siege ? {
      siret: r.siege.siret,
      adresse: r.siege.adresse,
      code_postal: r.siege.code_postal,
      commune: r.siege.libelle_commune,
      lat: nb(r.siege.latitude),
      lon: nb(r.siege.longitude),
      creation: jour(r.siege.date_creation),
      effectif: r.siege.tranche_effectif_salarie || null,
    } : null,
    dirigeants: (r.dirigeants || []).map((d) => ({
      nom: d.type_dirigeant === 'personne morale'
        ? d.denomination
        : [d.prenoms, d.nom].filter(Boolean).join(' ') || d.nom_complet || null,
      qualite: d.qualite || null,
      morale: d.type_dirigeant === 'personne morale',
      siren: d.siren || null,
      annee_naissance: d.annee_de_naissance || null,
    })),
    etablissements,
    comptes,
  };

  const garde_le = new Date().toISOString();
  if (garde) Records.update(CACHE, garde.id, { societe: fiche, garde_le });
  else Records.create(CACHE, { cle, societe: fiche, garde_le });
  return { ok: true, societe: fiche, garde_le };
}
