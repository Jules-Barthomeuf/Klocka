// L'enrichissement d'une cible, geste par geste.
//
// Chaque fonction lit une source, rend la cible mise à jour et reclassée, ou
// jette. Les routes les appellent une à une sur un clic ; le parcours d'une
// ville (parcours.js) les enchaîne sur des centaines de cibles. Une seule
// écriture de chaque geste, pour que l'écran et l'automate fassent la même
// chose.

import { Records } from '../db.js';
import { mettreAJourCible } from './index.js';

const cibleOu = (id) => {
  const c = Records.get('Cible', id);
  if (!c) throw new Error('Cible introuvable.');
  return c;
};

const adresseComplete = (c) => [c.adresse, c.ville].filter(Boolean).join(', ');

/** Le propriétaire par Data Foncier, puis la société par l'annuaire, puis le classement. */
export async function trouverProprietaire(id, { siren = null, user = null } = {}) {
  const c = cibleOu(id);
  const { proprietairesDe } = await import('./foncier.js');
  const ville = Records.get('Ville', c.ville_id);
  if (!/^\d/.test(String(c.adresse || '').trim())) throw new Error("L'adresse n'a pas de numéro : impossible de désigner le bâtiment.");
  const texte = [c.adresse, c.code_postal || ville?.code_postal, c.ville].filter(Boolean).join(' ');
  const f = await proprietairesDe(texte, { occupant: c.occupant || null });
  // Un bâtiment dont le numéro ne concorde pas n'est pas le bon : on montre la liste, on ne retient personne.
  if (f && f.adresse_non_confirmee) { f.choix = null; f.motif_choix = `bâtiment non confirmé (fiche ${f.adresse_fiche || 'sans adresse'}) : à vérifier sur Data-B`; }
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
      source: 'Data-B · Foncier',
      trouve_le: f.lu_le,
    };
    // L'annuaire complète (APE, forme exacte, siège) : gratuit, on ne s'en prive pas.
    if (choix.siren) {
      try {
        const { societe } = await import('./annuaire.js');
        const s = await societe({ siren: choix.siren });
        if (s) patch.societe = { ...s, gerants: s.gerants?.length ? s.gerants : choix.gerants };
      } catch {
        // L'annuaire indisponible n'empêche pas de garder ce que Data-B a donné.
      }
    }
    if (!patch.societe) {
      patch.societe = { ...(c.societe || {}), nom: choix.nom, siren: choix.siren, forme: choix.forme, creation: choix.creation, ape_libelle: choix.activite, gerants: choix.gerants, siege: { adresse: choix.adresse }, source: 'Data-B · Foncier', lu_le: f.lu_le };
    }
  }
  return { ...mettreAJourCible(c.id, patch, user), foncier: f };
}

/**
 * Rejoue le choix du propriétaire sur une fiche Data-B déjà lue, sans
 * rappeler Data-B : quand les règles de choix s'affinent, les cibles en
 * attente en profitent au parcours suivant.
 */
export async function rechoisirProprietaire(id, { user = null } = {}) {
  const c = cibleOu(id);
  if (!c.foncier?.proprietaires?.length || c.proprietaire?.nom) return { ok: true, cible: c, inchangee: true };
  const { choisirProprietaire } = await import('./foncier.js');
  const { choix, motif, occupant_proprietaire = false } = choisirProprietaire(c.foncier.proprietaires, c.occupant || null);
  if (!choix) return { ok: true, cible: c, inchangee: true };
  const patch = {
    foncier: { ...c.foncier, choix, motif_choix: motif, occupant_proprietaire },
    proprietaire_occupant: occupant_proprietaire,
    proprietaire: { nom: choix.nom, siren: choix.siren, forme: choix.forme || null, parcelle: c.foncier.parcelle, lots: choix.lots, source: 'Data-B · Foncier', trouve_le: c.foncier.lu_le },
  };
  if (choix.siren) {
    try {
      const { societe } = await import('./annuaire.js');
      const s = await societe({ siren: choix.siren });
      if (s) patch.societe = { ...s, gerants: s.gerants?.length ? s.gerants : choix.gerants };
    } catch {
      // L'annuaire indisponible n'empêche pas de garder ce que Data-B a donné.
    }
  }
  if (!patch.societe) patch.societe = { nom: choix.nom, siren: choix.siren, forme: choix.forme, creation: choix.creation, ape_libelle: choix.activite, gerants: choix.gerants, siege: { adresse: choix.adresse }, source: 'Data-B · Foncier', lu_le: c.foncier.lu_le };
  return mettreAJourCible(c.id, patch, user);
}

/** La société par l'annuaire des entreprises, par SIREN ou par nom. */
export async function lireSociete(id, { siren = null, nom = null, user = null } = {}) {
  const c = cibleOu(id);
  const { societe } = await import('./annuaire.js');
  const s0 = siren || c.proprietaire?.siren || null;
  const n0 = nom || c.proprietaire?.nom || null;
  if (!s0 && !n0) throw new Error("Il faut un SIREN ou le nom du propriétaire (lu sur Data-B, ou saisi).");
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

/** Les événements BODACC de la société propriétaire (trois ans). */
export async function lireEvenements(id, { user = null } = {}) {
  const c = cibleOu(id);
  const siren = c.proprietaire?.siren || c.societe?.siren;
  if (!siren) throw new Error("Il faut le SIREN du propriétaire pour lire le BODACC.");
  const { evenementsSociete } = await import('../bodacc.js');
  const evenements = await evenementsSociete(siren);
  return mettreAJourCible(c.id, { evenements }, user);
}

/** La dernière vente autour de l'adresse, d'après DVF. */
export async function lireMutation(id, { rayon = 40, user = null } = {}) {
  const c = cibleOu(id);
  const { ventesAutour } = await import('../dvf.js');
  const r = await ventesAutour(adresseComplete(c), { rayon, user });
  if (!r.ok) throw new Error(r.error);
  const ventes = r.resultat?.ventes || r.resultat?.transactions || [];
  const proche = ventes[0] || null;
  const mutation = proche ? { date: proche.date || proche.date_mutation || null, prix: proche.prix ?? proche.valeur_fonciere ?? null, nature: proche.nature || null, distance_m: proche.distance_m ?? null, source: 'DVF' } : null;
  return mettreAJourCible(c.id, { mutation, dvf: r.resultat }, user);
}

/** Le loyer de marché de la rue, par Data-B, sur l'adresse de la cible. */
export async function lireLoyer(id, { user = null } = {}) {
  const c = cibleOu(id);
  const { valeurLocative } = await import('../data-b.js');
  const r = await valeurLocative(adresseComplete(c), { user });
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
    loyer_source: valeurLocative?.rue ? 'Data-B, rue' : 'Data-B, quartier',
    valeur_locative: valeurLocative,
  };
  return mettreAJourCible(c.id, { valorisation: v }, user);
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

/** La devanture par Street View, lue par le modèle. */
export async function lireDevanture(id, { user = null } = {}) {
  const c = cibleOu(id);
  const { lireDevanture: lire } = await import('./streetview.js');
  const r = await lire(adresseComplete(c));
  if (!r.ok) throw new Error(r.error);
  const lecture = r.photo.lecture || {};
  const patch = { photo: r.photo };
  if (!c.enseigne && lecture.enseigne) patch.enseigne = lecture.enseigne;
  if (!c.activite && lecture.activite) patch.activite = lecture.activite;
  if (lecture.occupe === false) patch.occupe = false;
  return mettreAJourCible(c.id, patch, user);
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
