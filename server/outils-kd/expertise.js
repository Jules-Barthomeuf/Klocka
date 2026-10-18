// L'emplacement d'une adresse pour K-Expertise (18 oct. 2026, lot 8) : rassemble ce que l'étude interne a déjà
// lu (habitants et entreprises à 5 minutes, commerces du tronçon, générateurs, niveau de vie) et les sources
// ouvertes du lot (PLU, risques, gares, arrêts), plus le dernier loyer déjà lu à l'adresse (sans relancer
// Equimmox), puis calcule l'indice de flux et le classement. Chaque adresse passe par l'identifiant de local.

import { Records } from '../db.js';
import { resoudreLocal } from '../socle/local.js';
import { risquesDeCommune, urbanismeAuPoint, garesAutour, arretsAutour } from './sources-ouvertes.js';
import { indiceDeFlux, classerEmplacement } from './emplacement.js';

const nombre = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

/** Pure : ce que l'étude interne apporte à l'indice. */
export function entreesDeLEtude({ etude = null, zones = [], generateurs = [] } = {}) {
  const z5 = zones?.[0] || null;
  return {
    habitants: nombre(z5?.insee?.population?.habitants ?? z5?.recensement?.population),
    emplois: nombre(etude?.zone_primaire?.entreprises),
    commerces_troncon: nombre(etude?.commerces_troncon?.total ?? etude?.commerces_troncon),
    generateurs: Array.isArray(generateurs) ? generateurs.length : null,
    revenu_vs_france: nombre(etude?.en_tete?.revenu_vs_france),
  };
}

export async function emplacementDe({ adresse, point, etude = null, zones = [], generateurs = [] }) {
  const local = await resoudreLocal(adresse).catch(() => null);
  const code_insee = local?.ok ? local.local.adresse.code_insee : null;
  const [urbanisme, risques, gares, arrets] = await Promise.all([
    urbanismeAuPoint(point).catch(() => null),
    risquesDeCommune(code_insee).catch(() => null),
    garesAutour(point).catch(() => []),
    arretsAutour(point).catch(() => []),
  ]);
  const e = entreesDeLEtude({ etude, zones, generateurs });
  const flux = indiceDeFlux({ habitants: e.habitants, emplois: e.emplois, gares, arrets, generateurs: e.generateurs, commerces_troncon: e.commerces_troncon });
  // Le loyer déjà lu à cette adresse (Valeur locative), sans relancer de recherche.
  const vl = Records.list('ValeurLocativeRecherche').filter((x) => String(x.adresse || '').toLowerCase() === String(local?.local?.adresse?.label || adresse).toLowerCase()).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
  const loyer = vl?.resultat?.valeur ? { ...vl.resultat.valeur, le: vl.le } : null;
  const classement = classerEmplacement({ flux, revenu_vs_france: e.revenu_vs_france, urbanisme, risques, loyer });
  const sources = [
    urbanisme && "Géoportail de l'urbanisme",
    risques && 'Géorisques',
    gares?.length && 'SNCF (gares et fréquentation)',
    arrets?.length && 'OpenStreetMap (arrêts)',
  ].filter(Boolean);
  return { id_local: local?.ok ? local.local.id_local : null, troncon: local?.ok ? local.local.troncon : null, flux, classement, urbanisme, risques, gares: (gares || []).slice(0, 3), arrets: (arrets || []).slice(0, 10), loyer, sources, le: new Date().toISOString() };
}
