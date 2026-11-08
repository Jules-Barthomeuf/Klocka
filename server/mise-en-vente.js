// L'étape Mise en vente d'un bien, côté mandataire (7 nov. 2026, Jules : « la vente en six temps, et à chaque onglet
// la chose la plus importante à faire maintenant »). Préparer, Diffuser, Qualifier, Visiter, Offres, Offre acceptée :
// la phase se lit dans ce qui existe (annonces cochées en ligne, teasers envoyés, pistes du tableau des acquéreurs,
// visites, offres de Klocka et des pistes). Les conseils sont des règles, sans modèle : ils ne disent que ce que les
// fiches disent, et se taisent sur ce qu'aucune donnée ne mesure (pas de vues d'annonce, par exemple).
// Seule la recommandation au vendeur passe par le modèle, à la demande, et seulement sur les chiffres du rapport.

import { Records } from './db.js';
import { ligneDe, STATUTS } from './acquereurs-du-bien.js';
import { CANAUX } from './annonces-bien.js';
import { montant } from './montants.js';
import { caseVisible, consultationsDe, dossierDuMarche, lienDe, titreAnonyme } from './dataroom-acquereur.js';

const PISTE = 'PisteAcquereur';
const JOUR = 86400000;
const maintenant = () => new Date().toISOString();
const emailDe = (u) => String(u?.email || '').toLowerCase();
const texte = (v, max = 400) => (v == null ? null : String(v).trim().slice(0, max) || null);
const RANG = Object.fromEntries(STATUTS.map((s, i) => [s.cle, i]));
const actif = (x) => x.statut !== 'ecarte';
const auMoins = (x, cle) => actif(x) && RANG[x.statut] >= RANG[cle];
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }) : null);
const pluriel = (n, mot, pl = `${mot}s`) => `${n} ${n > 1 ? pl : mot}`;

export const PHASES = [
  { cle: 'preparer', mot: 'Préparer' },
  { cle: 'diffuser', mot: 'Diffuser' },
  { cle: 'qualifier', mot: 'Qualifier' },
  { cle: 'visiter', mot: 'Visiter' },
  { cle: 'offres', mot: 'Offres' },
  { cle: 'acceptee', mot: 'Offre acceptée' },
];

export const TYPES_ACQUEREUR = ['SCI', 'particulier', 'fonciere', 'societe', 'autre'];
export const TEMPERATURES = ['chaud', 'tiede', 'froid', 'sans_suite'];
const ETATS_DOC = ['signe', 'envoye', 'a_faire'];
const DOCS = ['confidentialite', 'bon_visite', 'offre', 'partage_honoraires'];

/** La source d'une piste → le canal d'annonce qui l'a amenée (Réseau : WhatsApp, Fichier : le mail aux acquéreurs). */
export const SOURCE_CANAL = { Leboncoin: 'leboncoin', SeLoger: 'portail', LinkedIn: 'linkedin', 'Réseau': 'whatsapp', Fichier: 'mail' };

// ---------------------------------------------------------------------------
// Ce qu'on lit d'une commercialisation
// ---------------------------------------------------------------------------

/** Pure : le prix demandé (le mandat, sinon le dossier), ou null. */
export function prixDemande(d, mandat) {
  const n = Number(mandat?.prix) || Number(d?.prix) || null;
  return n && n > 0 ? n : null;
}

/** La commercialisation et tout ce qui la décrit, pour le mandataire qui la lit. */
export async function contexteDe(marcheId, user) {
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m) return null;
  const d = dossierDuMarche(m);
  const mandat = d?.mandat_id ? Records.get('MandatMandataire', d.mandat_id) : null;
  const fiche = d ? P.ficheDuDossier(d) : null;
  const visites = Records.list('VisiteAcquereur').filter((v) => v.bien?.marche_id === m.id || (v.bien?.cles || []).includes(`marche:${m.id}`));
  const pistes = Records.list(PISTE).filter((x) => x.marche_id === m.id);
  const checklist = d ? P.checklist(d) : { lignes: [], manquantes: [] };
  return {
    m, d, mandat, fiche, visites, pistes, checklist,
    vu: P.marcheVuParMandataire(m),
    location: d ? P.transactionDuDossier(d) === 'location' : m.teaser?.classe === 'a_louer',
    prix: prixDemande(d, mandat),
  };
}

// ---------------------------------------------------------------------------
// Une piste lue de près : score, température, documents, historique
// ---------------------------------------------------------------------------

const POINTS_STATUT = { contact: 10, qualifie: 30, visite: 50, offre: 70, signe: 90, ecarte: 0 };

/** Pure : la dernière activité d'une piste (son historique, sinon sa mise à jour). */
export function derniereActivite(x) {
  const dates = [x.maj_le, x.cree_le, ...(x.historique || []).map((h) => h.le)].filter(Boolean).sort();
  return dates[dates.length - 1] || null;
}

/**
 * Pure : le score d'une piste, de 0 à 100. Où elle en est (10 à 90), son budget face au prix demandé (+20 à -15), et sa
 * fraîcheur (+10 dans les trois jours, -20 après six semaines sans rien). Un budget inconnu ne compte ni pour ni contre.
 */
export function scoreDe({ statut, budget = null, prix = null, derniere = null }, aujourdhui = Date.now()) {
  if (statut === 'ecarte') return 0;
  let s = POINTS_STATUT[statut] ?? 10;
  if (Number(budget) > 0 && Number(prix) > 0) {
    const r = Number(budget) / Number(prix);
    s += r >= 1 ? 20 : r >= 0.9 ? 12 : r >= 0.8 ? 5 : -15;
  }
  const jours = derniere ? (aujourdhui - Date.parse(derniere)) / JOUR : null;
  if (jours != null && Number.isFinite(jours)) s += jours <= 3 ? 10 : jours <= 7 ? 5 : jours <= 21 ? 0 : jours <= 45 ? -10 : -20;
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Pure : la température d'un score, sauf choix du mandataire ; une piste écartée est sans suite. */
export function temperatureDe(score, statut, manuelle = null) {
  if (statut === 'ecarte') return 'sans_suite';
  if (TEMPERATURES.includes(manuelle)) return manuelle;
  return score >= 60 ? 'chaud' : score >= 35 ? 'tiede' : 'froid';
}

/** Pure : la prochaine action dite, sinon celle qui suit d'ordinaire le statut. */
export function prochaineDe(x, ligne = {}) {
  if (x.statut === 'ecarte') return texte(x.note, 200) || 'Sans suite';
  if (x.prochaine) return x.prochaine;
  const v = ligne.visite;
  switch (x.statut) {
    case 'contact': return 'Qualifier : budget et financement';
    case 'qualifie': return 'Proposer une visite';
    case 'visite': return !v ? 'Fixer la date de visite' : v.bon !== 'signe' ? 'Faire signer le bon de visite' : 'Demander son retour après la visite';
    case 'offre': return x.financement ? "Présenter l'offre au vendeur" : 'Demander une preuve de financement';
    case 'signe': return 'Suivre le compromis';
    default: return null;
  }
}

/** Pure : l'état des quatre documents d'une piste ; le bon de visite se lit sur sa visite. */
export function documentsDe(x, ligne = {}) {
  const notes = x.documents || {};
  const v = ligne.visite;
  const bon = v ? (v.bon === 'signe' ? 'signe' : v.lien ? 'envoye' : 'a_faire') : notes.bon_visite || null;
  const offre = notes.offre || (Number(x.offre) > 0 ? 'a_faire' : null);
  return { confidentialite: notes.confidentialite || null, bon_visite: bon, offre, partage_honoraires: notes.partage_honoraires || null };
}

/** Pure : le canal d'une ligne d'historique, d'après ses mots (ou la source pour la première). */
export function canalDe(action, source = null) {
  const t = String(action || '').toLowerCase();
  if (/data room/.test(t)) return 'dataroom';
  if (/visite|bon de visite/.test(t)) return 'visite';
  if (/appel|rappel|t[ée]l[ée]phon/.test(t)) return 'appel';
  if (/mail|teaser/.test(t)) return 'mail';
  if (/leboncoin/.test(t)) return 'leboncoin';
  if (t === 'ajouté' && source === 'Leboncoin') return 'leboncoin';
  if (t === 'ajouté' && source === 'Fichier') return 'mail';
  return 'note';
}

const MOT_TYPE = { SCI: 'SCI', particulier: 'particulier', fonciere: 'foncière', societe: 'société', autre: null };

/** Pure : une phrase sur la piste : qui, où elle en est, ce qui la retient si on le sait. */
export function resumeDe(x, { prix = null, reserves = [] } = {}) {
  const qui = [x.nom || 'Contact', MOT_TYPE[x.type] ? `(${MOT_TYPE[x.type]})` : null].filter(Boolean).join(' ');
  const venu = x.source ? `, venu par ${x.source}` : '';
  const ou = {
    contact: 'nouveau contact, pas encore qualifié',
    qualifie: 'qualifié',
    visite: 'en visite',
    offre: Number(x.offre) > 0 ? `a fait une offre à ${montant(x.offre)}` : 'en offre',
    signe: 'a signé',
    ecarte: 'écarté',
  }[x.statut] || x.statut;
  const budget = x.statut !== 'offre' && Number(x.budget) > 0 ? `, budget ${montant(x.budget)}${prix && x.budget < prix ? ' (sous le prix demandé)' : ''}` : '';
  const frein = reserves.length ? ` Réserve : ${reserves.slice(0, 2).join(', ')}.`
    : x.statut === 'offre' && !x.financement ? ' Financement non renseigné.'
    : '';
  return `${qui}${venu} : ${ou}${budget}.${frein}`;
}

/** Une ligne du tableau, enrichie de ce que l'écran de la Mise en vente montre. */
export function pisteEnrichie(x, ctx, aujourdhui = Date.now()) {
  const ligne = ligneDe(x, ctx.visites);
  const derniere = derniereActivite(x);
  const score = scoreDe({ statut: x.statut, budget: x.budget, prix: ctx.prix, derniere }, aujourdhui);
  const visitesDe = ctx.visites.filter((v) => x.acquereur_id && v.acquereur?.acquereur_id === x.acquereur_id);
  const reserves = visitesDe.flatMap((v) => v.compte_rendu?.reserves || []).filter(Boolean);
  const historique = [...(x.historique || [])].map((h) => ({ ...h, canal: canalDe(h.action, x.source) })).sort((a, b) => String(b.le).localeCompare(String(a.le)));
  return {
    ...ligne,
    // Particulier par défaut (8 nov. 2026, Jules : « de base, mets particulier »).
    type: TYPES_ACQUEREUR.includes(x.type) ? x.type : 'particulier',
    financement: x.financement || null,
    structure: x.structure || null,
    criteres: x.criteres || null,
    temperature: temperatureDe(score, x.statut, x.temperature),
    temperature_manuelle: TEMPERATURES.includes(x.temperature) ? x.temperature : null,
    score,
    prochaine: prochaineDe(x, ligne),
    derniere_activite: derniere,
    documents: documentsDe(x, ligne),
    offre_detail: x.offre_detail || null,
    consultations: consultationsDe(x.id, ctx.d, ctx.checklist.lignes),
    resume: resumeDe(x, { prix: ctx.prix, reserves }),
    lien_dataroom: lienDe(x),
    historique,
  };
}

/** Le tableau des acquéreurs, ses lignes enrichies (même réponse qu'avant, avec des champs en plus). */
export async function tableauEnrichi(marcheId, user) {
  const A = await import('./acquereurs-du-bien.js');
  const t = await A.tableauDe(marcheId, user);
  if (!t.ok) return t;
  const ctx = await contexteDe(marcheId, user);
  const parId = new Map(ctx.pistes.map((x) => [x.id, x]));
  return { ...t, prix_demande: ctx.prix, lignes: t.lignes.map((l) => (parId.has(l.id) ? pisteEnrichie(parId.get(l.id), ctx) : l)) };
}

/** Pure : ce que la Mise en vente ajoute au patch d'une piste ; l'offre peut venir en détail. */
export function patchEnPlus(corps = {}) {
  const patch = {};
  if (corps.type !== undefined) {
    if (corps.type !== null && corps.type !== '' && !TYPES_ACQUEREUR.includes(corps.type)) return { error: 'Type inconnu.' };
    patch.type = corps.type || null;
  }
  for (const k of ['financement', 'structure', 'criteres']) if (corps[k] !== undefined) patch[k] = texte(corps[k], 600);
  if (corps.temperature !== undefined) {
    if (corps.temperature !== null && corps.temperature !== '' && !TEMPERATURES.includes(corps.temperature)) return { error: 'Température inconnue.' };
    patch.temperature = corps.temperature || null;
  }
  if (corps.documents !== undefined) {
    if (!corps.documents || typeof corps.documents !== 'object') return { error: 'Documents illisibles.' };
    const docs = {};
    for (const [k, v] of Object.entries(corps.documents)) {
      if (!DOCS.includes(k)) return { error: `Document inconnu : ${k}.` };
      if (v !== null && !ETATS_DOC.includes(v)) return { error: 'État de document inconnu.' };
      docs[k] = v;
    }
    patch.documents = docs;
  }
  return { patch };
}

/** Une piste modifiée : les champs de la Mise en vente ici, le reste par le tableau des acquéreurs. */
export async function modifierPiste(id, corps = {}, user) {
  const A = await import('./acquereurs-du-bien.js');
  const x = Records.get(PISTE, id);
  if (!x || (x.mandataire_email !== emailDe(user) && user?.role !== 'admin')) return { ok: false, error: 'Ligne introuvable.' };
  const { patch, error } = patchEnPlus(corps);
  if (error) return { ok: false, error };
  const reste = { ...corps };
  for (const k of ['type', 'financement', 'structure', 'criteres', 'temperature', 'documents']) delete reste[k];
  // L'offre en détail : { montant, conditions, le } ; le montant reste aussi la colonne Offre du tableau.
  if (reste.offre && typeof reste.offre === 'object') {
    const o = reste.offre;
    const montantDit = A.montantDit(o.montant);
    const t = o.le ? Date.parse(o.le) : null;
    if (o.le && !Number.isFinite(t)) return { ok: false, error: 'Date illisible.' };
    patch.offre_detail = { montant: montantDit, conditions: texte(o.conditions, 1000), le: t ? new Date(t).toISOString() : maintenant() };
    reste.offre = montantDit;
  } else if (reste.offre !== undefined) {
    const n = A.montantDit(reste.offre);
    patch.offre_detail = n ? { ...(x.offre_detail || {}), montant: n, le: x.offre_detail?.le || maintenant() } : null;
  }
  if (patch.documents) patch.documents = { ...(x.documents || {}), ...patch.documents };
  if (Object.keys(reste).length) {
    const r = A.modifierLigne(id, reste, user);
    if (!r.ok) return r;
  }
  if (Object.keys(patch).length) {
    const frais = Records.get(PISTE, id);
    const champs = Object.keys(patch).filter((k) => k !== 'offre_detail' || !Object.keys(reste).length);
    Records.update(PISTE, id, { ...patch, maj_le: maintenant(), ...(champs.length ? { historique: [...(frais.historique || []), { le: maintenant(), par: emailDe(user), action: `modifié : ${champs.join(', ')}` }].slice(-50) } : {}) });
  }
  const y = Records.get(PISTE, id);
  const ctx = await contexteDe(y.marche_id, { ...user, email: y.mandataire_email });
  return { ok: true, ligne: ctx ? pisteEnrichie(y, ctx) : ligneDe(y) };
}

// ---------------------------------------------------------------------------
// Les offres, la diffusion, la phase
// ---------------------------------------------------------------------------

/** Pure : les offres de Klocka (validées, anonymes) et celles des pistes, la plus haute d'abord, et l'écart des deux meilleures. */
export function offresDe(ctx) {
  const klocka = (ctx.vu.offres || []).map((o) => ({ id: o.id, source: 'klocka', nom: 'Investisseur Klocka', montant: Number(o.montant) || null, conditions: o.conditions || null, le: o.le || null, reponse: o.reponse || null, piste_id: null }));
  const pistes = ctx.pistes.filter((x) => Number(x.offre) > 0).map((x) => ({
    id: `piste:${x.id}`, source: 'piste', nom: x.nom, montant: Number(x.offre), conditions: x.offre_detail?.conditions || null,
    le: x.offre_detail?.le || x.maj_le || x.cree_le || null,
    reponse: x.offre_detail?.reponse || (x.statut === 'signe' ? 'acceptee' : x.statut === 'ecarte' ? 'refusee' : null),
    piste_id: x.id, financement: x.financement || null,
  }));
  const offres = [...klocka, ...pistes].sort((a, b) => (b.montant || 0) - (a.montant || 0));
  const enLice = offres.filter((o) => o.reponse !== 'refusee' && o.montant);
  return { offres, prix_demande: ctx.prix, ecart: enLice.length >= 2 ? enLice[0].montant - enLice[1].montant : null };
}

/** Pure : les canaux d'annonce, en ligne ou en brouillon, et les contacts qu'ils ont amenés (aucune vue : rien ne la mesure). */
export function canauxDe(ctx) {
  const a = ctx.m.annonces || {};
  const cles = a.canaux ? Object.keys(a.canaux) : CANAUX.map((c) => c.cle);
  return cles.map((cle) => {
    const c = CANAUX.find((y) => y.cle === cle);
    const le = a.diffusion?.[cle] || null;
    const venus = ctx.pistes.filter((x) => SOURCE_CANAL[x.source] === cle);
    return { cle, nom: c?.nom || cle, statut: le ? 'en_ligne' : 'brouillon', le, contacts: venus.length, qualifies: venus.filter((x) => auMoins(x, 'qualifie')).length };
  });
}

/** Les acquéreurs du fichier qui collent au bien, hors ceux déjà dans le tableau ; quinze au plus. */
export async function ciblesDe(ctx) {
  const M = await import('./acquereurs-mandataire.js');
  const deja = new Set(ctx.pistes.map((x) => x.acquereur_id).filter(Boolean));
  const tous = M.mesAcquereurs({ email: ctx.m.mandataire_email }).filter((a) => !deja.has(a.id) && a.role !== 'locataire');
  const bien = { ville: ctx.fiche?.ville || null, prix: ctx.prix, type: ctx.fiche?.type_bien || null, activite: ctx.fiche?.activite || null };
  // Une cible a au moins une raison : un contact sans ville, budget ni recherche ne colle à rien de précis.
  return M.acquereursPour(bien, tous).filter((a) => a.pourquoi.length).slice(0, 15).map((a) => ({ acquereur_id: a.id, nom: a.nom, pourquoi: a.pourquoi, envoye_le: ctx.m.envois?.[a.id]?.le || null }));
}

/** Pure : les réseaux où le bien peut être proposé, et ce qu'on en sait. */
export function reseauxDe(ctx) {
  const r = ctx.m.reseaux || {};
  const possible = !!ctx.vu.klocka_possible;
  const activite = ctx.m.activite || [];
  const presentes = new Set(activite.filter((x) => x.type === 'dossier_ouvert').map((x) => x.client_nom || `anonyme:${x.le}`));
  const interesses = new Set(activite.filter((x) => ['visite_demandee', 'offre'].includes(x.type)).map((x) => x.client_nom || `anonyme:${x.le}`));
  const kPropose = r.klocka?.propose_le || (ctx.m.voie === 'klocka' ? ctx.m.voie_le || null : null);
  const attente = (le) => (le ? `Proposé le ${dateCourte(le)}, en attente` : null);
  return [
    { cle: 'klocka', nom: 'Investisseurs Klocka', possible, propose_le: kPropose, statut_texte: presentes.size ? `Présenté à ${pluriel(presentes.size, 'investisseur')} · ${interesses.size} intéressé${interesses.size > 1 ? 's' : ''}` : attente(kPropose) },
    { cle: 'tokimo', nom: 'Tokimo', possible: !ctx.location, propose_le: r.tokimo?.propose_le || null, statut_texte: attente(r.tokimo?.propose_le) },
    { cle: 'club_deal', nom: 'Club deals', possible: !ctx.location, propose_le: r.club_deal?.propose_le || null, statut_texte: attente(r.club_deal?.propose_le) },
  ];
}

/** Pure : les compteurs de la vente. */
export function compteursDe(ctx, offres, aujourdhui = Date.now()) {
  const dates = Object.values(ctx.m.annonces?.diffusion || {}).filter(Boolean).sort();
  return {
    contacts: ctx.pistes.length,
    qualifies: ctx.pistes.filter((x) => auMoins(x, 'qualifie')).length,
    visites: ctx.pistes.filter((x) => auMoins(x, 'visite') || (x.acquereur_id && ctx.visites.some((v) => v.acquereur?.acquereur_id === x.acquereur_id))).length,
    offres: offres.length,
    jours_en_ligne: dates.length ? Math.max(0, Math.floor((aujourdhui - Date.parse(dates[0])) / JOUR)) : null,
  };
}

/** Pure : la phase, de la plus avancée à la première. */
export function phaseDe(ctx, offres) {
  const acceptee = offres.some((o) => o.reponse === 'acceptee') || ctx.pistes.some((x) => x.statut === 'signe');
  if (acceptee) return 'acceptee';
  if (offres.length) return 'offres';
  if (ctx.visites.length || ctx.pistes.some((x) => auMoins(x, 'visite')) || (ctx.m.activite || []).some((a) => a.type === 'visite_faite')) return 'visiter';
  if (ctx.pistes.some((x) => auMoins(x, 'qualifie'))) return 'qualifier';
  if (Object.values(ctx.m.annonces?.diffusion || {}).some(Boolean) || Object.keys(ctx.m.envois || {}).length) return 'diffuser';
  return 'preparer';
}

// ---------------------------------------------------------------------------
// Les conseils : une ou deux phrases, la chose la plus importante maintenant
// ---------------------------------------------------------------------------

const minuscule = (t) => String(t || '').charAt(0).toLowerCase() + String(t || '').slice(1);

/** Pure : les cinq conseils de la Mise en vente. */
export function conseilsDe(ctx, { offres, canaux, cibles, lignes, aujourdhui = Date.now() }) {
  const c = {};
  // La Data room : ce qui manque, et si le vendeur a ouvert son lien.
  const manquantes = ctx.checklist.manquantes || [];
  const depot = ctx.d?.depot || null;
  const demandes = (ctx.d?.demandes || []);
  if (!ctx.d) c.dataroom = { texte: "Ce bien n'a pas encore de dossier : la Data room s'ouvre avec lui.", actions: [] };
  else if (manquantes.length) {
    const liste = manquantes.map((p) => minuscule(p.mot)).join(', ');
    const lien = !depot?.jeton ? "Le vendeur n'a pas encore reçu de lien de dépôt." : depot.ouvert_le ? `Le vendeur a ouvert son lien le ${dateCourte(depot.ouvert_le)}${depot.deposes ? ` et déposé ${pluriel(depot.deposes, 'pièce')}` : ' sans rien déposer'}.` : "Le vendeur n'a pas encore ouvert son lien de dépôt.";
    c.dataroom = { texte: `Il manque ${pluriel(manquantes.length, 'pièce obligatoire', 'pièces obligatoires')} : ${liste}. ${lien}`, actions: [{ libelle: 'Relancer le vendeur', texte: `Préparer la relance du vendeur pour les pièces manquantes : ${liste}.` }, { libelle: 'Voir les pièces', onglet: 'dataroom' }] };
  } else {
    const pieces = ctx.checklist.lignes.filter((l) => l.recue);
    const internes = pieces.filter((l) => !caseVisible(ctx.d, l.cle)).length;
    const dem = demandes.length ? ` ${pluriel(new Set(demandes.map((x) => x.piste_id)).size, 'acquéreur a', 'acquéreurs ont')} demandé une pièce.` : '';
    c.dataroom = { texte: `Les pièces obligatoires sont là : ${pluriel(pieces.length - internes, 'case visible', 'cases visibles')} des acquéreurs${internes ? `, ${internes} interne${internes > 1 ? 's' : ''}` : ''}.${dem}`, actions: [{ libelle: 'Voir les pièces', onglet: 'dataroom' }] };
  }

  // La diffusion : le canal qui qualifie le plus, et les acquéreurs du fichier sans teaser.
  const enLigne = canaux.filter((x) => x.statut === 'en_ligne');
  const meilleur = [...canaux].filter((x) => x.qualifies).sort((a, b) => b.qualifies - a.qualifies)[0] || null;
  const sansTeaser = cibles.filter((x) => !x.envoye_le).length;
  const phrase1 = !enLigne.length ? "Aucune annonce n'est cochée en ligne." : meilleur ? `${meilleur.nom} amène le plus de contacts qualifiés (${meilleur.qualifies}).` : `${pluriel(enLigne.length, 'annonce en ligne', 'annonces en ligne')}, aucun contact qualifié pour l'instant.`;
  const phrase2 = sansTeaser ? ` ${pluriel(sansTeaser, 'acquéreur', 'acquéreurs')} de votre fichier ${sansTeaser > 1 ? 'correspondent' : 'correspond'} au bien sans avoir reçu le teaser.` : '';
  c.diffusion = { texte: `${phrase1}${phrase2}`, actions: [sansTeaser ? { libelle: 'Envoyer le teaser', onglet: 'diffusion' } : { libelle: 'Voir les annonces', onglet: 'diffusion' }] };

  // Les acquéreurs : les actions du jour, en retard ou d'aujourd'hui, la plus chaude d'abord.
  const jour = new Date(aujourdhui).toISOString().slice(0, 10);
  const duJour = lignes.filter((l) => l.statut !== 'ecarte' && l.prochaine_le && String(l.prochaine_le).slice(0, 10) <= jour).sort((a, b) => b.score - a.score).slice(0, 3);
  if (duJour.length) {
    const retard = duJour.filter((l) => String(l.prochaine_le).slice(0, 10) < jour).length;
    c.acquereurs = { texte: `${pluriel(duJour.length, 'action', 'actions')} pour aujourd'hui${retard ? `, dont ${retard} en retard` : ''} : ${minuscule(duJour[0].prochaine)} avec ${duJour[0].nom} d'abord.`, actions: duJour.map((l) => ({ libelle: `${l.nom} : ${l.prochaine}`.slice(0, 80), piste_id: l.id })) };
  } else if (lignes.some((l) => l.statut !== 'ecarte')) {
    const chaud = lignes.filter((l) => l.statut !== 'ecarte').sort((a, b) => b.score - a.score)[0];
    c.acquereurs = { texte: `Aucune action datée. ${chaud.nom} est le contact le plus avancé : ${minuscule(chaud.prochaine)}.`, actions: [{ libelle: `Ouvrir ${chaud.nom}`.slice(0, 80), piste_id: chaud.id }] };
  } else c.acquereurs = { texte: "Aucun contact pour l'instant : chaque appel reçu se note ici, ou en le racontant au chat.", actions: [{ libelle: 'Diffuser le bien', onglet: 'diffusion' }] };

  // Les offres : l'écart des deux meilleures, et ce qui manque à la meilleure.
  const enLice = offres.offres.filter((o) => o.reponse !== 'refusee' && o.montant);
  if (!enLice.length) {
    const visites = lignes.filter((l) => l.visite || ['visite'].includes(l.statut)).length;
    c.offres = { texte: `Aucune offre pour l'instant.${visites ? ` ${pluriel(visites, 'contact a', 'contacts ont')} visité : demandez-leur un retour.` : ''}`, actions: [] };
  } else {
    const [a, b] = enLice;
    const manque = a.source === 'piste' && !a.financement ? ` Aucune preuve de financement notée pour l'offre de ${a.nom}.` : a.source === 'piste' && !a.conditions ? ` Les conditions de l'offre de ${a.nom} ne sont pas notées.` : '';
    const ecart = b ? `Écart de ${montant(a.montant - b.montant) || '0 €'} entre les deux meilleures offres (${montant(a.montant)} et ${montant(b.montant)}).` : `Une offre à ${montant(a.montant)}${offres.prix_demande ? `, ${Math.round((a.montant / offres.prix_demande) * 100)} % du prix demandé` : ''}.`;
    c.offres = { texte: `${ecart}${manque}`, actions: [{ libelle: 'Comparer les offres', onglet: 'offres' }, ...(a.piste_id ? [{ libelle: `Ouvrir ${a.nom}`.slice(0, 80), piste_id: a.piste_id }] : [])] };
  }

  // Le vendeur : le rapport a-t-il de quoi parler, et ce que les offres disent du prix.
  const n = ctx.pistes.length;
  const best = enLice[0] || null;
  const prixPhrase = best && ctx.prix ? ` La meilleure offre est à ${Math.round((best.montant / ctx.prix) * 100)} % du prix demandé.` : n ? ' Sans offre, rien ne dit encore si le prix est juste.' : '';
  c.vendeur = n || enLigne.length || best
    ? { texte: `Le rapport au vendeur peut partir : ${pluriel(n, 'contact')}, ${pluriel(lignes.filter((l) => l.visite || RANG[l.statut] >= RANG.visite && l.statut !== 'ecarte').length, 'visite')}.${prixPhrase}`, actions: [{ libelle: 'Voir le rapport', onglet: 'vendeur' }, { libelle: 'Rédiger la recommandation', texte: 'Rédiger la recommandation au vendeur sur le prix, depuis le rapport.' }] }
    : { texte: "Le rapport au vendeur est encore vide : rien n'est en ligne et aucun contact n'est noté.", actions: [] };
  return c;
}

/** L'état de la Mise en vente : la phase, les compteurs, les onglets et les conseils. */
export async function etatVente(marcheId, user, aujourdhui = Date.now()) {
  const ctx = await contexteDe(marcheId, user);
  if (!ctx) return { ok: false, error: 'Commercialisation introuvable.' };
  const offres = offresDe(ctx);
  const canaux = canauxDe(ctx);
  const cibles = await ciblesDe(ctx);
  const lignes = ctx.pistes.map((x) => pisteEnrichie(x, ctx, aujourdhui));
  return {
    ok: true,
    phases: PHASES,
    phase: phaseDe(ctx, offres.offres),
    compteurs: compteursDe(ctx, offres.offres, aujourdhui),
    onglets: { acquereurs: ctx.pistes.length, offres: offres.offres.length },
    conseils: conseilsDe(ctx, { offres, canaux, cibles, lignes, aujourdhui }),
  };
}

/** La diffusion : les canaux, les cibles du fichier, les réseaux. */
export async function diffusionVente(marcheId, user) {
  const ctx = await contexteDe(marcheId, user);
  if (!ctx) return { ok: false, error: 'Commercialisation introuvable.' };
  return { ok: true, canaux: canauxDe(ctx), cibles: await ciblesDe(ctx), reseaux: reseauxDe(ctx) };
}

/** Les offres, toutes sources. */
export async function offresVente(marcheId, user) {
  const ctx = await contexteDe(marcheId, user);
  if (!ctx) return { ok: false, error: 'Commercialisation introuvable.' };
  return { ok: true, ...offresDe(ctx) };
}

// ---------------------------------------------------------------------------
// Envoyer le teaser à un acquéreur du fichier ; proposer à un réseau
// ---------------------------------------------------------------------------

/** Le teaser envoyé à un acquéreur du fichier : il rejoint le tableau, et le mail est prêt à partir de sa boîte. */
export async function envoyerTeaser(marcheId, acquereurId, user) {
  const ctx = await contexteDe(marcheId, user);
  if (!ctx) return { ok: false, error: 'Commercialisation introuvable.' };
  const a = acquereurId ? Records.get('AcquereurMandataire', acquereurId) : null;
  if (!a || a.mandataire_email !== ctx.m.mandataire_email) return { ok: false, error: 'Acquéreur introuvable.' };
  const le = maintenant();
  let piste = ctx.pistes.find((x) => x.acquereur_id === a.id);
  if (!piste) {
    piste = Records.create(PISTE, {
      mandataire_email: ctx.m.mandataire_email, marche_id: ctx.m.id, acquereur_id: a.id,
      nom: a.nom || 'Contact', telephone: a.telephone || null, email: a.email || null, source: 'Fichier', statut: 'contact',
      budget: Number(a.budget_max) > 0 ? Number(a.budget_max) : null, cree_le: le, maj_le: le,
      historique: [{ le, par: emailDe(user), action: 'Teaser envoyé' }],
    });
  } else {
    piste = Records.update(PISTE, piste.id, { maj_le: le, historique: [...(piste.historique || []), { le, par: emailDe(user), action: 'Teaser envoyé' }].slice(-50) });
  }
  Records.update('MiseEnMarche', ctx.m.id, { envois: { ...(ctx.m.envois || {}), [a.id]: { le, piste_id: piste.id } } });
  const { signataire } = await import('./mandataire-avis.js');
  const s = signataire({ email: ctx.m.mandataire_email });
  const titre = titreAnonyme(ctx.m);
  const sous = ctx.m.teaser?.sous_titre && !String(ctx.m.teaser.sous_titre).includes('[à compléter]') ? ` (${ctx.m.teaser.sous_titre})` : '';
  const corps = [
    'Bonjour,',
    '',
    `Je commercialise ${minuscule(titre)}${sous}, qui pourrait correspondre à votre recherche.`,
    '',
    'Vous trouverez le teaser en pièce jointe. Je vous envoie le dossier complet si le bien vous intéresse.',
    '',
    'Bien à vous,',
    [s.nom, s.telephone].filter(Boolean).join('\n') || null,
  ].filter((x) => x !== null).join('\n');
  return {
    ok: true, piste_id: piste.id,
    mail: { a: a.email || null, objet: `${titre} : le teaser`, corps, teaser_pdf: `/api/mandataire/marches/${ctx.m.id}/teaser/pdf` },
  };
}

const RESEAUX = { klocka: 'Investisseurs Klocka', tokimo: 'Tokimo', club_deal: 'Club deals' };

/** Le bien proposé à un réseau : la date se garde, l'équipe Klocka est prévenue. La voie ne change pas. */
export async function proposerReseau(marcheId, cle, user) {
  if (!RESEAUX[cle]) return { ok: false, error: 'Réseau inconnu.' };
  const ctx = await contexteDe(marcheId, user);
  if (!ctx) return { ok: false, error: 'Commercialisation introuvable.' };
  const r = reseauxDe(ctx).find((x) => x.cle === cle);
  if (!r.possible) return { ok: false, error: `Ce bien ne se propose pas à ${RESEAUX[cle]} : Klocka reprend des murs à vendre.` };
  const le = maintenant();
  const reseaux = { ...(ctx.m.reseaux || {}), [cle]: { propose_le: le, par: emailDe(user) } };
  Records.update('MiseEnMarche', ctx.m.id, { reseaux });
  try {
    const { notifier } = await import('./notifications.js');
    const u = Records.findBy('User', 'email', ctx.m.mandataire_email);
    // Sans destinataire : la notification va à Jules (server/notifications.js).
    notifier({ pour: null, titre: `Bien proposé à ${RESEAUX[cle]} · ${ctx.m.bien}`, texte: `Par ${u?.full_name || ctx.m.mandataire_email}.`, lien: ctx.d ? `/Conversations?dossier=${ctx.d.id}` : null, action: 'Ouvrir', cle: `reseau:${ctx.m.id}:${cle}` });
  } catch { /* la date est gardée, l'alerte attendra */ }
  return { ok: true, reseau: { ...r, propose_le: le, statut_texte: r.statut_texte && cle === 'klocka' && r.statut_texte.startsWith('Présenté') ? r.statut_texte : `Proposé le ${dateCourte(le)}, en attente` } };
}

// ---------------------------------------------------------------------------
// Le rapport au vendeur
// ---------------------------------------------------------------------------

/** Le rapport au vendeur, tel quel : les chiffres, la diffusion, les visites (anonymes), les offres, les pièces manquantes. */
export async function rapportVendeur(marcheId, user, aujourdhui = Date.now()) {
  const ctx = await contexteDe(marcheId, user);
  if (!ctx) return { ok: false, error: 'Commercialisation introuvable.' };
  const o = offresDe(ctx);
  const canaux = canauxDe(ctx);
  const chiffres = compteursDe(ctx, o.offres, aujourdhui);
  const dates = Object.values(ctx.m.annonces?.diffusion || {}).filter(Boolean).sort();
  const visites = ctx.visites.filter((v) => v.compte_rendu).map((v) => ({ le: v.quand || v.compte_rendu.date || null, nom: v.compte_rendu.profil || 'Visiteur', impression: v.compte_rendu.impression || null, reserves: v.compte_rendu.reserves || [] })).sort((a, b) => String(b.le).localeCompare(String(a.le)));
  // Le vendeur ne lit pas le nom des acquéreurs : les offres du rapport sont anonymes.
  const offres = o.offres.map(({ montant: mt, conditions, le, reponse, source }) => ({ montant: mt, conditions, le, reponse, source }));
  return {
    ok: true,
    pret: chiffres.contacts > 0 || canaux.some((c) => c.statut === 'en_ligne') || offres.length > 0,
    depuis: dates[0] || ctx.m.cree_le || null,
    prix_demande: ctx.prix,
    chiffres,
    diffusion: canaux.map(({ cle, nom, statut, le, contacts, qualifies }) => ({ cle, nom, statut, le, contacts, qualifies })),
    visites,
    offres,
    pieces_manquantes: (ctx.checklist.manquantes || []).map((p) => p.mot),
    recommandation: ctx.m.rapport_vendeur?.recommandation || null,
    mail: ctx.m.rapport_vendeur?.mail || null,
  };
}

const SCHEMA_RECO = {
  type: 'object',
  properties: {
    recommandation: { type: 'string' },
    mail: { type: 'object', properties: { objet: { type: 'string' }, corps: { type: 'string' } }, required: ['objet', 'corps'] },
  },
  required: ['recommandation', 'mail'],
};

/** Pure : la consigne de la recommandation, sur les seuls chiffres du rapport. */
export function consigneRecommandation(r, { bien, location = false }) {
  const donnees = { bien, prix_demande: r.prix_demande, en_ligne_depuis: r.depuis, chiffres: r.chiffres, diffusion: r.diffusion, visites: r.visites, offres: r.offres, pieces_manquantes: r.pieces_manquantes };
  return `Tu écris, pour un mandataire du réseau K Partners, la recommandation de prix à son ${location ? 'propriétaire bailleur' : 'vendeur'} et le mail qui la porte. Tout en français, vouvoiement.

LES DONNÉES DU RAPPORT (n'utilise qu'elles ; un chiffre absent ne s'écrit pas, ne l'estime pas) :
${JSON.stringify(donnees, null, 1).slice(0, 8000)}

RÈGLES :
- recommandation : 3 à 5 phrases sur le ${location ? 'loyer' : 'prix'} : ce que disent les contacts, les visites (leurs réserves) et les offres face au ${location ? 'loyer' : 'prix'} demandé, puis ce que vous conseillez (tenir, ajuster, attendre). Sans offre, dites que le marché n'a pas encore tranché ; ne proposez pas de chiffre que les données ne portent pas.
- mail : un objet court, puis « Bonjour, », le point de la commercialisation en quelques lignes (les chiffres du rapport), la recommandation, « Bien à vous, ». Jamais le nom d'un acquéreur.
- Montants en français (« 450 000 € », « 1,2 M€ »). Pas d'emoji, pas de tiret cadratin, pas de superlatif.`;
}

const propre = (t) => String(t || '').replace(/\s*—\s*/g, ', ').trim();

/** La recommandation au vendeur, rédigée par le modèle sur le rapport, gardée sur la commercialisation. */
export async function recommandationVendeur(marcheId, user) {
  const r = await rapportVendeur(marcheId, user);
  if (!r.ok) return r;
  if (!r.pret) return { ok: false, error: "Rien à rapporter encore : aucune annonce en ligne, aucun contact, aucune offre." };
  const ctx = await contexteDe(marcheId, user);
  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const { resultat: lu } = await mesurer({ operation: 'mandataire', par: user?.email }, () => invokeLLM({ prompt: consigneRecommandation(r, { bien: titreAnonyme(ctx.m), location: ctx.location }), response_json_schema: SCHEMA_RECO, effort: 'low', max_tokens: 3000 }));
  const recommandation = propre(lu?.recommandation);
  if (!recommandation) return { ok: false, error: "La recommandation n'a pas pu s'écrire : réessayez." };
  const mail = { objet: propre(lu?.mail?.objet) || `Point sur la commercialisation · ${titreAnonyme(ctx.m)}`, corps: propre(lu?.mail?.corps) };
  Records.update('MiseEnMarche', ctx.m.id, { rapport_vendeur: { recommandation, mail, le: maintenant(), par: emailDe(user) } });
  return { ok: true, recommandation, mail };
}
