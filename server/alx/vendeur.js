// Le vendeur d'un dossier : qui possède les murs, et pourquoi il vend.
//
// Un dossier de préanalyse est un local dont les murs sont à vendre. On en
// connaît l'adresse, parfois le locataire, le loyer, l'échéance du bail. ALX
// sait tout le reste sans crédit : le propriétaire chez Data Foncier, sa
// société et ses gérants dans l'annuaire (tranche d'âge seulement), ses
// événements au BODACC, la dernière vente du local dans DVF, le loyer de la
// rue déduit des ventes. Le moteur de signaux (classement.js) dit alors ce qui
// pousse ce propriétaire à vendre, et l'étude des vendeurs (etude-vendeurs.js)
// dit combien chaque raison est plus fréquente chez les vendeurs que chez les
// commerces qui ne vendent pas.
//
// Chaque dossier lu devient une observation : un vendeur réel, vu avant la
// vente, avec ses signaux. C'est ce qui nourrit l'étude, et donc la prédiction
// sur les commerces des rues prospectées. Quand l'agent a dit la vraie raison,
// l'équipe la note ; elle se compare aux signaux.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from '../db.js';
import { classer, REGLES } from './classement.js';
import { TRAITS, LIBELLES_TRAITS, vendeursConnus } from './etude-vendeurs.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
const ETUDE = path.join(ici, 'data', 'etude-vendeurs.json');
const JOURS = 30;
const maintenant = () => new Date().toISOString();

export const RAISONS_REELLES = [
  { cle: 'succession', mot: 'Succession, héritiers à mettre d\'accord' },
  { cle: 'retraite', mot: 'Départ à la retraite du bailleur' },
  { cle: 'arbitrage', mot: 'Arbitrage patrimonial, réemploi ailleurs' },
  { cle: 'liquidites', mot: 'Besoin de liquidités' },
  { cle: 'indivision', mot: 'Indivision, séparation, mésentente' },
  { cle: 'locataire', mot: 'Inquiétude sur le locataire ou le bail' },
  { cle: 'marchand', mot: 'Revente d\'un marchand de biens' },
  { cle: 'autre', mot: 'Autre raison' },
];

/** « 12 Rue d'Antibes, 06400 Cannes » et « 12 rue d Antibes Cannes » sont la même adresse. */
export const cleAdresse = (adresse) => String(adresse || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b\d{5}\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

const lireEtude = () => {
  try {
    return JSON.parse(fs.readFileSync(ETUDE, 'utf-8'));
  } catch {
    return null;
  }
};

const explicationDe = (cle) => [...(REGLES.signaux_forts || []), ...(REGLES.signaux_patients || []), ...(REGLES.drapeaux || [])].find((r) => r.cle === cle)?.detail || null;

/**
 * Les raisons de vendre, d'après une cible classée et l'étude des vendeurs.
 * Pure. Chaque raison porte son libellé, sa valeur, son explication, et ce
 * que l'étude en dit : la part des vendeurs qui la portent, celle des
 * témoins, et le rapport des deux (le « lift »).
 */
export function raisonsDe(cible, etude = null) {
  const lignes = Object.fromEntries((etude?.lignes || []).map((l) => [l.trait, l]));
  const avecEtude = (cle) => {
    const l = lignes[cle];
    return l ? { lift: l.lift, vendeurs_pct: l.vendeurs_pct, temoins_pct: l.temoins_pct } : {};
  };
  const signaux = [...(cible.signaux?.forts || []).map((s) => ({ ...s, famille: 'fort' })), ...(cible.signaux?.patients || []).map((s) => ({ ...s, famille: 'patient' }))]
    .map((s) => ({ cle: s.cle, famille: s.famille, libelle: s.libelle, valeur: s.valeur || null, source: s.source || null, detail: explicationDe(s.cle), ...avecEtude(s.cle) }));
  const drapeaux = (cible.drapeaux || []).filter((d) => d.effet !== 'information').map((d) => ({ cle: d.cle, famille: 'drapeau', libelle: d.libelle, valeur: d.valeur || null, detail: d.detail || null, effet: d.effet }));
  // Ce que l'étude ajoute : les traits plus fréquents chez les vendeurs, qui
  // ne sont pas déjà des signaux. Pas des règles, des constats.
  const deja = new Set(signaux.map((s) => s.cle));
  const traits = Object.entries(TRAITS)
    .filter(([cle]) => !deja.has(cle) && !/^pile_/.test(cle) && lignes[cle] && lignes[cle].lift != null && lignes[cle].lift >= 1.2)
    .filter(([, f]) => f(cible))
    .map(([cle]) => ({ cle, famille: 'etude', libelle: LIBELLES_TRAITS[cle] || cle, detail: null, ...avecEtude(cle) }));
  // Ce qui joue contre : des traits présents que l'étude trouve moins souvent chez les vendeurs.
  const contre = Object.entries(TRAITS)
    .filter(([cle]) => !/^pile_/.test(cle) && lignes[cle] && lignes[cle].lift != null && lignes[cle].lift <= 0.6)
    .filter(([, f]) => f(cible))
    .map(([cle]) => ({ cle, libelle: LIBELLES_TRAITS[cle] || (signaux.find((s) => s.cle === cle)?.libelle) || cle, ...avecEtude(cle) }));
  return { signaux, drapeaux, traits, contre };
}

/** La phrase du verdict, pour un propriétaire qui vend bel et bien. */
export function phraseDe(cible, raisons) {
  const n = raisons.signaux.length;
  if (cible.pile === 'ecartee') return `ALX l'aurait écarté : ${cible.motif}`;
  if (cible.pile === 'appeler') return `ALX l'aurait appelé : ${n > 1 ? 'des signaux forts' : 'un signal fort'} explique${n > 1 ? 'nt' : ''} que les murs se vendent maintenant.`;
  if (cible.pile === 'ecrire') return `ALX lui aurait écrit : ${n > 1 ? 'ses signaux sont patients' : 'son signal est patient'}, la vente vient de là.`;
  if (raisons.traits.length) return 'Aucun signal d\'ALX, mais l\'étude des vendeurs reconnaît ce profil : ce dossier lui apprend à mieux le voir.';
  return 'Aucun signal d\'ALX : un vendeur qu\'il n\'aurait pas vu venir. Cette observation lui apprend quelque chose.';
}

const derniere = (cle) => Records.filter('ObservationVendeur', { cle }).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0] || null;

/**
 * Le vendeur d'une adresse : propriétaire, société, gérants, événements,
 * mutation, classement, raisons. Lu une fois, gardé trente jours.
 */
export async function vendeurDe({ adresse, locataire = null, activite = null, bail_echeance = null, loyer_annuel = null, surface = null, dossier_id = null, forcer = false, user = null } = {}) {
  const texte = String(adresse || '').trim();
  if (!texte) throw new Error('Il faut une adresse.');
  if (!/^\d/.test(texte)) throw new Error("L'adresse n'a pas de numéro : impossible de désigner le bâtiment.");
  const cle = cleAdresse(texte);
  const gardee = derniere(cle);
  if (gardee && !forcer && Date.now() - Date.parse(gardee.le) < JOURS * 86400000) return { ...gardee, du_cache: true, etude: resumeEtude() };

  const { resoudreAdresse } = await import('../data-b.js');
  const ban = await resoudreAdresse(texte);
  if (!ban) throw new Error(`La Base Adresse Nationale ne connaît pas « ${texte} ».`);
  const ville = ban.ville || (texte.split(',').pop() || '').replace(/^\s*\d{5}\s*/, '').trim();

  // 1. Le propriétaire des murs, par les fichiers DGFiP.
  const { proprietairesDe } = await import('./foncier-ouvert.js');
  const occupant = locataire ? { nom: locataire, enseigne: locataire } : null;
  const f = await proprietairesDe(texte, { occupant, point: { lat: ban.lat, lon: ban.lon } });
  if (!f) throw new Error(`Aucune parcelle cadastrale sous « ${texte} ».`);
  const choix = f.choix;

  // 2. La société et ses gérants : l'annuaire complète le fichier.
  let societe = null;
  if (choix) {
    if (choix.siren) {
      try {
        const { societe: lire } = await import('./annuaire.js');
        const s = await lire({ siren: choix.siren });
        if (s) societe = { ...s, gerants: s.gerants?.length ? s.gerants : choix.gerants };
      } catch {
        societe = null;
      }
    }
    if (!societe) societe = { nom: choix.nom, siren: choix.siren, forme: choix.forme, creation: choix.creation, ape_libelle: choix.activite, gerants: choix.gerants, siege: { adresse: choix.adresse }, source: f.source };
  }

  // 3. Les événements de la société, au BODACC.
  let evenements = [];
  if (choix?.siren) {
    try {
      const { evenementsSociete } = await import('../bodacc.js');
      evenements = await evenementsSociete(choix.siren);
    } catch {
      evenements = [];
    }
  }

  // 4. La dernière vente du local, dans DVF : même parcelle, ou même numéro.
  let mutation = null;
  let dvf = null;
  try {
    const { ventesAutour } = await import('../dvf.js');
    const r = await ventesAutour(texte, { rayon: 40, user });
    if (r.ok) {
      dvf = { n: r.resultat?.n ?? 0, prix_m2: r.resultat?.prix_m2 || null, periode: r.resultat?.periode || null };
      const ventes = r.resultat?.ventes || [];
      const numero = (texte.match(/^(\d+)\s*(bis|ter)?/i) || []).slice(1).filter(Boolean).join('').toLowerCase() || null;
      const duLocal = ventes.find((v) => (f.parcelle && v.parcelle === f.parcelle) || (numero && v.numero === numero)) || null;
      const proche = duLocal || ventes[0] || null;
      if (proche) mutation = { date: proche.date || null, prix: proche.prix ?? null, surface: proche.surface ?? null, distance_m: proche.distance_m ?? null, parcelle: proche.parcelle || null, du_local: !!duLocal, source: 'DVF' };
    }
  } catch {
    mutation = null;
  }

  // 5. Le loyer de la rue, déduit des ventes, pour lire un loyer en place sous le marché.
  let valorisation = {};
  try {
    const { loyerDeRue } = await import('../loyer-dvf.js');
    const vl = await loyerDeRue(texte, { user });
    const rue = vl.ok ? vl.resultat?.rue || null : null;
    if (rue?.basse != null && rue?.haute != null) valorisation = { loyer_m2_marche: (rue.basse + rue.haute) / 2, loyer_fourchette: [rue.basse, rue.haute], loyer_source: 'DVF, déduit' };
  } catch {
    valorisation = {};
  }
  const loyerBail = loyer_annuel > 0 && surface > 0 ? Math.round(loyer_annuel / surface) : null;

  // La cible telle qu'ALX la lirait, et son classement.
  const cible = {
    adresse: texte,
    ville,
    code_insee: ban.code_insee || null,
    enseigne: locataire || null,
    activite: activite || null,
    occupant: locataire ? { nom: locataire } : null,
    occupe: true,
    proprietaire_occupant: !!(choix && f.occupant_proprietaire),
    proprietaire: choix ? { nom: choix.nom, siren: choix.siren, forme: choix.forme || societe?.forme || null, parcelle: f.parcelle, lots: choix.lots, droit: (choix.lots || []).find((l) => l.rez_de_chaussee)?.droit || choix.lots?.[0]?.droit || choix.droit || null, source: f.source } : null,
    societe,
    evenements,
    mutation,
    dvf,
    bail_echeance: bail_echeance || null,
    loyer_m2_bail: loyerBail,
    valorisation,
  };
  const classement = classer(cible);
  Object.assign(cible, { pile: classement.pile, motif: classement.motif, signaux: classement.signaux, drapeaux: classement.drapeaux });
  const etude = lireEtude();
  const raisons = raisonsDe(cible, etude);
  const traits = Object.fromEntries(Object.entries(TRAITS).map(([k, fn]) => [k, !!fn(cible)]));

  const observation = {
    cle,
    adresse: texte,
    ville,
    code_insee: cible.code_insee,
    dossier_id: dossier_id || null,
    locataire: locataire || null,
    cible,
    pile: cible.pile,
    motif: cible.motif,
    phrase: phraseDe(cible, raisons),
    raisons,
    traits,
    foncier: {
      motif_choix: f.motif_choix,
      adresse_fiche: f.adresse_fiche,
      adresse_non_confirmee: !!f.adresse_non_confirmee,
      confirmee_par: f.confirmee_par || null,
      surface_batiment: f.surface_batiment || null,
      surface_parcelle: f.surface_parcelle || null,
      // Les autres propriétaires de l'immeuble : sans données personnelles au-delà du nom et de la forme.
      autres: (f.proprietaires || []).filter((p) => p !== choix).map((p) => ({ nom: p.nom, siren: p.siren, forme: p.forme, rez_de_chaussee: p.rez_de_chaussee, lots: (p.lots || []).length, activite: p.activite || null })),
    },
    raison_reelle: gardee?.raison_reelle || null,
    le: maintenant(),
    par: user?.email || null,
  };
  const ecrit = Records.create('ObservationVendeur', observation, user?.email);
  return { ...ecrit, du_cache: false, etude: resumeEtude() };
}

/** Où en est l'étude : combien de vendeurs elle connaît, d'où, et quand elle a été calculée. */
export function resumeEtude() {
  const e = lireEtude();
  const connus = vendeursConnus();
  return { le: e?.le || null, vendeurs: e?.vendeurs ?? null, temoins: e?.temoins ?? null, projets: connus.projets, dossiers: connus.dossiers };
}

/** L'équipe note la vraie raison, quand l'agent l'a dite : elle se comparera aux signaux. */
export function poserRaisonReelle(id, { raison_cle, raison = null, user = null } = {}) {
  const o = Records.get('ObservationVendeur', id);
  if (!o) return { ok: false, error: 'Observation introuvable.' };
  const r = RAISONS_REELLES.find((x) => x.cle === raison_cle);
  if (!r) return { ok: false, error: 'Une raison parmi la liste.' };
  const raison_reelle = { cle: r.cle, mot: r.mot, detail: raison || null, par: user?.email || null, le: maintenant() };
  // Toutes les lectures de la même adresse portent la raison : elle ne dépend pas de la lecture.
  for (const x of Records.filter('ObservationVendeur', { cle: o.cle })) Records.update('ObservationVendeur', x.id, { raison_reelle });
  return { ok: true, observation: Records.get('ObservationVendeur', id) };
}
