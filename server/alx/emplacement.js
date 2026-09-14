// L'emplacement d'une adresse, pour l'analyse de marché.
//
// Ce qu'ALX a appris sur les rues sert aussi aux dossiers : une adresse, et on
// dit ce que vaut sa rue dans SA ville — son rang parmi les rues commerçantes,
// combien de vitrines elle porte, sur quelle longueur, quelles enseignes, le
// loyer de marché de la rue chez Data-B, le flux estimé. Gratuit : OpenStreetMap
// pour les rues et les vitrines, Data-B pour le loyer (pas de crédit, c'est la
// valeur locative, pas l'étude d'implantation).
//
// Quand la ville a déjà été relevée par ALX, c'est SON classement qui parle :
// le dossier et la prospection disent alors la même chose de la même rue.
// Sinon le relevé est fait à la demande et gardé trente jours.

import { Records } from '../db.js';
import { communeDe, classerParRang, prixDeLaRue } from './rues.js';
import { ruesEtVitrines } from './osm.js';
import { cleRue } from './commerces.js';
import { REGLES } from './classement.js';

const JOURS = 30;
const maintenant = () => new Date().toISOString();
const SEUILS = REGLES.parcours || {};

/** Le relevé OpenStreetMap d'une commune, gardé trente jours. */
export async function releveDe(commune, { forcer = false } = {}) {
  const garde = Records.filter('ReleveOsm', { code_insee: commune.code_insee })
    .filter((r) => Date.now() - Date.parse(r.le) < JOURS * 86400000)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
  if (garde && !forcer) return { ...garde.releve, du_cache: true, le: garde.le };
  const r = await ruesEtVitrines({ code_insee: commune.code_insee, lat: commune.lat, lon: commune.lon });
  // On ne garde que ce qui sert : le tracé complet de chaque rue pèse lourd.
  const releve = {
    rues: r.rues.map((x) => ({ cle: x.cle, nom: x.nom, vitrines: x.vitrines, longueur_m: x.longueur_m, type: x.type, enseignes: x.enseignes, centre: x.centre, flux_estime: x.flux_estime })),
    vitrines_total: r.vitrines_total,
    zone: r.zone,
  };
  Records.create('ReleveOsm', { code_insee: commune.code_insee, ville: commune.nom, releve, le: maintenant() });
  return { ...releve, du_cache: false, le: maintenant() };
}

/**
 * Le rang d'une rue parmi les rues commerçantes de sa ville, et la part que
 * ce rang représente. Pure. `min` est le seuil de vitrines qui fait une rue
 * commerçante — le même que pour la prospection.
 */
export function rangDe(rues, cle, min = SEUILS.min_commerces_par_rue ?? 3) {
  const commercantes = rues.filter((r) => (r.vitrines ?? 0) >= min).sort((a, b) => b.vitrines - a.vitrines);
  const i = commercantes.findIndex((r) => r.cle === cle);
  if (i < 0) return { rang: null, sur: commercantes.length, part: null };
  return { rang: i + 1, sur: commercantes.length, part: commercantes.length ? (i + 1) / commercantes.length : null };
}

/** La classe d'après la part du rang, quand la ville n'a pas été classée par ALX. Pure. */
export function classeParPart(part, seuils = SEUILS) {
  if (part == null) return null;
  if (part <= (seuils.part_emplacement_1 ?? 0.1)) return 1;
  if (part <= (seuils.part_emplacement_1bis ?? 0.35)) return 1.5;
  return 2;
}

/**
 * Ce qu'on sait de l'emplacement d'une adresse.
 * @param {string} adresse — « 93 avenue Marceau, Courbevoie »
 * @returns {Promise<object|null>}
 */
export async function emplacementDeLAdresse(adresse, { forcer = false, loyerDe = null } = {}) {
  const texte = String(adresse || '').trim();
  if (!texte) return null;
  // La ville de l'adresse : le dernier morceau, sans code postal.
  const morceaux = texte.split(',').map((x) => x.trim()).filter(Boolean);
  const nomVille = (morceaux[morceaux.length - 1] || '').replace(/^\d{5}\s*/, '').replace(/\s+\d+(er|e|ème)$/i, '').trim();
  const nomRue = (morceaux[0] || '').replace(/^\s*\d+\s*(bis|ter)?\s*/i, '').trim();
  if (!nomVille || !nomRue) return null;

  const commune = await communeDe(nomVille);
  if (!commune) return null;

  // La ville relevée par ALX prime : le dossier et la prospection parlent alors
  // de la même rue avec les mêmes mots.
  const ville = Records.list('Ville').find((v) => !v.cachee && v.code_insee === commune.code_insee);
  const k = cleRue(nomRue);
  const dAlx = ville ? (ville.rues || []).find((r) => cleRue(r.nom) === k) : null;

  const releve = await releveDe(commune, { forcer });
  const rue = releve.rues.find((r) => r.cle === k) || null;
  const { rang, sur, part } = rangDe(releve.rues, k);

  // Le loyer de marché de la rue : celui qu'ALX a déjà, sinon Data-B (gratuit).
  let loyer = dAlx?.loyer ? { basse: dAlx.loyer[0], haute: dAlx.loyer[1] } : null;
  let loyerSource = dAlx?.loyer_source || null;
  if (!loyer) {
    try {
      const lire = loyerDe || (async (a) => {
        const { valeurLocative } = await import('../data-b.js');
        const r = await valeurLocative(a);
        return r.ok ? r.resultat : null;
      });
      const vl = await lire(`${rue?.nom || nomRue}, ${commune.code_postal} ${commune.nom}`);
      const n = vl?.rue || vl?.quartier || null;
      if (n) { loyer = { basse: n.basse, haute: n.haute }; loyerSource = vl?.rue ? 'Data-B, rue' : 'Data-B, quartier'; }
    } catch {
      loyer = null;
    }
  }

  // La classe : celle d'ALX quand la ville est relevée, sinon le rang, sinon le loyer seul.
  let classe = dAlx?.classe ?? null;
  let classeSource = dAlx ? `classement ALX de ${commune.nom}` : null;
  if (classe == null && rue) {
    const parRang = classerParRang([{ ...rue, loyer, commerces: rue.vitrines }], SEUILS)[0];
    classe = part != null ? classeParPart(part) : parRang.classe;
    classeSource = part != null ? `rang dans ${commune.nom}` : 'loyer de marché seul';
  }

  const marche = loyer ? await prixDeLaRue(`${rue?.nom || nomRue}, ${commune.code_postal} ${commune.nom}`, loyer) : { prix_m2: null, prix_m2_source: null, rendement: null };
  const densite = rue?.longueur_m ? Math.round((rue.vitrines / (Math.max(rue.longueur_m, 50) / 100)) * 10) / 10 : null;

  return {
    adresse: texte,
    ville: commune.nom,
    code_insee: commune.code_insee,
    rue: rue?.nom || nomRue,
    connue: !!rue,
    classe,
    classe_source: classeSource,
    rang,
    rues_commercantes: sur,
    rues_total: releve.rues.length,
    vitrines: rue?.vitrines ?? null,
    vitrines_ville: releve.vitrines_total,
    longueur_m: rue?.longueur_m ?? null,
    densite,
    type: rue?.type || null,
    enseignes: rue?.enseignes || [],
    flux: dAlx?.flux || rue?.flux_estime || null,
    flux_mesure: !!dAlx?.flux,
    loyer: loyer ? [loyer.basse, loyer.haute] : null,
    loyer_source: loyerSource,
    ...marche,
    centre: rue?.centre || null,
    par_alx: !!dAlx,
    releve_le: releve.le,
    du_cache: !!releve.du_cache,
  };
}
