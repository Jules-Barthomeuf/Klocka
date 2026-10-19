// Modifier un projet champ par champ, avec la source de chaque chiffre
// (14 oct. 2026, Jules : l'éditeur de projet avec AK à gauche, comme les
// présentations). Deux mains écrivent le même projet : l'éditeur (chaque
// retouche s'enregistre seule) et AK (« le loyer est trop bas, va chercher des
// chiffres plus cohérents »). Chacune n'envoie que ce qu'elle change : l'une
// n'écrase plus ce que l'autre vient d'écrire.
//
// Chaque changement d'AK porte sa source (Equimmox, Data-B, Figaro, le bail…)
// et sa raison, gardées dans Project.sources_champs : le mode Sources de
// l'éditeur les montre au survol. Une retouche à la main sans source efface la
// source d'AK de ce champ : le chiffre n'est plus le sien.

import { Records } from './db.js';

/** Les familles de champs qu'on peut modifier : les chiffres et leurs dates, jamais l'identité ni les accès. */
const PREFIXES = ['marche_', 'ville_', 'sim_', 'bail_', 'secteur_', 'loyer_', 'valeurs_forcees.', 'cases_forcees.', 'bail_analyse.'];
const CHAMPS = new Set([
  'surface_m2', 'surface_detail', 'detenu_depuis', 'derniere_vente_annee', 'derniere_vente_prix',
  'locataire_depuis', 'echeance_bail', 'activite_locataire', 'nom_locataire', 'profil_locataire',
  'quote_part_lot', 'charges_copropriete', 'provision_charges', 'taxe_fonciere_an', 'type_construction',
  'prix_acquisition', 'rendement_locatif', 'statut_bail', 'description_bien', 'description_ville', 'description_secteur',
  'adresse_complete', 'transactions_fonds', 'assemblees_generales',
  // La synthèse de l'analyse du bail (14 oct. 2026) : AK la corrige quand elle dit faux.
  'analyse_bail',
]);
const INTERDITS = new Set(['id', 'titre', 'client_email', 'client_emails', 'admins', 'admin_principal', 'conversation_id', 'sources_champs', 'champs_masques', 'photos', 'documents', 'fichiers_projet', 'journal_champs']);

// Les champs texte parmi les familles chiffrées : ils ne se convertissent pas en nombre.
const TEXTES = /^(marche_quartier_nom|ville_secteur_champ\d|sim_(mode_prix_net_vendeur|honoraires_agent_mode|commission_agent_type|fees_klocka_type|type_detention|type_revente|lien_google_sheets|fichier_excel|fichier_pdf)|bail_date_|bail_analyse\.|cases_forcees\.|valeurs_forcees\.|secteur_points|ville_points|loyer_source|analyse_bail|bail_type|bail_infos_importantes)/;
const BOOLEENS = /^sim_(loyer_soumis_tva|charges_refacturable|taxe_refacturable|pret_in_fine|commission_agent_active|commission_agent_inclus_fai|no_fees_klocka|loyer_revalorise_tva|mode_prix_net_vendeur)$/;

/** Pure : ce champ se modifie-t-il par l'éditeur ou par AK ? */
export function champModifiable(champ) {
  const c = String(champ || '');
  if (!c || INTERDITS.has(c.split('.')[0])) return false;
  return CHAMPS.has(c) || PREFIXES.some((p) => c.startsWith(p));
}

/** Pure : la valeur telle que le projet la range (nombre, booléen, texte). « 1 200,50 € » → 1200.5. */
export function valeurRangee(champ, valeur) {
  if (valeur == null || valeur === '') return valeur === '' && !TEXTES.test(champ) && !/^(surface_detail|activite_locataire|nom_locataire|profil_locataire|type_construction|statut_bail|description_|adresse_complete|echeance_bail|locataire_depuis|detenu_depuis)/.test(champ) ? null : valeur;
  if (BOOLEENS.test(champ)) return valeur === true || valeur === 'true' || valeur === 'oui' || valeur === 1;
  if (typeof valeur === 'object') return valeur;
  if (TEXTES.test(champ) || /^(surface_detail|activite_locataire|nom_locataire|profil_locataire|type_construction|statut_bail|description_|adresse_complete|echeance_bail|locataire_depuis|detenu_depuis)/.test(champ)) return String(valeur);
  if (typeof valeur === 'number') return valeur;
  const n = Number(String(valeur).replace(/[\s\u00a0\u202f€%]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : String(valeur);
}

/**
 * Pure : les clés d'un chemin pointé. Une case corrigée se range sous une clé plate « zone.id »
 * (cases_forcees["bail.loyer_signature"].valeur), comme l'écran l'écrit et le lit : découpée à chaque point,
 * la correction d'AK partait dans cases_forcees.bail.loyer_signature, que la page ne lit pas (19 oct. 2026).
 */
export function clesDuChemin(chemin) {
  const cles = String(chemin).split('.');
  return cles[0] === 'cases_forcees' && cles.length >= 3 ? ['cases_forcees', `${cles[1]}.${cles[2]}`, ...cles.slice(3)] : cles;
}

const lireChemin = (o, chemin) => clesDuChemin(chemin).reduce((x, k) => (x == null ? undefined : x[k]), o);

/** Pure : écrit une valeur par chemin pointé sans muter l'objet (« valeurs_forcees.prix_revient »). */
export function ecrireChemin(objet, chemin, valeur) {
  const cles = clesDuChemin(chemin);
  const copie = { ...objet };
  let o = copie;
  for (let i = 0; i < cles.length - 1; i++) {
    const s = o[cles[i]];
    o[cles[i]] = Array.isArray(s) ? [...s] : { ...(s && typeof s === 'object' ? s : {}) };
    o = o[cles[i]];
  }
  o[cles.at(-1)] = valeur;
  return copie;
}

/**
 * Pure : applique des changements à un projet, avec les règles de l'éditeur
 * (l'échéance rangée sous ses deux noms ; un loyer au m² fixe le loyer annuel
 * d'après la surface). Rend le projet modifié, ce qui a changé (avant, après)
 * et les sources à poser, ou une erreur sans rien appliquer.
 */
export function appliquer(projet, changements, { par = null, maintenant = new Date().toISOString(), editeur = false } = {}) {
  let p = { ...projet };
  const faits = [];
  const sources = { ...(projet.sources_champs || {}) };
  for (const ch of changements || []) {
    const champ = String(ch?.champ || '');
    // L'éditeur (un admin) enregistre tous ses champs tels qu'il les a mis en forme ; AK, seulement les chiffres.
    if (editeur ? !champ || ['id', 'sources_champs', 'journal_champs'].includes(champ.split('.')[0]) : !champModifiable(champ)) return { ok: false, error: `Champ non modifiable : ${champ || '(vide)'}.` };
    const valeur = editeur ? ch.valeur : valeurRangee(champ, ch.valeur);
    const avant = lireChemin(p, champ);
    p = ecrireChemin(p, champ, valeur);
    if (champ === 'echeance_bail' || champ === 'bail_date_echeance') p = { ...p, echeance_bail: valeur, bail_date_echeance: valeur };
    if (champ === 'loyer_m2_an') {
      const surface = Number(p.sim_surface) || Number(p.surface_m2) || 0;
      if (surface > 0 && Number(valeur) > 0) p = { ...p, sim_loyer_initial_ht: Math.round(Number(valeur) * surface) };
    }
    const source = String(ch.source || '').trim();
    if (source) sources[champ] = { source: source.slice(0, 200), lien: /^https?:\/\//i.test(String(ch.lien || '')) ? String(ch.lien).slice(0, 500) : null, raison: String(ch.raison || '').trim().slice(0, 400) || null, par, le: maintenant };
    else delete sources[champ];
    faits.push({ champ, avant: avant ?? null, apres: valeur ?? null, ...(source ? { source } : {}), ...(ch.raison ? { raison: String(ch.raison).slice(0, 400) } : {}) });
  }
  // Le journal des changements (14 oct. 2026) : il dit quels textes générés (synthèse du bail, présentation,
  // lettre d'intention) ont été écrits avant qu'un chiffre bouge. Les 80 derniers.
  const journal = [...(projet.journal_champs || []), ...faits.map((f) => ({ champ: f.champ, le: maintenant, par }))].slice(-80);
  return { ok: true, projet: { ...p, sources_champs: sources, journal_champs: journal }, faits };
}

/** Modifie le projet en base : seulement les champs touchés, et leurs sources. */
export function modifierChamps(projetId, changements, { par = null, editeur = false } = {}) {
  const projet = Records.get('Project', projetId);
  if (!projet) return { ok: false, error: 'Projet introuvable.' };
  if (!Array.isArray(changements) || !changements.length) return { ok: false, error: 'Aucun changement.' };
  const r = appliquer(projet, changements, { par, editeur });
  if (!r.ok) return r;
  const racines = new Set(changements.map((c) => String(c.champ).split('.')[0]));
  if (racines.has('echeance_bail') || racines.has('bail_date_echeance')) { racines.add('echeance_bail'); racines.add('bail_date_echeance'); }
  if (racines.has('loyer_m2_an')) racines.add('sim_loyer_initial_ht');
  const maj = Object.fromEntries([...racines].map((k) => [k, r.projet[k]]));
  maj.sources_champs = r.projet.sources_champs;
  maj.journal_champs = r.projet.journal_champs;
  Records.update('Project', projetId, maj);
  return { ok: true, faits: r.faits, projet: Records.get('Project', projetId) };
}
