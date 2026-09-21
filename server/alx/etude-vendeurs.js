// L'étude des vendeurs : les projets Klocka relus par ALX.
//
// Chaque projet de l'application est un local dont les murs étaient à vendre,
// avec son adresse exacte. Ce sont donc des vendeurs réels, vus avant la
// vente. ALX les relit comme n'importe quel commerce (propriétaire chez
// fichiers DGFiP, société et gérants dans l'annuaire, BODACC, DVF, classement), dans
// une ville cachée qui n'apparaît nulle part. Le rapport compare ensuite les
// signaux de ces vendeurs à ceux des commerces des rues prospectées, qui pour
// l'immense majorité ne vendent pas : c'est le groupe témoin.
//
//   node --env-file=.env server/alx/etude-vendeurs.js          relit les projets
//   node --env-file=.env server/alx/etude-vendeurs.js rapport  imprime et écrit le rapport
//
// Aucune source payante : le cadastre, la DGFiP, l'annuaire, le BODACC et DVF ne coûtent rien.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from '../db.js';
import { creerCible, creerVille, reclasser } from './index.js';
import { classer, observableEnProspection } from './classement.js';
import * as enrichir from './enrichir.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
const RAPPORT = path.join(ici, 'data', 'etude-vendeurs.json');
const NOM_VILLE = 'Étude · projets Klocka';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function villeEtude() {
  const existante = Records.list('Ville').find((v) => v.nom === NOM_VILLE);
  if (existante) return existante;
  const r = creerVille({ nom: NOM_VILLE });
  return Records.update('Ville', r.ville.id, { cachee: true, etat: 'etude' });
}

/** « 51 rue d'Amsterdam, Paris 8ème » → { adresse, ville } ; la ville vient du projet à défaut. */
function adresseDe(p) {
  const brut = String(p.adresse_complete || '').trim();
  const m = brut.match(/^(.*?\d[^,]*?)\s*,\s*(.+)$/);
  const villeProjet = String(p.ville_secteur_champ1 || '').trim();
  if (m) {
    const ville = m[2].replace(/^\d{5}\s*/, '').replace(/\s+\d+(er|e|ème)$/i, '').trim();
    return { adresse: m[1].trim(), ville: ville || villeProjet };
  }
  return { adresse: brut, ville: villeProjet };
}

export async function relire({ journal = console.log } = {}) {
  const ville = villeEtude();
  const projets = Records.list('Project').filter((p) => /^\s*\d+/.test(p.adresse_complete || ''));
  journal(`${projets.length} projets avec un numéro de rue. Ville cachée : ${ville.id}.`);
  let faits = 0, proprios = 0, erreurs = 0;
  for (const p of projets) {
    const { adresse, ville: nomVille } = adresseDe(p);
    if (!nomVille) { journal(`- ${adresse} : pas de ville, passé.`); continue; }
    const r = creerCible({
      ville_id: ville.id,
      adresse,
      ville: nomVille,
      enseigne: p.nom_locataire || null,
      activite: p.activite_locataire || null,
      source: 'Projet Klocka',
      projet_id: p.id,
      projet_statut: p.statut || null,
      projet_cree_le: p.created_date || null,
      bail_echeance: p.echeance_bail || null,
      loyer_annuel_projet: Number(p.loyer_annuel_ht) || null,
      surface_projet: Number(p.surface_m2) || null,
      prix_projet: Number(p.prix_acquisition) || null,
      etude: true,
    });
    if (!r.ok) { erreurs += 1; journal(`- ${adresse} : ${r.error}`); continue; }
    let c = r.cible;
    if (r.deja && c.proprietaire?.nom) { faits += 1; proprios += 1; continue; }
    try {
      c = (await enrichir.trouverProprietaire(c.id, {})).cible;
      if (c.proprietaire?.nom) proprios += 1;
      if (c.proprietaire?.siren) c = (await enrichir.lireEvenements(c.id, {}).catch(() => ({ cible: c }))).cible;
      c = (await enrichir.lireMutation(c.id, {}).catch(() => ({ cible: c }))).cible;
      c = reclasser(c.id);
      faits += 1;
      journal(`- ${adresse}, ${nomVille} → ${c.proprietaire?.nom || (c.foncier ? 'plusieurs' : 'introuvable')} · ${c.pile} · ${[...(c.signaux?.forts || []), ...(c.signaux?.patients || [])].map((s) => s.cle).join(', ') || 'aucun signal'}`);
    } catch (e) {
      erreurs += 1;
      journal(`- ${adresse}, ${nomVille} : ${e.message}`);
    }
    await pause(400);
  }
  journal(`Fini : ${faits} relus, ${proprios} propriétaires, ${erreurs} erreurs.`);
}

const CLES = ['marchand_fenetre', 'evenement_recent', 'echeance_proche', 'locataire_en_difficulte', 'detention_longue', 'gerant_age', 'famille', 'loyer_bas', 'bien_isole', 'siege_ailleurs', 'voisin_mute'];
const a = (c, cle) => [...(c.signaux?.forts || []), ...(c.signaux?.patients || [])].some((s) => s.cle === cle);
/**
 * La pile qu'ALX aurait donnée EN PROSPECTION : sans l'échéance du bail ni le
 * loyer du bail, qu'on ne lit que sur un dossier entré. Un vendeur classé
 * « à appeler » grâce à son bail n'aurait jamais été appelé dans la rue, et le
 * compter ferait croire à un classement parfait.
 */
const pileEnProspection = (c) => classer({ ...c, bail_echeance: null, loyer_m2_bail: null, ecartee_regle: null }).pile;
/** Les traits comparés entre vendeurs et témoins. Chacun lit une cible et rend vrai ou faux. */
export const TRAITS = {
  ...Object.fromEntries(CLES.map((k) => [k, (c) => a(c, k)])),
  sci: (c) => /SCI|civile/i.test(c.proprietaire?.forme || c.societe?.forme || ''),
  exploitant_proprietaire: (c) => !!c.proprietaire_occupant,
  personne_physique: (c) => !!c.proprietaire?.nom && !c.proprietaire?.siren,
  societe_20_ans: (c) => c.societe?.creation && Number(String(c.societe.creation).slice(0, 4)) <= new Date().getFullYear() - 20,
  siege_ailleurs: (c) => !!c.societe?.siege?.ville && !!c.ville && c.societe.siege.ville.toLowerCase() !== String(c.ville).toLowerCase(),
  plusieurs_etablissements: (c) => (c.societe?.nombre_etablissements || 0) > 2,
  enseigne_nationale: (c) => !!c.occupant?.chaine,
  pile_appeler: (c) => pileEnProspection(c) === 'appeler',
  pile_ecrire: (c) => pileEnProspection(c) === 'ecrire',
};

/** Les mots des traits qui ne sont pas des signaux de signaux.json. */
export const LIBELLES_TRAITS = {
  sci: 'Les murs sont dans une SCI',
  exploitant_proprietaire: 'L\'exploitant est propriétaire de ses murs',
  personne_physique: 'Propriétaire en nom propre',
  societe_20_ans: 'Société de plus de vingt ans',
  siege_ailleurs: 'Siège de la société dans une autre commune',
  plusieurs_etablissements: 'Société à plusieurs établissements',
  enseigne_nationale: 'Enseigne nationale en place',
};

/**
 * Les vendeurs que l'étude connaît : les projets Klocka relus, et les
 * dossiers de préanalyse lus par vendeur.js (une observation par adresse, la
 * plus récente). Tous ont un propriétaire trouvé.
 */
export function vendeursConnus() {
  const ville = Records.list('Ville').find((v) => v.nom === NOM_VILLE);
  const projets = ville ? Records.filter('Cible', { ville_id: ville.id }).filter((c) => c.proprietaire?.nom) : [];
  const parAdresse = new Map();
  for (const o of Records.list('ObservationVendeur')) {
    if (!o.cible?.proprietaire?.nom) continue;
    const d = parAdresse.get(o.cle);
    if (!d || String(o.le) > String(d.le)) parAdresse.set(o.cle, o);
  }
  const adressesProjets = new Set(projets.map((c) => `${c.adresse} ${c.ville}`.toLowerCase()));
  const dossiers = [...parAdresse.values()].filter((o) => !adressesProjets.has(`${o.cible.adresse} ${o.cible.ville}`.toLowerCase())).map((o) => o.cible);
  return { projets: projets.length, dossiers: dossiers.length, cibles: [...projets, ...dossiers] };
}

export function rapport({ journal = console.log } = {}) {
  const connus = vendeursConnus();
  const vendeurs = connus.cibles;
  const temoins = Records.list('Cible').filter((c) => !c.etude && c.proprietaire?.nom && !(c.mutation?.du_local && String(c.mutation.date) >= '2021'));
  const lignes = Object.entries(TRAITS).map(([cle, f]) => {
    const v = vendeurs.filter(f).length, t = temoins.filter(f).length;
    const pv = v / Math.max(1, vendeurs.length), pt = t / Math.max(1, temoins.length);
    // Un signal qui ne se lit que sur un dossier (l'échéance du bail, le loyer
    // du bail) n'existe pas chez les témoins : il paraîtrait parfait. On le
    // garde dans la table, marqué, et sans lift.
    const observable = observableEnProspection(cle);
    return { trait: cle, vendeurs: v, vendeurs_pct: Math.round(pv * 100), temoins: t, temoins_pct: Math.round(pt * 100), lift: observable && pt > 0 ? Math.round((pv / pt) * 10) / 10 : null, observable };
  }).sort((x, y) => (y.lift ?? 0) - (x.lift ?? 0));
  const sortie = {
    le: new Date().toISOString(),
    vendeurs: vendeurs.length,
    projets: connus.projets,
    dossiers: connus.dossiers,
    temoins: temoins.length,
    lignes,
    limites: [
      "Les vendeurs sont des dossiers arrivés par des agents : l'étude mesure qui vend par ce canal, pas qui vend. La mesure DVF (mesure-dvf.js) n'a pas ce biais.",
      "Les témoins sont des « pas encore vendus », pas des jamais-vendeurs : les lifts sont plutôt sous-estimés que l'inverse.",
      "Les signaux marqués non observables ne se lisent que sur un dossier entré : leur lift n'a pas de sens, il n'est pas calculé.",
      "Les piles des vendeurs sont recalculées avec les règles du jour et les seuls signaux visibles en prospection (sans l'échéance ni le loyer du bail) : ce sont des prédictions faites après coup, pas avant. Le journal des prédictions (predictions.js) fait la vraie épreuve, sur les cibles prospectées.",
    ],
  };
  fs.writeFileSync(RAPPORT, JSON.stringify(sortie, null, 2));
  journal(`Vendeurs (${connus.projets} projets Klocka, ${connus.dossiers} dossiers lus, propriétaire trouvé) : ${vendeurs.length} · témoins (rues prospectées, non vendus) : ${temoins.length}`);
  journal('trait'.padEnd(26) + 'vendeurs'.padStart(10) + 'témoins'.padStart(10) + 'lift'.padStart(7));
  for (const l of lignes) journal(l.trait.padEnd(26) + `${l.vendeurs_pct}% (${l.vendeurs})`.padStart(10) + `${l.temoins_pct}% (${l.temoins})`.padStart(10) + String(l.lift ?? '—').padStart(7));
  journal(`Rapport écrit : ${RAPPORT}`);
  return sortie;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv[2] === 'rapport') rapport();
  else await relire();
}
