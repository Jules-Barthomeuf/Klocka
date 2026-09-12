// L'annuaire des entreprises : la société derrière un nom, ses dirigeants, sa
// date de création. Une source de l'État, gratuite, sans clé, adossée à
// l'INSEE et au registre national des entreprises. C'est ce que les services
// payants revendent ; on va le chercher à la source.
//
// C'est ici que naissent les signaux patients (âge des gérants, SCI
// familiale, ancienneté) et le code APE (marchand de biens, 6810Z).
//
// Données personnelles : on ne garde des dirigeants que le nom, la qualité et
// une TRANCHE d'âge, calculée depuis l'année de naissance quand l'annuaire la
// diffuse, jamais une date. Le journal d'audit trace chaque lecture d'une
// cible.

import { ErreurSource } from '../marche/erreurs.js';

const API = 'https://recherche-entreprises.api.gouv.fr/search';

// Les natures juridiques qu'on croise sur des murs commerciaux. Le code INSEE
// reste en repli pour les autres.
const NATURES = {
  6540: 'SCI',
  6599: 'Société civile',
  5710: 'SAS',
  5720: 'SASU',
  5499: 'SA',
  5498: 'SARL unipersonnelle',
  5410: 'SARL',
  5306: 'SARL',
  6220: 'GIE',
  1000: 'Entrepreneur individuel',
  9220: 'Association',
};

async function appeler(params) {
  const url = `${API}?${new URLSearchParams({ per_page: '5', ...params })}`;
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  } catch (e) {
    throw new ErreurSource(`L'annuaire des entreprises n'a pas répondu (${e?.message || e}).`, { service: 'Annuaire des entreprises', cause: e });
  }
  if (!r.ok) throw new ErreurSource(`L'annuaire des entreprises a répondu ${r.status}.`, { service: 'Annuaire des entreprises', statut: r.status });
  return r.json();
}

/** Une année de naissance devient une tranche, et rien d'autre ne sort d'ici. */
export function trancheAge(annee) {
  const a = Number(annee);
  if (!Number.isFinite(a) || a < 1900) return null;
  const age = new Date().getFullYear() - a;
  if (age >= 70) return '70+';
  if (age >= 50) return '50-70';
  return '-50';
}

/** Met la réponse de l'annuaire dans la forme que la cible attend. */
export function normaliser(e) {
  if (!e) return null;
  const siege = e.siege || {};
  const finances = e.finances && typeof e.finances === 'object' ? Object.keys(e.finances) : [];
  return {
    siren: e.siren || null,
    nom: e.nom_complet || e.nom_raison_sociale || null,
    forme: NATURES[String(e.nature_juridique)] || (e.nature_juridique ? `nature ${e.nature_juridique}` : null),
    ape: e.activite_principale ? String(e.activite_principale).replace('.', '') : null,
    creation: e.date_creation || null,
    fermee_le: e.date_fermeture || null,
    active: e.etat_administratif === 'A',
    effectif: e.tranche_effectif_salarie && e.tranche_effectif_salarie !== 'NN' ? e.tranche_effectif_salarie : null,
    nombre_etablissements: e.nombre_etablissements ?? null,
    siege: {
      adresse: siege.adresse || null,
      code_postal: siege.code_postal || null,
      ville: siege.libelle_commune || null,
      lat: siege.latitude != null ? Number(siege.latitude) : null,
      lon: siege.longitude != null ? Number(siege.longitude) : null,
    },
    gerants: (e.dirigeants || []).map((d) => ({
      nom: d.type_dirigeant === 'personne morale' ? d.denomination || d.nom || null : [d.prenoms, d.nom].filter(Boolean).join(' ') || d.nom || null,
      // L'annuaire sépare le nom des prénoms : on le garde tel quel, c'est ce
      // qui permet de voir une famille sans deviner où finit le prénom.
      nom_famille: d.type_dirigeant === 'personne morale' ? null : String(d.nom || '').replace(/\([^)]*\)/g, ' ').trim() || null,
      qualite: d.qualite || null,
      tranche_age: trancheAge(d.annee_de_naissance),
      personne_morale: d.type_dirigeant === 'personne morale',
    })),
    // Des comptes sont publiés si l'annuaire a au moins un exercice.
    comptes_deposes: finances.length > 0,
    derniers_comptes: finances.length ? e.finances[finances.sort().pop()] : null,
    source: 'Annuaire des entreprises',
    lu_le: new Date().toISOString(),
  };
}

/**
 * Une société par SIREN, ou par nom et code postal. Les SCI homonymes sont
 * fréquentes : le code postal filtre côté annuaire, et à défaut on recoupe
 * par la ville.
 */
export async function societe({ siren = null, nom = null, ville = null, code_postal = null } = {}) {
  const propre = String(siren || '').replace(/\s/g, '');
  if (propre) {
    const r = await appeler({ q: propre, per_page: '1' });
    const e = (r.results || []).find((x) => x.siren === propre) || null;
    return normaliser(e);
  }
  if (!nom) throw new ErreurSource('Il faut un SIREN ou un nom.', { service: 'Annuaire des entreprises', classe: 'definitive' });

  const params = { q: nom };
  if (code_postal) params.code_postal = String(code_postal).trim();
  let liste = (await appeler(params)).results || [];
  // Rien avec le code postal : on élargit, et on le dira.
  let elargi = false;
  if (!liste.length && code_postal) {
    liste = (await appeler({ q: nom })).results || [];
    elargi = true;
  }
  if (!liste.length) return null;

  const villeNorm = String(ville || '').trim().toLowerCase();
  const meme = villeNorm ? liste.find((x) => String(x.siege?.libelle_commune || '').toLowerCase() === villeNorm) : null;
  const choix = meme || liste[0];
  const n = normaliser(choix);
  if (n && !meme && (villeNorm || elargi)) n.ville_non_recoupee = true;
  if (n && liste.length > 1) n.homonymes = liste.length;
  return n;
}
