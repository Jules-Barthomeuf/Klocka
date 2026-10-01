// La prospection du mandataire, version « comme ALX » : on demande « les
// boulangeries à Lyon », la ville est lancée dans ALX (les rues commerçantes
// tracées et classées n°1, 1 bis, 2, puis les commerces lus un à un), et la
// page suit le parcours en direct. Les commerces trouvés se cochent, puis
// s'exportent vers une liste d'appels : la seconde moitié de la Prospection.
//
// Une ville déjà parcourue par ALX n'est pas relancée : on lit ce qu'il a.
// Un parcours coûte (annuaire, propriétaires) ; il ne repart qu'au-delà de
// trente jours, ou si la ville n'a jamais été lue.

import { Records } from './db.js';
import { cleRue } from './alx/commerces.js';
import { activiteRepond } from './mandataire-recherche.js';

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const TRENTE_JOURS = 30 * 86400000;
const API_GEO = 'https://geo.api.gouv.fr';
const moi = (user) => String(user?.email || '').toLowerCase();

async function communeParNom(nom) {
  const r = await fetch(`${API_GEO}/communes?nom=${encodeURIComponent(nom)}&fields=nom,code,codeDepartement,codeRegion,centre,codesPostaux,population&boost=population&limit=1`, { signal: AbortSignal.timeout(15_000) });
  const c = r.ok ? (await r.json())[0] : null;
  return c?.centre?.coordinates ? { nom: c.nom, code: c.code, codeDepartement: c.codeDepartement, codeRegion: c.codeRegion, lat: c.centre.coordinates[1], lon: c.centre.coordinates[0], code_postal: c.codesPostaux?.[0] || null } : null;
}

async function communeAuPoint(lat, lon) {
  const r = await fetch(`${API_GEO}/communes?lat=${lat}&lon=${lon}&fields=nom,centre,codesPostaux&limit=1`, { signal: AbortSignal.timeout(15_000) });
  const c = r.ok ? (await r.json())[0] : null;
  return c ? { nom: c.nom, lat: c.centre?.coordinates?.[1] ?? lat, lon: c.centre?.coordinates?.[0] ?? lon, code_postal: c.codesPostaux?.[0] || null } : null;
}

/**
 * Pure : la classe actuelle de chaque rue de la ville, par sa clé. Un commerce
 * garde la classe que sa rue avait quand ALX l'a lu ; la rue a pu être
 * reclassée depuis, et c'est la classe d'aujourd'hui qui compte.
 */
export function classesDesRues(ville) {
  return new Map((ville?.rues || []).filter((r) => r.classe != null).map((r) => [cleRue(r.nom), r.classe]));
}

/** Pure : les rues de l'emplacement voulu (toutes si null) qu'ALX n'a pas encore lues. */
export function ruesALire(ville, emplacement = null) {
  return (ville?.rues || []).filter((r) => r.classe != null && (emplacement == null || r.classe === emplacement) && !r.parcourue_le).map((r) => r.nom);
}

/**
 * Lance la lecture des rues manquantes, si ALX n'est pas déjà dessus. Une
 * cible déjà lue est sautée : seules les rues jamais parcourues coûtent.
 * @returns {Promise<number>} le nombre de rues mises en lecture
 */
async function lireRuesManquantes(ville, emplacement, user, surEtape) {
  if (ville.parcours?.etat === 'en_cours') return 0;
  const noms = ruesALire(ville, emplacement);
  if (!noms.length) return 0;
  const { parcourir } = await import('./alx/parcours.js');
  const r = parcourir(ville.id, noms, { user });
  if (!r.ok) return 0;
  surEtape(`${noms.length} rue${noms.length > 1 ? 's' : ''}${emplacement != null ? ` en ${libelle(emplacement)}` : ''} pas encore lue${noms.length > 1 ? 's' : ''} : ALX les parcourt`);
  return noms.length;
}

const libelle = (e) => `n°${e === 1.5 ? '1 bis' : e}`;

/** Pure : le nom de rue d'une adresse Places (« 12 Rue Carnot » → « Rue Carnot »). */
export function rueDeLAdresse(adresse) {
  const m = String(adresse || '').trim().match(/^\d+\s*(?:bis|ter)?\s+(.+)$/i);
  return (m ? m[1] : String(adresse || '')).trim() || null;
}

/**
 * Le balayage d'activité : la ville entière interrogée sur Google Places,
 * comme la recherche de Maps. ALX lit la ville rue par rue, en commençant par
 * le centre : tant qu'il n'a pas fini, une boulangerie de quartier n'existe
 * pas encore chez nous. Ce balayage comble le trou : chaque commerce trouvé
 * devient une cible légère (sans propriétaire : il viendra quand ALX lira sa
 * rue, le place_id évite le doublon). Une ville et une activité ne sont
 * balayées qu'une fois par trente jours — une à trois requêtes Places.
 */
export async function balayerActivites(ville, activites, { user = null, surEtape = () => {} } = {}) {
  const { placesConfigure, chercherActiviteVille } = await import('./alx/places.js');
  if (!placesConfigure() || !activites?.length) return { ok: true, crees: 0 };
  const { creerCible } = await import('./alx/index.js');
  let crees = 0;
  for (const activite of activites.slice(0, 4)) {
    const garde = Records.list('BalayagePlaces').find((b) => b.ville_id === ville.id && norm(b.activite) === norm(activite) && Date.now() - Date.parse(b.le) < TRENTE_JOURS);
    if (garde) continue;
    surEtape(`Recherche des ${activite}s de ${ville.nom} sur Google Maps`);
    let lieux;
    try {
      lieux = await chercherActiviteVille(activite, ville.nom, { centre: ville.centre });
    } catch (e) {
      surEtape(`Google Maps n'a pas répondu pour « ${activite} » : ${e.message}`);
      continue;
    }
    let nouveaux = 0;
    for (const lieu of lieux) {
      const r = creerCible({
        ville_id: ville.id,
        rue: rueDeLAdresse(lieu.adresse),
        adresse: lieu.adresse,
        enseigne: lieu.enseigne,
        activite: lieu.activite || activite,
        place_id: lieu.place_id,
        telephone: lieu.telephone,
        lat: lieu.lat,
        lon: lieu.lon,
        source: 'Google Maps, balayage',
        user,
      });
      if (r.ok && !r.deja) { crees += 1; nouveaux += 1; }
    }
    Records.create('BalayagePlaces', { ville_id: ville.id, activite, le: new Date().toISOString(), lus: lieux.length, nouveaux });
    surEtape(`${lieux.length} ${activite}${lieux.length > 1 ? 's' : ''} sur Maps, ${nouveaux} nouvelle${nouveaux > 1 ? 's' : ''} ici`);
  }
  return { ok: true, crees };
}

/** Le nom d'une prospection, toutes ses activités comprises. */
async function nomDe(criteres) {
  const { nomDeProspection } = await import('./mandataire-espace.js');
  return nomDeProspection({ ...criteres, activite: (criteres.activites || []).join(', ') || criteres.activite || null });
}

/** Pure : les activités d'une prospection pour plusieurs clients (vide : tous les commerces). */
export function activitesDe(demandes) {
  if (!demandes.length || demandes.some((d) => !d.type_commerce)) return [];
  return [...new Set(demandes.map((d) => d.type_commerce))];
}

/** Pure : un commerce répond-il aux critères (une des activités, l'emplacement) ? */
export function cibleCorrespond(c, { activites = [], emplacement = null } = {}, { memeEcarte = false } = {}) {
  if (!memeEcarte && (c.activite_exclue || c.pile === 'ecartee' || c.ecartee_regle)) return false;
  if (emplacement != null && c.emplacement !== emplacement) return false;
  if (!activites.length) return true;
  return activiteRepond(`${c.activite || ''} ${c.categorie_activite || ''} ${c.enseigne || ''}`, activites);
}

/**
 * Lance une prospection. `phrase` (recherche libre) ou `demande_ids` (pour un
 * ou plusieurs clients) ; `ville` précise la commune quand la phrase ne la dit pas.
 * @returns {Promise<{ok: true, prospection} | {ok: false, error}>}
 */
export async function lancerProspection({ phrase = '', demande_ids = [], ville = null }, user, surEtape = () => {}) {
  const { secteurDe, anneauxSecteur, communeDansSecteur, demandeAnonyme } = await import('./mandataire-espace.js');
  surEtape('Lecture de la demande');
  const secteur = secteurDe(user);
  if (!secteur) return { ok: false, error: 'Aucun secteur ne vous est attribué : demandez à Klocka de le tracer.' };

  let activites = [];
  let emplacement = null;
  let villeDemandee = ville;
  let demandes = [];
  // « Pour AR », « pour le client B » écrit à la main : la demande anonymisée
  // dont la référence (les initiales, ou la lettre) est dans la phrase.
  if (!demande_ids?.length && /\b(pour|clients?)\b/i.test(phrase)) {
    const { demandesVisibles } = await import('./mandataire-espace.js');
    const anonymes = demandesVisibles();
    const trouvees = anonymes.filter((a) => new RegExp(`(^|[^a-z0-9à-ÿ])${a.reference.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}([^a-z0-9à-ÿ]|$)`, 'i').test(phrase));
    if (trouvees.length) demande_ids = trouvees.map((a) => a.id);
    else if (/\bclients?\s+[a-z]{1,3}\d*\b/i.test(phrase)) {
      return { ok: false, error: 'Je ne retrouve pas ce client : ouvrez la page Clients pour voir les références.' };
    }
  }
  if (demande_ids?.length) {
    const toutes = Records.list('DemandeClient');
    const visibles = toutes.filter((d) => d.active !== false && d.visible !== false);
    demandes = demande_ids.map((id) => visibles.find((d) => d.id === id)).filter(Boolean);
    if (!demandes.length) return { ok: false, error: 'Ces demandes ne sont plus ouvertes.' };
    activites = activitesDe(demandes);
    const { demandesVisibles: dv } = await import('./mandataire-espace.js');
    const anonymesRefs = new Map(dv().map((a) => [a.id, a.reference]));
    const refs = demandes.map((d) => anonymesRefs.get(d.id) || demandeAnonyme(d, visibles.indexOf(d)).reference);
    surEtape(`Pour ${refs.join(', ')} : ${activites.length ? activites.join(', ') : 'tous les murs commerciaux'}`);
  }
  // Pour des clients, seul ce qui suit le « · » est à lire (la ville, l'emplacement).
  const aLire = demandes.length ? (phrase.split(' · ').slice(1).join(' ') || '') : phrase;
  if (aLire.trim()) {
    const { interpreterRecherche } = await import('./mandataire-recherche.js');
    const lu = await interpreterRecherche(aLire);
    if (lu.activite && !activites.length) activites = [lu.activite];
    if (lu.ville) villeDemandee = lu.ville;
    emplacement = lu.emplacement;
    surEtape(`Compris : ${[activites.join(', ') || 'tous les commerces', emplacement != null ? `emplacement n°${emplacement === 1.5 ? '1 bis' : emplacement}` : null].filter(Boolean).join(' · ')}`);
  }

  // La ville : celle qu'on a dite, sinon le cœur du secteur.
  let commune;
  if (villeDemandee) {
    commune = await communeParNom(villeDemandee);
    if (!commune) return { ok: false, error: `Je ne trouve pas la commune « ${villeDemandee} ».` };
    if (!communeDansSecteur(commune, secteur)) return { ok: false, error: `« ${commune.nom} » n'est pas dans votre secteur « ${secteur.nom} ».` };
  } else {
    const { coeurDuSecteur } = await import('./mandataire-recherche.js');
    const coeur = coeurDuSecteur(anneauxSecteur(secteur));
    commune = coeur ? await communeAuPoint(coeur.lat, coeur.lon) : null;
    if (!commune) return { ok: false, error: 'Dites-moi dans quelle ville chercher (« à Lyon »).' };
  }
  surEtape(`Zone : ${commune.nom}`);

  // La ville dans ALX : reprise si déjà lue, lancée sinon.
  const { creerVille } = await import('./alx/index.js');
  const { lancer } = await import('./alx/parcours.js');
  const c = creerVille({ nom: commune.nom, code_postal: commune.code_postal, user });
  if (!c.ok) return c;
  const v = Records.get('Ville', c.ville.id);
  if (!v.centre) Records.update('Ville', v.id, { centre: { lat: commune.lat, lon: commune.lon } });
  const cibles = Records.filter('Cible', { ville_id: v.id }).length;
  const p = v.parcours || {};
  const recent = p.fini_le && Date.now() - Date.parse(p.fini_le) < TRENTE_JOURS;
  let lancee = false;
  if (p.etat === 'en_cours') {
    surEtape(`ALX parcourt déjà ${v.nom} : je suis son parcours`);
  } else if (cibles && (recent || p.etat === 'fini')) {
    surEtape(`${v.nom} est déjà parcourue par ALX : ${cibles} commerces lus`);
    await lireRuesManquantes(v, emplacement, user, surEtape);
  } else {
    const r = lancer(v.id, { user, tout: true, classes: emplacement != null ? [emplacement] : null });
    if (!r.ok) return r;
    lancee = true;
    surEtape(`ALX trace les rues commerçantes de ${v.nom}, puis lit les commerces`);
  }

  const nom = demandes.length > 1
    ? `${demandes.length} clients · ${v.nom}`
    : await nomDe({ activites, emplacement, ville: v.nom });
  // Le balayage d'activité, en fond : les commerces de Maps arrivent dans la
  // liste au fil des relectures, sans retenir la réponse.
  if (activites.length) {
    surEtape(`Les ${activites.join(', ')} de ${v.nom} arrivent aussi de Google Maps`);
    balayerActivites(Records.get('Ville', v.id), activites, { user }).catch((e) => console.warn(`[mandataire] balayage : ${e?.message || e}`));
  }

  const prospection = Records.create('ProspectionMandataire', {
    mandataire_email: moi(user),
    nom,
    mode: demandes.length ? 'client' : 'libre',
    demande_ids: demandes.map((d) => d.id),
    demande_id: demandes[0]?.id || null,
    criteres: { activites, activite: activites[0] || null, emplacement, ville: v.nom },
    ville_id: v.id,
    alx_lance: lancee,
    trouves: 0,
    cree_le: new Date().toISOString(),
  });
  return { ok: true, prospection };
}

/**
 * Une prospection et ce qu'ALX en a lu jusqu'ici : la carte, l'avancement,
 * les commerces. `sansRues` sert aux relectures de suivi : les 900 tracés de
 * rues d'une grande ville pèsent lourd et ne changent presque jamais.
 */
export async function etatProspection(id, user, { sansRues = false } = {}) {
  const pr = Records.get('ProspectionMandataire', id);
  if (!pr || pr.mandataire_email !== moi(user)) return { ok: false, error: 'Prospection introuvable.' };
  const v = pr.ville_id ? Records.get('Ville', pr.ville_id) : null;
  if (!v) return { ok: false, error: 'La ville de cette prospection a disparu.' };
  const { correspond, demandeAnonyme } = await import('./mandataire-espace.js');
  const classes = classesDesRues(v);
  const visibles = Records.list('DemandeClient').filter((d) => d.active !== false && d.visible !== false);
  const suivis = new Map(Records.list('ProprietaireMandataire').filter((p) => p.cible_id).map((p) => [p.cible_id, p]));
  const toutes = Records.filter('Cible', { ville_id: v.id })
    .map((c) => ({ ...c, emplacement: classes.get(cleRue(c.rue || '')) ?? c.emplacement ?? null }));
  // Ce que les règles ALX écartent (restauration rapide, cédés…) : compté, pour
  // qu'une liste vide s'explique au lieu de laisser croire qu'il n'y a rien.
  const ecartes = toutes.filter((c) => cibleCorrespond(c, pr.criteres || {}, { memeEcarte: true }) && !cibleCorrespond(c, pr.criteres || {})).length;
  const resultats = toutes
    .filter((c) => cibleCorrespond(c, pr.criteres || {}))
    .map((c) => {
      const suivi = suivis.get(c.id);
      const pour = visibles.filter((d) => correspond({ ...c, ville: v.nom }, d)).map((d) => demandeAnonyme(d, visibles.indexOf(d)).reference);
      return {
        cible_id: c.id, enseigne: c.enseigne || null, activite: c.activite || null, adresse: c.adresse || null, rue: c.rue || null,
        emplacement: c.emplacement ?? null, proprietaire: c.proprietaire?.nom || null, pour,
        lat: c.lat ?? null, lon: c.lon ?? null,
        statut: suivi
          ? suivi.mandataire_email === moi(user) ? { cle: 'ma_liste', mot: 'Dans une liste' } : { cle: 'pris', mot: 'Suivi par un autre mandataire' }
          : c.deal_id ? { cle: 'klocka', mot: 'En discussion avec Klocka' } : { cle: 'nouveau', mot: 'Nouveau' },
      };
    })
    .sort((a, b) => (a.emplacement ?? 9) - (b.emplacement ?? 9) || b.pour.length - a.pour.length);
  if (resultats.length !== pr.trouves) Records.update('ProspectionMandataire', pr.id, { trouves: resultats.length });
  const p = v.parcours || {};
  return {
    ok: true,
    prospection: { id: pr.id, nom: pr.nom, criteres: pr.criteres, cree_le: pr.cree_le },
    ville: { id: v.id, nom: v.nom, centre: v.centre || null, rues: sansRues ? undefined : (v.rues || []).map(({ nom, classe, trace, centre, commerces, retenue }) => ({ nom, classe, trace, centre, commerces, retenue })) },
    parcours: {
      etat: p.etat || null, phase: p.phase || null, rue_en_cours: p.rue_en_cours || null,
      rues_a_faire: p.rues_a_faire || [], rues_faites_noms: p.rues_faites_noms || [], rues_total: p.rues_total || 0, rues_faites: p.rues_faites || 0,
      commerces_trouves: p.commerces_trouves || 0, proprietaires_trouves: p.proprietaires_trouves || 0, balade: p.balade || null,
      dernier: (p.journal || []).slice(-1)[0]?.texte || null,
    },
    rues_a_lire: ruesALire(v, pr.criteres?.emplacement ?? null).length,
    ecartes,
    resultats,
  };
}

// Deux affinages qui se croisent sur la même prospection : le second
// écraserait le premier (lu avant, écrit après). Ils passent donc à la file.
const affinages = new Map();

/**
 * Affine une prospection ouverte par une phrase du chat : « ajoute les
 * assurances », « enlève les boulangeries », « seulement en n°1 ». La ville
 * ne change pas (une autre ville, c'est une autre prospection). Si
 * l'emplacement voulu a des rues pas encore lues, ALX les parcourt.
 */
export function affinerProspection(id, phrase, user, surEtape = () => {}) {
  const tour = (affinages.get(id) || Promise.resolve()).catch(() => {}).then(() => affiner(id, phrase, user, surEtape));
  affinages.set(id, tour);
  tour.finally(() => { if (affinages.get(id) === tour) affinages.delete(id); });
  return tour;
}

async function affiner(id, phrase, user, surEtape) {
  const pr = Records.get('ProspectionMandataire', id);
  if (!pr || pr.mandataire_email !== moi(user)) return { ok: false, error: 'Prospection introuvable.' };
  const v = pr.ville_id ? Records.get('Ville', pr.ville_id) : null;
  if (!v) return { ok: false, error: 'La ville de cette prospection a disparu.' };
  const avant = { activites: pr.criteres?.activites || (pr.criteres?.activite ? [pr.criteres.activite] : []), emplacement: pr.criteres?.emplacement ?? null };
  surEtape('Lecture de la demande');
  const { interpreterAffinage } = await import('./mandataire-recherche.js');
  const lu = await interpreterAffinage(phrase, avant);
  if (lu.autre_ville && norm(lu.autre_ville) !== norm(v.nom)) {
    return { ok: false, error: `Cette prospection porte sur ${v.nom}. Pour ${lu.autre_ville}, lancez une nouvelle prospection.` };
  }
  const criteres = { ...pr.criteres, activites: lu.activites, activite: lu.activites[0] || null, emplacement: lu.emplacement, ville: v.nom };
  const changements = [
    ...lu.activites.filter((a) => !avant.activites.includes(a)).map((a) => `+ ${a}`),
    ...avant.activites.filter((a) => !lu.activites.includes(a)).map((a) => `− ${a}`),
    ...(lu.emplacement !== avant.emplacement ? [lu.emplacement == null ? 'tous les emplacements' : `emplacement ${libelle(lu.emplacement)}`] : []),
  ];
  surEtape(changements.length ? `Compris : ${changements.join(' · ')}` : 'Rien à changer dans les critères');
  const nom = pr.demande_ids?.length > 1 ? pr.nom : await nomDe(criteres);
  const maj = Records.update('ProspectionMandataire', pr.id, { criteres, nom, affinee_le: new Date().toISOString() });
  await lireRuesManquantes(v, lu.emplacement, user, surEtape);
  const nouvelles = lu.activites.filter((a) => !avant.activites.includes(a));
  if (nouvelles.length) balayerActivites(v, nouvelles, { user, surEtape }).catch((e) => console.warn(`[mandataire] balayage : ${e?.message || e}`));
  return { ok: true, prospection: maj, changements };
}

/** Le bouton « Lire les rues restantes » : les rues de l'emplacement voulu pas encore parcourues. */
export async function lireLaSuite(id, user) {
  const pr = Records.get('ProspectionMandataire', id);
  if (!pr || pr.mandataire_email !== moi(user)) return { ok: false, error: 'Prospection introuvable.' };
  const v = pr.ville_id ? Records.get('Ville', pr.ville_id) : null;
  if (!v) return { ok: false, error: 'La ville de cette prospection a disparu.' };
  if (v.parcours?.etat === 'en_cours') return { ok: false, error: `ALX parcourt déjà ${v.nom}.` };
  const n = await lireRuesManquantes(v, pr.criteres?.emplacement ?? null, user, () => {});
  if (!n) return { ok: false, error: 'Toutes les rues de cet emplacement sont déjà lues.' };
  return { ok: true, rues: n };
}

// ---------------------------------------------------------------------------
// Les listes : ce qu'on garde d'une prospection, pour appeler.
// ---------------------------------------------------------------------------

/**
 * Pure : deux noms désignent-ils la même personne ? « Georges Lacroix »,
 * « LACROIX GEORGES » et « SCI LACROIX GEORGES » portent les mêmes mots,
 * civilités et formes juridiques mises à part.
 */
export function memePersonne(a, b) {
  const mots = (t) => new Set(norm(t).replace(/[^a-z0-9à-ÿ]+/g, ' ').split(' ')
    .filter((m) => m && !['m', 'mr', 'mme', 'monsieur', 'madame', 'sci', 'sarl', 'sas', 'sasu', 'eurl', 'selarl', 'snc', 'ei', 'scp'].includes(m)));
  const A = mots(a);
  const B = mots(b);
  if (!A.size || !B.size) return false;
  return A.size === B.size && [...A].every((m) => B.has(m));
}

/**
 * Pure : ce que la cible ALX apporte à la ligne du tableau d'une liste — le
 * propriétaire des murs, sa société, le gérant, l'effectif — sans répéter
 * trois fois la même personne. Quand la société et le gérant sont le
 * propriétaire lui-même, la société devient sa forme (« SCI », sinon « En
 * nom propre ») et l'âge du gérant remonte sur le propriétaire.
 */
export function colonnesDeCible(c) {
  if (!c) return null;
  const proprietaire = c.proprietaire?.nom || null;
  const g = (c.societe?.gerants || []).find((x) => !x.personne_morale) || (c.societe?.gerants || [])[0] || null;
  const societeNom = c.societe?.nom || null;
  const forme = c.societe?.forme || c.proprietaire?.forme || null;
  const societeHomonyme = proprietaire && societeNom && memePersonne(proprietaire, societeNom);
  const gerantHomonyme = g && proprietaire && memePersonne(g.nom, proprietaire);
  return {
    source: c.source || null,
    lat: c.lat ?? null,
    lon: c.lon ?? null,
    enseigne: c.enseigne || null,
    activite: c.activite || null,
    adresse: c.adresse || null,
    emplacement: c.emplacement ?? null,
    telephone: c.telephone || null,
    site: c.site || null,
    proprietaire,
    proprietaire_source: c.proprietaire?.source || null,
    proprietaire_siren: c.proprietaire?.siren || null,
    proprietaire_age: gerantHomonyme ? g.tranche_age || null : null,
    societe: c.societe ? {
      source: c.societe.source || null,
      siren: c.societe.siren || null,
      nom: societeHomonyme ? null : societeNom,
      forme,
      en_nom_propre: !!societeHomonyme && !['SCI', 'SARL', 'SAS', 'SASU', 'EURL', 'SNC'].includes(String(forme || '').toUpperCase()),
      effectif: c.societe.effectif || null,
      creation: c.societe.creation || null,
      siege_ville: c.societe.siege?.ville || null,
      siege_adresse: c.societe.siege?.adresse || null,
    } : null,
    gerant: g && !gerantHomonyme ? { nom: g.nom, tranche_age: g.tranche_age || null } : null,
    occupant_depuis: c.occupant?.depuis || null,
    proprietaire_occupant: !!c.proprietaire_occupant,
    proprietaire_cherche_le: c.proprietaire_cherche_le || null,
  };
}

// ---------------------------------------------------------------------------
// Les propriétaires manquants d'une liste : cherchés en fond, aux sources
// ouvertes (cadastre, personnes morales, annuaire) — rien d'IA, rien de payé.
// ---------------------------------------------------------------------------

const completions = new Set();
const SEPT_JOURS = 7 * 86400000;

/** Les fiches de la liste dont la cible n'a ni propriétaire ni lecture récente. */
function fichesSansProprietaire(listeId) {
  return Records.list('ProprietaireMandataire')
    .filter((p) => p.liste_id === listeId && p.cible_id)
    .map((p) => ({ p, c: Records.get('Cible', p.cible_id) }))
    .filter(({ c }) => c && !c.proprietaire?.nom && !c.foncier && !c.activite_exclue
      && !(c.proprietaire_cherche_le && Date.now() - Date.parse(c.proprietaire_cherche_le) < SEPT_JOURS));
}

/**
 * Le numéro (et le mail) du PROPRIÉTAIRE, pas du commerce. Dans l'ordre :
 * le propriétaire-occupant se joint par son commerce ; sinon l'annuaire des
 * particuliers (Pages Blanches : le nom du gérant à l'adresse du siège,
 * gratuit) ; sinon Apollo pour les gérants encore en activité (un crédit
 * par gérant, mémorisé 90 jours). Une fiche sans résultat n'est pas
 * retentée avant sept jours (apollo_cherche_le).
 */
async function poserContactProprietaire(ficheId) {
  const p = Records.get('ProprietaireMandataire', ficheId);
  if (!p || p.telephone) return;
  if (p.apollo_cherche_le && Date.now() - Date.parse(p.apollo_cherche_le) < SEPT_JOURS) return;
  const c = p.cible_id ? Records.get('Cible', p.cible_id) : null;
  if (!c?.proprietaire?.nom) return;
  // Un bailleur public (commune, office HLM, collectivité) s'appelle à son
  // standard, jamais au domicile de son directeur.
  if (/\b(commune|office public|ophlm|opac|departement|région|region|communaute|metropole|syndicat|etat|ville de)\b/i.test(norm(c.proprietaire.nom).replace(/-/g, ' '))) return;
  if (c.proprietaire_occupant && c.telephone) {
    Records.update('ProprietaireMandataire', p.id, { telephone: c.telephone, telephone_source: 'commerce (propriétaire-occupant)' });
    return;
  }
  // 1. Les Pages Blanches : chaque gérant personne physique, à l'adresse du
  //    siège (presque toujours son domicile) ; le propriétaire lui-même quand
  //    c'est une personne sans société. Le marqueur « déjà cherché » n'est
  //    posé qu'à la fin, et seulement si l'annuaire a pu répondre : un
  //    bridage passager ne gèle pas la fiche pour sept jours.
  const { numeroDuParticulier } = await import('./annuaire-particuliers.js');
  const { gerantsPersonnes } = await import('./alx/demarchage.js');
  const siege = c.societe?.siege?.adresse || null;
  const personnes = gerantsPersonnes(c.societe);
  if (!personnes.length && /^(m|mme|monsieur|madame)\b/i.test(c.proprietaire.nom)) {
    const mots = c.proprietaire.nom.replace(/^(m|mme|monsieur|madame)\.?\s+/i, '').split(/\s+/);
    personnes.push({ prenom: mots[0] || '', nom: mots.slice(1).join(' ') || mots[0] });
  }
  let annuaireEnPanne = false;
  for (const g of personnes.slice(0, 3)) {
    const adresse = siege || [c.adresse, c.ville].filter(Boolean).join(' ');
    let trouve = null;
    try {
      trouve = await numeroDuParticulier({ prenom: g.prenom, nom: g.nom, adresse });
    } catch (e) {
      annuaireEnPanne = true;
      console.warn(`[mandataire] annuaire (${g.prenom} ${g.nom}) : ${e?.message || e}`);
      break;
    }
    if (trouve) {
      Records.update('ProprietaireMandataire', p.id, {
        telephone: trouve.telephone,
        telephone_source: `${trouve.source} · ${[g.prenom, g.nom].filter(Boolean).join(' ')}`,
        adresse_proprietaire: trouve.adresse,
      });
      return;
    }
  }
  if (!annuaireEnPanne) Records.update('ProprietaireMandataire', p.id, { apollo_cherche_le: new Date().toISOString() });

  // 2. Apollo, pour les gérants encore en poste quelque part.
  const { contactDuProprietaire } = await import('./alx/demarchage.js');
  const contact = await contactDuProprietaire(c).catch(() => null);
  if (!contact) return;
  Records.update('ProprietaireMandataire', p.id, {
    ...(contact.telephone ? { telephone: contact.telephone, telephone_source: `Apollo · ${contact.gerant}` } : {}),
    ...(contact.email && !p.email ? { email: contact.email } : {}),
    contact_apollo: contact,
  });
}

/** Les fiches dont le propriétaire est connu mais sans numéro à lui. */
function fichesSansNumero(listeId) {
  return Records.list('ProprietaireMandataire')
    .filter((p) => p.liste_id === listeId && p.cible_id && !p.telephone
      && !(p.apollo_cherche_le && Date.now() - Date.parse(p.apollo_cherche_le) < SEPT_JOURS))
    .filter((p) => Records.get('Cible', p.cible_id)?.proprietaire?.nom);
}

/**
 * Cherche les propriétaires manquants d'une liste, en fond, une fiche après
 * l'autre. Rend tout de suite le nombre lancé ; la page se relit pendant que
 * les noms arrivent. Une adresse sans réponse n'est pas retentée avant sept
 * jours (proprietaire_cherche_le).
 */
export function completerProprietairesListe(listeId, user) {
  const l = Records.get('ListeMandataire', listeId);
  if (!l || l.mandataire_email !== moi(user)) return { ok: false, error: 'Liste introuvable.' };
  const aFaire = fichesSansProprietaire(listeId);
  const sansNumero = fichesSansNumero(listeId);
  if ((!aFaire.length && !sansNumero.length) || completions.has(listeId)) return { ok: true, lancees: 0 };
  completions.add(listeId);
  (async () => {
    const { trouverProprietaire } = await import('./alx/enrichir.js');
    for (const { p, c } of aFaire) {
      Records.update('Cible', c.id, { proprietaire_cherche_le: new Date().toISOString() });
      try {
        const r = await trouverProprietaire(c.id, { user });
        // Le nom trouvé remonte sur la fiche s'il n'y en avait pas.
        if (r?.cible?.proprietaire?.nom && !p.nom) Records.update('ProprietaireMandataire', p.id, { nom: r.cible.proprietaire.nom });
      } catch (e) {
        console.warn(`[mandataire] propriétaire introuvable (${p.commerce || c.adresse}) : ${e?.message || e}`);
      }
      await new Promise((f) => setTimeout(f, 400));
    }
    // Puis le numéro du propriétaire, pour toutes les fiches qui en manquent.
    for (const p of fichesSansNumero(listeId)) {
      await poserContactProprietaire(p.id).catch((e) => console.warn(`[mandataire] contact Apollo : ${e?.message || e}`));
      await new Promise((f) => setTimeout(f, 300));
    }
  })().catch(() => {}).finally(() => completions.delete(listeId));
  return { ok: true, lancees: aFaire.length + sansNumero.length };
}

export function mesListes(user) {
  const fiches = Records.list('ProprietaireMandataire').filter((p) => p.mandataire_email === moi(user));
  return Records.list('ListeMandataire')
    .filter((l) => l.mandataire_email === moi(user))
    .sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)))
    .map((l) => {
      const dedans = fiches
        .filter((p) => p.liste_id === l.id)
        .map((p) => ({ ...p, cible: colonnesDeCible(p.cible_id ? Records.get('Cible', p.cible_id) : null) }));
      const par = (s) => dedans.filter((p) => s.includes(p.statut)).length;
      return { id: l.id, nom: l.nom, suggeree: !!l.suggeree, cree_le: l.cree_le, total: dedans.length, a_appeler: par(['a_appeler']), contactes: par(['contacte', 'en_discussion']), rdv: par(['rdv_pris', 'mandat_signe']), fiches: dedans };
    });
}

/** Exporte des commerces cochés vers une liste, nouvelle (`nom`) ou existante (`liste_id`). */
export async function exporter({ liste_id = null, nom = null, prospection_id = null, cible_ids = [] }, user) {
  const { creerProprietaire } = await import('./mandataire-espace.js');
  let liste = liste_id ? Records.get('ListeMandataire', liste_id) : null;
  if (liste_id && (!liste || liste.mandataire_email !== moi(user))) return { ok: false, error: 'Liste introuvable.' };
  if (!liste) {
    if (!String(nom || '').trim()) return { ok: false, error: 'Donnez un nom à la liste.' };
    liste = Records.create('ListeMandataire', { mandataire_email: moi(user), nom: String(nom).trim().slice(0, 80), cree_le: new Date().toISOString() });
  }
  let ajoutes = 0;
  const refuses = [];
  const { pousserProspect } = await import('./mandataire-monday.js');
  for (const id of cible_ids || []) {
    const c = Records.get('Cible', id);
    if (!c) continue;
    const r = creerProprietaire({ cible_id: c.id, prospection_id, nom: c.proprietaire?.nom || null, commerce: c.enseigne || c.activite || null, activite: c.activite || null, ville: c.ville || null, adresse: c.adresse || null, telephone: c.murs_telephone || null }, user);
    if (!r.ok) { refuses.push(`${c.enseigne || c.adresse} : ${r.error}`); continue; }
    Records.update('ProprietaireMandataire', r.proprietaire.id, { liste_id: liste.id, ...(c.murs_telephone ? { telephone_source: c.murs_telephone_source || null, adresse_proprietaire: c.murs_adresse_proprietaire || null } : {}) });
    pousserProspect(Records.get('ProprietaireMandataire', r.proprietaire.id)).catch(() => {});
    ajoutes += 1;
  }
  if (ajoutes) completerProprietairesListe(liste.id, user);
  return { ok: true, liste: { id: liste.id, nom: liste.nom }, ajoutes, refuses };
}

export function renommerListe(id, nom, user) {
  const l = Records.get('ListeMandataire', id);
  if (!l || l.mandataire_email !== moi(user)) return { ok: false, error: 'Liste introuvable.' };
  if (!String(nom || '').trim()) return { ok: false, error: 'Un nom, même court.' };
  return { ok: true, liste: Records.update('ListeMandataire', id, { nom: String(nom).trim().slice(0, 80) }) };
}

/** Supprimer une liste : ses fiches restent (relances comprises), sans liste. */
export function supprimerListe(id, user) {
  const l = Records.get('ListeMandataire', id);
  if (!l || l.mandataire_email !== moi(user)) return { ok: false, error: 'Liste introuvable.' };
  for (const p of Records.list('ProprietaireMandataire').filter((x) => x.liste_id === id)) Records.update('ProprietaireMandataire', p.id, { liste_id: null });
  Records.delete('ListeMandataire', id);
  return { ok: true };
}
