// Pappers : la société derrière un nom, ses gérants, sa date de création.
//
// C'est la source des signaux patients (âge des gérants, SCI familiale,
// ancienneté) et du code APE (marchand de biens). Le jeton vit dans .env sous
// PAPPERS_API_KEY ; sans lui, le connecteur le dit et la fiche attend.
//
// Données personnelles : on ne garde des dirigeants que le nom, la qualité et
// une TRANCHE d'âge. Jamais une date de naissance. Le journal d'audit trace
// chaque lecture d'une cible.

import { ErreurSource } from '../marche/erreurs.js';

const API = 'https://api.pappers.fr/v2';
const cle = () => (process.env.PAPPERS_API_KEY || '').trim();

export const pappersConfigure = () => !!cle();

async function appeler(chemin, params) {
  if (!cle()) throw new ErreurSource("Pappers n'est pas configuré : ajoutez PAPPERS_API_KEY dans le .env.", { service: 'Pappers', classe: 'definitive' });
  const url = `${API}/${chemin}?${new URLSearchParams({ ...params, api_token: cle() })}`;
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new ErreurSource(`Pappers n'a pas répondu (${e?.message || e}).`, { service: 'Pappers', cause: e });
  }
  if (r.status === 404) return null;
  if (!r.ok) throw new ErreurSource(`Pappers a répondu ${r.status}.`, { service: 'Pappers', statut: r.status });
  return r.json();
}

/** Une date de naissance ou un âge devient une tranche, et rien d'autre ne sort d'ici. */
export function trancheAge(ageOuDate) {
  let age = Number(ageOuDate);
  if (!Number.isFinite(age) && ageOuDate) {
    const d = new Date(ageOuDate);
    if (!isNaN(d)) age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  }
  if (!Number.isFinite(age) || age <= 0) return null;
  if (age >= 70) return '70+';
  if (age >= 50) return '50-70';
  return '-50';
}

/** Met la réponse de Pappers dans la forme que la cible attend. */
export function normaliser(e) {
  if (!e) return null;
  const siege = e.siege || {};
  return {
    siren: e.siren || null,
    nom: e.nom_entreprise || e.denomination || null,
    forme: e.forme_juridique || null,
    ape: e.code_naf || e.code_ape || null,
    ape_libelle: e.libelle_code_naf || null,
    creation: e.date_creation || null,
    effectif: e.effectif ?? e.tranche_effectif ?? null,
    siege: {
      adresse: [siege.adresse_ligne_1, siege.code_postal, siege.ville].filter(Boolean).join(', ') || null,
      code_postal: siege.code_postal || null,
      ville: siege.ville || null,
      lat: siege.latitude ?? null,
      lon: siege.longitude ?? null,
    },
    gerants: (e.representants || e.dirigeants || []).map((d) => ({
      nom: [d.prenom, d.nom].filter(Boolean).join(' ') || d.nom_complet || d.denomination || null,
      qualite: d.qualite || null,
      tranche_age: trancheAge(d.age ?? d.date_de_naissance_formate ?? d.date_de_naissance),
      personne_morale: !!d.denomination,
    })),
    comptes_deposes: Array.isArray(e.derniers_comptes) ? e.derniers_comptes.length > 0 : e.depot_comptes ?? null,
    procedure_collective: !!e.procedure_collective_en_cours,
    // Les autres sociétés des mêmes personnes, si Pappers les donne.
    autres_biens: [],
    source: 'Pappers',
    lu_le: new Date().toISOString(),
  };
}

/** Une société par SIREN, ou par nom et ville (les SCI homonymes sont fréquentes). */
export async function societe({ siren = null, nom = null, ville = null } = {}) {
  if (siren) {
    const e = await appeler('entreprise', { siren: String(siren).replace(/\s/g, '') });
    return normaliser(e);
  }
  if (!nom) throw new ErreurSource('Il faut un SIREN ou un nom.', { service: 'Pappers', classe: 'definitive' });
  const r = await appeler('recherche', { q: nom, par_page: 5, ...(ville ? { code_postal: '' } : {}) });
  const liste = r?.resultats || [];
  // On recoupe par la ville : « SCI Les Oliviers » existe dans vingt départements.
  const meme = ville ? liste.find((x) => String(x.siege?.ville || '').toLowerCase() === String(ville).toLowerCase()) : null;
  const choix = meme || liste[0] || null;
  if (!choix) return null;
  const detail = choix.siren ? await appeler('entreprise', { siren: choix.siren }) : choix;
  const n = normaliser(detail);
  if (n && !meme && ville) n.ville_non_recoupee = true;
  return n;
}
