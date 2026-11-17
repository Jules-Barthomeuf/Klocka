// Les annonces de commerce d'Equimmox dans la Mémoire (17 nov. 2026, Jules : « pour avoir plus de data, lire sur
// Equimmox les loyers, les prix et l'adresse approximative ou précise ; commence avec une ville »).
//
// Pas de recherche adresse par adresse : Equimmox exporte lui-même les annonces d'une ville (Recherche → la ville →
// Exporter → « Extraire les annonces », server/equimmox.js, le même export que la Prospection lit pour ses agents).
// Chaque annonce de la classe « Commercial » devient un bien de la Mémoire, origine « equimmox » : adresse et point GPS,
// prix, surface, prix au m², loyer, rendement, occupé ou libre, agence, date de publication, lien Equimmox. Une annonce
// déjà gardée se met à jour (même identifiant Equimmox) ; retirée chez Equimmox, elle est marquée, jamais effacée.
// Ces biens restent dans la Mémoire : ni Propriétés de Twenty, ni chiffres des agents (memoire/twenty.js).
//
// Les villes : MEMOIRE_EQUIMMOX_VILLES (« Nice,Lyon »), un export par ville et par jour au plus.

import { Records, Meta } from '../db.js';
import { normaliserAdresse } from '../haka/doublons.js';
import { ENTITE } from './memoire.js';

export const VILLES = String(process.env.MEMOIRE_EQUIMMOX_VILLES || '').split(',').map((v) => v.trim()).filter(Boolean);

const nombre = (x) => { const n = Number(String(x ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
const texte = (x) => { const t = String(x ?? '').trim(); return t || null; };
const vrai = (x) => /^(true|vrai|oui|1)$/i.test(String(x ?? '').trim());

/** Pure : une date Excel (nombre de jours depuis 1899-12-30) ou un texte de date, en AAAA-MM-JJ. */
export function dateExcel(x) {
  const t = String(x ?? '').trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000).toISOString().slice(0, 10);
  const d = Date.parse(t);
  return Number.isFinite(d) ? new Date(d).toISOString().slice(0, 10) : null;
}

/** Pure : « 12 Quai de la Pêcherie 69001 Lyon » → { rue, code_postal, ville }. */
export function adresseDe(ligne, villeDefaut = null) {
  const t = String(ligne || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*?)[\s,]*(\d{5})\s+(.+)$/);
  if (m) return { rue: m[1].replace(/,\s*$/, '').trim() || null, code_postal: m[2], ville: m[3].trim() };
  return { rue: t || null, code_postal: null, ville: villeDefaut };
}

/**
 * Pure : le bien de la Mémoire d'une ligne de l'export Equimmox, ou null (pas un commerce, ni prix ni loyer).
 * `precision` : « gps » quand Equimmox donne le point, sinon « adresse » (un numéro), « rue » ou « ville ».
 */
export function bienDepuisAnnonce(l, { ville = null, le = new Date().toISOString() } = {}) {
  if (!/commercial/i.test(String(l['asset class'] || ''))) return null;
  const prix = nombre(l.price);
  const loyer = nombre(l.rent);
  if (!prix && !loyer) return null;
  const adresse = adresseDe(l.address, texte(l.city) || ville);
  if (!adresse.code_postal && nombre(l.zipcode)) adresse.code_postal = String(l.zipcode).trim();
  const [lon, lat] = String(l.coordinates || '').split(',').map((x) => Number(String(x).trim()));
  const gps = Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0;
  const surface = nombre(l.surface);
  const location = /rent|location/i.test(String(l['property type'] || ''));
  return {
    cle_adresse: normaliserAdresse(adresse).cle,
    adresse,
    ville: adresse.ville,
    code_postal: adresse.code_postal,
    lat: gps ? lat : null,
    lon: gps ? lon : null,
    precision: gps ? 'gps' : /^\s*\d/.test(adresse.rue || '') ? 'adresse' : adresse.rue ? 'rue' : 'ville',
    transaction: location ? 'location' : 'vente',
    prix: location ? null : prix,
    prix_m2: location ? null : nombre(l['price per m²']) || (prix && surface ? Math.round(prix / surface) : null),
    loyer_annuel: loyer || (location ? prix : null),
    surface_m2: surface,
    // Equimmox écrit le rendement en fraction (0,067) ; la Mémoire le garde en pourcentage (6,7), comme les fiches.
    rendement_annonce: nombre(l.yield) ? Math.round((nombre(l.yield) < 1 ? nombre(l.yield) * 100 : nombre(l.yield)) * 100) / 100 : null,
    occupe: vrai(l.occupation),
    exploitation: texte(l.exploitation),
    chiffre_affaires: nombre(l.revenue),
    agent: { nom: null, email: texte(l['agent email'])?.toLowerCase() || null, telephone: texte(l['agent contact']), agence: texte(l['agency name'])?.replace(/^[.\s]+/, '') || null },
    agent_email: texte(l['agent email'])?.toLowerCase() || null,
    reseau: texte(l['broker network']),
    publiee_le: dateExcel(l['publication date']),
    retiree_le: dateExcel(l.deleted_date),
    recu_le: dateExcel(l['publication date']) || le.slice(0, 10),
    equimmox_id: texte(l.ID),
    equimmox_url: texte(l.url),
    diffuseur: texte(l.provider),
    origine: 'equimmox',
    statut: 'memoire',
  };
}

/**
 * Les annonces de commerce d'une ville, de l'export Equimmox à la Mémoire. Rend { ville, lignes, commerces, nouveaux,
 * mis_a_jour, retires }. `exporter` et `lire` : remplacés dans les tests.
 */
export async function importerVille(ville, { exporter = null, lire = null, journal = console.log } = {}) {
  const exp = exporter || (await import('../equimmox.js')).exporterAnnoncesVente;
  const r = await exp(ville);
  if (!r.ok) throw new Error(r.error || "Equimmox n'a pas répondu.");
  const lignes = r.buffer ? (lire || (await import('../xlsx.js')).lireXlsx)(r.buffer) : [];
  const le = new Date().toISOString();
  const deja = new Map(Records.list(ENTITE).filter((b) => b.origine === 'equimmox' && b.equimmox_id).map((b) => [b.equimmox_id, b]));
  const bilan = { ville: r.ville || ville, lignes: lignes.length, commerces: 0, nouveaux: 0, mis_a_jour: 0, retires: 0 };
  for (const l of lignes) {
    const b = bienDepuisAnnonce(l, { ville: r.ville || ville, le });
    if (!b?.equimmox_id) continue;
    bilan.commerces += 1;
    const avant = deja.get(b.equimmox_id);
    if (!avant) {
      Records.create(ENTITE, { ...b, vu_le: le, maj_le: le });
      bilan.nouveaux += 1;
      continue;
    }
    const change = ['prix', 'loyer_annuel', 'surface_m2', 'rendement_annonce', 'occupe', 'retiree_le'].some((k) => (avant[k] ?? null) !== (b[k] ?? null));
    if (b.retiree_le && !avant.retiree_le) bilan.retires += 1;
    // Le prix d'avant se garde : une baisse de prix est une donnée.
    const historique = change && avant.prix && b.prix && avant.prix !== b.prix ? [...(avant.prix_historique || []), { prix: avant.prix, jusqu_au: le.slice(0, 10) }] : avant.prix_historique;
    Records.update(ENTITE, avant.id, { ...b, recu_le: avant.recu_le || b.recu_le, vu_le: le, ...(change ? { maj_le: le } : {}), ...(historique ? { prix_historique: historique } : {}) });
    if (change) bilan.mis_a_jour += 1;
  }
  journal(`[mémoire] Equimmox ${bilan.ville} : ${bilan.lignes} annonces lues, ${bilan.commerces} commerces, ${bilan.nouveaux} nouveaux, ${bilan.mis_a_jour} mis à jour, ${bilan.retires} retirés`);
  return bilan;
}

/** Les villes de MEMOIRE_EQUIMMOX_VILLES, chacune une fois par jour au plus (une après l'autre : le robot est seul). */
export async function importerLesVilles({ villes = VILLES, journal = console.log } = {}) {
  const jour = new Date().toISOString().slice(0, 10);
  const faites = [];
  for (const v of villes) {
    const cle = `memoire.equimmox.${v.toLowerCase()}`;
    if (Meta.get(cle) === jour) continue;
    try {
      faites.push(await importerVille(v, { journal }));
      Meta.set(cle, jour);
    } catch (e) {
      journal(`[mémoire] Equimmox ${v} : ${e?.message || e}`);
    }
  }
  return faites;
}
