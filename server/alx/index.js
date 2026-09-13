// ALX, la prospection off-market : la couche de données et les gestes.
//
// Trois entités, toutes réservées à l'équipe par construction (elles ne sont
// pas dans la liste blanche des clients, donc fermées) :
//   Ville     une ville en cours, avec ses rues classées en emplacement 1 ou 2
//   Cible     un local commercial, de la devanture au propriétaire, avec sa pile
//   Approche  chaque tentative de contact, chaque réponse, chaque refus daté
//
// Ce module ne parle à aucune source externe. Les connecteurs (annuaire des
// entreprises, Street View, BODACC, DVF) posent leurs résultats sur la cible ; classer() relit la
// cible et décide de la pile. Le moteur est dans classement.js.

import { randomUUID } from 'crypto';
import { Records } from '../db.js';
import { classer, PILES } from './classement.js';
import { categoriserActivite } from '../deal/enrich.js';

const maintenant = () => new Date().toISOString();

/** Ce qui est branché, pour que l'écran dise quoi attendre plutôt que d'échouer. */
export async function etatDesOutils() {
  const { clientsConfigure, clientsActifs } = await import('./clients.js');
  const monday = clientsConfigure();
  return {
    street_view: !!(process.env.GOOGLE_MAPS_SERVEUR || '').trim(),
    data_b: !!(process.env.DATAB_EMAIL || '').trim(),
    monday,
    // Combien de clients actifs on cherche pour, dès l'état : c'est la
    // première chose qu'on veut voir en ouvrant ALX.
    clients_actifs: monday ? (await clientsActifs()).length : null,
    modele: !!((process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || '').trim()),
  };
}

// ---------------------------------------------------------------------------
// Villes
// ---------------------------------------------------------------------------

export function listerVilles() {
  return Records.list('Ville', { sort: '-created_date' }).map((v) => ({
    ...v,
    cibles: compterParPile(v.id),
    // Combien de cibles par rue, pour l'afficher sans un aller-retour de plus.
    cibles_par_rue: comptesParRue(v.id),
  }));
}

function comptesParRue(villeId) {
  const out = {};
  for (const c of Records.filter('Cible', { ville_id: villeId })) {
    if (c.rue) out[c.rue] = (out[c.rue] || 0) + 1;
  }
  return out;
}

export function obtenirVille(id) {
  const v = Records.get('Ville', id);
  return v ? { ...v, cibles: compterParPile(v.id) } : null;
}

export function creerVille({ nom, code_postal = null, user = null }) {
  const propre = String(nom || '').trim();
  if (!propre) return { ok: false, error: 'Le nom de la ville manque.' };
  const existante = Records.list('Ville').find((v) => v.nom.toLowerCase() === propre.toLowerCase());
  if (existante) return { ok: true, ville: existante, deja: true };
  const ville = Records.create(
    'Ville',
    {
      nom: propre,
      code_postal: code_postal ? String(code_postal).trim() : null,
      etat: 'active',
      // Les rues, classées par ALX ou à la main : { nom, classe: 1|2, motif, par, le }
      rues: [],
      cree_le: maintenant(),
      cree_par: user?.email || null,
    },
    user?.email
  );
  return { ok: true, ville };
}

/** Pose ou corrige le classement d'une rue. classe = 1 (solide) ou 2 (petit budget). */
export function classerRue(villeId, { nom, classe, motif = null, user = null }) {
  const ville = Records.get('Ville', villeId);
  if (!ville) return { ok: false, error: 'Ville introuvable.' };
  const propre = String(nom || '').trim();
  const c = Number(classe);
  if (!propre || ![1, 2].includes(c)) return { ok: false, error: 'Une rue et une classe (1 ou 2).' };
  const existante = (ville.rues || []).find((r) => r.nom.toLowerCase() === propre.toLowerCase());
  const rues = (ville.rues || []).filter((r) => r.nom.toLowerCase() !== propre.toLowerCase());
  // Ce qu'ALX savait de la rue (commerces, loyer) reste ; la classe et l'auteur changent.
  rues.push({ ...(existante || {}), nom: propre, classe: c, motif: motif || existante?.motif || null, par: user?.email || 'alx', le: maintenant() });
  rues.sort((a, b) => a.classe - b.classe || (b.commerces || 0) - (a.commerces || 0) || a.nom.localeCompare(b.nom));
  const rues_retirees = (ville.rues_retirees || []).filter((r) => r.nom.toLowerCase() !== propre.toLowerCase());
  const rues_ecartees = (ville.rues_ecartees || []).filter((r) => r.nom.toLowerCase() !== propre.toLowerCase());
  return { ok: true, ville: Records.update('Ville', villeId, { rues, rues_retirees, rues_ecartees }) };
}

export function retirerRue(villeId, nom, user = null) {
  const ville = Records.get('Ville', villeId);
  if (!ville) return { ok: false, error: 'Ville introuvable.' };
  const propre = String(nom || '').trim();
  const rues = (ville.rues || []).filter((r) => r.nom.toLowerCase() !== propre.toLowerCase());
  // Le retrait est une décision : le recensement suivant ne repropose pas la rue.
  const rues_retirees = [...(ville.rues_retirees || []).filter((r) => r.nom.toLowerCase() !== propre.toLowerCase()), { nom: propre, par: user?.email || null, le: maintenant() }];
  return { ok: true, ville: Records.update('Ville', villeId, { rues, rues_retirees }) };
}

function compterParPile(villeId) {
  const out = Object.fromEntries(PILES.map((p) => [p, 0]));
  for (const c of Records.filter('Cible', { ville_id: villeId })) out[c.pile || 'surveiller'] += 1;
  out.total = Object.values(out).reduce((a, b) => a + b, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Cibles
// ---------------------------------------------------------------------------

/** La liste, filtrée par ville et par pile, la prochaine action en premier. */
export function listerCibles({ ville_id = null, pile = null } = {}) {
  let liste = Records.list('Cible', { sort: '-updated_date' });
  if (ville_id) liste = liste.filter((c) => c.ville_id === ville_id);
  if (pile) liste = liste.filter((c) => (c.pile || 'surveiller') === pile);
  const ordre = { appeler: 0, ecrire: 1, surveiller: 2, ecartee: 3 };
  return liste.sort((a, b) => (ordre[a.pile] ?? 2) - (ordre[b.pile] ?? 2) || String(a.prochaine_action_le || '9').localeCompare(String(b.prochaine_action_le || '9')));
}

export function obtenirCible(id) {
  const c = Records.get('Cible', id);
  if (!c) return null;
  return { ...c, approches: Records.filter('Approche', { cible_id: id }, { sort: '-le' }) };
}

/**
 * Crée une cible, à la main ou depuis un passage de rue. L'activité est
 * catégorisée tout de suite avec le référentiel de la préanalyse : une
 * activité exclue ne va pas plus loin.
 */
export function creerCible({ ville_id, rue = null, adresse, enseigne = null, activite = null, user = null, ...reste }) {
  const ville = ville_id ? Records.get('Ville', ville_id) : null;
  if (!ville) return { ok: false, error: 'La ville manque.' };
  const adr = String(adresse || '').trim();
  if (!adr) return { ok: false, error: "L'adresse manque." };
  // Le même commerce ne rentre pas deux fois : par SIRET quand on l'a (le
  // parcours), sinon par adresse et enseigne (la saisie à la main).
  const siret = reste.siret ? String(reste.siret) : null;
  const ens = String(enseigne || '').trim().toLowerCase();
  const doublon = Records.filter('Cible', { ville_id }).find((c) =>
    siret ? c.siret === siret : c.adresse.toLowerCase() === adr.toLowerCase() && String(c.enseigne || '').toLowerCase() === ens
  );
  if (doublon) return { ok: true, cible: doublon, deja: true };

  const cat = categoriserActivite(activite, enseigne);
  const rueClassee = (ville.rues || []).find((r) => rue && r.nom.toLowerCase() === String(rue).toLowerCase());
  const base = {
    ville_id,
    ville: ville.nom,
    rue: rue ? String(rue).trim() : null,
    emplacement: rueClassee?.classe || null,
    adresse: adr,
    enseigne: enseigne ? String(enseigne).trim() : null,
    activite: activite ? String(activite).trim() : null,
    categorie_activite: cat.code,
    activite_exclue: cat.exclue,
    occupe: reste.occupe ?? true,
    // Ce que les connecteurs remplissent, ou la main.
    photo: null, //  { url, date, lecture: { enseigne, activite, etat, terrasse }, validee_par, validee_le }
    proprietaire: null, //  { nom, forme, siren, parcelle, droit, source, trouve_le }
    societe: null, //  { ape, creation, gerants: [{ nom, tranche_age }], siege, comptes_deposes, autres_biens: [], linkedin: [] }
    evenements: [], //  [{ date, type, detail, source }]
    mutation: null, //  { date, prix, nature, nombre_lots }
    bail_echeance: null,
    loyer_m2_bail: null,
    valorisation: null, //  { surface, surface_source, loyer_m2_marche, loyer_source, fourchette: [bas, haut], taux }
    signaux: null,
    drapeaux: [],
    knock_outs: [],
    pile: 'surveiller',
    motif: null,
    prochaine_action: null,
    prochaine_action_le: null,
    deal_id: null,
    cree_le: maintenant(),
    cree_par: user?.email || null,
    ...reste,
  };
  const cible = Records.create('Cible', base, user?.email);
  return { ok: true, cible: reclasser(cible.id) };
}

/** Une mise à jour libre (saisie manuelle, résultat de connecteur), puis reclassement. */
export function mettreAJourCible(id, patch = {}, user = null) {
  const c = Records.get('Cible', id);
  if (!c) return { ok: false, error: 'Cible introuvable.' };
  const { id: _id, ville_id: _v, pile: _p, motif: _m, signaux: _s, ...propre } = patch;
  if ('activite' in propre || 'enseigne' in propre) {
    const cat = categoriserActivite(propre.activite ?? c.activite, propre.enseigne ?? c.enseigne);
    propre.categorie_activite = cat.code;
    propre.activite_exclue = cat.exclue;
  }
  Records.update('Cible', id, { ...propre, modifie_par: user?.email || null });
  return { ok: true, cible: reclasser(id) };
}

/** Relit la cible et pose sa pile. Appelé après chaque enrichissement. */
export function reclasser(id) {
  const c = Records.get('Cible', id);
  if (!c) return null;
  const r = classer(c);
  return Records.update('Cible', id, {
    pile: r.pile,
    motif: r.motif,
    signaux: r.signaux,
    drapeaux: r.drapeaux,
    knock_outs: r.knock_outs,
    classee_le: maintenant(),
  });
}

export function supprimerCible(id) {
  for (const a of Records.filter('Approche', { cible_id: id })) Records.delete('Approche', a.id);
  Records.delete('Cible', id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Approches
// ---------------------------------------------------------------------------

export const CANAUX = ['mail', 'courrier', 'appel'];
export const ISSUES = ['sans_reponse', 'oui', 'non', 'plus_tard'];

/**
 * Enregistre une approche. Un mail envoyé, un courrier posté, un appel passé :
 * chacun avec sa date, son message, et la relance qu'il ouvre.
 */
export function enregistrerApproche({ cible_id, canal, message = null, destinataire = null, relance_le = null, user = null }) {
  const c = Records.get('Cible', cible_id);
  if (!c) return { ok: false, error: 'Cible introuvable.' };
  if (!CANAUX.includes(canal)) return { ok: false, error: `Canal inconnu : ${canal}.` };
  const approche = Records.create(
    'Approche',
    {
      cible_id,
      adresse: c.adresse,
      canal,
      le: maintenant(),
      par: user?.email || null,
      message,
      destinataire,
      issue: 'sans_reponse',
      reponse: null,
      reponse_le: null,
      motif_refus: null,
      // Mail pro : on rappelle à J+4. Courrier patrimonial : six mois.
      relance_le: relance_le || new Date(Date.now() + (canal === 'courrier' ? 182 : 4) * 86400000).toISOString(),
    },
    user?.email
  );
  Records.update('Cible', cible_id, {
    derniere_approche_le: approche.le,
    prochaine_action: canal === 'courrier' ? 'Relancer' : 'Rappeler',
    prochaine_action_le: approche.relance_le,
  });
  return { ok: true, approche };
}

/** La réponse à une approche : oui, non, plus tard, avec le motif d'un refus. */
export function qualifierApproche(id, { issue, reponse = null, motif_refus = null, relance_le = null, user = null }) {
  const a = Records.get('Approche', id);
  if (!a) return { ok: false, error: 'Approche introuvable.' };
  if (!ISSUES.includes(issue)) return { ok: false, error: `Issue inconnue : ${issue}.` };
  const maj = Records.update('Approche', id, {
    issue,
    reponse,
    reponse_le: maintenant(),
    motif_refus: issue === 'non' ? motif_refus : null,
    // Un refus se relance dans un an, un « plus tard » dans six mois, un oui
    // devient un appel à passer cette semaine.
    relance_le: relance_le || (issue === 'non' ? dansJours(365) : issue === 'plus_tard' ? dansJours(182) : issue === 'oui' ? dansJours(3) : a.relance_le),
    qualifie_par: user?.email || null,
  });
  Records.update('Cible', a.cible_id, {
    prochaine_action: issue === 'oui' ? 'Appeler : obtenir le bail et les quittances' : issue === 'non' ? 'Relance annuelle' : issue === 'plus_tard' ? 'Relancer' : 'Rappeler',
    prochaine_action_le: maj.relance_le,
  });
  return { ok: true, approche: maj };
}

const dansJours = (n) => new Date(Date.now() + n * 86400000).toISOString();

// ---------------------------------------------------------------------------
// Le passage en dossier
// ---------------------------------------------------------------------------

/**
 * Le bail est arrivé : la cible devient un dossier à l'étape 1 du pipeline.
 * Les valeurs estimées y entrent comme telles ; l'extraction les remplacera.
 */
export async function creerDossierDepuisCible(id, user = null) {
  const c = Records.get('Cible', id);
  if (!c) return { ok: false, error: 'Cible introuvable.' };
  if (c.deal_id) return { ok: true, deal_id: c.deal_id, deja: true };
  const { creerCoquille } = await import('../deal/index.js');
  const nom = [c.enseigne, c.adresse].filter(Boolean).join(' - ') || c.adresse;
  const dossier = creerCoquille({
    nom,
    user,
    apercu: {
      provenance: 'alx',
      cible_id: id,
      adresse: c.adresse,
      enseigne: c.enseigne,
      proprietaire: c.proprietaire?.nom || null,
      valorisation: c.valorisation || null,
      // Tout ce qui vient d'ALX est une estimation, jamais une extraction.
      confiance: 'estime',
    },
  });
  Records.update('Cible', id, { deal_id: dossier.deal_id, prochaine_action: 'Dossier créé', prochaine_action_le: null });
  return { ok: true, deal_id: dossier.deal_id };
}

// ---------------------------------------------------------------------------
// Ce qui attend, et le bilan
// ---------------------------------------------------------------------------

/** Pour la tuile du tableau de bord : ce qu'il y a à faire cette semaine. */
export function aFaire() {
  const cibles = Records.list('Cible');
  const dans7 = dansJours(7);
  const approches = Records.list('Approche');
  return {
    a_appeler: cibles.filter((c) => c.pile === 'appeler' && !c.deal_id).length,
    a_ecrire: cibles.filter((c) => c.pile === 'ecrire' && !c.derniere_approche_le && !c.deal_id).length,
    relances_dues: approches.filter((a) => a.issue !== 'oui' && a.relance_le && a.relance_le <= dans7).length,
    reponses: approches.filter((a) => a.reponse_le && a.reponse_le >= dansJours(-7)).length,
    villes: Records.list('Ville').filter((v) => v.etat === 'active').length,
  };
}

/** Ce qui a marché : par pile, par rue, par canal, par signal. */
export function bilan() {
  const cibles = Records.list('Cible');
  const approches = Records.list('Approche');
  const parCible = Object.fromEntries(cibles.map((c) => [c.id, c]));
  const groupe = (liste, cle) => {
    const out = {};
    for (const x of liste) {
      const k = cle(x) || '(vide)';
      out[k] = out[k] || { total: 0, reponses: 0, oui: 0, non: 0 };
      out[k].total += 1;
      if (x.reponse_le) out[k].reponses += 1;
      if (x.issue === 'oui') out[k].oui += 1;
      if (x.issue === 'non') out[k].non += 1;
    }
    return Object.entries(out).map(([k, v]) => ({ cle: k, ...v })).sort((a, b) => b.total - a.total);
  };
  const delais = approches
    .filter((a) => a.reponse_le)
    .map((a) => Math.round((new Date(a.reponse_le) - new Date(a.le)) / 86400000))
    .sort((x, y) => x - y);
  const delaiMedian = delais.length ? delais[Math.floor(delais.length / 2)] : null;

  return {
    cibles: { total: cibles.length, par_pile: Object.fromEntries(PILES.map((p) => [p, cibles.filter((c) => c.pile === p).length])), en_dossier: cibles.filter((c) => c.deal_id).length },
    approches: {
      total: approches.length,
      reponses: approches.filter((a) => a.reponse_le).length,
      oui: approches.filter((a) => a.issue === 'oui').length,
      delai_median_jours: delaiMedian,
    },
    par_canal: groupe(approches, (a) => a.canal),
    par_rue: groupe(approches, (a) => parCible[a.cible_id]?.rue),
    par_signal: groupe(approches, (a) => parCible[a.cible_id]?.signaux?.forts?.[0]?.cle || parCible[a.cible_id]?.signaux?.patients?.[0]?.cle),
    motifs_refus: groupe(approches.filter((a) => a.issue === 'non'), (a) => a.motif_refus),
  };
}

export { PILES, randomUUID };
