// Le parcours d'une ville : ce qu'ALX fait tout seul quand on lui donne un nom.
//
// Deux phases. Les rues : balayage du centre par l'annuaire, comptage des
// commerces par rue, loyer de marché de chaque rue dense chez Data-B, et
// l'emplacement qui en découle (1, 2, ou écartée avec son motif). Les
// commerces : rue par rue, classe 1 d'abord, chaque commerce de pied
// d'immeuble devient une cible, puis propriétaire (Data-B), société
// (annuaire), BODACC, DVF, loyer de la rue, classement, et un brouillon de
// message pour les piles à appeler et à écrire.
//
// Tout s'écrit sur la Ville au fur et à mesure (parcours.*) : l'écran suit,
// l'équipe peut arrêter, et un serveur qui redémarre marque le parcours
// interrompu plutôt que de le laisser croire en cours. Une cible déjà lue
// n'est pas relue : relancer une ville reprend où elle en était.

import { Records } from '../db.js';
import { creerCible } from './index.js';
import { proposerRues, libelleEmplacement } from './rues.js';
import { pointsLeLongDe } from './osm.js';
import { etablissementsRue } from './annuaire.js';
import { cleRue } from './commerces.js';
import { LIBELLES_PILES, REGLES } from './classement.js';
import { commercesDeLaRue, placesConfigure } from './places.js';

// Un commerce vu sur Maps retrouve son établissement dans l'annuaire : même
// numéro, et un nom qui se ressemble (enseigne ou raison sociale).
const simple = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function etablissementPour(commerce, etabs) {
  const nom = simple(commerce.enseigne);
  if (!nom) return null;
  const mots = nom.split(' ').filter((m) => m.length > 2);
  const candidats = etabs.filter((e) => !commerce.numero || !e.numero || e.numero === commerce.numero);
  const score = (e) => {
    const cible = simple(`${e.enseigne || ''} ${e.nom || ''}`);
    if (!cible) return 0;
    if (cible.includes(nom) || nom.includes(simple(e.enseigne))) return 3;
    return mots.filter((m) => cible.includes(m)).length;
  };
  const meilleur = candidats.map((e) => [score(e), e]).sort((x, y) => y[0] - x[0])[0];
  return meilleur && meilleur[0] >= 1 ? meilleur[1] : null;
}
import * as enrichir from './enrichir.js';

const JOURNAL_MAX = 300;
const PAUSE_ENTRE_CIBLES_MS = 600;
const ERREURS_PAR_RUE_AU_JOURNAL = 3;

// Un parcours par ville à la fois, en mémoire : { arreter: boolean }.
const enCours = new Map();
const maintenant = () => new Date().toISOString();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export const parcoursEnCours = (villeId) => enCours.has(villeId);

function ecrire(villeId, patch) {
  const v = Records.get('Ville', villeId);
  if (!v) return null;
  const parcours = { ...(v.parcours || {}), ...patch, maj_le: maintenant() };
  Records.update('Ville', villeId, { parcours });
  return parcours;
}

function noter(villeId, texte) {
  const v = Records.get('Ville', villeId);
  if (!v) return;
  const journal = [...(v.parcours?.journal || []), { le: maintenant(), texte }].slice(-JOURNAL_MAX);
  ecrire(villeId, { journal });
  console.log(`[alx] ${v.nom} : ${texte}`);
}

function compter(villeId, champ, n = 1) {
  const v = Records.get('Ville', villeId);
  if (!v) return;
  ecrire(villeId, { [champ]: (v.parcours?.[champ] || 0) + n });
}

const ETAT_INITIAL = (user, mode) => ({
  etat: 'en_cours',
  mode,
  phase: 'rues',
  etape: 1,
  demarre_le: maintenant(),
  fini_le: null,
  par: user?.email || null,
  rue_en_cours: null,
  rues_total: 0,
  rues_faites: 0,
  commerces_trouves: 0,
  cibles_creees: 0,
  cibles_deja: 0,
  proprietaires_trouves: 0,
  ecartees: 0,
  brouillons: 0,
  erreurs: 0,
  journal: [],
});

/**
 * Lance le parcours complet d'une ville, en tâche de fond. Rend tout de suite.
 * @param {string} villeId
 * @param {{user?:object, rayon_km?:number, limite_par_rue?:number|null, rediger?:boolean}} o
 */
export function lancer(villeId, { user = null, rayon_km = undefined, limite_par_rue = null, rediger = false, tout = false } = {}) {
  const v = Records.get('Ville', villeId);
  if (!v) return { ok: false, error: 'Ville introuvable.' };
  if (enCours.has(villeId)) return { ok: false, error: 'Un parcours est déjà en cours sur cette ville.' };
  enCours.set(villeId, { arreter: false });
  Records.update('Ville', villeId, { parcours: ETAT_INITIAL(user, tout ? 'ville' : 'rues') });
  // Par défaut on s'arrête aux rues proposées : l'équipe coche celles qu'elle
  // veut prospecter, puis parcourir() prend le relais. « tout » enchaîne.
  executer(villeId, { user, rayon_km, limite_par_rue, rediger, rues: null, phases: tout ? ['rues', 'commerces'] : ['rues'] }).catch((e) => {
    noter(villeId, `Le parcours s'est arrêté sur une erreur : ${e.message}`);
    ecrire(villeId, { etat: 'erreur', fini_le: maintenant() });
    enCours.delete(villeId);
  });
  return { ok: true, ville: Records.get('Ville', villeId) };
}

/**
 * Parcourt une seule rue (déjà classée), sans recenser la ville : pour une rue
 * ajoutée à la main, ou pour repasser sur une rue.
 */
export function parcourirRue(villeId, nomRue, { user = null, limite_par_rue = null, rediger = true } = {}) {
  const v = Records.get('Ville', villeId);
  if (!v) return { ok: false, error: 'Ville introuvable.' };
  const rue = (v.rues || []).find((r) => cleRue(r.nom) === cleRue(nomRue));
  if (!rue) return { ok: false, error: `La rue « ${nomRue} » n'est pas classée dans ${v.nom}.` };
  if (enCours.has(villeId)) return { ok: false, error: 'Un parcours est déjà en cours sur cette ville.' };
  enCours.set(villeId, { arreter: false });
  Records.update('Ville', villeId, { parcours: { ...ETAT_INITIAL(user, 'rue'), phase: 'commerces', etape: 3 } });
  executer(villeId, { user, limite_par_rue, rediger, rues: [rue.nom], phases: ['commerces'] }).catch((e) => {
    noter(villeId, `Le parcours s'est arrêté sur une erreur : ${e.message}`);
    ecrire(villeId, { etat: 'erreur', fini_le: maintenant() });
    enCours.delete(villeId);
  });
  return { ok: true, ville: Records.get('Ville', villeId) };
}

/**
 * Parcourt les rues cochées par l'équipe : chaque commerce devient une cible
 * analysée (propriétaire, société, événements, mutation, loyer, classement).
 * Pas de message à ce stade : ils s'écrivent pour la sélection, après.
 */
export function parcourir(villeId, noms, { user = null, limite_par_rue = null } = {}) {
  const v = Records.get('Ville', villeId);
  if (!v) return { ok: false, error: 'Ville introuvable.' };
  const cles = new Set((noms || []).map(cleRue));
  const retenues = (v.rues || []).filter((r) => cles.has(cleRue(r.nom)));
  if (!retenues.length) return { ok: false, error: 'Cochez au moins une rue.' };
  if (enCours.has(villeId)) return { ok: false, error: 'Un parcours est déjà en cours sur cette ville.' };
  Records.update('Ville', villeId, { rues: (v.rues || []).map((r) => ({ ...r, retenue: cles.has(cleRue(r.nom)) ? true : r.retenue || false })) });
  enCours.set(villeId, { arreter: false });
  Records.update('Ville', villeId, { parcours: { ...ETAT_INITIAL(user, 'commerces'), phase: 'commerces', etape: 3 } });
  executer(villeId, { user, limite_par_rue, rediger: false, rues: retenues.map((r) => r.nom), phases: ['commerces'] }).catch((e) => {
    noter(villeId, `Le parcours s'est arrêté sur une erreur : ${e.message}`);
    ecrire(villeId, { etat: 'erreur', fini_le: maintenant() });
    enCours.delete(villeId);
  });
  return { ok: true, ville: Records.get('Ville', villeId) };
}

/** Rédige un message pour chaque cible cochée, en tâche de fond. */
export function redigerPour(villeId, ids, { user = null } = {}) {
  const v = Records.get('Ville', villeId);
  if (!v) return { ok: false, error: 'Ville introuvable.' };
  const cibles = (ids || []).map((id) => Records.get('Cible', id)).filter((c) => c && c.ville_id === villeId);
  if (!cibles.length) return { ok: false, error: 'Cochez au moins un commerce.' };
  if (enCours.has(villeId)) return { ok: false, error: 'Un parcours est déjà en cours sur cette ville.' };
  enCours.set(villeId, { arreter: false });
  Records.update('Ville', villeId, { parcours: { ...ETAT_INITIAL(user, 'redaction'), phase: 'redaction', etape: 7, rues_total: 0 } });
  (async () => {
    noter(villeId, `Rédaction de ${cibles.length} message${cibles.length > 1 ? 's' : ''}.`);
    for (const c of cibles) {
      if (enCours.get(villeId)?.arreter) break;
      try {
        await enrichir.redigerBrouillon(c.id, { user });
        compter(villeId, 'brouillons');
      } catch (e) {
        compter(villeId, 'erreurs');
        noter(villeId, `${c.enseigne || c.adresse} : message non rédigé (${e.message}).`);
      }
    }
    const p = Records.get('Ville', villeId).parcours || {};
    noter(villeId, `${p.brouillons || 0} message${(p.brouillons || 0) > 1 ? 's' : ''} rédigé${(p.brouillons || 0) > 1 ? 's' : ''}, à relire sur chaque fiche.`);
    ecrire(villeId, { etat: 'fini', fini_le: maintenant() });
    enCours.delete(villeId);
  })().catch((e) => {
    noter(villeId, `La rédaction s'est arrêtée sur une erreur : ${e.message}`);
    ecrire(villeId, { etat: 'erreur', fini_le: maintenant() });
    enCours.delete(villeId);
  });
  return { ok: true, ville: Records.get('Ville', villeId) };
}

/** Demande l'arrêt : le parcours s'arrête à la fin de la cible en cours. */
export function arreter(villeId) {
  const r = enCours.get(villeId);
  if (!r) return { ok: false, error: "Aucun parcours en cours sur cette ville." };
  r.arreter = true;
  noter(villeId, "Arrêt demandé : ALX finit la cible en cours et s'arrête.");
  return { ok: true };
}

/** Au démarrage du serveur : un parcours laissé « en cours » ne l'est plus. */
export function reprendreAuDemarrage() {
  for (const v of Records.list('Ville')) {
    if (v.parcours?.etat === 'en_cours') {
      Records.update('Ville', v.id, { parcours: { ...v.parcours, etat: 'interrompu', fini_le: maintenant(), journal: [...(v.parcours.journal || []), { le: maintenant(), texte: 'Le serveur a redémarré pendant le parcours : relancez, ALX reprend où il en était.' }].slice(-JOURNAL_MAX) } });
    }
  }
}

// ---------------------------------------------------------------------------
// L'exécution
// ---------------------------------------------------------------------------

async function executer(villeId, { user, rayon_km, limite_par_rue, rediger, rues, phases = ['rues', 'commerces'] }) {
  const doitArreter = () => enCours.get(villeId)?.arreter === true;
  const finir = (etat) => {
    ecrire(villeId, { etat, fini_le: maintenant(), rue_en_cours: null });
    enCours.delete(villeId);
  };

  // 1. La ville, et pour qui on cherche.
  let ville = Records.get('Ville', villeId);
  try {
    const { clientsActifs, clientsConfigure } = await import('./clients.js');
    if (clientsConfigure()) {
      const clients = await clientsActifs();
      const budgets = clients.map((c) => c.budget).filter(Boolean);
      noter(villeId, `${clients.length} client${clients.length > 1 ? 's' : ''} actif${clients.length > 1 ? 's' : ''} sur Monday${budgets.length ? `, budgets de ${Math.min(...budgets).toLocaleString('fr-FR')} à ${Math.max(...budgets).toLocaleString('fr-FR')} €` : ''}.`);
    } else {
      noter(villeId, 'Monday non connecté : ALX cherche pour le mandat général, 200 000 à 1 000 000 €.');
    }
  } catch (e) {
    noter(villeId, `Monday n'a pas répondu (${e.message}) : mandat général.`);
  }

  // 2. Les rues.
  let etablissementsParRue = {};
  if (phases.includes('rues')) {
    ecrire(villeId, { phase: 'rues', etape: 2 });
    const r = await proposerRues(ville, { rayon_km, arreter: doitArreter, journal: (t) => noter(villeId, t) });
    etablissementsParRue = r.etablissements_par_rue;
    ville = Records.get('Ville', villeId);
    // Ce que l'équipe a classé à la main reste ; ce qu'ALX avait proposé est
    // remplacé. Une rue classée à la main prend quand même ce qu'ALX sait
    // d'elle (tracé, vitrines, loyer, prix) : la classe et l'auteur restent.
    const connues = new Map([...r.classees, ...r.ecartees].map((x) => [x.cle, x]));
    const manuelles = (ville.rues || []).filter((x) => x.par && x.par !== 'alx').map((x) => {
      const { classe: _c, motif: _m, ...savoir } = connues.get(cleRue(x.nom)) || {};
      return { ...savoir, ...x };
    });
    const clesManuelles = new Set(manuelles.map((x) => cleRue(x.nom)));
    const clesRetirees = new Set((ville.rues_retirees || []).map((x) => cleRue(x.nom)));
    // Les leçons de l'équipe passent avant : une rue qui ressemble à celles
    // qu'on a corrigées prend la classe corrigée, avec la raison dans son motif.
    const { leconsDe, reglesApprises, appliquerLecons } = await import('./apprentissage.js');
    const regles = reglesApprises(leconsDe(villeId), REGLES.parcours);
    let apprises = 0;
    const proposees = r.classees.filter((x) => !clesManuelles.has(x.cle) && !clesRetirees.has(x.cle)).map((x) => {
      const y = appliquerLecons(x, regles, villeId, REGLES.parcours);
      if (y.apprise) apprises += 1;
      return { ...y, par: 'alx', le: maintenant() };
    });
    if (apprises) noter(villeId, `${apprises} rue${apprises > 1 ? 's' : ''} reclassée${apprises > 1 ? 's' : ''} d'après vos corrections passées.`);
    if (clesRetirees.size) noter(villeId, `${clesRetirees.size} rue${clesRetirees.size > 1 ? 's' : ''} retirée${clesRetirees.size > 1 ? 's' : ''} par l'équipe, non reproposée${clesRetirees.size > 1 ? 's' : ''}.`);
    const toutes = [...manuelles, ...proposees].sort((a, b) => a.classe - b.classe || (b.commerces || 0) - (a.commerces || 0));
    Records.update('Ville', villeId, {
      rues: toutes,
      rues_ecartees: r.ecartees.filter((x) => !clesManuelles.has(x.cle)),
      code_insee: r.commune.code_insee,
      code_postal: ville.code_postal || r.commune.code_postal,
      centre: { lat: r.commune.lat, lon: r.commune.lon },
      recensement: { le: maintenant(), rayon_km: rayon_km ?? null, commerces_total: r.commerces_total, rues_denses: r.classees.length + r.ecartees.length },
    });
    const n1 = proposees.filter((x) => x.classe === 1).length;
    const n1bis = proposees.filter((x) => x.classe === 1.5).length;
    const n2 = proposees.filter((x) => x.classe === 2).length;
    noter(villeId, `Rues proposées : ${n1} en emplacement 1, ${n1bis} en 1 bis, ${n2} en 2, ${r.ecartees.length} écartée${r.ecartees.length > 1 ? 's' : ''}${manuelles.length ? ` ; ${manuelles.length} classée${manuelles.length > 1 ? 's' : ''} à la main conservée${manuelles.length > 1 ? 's' : ''}` : ''}.`);
    if (doitArreter()) return finir('arrete');
    if (!phases.includes('commerces')) {
      noter(villeId, 'Cochez les rues à prospecter, sur la carte ou dans la liste : ALX cherche ensuite leurs commerces.');
      return finir('rues_proposees');
    }
  }

  // 3 à 7. Les commerces, rue par rue.
  ville = Records.get('Ville', villeId);
  // Toutes les rues classées, à chaque lancement : une cible déjà lue est
  // sautée en quelques millisecondes, un commerce nouveau est pris.
  const aParcourir = (ville.rues || [])
    .filter((x) => !rues || rues.some((n) => cleRue(n) === cleRue(x.nom)))
    .sort((a, b) => a.classe - b.classe || (b.commerces || 0) - (a.commerces || 0));
  ecrire(villeId, { phase: 'commerces', etape: 3, rues_total: aParcourir.length });
  if (!aParcourir.length) {
    noter(villeId, 'Aucune rue classée : rien à parcourir.');
    return finir('fini');
  }

  for (const rue of aParcourir) {
    if (doitArreter()) return finir('arrete');
    ecrire(villeId, { rue_en_cours: rue.nom, etape: 3 });

    let etabs = etablissementsParRue[cleRue(rue.nom)] || null;
    if (!etabs) {
      try {
        const v0 = Records.get('Ville', villeId);
        etabs = await etablissementsRue({ rue: rue.nom, code_commune: v0.code_insee || null, code_postal: v0.code_insee ? null : rue.code_postal || v0.code_postal || null, arreter: doitArreter });
      } catch (e) {
        noter(villeId, `${rue.nom} : l'annuaire n'a pas répondu (${e.message}), rue passée.`);
        compter(villeId, 'erreurs');
        continue;
      }
    }
    // La balade sur Maps donne les vitrines ; l'annuaire donne à chacune son
    // SIRET et son exploitant. Sans clé Google, l'annuaire seul, catalogue resserré.
    let commerces;
    if (placesConfigure()) {
      const v0 = Records.get('Ville', villeId);
      // La balade suit le tracé de la rue (OpenStreetMap) ; à défaut, les
      // points des établissements de l'annuaire ; à défaut, les numéros par la BAN.
      const points = rue.trace?.length ? pointsLeLongDe(rue.trace) : etabs.filter((e) => e.lat && e.lon).map((e) => ({ lat: e.lat, lon: e.lon }));
      try {
        const balade = await commercesDeLaRue({ nom: rue.nom, ville: v0.nom, points, arreter: doitArreter, journal: (t) => noter(villeId, t) });
        commerces = balade.commerces.map((c) => {
          const e = etablissementPour(c, etabs);
          return e ? { ...c, siret: e.siret, siren: e.siren, nom: e.nom, ape: e.ape, depuis: e.depuis, chaine: e.chaine, code_postal: c.code_postal || e.code_postal } : { ...c, siret: null, siren: null, nom: null, ape: null, depuis: null, chaine: false };
        });
        const ign = Object.entries(balade.ignores).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([m, n]) => `${n} ${m}`).join(', ');
        noter(villeId, `${rue.nom} : balade sur Maps en ${balade.pas} pas, ${commerces.length} vitrine${commerces.length > 1 ? 's' : ''}${ign ? ` (écartés : ${ign})` : ''}, ${commerces.filter((c) => c.siret).length} retrouvée${commerces.filter((c) => c.siret).length > 1 ? 's' : ''} dans l'annuaire.`);
      } catch (e) {
        noter(villeId, `${rue.nom} : Maps n'a pas répondu (${e.message}), on lit l'annuaire.`);
        commerces = etabs.filter((e) => e.pied_d_immeuble?.oui);
      }
    } else {
      commerces = etabs.filter((e) => e.pied_d_immeuble?.oui);
    }
    const retenus = limite_par_rue ? commerces.slice(0, limite_par_rue) : commerces;
    compter(villeId, 'commerces_trouves', commerces.length);
    noter(villeId, `${rue.nom} (emplacement ${libelleEmplacement(rue.classe)}) : ${commerces.length} commerce${commerces.length > 1 ? 's' : ''}${limite_par_rue && commerces.length > limite_par_rue ? `, ${limite_par_rue} retenus pour cet essai` : ''}.`);

    const loyerRue = rue.loyer ? { [rue.loyer_source === 'Data-B, quartier' ? 'quartier' : 'rue']: { nom: rue.nom, basse: rue.loyer[0], haute: rue.loyer[1] } } : null;
    let erreursRue = 0;
    let creees = 0;
    let proprios = 0;
    let ecartees = 0;

    for (const e of retenus) {
      if (doitArreter()) return finir('arrete');
      const r = creerCible({
        ville_id: villeId,
        rue: rue.nom,
        adresse: [e.numero, e.rue].filter(Boolean).join(' '),
        enseigne: e.enseigne,
        activite: e.activite,
        siret: e.siret,
        place_id: e.place_id || null,
        code_postal: e.code_postal || null,
        occupant: e.siret || e.nom ? { siret: e.siret, siren: e.siren, nom: e.nom, ape: e.ape, depuis: e.depuis, chaine: e.chaine } : null,
        telephone: e.telephone || null,
        site: e.site || null,
        lat: e.lat,
        lon: e.lon,
        source: e.source || 'Annuaire des entreprises',
        user,
      });
      if (!r.ok) {
        erreursRue += 1;
        continue;
      }
      let c = r.cible;
      ecrire(villeId, { commerce_en_cours: c.enseigne || c.adresse });
      if (r.deja) {
        compter(villeId, 'cibles_deja');
        // Déjà lue : on ne refait pas Data-B pour rien. Mais si le choix du
        // propriétaire était resté ouvert, on le rejoue avec les règles du jour.
        if (c.foncier && !c.proprietaire?.nom && !c.activite_exclue) {
          try {
            const rc = await enrichir.rechoisirProprietaire(c.id, { user });
            if (!rc.inchangee) {
              c = rc.cible;
              proprios += 1;
              if (c.proprietaire?.siren) c = (await enrichir.lireEvenements(c.id, { user }).catch(() => ({ cible: c }))).cible;
              c = Records.get('Cible', c.id);
              if (rediger && ['appeler', 'ecrire'].includes(c.pile) && !c.brouillon) {
                await enrichir.redigerBrouillon(c.id, { user }).catch(() => {});
                compter(villeId, 'brouillons');
              }
            }
          } catch {
            // Un rejeu qui échoue laisse la cible telle qu'elle était.
          }
        }
        if (c.foncier || c.activite_exclue) continue;
      } else {
        creees += 1;
        compter(villeId, 'cibles_creees');
      }
      if (c.activite_exclue) {
        ecartees += 1;
        compter(villeId, 'ecartees');
        continue;
      }

      // 4. Le propriétaire, puis la société.
      ecrire(villeId, { etape: 4 });
      try {
        const p = await enrichir.trouverProprietaire(c.id, { user });
        c = p.cible;
        if (c.proprietaire?.nom) proprios += 1;
      } catch (err) {
        erreursRue += 1;
        if (erreursRue <= ERREURS_PAR_RUE_AU_JOURNAL) noter(villeId, `${c.adresse} : propriétaire non lu (${err.message}).`);
      }
      // 5. La société et les gens : BODACC sur le SIREN, DVF sur l'adresse.
      ecrire(villeId, { etape: 5 });
      if (c.proprietaire?.siren) {
        try {
          c = (await enrichir.lireEvenements(c.id, { user })).cible;
        } catch (err) {
          erreursRue += 1;
          if (erreursRue <= ERREURS_PAR_RUE_AU_JOURNAL) noter(villeId, `${c.adresse} : BODACC non lu (${err.message}).`);
        }
      }
      try {
        c = (await enrichir.lireMutation(c.id, { user })).cible;
      } catch (err) {
        // DVF sans vente autour n'est pas une erreur : c'est fréquent.
        if (!/aucune vente|pas assez/i.test(err.message)) {
          erreursRue += 1;
          if (erreursRue <= ERREURS_PAR_RUE_AU_JOURNAL) noter(villeId, `${c.adresse} : DVF non lu (${err.message}).`);
        }
      }
      // 6. Le classement, avec le loyer de la rue.
      ecrire(villeId, { etape: 6 });
      if (loyerRue) {
        try {
          c = enrichir.poserLoyer(c.id, loyerRue, user).cible;
        } catch {
          // Le loyer est un confort : la cible reste classée sans lui.
        }
      }
      c = Records.get('Cible', c.id);
      if (c.pile === 'ecartee') ecartees += 1;
      // Une ligne par commerce lu : c'est ce qui défile pendant que ça tourne.
      noter(villeId, `${c.enseigne || 'Sans enseigne'}, ${c.adresse} → ${c.proprietaire?.nom || (c.foncier ? 'plusieurs propriétaires' : 'propriétaire à établir')} · ${LIBELLES_PILES[c.pile] || c.pile}`);
      // 7. Le contact : un brouillon pour les piles qui appellent une action.
      if (rediger && ['appeler', 'ecrire'].includes(c.pile) && !c.brouillon) {
        ecrire(villeId, { etape: 7 });
        try {
          await enrichir.redigerBrouillon(c.id, { user });
          compter(villeId, 'brouillons');
        } catch (err) {
          erreursRue += 1;
          if (erreursRue <= ERREURS_PAR_RUE_AU_JOURNAL) noter(villeId, `${c.adresse} : brouillon non rédigé (${err.message}).`);
        }
      }
      await pause(PAUSE_ENTRE_CIBLES_MS);
    }

    if (proprios) compter(villeId, 'proprietaires_trouves', proprios);
    if (erreursRue) compter(villeId, 'erreurs', erreursRue);
    // La rue est parcourue : on l'écrit sur elle, avec ses comptes.
    const v1 = Records.get('Ville', villeId);
    const rues1 = (v1.rues || []).map((x) => (cleRue(x.nom) === cleRue(rue.nom) ? { ...x, parcourue_le: maintenant(), cibles: creees + (x.cibles || 0), proprietaires: proprios + (x.proprietaires || 0) } : x));
    Records.update('Ville', villeId, { rues: rues1 });
    compter(villeId, 'rues_faites');
    ecrire(villeId, { commerce_en_cours: null });
    const piles = Records.filter('Cible', { ville_id: villeId, rue: rue.nom }).reduce((a, x) => ((a[x.pile] = (a[x.pile] || 0) + 1), a), {});
    noter(villeId, `${rue.nom} : ${creees} cible${creees > 1 ? 's' : ''} créée${creees > 1 ? 's' : ''}, ${proprios} propriétaire${proprios > 1 ? 's' : ''} trouvé${proprios > 1 ? 's' : ''}, ${ecartees} écartée${ecartees > 1 ? 's' : ''} · à appeler ${piles.appeler || 0}, à écrire ${piles.ecrire || 0}, à surveiller ${piles.surveiller || 0}${erreursRue ? ` · ${erreursRue} erreur${erreursRue > 1 ? 's' : ''}` : ''}.`);
  }

  const v2 = Records.get('Ville', villeId);
  const p = v2.parcours || {};
  noter(villeId, `Parcours terminé : ${p.rues_faites} rue${p.rues_faites > 1 ? 's' : ''}, ${p.cibles_creees} cible${p.cibles_creees > 1 ? 's' : ''} créée${p.cibles_creees > 1 ? 's' : ''}, ${p.proprietaires_trouves} propriétaire${p.proprietaires_trouves > 1 ? 's' : ''}, ${p.brouillons} brouillon${p.brouillons > 1 ? 's' : ''} à relire.`);
  finir('fini');
}
