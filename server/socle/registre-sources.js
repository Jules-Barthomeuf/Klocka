// Le registre des sources (18 oct. 2026, lot 1 de la boîte à outils de Haka, plan validé § 0.2).
//
// Chaque source a ici sa fiche : son nom, sa licence, son rythme, un interrupteur et un poids. Les
// réglages (activée ou coupée, poids) se changent sans redéployer : ils vivent dans `meta`, la page
// Paramètres › Sources les écrit. Un outil demande `sourceActive(cle)` avant d'appeler une source et
// `poidsSource(cle)` pour la pondérer ; une source coupée rend « rien », jamais une erreur.

import { Meta } from '../db.js';

const CLE_REGLAGES = 'sources.reglages';

/**
 * Les sources connues. `poids` : le poids de départ d'une référence de loyer (plan § 0.2), quand la
 * source en fournit ; null sinon. `payant` : une source qu'on paie à l'appel ou à l'abonnement.
 */
export const SOURCES = [
  { cle: 'klocka_bail', nom: 'Baux des dossiers Klocka', famille: 'interne', poids: 3, licence: 'Interne', rythme: 'à chaque analyse' },
  { cle: 'klocka_fiche', nom: "Fiches d'agents et saisies Klocka", famille: 'interne', poids: 1.5, licence: 'Interne', rythme: 'à chaque fiche' },
  { cle: 'equimmox', nom: 'Equimmox', famille: 'payante', payant: true, poids: 1, licence: 'Abonnement', rythme: 'à la demande' },
  { cle: 'data_b', nom: 'Data-B', famille: 'payante', payant: true, poids: 1, licence: 'Abonnement', rythme: 'à la demande' },
  { cle: 'annonces', nom: 'Annonces collectées', famille: 'collecte', poids: 1, licence: 'Faits seulement, usage interne', rythme: 'quotidien (lot 3)' },
  { cle: 'google_places', nom: 'Google Places', famille: 'payante', payant: true, poids: null, licence: 'Conditions Google', rythme: 'à la demande' },
  { cle: 'ban', nom: 'Base Adresse Nationale', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'continue' },
  { cle: 'cadastre_ign', nom: 'Cadastre (Parcellaire Express, IGN)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'trimestriel' },
  { cle: 'iris_ign', nom: 'Contours IRIS (IGN, INSEE)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'annuel' },
  { cle: 'bdtopo', nom: 'BD TOPO, tronçons de route (IGN)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'trimestriel' },
  { cle: 'insee_filosofi', nom: 'Filosofi, carreaux de 200 m (INSEE)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'tous les deux ans environ' },
  { cle: 'sirene', nom: 'Base Sirene (INSEE)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'mensuel' },
  { cle: 'bodacc', nom: 'BODACC (DILA)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'cinq parutions par semaine' },
  { cle: 'dvf', nom: 'DVF géolocalisées (DGFiP, Etalab)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'semestriel' },
  { cle: 'majic', nom: 'Locaux et parcelles des personnes morales (DGFiP)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'annuel' },
  { cle: 'osm', nom: 'OpenStreetMap', famille: 'publique', poids: null, licence: 'ODbL', rythme: 'continue' },
  { cle: 'inpi_rne', nom: 'Registre national des entreprises (INPI)', famille: 'publique', poids: null, licence: 'Gratuit sur inscription', rythme: 'quotidien' },
  { cle: 'ilc', nom: 'Indice des loyers commerciaux (INSEE)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'trimestriel' },
  // Ajouts du 18 oct. 2026 (lots 5 à 9).
  { cle: 'klocka_transactions', nom: 'Ventes des projets Klocka signés', famille: 'interne', poids: null, licence: 'Interne', rythme: 'à chaque signature' },
  { cle: 'sirene_stock', nom: 'Stock Sirene géolocalisé (INSEE, data.gouv.fr)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'mensuel' },
  { cle: 'georisques', nom: 'Géorisques (risques de la commune)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'continue' },
  { cle: 'gpu', nom: "Géoportail de l'urbanisme (zonage, prescriptions)", famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'continue' },
  { cle: 'isochrones_ign', nom: 'Isochrones de la Géoplateforme (IGN)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'continue' },
  { cle: 'sncf_gares', nom: 'Gares et fréquentation (SNCF)', famille: 'publique', poids: null, licence: 'Licence ouverte', rythme: 'annuel' },
];

const parCle = new Map(SOURCES.map((s) => [s.cle, s]));

const lireReglages = () => { try { return JSON.parse(Meta.get(CLE_REGLAGES) || '{}') || {}; } catch { return {}; } };

/** Pure : une source avec ses réglages appliqués. */
export function avecReglages(source, reglages = {}) {
  const r = reglages[source.cle] || {};
  return {
    ...source,
    actif: r.actif === undefined ? true : !!r.actif,
    poids: r.poids === undefined || r.poids === null ? source.poids : Number(r.poids),
    regle_par: r.par || null,
    regle_le: r.le || null,
  };
}

/** Toutes les sources, réglages compris. */
export const listerSources = () => { const r = lireReglages(); return SOURCES.map((s) => avecReglages(s, r)); };

/**
 * Une source est-elle activée ? Une source inconnue l'est (on ne coupe que ce qu'on connaît).
 * L'environnement peut forcer la coupure au démarrage : SOURCES_COUPEES=data_b,google_places.
 */
export function sourceActive(cle) {
  const coupees = String(process.env.SOURCES_COUPEES || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (coupees.includes(cle)) return false;
  const s = parCle.get(cle);
  if (!s) return true;
  return avecReglages(s, lireReglages()).actif;
}

/** Le poids d'une source (null quand elle n'en a pas). */
export function poidsSource(cle) {
  const s = parCle.get(cle);
  return s ? avecReglages(s, lireReglages()).poids : null;
}

/** Règle une source : `actif` (booléen) et/ou `poids` (nombre ≥ 0). */
export function reglerSource(cle, { actif, poids } = {}, par = null) {
  if (!parCle.has(cle)) return { ok: false, error: `Source inconnue : ${cle}` };
  if (poids !== undefined && poids !== null && !(Number(poids) >= 0)) return { ok: false, error: 'Le poids doit être un nombre positif ou nul.' };
  const reglages = lireReglages();
  const avant = reglages[cle] || {};
  reglages[cle] = {
    ...avant,
    ...(actif === undefined ? {} : { actif: !!actif }),
    ...(poids === undefined ? {} : { poids: poids === null ? null : Number(poids) }),
    par, le: new Date().toISOString(),
  };
  Meta.set(CLE_REGLAGES, JSON.stringify(reglages));
  return { ok: true, source: avecReglages(parCle.get(cle), reglages) };
}

/**
 * Appelle une source à travers son interrupteur : coupée ou en panne, elle rend `vide` et le dit, sans
 * jamais lever d'erreur. `appel` est la fonction qui interroge vraiment la source.
 */
export async function viaSource(cle, appel, vide = null) {
  if (!sourceActive(cle)) return { ok: false, coupee: true, valeur: vide, source: cle };
  try {
    return { ok: true, valeur: await appel(), source: cle };
  } catch (e) {
    return { ok: false, panne: e?.message || String(e), valeur: vide, source: cle };
  }
}
