// BLOC 2 (1/3) — Enrichissement.
//
// Code déterministe. Le seul appel LLM toléré ici est le repli de qualification
// d'enseigne inconnue, et son résultat est explicitement marqué confiance
// "basse" et proposé à validation humaine avant d'entrer au référentiel — il
// n'entre donc jamais silencieusement dans une décision.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { invokeLLM, llmEnabled } from '../llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
// Le cache va dans server/data (ignoré par git) et non dans le référentiel.
const CACHE_FILE = path.join(__dirname, '..', 'data', 'cache-communes.json');

function lireJson(fichier, defaut) {
  try {
    return JSON.parse(fs.readFileSync(fichier, 'utf-8'));
  } catch {
    return defaut;
  }
}

export const REGLES = lireJson(path.join(DATA_DIR, 'rules.json'), {});
const ENSEIGNES = lireJson(path.join(DATA_DIR, 'enseignes.json'), { enseignes: [] });
const ACTIVITES = lireJson(path.join(DATA_DIR, 'activites.json'), { exclues: [], categories: [] });
const REVENUS = lireJson(path.join(DATA_DIR, 'revenus-communes.json'), { communes: {} });

function normaliser(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Ville : population (API publique de l'État) puis typologie
// ---------------------------------------------------------------------------

let cache = lireJson(CACHE_FILE, {});

function ecrireCache() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    /* le cache est un confort, jamais une dépendance */
  }
}

/**
 * Résout un code postal (+ nom de ville pour départager) en commune INSEE.
 * Source : geo.api.gouv.fr — service public, sans clé.
 */
export async function resoudreCommune(codePostal, nomVille) {
  const cp = String(codePostal || '').trim();
  if (!/^\d{5}$/.test(cp)) return null;

  const cle = `${cp}|${normaliser(nomVille)}`;
  // Les entrées mises en cache avant l'ajout des coordonnées (champ `centre`)
  // sont re-résolues une fois, pour que la carte fonctionne aussi sur elles.
  if (cache[cle] && cache[cle].centre !== undefined) return cache[cle];

  let communes = [];
  try {
    const resp = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=nom,code,population,codesPostaux,centre&format=json`
    );
    if (resp.ok) communes = await resp.json();
  } catch {
    return cache[cle] || null; // hors ligne : on ne bloque pas
  }
  if (!communes.length) return cache[cle] || null;

  // Un code postal peut couvrir plusieurs communes : on départage par le nom.
  const cible = normaliser(nomVille);
  const trouvee =
    communes.find((c) => normaliser(c.nom) === cible) ||
    communes.find((c) => cible && normaliser(c.nom).includes(cible)) ||
    // À défaut, la plus peuplée : c'est celle que désigne l'usage courant.
    communes.sort((a, b) => (b.population || 0) - (a.population || 0))[0];

  const resultat = {
    code_insee: trouvee.code,
    nom: trouvee.nom,
    population: trouvee.population ?? null,
    // Coordonnées du centre de la commune (GeoJSON [lon, lat]) : repli de la
    // carte quand l'adresse précise manque.
    centre: trouvee.centre?.coordinates
      ? { lon: trouvee.centre.coordinates[0], lat: trouvee.centre.coordinates[1] }
      : null,
    ambigu: communes.length > 1 && !communes.some((c) => normaliser(c.nom) === cible),
  };
  cache[cle] = resultat;
  ecrireCache();
  return resultat;
}

export function typologieVille(population) {
  if (population == null) return null;
  const seuils = REGLES.typologie_ville?.seuils || [];
  for (const s of seuils) {
    if (s.population_max == null || population < s.population_max) return s.code;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Signature de l'enseigne
// ---------------------------------------------------------------------------

const NIVEAUX = ['nationale_premium', 'nationale_standard', 'franchise', 'independant'];

// Le rapprochement partiel se fait sur des MOTS ENTIERS, jamais sur des
// sous-chaînes : « Boulanger » (l'enseigne d'électroménager) ne doit pas
// s'accrocher à « Boulangerie Chez Marcel », sous peine de promouvoir un
// indépendant au rang d'enseigne nationale — et de fausser le verdict.
function contientSequenceDeMots(phrase, sequence) {
  const mots = phrase.split(' ').filter(Boolean);
  const cible = sequence.split(' ').filter(Boolean);
  if (!cible.length || cible.length > mots.length) return false;
  for (let i = 0; i + cible.length <= mots.length; i++) {
    if (cible.every((m, j) => mots[i + j] === m)) return true;
  }
  return false;
}

export function chercherEnseigne(nom) {
  const n = normaliser(nom);
  if (!n) return null;
  for (const e of ENSEIGNES.enseignes || []) {
    const candidats = [e.nom, ...(e.alias || [])].map(normaliser).filter(Boolean);
    if (candidats.some((c) => c === n)) return { ...e, methode: 'referentiel_exact' };
    // Ex. « SAS Carrefour Market Lyon 3 » -> Carrefour.
    if (candidats.some((c) => c.length >= 4 && contientSequenceDeMots(n, c))) {
      return { ...e, methode: 'referentiel_partiel' };
    }
  }
  return null;
}

const SCHEMA_ENSEIGNE = {
  type: 'object',
  properties: {
    connue: { type: 'boolean', description: "false si l'enseigne n'est pas identifiable" },
    niveau: { type: 'string', enum: NIVEAUX },
    justification: { type: 'string', description: 'Une phrase courte : nature du réseau, ordre de grandeur du nombre de points de vente.' },
  },
  required: ['connue', 'niveau'],
};

async function qualifierParIA(nom) {
  if (!llmEnabled) return null;
  try {
    const r = await invokeLLM({
      prompt: `Qualifie la solidité de signature de ce locataire commercial français : « ${nom} ».

Niveaux :
- nationale_premium : enseigne nationale de premier plan, réseau très étendu, signature de référence
- nationale_standard : enseigne nationale ou grande régionale bien implantée
- franchise : réseau de franchise, le point de vente est exploité par un franchisé indépendant
- independant : commerçant indépendant, société locale, aucune appartenance à un réseau

Si tu ne reconnais pas cette enseigne, réponds connue: false et niveau: "independant".
Ne devine pas : une raison sociale locale non identifiable est un indépendant.`,
      response_json_schema: SCHEMA_ENSEIGNE,
    });
    if (!r || typeof r !== 'object' || !NIVEAUX.includes(r.niveau)) return null;
    return r;
  } catch {
    return null;
  }
}

/**
 * @returns {{niveau: string|null, confiance: 'haute'|'basse', source: string,
 *            a_valider: boolean, justification: string|null}}
 */
export async function qualifierSignature(nomLocataire) {
  if (!nomLocataire) {
    return { niveau: null, confiance: 'basse', source: 'absent', a_valider: false, justification: null };
  }

  const connue = chercherEnseigne(nomLocataire);
  if (connue) {
    return {
      niveau: connue.niveau,
      confiance: 'haute',
      source: connue.methode,
      enseigne: connue.nom,
      a_valider: false,
      justification: null,
    };
  }

  const ia = await qualifierParIA(nomLocataire);
  if (ia?.connue) {
    return {
      niveau: ia.niveau,
      confiance: 'basse', // imposé : hors référentiel
      source: 'ia',
      a_valider: true, // validation humaine avant entrée au référentiel
      justification: ia.justification || null,
    };
  }

  return {
    niveau: 'independant',
    confiance: 'basse',
    source: ia ? 'ia_non_reconnue' : 'defaut',
    a_valider: true,
    justification: ia?.justification || null,
  };
}

/** Ajoute une enseigne validée au référentiel, pour ne plus jamais la redemander. */
export function ajouterAuReferentiel({ nom, niveau, alias = [] }) {
  if (!nom || !NIVEAUX.includes(niveau)) return { success: false, error: 'Enseigne ou niveau invalide.' };
  const fichier = path.join(DATA_DIR, 'enseignes.json');
  const ref = lireJson(fichier, { enseignes: [] });
  const n = normaliser(nom);
  if ((ref.enseignes || []).some((e) => normaliser(e.nom) === n)) {
    return { success: false, error: 'Enseigne déjà présente au référentiel.' };
  }
  ref.enseignes.push({ nom, niveau, alias });
  fs.writeFileSync(fichier, JSON.stringify(ref, null, 2));
  ENSEIGNES.enseignes = ref.enseignes; // prise en compte immédiate
  return { success: true };
}

// ---------------------------------------------------------------------------
// Catégorie d'activité
// ---------------------------------------------------------------------------

/**
 * Mappe un texte libre vers la taxonomie fermée. Les catégories exclues sont
 * testées en premier. Une activité non reconnue sort en 'a_qualifier' — jamais
 * en NO-GO, pour qu'un libellé inhabituel ne tue pas un dossier.
 */
export function categoriserActivite(texteLibre, nomLocataire) {
  const hay = `${normaliser(texteLibre)} ${normaliser(nomLocataire)}`.trim();
  if (!hay) return { code: 'a_qualifier', libelle: 'Activité non renseignée', exclue: false };

  for (const ex of ACTIVITES.exclues || []) {
    if ((ex.mots_cles || []).some((m) => hay.includes(normaliser(m)))) {
      return { code: ex.code, libelle: ex.libelle, exclue: true };
    }
  }
  for (const cat of ACTIVITES.categories || []) {
    if ((cat.mots_cles || []).some((m) => hay.includes(normaliser(m)))) {
      return { code: cat.code, libelle: cat.libelle, exclue: false };
    }
  }
  return { code: 'a_qualifier', libelle: 'Activité à qualifier', exclue: false };
}

// ---------------------------------------------------------------------------
// Enrichissement d'un lot
// ---------------------------------------------------------------------------

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);

/**
 * @param {object} lot - lot extrait et vérifié
 * @param {object} [saisieHumaine] - { emplacement: 'n1'|'n1_bis'|'intermediaire'|'secondaire' }
 */
export async function enrichir(lot, saisieHumaine = {}) {
  const adresse = val(lot.adresse) || {};
  const commune = await resoudreCommune(adresse.code_postal, adresse.ville);
  const revenuMedian = commune ? REVENUS.communes?.[commune.code_insee]?.revenu_median ?? null : null;
  const seuilRiche = REGLES.ville_riche?.seuil_revenu_median ?? null;

  const signature = await qualifierSignature(val(lot.locataire_nom));
  const activite = categoriserActivite(val(lot.locataire_activite), val(lot.locataire_nom));

  const cp = String(adresse.code_postal || '');
  const estParis = /^75\d{3}$/.test(cp) || normaliser(adresse.ville) === 'paris';

  // L'emplacement n'est JAMAIS automatisé : il reste 'a_qualifier' tant qu'un
  // humain ne l'a pas tranché en un clic dans l'interface.
  const emplacementsValides = ['n1', 'n1_bis', 'intermediaire', 'secondaire'];
  const emplacement = emplacementsValides.includes(saisieHumaine.emplacement)
    ? saisieHumaine.emplacement
    : 'a_qualifier';

  return {
    commune: commune
      ? {
          code_insee: commune.code_insee,
          nom: commune.nom,
          population: commune.population,
          centre: commune.centre || null,
          ambigu: commune.ambigu,
        }
      : null,
    typologie_ville: commune ? typologieVille(commune.population) : null,
    revenu_median: revenuMedian,
    // null (et non false) quand la donnée manque : le moteur pose une réserve
    // au lieu de conclure que la ville n'est pas riche.
    ville_riche: revenuMedian == null || seuilRiche == null ? null : revenuMedian > seuilRiche,
    paris: estParis,
    signature,
    activite,
    emplacement,
    emplacement_qualifie_par: emplacement === 'a_qualifier' ? null : 'humain',
  };
}
