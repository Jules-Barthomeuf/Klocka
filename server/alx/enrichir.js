// L'enrichissement d'une cible, geste par geste.
//
// Chaque fonction lit une source, rend la cible mise à jour et reclassée, ou
// jette. Les routes les appellent une à une sur un clic ; le parcours d'une
// ville (parcours.js) les enchaîne sur des centaines de cibles. Une seule
// écriture de chaque geste, pour que l'écran et l'automate fassent la même
// chose.

import { Records } from '../db.js';
import { mettreAJourCible } from './index.js';
import { surfaceCommerciale } from './batiment.js';

const cibleOu = (id) => {
  const c = Records.get('Cible', id);
  if (!c) throw new Error('Cible introuvable.');
  return c;
};

const adresseComplete = (c) => [c.adresse, c.ville].filter(Boolean).join(', ');

/** Le propriétaire par les fichiers DGFiP, puis la société par l'annuaire, puis le classement. */
export async function trouverProprietaire(id, { siren = null, user = null } = {}) {
  const c = cibleOu(id);
  const { proprietairesDe } = await import('./foncier-ouvert.js');
  const ville = Records.get('Ville', c.ville_id);
  const point = c.source === 'Google Maps' && c.lat != null && c.lon != null ? { lat: c.lat, lon: c.lon } : null;
  if (!point && !/^\d/.test(String(c.adresse || '').trim())) throw new Error("L'adresse n'a pas de numéro : impossible de désigner le bâtiment.");
  const texte = [c.adresse, c.code_postal || ville?.code_postal, c.ville].filter(Boolean).join(' ');
  const f = await proprietairesDe(texte, { occupant: c.occupant || null, point });
  if (!f) throw new Error(`La Base Adresse Nationale ne connaît pas « ${texte} ».`);

  // Le choix explicite de l'équipe, parmi la liste, prime sur l'automatique.
  const voulu = siren ? f.proprietaires.find((p) => p.siren === String(siren)) : null;
  const choix = voulu || f.choix;
  const patch = { foncier: f, proprietaire_occupant: !!(choix && f.occupant_proprietaire && !voulu) };
  if (choix) {
    patch.proprietaire = {
      ...(c.proprietaire || {}),
      nom: choix.nom,
      siren: choix.siren,
      forme: choix.forme || c.proprietaire?.forme || null,
      parcelle: f.parcelle,
      lots: choix.lots,
      source: f.source,
      trouve_le: f.lu_le,
    };
    // L'annuaire complète (APE, forme exacte, siège) : gratuit, on ne s'en prive pas.
    if (choix.siren) {
      try {
        const { societe } = await import('./annuaire.js');
        const s = await societe({ siren: choix.siren });
        if (s) patch.societe = { ...s, gerants: s.gerants?.length ? s.gerants : choix.gerants };
      } catch {
        // L'annuaire indisponible n'empêche pas de garder ce que le fichier a donné.
      }
    }
    if (!patch.societe) {
      patch.societe = { ...(c.societe || {}), nom: choix.nom, siren: choix.siren, forme: choix.forme, creation: choix.creation, ape_libelle: choix.activite, gerants: choix.gerants, siege: { adresse: choix.adresse }, source: f.source, lu_le: f.lu_le };
    }
  }
  return { ...mettreAJourCible(c.id, patch, user), foncier: f };
}

/**
 * Rejoue le choix du propriétaire sur une lecture déjà faite, sans rien
 * relire : quand les règles de choix s'affinent, les cibles en
 * attente en profitent au parcours suivant.
 */
export async function rechoisirProprietaire(id, { user = null } = {}) {
  const c = cibleOu(id);
  if (!c.foncier?.proprietaires?.length || c.proprietaire?.nom) return { ok: true, cible: c, inchangee: true };
  const { choisirProprietaire } = await import('./foncier-ouvert.js');
  const { choix, motif, occupant_proprietaire = false } = choisirProprietaire(c.foncier.proprietaires, c.occupant || null);
  if (!choix) return { ok: true, cible: c, inchangee: true };
  const patch = {
    foncier: { ...c.foncier, choix, motif_choix: motif, occupant_proprietaire },
    proprietaire_occupant: occupant_proprietaire,
    proprietaire: { nom: choix.nom, siren: choix.siren, forme: choix.forme || null, parcelle: c.foncier.parcelle, lots: choix.lots, source: c.foncier.source || 'DGFiP · locaux des personnes morales', trouve_le: c.foncier.lu_le },
  };
  if (choix.siren) {
    try {
      const { societe } = await import('./annuaire.js');
      const s = await societe({ siren: choix.siren });
      if (s) patch.societe = { ...s, gerants: s.gerants?.length ? s.gerants : choix.gerants };
    } catch {
      // L'annuaire indisponible n'empêche pas de garder ce que le fichier a donné.
    }
  }
  if (!patch.societe) patch.societe = { nom: choix.nom, siren: choix.siren, forme: choix.forme, creation: choix.creation, ape_libelle: choix.activite, gerants: choix.gerants, siege: { adresse: choix.adresse }, source: c.foncier.source || 'DGFiP · locaux des personnes morales', lu_le: c.foncier.lu_le };
  return mettreAJourCible(c.id, patch, user);
}

/** La société par l'annuaire des entreprises, par SIREN ou par nom. */
export async function lireSociete(id, { siren = null, nom = null, user = null } = {}) {
  const c = cibleOu(id);
  const { societe } = await import('./annuaire.js');
  const s0 = siren || c.proprietaire?.siren || null;
  const n0 = nom || c.proprietaire?.nom || null;
  if (!s0 && !n0) throw new Error("Il faut un SIREN ou le nom du propriétaire (lu au fichier DGFiP, ou saisi).");
  const ville = Records.get('Ville', c.ville_id);
  const s = await societe({ siren: s0, nom: n0, ville: c.ville, code_postal: ville?.code_postal || null });
  if (!s) {
    const e = new Error(`L'annuaire des entreprises ne trouve pas « ${n0 || s0} ».`);
    e.statut = 404;
    throw e;
  }
  const patch = { societe: s, proprietaire: { ...(c.proprietaire || {}), nom: c.proprietaire?.nom || s.nom, siren: s.siren, forme: s.forme, source: c.proprietaire?.source || 'Annuaire des entreprises' } };
  return mettreAJourCible(c.id, patch, user);
}

/**
 * Les événements BODACC de la société propriétaire (trois ans), et ceux du
 * locataire (dix-huit mois) : un exploitant en procédure ou radié fait un
 * bailleur qui vend dans l'année. Le SIREN du locataire vient de l'annuaire
 * (occupant) ou de son SIRET. Jamais deux fois la même société.
 */
export async function lireEvenements(id, { user = null } = {}) {
  const c = cibleOu(id);
  const siren = c.proprietaire?.siren || c.societe?.siren || null;
  const sirenLocataire = c.occupant?.siren || (c.siret ? String(c.siret).replace(/\s/g, '').slice(0, 9) : null);
  if (!siren && !sirenLocataire) throw new Error('Il faut le SIREN du propriétaire ou du locataire pour lire le BODACC.');
  const { evenementsSociete } = await import('../bodacc.js');
  const patch = {};
  if (siren) patch.evenements = await evenementsSociete(siren);
  if (sirenLocataire && sirenLocataire !== siren) {
    patch.evenements_locataire = (await evenementsSociete(sirenLocataire, { mois: 18 })).map((e) => ({ ...e, source: 'BODACC (locataire)' }));
  }
  return mettreAJourCible(c.id, patch, user);
}

/** La dernière vente autour de l'adresse, d'après DVF. */
/**
 * La mutation la plus récente d'un AUTRE lot de la parcelle : un appartement
 * du dessus, une cave, un autre commerce. La vente du local lui-même ne
 * compte pas ; un acte qui porte le local et d'autres lots non plus.
 */
async function mutationVoisine(c, parcelle, duLocal) {
  const ville = c.ville_id ? Records.get('Ville', c.ville_id) : null;
  const codeInsee = ville?.code_insee || null;
  if (!parcelle || !codeInsee) return null;
  const { mutationsDeLaParcelle } = await import('../dvf.js');
  const toutes = await mutationsDeLaParcelle(codeInsee, parcelle);
  const autre = toutes.find((m) => !(duLocal && m.id === duLocal.id) && !(duLocal && String(m.date) === String(duLocal.date)));
  if (!autre) return null;
  return { date: autre.date, type_local: autre.types[0] || null, types: autre.types, lots: autre.lots, prix: autre.prix, source: 'DVF (même parcelle)' };
}

export async function lireMutation(id, { rayon = 40, user = null, forcer = false } = {}) {
  const c = cibleOu(id);
  const { ventesAutour } = await import('../dvf.js');
  const r = await ventesAutour(adresseComplete(c), { rayon, user, forcer });
  if (!r.ok) throw new Error(r.error);
  const ventes = r.resultat?.ventes || r.resultat?.transactions || [];
  // La vente du local lui-même : même parcelle que le propriétaire lu sur
  // la fiche foncière, ou même numéro dans la rue. Sinon, la plus proche, à titre de repère.
  const parcelle = c.proprietaire?.parcelle || c.foncier?.parcelle || null;
  const numero = (String(c.adresse || '').match(/^(\d+)\s*(bis|ter)?/i) || []).slice(1).filter(Boolean).join('').toLowerCase() || null;
  const duLocal = ventes.find((v) => (parcelle && v.parcelle === parcelle) || (numero && v.numero === numero)) || null;
  const proche = duLocal || ventes[0] || null;
  const mutation = proche ? { date: proche.date || proche.date_mutation || null, prix: proche.prix ?? proche.valeur_fonciere ?? null, nature: proche.nature || null, distance_m: proche.distance_m ?? null, surface: proche.surface ?? null, parcelle: proche.parcelle || null, du_local: !!duLocal, source: 'DVF' } : null;
  const patch = { mutation, dvf: r.resultat };
  // Un autre lot de la même parcelle vendu récemment : DVF entier, pas
  // seulement les ventes commerciales. Sans parcelle ni code INSEE, on ne
  // devine pas.
  patch.mutation_voisine = await mutationVoisine(c, parcelle, duLocal).catch(() => null);
  // Une vente du local depuis moins de cinq ans, d'un seul lot : sa surface
  // est celle du commerce, et le prix se calcule.
  const recente = duLocal && duLocal.date && Date.now() - Date.parse(duLocal.date) < 5 * 365.25 * 86400000;
  if (recente && duLocal.surface > 0 && (duLocal.lots || 1) <= 2 && !(c.valorisation?.surface_source === 'saisie')) {
    // Plusieurs commerces au même numéro : la vente n'est celle que d'un seul.
    const voisins = Records.filter('Cible', { ville_id: c.ville_id }).filter((x) => x.id !== c.id && x.adresse === c.adresse && x.pile !== 'ecartee').length;
    patch.valorisation = {
      ...(c.valorisation || {}),
      surface: duLocal.surface,
      surface_source: `DVF, vente du ${String(duLocal.date).slice(0, 10)}${voisins ? ` (à confirmer : ${voisins + 1} commerces à ce numéro)` : ''}`,
      surface_a_confirmer: voisins > 0,
    };
  }
  const maj = mettreAJourCible(c.id, patch, user);
  const v = maj.cible?.valorisation || {};
  if (v.surface > 0 && v.loyer_m2_marche > 0 && !v.fourchette) return calculerPrix(c.id, { user });
  return maj;
}

/** Le loyer de marché de la rue, déduit des ventes DVF autour de l'adresse de la cible. */
export async function lireLoyer(id, { user = null } = {}) {
  const c = cibleOu(id);
  const { loyerDeRue } = await import('../loyer-dvf.js');
  const r = await loyerDeRue(adresseComplete(c), { user });
  if (!r.ok) throw new Error(r.error);
  return poserLoyer(c.id, r.resultat, user);
}

/**
 * Pose un loyer de rue déjà lu (le parcours le lit une fois par rue, pas une
 * fois par commerce) : la valorisation garde la fourchette et sa source.
 */
export function poserLoyer(id, valeurLocative, user = null) {
  const c = cibleOu(id);
  const rue = valeurLocative?.rue || valeurLocative?.quartier || {};
  const loyer = rue.basse != null && rue.haute != null ? (rue.basse + rue.haute) / 2 : null;
  const v = {
    ...(c.valorisation || {}),
    loyer_m2_marche: loyer,
    loyer_fourchette: [rue.basse ?? null, rue.haute ?? null],
    loyer_source: `${valeurLocative?.derive ? 'DVF, déduit' : 'Equimmox'}, ${valeurLocative?.rue ? 'rue' : 'quartier'}`,
    valeur_locative: valeurLocative,
  };
  const maj = mettreAJourCible(c.id, { valorisation: v }, user);
  if (v.surface > 0 && loyer > 0) return calculerPrix(c.id, { user });
  return maj;
}

/** La fourchette de prix : loyer × surface ÷ rendement, ± un point. */
export function calculerPrix(id, { surface = null, taux = null, user = null } = {}) {
  const c = cibleOu(id);
  const v = c.valorisation || {};
  const s = Number(surface ?? v.surface);
  const loyerM2 = Number(v.loyer_m2_marche);
  const t = Number(taux ?? v.taux ?? 7);
  if (!(s > 0) || !(loyerM2 > 0) || !(t > 1)) throw new Error('Il faut une surface, un loyer de marché et un rendement.');
  const loyerAnnuel = s * loyerM2;
  const bas = Math.round(loyerAnnuel / ((t + 1) / 100) / 1000) * 1000;
  const haut = Math.round(loyerAnnuel / ((t - 1) / 100) / 1000) * 1000;
  const alerte = c.mutation?.prix && haut <= c.mutation.prix * 1.05 ? 'Le haut de fourchette est au niveau du prix payé récemment : dossier probablement mort.' : null;
  return mettreAJourCible(
    c.id,
    { valorisation: { ...v, surface: s, surface_source: surface != null ? 'saisie' : v.surface_source || null, taux: t, loyer_annuel: Math.round(loyerAnnuel), fourchette: [bas, haut], alerte, calculee_le: new Date().toISOString() } },
    user
  );
}

// Une boutique de centre-ville fait entre sept et treize mètres de profondeur :
// faute de mieux, la largeur de vitrine lue sur la photo donne une surface, en
// tranche. C'est le dernier recours — voir estimerSurface ci-dessous.
const PROFONDEUR_M = [7, 13];

/**
 * La surface estimée d'un local, et d'où elle sort. Trois lectures, de la
 * meilleure à la moins bonne :
 *
 *   1. le bâtiment (OpenStreetMap) : l'emprise au sol est mesurée, pas
 *      supposée, et elle voit les deux façades d'un commerce d'angle ;
 *   2. le bâtiment croisé avec la vitrine lue : quand la vitrine est plus
 *      étroite que la façade, le local n'occupe qu'une part du bâtiment, et
 *      on prend cette part ;
 *   3. la vitrine seule, multipliée par une profondeur supposée.
 *
 * La troisième s'est trompée d'un ordre de grandeur sur les commerces
 * d'angle : une photo ne voit qu'une rue.
 */
export function estimerSurface(v = {}) {
  const b = v.batiment || null;
  const vitrine = Number(v.vitrine_m) > 0 ? Number(v.vitrine_m) : null;

  if (b?.emprise_m2 > 0) {
    const r = surfaceCommerciale({ emprise_m2: b.emprise_m2, facades: b.facades || [], commerces: b.commerces_dans_le_batiment || 1, vitrine_m: vitrine });
    if (r) {
      const facades = (b.facades || []).map((f) => `${f.longueur_m} m sur ${f.rue}`).join(' et ');
      const partage = vitrine
        ? `vitrine de ${vitrine} m sur ${b.facade_totale_m} m de façade`
        : b.commerces_dans_le_batiment > 1 ? `partagée entre ${b.commerces_dans_le_batiment} vitrines` : 'un seul commerce dans le bâtiment';
      return {
        surface_estimee: r.surface,
        estimee_source: vitrine ? 'batiment_et_vitrine' : 'batiment',
        estimee_detail: `${facades ? `Façade de ${facades}` : `Bâtiment de ${b.emprise_m2} m² au sol`} : une bande commerciale de ${r.bande_m2[0]} à ${r.bande_m2[1]} m², ${partage}.`,
      };
    }
  }

  if (vitrine) {
    // Un commerce d'angle a deux façades : sa profondeur est au moins la
    // seconde, et sa surface bien plus grande que ne le dit la première seule.
    const retour = v.angle ? Number(v.retour_m) || 0 : 0;
    return {
      surface_estimee: [Math.round(vitrine * Math.max(PROFONDEUR_M[0], retour)), Math.round(vitrine * Math.max(PROFONDEUR_M[1], retour))],
      estimee_source: 'vitrine',
      estimee_detail: `Vitrine de ${vitrine} m lue sur la photo${retour ? `, ${retour} m en retour` : ''}, profondeur supposée de ${PROFONDEUR_M[0]} à ${PROFONDEUR_M[1]} m. À confirmer : une photo ne voit qu'une rue.`,
    };
  }
  return null;
}

/** La fourchette de prix d'une surface estimée : loyer × surface ÷ rendement. */
function fourchetteEstimee(surface, v) {
  const loyerM2 = Number(v.loyer_m2_marche);
  const t = Number(v.taux ?? 7);
  if (!(loyerM2 > 0) || !surface) return null;
  return [Math.round((surface[0] * loyerM2) / ((t + 1) / 100) / 1000) * 1000, Math.round((surface[1] * loyerM2) / ((t - 1) / 100) / 1000) * 1000];
}

/**
 * Mesure le bâtiment du commerce sur OpenStreetMap et en déduit la surface.
 * `elements` évite l'appel réseau quand le parcours a déjà lu toute la rue.
 */
export async function mesurerLeBatiment(id, { elements = null, user = null } = {}) {
  const c = cibleOu(id);
  if (!(Number(c.lat) && Number(c.lon))) throw new Error("Ce commerce n'a pas de position : le bâtiment ne peut pas être mesuré.");
  const { mesurerBatiment } = await import('./batiment.js');
  const batiment = await mesurerBatiment({ lat: Number(c.lat), lon: Number(c.lon) }, { elements });
  if (!batiment) throw new Error('Aucun bâtiment dessiné autour de ce point sur OpenStreetMap.');
  const v = { ...(c.valorisation || {}), batiment };
  const e = estimerSurface(v);
  const patch = { valorisation: { ...v, ...(e || {}), fourchette_estimee: e ? fourchetteEstimee(e.surface_estimee, v) : v.fourchette_estimee || null, estimee_le: new Date().toISOString() } };
  return mettreAJourCible(c.id, patch, user);
}

/**
 * La devanture par Street View, lue par le modèle. Le point Maps du commerce
 * vaut mieux que l'adresse pour trouver la bonne photo. La largeur de vitrine
 * lue donne une surface estimée et, avec le loyer de la rue, une idée du prix,
 * gardées à part de la fourchette calculée sur une surface sûre.
 */
export async function lireDevanture(id, { user = null } = {}) {
  const c = cibleOu(id);
  const { lireDevanture: lire } = await import('./streetview.js');
  const r = await lire(c.lat != null && c.lon != null ? `${c.lat},${c.lon}` : adresseComplete(c));
  if (!r.ok) throw new Error(r.error);
  const lecture = r.photo.lecture || {};
  const patch = { photo: r.photo };
  if (!c.enseigne && lecture.enseigne) patch.enseigne = lecture.enseigne;
  if (!c.activite && lecture.activite) patch.activite = lecture.activite;
  if (lecture.occupe === false) patch.occupe = false;
  const vitrine = Number(lecture.vitrine_m);
  if (vitrine > 0) {
    const v = { ...(c.valorisation || {}), vitrine_m: vitrine, angle: !!lecture.angle, retour_m: (lecture.angle ? Number(lecture.retour_m) || 0 : 0) || null };
    // Le bâtiment, s'il a été mesuré, garde la main : la photo ne voit qu'une
    // rue, le polygone les voit toutes. La vitrine lue affine sa part.
    const e = estimerSurface(v);
    patch.valorisation = { ...v, ...(e || {}), fourchette_estimee: e ? fourchetteEstimee(e.surface_estimee, v) : null, estimee_le: new Date().toISOString() };
  }
  return mettreAJourCible(c.id, patch, user);
}

/**
 * Le point de vue Street View devant le commerce : le panorama Google le plus
 * proche et le cap qui regarde la vitrine. Sans modèle et sans image, les
 * seules métadonnées : c'est ce qui permet d'ouvrir une fiche directement
 * face au commerce au lieu d'un panorama pris au hasard, tourné vers le nord.
 * Gardé sur la cible : on ne le recalcule pas à chaque ouverture.
 */
export async function lireVue(id, { user = null, forcer = false } = {}) {
  const c = cibleOu(id);
  if (!forcer && c.vue?.pano) return { cible: c, du_cache: true };
  if (!(Number(c.lat) && Number(c.lon))) throw new Error("Ce commerce n'a pas de position : Street View ne peut pas le viser.");
  const { metadonnees } = await import('./streetview.js');
  const m = await metadonnees(`${c.lat},${c.lon}`);
  if (!m?.pano) throw new Error('Aucun panorama Street View devant ce commerce.');
  const vue = { pano: m.pano, cap: m.cap ?? null, lat: m.lat, lon: m.lon, date: m.date || null, google: m.google ?? null, lue_le: new Date().toISOString() };
  return mettreAJourCible(c.id, { vue }, user);
}

/** Un brouillon de premier message, gardé sur la cible en attendant la relecture. */
export async function redigerBrouillon(id, { canal = null, user = null } = {}) {
  const c = cibleOu(id);
  const { rediger } = await import('./message.js');
  // Un patrimonial ouvre ses lettres ; un professionnel lit ses mails.
  const choix = canal || (c.pile === 'appeler' ? 'mail' : 'courrier');
  const b = await rediger(c, choix, user);
  const brouillon = { ...b, redige_le: new Date().toISOString(), par: user?.email || null };
  Records.update('Cible', c.id, { brouillon });
  return { ok: true, cible: Records.get('Cible', c.id), brouillon };
}
