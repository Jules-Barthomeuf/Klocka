// La relecture de l'annuaire des entreprises (3 nov. 2026, Jules : « oui, à trois conditions : les limites de l'API,
// par lots, reprendre là où elle s'est arrêtée » ; puis « pas la nuit, lance-le directement »). Les dirigeants lus avant le 3 nov. n'ont que leur tranche
// (moins de 50, 50 à 70, 70 et plus) et un seul exercice de comptes : la relecture leur donne « plus de 60 ans » et tous
// les exercices publiés, ce que le mode Fonds de la Prospection lit.
//
// - Les limites : l'annuaire tolère sept appels par seconde ; on en fait au plus deux et demi, et un refus « trop
//   d'appels » (429), ici ou ailleurs dans Klocka, met la relecture en pause une minute.
// - Par lots, tout de suite : 200 commerces par lot, trente secondes entre deux lots, jusqu'à la fin.
// - Reprendre : chaque commerce relu porte `exploitant.relu_annuaire_le` ; une coupure (redémarrage, déploiement) ne perd
//   que le commerce en cours, la relecture suivante repart des autres.
// RELECTURE_ANNUAIRE=0 la coupe.

import { Records, Meta } from './db.js';

const COMMERCE = 'CommerceSimple';
const ETAT = 'annuaire-relecture';
const LOT = 200;
const ENTRE_APPELS_MS = 400;
const ENTRE_LOTS_MS = 30_000;
const APRES_REFUS_MS = 60_000;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pure : faut-il relire ce commerce ? Un SIREN, un dirigeant de 50 à 70 ans (les autres tranches sont déjà sûres pour
 * « plus de 60 ans »), et pas encore relu.
 */
export function aRelire(ligne) {
  if (!/^\d{9}$/.test(String(ligne['exploitant.siren'] || '').replace(/\s/g, ''))) return false;
  if (ligne['exploitant.relu_annuaire_le']) return false;
  let gerants = ligne['exploitant.gerants'];
  try { if (typeof gerants === 'string') gerants = JSON.parse(gerants); } catch { return false; }
  return Array.isArray(gerants) && gerants.some((g) => g && !g.personne_morale && g.tranche_age === '50-70');
}

/** Pure : l'exploitant gardé, complété par sa relecture : « plus de 60 ans » pour chaque dirigeant retrouvé, les comptes. */
export function completer(ancien, relu, maintenant = new Date().toISOString()) {
  const cle = (g) => String(g?.nom || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const lus = new Map((relu?.gerants || []).map((g) => [cle(g), g]));
  return {
    ...ancien,
    gerants: (ancien.gerants || []).map((g) => (lus.has(cle(g)) ? { ...g, plus_de_60: lus.get(cle(g)).plus_de_60 ?? null } : g)),
    ...(relu?.comptes ? { comptes: relu.comptes, comptes_deposes: relu.comptes_deposes, derniers_comptes: relu.derniers_comptes } : {}),
    relu_annuaire_le: maintenant,
  };
}

let enCours = false;

/** Ce qu'il reste à relire, et où en est la relecture (pour le suivi). */
export function etatRelecture() {
  const reste = Records.champs(COMMERCE, ['exploitant.siren', 'exploitant.relu_annuaire_le', 'exploitant.gerants']).filter(aRelire).length;
  let dernier = null;
  try { dernier = JSON.parse(Meta.get(ETAT) || 'null'); } catch { /* rien */ }
  return { reste, en_cours: enCours, ...(dernier || {}) };
}

/**
 * La relecture : des lots tant qu'il reste des commerces. Pour les tests : `arreter`, `annuaire` (remplace l'appel réel)
 * et `filtre` (les seuls commerces que le test a créés : la base des tests est la vraie, server/data, le 3 nov. 2026 un
 * test sans filtre a marqué 20 380 vrais commerces « relus »).
 */
export async function relire({ arreter = () => false, annuaire = null, filtre = () => true, lot = LOT, entreAppels = ENTRE_APPELS_MS, entreLots = ENTRE_LOTS_MS } = {}) {
  if (enCours || process.env.RELECTURE_ANNUAIRE === '0') return { ok: true, deja: enCours };
  enCours = true;
  const A = annuaire || await import('./alx/annuaire.js');
  let relus = 0, erreurs = 0;
  try {
    // Les commerces à relire, cherchés une fois par passage (3 nov. 2026) : relire les 82 000 lignes à chaque lot figeait
    // le serveur quatre secondes toutes les deux minutes ; chacun est revérifié au moment de le relire.
    const aFaire = Records.champs(COMMERCE, ['exploitant.siren', 'exploitant.relu_annuaire_le', 'exploitant.gerants']).filter((l) => aRelire(l) && filtre(l)).map((l) => l.id);
    for (let debut = 0; debut < aFaire.length && !arreter(); debut += lot) {
      for (const id of aFaire.slice(debut, debut + lot)) {
        if (arreter()) break;
        if (A.refusRecent?.(APRES_REFUS_MS)) await pause(APRES_REFUS_MS);
        const c = Records.get(COMMERCE, id);
        if (!c?.exploitant?.siren || c.exploitant.relu_annuaire_le) continue;
        try {
          const relu = await A.societe({ siren: c.exploitant.siren });
          // Sans changer la date du commerce : les caches de la Prospection ne se recalculent pas à chaque relecture ; les
          // nouveaux « plus de 60 ans » y entrent à leur recalcul de l'heure.
          Records.update(COMMERCE, id, { exploitant: completer(c.exploitant, relu) }, { garderDate: true });
          relus += 1;
        } catch (e) {
          // Une erreur de l'annuaire (absent, refusé) : on marque quand même, pour ne pas buter dessus chaque nuit.
          erreurs += 1;
          Records.update(COMMERCE, id, { exploitant: { ...c.exploitant, relu_annuaire_le: new Date().toISOString(), relu_annuaire_erreur: String(e?.message || e).slice(0, 200) } }, { garderDate: true });
        }
        await pause(entreAppels);
      }
      Meta.set(ETAT, JSON.stringify({ le: new Date().toISOString(), relus, erreurs }));
      if (!arreter() && debut + lot < aFaire.length) await pause(entreLots);
    }
  } finally {
    enCours = false;
  }
  if (relus || erreurs) Meta.set(ETAT, JSON.stringify({ le: new Date().toISOString(), relus, erreurs, fini: !etatRelecture().reste }));
  return { ok: true, relus, erreurs };
}
