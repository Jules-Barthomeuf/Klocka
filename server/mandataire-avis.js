// L'avis de valeur du mandataire, mené par le chat.
//
// Le mandataire dit le bien ; l'assistant pose les questions qu'il faut, et
// seulement celles-là : un local commercial occupé n'appelle pas les mêmes
// que des bureaux libres ou un immeuble de rapport. Un bail joint en pièce
// répond à la moitié d'un coup. Quand l'essentiel est là, l'avis se rédige :
// le marché de la rue (Data-B, Equimmox), les ventes alentour (DVF), les deux
// méthodes, la fourchette. Les CHIFFRES se calculent ici (loyer ÷ taux,
// surface × prix, sensibilité, honoraires) ; le modèle écrit les
// phrases et choisit le taux dans une fourchette qu'il doit justifier.
//
// L'avis s'ouvre ensuite dans un éditeur au format du modèle K Partners : le
// mandataire retouche ce qu'il veut, puis l'imprime en PDF. Ses mentions
// légales (RSAC, carte T, signature, photo) viennent de sa fiche, tenue par
// l'admin : il ne les ressaisit jamais.

import { effortDuChat } from './ak/effort.js';
import { Records } from './db.js';
import { villeDuTexte, echeanceDuBail } from './taux-rendement.js';
import { lignesDeLEmplacement } from './emplacement-auto.js';

const ENTITE = 'EstimationMandataire';
const moi = (user) => String(user?.email || '').toLowerCase();
const PARIS = 'Europe/Paris';

export const TYPES_BIEN = {
  murs_commerce: 'Murs commerciaux',
  bureaux: 'Bureaux',
  local_activite: "Local d'activité ou entrepôt",
  immeuble: 'Immeuble de rapport',
  fonds_commerce: 'Fonds de commerce',
  autre: 'Autre bien professionnel',
};
// Ce qu'un mandataire peut ouvrir (31 oct. 2026, PLAN.md 0.4 : commerces seulement). Les bureaux et les locaux
// d'activité restent lisibles dans les avis déjà faits, ils ne se proposent plus.
// Le fonds de commerce (3 nov. 2026, Jules) : barème, rentabilité et comparables croisés (server/fonds-valeur.js).
export const TYPES_PROPOSES = ['murs_commerce', 'fonds_commerce', 'immeuble', 'autre'];

// Ce qu'il faut savoir, par type et par situation (occupé ou libre). Les clés
// optionnelles se demandent, mais « je ne sais pas » laisse « [à compléter] ».
const COMMUNS = ['type_bien', 'occupe', 'adresse', 'demandeur', 'surface_utile', 'etat', 'date_visite'];
// Les murs commerciaux s'estiment par le taux de rendement (31 oct. 2026, Jules ; server/taux-rendement.js) : un taux
// de base proposé par l'assistant et validé par le mandataire, que ces critères ajustent. « nc » (on ne sait pas) est
// une réponse : elle ne bloque rien.
const CRITERES_TAUX = ['rang_rue', 'taux_base'];
const CRITERES_TAUX_OCCUPE = ['profil_locataire', 'charges_refacturees', 'taxe_fonciere_refacturee'];
const PAR_TYPE = {
  murs_commerce: ['facade', ...CRITERES_TAUX],
  bureaux: ['etage', 'stationnement'],
  local_activite: ['hauteur', 'acces_poids_lourds'],
  immeuble: ['nb_lots', 'composition'],
  autre: ['description'],
};
// Un fonds ne se pense ni en surface ni en « loué ou libre » : son activité, ses comptes, et le bail qu'il occupe.
const FONDS = ['type_bien', 'adresse', 'demandeur', 'activite_fonds', 'ca_n', 'ebe_n', 'loyer_annuel_hc', 'echeance', 'etat', 'date_visite'];
const FONDS_ESSENTIELS = ['adresse', 'activite_fonds', 'ca_n'];
const MONTANTS_FONDS = ['ca_n', 'ca_n1', 'ca_n2', 'ebe_n', 'ebe_n1', 'ebe_n2'];
const OCCUPE = ['locataire', 'activite_locataire', 'bail_type', 'date_effet', 'echeance', 'loyer_annuel_hc', 'indexation', 'taxe_fonciere', 'charges'];
const OPTIONNELS = ['reserve', 'zones', 'configuration', 'equipements', 'juridique', 'copropriete', 'travaux_votes', 'urbanisme', 'diagnostics', 'servitudes', 'depot_garantie', 'paiements', 'ca_locataire', 'travaux_locataire', 'environnement', 'flux', 'acces', 'vacance'];

/**
 * Pure : l'essentiel pour rédiger (1er nov. 2026, Jules : « l'estimation en cinq minutes ») : l'adresse, loué ou non,
 * la surface ; loué, le loyer et l'échéance ; des murs de commerce, le rang de la rue et le taux de base. Le reste
 * se demande, mais ne retient plus la rédaction : il reste « [à compléter] » et se dicte après.
 */
export function essentielsManquants(q = {}) {
  if (q.type_bien === 'fonds_commerce') return FONDS_ESSENTIELS.filter((k) => q[k] == null || q[k] === '');
  const requis = ['adresse', 'occupe', 'surface_utile', ...(q.occupe === true ? ['loyer_annuel_hc', 'echeance'] : []), ...(q.type_bien === 'murs_commerce' ? ['rang_rue', 'taux_base'] : [])];
  return requis.filter((k) => q[k] == null || q[k] === '');
}

/** Pure : ce qui manque encore pour rédiger, selon le type et l'occupation. */
export function manquants(q) {
  if (q.type_bien === 'fonds_commerce') return FONDS.filter((k) => q[k] == null || q[k] === '');
  const requis = [...COMMUNS, ...(PAR_TYPE[q.type_bien] || []), ...(q.occupe === true ? OCCUPE : []),
    ...(q.type_bien === 'murs_commerce' && q.occupe === true ? CRITERES_TAUX_OCCUPE : [])];
  return requis.filter((k) => q[k] == null || q[k] === '');
}

/** Pure : un montant dit, « 320 k€ », « 1,2 M€ », « 320 000 € » → en euros. */
export function montantDit(t) {
  if (typeof t === 'number') return t;
  const n = premierNombre(t);
  if (n == null) return null;
  const s = String(t);
  if (/\d\s*(m€|m\b|millions?)/i.test(s)) return Math.round(n * 1e6);
  if (/\d\s*(k€|k\b|mille)/i.test(s)) return Math.round(n * 1000);
  return n;
}

/**
 * Pure : le premier nombre d'un texte, milliers espacés compris :
 * « 21 600 € » → 21600, « 85 m² au rdc, réserve 25 m² » → 85, « 5,9 % » → 5.9.
 * Jamais tous les chiffres collés bout à bout.
 */
export function premierNombre(t) {
  if (typeof t === 'number') return t;
  const m = String(t || '').match(/\d{1,3}(?:[ \u00a0\u202f.]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const brut = m[0];
  const n = /[ \u00a0\u202f]/.test(brut) || /\.\d{3}(?!\d)/.test(brut) && !/,/.test(brut)
    ? Number(brut.replace(/[ \u00a0\u202f.]/g, '').replace(',', '.'))
    : Number(brut.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// --- Le questionnaire en cours ----------------------------------------------

function enCours(user, conversationId = null) {
  // Une conversation tient son avis, en cours ou déjà rédigé.
  if (conversationId) {
    const lie = Records.list(ENTITE)
      .filter((e) => e.mandataire_email === moi(user) && e.conversation_id === conversationId)
      .sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)))[0];
    if (lie) return lie.questionnaire_en_cours ? lie : null;
  }
  return Records.list(ENTITE)
    .filter((e) => e.mandataire_email === moi(user) && e.questionnaire_en_cours && (!conversationId || orphelinRecent(e)))
    .sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)))[0] || null;
}

/** Un avis commencé au premier message, avant que la conversation ait son identifiant. */
const orphelinRecent = (e) => !e.conversation_id && Date.now() - Date.parse(e.cree_le) < 10 * 60000;

/** Le dernier avis rédigé de la conversation (deux heures) : il reste corrigeable par le chat. */
function dernierRedige(user, conversationId = null) {
  // L'avis rédigé de cette conversation, quel que soit son âge ; sans
  // conversation connue, le dernier des deux dernières heures.
  if (conversationId) {
    const lie = Records.list(ENTITE)
      .filter((e) => e.mandataire_email === moi(user) && e.conversation_id === conversationId && e.avis)
      .sort((a, b) => String(b.prete_le || '').localeCompare(String(a.prete_le || '')))[0];
    if (lie) return lie;
  }
  return Records.list(ENTITE)
    .filter((e) => e.mandataire_email === moi(user) && e.avis && e.prete_le && Date.now() - Date.parse(e.prete_le) < 2 * 3600000 && !conversationId)
    .sort((a, b) => String(b.prete_le).localeCompare(String(a.prete_le)))[0] || null;
}

const titreDe = (q) => [TYPES_BIEN[q.type_bien] || 'Bien', q.adresse].filter(Boolean).join(' · ');

export function commencer({ type_bien, adresse = null, demandeur = null }, user, conversationId = null) {
  for (const e of Records.list(ENTITE).filter((x) => x.mandataire_email === moi(user) && x.questionnaire_en_cours && (!conversationId || !x.conversation_id || x.conversation_id === conversationId))) {
    Records.update(ENTITE, e.id, { questionnaire_en_cours: false });
  }
  const q = { type_bien: TYPES_PROPOSES.includes(type_bien) ? type_bien : 'autre', adresse, demandeur };
  const e = Records.create(ENTITE, {
    mandataire_email: moi(user), conversation_id: conversationId, bien: titreDe(q), adresse, statut: 'brouillon', questionnaire_en_cours: true, questionnaire: q,
    cree_le: new Date().toISOString(), historique: [{ le: new Date().toISOString(), par: user?.email || null, action: 'avis commencé par le chat' }],
  });
  // Aucun avis sans fiche (2 nov. 2026, server/fiche-du-bien.js) : dès que l'adresse est connue.
  if (adresse) import('./fiche-du-bien.js').then((f) => f.ficheDeLAvis(e.id, user)).catch((err) => console.warn(`[fiche] ${err?.message || err}`));
  if (adresse) prechaufferAvis(e.id, user);
  return { ok: true, estimation_id: e.id, manquants: manquants(q) };
}

export function noter(reponses, user, conversationId = null) {
  // Une correction après la rédaction rouvre le dernier avis (il se rédigera de nouveau).
  let e = enCours(user, conversationId);
  if (!e) {
    const d = dernierRedige(user, conversationId);
    if (d) { Records.update(ENTITE, d.id, { questionnaire_en_cours: true }); e = Records.get(ENTITE, d.id); }
  }
  if (!e) return { ok: false, error: 'Aucun avis en cours : commence par commencer_avis.' };
  const q = { ...(e.questionnaire || {}) };
  for (const [k, v] of Object.entries(reponses || {})) {
    if (v === undefined) continue;
    q[k] = typeof v === 'string' ? v.trim() : v;
  }
  for (const k of ['loyer_annuel_hc', 'surface_utile', 'taux_base', 'vacance_rue_pct']) if (q[k] != null && typeof q[k] !== 'number') q[k] = premierNombre(q[k]) ?? q[k];
  for (const k of MONTANTS_FONDS) if (q[k] != null && typeof q[k] !== 'number') q[k] = montantDit(q[k]) ?? q[k];
  // L'échéance d'un 3-6-9 se calcule depuis la date d'effet, sans la demander (1er nov. 2026, Jules) ; une échéance dite
  // l'emporte, une calculée suit la date d'effet si elle change.
  if (q.occupe !== false && (!q.echeance || q.echeance_calculee)) {
    const c = echeanceDuBail(q);
    if (c) Object.assign(q, { echeance: c.echeance, echeance_calculee: true, ...(c.suppose ? { bail_type: '3-6-9 (supposé)' } : {}) });
  }
  if (reponses?.echeance && q.echeance_calculee) delete q.echeance_calculee;
  // Ce que le chat vient d'apprendre l'emporte sur une retouche à la main du même champ.
  const surcouche = sansChampsRepondus(e.surcouche, Object.keys(reponses || {}));
  Records.update(ENTITE, e.id, { questionnaire: q, ...(e.nom_choisi ? {} : { bien: titreDe(q) }), adresse: q.adresse || e.adresse, ...(surcouche !== e.surcouche ? { surcouche } : {}) });
  if (q.adresse && !e.proprietaire_id) import('./fiche-du-bien.js').then((f) => f.ficheDeLAvis(e.id, user)).catch((err) => console.warn(`[fiche] ${err?.message || err}`));
  if (q.adresse) prechaufferAvis(e.id, user);
  // Murs ou fonds corrigé dans le chat : la fiche du bien le garde, la pré-visite et l'avis suivants suivent.
  if (reponses?.type_bien && e.proprietaire_id && ['murs_commerce', 'fonds_commerce'].includes(q.type_bien)) {
    const p = Records.get('ProprietaireMandataire', e.proprietaire_id);
    if (p && (p.type_bien || 'murs_commerce') !== q.type_bien) Records.update('ProprietaireMandataire', p.id, { type_bien: q.type_bien === 'fonds_commerce' ? 'fonds_commerce' : null });
  }
  // Un taux posé pour rédiger tout de suite, pas encore validé (1er nov. 2026) : il n'apprend rien aux avis suivants.
  if (reponses?.taux_base != null && Number(q.taux_base) > 0) {
    const aValider = reponses.taux_base_a_valider === true;
    if (!aValider && q.taux_base_a_valider) { q.taux_base_a_valider = false; Records.update(ENTITE, e.id, { questionnaire: q }); }
    if (!aValider) garderTauxValide(Records.get(ENTITE, e.id), user);
  }
  return { ok: true, manquants: manquants(q), essentiels_manquants: essentielsManquants(q), optionnels_non_renseignes: OPTIONNELS.filter((k) => q[k] == null),
    // La question juridique et technique, posée une fois (3 nov. 2026, Jules) : elle ne retient pas la rédaction.
    ...(q.juridique == null ? { question_juridique_a_poser: QUESTIONS_REPRISE.juridique } : {}) };
}

// --- La rédaction ------------------------------------------------------------

const arrondi = (v, pas = 5000) => Math.round(v / pas) * pas;
// Un prix se donne rond (2 nov. 2026, Jules : « jamais 398 000, on dit 400 000 ; ou des 5, 395, pas 397 ») : au
// multiple de 5 000 €, de 10 000 € dès le million (lu en M€). Valeur, fourchette et prix affiché, d'où qu'ils viennent.
export const prixRond = (v) => (Number(v) > 0 ? arrondi(Number(v), Number(v) >= 1e6 ? 10000 : 5000) : v);
const pct = (n) => Math.round(n * 1000) / 10;

/** Pure : les chiffres de l'avis, depuis le questionnaire et les choix de taux et de prix. */
export function chiffrer(q, { taux, prix_m2, loyer_marche_m2 = null, honoraires = 0.05, frais = 0.075, dataB = null }) {
  const surface = Number(q.surface_utile) || null;
  const loyer = q.occupe ? Number(q.loyer_annuel_hc) || null : null;
  const cap = loyer && taux ? loyer / (taux / 100) : null;
  const comp = surface && prix_m2 ? surface * prix_m2 : null;
  // Comme dans le modèle : occupé, la capitalisation du loyer fait la valeur
  // (méthode principale) et la comparaison la recoupe ; libre, la comparaison
  // seule. La fourchette vient de la sensibilité au taux, autour de la valeur.
  // L'estimation de Data-B, quand elle est là, fait la valeur et la fourchette.
  const brute = dataB?.moyenne || cap || comp;
  if (!brute) return null;
  const valeur = prixRond(brute);
  const bas = prixRond(dataB?.basse || (cap ? loyer / ((taux + 0.2) / 100) : valeur * 0.96));
  const haut = prixRond(dataB?.haute || (cap ? loyer / ((taux - 0.15) / 100) : valeur * 1.03));
  const ecart = cap && comp ? Math.round(((comp - cap) / cap) * 100) : null;
  const rendement = loyer ? pct(loyer / valeur) : null;
  const loyerMarche = loyer_marche_m2 && surface ? loyer_marche_m2 * surface : null;
  const prixAffiche = prixRond(valeur * (1 + honoraires));
  return {
    ecart_methodes: ecart,
    capitalisation: cap ? Math.round(cap / 1000) * 1000 : dataB?.moyenne || null,
    comparaison: comp ? Math.round(comp / 100) * 100 : null,
    sensibilite: loyer && taux ? { taux_bas: taux - 0.15, valeur_basse_taux: Math.round(loyer / ((taux - 0.15) / 100) / 100) * 100, taux_haut: taux + 0.2, valeur_haute_taux: Math.round(loyer / ((taux + 0.2) / 100) / 100) * 100 } : null,
    valeur, bas: Math.min(bas, valeur), haut: Math.max(haut, valeur), rendement,
    loyer_marche: loyerMarche ? Math.round(loyerMarche / 100) * 100 : null,
    // Plus de « valeur en cas de départ du locataire » dans l'avis (1er nov. 2026, Jules).
    valeur_libre: null,
    honoraires_pct: honoraires * 100,
    prix_affiche: prixAffiche,
    rendement_affiche: loyer ? pct(loyer / prixAffiche) : null,
    cout_total: Math.round(prixAffiche * (1 + frais) / 1000) * 1000,
    rendement_total: loyer ? pct(loyer / (prixAffiche * (1 + frais))) : null,
    frais_pct: frais * 100,
  };
}

const SCHEMA_AVIS = {
  type: 'object',
  properties: {
    taux: { type: 'number', description: 'Taux de rendement brut retenu (%), ex. 5.9' },
    justification_taux: { type: 'string', description: 'Pourquoi ce taux, en comparant aux références (2 à 3 phrases)' },
    prix_m2: { type: 'number', description: 'Prix retenu en € par m² utile, pour la méthode par comparaison' },
    justification_prix: { type: 'string' },
    resume_bien: { type: 'string', description: 'Une phrase qui décrit le bien (surface, niveau, réserve)' },
    description: {
      type: 'object',
      properties: { designation: { type: 'string' }, configuration: { type: 'string' }, facade: { type: 'string' }, equipements: { type: 'string' }, etat: { type: 'string' } },
    },
    emplacement: {
      type: 'object',
      properties: { synthese: { type: 'string' }, type_emplacement: { type: 'string' }, flux: { type: 'string' }, commerces_voisins: { type: 'string' }, environnement: { type: 'string' }, vacance: { type: 'string' }, acces: { type: 'string' }, vigilance: { type: 'string' } },
    },
    locatif: {
      type: 'object',
      properties: { synthese: { type: 'string' }, solidite: { type: 'string' }, valeur_locative: { type: 'string' } },
    },
    juridique: {
      type: 'object',
      properties: { synthese: { type: 'string' }, copropriete: { type: 'string' }, travaux: { type: 'string' }, urbanisme: { type: 'string' }, diagnostics: { type: 'string' }, technique: { type: 'string' }, servitudes: { type: 'string' } },
    },
    lecture_marche: { type: 'string', description: 'Ce que disent les références, 2 à 3 phrases' },
    synthese_methodes: { type: 'string' },
    points_a_traiter: { type: 'array', items: { type: 'string' }, description: 'Ce qu\'il faut régler avant la mise en vente' },
  },
  required: ['taux', 'prix_m2', 'justification_taux', 'description', 'emplacement', 'points_a_traiter'],
};

/** La fiche du mandataire : ce qui figure sur tous ses avis, tenu par l'admin. */
export function signataire(user) {
  const f = Records.list('FicheMandataire').find((x) => x.email === moi(user)) || {};
  const u = Records.list('User').find((x) => String(x.email).toLowerCase() === moi(user)) || {};
  return {
    nom: f.nom_avis || u.full_name || user?.full_name || null,
    qualite: f.qualite_avis || 'agent commercial',
    ville_rsac: f.ville_rsac || null,
    rsac: f.rsac || null,
    carte_t: f.carte_t || null,
    telephone: f.telephone || null,
    email: f.email_avis || moi(user),
    ville_signature: f.ville_signature || null,
    // La photo de la fiche (posée par l'admin ou par le mandataire sur sa
    // page Compte), sinon celle du compte (Google ou déposée).
    photo: f.photo_url || u.picture || null,
    signature: f.signature_url || null,
  };
}

const RESERVES = `Cet avis de valeur ne constitue pas une expertise au sens de la charte de l'expertise en évaluation immobilière. Il n'a pas de valeur opposable devant un tiers ou une juridiction. Il repose sur les documents remis par le demandeur et sur une visite non technique, sans vérification des surfaces par un géomètre. Il est valable 6 mois à compter de sa date, sous réserve d'une évolution significative du marché ou de la situation locative.`;

const jourLong = (d = new Date()) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: PARIS }).replace(/^1 /, '1er ');

/**
 * Rédige l'avis du questionnaire en cours : marché, ventes, deux méthodes,
 * chiffres, textes. Rend l'estimation avec son `avis` prêt à l'éditeur.
 */
export async function rediger(user, { surEtape = null, aLaMain = false, conversationId = null } = {}) {
  const e = enCours(user, conversationId);
  if (!e) return { ok: false, error: 'Aucun avis en cours.' };
  const q = e.questionnaire || {};
  const fonds = q.type_bien === 'fonds_commerce';
  const reste = manquants(q);
  // « À la main » : le mandataire complétera dans l'éditeur ce qui manque.
  if (reste.length && !aLaMain) return { ok: false, manquants: reste, error: `Il manque encore : ${reste.join(', ')}.` };
  // Des chiffres impossibles se signalent au lieu de produire un avis absurde.
  const surf = Number(q.surface_utile);
  if ((q.surface_utile != null || (!aLaMain && !fonds)) && !(surf > 5 && surf < 50000)) return { ok: false, error: `La surface utile enregistrée (${q.surface_utile}) n'est pas plausible : demande-la de nouveau en une ligne, en m².` };
  if (q.occupe && (q.loyer_annuel_hc != null || !aLaMain) && !(Number(q.loyer_annuel_hc) > 500 && Number(q.loyer_annuel_hc) < 20000000)) return { ok: false, error: `Le loyer annuel enregistré (${q.loyer_annuel_hc}) n'est pas plausible : demande-le de nouveau, en € HT HC par an.` };

  // L'adresse précise (BAN) : pour le marché, les ventes, la photo de façade.
  let lieu = null;
  try {
    const { resoudreAdresse } = await import('./adresse-ban.js');
    lieu = await resoudreAdresse(q.adresse);
    if (lieu) surEtape?.(`Adresse reconnue : ${[lieu.numero, lieu.rue].filter(Boolean).join(' ')}, ${lieu.ville || ''}`.trim());
  } catch { /* le marché se lira quand même sur le texte */ }
  // L'avis des murs par le rendement (31 oct. 2026, Jules) ne cite plus de ventes : DVF ne se lit plus pour lui.
  // Libre, le loyer de marché peut manquer : les ventes restent alors le relais.
  // Un fonds ne se vaut pas au prix des murs : ni DVF, ni Equimmox, ses comparables sont des cessions de fonds.
  const sansVentes = fonds || (q.type_bien === 'murs_commerce' && Number(q.taux_base) > 0 && q.occupe && Number(q.loyer_annuel_hc) > 0);
  // Vite (2 nov. 2026, Jules : « la lecture Data-B, Equimmox est trop longue ; juste un taux pour la ville, pondéré ») :
  // des murs occupés se valent loyer ÷ taux ; la valeur locative de marché ne fait qu'un ajustement et une ligne de
  // l'avis. On l'attend quelques secondes (elle est souvent en cache, ou lue en fond pendant les questions) ; au-delà
  // l'avis part sans, et la lecture, continuée en fond, remplit la case dès qu'elle arrive (3 nov. 2026).
  const rapide = sansVentes;
  const avant = (promesse, ms, defaut) => Promise.race([promesse, new Promise((ok) => { setTimeout(() => ok(defaut), Math.max(0, ms)).unref?.(); })]);
  const garde = Records.get(ENTITE, e.id) || e;
  const marcheGarde = lectureFraiche(garde.valeur_locative_lue, q.adresse) ? garde.valeur_locative_lue.resultat : null;
  const emplacementGarde = lectureFraiche(garde.emplacement_lu, q.adresse) ? garde.emplacement_lu.lu || {} : {};
  // Ce qui arrive après la rédaction, posé dans les cases encore vides.
  const suites = [];
  // Les chiffres et les photos de la ville ne dépendent que de la commune : lus pendant le reste, attendus à la fin.
  const commune = lieu?.ville || villeDuTexte(q.adresse);
  const villeP = lieu?.ville
    ? import('./ak/agent.js').then(({ executerOutil }) => executerOutil({ name: 'donnees_commune', input: { commune: lieu.ville } }, user)).then(villeDepuisCommune).catch((err) => { console.warn(`[avis] commune : ${err?.message || err}`); return null; })
    : Promise.resolve(null);
  const photosP = commune
    ? import('./photo-commerce.js').then((m) => m.photosDeLaVille(commune)).catch((err) => { console.warn(`[avis] photo de la ville : ${err?.message || err}`); return []; })
    : Promise.resolve([]);

  // L'emplacement se lit pendant les autres lectures. Lu en fond pendant les questions et complet, il ne se relit pas ;
  // sinon, ce qui arrive en 6 s sert (pressé), le reste complète l'avis ensuite.
  const emplacementComplet = emplacementGarde.vacance && (emplacementGarde.transports_300m || emplacementGarde.acces_300m) && (emplacementGarde.voisins_les_plus_proches || emplacementGarde.commerces_150m || emplacementGarde.commerces_klocka);
  const lireIci = !!lieu && !emplacementComplet;
  let emplacementSuite = () => {};
  const emplacementTardP = rapide && lireIci ? new Promise((ok) => { emplacementSuite = ok; }) : null;
  const emplacementP = lireIci
    ? import('./emplacement-auto.js').then((m) => {
      const p = e.proprietaire_id ? Records.get('ProprietaireMandataire', e.proprietaire_id) : null;
      return m.lireEmplacement(q.adresse, { lieu, user, commerceId: p?.commerce_simple_id || null, ...(rapide ? { delai: 6000, surComplet: (tout) => emplacementSuite(tout ? { ...emplacementGarde, ...tout } : null) } : {}) });
    }).then((lu) => ({ ...emplacementGarde, ...lu })).catch((err) => { console.warn(`[avis] emplacement : ${err?.message || err}`); emplacementSuite(null); return emplacementGarde; })
    : Promise.resolve(emplacementGarde);

  // La valeur locative de marché vient de Data-B (1er nov. 2026, Jules : celle d'Equimmox, des baux existants toutes
  // surfaces confondues, sous-évaluait). Equimmox ne sert plus que si Data-B ne répond pas, et l'avis le dit.
  surEtape?.('Lecture de la valeur locative de marché (Data-B)');
  const marcheP = marcheGarde ? Promise.resolve(marcheGarde) : lireValeurLocative(q.adresse, user, { surEtape, bavard: !rapide });
  const marche = rapide ? await avant(marcheP, 8000, null) : await marcheP;
  if (rapide && !marche) {
    surEtape?.('Valeur locative de marché pas encore lue : elle se posera dans l\u2019avis dès qu\u2019elle arrive');
    suites.push(marcheP.then((lu) => (lu ? { marche: lu } : null)));
  }
  let ventes = null;
  if (!sansVentes) surEtape?.('Les ventes de locaux autour (DVF)');
  if (!sansVentes) try {
    const { ventesAutour } = await import('./dvf.js');
    const r = await ventesAutour(q.adresse, { rayon: 800, user });
    if (r.ok) ventes = r.resultat;
  } catch (err) { console.warn(`[avis] DVF : ${err?.message || err}`); }
  const references = (ventes?.ventes || [])
    .filter((v) => v.prix && v.surface)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 5)
    .map((v) => ({ date: String(v.date || '').slice(0, 4), bien: v.nature || 'Local commercial', adresse: v.adresse || null, surface: Math.round(v.surface), prix: v.prix, prix_m2: v.prix_m2, distance_m: v.distance_m ?? null }));

  const niveau = marche?.rue || marche?.quartier || marche?.ville || null;
  // Le milieu de la fourchette (1er nov. 2026) : la « moyenne » d'Equimmox sortait parfois de sa propre fourchette.
  const loyerMarcheM2 = loyerDeMarcheM2(niveau);

  // Les murs commerciaux, par le taux de rendement (31 oct. 2026, Jules) : le taux de base validé par le mandataire,
  // ajusté par les critères du bien. Occupé, sur le loyer du bail ; libre, sur le loyer de marché. Il fait la valeur :
  // Equimmox et le barème de Data-B ne s'appellent plus pour ces murs.
  let rendement = null;
  if (q.type_bien === 'murs_commerce' && Number(q.taux_base) > 0) {
    const { estimerParRendement, lectureDuTaux } = await import('./taux-rendement.js');
    const loyerDeMarche = loyerMarcheM2 && Number(q.surface_utile) ? loyerMarcheM2 * Number(q.surface_utile) : null;
    const loyerRetenu = q.occupe ? Number(q.loyer_annuel_hc) || null : loyerDeMarche;
    rendement = estimerParRendement(q, { loyer: loyerRetenu, loyerMarche: loyerDeMarche });
    if (rendement) {
      rendement = { ...rendement, lecture: lectureDuTaux(rendement), loyer_de_marche: !q.occupe };
      surEtape?.(`Taux de rendement : ${rendement.lecture}`);
    } else surEtape?.(q.occupe ? 'Pas de loyer pour capitaliser : la comparaison prend le relais' : 'Pas de loyer de marché pour ce local : la comparaison prend le relais');
  }
  let dataB = null;
  if (q.type_bien === 'murs_commerce' && !rendement) {
    surEtape?.('Data-B : taux de rendement des murs pour ce secteur et cette activité');
    try {
      const { rendementDeBase, estimerMurs } = await import('./data-b-murs.js');
      const r = await rendementDeBase(q.adresse, { activite: q.activite_data_b || q.activite_locataire || q.activite || null, user });
      const loyerRetenu = q.occupe ? Number(q.loyer_annuel_hc) || null : (loyerMarcheM2 && Number(q.surface_utile) ? loyerMarcheM2 * Number(q.surface_utile) : null);
      if (r.ok) {
        const criteres = { ...Object.fromEntries(['etat_immeuble', 'etat_local', 'angle', 'extraction', 'parking', 'pmr', 'franchise', 'anciennete_locataire', 'retards_paiement', 'licence_4'].map((k) => [k, q[k]])), date_renouvellement: q.echeance || null };
        const est = estimerMurs({ base: r.resultat.taux_base, loyer: loyerRetenu, criteres });
        if (est) {
          dataB = { ...est, activite: r.resultat.activite, source: r.resultat.source, loyer: loyerRetenu, loyer_de_marche: !q.occupe };
          surEtape?.(`Data-B : ${String(est.taux_base).replace('.', ',')} % pour ${r.resultat.activite}, ajusté à ${String(est.taux).replace('.', ',')} %`);
        } else surEtape?.('Data-B : pas de loyer pour calculer, la comparaison prend le relais');
      } else {
        console.warn(`[avis] Data-B murs : ${r.error}`);
        surEtape?.('Data-B indisponible : le taux se choisit sur les références');
      }
    } catch (err) { console.warn(`[avis] Data-B murs : ${err?.message || err}`); }
  }
  // L'estimation multicritères d'Equimmox (26 oct. 2026, Jules) : offres actuelles, offres anciennes, transactions DVF
  // et capitalisation, pondérées 2-1-1-2 ; son rapport fait la valeur, la fourchette et les comparables de l'avis (et
  // donc du deck). Sans Equimmox (pas configuré, pas de réponse, type non estimable), la méthode d'avant prend le relais.
  let equimmox = null;
  {
    const X = await import('./equimmox-estimation.js');
    const { equimmoxConfigure } = await import('./equimmox.js');
    const classe = X.CLASSE_DU_TYPE[q.type_bien] || null;
    if (classe && equimmoxConfigure() && !rendement) {
      const params = {
        classe, adresse: q.adresse, surface: Number(q.surface_utile) || null, etat: X.etatEquimmox(q),
        annee: Number(q.annee_construction) || null, occupe: !!q.occupe, loyer: q.occupe ? Number(q.loyer_annuel_hc) || null : null,
        // Le taux moyen du secteur : celui de Data-B pour l'activité, avant les ajustements du bien (Jules, 26 oct. 2026).
        taux: dataB?.taux_base || null, investissement: Number(q.investissement_a_prevoir) || null,
      };
      surEtape?.('Equimmox : estimation multicritères (offres, transactions, capitalisation)');
      const r = await X.estimerSurEquimmox(e.id, params, { surEtape, user });
      if (r.ok) equimmox = r.equimmox;
      else surEtape?.(r.manque ? `Equimmox : il manque ${r.manque.join(', ')}, méthode d'avant` : `Equimmox indisponible (${r.error}) : méthode d'avant`);
    }
  }
  // Le fonds de commerce (3 nov. 2026, Jules) : barème, rentabilité, comparables. Les cessions viennent de Data-B,
  // le BODACC en secours (même règle que la carte des cessions) ; vingt secondes au plus, sinon sans comparables.
  let evaluation = null;
  if (fonds) {
    const { evaluerFonds, RAYON_COMPARABLES } = await import('./fonds-valeur.js');
    surEtape?.('Les cessions de fonds autour (Data-B)');
    let transactions = []; let sourceCessions = null;
    try {
      const { transactionsFonds } = await import('./data-b-transactions.js');
      const r = await avant(transactionsFonds(q.adresse, { rayon: RAYON_COMPARABLES, user }), 20000, null);
      if (r?.ok) { transactions = r.resultat.transactions || []; sourceCessions = 'Data-B'; }
    } catch (err) { console.warn(`[avis] cessions Data-B : ${err?.message || err}`); }
    if (!transactions.length) {
      surEtape?.('Data-B sans réponse : les cessions publiées au BODACC');
      try {
        const { cessionsAutour } = await import('./cessions-fonds.js');
        const r = await avant(cessionsAutour(q.adresse, { rayon: RAYON_COMPARABLES, user }), 20000, null);
        if (r?.ok) { transactions = r.resultat.transactions || []; sourceCessions = 'BODACC'; }
      } catch (err) { console.warn(`[avis] cessions BODACC : ${err?.message || err}`); }
    }
    evaluation = evaluerFonds(q, { transactions, source: sourceCessions });
    surEtape?.(evaluation.moyenne
      ? `Fonds : ${evaluation.methodes.map((m) => m.nom.split(' (')[0]).join(', ')} croisés`
      : 'Fonds : ni comptes ni comparables suffisants, la valeur se posera dans l\u2019éditeur');
  }
  const parLeRendement = !!rendement;
  surEtape?.(niveau?.basse != null && niveau?.haute != null
    ? `Loyers de marché : ${Math.round(niveau.basse)} à ${Math.round(niveau.haute)} €/m²/an`
    : 'Marché locatif indisponible : l\u2019avis le dira');
  surEtape?.(references.length
    ? `${references.length} vente${references.length > 1 ? 's' : ''} comparable${references.length > 1 ? 's' : ''} retenue${references.length > 1 ? 's' : ''} (DVF, 800 m)`
    : parLeRendement ? 'Méthode du rendement : sans ventes comparables' : 'Aucune vente comparable exploitable autour');

  // L'emplacement lu depuis la seule adresse (1er nov. 2026, Jules) : la voie, les commerces à 150 m, les transports à
  // 300 m (OpenStreetMap), la vacance de la rue (K-Vacance). La page « Emplacement et commercialité » se remplit seule.
  if (lieu) surEtape?.('Lecture de l\u2019emplacement : les commerces voisins, les transports, la vacance de la rue');
  // Vite aussi : l'emplacement rend ce qu'il a lu en 6 s (lireEmplacement, delai) ; le reste suit, après la rédaction.
  const emplacementLu = await emplacementP;
  if (emplacementTardP) suites.push(emplacementTardP.then((tout) => (tout ? { emplacement: tout } : null)));

  surEtape?.('Choix du taux de rendement et rédaction des analyses');
  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const { resultat: brut } = await mesurer({ operation: 'mandataire', par: user?.email }, () => invokeLLM({
    prompt:
      `Tu rédiges, pour un mandataire du réseau K Partners, un AVIS DE VALEUR de ${TYPES_BIEN[q.type_bien] || 'bien professionnel'}${fonds ? '' : q.occupe ? ' occupé' : ' libre'}. Tout en français. Ton ton : celui d'un professionnel de l'immobilier d'entreprise, phrases courtes, concrètes, sans emphase. N'invente AUCUN fait : ce qui n'est ni dans le questionnaire ni dans les données ne s'écrit pas. Le taux et le prix au m² se justifient par les références ; les chiffres finaux sont calculés par le serveur, tu ne les écris pas.\n\n` +
      `Nous sommes le ${jourLong()}.\n\n` +
      `QUESTIONNAIRE (réponses du mandataire) :\n${JSON.stringify(q, null, 1).slice(0, 6000)}\n\n` +
      `VALEUR LOCATIVE DE MARCHÉ (€ HT HC/m²/an, ${marche?.source || 'source indisponible'}) — la « valeur locative de marché » de l'avis cite la fourchette de la RUE telle quelle, sans la baisser ni la moyenner avec autre chose :\n${marche ? JSON.stringify({ rue: marche.rue, quartier: marche.quartier, ville: marche.ville, source: marche.source }).slice(0, 2500) : '(indisponible)'}\n\n` +
      `EMPLACEMENT LU À L'ADRESSE (sans le mandataire) : ${Object.keys(emplacementLu).length ? JSON.stringify(emplacementLu).slice(0, 4000) : '(indisponible)'}\n` +
      `Avec ces données, remplis TOUJOURS l'emplacement, ligne par ligne, chiffré, sans aucune source entre parenthèses : type_emplacement (rue piétonne, axe principal, rue de desserte, et le rang de la rue s'il est dans le questionnaire) ; flux (quelques mots, sans phrase ni chiffre, comme « Quartier dense et résidentiel ») ; commerces_voisins (seulement « n commerces à 150 m », rien d'autre) ; vacance : seulement « x % (taux estimé) », sans phrase ni comparaison ; acces (métro, tram, gare, bus, parkings à 300 m) ; environnement (une phrase d'ensemble). Ce que le mandataire a dit passe devant. Une rubrique dont rien ne parle reste vide.\n\n` +
      `ÉCRITURE (3 nov. 2026, Jules : « gagner la confiance, qu'on n'ait pas à tout relire ») : aucune étiquette de provenance entre parenthèses, ni « (mandataire) », ni « (fiche) », ni « (OpenStreetMap) », « (Google Maps) », « (K-Vacance) », « (Data-B) » : le fait s'écrit tel quel (« emplacement n°1 bis »). Jamais « à confirmer », « à vérifier », « semble », « a priori », « probablement », « depuis longtemps » ni rien qui demande de relire : ce qui est dit s'écrit factuellement (« présente depuis 2018 ») ; ce que rien ne dit ne s'écrit pas, le champ reste vide.\n` +
      `JURIDIQUE ET TECHNIQUE : seulement ce que le mandataire a signalé (clés juridique, copropriete, travaux_votes, urbanisme, diagnostics, servitudes du questionnaire), repris tel quel ; rien de signalé, ou « non » : tous les champs juridique vides.\n\n` +
      (parLeRendement || fonds
        ? `CE QUE L'AVIS DIT ET NE DIT PAS (31 oct. 2026) : l'emplacement DÉCRIT l'environnement (zone piétonne ou non, rue commerçante, commerces et enseignes voisins, flux, transports, stationnement) et la vacance locative de la rue ; il ne cite JAMAIS de ventes, de nombre de ventes, de DVF ni de prix au m² de ventes. vigilance et points_a_traiter ne vont PAS dans l'avis : ce sont des notes pour le mandataire (un doute, une incohérence, un document à demander), que l'assistant lui dira dans le chat ; écris-les là, courtes. lecture_marche : vide. prix_m2 : 0.\n\n`
        : `VENTES DE LOCAUX AUTOUR (DVF, 800 m) :\n${references.length ? JSON.stringify(references) : '(aucune vente exploitable)'}${ventes?.prix_m2 ? `\nPrix au m² des ventes : bas ${ventes.prix_m2.bas}, médian ${ventes.prix_m2.median}, haut ${ventes.prix_m2.haut}` : ''}\n\n`) +
      (fonds
        ? `FONDS DE COMMERCE : la valeur est CALCULÉE par le serveur en croisant ${evaluation.methodes.length ? evaluation.methodes.map((m) => `${m.nom} ${m.milieu.toLocaleString('fr-FR')} € (poids ${m.poids})`).join(' ; ') : 'aucune méthode (comptes et comparables manquants)'}${evaluation.ecartees.length ? `. Écartées : ${evaluation.ecartees.map((x) => `${x.cle} (${x.raison})`).join(' ; ')}` : ''}. Rends taux = 0 et prix_m2 = 0. synthese_methodes : en 2 à 3 phrases, pourquoi ces méthodes et ce qu'elles disent ensemble (la rentabilité pèse double, c'est celle des banquiers). justification_taux : vide. lecture_marche : ce que disent les cessions de la même activité autour, sans réécrire les chiffres. La description et l'emplacement parlent du COMMERCE exploité (activité, clientèle, emplacement), pas des murs.`
        : rendement
        ? `TAUX IMPOSÉ PAR LA MÉTHODE DU RENDEMENT : ${rendement.taux} % (${rendement.lecture}). Valeur = loyer ${rendement.loyer_de_marche ? 'de marché' : 'du bail'} ${Math.round(rendement.loyer).toLocaleString('fr-FR')} € ÷ ${rendement.taux} %. Rends taux = ${rendement.taux} et justifie-le en 2 à 3 phrases : le taux de base de la ville, puis chacun de ces ajustements, sans en ajouter.`
        : equimmox
        ? `VALEUR IMPOSÉE PAR EQUIMMOX (estimation multicritères, ${equimmox.rapport.methodes.map((m) => `${m.nom} ${m.valeur?.toLocaleString('fr-FR')} € coef. ${m.coefficient}`).join(' ; ')}) : ${equimmox.rapport.valeur.toLocaleString('fr-FR')} €.${equimmox.rapport.capitalisation ? ` Taux de capitalisation moyen du secteur : ${equimmox.rapport.capitalisation.taux} % (Data-B). Rends taux = ${equimmox.rapport.capitalisation.taux}.` : ''} Rends prix_m2 = ${equimmox.rapport.valeur_m2}. Justifie le taux et le prix en citant Equimmox et ses comparables, sans réécrire les chiffres. ENVIRONNEMENT (Equimmox) : ${equimmox.rapport.environnement.join(' ; ').slice(0, 1500)}`
        : dataB
        ? `TAUX IMPOSÉ PAR DATA-B : ${dataB.taux} % (taux du secteur pour l'activité « ${dataB.activite} » : ${dataB.taux_base} %, ajusté : ${dataB.ajustements.map((a) => `${a.motif} ${a.delta > 0 ? '+' : ''}${a.delta}`).join(', ') || 'aucun ajustement'}). Rends taux = ${dataB.taux} et justifie-le en citant Data-B et ces ajustements. Choisis seulement un prix au m² utile cohérent avec les ventes.`
        : `Choisis un taux de rendement brut cohérent (murs commerciaux en France : 5 à 9 % le plus souvent ; bureaux et activité un peu plus haut) et un prix au m² utile cohérent avec les ventes.`),
    response_json_schema: SCHEMA_AVIS,
    // Réflexion moyenne (3 nov. 2026, Jules : « ça prend trop de temps ») : 11 s au lieu de 26 s, la valeur et le taux
    // étant calculés par le serveur, le modèle n'écrit que les textes.
    effort: 'medium',
  }));
  if (!brut || typeof brut !== 'object') return { ok: false, error: 'La rédaction n\'a rien rendu : réessayez.' };

  const taux = fonds ? null : rendement?.taux || equimmox?.rapport.capitalisation?.taux || (dataB ? dataB.taux : Math.min(12, Math.max(3.5, Number(brut.taux) || 6.5)));
  surEtape?.(fonds ? 'Calcul des valeurs' : `Taux retenu : ${String(taux).replace('.', ',')} % · calcul des valeurs`);
  const prixM2 = parLeRendement || fonds ? null : equimmox?.rapport.valeur_m2 || Number(brut.prix_m2) || ventes?.prix_m2?.median || null;
  // Equimmox fait la valeur (arrondie au millier) et la fourchette ; chiffrer en tire le reste (rendement, prix affiché…).
  const parRendement = rendement ? { moyenne: rendement.moyenne, basse: rendement.basse, haute: rendement.haute } : null;
  const parFonds = evaluation?.moyenne ? { moyenne: evaluation.moyenne, basse: evaluation.basse, haute: evaluation.haute } : null;
  const parEquimmox = equimmox ? { moyenne: Math.round(equimmox.rapport.valeur / 1000) * 1000, basse: equimmox.fourchette?.bas || null, haute: equimmox.fourchette?.haut || null } : null;
  // Sans loyer ni surface, la valeur reste à poser dans l'éditeur, qui recalcule le reste.
  const chiffres = chiffrer(q, { taux, prix_m2: prixM2, loyer_marche_m2: loyerMarcheM2, dataB: parFonds || parRendement || parEquimmox || dataB })
    || (aLaMain ? { valeur: null, bas: null, haut: null, rendement: null, ecart_methodes: null, honoraires_pct: 5, frais_pct: 7.5, prix_affiche: null, cout_total: null } : null);
  if (!chiffres) return { ok: false, error: 'Impossible de chiffrer : il faut un loyer (bien occupé) ou une surface et des ventes comparables.' };

  surEtape?.(chiffres.valeur
    ? `Valeur : ${chiffres.valeur.toLocaleString('fr-FR')} € (fourchette ${chiffres.bas?.toLocaleString('fr-FR')} – ${chiffres.haut?.toLocaleString('fr-FR')} €)`
    : 'Chiffres incomplets : la valeur se posera dans l\u2019éditeur');
  surEtape?.('Mise en page de l\u2019avis dans l\u2019éditeur');
  const s = signataire(user);
  const loyerM2 = q.occupe && q.loyer_annuel_hc && q.surface_utile ? Math.round(q.loyer_annuel_hc / q.surface_utile) : null;
  // Ce que l'avis ne dit pas, pour le chat : les doutes et les points à régler avant la mise en vente.
  const aSignaler = [brut.emplacement?.vigilance, ...(brut.points_a_traiter || [])].filter((x) => x && !/^aucun/i.test(String(x).trim())).slice(0, 6);
  // Les textes du modèle sans étiquette de source ni « à confirmer » (3 nov. 2026, Jules) ; les lignes lues à
  // l'adresse (commerces voisins, accès, vacance) écrites sans modèle quand il les laisse vides.
  const net = { description: nettoyerTextes(brut.description || {}), emplacement: nettoyerTextes(brut.emplacement || {}), locatif: nettoyerTextes(brut.locatif || {}), juridique: nettoyerTextes(brut.juridique || {}) };
  const lues = lignesDeLEmplacement(emplacementLu);
  const ouLu = (texte, cle) => (caseVide(texte) ? lues[cle] || '' : texte);
  const vacanceDite = Number(q.vacance_rue_pct) > 0 ? `${Number(q.vacance_rue_pct).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : null;
  const juridiqueDit = juridiqueSignale(q);
  const avis = {
    version: 1,
    methode: fonds ? 'fonds' : rendement ? 'rendement' : null,
    type_bien: q.type_bien,
    type_libelle: TYPES_BIEN[q.type_bien] || 'Bien professionnel',
    occupe: !!q.occupe,
    date: jourLong(),
    bien: {
      rue: lieu ? [lieu.numero, lieu.rue].filter(Boolean).join(' ') : q.adresse,
      ville: lieu ? `${lieu.code_postal || ''} ${lieu.ville || ''}`.trim() : '',
      adresse: q.adresse,
      lat: lieu?.lat ?? null,
      lon: lieu?.lon ?? null,
    },
    demandeur: q.demandeur || '[à compléter]',
    signataire: s,
    cadre: {
      objet: fonds ? 'Estimer la valeur du fonds de commerce en vue d\'une éventuelle cession' : `Estimer la valeur vénale ${q.type_bien === 'murs_commerce' ? 'des murs' : 'du bien'} en vue d'une éventuelle cession`,
      bien: fonds ? `Fonds de commerce${evaluation?.activite ? ` (${evaluation.activite})` : ''}, ${q.adresse}` : `${TYPES_BIEN[q.type_bien] || 'Bien'}${q.occupe ? ' occupé' : ' libre'}, ${q.adresse}`,
      visite: q.date_visite ? `Réalisée le ${q.date_visite}${q.visite_avec ? ` en présence ${q.visite_avec}` : ''}` : '[à compléter]',
    },
    description: {
      resume: sansEtiquettes(brut.resume_bien) || (q.surface_utile ? `${q.surface_utile} m² utiles.` : ''),
      lignes: [
        ['Désignation', net.description.designation],
        ['Configuration', net.description.configuration],
        ...(q.type_bien === 'murs_commerce' ? [['Façade', net.description.facade]] : []),
        ['Équipements', net.description.equipements],
        ['État', net.description.etat],
      ].filter(([, v]) => !caseVide(v)).map(([mot, texte]) => ({ mot, texte })),
      surfaces: surfacesDe(q),
    },
    emplacement: {
      synthese: net.emplacement.synthese || '',
      lignes: [['Type d\'emplacement', net.emplacement.type_emplacement], ['Flux', net.emplacement.flux], ['Commerces voisins', lues.commerces_voisins || net.emplacement.commerces_voisins], ['Environnement', net.emplacement.environnement], ['Vacance', vacanceDite || vacanceEstimee(emplacementLu) || ouLu(net.emplacement.vacance, 'vacance')], ['Accès', ouLu(net.emplacement.acces, 'acces')]]
        .filter(([, v]) => !caseVide(v)).map(([mot, texte, alerte]) => ({ mot, texte, alerte: !!alerte })),
    },
    // Le fonds occupe un bail : son loyer et son échéance pèsent sur sa valeur, la page les montre.
    locatif: q.occupe || (fonds && (q.loyer_annuel_hc || q.echeance)) ? {
      lignes: [
        ['Locataire', [q.locataire, q.activite_locataire].filter(Boolean).join(', ')],
        ['Bail', [q.bail_type, q.date_effet ? `à effet du ${q.date_effet}` : null].filter(Boolean).join(', ')],
        ['Échéance', q.echeance],
        ['Loyer', q.loyer_annuel_hc ? `${Number(q.loyer_annuel_hc).toLocaleString('fr-FR')} € HT HC par an${loyerM2 ? `, soit ${loyerM2} €/m²` : ''}` : null],
        ['Indexation', q.indexation],
        ['Taxe foncière', q.taxe_fonciere],
        ['Charges', q.charges],
        ['Dépôt de garantie', q.depot_garantie],
        ['Paiements', q.paiements],
      ].filter(([, v]) => v).map(([mot, texte]) => ({ mot, texte: sansEtiquettes(String(texte)) })),
      synthese: net.locatif.synthese || '',
      solidite: net.locatif.solidite || '',
      // Écrite depuis Data-B (Equimmox en repli), jamais par le modèle (3 nov. 2026, Jules) ; sans lecture à temps,
      // elle se pose dès qu'elle arrive (completerApres).
      valeur_locative: phraseValeurLocative(marche, { surface: q.surface_utile, loyer: q.loyer_annuel_hc }) || '',
    } : null,
    // Seulement ce que le mandataire a signalé (3 nov. 2026, Jules) : rien, ou « non », et la page ne paraît pas.
    juridique: juridiqueDit ? (() => {
      const lignes = [['Copropriété', net.juridique.copropriete], ['Travaux votés', net.juridique.travaux, true], ['Urbanisme', net.juridique.urbanisme], ['Diagnostics', net.juridique.diagnostics], ['Technique', net.juridique.technique, true], ['Servitudes', net.juridique.servitudes]]
        .filter(([, v]) => !caseVide(v) && !RIEN_A_SIGNALER.test(String(v))).map(([mot, texte, alerte]) => ({ mot, texte, alerte: !!alerte && !/aucun/i.test(texte) }));
      return { synthese: net.juridique.synthese || juridiqueDit.libre || '', lignes: lignes.length ? lignes : juridiqueDit.lignes };
    })() : { synthese: '', lignes: [] },
    // Par le rendement, plus d'analyse de marché : seuls les loyers de marché restent (la valeur locative du deck).
    marche: fonds ? {
      synthese: evaluation?.comparables.nombre ? `${evaluation.comparables.nombre} cession${evaluation.comparables.nombre > 1 ? 's' : ''} de fonds de la même activité publiée${evaluation.comparables.nombre > 1 ? 's' : ''} autour depuis cinq ans.` : 'Peu de cessions de fonds de la même activité ont été publiées autour.',
      references: (evaluation?.comparables.retenues || []).map((t) => ({ date: String(t.date || '').slice(0, 4), bien: t.activite || 'Fonds de commerce', adresse: t.adresse || null, surface: null, prix: Number(t.prix) || null, prix_m2: null, distance_m: t.distance_m ?? null })),
      source: evaluation?.comparables.source ? `Source : ${evaluation.comparables.source}, cessions de fonds de commerce publiées, rayon d'un kilomètre, cinq ans.` : '',
      loyers: niveau ? { basse: niveau.basse ?? null, haute: niveau.haute ?? null, source: marche?.source || null } : null,
      lecture: brut.lecture_marche || '',
    } : parLeRendement ? {
      synthese: '', references: [], source: '', lecture: '',
      loyers: niveau ? { basse: niveau.basse ?? null, haute: niveau.haute ?? null, source: marche?.source || null } : null,
    } : equimmox ? {
      synthese: `${equimmox.rapport.methodes.filter((m) => m.moyenne_m2).map((m) => `${m.nom} : ${m.bas_m2.toLocaleString('fr-FR')} à ${m.haut_m2.toLocaleString('fr-FR')} € par m², moyenne ${m.moyenne_m2.toLocaleString('fr-FR')} €`).join('. ')}.`,
      // Les ventes DVF d'abord (ce sont des ventes signées), puis les offres actuelles et anciennes.
      references: [['transactions', 'Vente DVF'], ['offres_actuelles', 'Offre actuelle'], ['offres_anciennes', 'Offre ancienne']].flatMap(([cle, mot]) => (equimmox.comparables[cle]?.retenus || []).map((c) => ({
        date: String(c.date || '').slice(0, 4), bien: mot, adresse: c.adresse, surface: c.surface, prix: c.prix, prix_m2: c.prix_m2, distance_m: c.distance_m, raison: c.raison,
      }))),
      source: `Source : Equimmox, estimation multicritères du ${new Date(equimmox.le).toLocaleDateString('fr-FR')} (offres actuelles, offres anciennes, transactions DVF${equimmox.rapport.capitalisation ? ', capitalisation' : ''}).`,
      loyers: niveau ? { basse: niveau.basse ?? null, haute: niveau.haute ?? null, source: marche?.source || null } : null,
      lecture: brut.lecture_marche || '',
    } : {
      synthese: ventes?.prix_m2 ? `Les locaux vendus autour se sont échangés entre ${ventes.prix_m2.bas.toLocaleString('fr-FR')} et ${ventes.prix_m2.haut.toLocaleString('fr-FR')} € par m², médiane ${ventes.prix_m2.median.toLocaleString('fr-FR')} €.` : 'Peu de ventes de locaux comparables ont été publiées autour du bien.',
      references,
      source: references.length ? `Sources : DVF (Demandes de valeurs foncières), ${ventes?.annees?.join(', ') || ''}, rayon de 800 m.` : '',
      loyers: niveau ? { basse: niveau.basse ?? null, haute: niveau.haute ?? null, source: marche?.source || null } : null,
      lecture: brut.lecture_marche || '',
    },
    methodes: {
      synthese: brut.synthese_methodes || '',
      taux, justification_taux: fonds ? '' : brut.justification_taux,
      // Les trois méthodes du fonds, leurs bases, coefficients et poids : la page « Méthode » les montre.
      fonds: evaluation ? { activite: evaluation.activite, secteur: evaluation.secteur, ca_moyen: evaluation.ca_moyen, ebe_moyen: evaluation.ebe_moyen, exercices: evaluation.exercices,
        methodes: evaluation.methodes.map(({ retenues: _r, ...m }) => m), ecartees: evaluation.ecartees } : null,
      rendement: rendement ? { taux_base: rendement.taux_base, ajustements: rendement.ajustements, taux_bas: rendement.taux_bas, taux_haut: rendement.taux_haut } : null,
      source_taux: rendement ? `Méthode du rendement : ${rendement.lecture}` : equimmox?.rapport.capitalisation ? `Taux moyen du secteur${dataB ? ` (${dataB.source} · ${dataB.activite})` : ''}, retenu par Equimmox` : dataB ? `${dataB.source} · ${dataB.activite}` : null,
      // Les quatre méthodes d'Equimmox et leur poids : la page « Le calcul » du deck les montre.
      equimmox: equimmox ? { valeur_brute: equimmox.rapport.valeur, methodes: equimmox.rapport.methodes, fourchette: equimmox.fourchette, le: equimmox.le } : null,
      prix_m2: prixM2, justification_prix: brut.justification_prix || '',
      loyer: q.occupe ? Number(q.loyer_annuel_hc) || null : rendement?.loyer ? Math.round(rendement.loyer) : dataB?.loyer ? Math.round(dataB.loyer) : null,
      surface: Number(q.surface_utile) || null,
    },
    chiffres: fonds ? { ...chiffres, capitalisation: null } : chiffres,
    conclusion: {
      // Plus de « points à traiter » dans l'avis (31 oct. 2026, Jules) : ils se disent dans le chat.
      points: [],
      reserves: RESERVES,
      fait_a: s.ville_signature || (lieu?.ville || '[ville]'),
    },
    photos: { couverture: null, emplacement: null },
  };

  // Les chiffres de la commune pour la page « La ville » du deck (26 oct. 2026) : données publiques, gardés avec l'avis.
  if (lieu?.ville) surEtape?.(`Les chiffres de ${lieu.ville} (INSEE, Le Figaro)`);
  const ville = await villeP;
  if (ville) avis.ville = ville;
  // Une belle photo de la ville pour la page « La ville » et la couverture (1er nov. 2026, Jules : automatiquement).
  // Plusieurs au choix (1er nov. 2026, Jules) : la première sert d'office, le mandataire choisit dans le chat.
  if (commune) surEtape?.(`Des photos de ${commune}`);
  const photosVille = (await photosP) || [];
  if (photosVille[0]) avis.photos = { ...avis.photos, ville: photosVille[0].url, ville_auteur: photosVille[0].auteur || null };
  // Les retouches faites à la main pendant les questions se reposent sur l'avis rédigé.
  const avisFinal = appliquerSurcouche(avis, Records.get(ENTITE, e.id)?.surcouche);
  Records.update(ENTITE, e.id, {
    avis: avisFinal, questionnaire_en_cours: false, statut: 'prete', prete_le: new Date().toISOString(),
    rapport: { prix_bas: chiffres.bas, prix_haut: chiffres.haut, synthese: chiffres.valeur ? `Valeur estimée ${chiffres.valeur.toLocaleString('fr-FR')} € net vendeur hors droits.` : 'Valeur à compléter dans l\'avis.', rendement: chiffres.rendement ? (rendement ? { bas: rendement.taux_bas, haut: rendement.taux_haut } : { bas: taux - 0.15, haut: taux + 0.2 }) : null, genere_le: new Date().toISOString() },
    historique: [...(e.historique || []), { le: new Date().toISOString(), par: user?.email || null, action: 'avis de valeur rédigé' }],
    // Les lectures faites, gardées pour la rédaction suivante (sept jours, même adresse).
    ...(marche && !marcheGarde ? { valeur_locative_lue: { adresse: q.adresse, le: new Date().toISOString(), resultat: marche } } : {}),
    ...(lireIci && Object.keys(emplacementLu).length ? { emplacement_lu: { adresse: q.adresse, le: new Date().toISOString(), lu: emplacementLu } } : {}),
    // L'éditeur relit l'avis tant que des lectures peuvent encore le compléter (EditeurAvis.jsx).
    complement_en_fond_jusqu_a: suites.length ? new Date(Date.now() + 90000).toISOString() : null,
  });
  // Ce qui arrive après la rédaction se pose dans les cases restées vides, une fois l'avis enregistré.
  if (suites.length) {
    Promise.all(suites.map((p) => p.then((x) => (x ? completerApres(e.id, x) : null)).catch((err) => console.warn(`[avis] complément : ${err?.message || err}`))))
      .finally(() => { if (Records.get(ENTITE, e.id)) Records.update(ENTITE, e.id, { complement_en_fond_jusqu_a: null }); });
  }
  return { ok: true, estimation_id: e.id, valeur: chiffres.valeur, bas: chiffres.bas, haut: chiffres.haut, rendement: chiffres.rendement, a_completer: reste,
    ...(rendement ? { taux_retenu: rendement.lecture } : {}), ...(aSignaler.length ? { a_signaler_au_mandataire: aSignaler } : {}),
    ...(photosVille.length > 1 ? { photos_ville: photosVille } : {}) };
}

/**
 * La photo de couverture choisie parmi celles de la ville (1er nov. 2026, Jules : « on choisit laquelle on veut »).
 * Avant la rédaction, elle attend dans la surcouche comme une photo envoyée ; seule une photo gardée par le serveur
 * (/uploads/) se pose.
 */
export function poserPhotoDeCouverture(id, url, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  if (!/^\/uploads\/[\w./-]+$/.test(String(url || '')) || String(url).includes('..')) return { ok: false, error: 'Photo inconnue.' };
  if (!e.avis) {
    const sc = e.surcouche || {};
    Records.update(ENTITE, e.id, { surcouche: { ...sc, photos: { ...(sc.photos || {}), couverture: url } } });
    return { ok: true };
  }
  Records.update(ENTITE, e.id, { avis: { ...e.avis, photos: { ...(e.avis.photos || {}), couverture: url } }, avis_retouche_le: new Date().toISOString() });
  return { ok: true };
}

/** Pure : la ligne Vacance de l'avis, un chiffre seul (1er nov. 2026, Jules) : « 15,3 % (taux estimé) ». */
export function vacanceEstimee(emplacement) {
  const t = Number(emplacement?.vacance?.taux_estime);
  return emplacement?.vacance?.taux_estime != null && Number.isFinite(t) ? `${t.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % (taux estimé)` : null;
}

// --- Écrire sans étiquette ni « à confirmer » (3 nov. 2026, Jules) ------------------
//
// « Gagner la confiance, qu'on n'ait pas à tout relire » : l'avis ne dit pas d'où vient un fait (« n°1 bis
// (mandataire) », « (OpenStreetMap) ») et ne demande pas de vérifier (« présente depuis longtemps, à confirmer ») :
// soit on sait et on l'écrit (« présente depuis 2018 »), soit on ne l'écrit pas. Le modèle en a la consigne ; ce
// filtre retire ce qui passe quand même, et ce que le fil du bien porte déjà (« 2027 (dit par l'exploitante, à
// confirmer) »). « (taux estimé) », voulu par Jules le 1er nov., n'est pas une étiquette de source : il reste.

const ETIQUETTE = /^(?:sources?\s*:\s*.*|(?:dit|dite|déclaré|déclarée|indiqué|indiquée|précisé|précisée|communiqué|communiquée|donné|donnée)s?\s+par\s+.+|selon\s+.+|d['’]après\s+.+|(?:le |la |l['’])?(?:mandataire|fiche|fiche du bien|questionnaire|fil|fil du bien|compte rendu(?: de visite)?|visite|registre)|openstreetmap|osm|google(?: maps| places)?|k-vacance|sirene|bodacc|data-b|equimmox|insee|dvf|le figaro|api géo|klocka|à (?:confirmer|vérifier|préciser)|non vérifiée?s?|non confirmée?s?)$/i;

/** Pure : un texte de l'avis sans étiquette de provenance entre parenthèses ni « à confirmer ». */
export function sansEtiquettes(texte) {
  if (typeof texte !== 'string' || !texte) return texte;
  let t = texte.replace(/\s*\(([^()]{1,90})\)/g, (tout, dedans) => (dedans.split(/\s*[,;·/]\s*|\s+et\s+/).every((m) => ETIQUETTE.test(m.trim())) ? '' : tout));
  t = t.replace(/\s*[,;–—-]\s*(?:à confirmer|à vérifier|à préciser)(?:\s+(?:avec|par|sur|auprès)\s+[^.;,]+)?(?=\s*[.;,]|\s*$)/gi, '')
    .replace(/\s+(?:à confirmer|à vérifier)(?=\s*[.;,]|\s*$)/gi, '');
  return t.replace(/\s+([.,])/g, '$1').replace(/[ \t]{2,}/g, ' ').replace(/,\s*\./g, '.').trim();
}

/** Pure : tous les textes d'un objet de l'avis passés par sansEtiquettes. */
export function nettoyerTextes(v) {
  if (typeof v === 'string') return sansEtiquettes(v);
  if (Array.isArray(v)) return v.map(nettoyerTextes);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nettoyerTextes(x)]));
  return v;
}

// Une réponse qui dit qu'il n'y a rien à signaler côté juridique et technique.
const RIEN_A_SIGNALER = /^\s*(?:non|nan|rien|aucun|aucune|ras|r\.a\.s\.?|néant|nc|non concerné|rien à signaler|non,?\s*rien(?: à signaler)?|non,?\s*aucun(?:e)?|pas que je sache|je ne sais pas|rien de particulier|non,?\s*rien de particulier)\s*[.!]?\s*$/i;

/**
 * Pure : ce que le mandataire a signalé côté juridique et technique (3 nov. 2026, Jules : « si la réponse est non,
 * la section n'apparaît pas »). Rend les lignes et le texte libre, ou null s'il n'y a rien.
 */
export function juridiqueSignale(q = {}) {
  const dit = (v) => v != null && String(v).trim() !== '' && v !== false && !RIEN_A_SIGNALER.test(String(v));
  const lignes = [['Copropriété', q.copropriete], ['Travaux votés', q.travaux_votes, true], ['Urbanisme', q.urbanisme], ['Diagnostics', q.diagnostics], ['Servitudes', q.servitudes]]
    .filter(([, v]) => dit(v)).map(([mot, texte, alerte]) => ({ mot, texte: sansEtiquettes(String(texte)), ...(alerte ? { alerte: true } : {}) }));
  const libre = dit(q.juridique) ? sansEtiquettes(String(q.juridique)) : '';
  return lignes.length || libre ? { lignes, libre } : null;
}

/**
 * Pure : la valeur locative de marché de l'avis, écrite depuis la lecture Data-B (ou Equimmox en repli), sans
 * modèle (3 nov. 2026, Jules : elle restait vide). La fourchette de la rue telle quelle, son milieu sur la surface,
 * et où se place le loyer en place. null sans lecture.
 */
export function phraseValeurLocative(marche, { surface = null, loyer = null } = {}) {
  const n = marche?.rue || marche?.quartier || marche?.ville || null;
  const m2 = loyerDeMarcheM2(n);
  if (!m2) return null;
  const b = Number(n.basse), h = Number(n.haute);
  const ou = marche.rue ? 'dans la rue' : marche.quartier ? 'dans le quartier' : 'dans la ville';
  const e = (x) => Math.round(x).toLocaleString('fr-FR');
  const source = /equimmox/i.test(marche.source || '') ? 'Equimmox' : 'Data-B';
  const fourchetteM2 = b > 0 && h > 0 && b !== h ? `entre ${e(b)} et ${e(h)} € HT HC par m² et par an ${ou}` : `autour de ${e(m2)} € HT HC par m² et par an ${ou}`;
  const s = Number(surface) || null;
  const annuel = s ? `, soit environ ${montantLoyer(m2 * s)} par an pour ${e(s)} m²` : '';
  let place = '';
  const enPlace = s && Number(loyer) > 0 ? Number(loyer) / s : null;
  if (enPlace && b > 0 && h > 0) place = ` Le loyer en place, ${e(enPlace)} € par m², se situe ${enPlace < b ? 'sous la fourchette' : enPlace > h ? 'au-dessus de la fourchette' : 'dans la fourchette'}.`;
  return `Selon ${source}, la valeur locative de marché se situe ${fourchetteM2}${annuel}.${place}`;
}
const montantLoyer = (v) => (v >= 1e6 ? `${(Math.round(v / 1e5) / 10).toLocaleString('fr-FR')} M€` : `${(Math.round(v / 100) * 100).toLocaleString('fr-FR')} €`);

// --- Lu en fond dès l'adresse connue (3 nov. 2026, Jules) ----------------------------
//
// La valeur locative (Data-B, Equimmox en repli) et l'emplacement (commerces voisins, transports, vacance) se lisent
// pendant les questions et se gardent sur l'estimation : à la rédaction, ils sont là sans attendre. Ce qui arrive
// après la rédaction (lecture lente) complète l'avis sans le bloquer, seulement dans les cases restées vides.

const FRAIS_JOURS = 7;
/** Pure : une lecture gardée qui sert encore (même adresse, moins de sept jours). */
export const lectureFraiche = (garde, adresse, maintenant = Date.now()) =>
  !!(garde && adresse && garde.adresse === adresse && maintenant - Date.parse(garde.le || 0) < FRAIS_JOURS * 86400000);

/** La valeur locative de marché : Data-B (cache compris), Equimmox en repli, jamais un modèle ni DVF. */
export async function lireValeurLocative(adresse, user, { surEtape = null, bavard = true } = {}) {
  let lu = null;
  try {
    const D = await import('./data-b.js');
    if (D.dataBConfigure()) {
      const r = await D.valeurLocative(adresse, { user });
      if (r.ok) lu = r.resultat;
      else console.warn(`[avis] Data-B valeur locative : ${r.error}`);
    }
  } catch (err) { console.warn(`[avis] Data-B valeur locative : ${err?.message || err}`); }
  if (!lu) {
    if (bavard) surEtape?.('Data-B indisponible : la valeur locative se lit chez Equimmox (baux existants)');
    try {
      const { valeurLocative } = await import('./valeur-locative.js');
      const r = await valeurLocative(adresse, { user });
      if (r.ok) lu = { ...r.resultat, source: 'Equimmox · baux existants (Data-B indisponible)' };
    } catch (err) { console.warn(`[avis] marché : ${err?.message || err}`); }
  }
  return lu;
}

const enFond = new Map();
/** Les lectures de l'avis, lancées en fond et gardées sur l'estimation ; jamais pendant les tests. */
export function prechaufferAvis(estimationId, user = null) {
  if (process.env.NODE_TEST_CONTEXT) return;
  const e = Records.get(ENTITE, estimationId);
  const adresse = e?.questionnaire?.adresse || e?.adresse;
  // Une tentative par adresse et par quart d'heure : noter_reponses passe ici à chaque réponse.
  const deja = enFond.get(estimationId);
  if (!adresse || (deja?.adresse === adresse && Date.now() - deja.le < 15 * 60000)) return;
  const vl = lectureFraiche(e.valeur_locative_lue, adresse);
  const em = lectureFraiche(e.emplacement_lu, adresse) && Object.keys(e.emplacement_lu.lu || {}).length;
  if (vl && em) return;
  if (enFond.size > 500) enFond.clear();
  enFond.set(estimationId, { adresse, le: Date.now() });
  (async () => {
    const garder = (champ, valeur) => { if (Records.get(ENTITE, estimationId)) Records.update(ENTITE, estimationId, { [champ]: { adresse, le: new Date().toISOString(), ...valeur } }); };
    await Promise.all([
      vl ? null : lireValeurLocative(adresse, user, { bavard: false }).then((r) => { if (r) garder('valeur_locative_lue', { resultat: r }); }),
      em ? null : (async () => {
        const lieu = await (await import('./adresse-ban.js')).resoudreAdresse(adresse);
        if (!lieu) return;
        const p = e.proprietaire_id ? Records.get('ProprietaireMandataire', e.proprietaire_id) : null;
        const lu = await (await import('./emplacement-auto.js')).lireEmplacement(adresse, { lieu, user, commerceId: p?.commerce_simple_id || null });
        if (Object.keys(lu).length) garder('emplacement_lu', { lu });
      })(),
    ]);
  })().catch((err) => console.warn(`[avis] lecture en fond : ${err?.message || err}`));
}

/** Pure : une case de l'avis encore vide (rien, ou « [à compléter] »). */
const caseVide = (t) => !String(t ?? '').replace(/\[à compléter\]/g, '').trim();

/**
 * Pure : l'avis complété par une lecture arrivée après la rédaction, seulement dans les cases restées vides (une
 * retouche du mandataire ne se remplace jamais). Rend { avis, change }.
 */
export function completerAvecLectures(avis, { marche = null, emplacement = null, q = {} } = {}) {
  if (!avis) return { avis, change: false };
  let a = avis;
  let change = false;
  if (marche && a.locatif && caseVide(a.locatif.valeur_locative)) {
    const phrase = phraseValeurLocative(marche, { surface: q.surface_utile, loyer: q.occupe ? q.loyer_annuel_hc : null });
    if (phrase) { a = { ...a, locatif: { ...a.locatif, valeur_locative: phrase } }; change = true; }
  }
  if (marche && a.marche && !a.marche.loyers) {
    const n = marche.rue || marche.quartier || marche.ville;
    if (n) { a = { ...a, marche: { ...a.marche, loyers: { basse: n.basse ?? null, haute: n.haute ?? null, source: marche.source || null } } }; change = true; }
  }
  if (emplacement) {
    const lues = lignesDeLEmplacement(emplacement);
    const lignes = [...(a.emplacement?.lignes || [])];
    for (const [cle, mot] of [['commerces_voisins', 'Commerces voisins'], ['vacance', 'Vacance'], ['acces', 'Accès']]) {
      if (!lues[cle]) continue;
      const i = lignes.findIndex((l) => memeIntitule(l?.mot, mot));
      if (i < 0) { lignes.push({ mot, texte: lues[cle], alerte: false }); change = true; }
      else if (caseVide(lignes[i].texte)) { lignes[i] = { ...lignes[i], texte: lues[cle] }; change = true; }
    }
    if (change) a = { ...a, emplacement: { ...(a.emplacement || {}), lignes } };
  }
  return { avis: a, change };
}

/** Une lecture arrivée après la rédaction : gardée, et posée dans les cases encore vides de l'avis. */
async function completerApres(id, { marche = null, emplacement = null } = {}) {
  const e = Records.get(ENTITE, id);
  if (!e) return;
  const adresse = e.questionnaire?.adresse || e.adresse;
  const maj = {};
  if (marche) maj.valeur_locative_lue = { adresse, le: new Date().toISOString(), resultat: marche };
  if (emplacement && Object.keys(emplacement).length) maj.emplacement_lu = { adresse, le: new Date().toISOString(), lu: emplacement };
  const { avis, change } = completerAvecLectures(e.avis, { marche, emplacement, q: e.questionnaire || {} });
  if (change) Object.assign(maj, { avis, avis_retouche_le: new Date().toISOString() });
  if (Object.keys(maj).length) Records.update(ENTITE, id, maj);
}

/** Pure : le tableau des surfaces (pondérées quand on a les zones). */
export function surfacesDe(q) {
  const lignes = [];
  if (Array.isArray(q.zones) && q.zones.length) {
    for (const z of q.zones) lignes.push({ zone: z.zone || z.nom, utile: Number(z.surface) || 0, coef: Number(z.coef) || 1 });
  } else if (q.surface_utile) {
    lignes.push({ zone: q.type_bien === 'murs_commerce' ? 'Boutique' : 'Surface principale', utile: Number(q.surface_utile), coef: 1 });
  }
  if (q.reserve) lignes.push({ zone: 'Réserve', utile: premierNombre(q.reserve) || 0, coef: 0.2 });
  return lignes.map((l) => ({ ...l, ponderee: Math.round(l.utile * l.coef) }));
}

// --- Le chat de l'estimation --------------------------------------------------

const OUTILS = [
  {
    name: 'commencer_avis',
    description: "Ouvre un nouvel avis de valeur dès que le type de bien est connu. type_bien : murs_commerce (les murs), fonds_commerce (le commerce exploité, sa clientèle, son droit au bail), immeuble, autre. Rend ce qui manque.",
    input_schema: { type: 'object', properties: { type_bien: { type: 'string', enum: TYPES_PROPOSES }, adresse: { type: 'string' }, demandeur: { type: 'string' } }, required: ['type_bien'] },
  },
  {
    name: 'noter_reponses',
    description:
      "Enregistre les réponses du mandataire (et ce qu'on lit dans une pièce jointe, un bail par exemple). Clés possibles : occupe (booléen), adresse, demandeur (le propriétaire des murs : le BAILLEUR du bail, souvent une SCI), surface_utile (m²), reserve, zones ([{zone, surface, coef}]), etat (texte libre), date_visite (« 28 septembre 2026 »), visite_avec, " +
      "pour les murs de commerce, les critères du taux de rendement, une valeur parmi la liste, « nc » si on ne sait pas : rang_rue (n1 | n1bis | n2), profil_locataire (enseigne : enseigne nationale | solide : indépendant installé | fragile), charges_refacturees (oui | non), taxe_fonciere_refacturee (oui | non) ; vacance_rue_pct (nombre, si on le connaît) ; taux_base (nombre, en %, celui que le mandataire a validé après proposer_taux_base) avec taux_base_propose (le taux que tu avais proposé en premier) ; ou, pour rédiger tout de suite, ton taux proposé avec taux_base_a_valider: true (il n'apprend rien tant que le mandataire ne l'a pas validé) ; " +
      "les critères Data-B, facultatifs : etat_immeuble (parfait | usage | travaux | renover | grosoeuvre), etat_local (parfait | usage | travaux | brut), angle, extraction, parking, franchise (locataire sous enseigne), retards_paiement, licence_4 (oui | non | nc), pmr (locaux_aux_normes | adap_en_cours | travaux_a_realiser | local_sans_public), anciennete_locataire (moins1an | de1a3ans | de3a6ans | de6a9ans | plus9ans) ; activite_data_b (le métier du locataire en un ou deux mots, « boulangerie », « assurance », « pharmacie ») ; " +
      "pour un fonds de commerce : activite_fonds (le métier exploité, « restauration rapide », « pharmacie », « tabac-presse »), ca_n, ca_n1, ca_n2 (chiffre d'affaires HT des trois derniers exercices, en €, du plus récent au plus ancien), ebe_n, ebe_n1, ebe_n2 (EBE retraité, en €), et, seulement si le mandataire les dit, bareme_ca_pct (« 60 à 90 », en % du CA) et multiple_ebe (« 3 à 4 ») ; le loyer et l'échéance du bail du fonds dans loyer_annuel_hc et echeance ; " +
      "annee_construction, investissement_a_prevoir (€, travaux à la charge de l'acquéreur, presque toujours vide), puis facade, emplacement, flux, environnement, vacance, acces, configuration, equipements, etage, stationnement, hauteur, acces_poids_lourds, nb_lots, composition, description, locataire, activite_locataire, bail_type, date_effet, echeance, loyer_annuel_hc (€), indexation, taxe_fonciere, charges, depot_garantie, paiements, ca_locataire, travaux_locataire, copropriete, travaux_votes, urbanisme, diagnostics, servitudes ; juridique (la réponse à la question juridique et technique, telle quelle : copropriété, travaux votés ou à prévoir, procédure, autre ; « non » s'il n'y a rien). Les valeurs telles quelles, sans étiquette de source entre parenthèses ni « à confirmer ». « Je ne sais pas » : n'enregistre rien. Rend ce qui manque encore.",
    input_schema: { type: 'object', properties: { reponses: { type: 'object' } }, required: ['reponses'] },
  },
  {
    name: 'proposer_taux_base',
    description: "Murs de commerce : les repères pour proposer le TAUX DE BASE de la ville (avant les ajustements du bien), dès que l'adresse est connue. Rend la ville, les taux déjà validés dans la ville et ailleurs, et les bornes ; instantané. Tu proposes ensuite un taux au mandataire, qui dit oui, plus haut ou plus bas.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'retoucher_avis',
    description: "Modifie l'avis affiché à côté du chat, tel qu'il est : reformuler, raccourcir ou réécrire un texte, enlever ou ajouter une ligne d'un tableau, mise en forme (taille, couleur, gras, police, fond…), déplacer un élément, réordonner ou masquer une page, poser l'image jointe à la place d'une photo. Passe la demande du mandataire telle quelle dans instruction. Marche avant comme après la rédaction.",
    input_schema: { type: 'object', properties: { instruction: { type: 'string' } }, required: ['instruction'] },
  },
  {
    name: 'proposer_photos_ville',
    description: "Montre au mandataire, sous ton message, plusieurs photos de la ville du bien (Google) : il touche celle qu'il veut en couverture de l'avis. Quand il demande une autre photo de couverture, une photo de la ville, de changer d'image. « D'autres », « pas celles-là », « cherches-en d'autres » : autres: true, de nouvelles photos jamais montrées.",
    input_schema: { type: 'object', properties: { autres: { type: 'boolean', description: "true : d'autres photos que celles déjà montrées" } } },
  },
  {
    name: 'rediger_avis',
    description: "Rédige l'avis : pour des murs de commerce, la valeur par le taux de rendement (loyer ÷ taux) ; pour un fonds de commerce, barème, rentabilité et cessions comparables croisés ; pour les autres biens, l'estimation Equimmox (une à deux minutes) ; le marché, la fourchette. L'éditeur s'ouvre ensuite tout seul. Normalement quand plus rien d'obligatoire ne manque ; avec a_la_main: true, il se rédige tout de suite et ce qui manque reste « [à compléter] » dans l'éditeur.",
    input_schema: { type: 'object', properties: { a_la_main: { type: 'boolean', description: 'Rédiger malgré les manques, que le mandataire complétera dans l\'éditeur' } } },
  },
];

/**
 * Pure : « Déjà renseigné », lisible et complet (2 nov. 2026) : coupé à 3 000 caractères, le questionnaire perdait ses
 * dernières clés (le rang de la rue, le taux) et l'assistant les redemandait. Les réponses courtes d'abord, les textes
 * longs ensuite, raccourcis.
 */
export function dejaRenseigne(q = {}, limite = 6000) {
  const lignes = Object.entries(q || {})
    .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => {
      const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${k}: ${t.length > 300 ? `${t.slice(0, 299)}…` : t}`;
    })
    .sort((a, b) => a.length - b.length);
  let sortie = '';
  for (const l of lignes) {
    if (sortie.length + l.length + 3 > limite) break;
    sortie += `${sortie ? ' ; ' : ''}${l}`;
  }
  return sortie || 'rien';
}

const CONSIGNE = `Tu mènes, pour un mandataire K Partners, un AVIS DE VALEUR dans le chat. TOUJOURS EN FRANÇAIS, jamais une autre langue, même quand une pièce, un outil ou une donnée est en anglais (2 nov. 2026, Jules). Court, sans markdown. Montants : 450 k€ sous le million, 1,3 M€ à partir de 1 000 k€ (jamais « 1 300 k€ ») ; une fourchette garde la même unité, « 1,1 – 1,7 M€ ».
MURS DE COMMERCE (31 oct. 2026) : la valeur se fait par le TAUX DE RENDEMENT. Valeur = loyer annuel HT hors charges ÷ taux (libre : le loyer de marché du local). Le serveur calcule ; toi, tu fais choisir le taux :
- le TAUX DE BASE de la ville : appelle proposer_taux_base dès que l'adresse est connue, puis propose UN taux (dans le MÊME message que les questions qui restent : le mandataire répond à tout d'un vocal) (par exemple « Je pars sur 6,5 % pour des murs de commerce à Antibes : ça vous va, ou plutôt plus haut, plus bas ? »), avec sa raison en quelques mots (taille et attrait de la ville, les taux déjà validés). C'est le taux de la ville, avant l'emplacement et le bail. En murs de commerce, un rendement brut se situe entre 4 et 10 %. Le mandataire dit oui, ou « un peu plus », « plus bas », « 7 % » : tu ajustes (un quart à un demi-point pour « un peu ») et tu notes taux_base avec noter_reponses SEULEMENT quand il l'a validé, avec taux_base_propose (ton premier chiffre) : chaque correction est gardée et sert aux avis suivants de tous les mandataires. proposer_taux_base rend ce qui a déjà été validé : pars de là ;
- le type d'abord : « À estimer » dit les murs ou le fonds. Le mandataire dit que c'est le fonds (ou les murs) : noter_reponses type_bien, et la suite change de méthode ;
- les critères qui l'ajustent, demandés avec les autres questions : le rang de la rue (n°1, n°1 bis, n°2), le locataire (enseigne nationale, indépendant solide, fragile), les charges et la taxe foncière (refacturées au locataire ou payées par le propriétaire). Le bail (date d'effet, échéance) et le loyer par rapport au marché comptent aussi : le serveur les lit.
Après la rédaction, l'outil rend le taux retenu et ses ajustements : dis-les en une ligne. Le mandataire veut un autre taux de base : noter_reponses taux_base, puis rediger_avis.
FONDS DE COMMERCE (3 nov. 2026) : ce qu'on vend, c'est le commerce exploité, pas les murs. La valeur croise trois méthodes, calculées par le serveur : le barème (un % du chiffre d'affaires HT moyen des trois derniers exercices), la rentabilité (un multiple de l'EBE retraité moyen, celle des banquiers, qui pèse double) et les cessions de fonds de la même activité autour (Data-B, BODACC en secours). Demande en un message : l'activité, le chiffre d'affaires HT et l'EBE des trois derniers exercices (le dernier suffit pour commencer ; une liasse ou un bilan joint avec « + » se lit), le loyer et l'échéance du bail. Ni surface obligatoire, ni « loué ou libre », ni taux de rendement. Le barème et le multiple viennent du secteur (restauration, restauration rapide, pharmacie, boulangerie, tabac-presse, coiffure) ; pour une autre activité, demande au mandataire le coefficient d'usage s'il le connaît, sinon la méthode reste écartée. Après la rédaction, dis en une ligne les méthodes retenues et celles écartées.
AUTRES BIENS : la valeur vient d'Equimmox (26 oct. 2026), son estimation multicritères (offres actuelles, offres anciennes, transactions DVF, capitalisation). Tu rassembles ce qu'il lui faut : l'adresse, la surface, l'état du local et, s'il est occupé, le loyer annuel. Sans Equimmox, Data-B prend le relais.

LE BUT : un avis en CINQ MINUTES, le mandataire dicte un vocal en sortant de la visite et c'est fait (1er nov. 2026, Jules). Reposer une question déjà répondue est la pire faute.
0. AVANT TOUTE QUESTION, relis TOUT : le fil du bien plus bas (appels, pré-visite, visite, du plus ancien au plus récent), la fiche, « Déjà renseigné ». Ce qui y est dit, même il y a longtemps ou dit autrement (« 2 000 € par mois » = 24 000 € par an, « bail signé en 2019 », « c'est la rue principale » = n1), se note avec noter_reponses SANS être redemandé. Ne demande que ce que rien ne dit.
1. Lis tout : ce que dit le mandataire et les pièces (bail surtout). Déduis le type de bien et commence l'avis (commencer_avis), puis enregistre EN UNE FOIS tout ce que tu as lu (noter_reponses). Dans un bail : le demandeur est le BAILLEUR (propriétaire des murs), sauf si le mandataire dit autre chose ; le locataire, son activité (et activite_data_b), le loyer annuel HT HC, la date d'effet, l'échéance, l'indexation, la taxe foncière et les charges (qui paie), la surface, le dépôt de garantie.
2. Ce qu'il dit en passant s'enregistre aussi : une date de visite (« je l'ai visité hier », « visite le 28 ») devient date_visite en toutes lettres, calculée depuis la date du jour ; un état, un angle, une extraction, un parking, une enseigne, l'ancienneté du locataire, des retards de paiement…
3. Avant d'envoyer des questions, raye chacune dont la réponse est dans « Déjà renseigné », dans le fil ou dans les messages de cette conversation, et chacune que tu as déjà posée et à laquelle il a répondu, même autrement ou à moitié (2 nov. 2026, Jules : « repose des questions déjà posées ») : sa réponse se note telle quelle, « nc » si elle est floue. Une question restée sans réponse ne revient qu'une fois, en disant « il me manque encore… ».
Puis pose, EN UN SEUL MESSAGE, seulement l'ESSENTIEL qui manque encore (noter_reponses le rend dans essentiels_manquants : adresse, loué ou non, surface, loyer et date d'effet si loué, rang de la rue ; pour un fonds : l'activité et le chiffre d'affaires) avec, pour des murs de commerce SEULEMENT, ta proposition de taux de base. Jamais de taux de base ni de rang de rue pour un fonds de commerce. L'échéance d'un 3-6-9 se calcule seule depuis la date d'effet : ne la demande jamais, demande la date de début du bail s'il manque : une liste numérotée courte, les choix quand il y en a, et « Répondez en un vocal ». Le reste (état, indexation, charges, façade…) ne se demande pas avant la rédaction, sauf UNE question, une seule fois, dans ce même message tant que juridique n'est pas noté (noter_reponses rend question_juridique_a_poser) : « Côté juridique et technique : copropriété, travaux votés ou à prévoir, procédure en cours, autre chose à savoir ? » (3 nov. 2026, Jules). Sa réponse se note dans juridique, telle qu'il la dit, « non » s'il n'y a rien : la page Juridique et technique de l'avis ne paraît alors pas. Elle ne retient pas la rédaction.
4. À chaque réponse : noter_reponses. « Je ne sais pas » vaut « nc » : ça ne bloque pas.
5. DÈS QUE L'ESSENTIEL EST LÀ, rédige sans attendre qu'on te le demande : rediger_avis, avec a_la_main: true s'il manque des cases secondaires. Si seul le taux n'est pas validé, note ton taux proposé avec taux_base_a_valider: true et rédige quand même ; demande ensuite en une ligne s'il convient (« plus haut, plus bas ? ») : à sa réponse, noter_reponses taux_base (validé, sans taux_base_a_valider) puis rediger_avis. Après la rédaction, cite en une ligne les cases encore « à compléter » qu'il peut dicter quand il veut.
6. MODIFIER L'AVIS (il est affiché à côté du chat) : une demande sur le document lui-même — reformuler, raccourcir, enlever une ligne, changer une taille, une couleur, mettre en gras, déplacer, masquer, poser une image jointe — c'est retoucher_avis, avec la demande telle quelle, avant comme après la rédaction ; pas noter_reponses ni rediger_avis. Une INFORMATION sur le bien (« la surface c'est 85 m² », « le loyer est de 20 000 € ») : noter_reponses, puis rediger_avis si l'avis est déjà rédigé. Après une retouche : une ligne qui dit ce qui a changé.
7. Après la rédaction : une seule ligne avec la valeur et la fourchette, et la méthode (le taux retenu et ses ajustements pour des murs de commerce ; Equimmox, ou Data-B s'il a pris le relais, pour les autres). Si l'outil rend a_signaler_au_mandataire : ce ne sont pas des lignes de l'avis, c'est à toi de les dire, à la suite, en quelques lignes courtes (« Attention : … »), un point par ligne. L'avis s'affiche déjà à côté du chat : ne dis pas de l'ouvrir, de le relire ni de télécharger le PDF. Une correction ensuite (« j'ai oublié, la surface c'est 85 m² ») : noter_reponses puis rediger_avis, et préviens que les retouches faites à la main dans l'avis seront remplacées.
8. La présentation (le deck) se remplit depuis l'avis : ses chiffres ne viennent que de tes outils. La page « La ville » se remplit quand tu appelles donnees_commune. Ne dis JAMAIS qu'une case ou une page est remplie si l'outil ne te l'a pas confirmé (« pose ») ; sinon dis ce qui manque.
8 bis. LA PHOTO DE COUVERTURE (1er nov. 2026) : à la rédaction, des photos de la ville s'affichent sous ton message ; dis en une ligne qu'il touche celle qu'il veut en couverture. Une autre photo, changer l'image : proposer_photos_ville ; « d'autres », « pas celles-là » : proposer_photos_ville avec autres: true, qui en cherche de nouvelles. Jamais une photo de la rue en couverture.
9. QUAND TOUT EST FINI (l'avis rédigé, plus de question ni de retouche en cours) : propose d'écrire le mail au propriétaire et de l'envoyer avec l'avis en PDF, en une question (« Je prépare le mail au propriétaire, avec l'avis en PDF ? »). À son oui : preparer_envoi_avis. Ne le propose qu'une fois ; pas si l'avis est déjà envoyé.
10. L'AVIS ENVOYÉ, tu suis la relation avec le propriétaire (27 oct. 2026) : on reste ici, et tu reprends le fil (il est plus bas). Le mandataire raconte : « je l'ai appelé, on a fixé un rendez-vous lundi », « la présentation s'est bien passée, il réfléchit et revient vers moi ». À chaque récit : noter_echange avec un résumé court et la relance qui convient à la situation (le rendez-vous à sa date et son heure, une semaine pour reprendre des nouvelles, la date qu'il a donnée). Rien de fixe : tu adaptes. Puis une ligne : ce qui est noté et la prochaine action datée, et au besoin une question utile (l'heure du rendez-vous, ce qui le fait hésiter). Une réponse qui tranche — d'accord sur un prix, pause, refus, autre agent, plus vendeur — c'est noter_restitution (avec relance_le et relance_quoi si la situation en demande une autre que celle du cas) : le mandataire confirme d'un tap. D'accord sur un prix : le prix va sur la fiche du bien et le bien passe au Mandat au tap ; dis-le en une ligne. Le bail reçu change la valeur : noter_restitution bail_change, puis noter_reponses et rediger_avis pour l'avis corrigé. Les documents (l'avis, la présentation, les sources) restent à côté : n'en parle que si on te les demande.
On n'invente rien. Dans ce que tu notes et ce que tu écris dans l'avis : ni « (mandataire) » ni autre étiquette de source entre parenthèses, ni « à confirmer » : ce qui est dit se note tel quel (« depuis 2018 »), ce qui n'est pas su ne se note pas (3 nov. 2026, Jules).`;

/**
 * Un taux de base validé par le mandataire (31 oct. 2026, Jules) : gardé une fois par avis (le dernier validé
 * l'emporte), avec celui que l'assistant avait proposé, pour que les propositions suivantes s'en servent.
 */
function garderTauxValide(e, user) {
  const q = e?.questionnaire || {};
  const fiche = e?.proprietaire_id ? Records.get('ProprietaireMandataire', e.proprietaire_id) : null;
  const ligne = {
    estimation_id: e.id, ville: e.ville_taux || villeDuTexte(q.adresse), adresse: q.adresse || null,
    rang_rue: q.rang_rue || null, activite: q.activite_locataire || null, occupe: !!q.occupe,
    propose: Number(q.taux_base_propose) || null, valide: Number(q.taux_base),
    par: moi(user), role: user?.role || null, le: new Date().toISOString(),
    test: !!(e.essai_bien || fiche?.test || fiche?.essai || fiche?.essai_bien),
  };
  const deja = Records.findBy('TauxBaseValide', 'estimation_id', e.id);
  if (deja) Records.update('TauxBaseValide', deja.id, ligne);
  else Records.create('TauxBaseValide', ligne);
}

/**
 * Les repères du taux de base : la ville et les taux déjà validés. Plus de lecture Data-B (2 nov. 2026, Jules : « pas
 * besoin d'aller chercher tous les chiffres, juste un taux de rendement pour la ville pour ensuite le pondérer ; je veux
 * que ça aille vite ») : son navigateur prenait jusqu'à une minute et demie.
 */
async function reperesDuTaux(e) {
  const q = e.questionnaire || {};
  const { TAUX_MIN, TAUX_MAX, reperesAppris } = await import('./taux-rendement.js');
  let ville = null;
  try { ville = (await (await import('./adresse-ban.js')).resoudreAdresse(q.adresse))?.ville || null; } catch { /* le texte suffit */ }
  ville = ville || villeDuTexte(q.adresse);
  if (ville && e.ville_taux !== ville) Records.update(ENTITE, e.id, { ville_taux: ville });
  const appris = reperesAppris(Records.list('TauxBaseValide').filter((l) => l.estimation_id !== e.id), ville);
  return {
    ok: true, ville, appris, adresse: q.adresse, activite: q.activite_locataire || null, occupe: !!q.occupe,
    taux_deja_valide: Number(q.taux_base) > 0 ? q.taux_base : null, bornes: [TAUX_MIN, TAUX_MAX],
    a_faire: "Propose UN taux de base pour cette ville (avant l'emplacement et le bail), avec sa raison en quelques mots, et demande s'il convient ou s'il faut plus haut ou plus bas. Ce qu'ont validé les mandataires et l'équipe passe avant ton idée : des taux validés dans la ville, pars de leur médiane (dis-le : « les derniers avis à Antibes sont partis sur 6,4 % ») ; sinon, corrige ton idée de l'écart moyen de tes propositions (ecart_moyen_partout, positif : tu proposes trop bas). Ne le note qu'une fois validé, avec taux_base_propose = le taux que tu avais proposé en premier.",
  };
}

/** Pure : le loyer de marché au m² d'une échelle : le milieu de sa fourchette, sinon la borne qu'on a. */
export function loyerDeMarcheM2(niveau) {
  if (!niveau) return null;
  const b = Number(niveau.basse), h = Number(niveau.haute);
  if (b > 0 && h > 0) return Math.round((b + h) / 2);
  return b > 0 ? b : h > 0 ? h : Number(niveau.moyenne) > 0 ? Number(niveau.moyenne) : null;
}

/** Un tour du chat de l'estimation. */
/** Pure : l'étape montrée quand une réponse est notée, avec sa valeur lisible. */
export function etapeDeReponse(cle, valeur) {
  const mot = String(cle).replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
  const brut = typeof valeur === 'object' ? JSON.stringify(valeur) : String(valeur);
  const n = Number(brut.replace(/[\s\u202f€]/g, '').replace(',', '.'));
  let lisible = brut;
  if (Number.isFinite(n) && /^[\d\s\u202f.,€]+$/.test(brut.trim())) {
    const nombre = n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/\u202f/g, ' ');
    lisible = /surface|m2|m²/i.test(cle) ? `${nombre} m²` : /loyer|prix|valeur|charges|taxe|depot|dépôt|montant|honoraires|droit/i.test(cle) ? `${nombre} €` : nombre;
  } else if (valeur === true || brut === 'true') lisible = 'oui';
  else if (valeur === false || brut === 'false') lisible = 'non';
  return `${mot} : ${lisible.length > 60 ? `${lisible.slice(0, 59)}…` : lisible}`;
}

/**
 * Pure : les quatre chiffres de la commune pour la page « La ville » du deck (26 oct. 2026), depuis la réponse de
 * donnees_commune, chacun avec sa source. null s'il n'y a rien.
 */
export function villeDepuisCommune(r) {
  if (!r || r.ok === false) return null;
  const v = {
    commune: r.commune || null,
    population: r.population != null ? { valeur: r.population, source: r.source || 'API Géo (INSEE)' } : null,
    revenu: r.revenu_median_uc?.valeur_euros_an ? { valeur: r.revenu_median_uc.valeur_euros_an, source: r.revenu_median_uc.source } : null,
    chomage: r.chomage_zone_emploi?.taux_pct != null ? { valeur: r.chomage_zone_emploi.taux_pct, source: r.chomage_zone_emploi.source } : null,
    logement: r.logement?.prix_median_m2 ? { valeur: r.logement.prix_median_m2, source: r.logement.source } : null,
    le: new Date().toISOString(),
  };
  return v.population || v.revenu || v.chomage || v.logement ? v : null;
}

/** Les chiffres de la commune, gardés sur l'estimation et dans son avis (la page « La ville » du deck les lit). */
export function poserVille(estimationId, ville) {
  const e = estimationId ? Records.get(ENTITE, estimationId) : null;
  if (!e || !ville) return false;
  Records.update(ENTITE, e.id, { ville_chiffres: ville, ...(e.avis ? { avis: { ...e.avis, ville } } : {}) });
  return true;
}

// Les pages du deck et ce qui les remplit (26 oct. 2026, Jules : « complète la page 05 » parlait du deck, Haka a
// complété la page 5 de l'avis). Envoyé à Haka quand la Présentation est ouverte.
const PAGES_DECK = [
  [1, 'Couverture', "la valeur, la fourchette, le loyer, le taux et le bail restant : tout vient des chiffres de l'avis (rediger_avis)"],
  [2, 'Sommaire', 'rien à remplir'],
  [3, 'Le bilan locatif', "les lignes du bail (locataire, paiements, bail, loyer, charges, garantie) : noter_reponses puis rediger_avis, ou retoucher_avis sur les lignes de la situation locative"],
  [4, 'La ville', 'donnees_commune (les quatre cases se remplissent seules)'],
  [5, 'Le quartier', "les lignes « Emplacement et commercialité » de l'avis : elles se remplissent seules à la rédaction depuis l'adresse (commerces voisins et transports par Google Maps, voie et commerces par OpenStreetMap, vacance par K-Vacance) ; pour les compléter, recherche_web, vacance_commerciale, annonces_bodacc, puis retoucher_avis (une ligne par rubrique, sans source entre parenthèses)"],
  [6, 'Le local', "les surfaces et la description du bien de l'avis : noter_reponses (surface, zones, état…) ou retoucher_avis"],
  [7, 'Les usages', "les activités autorisées (bail, copropriété, PLU) : lignes juridiques de l'avis par retoucher_avis ; la valeur locative : loyers_marche"],
  [8, 'Le taux', "la justification du taux de l'avis"],
  [9, 'Le calcul', "les méthodes d'Equimmox : rediger_avis"],
  [10, 'Les comparables', "les comparables d'Equimmox : rediger_avis"],
  [11, 'La valeur', "les chiffres de l'avis"],
  [12, 'Votre mandataire', "la fiche du mandataire, tenue par l'équipe Klocka : rien à écrire ici"],
];
/** Pure : ce que Haka doit savoir de ce que le mandataire regarde à droite (l'avis, le deck et sa page, le rapport). */
export function cadreDeLaVue(vue) {
  if (!vue?.document) return '';
  if (vue.document === 'presentation') {
    const p = vue.page || {};
    return `\n\nLE MANDATAIRE REGARDE LA PRÉSENTATION (le deck de 12 pages)${p.n ? `, page ${String(p.n).padStart(2, '0')} « ${p.titre || p.section || ''} »` : ''}. « La page N », « cette page », « ici » désignent une page DU DECK, jamais une page de l'avis. Les pages du deck et ce qui les remplit : ${PAGES_DECK.map(([n, t, quoi]) => `${String(n).padStart(2, '0')} ${t} : ${quoi}`).join(' ; ')}. Le deck se recompose seul depuis l'avis : pour compléter une page, remplis ce qui la nourrit, puis dis ce qui a changé sur cette page du deck. Si tu ne peux pas la compléter, dis ce qui manque et d'où ça viendrait. Retirer une page du deck : le mandataire le fait en mode Édition (« Supprimer la page »), les suivantes reprennent son numéro ; dis-le-lui plutôt que de vider la page.`;
  }
  if (vue.document === 'suivi') return "\n\nLe mandataire regarde le Suivi du bien : son statut, le prix d'accord, les relances à faire et l'historique. Ce que tu notes (noter_echange, noter_restitution) s'y affiche aussitôt.";
  if (vue.document === 'sources') return "\n\nLe mandataire regarde les Sources de l'avis (lecture seule) : ce qu'il a dit, l'estimation Equimmox et ses comparables, les ventes DVF, les loyers, le taux, la commune. Elles se refont en rédigeant l'avis de nouveau.";
  return "\n\nLe mandataire regarde l'avis de valeur : « la page N » désigne une page de l'avis.";
}

export async function discuterEstimation({ historique = [], texte, user, surEtape = null, piece = null, pieces = null, mode = null, conversation_id = null, selection = null, sources = null, competence = null, vue = null }) {
  // Les outils de marché et les sources cochées (26 oct. 2026), comme le chat Haka du mandataire.
  const marche = (await import('./mandataire.js')).marchePourChat({ sources, competence });
  const conv = conversation_id ? String(conversation_id) : null;
  // L'avis commencé au premier message, avant que la conversation ait son
  // identifiant, s'y rattache au message suivant.
  if (conv) {
    const orphelin = Records.list(ENTITE).find((x) => x.mandataire_email === moi(user) && x.questionnaire_en_cours && orphelinRecent(x));
    if (orphelin && !Records.list(ENTITE).some((x) => x.conversation_id === conv)) Records.update(ENTITE, orphelin.id, { conversation_id: conv });
  }
  // Plusieurs pièces jointes depuis le 27 oct. 2026 : une ligne chacune.
  const { lotDePieces, texteAvecPieces } = await import('./pieces-jointes.js');
  const lot = lotDePieces({ piece, pieces });
  for (const p of lot) surEtape?.(p.texte ? `Je lis le document : ${p.nom}` : `${p.nom} : illisible, je fais sans`);
  texte = texteAvecPieces(texte, lot, 12000);
  const { runAgent } = await import('./llm.js');
  const R = await import('./restitution-avis.js');
  const actuel = enCours(user, conv);
  const redige = !actuel ? dernierRedige(user, conv) : null;
  // Le oui à « De ce que je sais » (29 oct. 2026) : sans modèle.
  const aConfirmer = actuel?.de_la_visite && !actuel.de_la_visite.confirme_le ? actuel : null;
  if (aConfirmer && !lot.length && /^\s*(oui|ok|d'accord|c'est (juste|bon)|parfait|exact|confirm)/i.test(texte || '') && String(texte).trim().length < 40) {
    surEtape?.('Les réponses de la visite entrent dans l\u2019avis');
    const r = confirmerLaVisite(aConfirmer, user, conv);
    return { texte: r.texte, avis: null, avis_retouche: true, estimation_id: aConfirmer.id, envoi: null, actions: [] };
  }
  const contexte = actuel
    ? `\n\nAvis en cours : ${actuel.bien}. Déjà renseigné : ${dejaRenseigne(actuel.questionnaire)}. Encore obligatoire : ${manquants(actuel.questionnaire || {}).join(', ') || 'rien'}.` +
      (aConfirmer ? `\nCE QUE LA VISITE DIT, montré au mandataire et PAS ENCORE dans l'avis : ${JSON.stringify(aConfirmer.de_la_visite.reponses || {}).slice(0, 2000)}${aConfirmer.de_la_visite.recit ? ` ; récit : ${String(aConfirmer.de_la_visite.recit).slice(0, 600)}` : ''}. Il corrige ou complète : noter_reponses avec TOUTES ces réponses, corrigées de ce qu'il dit, puis la liste des questions qui manquent encore. S'il dit que c'est le fonds de commerce : type_bien fonds_commerce, demandeur = l'exploitant (le locataire), activite_fonds = son activité, et les questions d'un fonds (chiffre d'affaires, EBE), sans taux de base ni rang de rue.` : '')
    : redige
      ? `\n\nL'avis de ${redige.bien} est rédigé (valeur ${redige.avis?.chiffres?.valeur?.toLocaleString('fr-FR')} €) et se trouve dans cette conversation${redige.statut === 'envoye' ? `, ENVOYÉ au propriétaire le ${new Date(redige.envoye_le || Date.now()).toLocaleDateString('fr-FR', { timeZone: PARIS })} (la suite : la relation avec le propriétaire, règle 10).\n${R.filDeLaRelation(redige.proprietaire_id ? Records.get('ProprietaireMandataire', redige.proprietaire_id) : null)}\n` : redige.envoi?.prepare_le ? ', son mail d\'envoi est déjà préparé (à l\'écran)' : ', pas encore envoyé'}. Déjà renseigné : ${dejaRenseigne(redige.questionnaire)}. NE commence PAS un nouvel avis sauf si le mandataire parle d'un AUTRE bien. Une correction ou un ajout : noter_reponses puis rediger_avis, et préviens que les retouches faites à la main dans l'avis seront remplacées.`
      : '\n\nAucun avis en cours.';
  // Le fil du bien entier (1er nov. 2026, Jules : « ça doit vérifier dans le fil toutes les informations ») : le chat
  // ne voit que les 24 derniers messages ; la fiche et tout ce qui les précède lui sont redonnés ici.
  let filAvant = '';
  try {
    const { lignesDeLaFiche, lignesDuFil, borne } = await import('./avis-du-fil.js');
    const pid = (actuel || redige)?.proprietaire_id || null;
    const tout = pid ? (await import('./fil-du-bien.js')).filDuBien(user, pid)?.messages || [] : Array.isArray(historique) ? historique : [];
    const lignes = [...lignesDeLaFiche(pid ? Records.get('ProprietaireMandataire', pid) : null), ...lignesDuFil(tout.slice(0, Math.max(0, tout.length - 24)))];
    if (lignes.length) filAvant = `\n\nLE FIL DU BIEN ET SA FICHE, avant les derniers messages (du plus ancien au plus récent). Relis-le avant toute question : ce qui y est dit ne se redemande pas.\n${borne(lignes, 30000)}`;
  } catch (err) { console.warn(`[avis] fil du bien : ${err?.message || err}`); }
  const choisi = selection?.chemin ? `\n\nÉLÉMENT SÉLECTIONNÉ dans l'avis par le mandataire (« ça », « ce texte », « cette photo » le désignent) : ${selection.chemin}${selection.texte ? ` — « ${String(selection.texte).slice(0, 300)} »` : ''}. Une demande qui le vise : retoucher_avis.` : '';
  const facon = choisi + cadreDeLaVue(vue) + `\n\nNous sommes le ${jourLong()}.` + (mode === 'sans_document'
    ? '\nMode : SANS DOCUMENT. Pas de pièce : enregistre ce qui est dit, puis toutes les questions restantes en un seul message (le loyer, la surface, le bail, les critères du taux).'
    : mode === 'document' ? '\nMode : AVEC LE BAIL. Lis tout, puis toutes les questions restantes en un seul message.' : '');
  let avisPret = null;
  let avisRetouche = false;
  let envoi = null;
  let photosChoix = null;
  const actions = [];
  const messages = [...(Array.isArray(historique) ? historique : []), { role: 'user', contenu: texte }]
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.contenu === 'string' && m.contenu.trim())
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.contenu }));
  const { text } = await runAgent({ model: process.env.AK_MODELE?.trim() || null, effort: effortDuChat(), journal: { chat: 'mandataire-estimation', par: user?.email || null },
    system: CONSIGNE + facon + contexte + filAvant + marche.cadre,
    messages,
    tools: [...OUTILS, R.OUTIL_ENVOI, R.OUTIL_RESTITUTION, R.OUTIL_ECHANGE, ...marche.tools],
    onTool: async ({ name, input = {} }) => {
      if (marche.estMarche(name)) {
        surEtape?.(`Je lis ${name === 'ventes_dvf' ? 'les ventes DVF' : name === 'prix_murs' ? 'le prix des murs (Equimmox)' : name === 'loyers_marche' ? 'les loyers de marché' : name === 'donnees_commune' ? 'les chiffres de la commune' : 'la source demandée'}`);
        const r = await marche.executer({ name, input }, user);
        // Les chiffres de la commune remplissent les cases de « La ville » du deck : c'est le serveur qui les pose, pas un texte.
        if (name === 'donnees_commune') {
          const cible = enCours(user, conv) || dernierRedige(user, conv);
          const ville = villeDepuisCommune(r);
          if (cible && ville && poserVille(cible.id, ville)) { avisRetouche = true; return { ...r, pose: "Les cases de la page « La ville » du deck sont remplies avec ces chiffres (habitants, niveau de vie médian, chômage, prix du logement)." }; }
        }
        return r;
      }
      if (name === 'preparer_envoi_avis') {
        const cible = dernierRedige(user, conv) || enCours(user, conv);
        if (!cible?.avis) return { ok: false, error: "L'avis n'est pas encore rédigé." };
        if (cible.statut === 'envoye') return { ok: false, error: `Cet avis est déjà envoyé (le ${new Date(cible.envoye_le).toLocaleDateString('fr-FR', { timeZone: PARIS })}).` };
        surEtape?.('J\u2019écris le mail au propriétaire');
        const r = await R.preparerEnvoi(cible.id, { objet: input.objet, texte: input.texte }, user);
        if (r.ok) envoi = { estimation_id: cible.id, ...r.envoi };
        return r.ok ? { ok: true, pret: "Le mail s'ouvre à l'écran avec l'avis en PDF joint : le mandataire le relit et l'envoie d'ici, de sa boîte Gmail connectée (sinon, il la connecte d'un clic ou passe par sa messagerie).", destinataire: r.envoi.a || 'à compléter' } : r;
      }
      if (name === 'noter_restitution') {
        const cible = dernierRedige(user, conv) || enCours(user, conv);
        const pid = input.proprietaire_id || cible?.proprietaire_id;
        if (!pid) return { ok: false, error: "Cet avis n'est rattaché à aucun bien de Biens : la restitution se note depuis la fiche du bien." };
        const r = R.proposerRestitution(pid, input, user);
        if (r.ok) actions.push(r.carte);
        return r;
      }
      if (name === 'noter_echange') {
        const cible = dernierRedige(user, conv) || enCours(user, conv);
        if (!cible?.proprietaire_id) return { ok: false, error: "Cet avis n'est rattaché à aucun bien de Biens." };
        surEtape?.('Je note l\u2019échange');
        return R.noterEchange(cible.proprietaire_id, input, user);
      }
      if (name === 'proposer_taux_base') {
        const cible = enCours(user, conv) || dernierRedige(user, conv);
        const q = cible?.questionnaire || {};
        if (!q.adresse) return { ok: false, error: "Il faut d'abord l'adresse du bien." };
        if (q.type_bien === 'fonds_commerce') return { ok: false, error: "Un fonds de commerce ne s'estime pas par un taux de rendement : demande l'activité, le chiffre d'affaires et l'EBE." };
        surEtape?.('Je cherche le bon taux de base pour la ville');
        return reperesDuTaux(cible);
      }
      if (name === 'commencer_avis') { surEtape?.('Nouvel avis de valeur'); return commencer(input, user, conv); }
      if (name === 'noter_reponses') {
        // Une étape par valeur notée, avec la valeur : « Loyer annuel hc : 50 000 € ».
        const notees = Object.entries(input.reponses || {}).filter(([, v]) => v != null && String(v).trim() !== '');
        for (const [k, v] of notees.slice(0, 6)) surEtape?.(etapeDeReponse(k, v));
        if (notees.length > 6) surEtape?.(`Et ${notees.length - 6} autre${notees.length - 6 > 1 ? 's' : ''} réponse${notees.length - 6 > 1 ? 's' : ''}`);
        if (!notees.length) surEtape?.('Réponses enregistrées');
        const fait = noter(input.reponses, user, conv);
        if (fait.ok && aConfirmer) Records.update(ENTITE, aConfirmer.id, { de_la_visite: { ...aConfirmer.de_la_visite, confirme_le: new Date().toISOString() } });
        if (fait.ok) avisRetouche = true;
        return fait;
      }
      if (name === 'retoucher_avis') {
        const cible = enCours(user, conv) || dernierRedige(user, conv);
        if (!cible) return { ok: false, error: 'Aucun avis dans cette conversation : commence par commencer_avis.' };
        surEtape?.('Je retouche l\u2019avis');
        // Plusieurs pièces : la première image du lot se pose.
        const img = lot.find((p) => p?.url && /^image\//.test(p.mimetype || ''));
        const image = img ? { url: img.url, nom: img.nom } : null;
        const r = await retoucherAvis(cible.id, { instruction: input.instruction, selection, historique: [], piece: image }, user);
        if (!r.ok) return r;
        const faits = (r.faits || []).filter((f) => !f.refus).length;
        if (faits) { avisRetouche = true; surEtape?.(`${faits} retouche${faits > 1 ? 's' : ''} dans l\u2019avis`); }
        return { ok: true, retouches: faits, reponse: r.reponse };
      }
      if (name === 'rediger_avis') {
        const { photos_ville: photos, ...r } = await rediger(user, { surEtape, aLaMain: input.a_la_main === true, conversationId: conv });
        if (r.ok) avisPret = { estimation_id: r.estimation_id, valeur: r.valeur, bas: r.bas, haut: r.haut };
        if (r.ok && photos?.length) { photosChoix = { estimation_id: r.estimation_id, photos }; r.photos = `${photos.length} photos de la ville s'affichent sous ton message : le mandataire touche celle qu'il veut en couverture.`; }
        return r;
      }
      if (name === 'proposer_photos_ville') {
        const cible = enCours(user, conv) || dernierRedige(user, conv);
        if (!cible) return { ok: false, error: 'Aucun avis dans cette conversation.' };
        const q = cible.questionnaire || {};
        const commune = cible.ville_taux || villeDuTexte(q.adresse || cible.adresse || '');
        if (!commune) return { ok: false, error: "L'adresse du bien n'est pas connue : demande-la." };
        // « D'autres » : la page suivante de la recherche, retenue sur l'estimation (3 nov. 2026, Jules).
        const page = input.autres === false ? 0 : (cible.photos_ville_page ?? 0) + (input.autres ? 1 : 0);
        surEtape?.(page ? `D'autres photos de ${commune}` : `Des photos de ${commune}`);
        const photos = await (await import('./photo-commerce.js')).photosDeLaVille(commune, { page });
        Records.update(ENTITE, cible.id, { photos_ville_page: page });
        if (!photos.length) return { ok: false, error: `Aucune photo de ${commune} trouvée : le mandataire peut en joindre une avec « + ».` };
        photosChoix = { estimation_id: cible.id, photos };
        return { ok: true, montrees: `${photos.length} photos de ${commune} s'affichent sous ton message : dis-lui de toucher celle qu'il veut.` };
      }
      return { ok: false, error: `Outil inconnu : ${name}` };
    },
  });
  // L'estimation de cette conversation, pour l'aperçu qui se construit à côté du chat.
  const courante = enCours(user, conv) || dernierRedige(user, conv);
  return { texte: String(text || '').trim(), avis: avisPret, avis_retouche: avisRetouche, estimation_id: avisPret?.estimation_id || courante?.id || null, envoi, actions, ...(photosChoix ? { photos_ville: photosChoix } : {}) };
}

// --- Les retouches de l'avis par le chat -------------------------------------
//
// L'avis est un document JSON : chaque texte a son chemin (« description.resume »,
// « locatif.lignes.2.texte », « libre.redige »), les pages ont un ordre et
// peuvent se masquer. Le mandataire dit ce qu'il veut (« raccourcis la
// synthèse », « mets la section marché avant les méthodes », « supprime la
// ligne charges ») ; le modèle répond par des opérations, appliquées ici,
// jamais par un document entier réécrit. Chaque retouche garde une version.

export const SECTIONS_AVIS = ['cadre', 'description', 'emplacement', 'locatif', 'juridique', 'marche', 'methodes', 'conclusion'];
// La mise en forme d'un élément (avis.styles[chemin]) : taille en points,
// couleur de la palette du document (ou #rrggbb), gras, italique, souligné,
// alignement. Les tailles du modèle, pour « plus grand » et « plus petit ».
export const PALETTE_AVIS = ['encre', 'sauge', 'sauge-fonce', 'menthe', 'ocre', 'gris', 'blanc'];
const TAILLES_BASE = [
  [/^chiffres\.valeur$/, 36],
  [/^(demandeur|date|libre\.redige|type_libelle)$/, 9],
  [/^bien\.rue$/, 34], [/^bien\.ville$/, 13],
  [/^libre\.titre_(cadre|description|emplacement|locatif|juridique|marche|methodes)$/, 20],
  [/\.(synthese|resume)$|^libre\.c_(resume|conclusion)$/, 10.5],
  [/\.lignes\.\d+\.(mot|texte)$|^demandeur$|^cadre\./, 9],
  [/^marche\.references\.|^description\.surfaces\./, 8.5],
  [/^chiffres\.(capitalisation|comparaison)$/, 15],
  [/^conclusion\.points\./, 9.5],
];
const tailleBase = (chemin) => (TAILLES_BASE.find(([re]) => re.test(chemin)) || [null, 9.5])[1];
const tailleValide = (t) => (t >= 5 && t <= 80 ? Math.round(t * 2) / 2 : null);

const couleurValide = (c) => PALETTE_AVIS.includes(c) || /^#[0-9a-f]{6}$/i.test(String(c));
// Les réglages chiffrés d'un style : [clé, minimum, maximum, pas d'arrondi].
const BORNES_STYLE = [['interligne', 0.8, 3, 0.05], ['espacement', -0.1, 0.5, 0.01], ['opacite', 5, 100, 1], ['arrondi', 0, 20, 0.5], ['marge', 0, 30, 0.5], ['largeur', 10, 100, 1], ['hauteur_mm', 5, 280, 1], ['rotation', -180, 180, 1]];

/** Pure : le style d'un élément après une demande, ou null pour revenir au modèle. */
export function stylerElement(actuel = {}, chemin, s = {}) {
  const suivant = { ...(actuel || {}) };
  if (s.taille != null) { const t = tailleValide(Number(s.taille)); if (t) suivant.taille = t; }
  if (s.taille_delta != null) { const t = tailleValide((suivant.taille ?? tailleBase(chemin)) + Number(s.taille_delta)); if (t) suivant.taille = t; }
  for (const k of ['couleur', 'surlignage', 'fond', 'bordure_couleur']) {
    if (s[k] === undefined) continue;
    if (!s[k]) delete suivant[k]; else if (couleurValide(s[k])) suivant[k] = s[k];
  }
  for (const k of ['gras', 'italique', 'souligne', 'barre', 'majuscules', 'ombre', 'masque']) if (typeof s[k] === 'boolean') { if (s[k]) suivant[k] = true; else delete suivant[k]; }
  if (s.aligner !== undefined) { if (['left', 'center', 'right'].includes(s.aligner)) suivant.aligner = s.aligner; else delete suivant.aligner; }
  if (s.police !== undefined) { if (['serif', 'sans', 'mono'].includes(s.police)) suivant.police = s.police; else delete suivant.police; }
  if (s.bordure !== undefined) { if (['fine', 'epaisse'].includes(s.bordure)) suivant.bordure = s.bordure; else delete suivant.bordure; }
  for (const [k, min, max, pas] of BORNES_STYLE) {
    if (s[k] === undefined) continue;
    if (s[k] === null) { delete suivant[k]; continue; }
    const v = Number(s[k]);
    if (Number.isFinite(v) && v >= min && v <= max) suivant[k] = Math.round(v / pas) * pas;
  }
  return Object.keys(suivant).length ? suivant : null;
}
const CHEMINS_NOMBRES = /^(chiffres\.|methodes\.(taux|prix_m2|loyer|surface)$|description\.surfaces\.\d+\.(utile|coef)$|marche\.references\.\d+\.(surface|prix|prix_m2|distance_m)$|mise_en_page\.)/;

const nombreDe = (t) => {
  if (typeof t === 'number') return t;
  const n = Number(String(t ?? '').replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Pure : pose une valeur à un chemin, sans muter. */
export function poserChemin(objet, chemin, valeur) {
  const cles = String(chemin).split('.');
  const copie = Array.isArray(objet) ? [...objet] : { ...(objet || {}) };
  let ici = copie;
  for (let i = 0; i < cles.length - 1; i++) {
    const k = cles[i];
    ici[k] = Array.isArray(ici[k]) ? [...ici[k]] : { ...(ici[k] || {}) };
    ici = ici[k];
  }
  ici[cles.at(-1)] = valeur;
  return copie;
}

const lireChemin = (objet, chemin) => String(chemin).split('.').reduce((o, k) => (o == null ? undefined : o[k]), objet);
// « Taxe foncière », « taxe fonciere », « TAXE FONCIÈRE » : la même ligne.
const normIntitule = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const memeIntitule = (a, b) => { const x = normIntitule(a); const y = normIntitule(b); return !!x && !!y && (x === y || x.startsWith(y)); };

/** Pure : les chiffres qui découlent de la valeur retenue, comme dans l'éditeur. */
export function recalculerChiffres(avis) {
  const c = { ...(avis.chiffres || {}) };
  if (!(c.valeur > 0)) return avis;
  for (const k of ['valeur', 'bas', 'haut']) if (c[k] > 0) c[k] = prixRond(c[k]);
  const loyer = avis.methodes?.loyer || null;
  const hon = Number(c.honoraires_pct ?? 5) / 100;
  const frais = Number(c.frais_pct ?? 7.5) / 100;
  c.prix_affiche = prixRond(c.valeur * (1 + hon));
  c.cout_total = Math.round((c.prix_affiche * (1 + frais)) / 1000) * 1000;
  c.rendement = loyer ? Math.round((loyer / c.valeur) * 1000) / 10 : null;
  c.rendement_affiche = loyer ? Math.round((loyer / c.prix_affiche) * 1000) / 10 : null;
  c.rendement_total = loyer ? Math.round((loyer / (c.prix_affiche * (1 + frais))) * 1000) / 10 : null;
  // Les phrases qui citent les chiffres (clés « c_ ») se réécrivent avec eux.
  const libre = Object.fromEntries(Object.entries(avis.libre || {}).filter(([k]) => !k.startsWith('c_')));
  return { ...avis, chiffres: c, libre };
}

/**
 * Pure : applique les opérations à l'avis. Rend l'avis et la liste de ce qui
 * a été fait (ou refusé, avec le motif), sans jamais lever.
 */
export function appliquerOperations(avis, operations = []) {
  let a = avis;
  const faits = [];
  for (const op of Array.isArray(operations) ? operations : []) {
    try {
      if (op.op === 'poser') {
        if (!op.chemin || /(^|\.)(signataire|photos|version|type_bien|bien\.(lat|lon))(\.|$)/.test(op.chemin)) { faits.push({ ...op, refus: 'chemin protégé' }); continue; }
        const nombre = CHEMINS_NOMBRES.test(op.chemin);
        const valeur = nombre ? nombreDe(op.valeur) : (op.valeur_objet ?? op.valeur ?? '');
        // Une section entière (chiffres, methodes, locatif...) ne se remplace
        // pas par un texte : seuls ses champs se posent un à un.
        const actuel = lireChemin(a, op.chemin);
        if (actuel && typeof actuel === 'object' && (typeof valeur !== 'object' || valeur === null)) { faits.push({ ...op, refus: 'ce chemin est une section, pas un texte : vise un champ dedans' }); continue; }
        a = poserChemin(a, op.chemin, valeur);
        if (op.chemin.startsWith('chiffres.')) a = recalculerChiffres(a);
        faits.push({ op: 'poser', chemin: op.chemin });
      } else if (op.op === 'supprimer') {
        if (!op.chemin) { faits.push({ ...op, refus: 'il faut le chemin d\u2019un élément de liste, ou celui de la liste avec l\u2019intitulé (mot)' }); continue; }
        let parent = String(op.chemin);
        let index = -1;
        const direct = lireChemin(a, parent);
        if (Array.isArray(direct) && op.mot) {
          // La ligne par son intitulé : « enlève taxe foncière ».
          index = direct.findIndex((l) => memeIntitule(typeof l === 'string' ? l : l?.mot, op.mot));
          if (index < 0) { faits.push({ ...op, refus: `aucune ligne « ${op.mot} » dans ${parent}` }); continue; }
        } else {
          if (!parent.includes('.')) { faits.push({ ...op, refus: 'il faut le chemin d\u2019un élément de liste' }); continue; }
          index = Number(parent.split('.').at(-1));
          parent = parent.split('.').slice(0, -1).join('.');
        }
        const liste = lireChemin(a, parent);
        if (!Array.isArray(liste) || !(index >= 0 && index < liste.length)) { faits.push({ ...op, refus: 'pas de liste à cet endroit' }); continue; }
        a = poserChemin(a, parent, liste.filter((_, i) => i !== index));
        faits.push({ op: 'supprimer', chemin: `${parent}.${index}` });
      } else if (op.op === 'photo') {
        const cle = ['couverture', 'emplacement', 'portrait'].includes(op.cle) ? op.cle : null;
        if (!cle) { faits.push({ ...op, refus: 'cle : couverture, emplacement ou portrait' }); continue; }
        if (op.retirer) { a = { ...a, photos: { ...(a.photos || {}), [cle]: null } }; faits.push({ op: 'photo', cle, retiree: true }); continue; }
        if (!op.url || !/^(\/uploads\/|https?:\/\/)/.test(op.url)) { faits.push({ ...op, refus: 'il faut une image jointe' }); continue; }
        a = { ...a, photos: { ...(a.photos || {}), [cle]: op.url } };
        faits.push({ op: 'photo', cle });
      } else if (op.op === 'inserer') {
        const liste = lireChemin(a, op.chemin);
        if (!Array.isArray(liste)) { faits.push({ ...op, refus: 'pas de liste à cet endroit' }); continue; }
        const valeur = op.valeur_objet ?? op.valeur;
        const index = Number.isInteger(op.index) ? Math.max(0, Math.min(liste.length, op.index)) : liste.length;
        a = poserChemin(a, op.chemin, [...liste.slice(0, index), valeur, ...liste.slice(index)]);
        faits.push({ op: 'inserer', chemin: `${op.chemin}.${index}` });
      } else if (op.op === 'deplacer') {
        const liste = lireChemin(a, op.chemin);
        const de = Number(op.de);
        const vers = Number(op.vers);
        if (!Array.isArray(liste) || !(de >= 0 && de < liste.length) || !(vers >= 0 && vers < liste.length)) { faits.push({ ...op, refus: 'indices hors de la liste' }); continue; }
        const copie = [...liste];
        const [x] = copie.splice(de, 1);
        copie.splice(vers, 0, x);
        a = poserChemin(a, op.chemin, copie);
        faits.push({ op: 'deplacer', chemin: op.chemin, de, vers });
      } else if (op.op === 'styler') {
        if (!op.chemin || op.chemin.startsWith('section.')) { faits.push({ ...op, refus: 'il faut le chemin d\'un élément' }); continue; }
        const styles = { ...(a.styles || {}) };
        const suivant = op.reinitialiser || op.style === null ? null : stylerElement(styles[op.chemin], op.chemin, op.style || {});
        if (suivant) styles[op.chemin] = suivant; else delete styles[op.chemin];
        a = { ...a, styles };
        faits.push({ op: 'styler', chemin: op.chemin, style: suivant });
      } else if (op.op === 'positionner') {
        if (!op.cle || typeof op.cle !== 'string' || !op.cle.includes(':')) { faits.push({ ...op, refus: 'il faut la clé « page:chemin » de l\'élément' }); continue; }
        const positions = { ...(a.positions || {}) };
        if (op.reinitialiser) delete positions[op.cle];
        else {
          const p = positions[op.cle] || { x: 0, y: 0 };
          const x = op.x_mm != null ? Number(op.x_mm) : p.x + Number(op.dx_mm || 0);
          const y = op.y_mm != null ? Number(op.y_mm) : p.y + Number(op.dy_mm || 0);
          if (!Number.isFinite(x) || !Number.isFinite(y)) { faits.push({ ...op, refus: 'déplacement illisible' }); continue; }
          const borne = (v) => Math.max(-250, Math.min(250, Math.round(v * 2) / 2));
          if (borne(x) || borne(y)) positions[op.cle] = { x: borne(x), y: borne(y) }; else delete positions[op.cle];
        }
        a = { ...a, positions };
        faits.push({ op: 'positionner', cle: op.cle, position: positions[op.cle] || null });
      } else if (op.op === 'ordre_sections') {
        const voulu = (op.sections || []).filter((x) => SECTIONS_AVIS.includes(x));
        const ordre = [...new Set([...voulu, ...(a.ordre || SECTIONS_AVIS)])].filter((x) => SECTIONS_AVIS.includes(x));
        a = { ...a, ordre };
        faits.push({ op: 'ordre_sections', sections: ordre });
      } else if (op.op === 'masquer_section') {
        if (!SECTIONS_AVIS.includes(op.section) || op.section === 'conclusion') { faits.push({ ...op, refus: 'section inconnue ou indispensable' }); continue; }
        const masquees = new Set(a.masquees || []);
        if (op.masquee === false) masquees.delete(op.section); else masquees.add(op.section);
        a = { ...a, masquees: [...masquees] };
        faits.push({ op: 'masquer_section', section: op.section, masquee: op.masquee !== false });
      } else {
        faits.push({ ...op, refus: 'opération inconnue' });
      }
    } catch (e) {
      faits.push({ ...op, refus: e?.message || String(e) });
    }
  }
  return { avis: a, faits };
}

const SCHEMA_RETOUCHES = {
  type: 'object',
  properties: {
    reponse: { type: 'string', description: 'Une ou deux phrases au mandataire : ce qui a été changé, ou pourquoi rien' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['poser', 'supprimer', 'inserer', 'deplacer', 'styler', 'positionner', 'photo', 'ordre_sections', 'masquer_section'] },
          chemin: { type: 'string', description: 'Le chemin visé (poser, supprimer : la ligne « x.lignes.2 » ; inserer, deplacer : la liste « x.lignes »)' },
          valeur: { type: 'string', description: 'poser : le nouveau texte (ou le nombre, en chiffres)' },
          valeur_objet: { type: 'object', description: 'inserer dans des lignes : { mot, texte, alerte? } ; dans les points : non, utiliser valeur', properties: { mot: { type: 'string' }, texte: { type: 'string' }, alerte: { type: 'boolean' } } },
          style: {
            type: 'object',
            description: 'styler : la mise en forme à poser (ce qui n\'est pas donné ne change pas)',
            properties: {
              taille: { type: 'number', description: 'Taille en points' },
              taille_delta: { type: 'number', description: 'Variation en points (+2 pour « plus grand », -2 pour « plus petit »)' },
              couleur: { type: 'string', description: 'encre, sauge, sauge-fonce, menthe, ocre, gris, blanc, ou #rrggbb' },
              surlignage: { type: 'string', description: 'Couleur de fond derrière un texte (même palette), vide pour aucune' },
              gras: { type: 'boolean' },
              italique: { type: 'boolean' },
              souligne: { type: 'boolean' },
              barre: { type: 'boolean' },
              majuscules: { type: 'boolean' },
              police: { type: 'string', enum: ['modele', 'serif', 'sans', 'mono'] },
              interligne: { type: 'number', description: '1 à 2,2 (1,6 par défaut dans les textes)' },
              espacement: { type: 'number', description: 'Espacement des lettres en em (0,05 : un peu aéré)' },
              opacite: { type: 'number', description: '5 à 100 (%)' },
              aligner: { type: 'string', enum: ['left', 'center', 'right'] },
              fond: { type: 'string', description: 'Bloc : couleur de fond (palette ou #rrggbb)' },
              bordure: { type: 'string', enum: ['aucune', 'fine', 'epaisse'] },
              bordure_couleur: { type: 'string' },
              arrondi: { type: 'number', description: 'Bloc : coins arrondis en mm (0 à 20)' },
              marge: { type: 'number', description: 'Bloc : marge intérieure en mm (0 à 30)' },
              largeur: { type: 'number', description: 'Bloc : largeur en % (10 à 100)' },
              hauteur_mm: { type: 'number', description: 'Photo ou bloc : hauteur en mm' },
              rotation: { type: 'number', description: 'Degrés, -180 à 180' },
              ombre: { type: 'boolean' },
              masque: { type: 'boolean', description: 'true cache l\'élément, false le remontre' },
            },
          },
          reinitialiser: { type: 'boolean', description: 'styler : revenir à la mise en forme du modèle ; positionner : remettre en place' },
          cle: { type: 'string', description: 'positionner : « page:chemin » (page parmi couverture, cadre, description, emplacement, locatif, juridique, marche, methodes, conclusion) ; photo : couverture (la grande photo du bien en haut de la page de garde), emplacement (la photo de la page Emplacement), portrait (la photo du mandataire sur la page de garde, à cheval sur le bandeau)' },
          mot: { type: 'string', description: 'supprimer : l\'intitulé de la ligne à enlever, avec chemin = la liste (« locatif.lignes » + « Taxe foncière »)' },
          retirer: { type: 'boolean', description: 'photo : enlever la photo posée (retour à la vue de la rue)' },
          dx_mm: { type: 'number', description: 'positionner : décalage horizontal en mm (positif vers la droite)' },
          dy_mm: { type: 'number', description: 'positionner : décalage vertical en mm (positif vers le bas)' },
          x_mm: { type: 'number' },
          y_mm: { type: 'number' },
          index: { type: 'integer' },
          de: { type: 'integer' },
          vers: { type: 'integer' },
          sections: { type: 'array', items: { type: 'string' } },
          section: { type: 'string' },
          masquee: { type: 'boolean' },
        },
        required: ['op'],
      },
    },
  },
  required: ['reponse', 'operations'],
};

/** L'avis tel que le modèle le lit : sans les coordonnées ni la signature, avec ses chemins. */
function avisPourLeModele(avis) {
  const { signataire, photos, bien, ...reste } = avis;
  return { ...reste, bien: { rue: bien?.rue, ville: bien?.ville, adresse: bien?.adresse }, ordre: avis.ordre || SECTIONS_AVIS, masquees: avis.masquees || [] };
}

/**
 * Une retouche demandée dans le chat de l'éditeur. L'avis d'avant part dans
 * les versions ; l'avis d'après est enregistré et rendu.
 */
export async function retoucherAvis(id, { instruction, selection = null, historique = [], piece = null }, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  // Pas encore rédigé : on retouche l'avis qui se construit, et la retouche se garde pour la rédaction.
  const provisoire = !e.avis;
  const base = e.avis || apercuEstimation(e.id, user).avis;
  const demande = String(instruction || '').trim() || (piece ? `Pose l'image jointe (${piece.nom}).` : '');
  if (!demande) return { ok: false, error: 'Dites ce que vous voulez changer.' };

  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const fil = (Array.isArray(historique) ? historique : []).slice(-8).map((m) => `${m.role === 'user' ? 'Mandataire' : 'Assistant'} : ${String(m.contenu || '').slice(0, 600)}`).join('\n');
  const { resultat: brut } = await mesurer({ operation: 'mandataire', par: user?.email }, () => invokeLLM({
    prompt:
      `Tu retouches l'AVIS DE VALEUR d'un mandataire K Partners, un document JSON dont chaque texte a un chemin. Tu réponds par des OPÉRATIONS précises, jamais par le document entier.\n` +
      `Opérations : poser (chemin + valeur : remplace un texte ou un nombre ; les textes fixes du modèle sont sous « libre.<clé> », les phrases qui citent les chiffres sous « libre.c_… ») ; supprimer (chemin d'un élément de liste, ex. « locatif.lignes.3 » ou « conclusion.points.0 ») ; inserer (chemin de la liste + index + valeur_objet {mot, texte} pour des lignes, ou valeur pour les points) ; deplacer (chemin de la liste, de, vers) ; styler (chemin + style : taille en points ou taille_delta (+2 « plus grand », -2 « plus petit »), couleur parmi encre, sauge, sauge-fonce, menthe, ocre, gris, blanc ou #rrggbb, gras, italique, souligne, aligner left|center|right ; reinitialiser: true remet le modèle) ; ordre_sections (sections dans le nouvel ordre, parmi ${SECTIONS_AVIS.join(', ')}) ; masquer_section (section, masquee). Les pages s'appellent par ces mêmes noms. Les chemins protégés (signataire, photos) ne se touchent pas : dis-le.\n` +
      `ENLEVER UNE LIGNE d'un tableau par son intitulé : supprimer avec chemin = la liste et mot = l'intitulé (« enlève la taxe foncière » dans la situation locative → chemin « locatif.lignes », mot « Taxe foncière » ; les listes : description.lignes, emplacement.lignes, locatif.lignes, juridique.lignes, conclusion.points, marche.references, description.surfaces). Une IMAGE JOINTE se pose par photo : cle couverture = la grande photo du BIEN en haut de la page de garde ; emplacement = la photo de la page Emplacement ; portrait = la photo du MANDATAIRE (« ma photo », « ma tête », « moi », une personne) sur la page de garde, à cheval entre la page blanche et le bandeau ; retirer: true l'enlève. Le portrait se déplace et se met en forme par sa clé « couverture:bloc.photo.portrait ».\n` +
      `DÉPLACER un élément : positionner, avec la clé « page:chemin » (page parmi couverture, cadre, description, emplacement, locatif, juridique, marche, methodes, conclusion ; un texte par son chemin, un bloc par « bloc.<nom> » : photo.couverture, photo.emplacement, logo, bande, couverture_texte, resume, cadre_table, surfaces, references, encadre_marche, formule_1, formule_2, valeur_libre, grille_prix, points, signature, curseur, locatif_colonnes, <section>.lignes) et dx_mm / dy_mm (« monte un peu » : dy_mm -8 ; « vers la droite » : dx_mm 15), ou reinitialiser pour remettre en place.\n` +
      `styler accepte aussi : surlignage (fond derrière un texte), barre, majuscules, police (serif, sans, mono, modele), interligne, espacement (em), opacite (%), et pour un bloc (bloc.<nom>, photo.couverture, photo.emplacement) : fond, bordure (fine, epaisse, aucune) + bordure_couleur, arrondi (mm), marge (mm), largeur (%), hauteur_mm, rotation (degrés), ombre, masque (true cache l'élément : « enlève le logo », « cache la signature » ; false le remontre).\n` +
      `La MISE EN FORME se fait donc ici, par styler : ne dis jamais que c'est impossible. Chemins fréquents : la valeur « chiffres.valeur » (couverture du résumé et conclusion), le demandeur « demandeur », la date « date », « rédigé par » « libre.redige », l'adresse de couverture « bien.rue » et sa ville « bien.ville », le type de bien « type_libelle », les titres de pages « libre.titre_<section> » (titre_cadre, titre_description, titre_emplacement, titre_locatif, titre_juridique, titre_marche, titre_methodes), les textes « <section>.synthese », « description.resume », les lignes « <section>.lignes.<n>.texte ». Plusieurs éléments : une opération styler par chemin. La mise en page (taille de la photo « mise_en_page.photo_emplacement_mm », taille de la valeur « mise_en_page.taille_valeur_pt ») se pose par poser.\n` +
      `Pour reformuler, raccourcir, rendre plus vendeur : poser le nouveau texte au même chemin. Pour « enlève ça » sur une ligne : supprimer. Garde le ton du document (professionnel, phrases courtes). Les nombres s'écrivent en chiffres sans unité. Si la demande est floue, fais le plus probable et dis ce que tu as fait. Si elle demande autre chose qu'une retouche du document, réponds sans opération.\n\n` +
      `Nous sommes le ${jourLong()}.\n\n` +
      (selection?.chemin ? `ÉLÉMENT SÉLECTIONNÉ par le mandataire (« ça », « ce texte » le désignent) : chemin « ${selection.chemin} », texte actuel : « ${String(selection.texte ?? lireChemin(base, selection.chemin) ?? '').slice(0, 1200)} »\n\n` : '') +
      (piece ? `IMAGE JOINTE : « ${piece.nom} ». Pose-la avec l'opération photo : cle « portrait » si la demande parle du mandataire (« ma photo », « ma tête », « moi », un visage, une personne) ou si l'élément sélectionné est bloc.photo.portrait ; « emplacement » si elle parle de l'emplacement, de la rue ou de la façade, ou si l'élément sélectionné est bloc.photo.emplacement ; « couverture » pour une photo du bien en page de garde. Ne déplace pas une photo existante pour y loger l'image : pose-la à sa place.\n\n` : '') +
      (fil ? `DERNIERS ÉCHANGES :\n${fil}\n\n` : '') +
      `DEMANDE : ${demande}\n\n` +
      `AVIS (JSON) :\n${JSON.stringify(avisPourLeModele(base)).slice(0, 60000)}`,
    response_json_schema: SCHEMA_RETOUCHES,
  }));
  if (!brut || typeof brut !== 'object') return { ok: false, error: 'La retouche n\'a rien rendu : réessayez.' };

  let operations = (brut.operations || []).map((o) => (o.op === 'photo' && !o.retirer && piece?.url ? { ...o, url: piece.url } : o));
  // Une image jointe finit toujours quelque part : à défaut, là où le mandataire a cliqué, sinon en couverture.
  if (piece?.url && !operations.some((o) => o.op === 'photo')) {
    const cle = selection?.chemin === 'bloc.photo.emplacement' ? 'emplacement' : selection?.chemin === 'bloc.photo.portrait' || /\b(ma (photo|t[eê]te)|moi|portrait|visage)\b/i.test(demande) ? 'portrait' : 'couverture';
    operations = [...operations, { op: 'photo', cle, url: piece.url }];
  }
  const { avis, faits } = appliquerOperations(base, operations);
  const appliquees = faits.filter((f) => !f.refus);
  if (appliquees.length && provisoire) {
    // Une opération par fait, dans l'ordre : on garde celles qui ont pris.
    const prises = operations.filter((_, i) => !faits[i]?.refus);
    const sc = e.surcouche || {};
    Records.update(ENTITE, e.id, { surcouche: { ...sc, operations: [...(sc.operations || []), ...prises].slice(-200) } });
  } else if (appliquees.length) {
    Records.create('AvisVersion', { estimation_id: e.id, le: new Date().toISOString(), par: user?.email || null, motif: demande.slice(0, 160), avis: e.avis });
    Records.update(ENTITE, e.id, { avis, avis_retouche_le: new Date().toISOString() });
  }
  const refus = faits.filter((f) => f.refus);
  const reponse = String(brut.reponse || '').trim() + (refus.length && !appliquees.length ? ` (${refus.map((r) => r.refus).join(' ; ')})` : '');
  const apres = appliquees.length ? Records.get(ENTITE, e.id) : e;
  return { ok: true, reponse, faits, estimation: apres, avis: provisoire ? appliquerSurcouche(avisProvisoire(apres, signataire({ email: apres.mandataire_email })), apres.surcouche) : apres.avis };
}

/** Les versions d'un avis, la plus récente d'abord, sans leur contenu. */
export function versionsAvis(id, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  const versions = Records.list('AvisVersion').filter((v) => v.estimation_id === e.id)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .map(({ id: vid, le, par, motif }) => ({ id: vid, le, par, motif }));
  return { ok: true, versions };
}

/** Revenir à une version : l'avis courant part lui-même dans les versions. */
export function restaurerVersion(id, versionId, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  const v = Records.get('AvisVersion', versionId);
  if (!v || v.estimation_id !== e.id) return { ok: false, error: 'Version introuvable.' };
  Records.create('AvisVersion', { estimation_id: e.id, le: new Date().toISOString(), par: user?.email || null, motif: `Avant retour à la version du ${new Date(v.le).toLocaleString('fr-FR', { timeZone: PARIS })}`, avis: e.avis });
  return { ok: true, estimation: Records.update(ENTITE, e.id, { avis: v.avis, avis_retouche_le: new Date().toISOString() }) };
}

/** Une version posée par l'éditeur lui-même (avant une retouche à la main importante). */
export function poserVersion(id, { motif = 'Retouche à la main' } = {}, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  if (!e.avis) return { ok: false, error: 'Pas d\'avis.' };
  const toutes = Records.list('AvisVersion').filter((v) => v.estimation_id === e.id).sort((a, b) => String(a.le).localeCompare(String(b.le)));
  // Trente versions au plus par avis : les plus anciennes s'effacent.
  for (const v of toutes.slice(0, Math.max(0, toutes.length - 29))) Records.delete('AvisVersion', v.id);
  Records.create('AvisVersion', { estimation_id: e.id, le: new Date().toISOString(), par: user?.email || null, motif: String(motif).slice(0, 160), avis: e.avis });
  return { ok: true };
}

// --- La conversation d'une estimation -----------------------------------------

const ESPACE_CHAT = 'mandataire-estimation';
const LIBELLES_QUESTIONNAIRE = {
  adresse: 'Adresse', demandeur: 'Demandeur', surface_utile: 'Surface utile', occupe: 'Occupé', locataire: 'Locataire',
  activite_locataire: 'Activité', loyer_annuel_hc: 'Loyer annuel HT HC', bail_type: 'Bail', echeance: 'Échéance', date_visite: 'Visite',
};

// Les questions de la reprise, dans l'ordre du questionnaire (les critères Data-B ont leurs choix).
// Deux questions qui disent la même chose (31 oct. 2026 : « les charges » posées deux fois, la taxe foncière
// redemandée) : la seconde ne se pose pas quand la première l'est déjà.
const DOUBLONS = { charges_refacturees: 'charges', taxe_fonciere_refacturee: 'taxe_fonciere', rang_rue: 'emplacement' };
const sansDoublon = (k, _, tout) => !(DOUBLONS[k] && tout.includes(DOUBLONS[k]));

const QUESTIONS_REPRISE = {
  type_bien: 'Le type de bien : murs de commerce, fonds de commerce, immeuble de rapport ?',
  activite_fonds: 'L\'activité exploitée',
  ca_n: 'Le chiffre d\'affaires HT des trois derniers exercices (le dernier suffit pour commencer)',
  ebe_n: 'L\'EBE (excédent brut d\'exploitation) des mêmes exercices',
  occupe: 'Le local est-il loué ?',
  adresse: 'L\'adresse exacte',
  demandeur: 'Le propriétaire des murs (le demandeur de l\'avis)',
  surface_utile: 'La surface utile, en m²',
  etat: 'L\'état général du local',
  date_visite: 'La date de la visite',
  locataire: 'Le locataire (sa société)',
  activite_locataire: 'Son activité',
  bail_type: 'Le type de bail : 3-6-9, dérogatoire, professionnel ?',
  date_effet: 'La date d\'effet du bail',
  echeance: 'La date de début du bail (l\'échéance se calcule)',
  loyer_annuel_hc: 'Le loyer annuel HT HC',
  indexation: 'L\'indexation (ILC, ILAT)',
  taxe_fonciere: 'La taxe foncière : son montant, et qui la paie',
  charges: 'Les charges : refacturées au locataire ?',
  facade: 'La façade (linéaire, vitrine)',
  emplacement: 'L\'emplacement : n° 1, n° 1 bis, secondaire ?',
  rang_rue: 'L\'emplacement : je vous le propose d\'après le loyer de la rue, à confirmer',
  profil_locataire: 'Le locataire : enseigne nationale, indépendant solide ou fragile ?',
  charges_refacturees: 'Les charges : refacturées au locataire, ou payées par le propriétaire ?',
  taxe_fonciere_refacturee: 'La taxe foncière : refacturée au locataire, ou payée par le propriétaire ?',
  etat_local: 'L\'état du local : parfait, d\'usage, travaux, brut ?',
  etat_immeuble: 'L\'état de l\'immeuble : parfait, d\'usage, travaux, à rénover ?',
  angle: 'Est-il en angle ?',
  extraction: 'Y a-t-il une extraction ?',
  parking: 'Un parking à proximité ?',
  pmr: 'L\'accessibilité PMR : aux normes, travaux à faire ?',
  franchise: 'Le locataire est-il sous enseigne ?',
  anciennete_locataire: 'Depuis combien de temps est-il dans les lieux ?',
  retards_paiement: 'Des retards de paiement ?',
  licence_4: 'Une licence IV ?',
  // Posée une fois, sans retenir la rédaction (3 nov. 2026, Jules) : « non », le cas le plus fréquent, et la page
  // Juridique et technique ne paraît pas dans l'avis.
  juridique: 'Côté juridique et technique : copropriété, travaux votés ou à prévoir, procédure en cours, autre chose à savoir ? Si rien, dites non.',
};

/** Pure : le message qui rouvre une estimation dans le chat — ce qu'on sait, ce qui reste. */
export function messageDeReprise(e) {
  const q = e.questionnaire || {};
  const connu = Object.entries(LIBELLES_QUESTIONNAIRE)
    .map(([k, mot]) => [mot, k === 'occupe' ? (q.occupe === true ? 'oui' : q.occupe === false ? 'non' : null) : k === 'loyer_annuel_hc' && q[k] ? `${Number(q[k]).toLocaleString('fr-FR')} €` : k === 'surface_utile' && q[k] ? `${q[k]} m²` : q[k]])
    .filter(([, v]) => v != null && v !== '')
    .map(([mot, v]) => { const t = String(v).replace(/\s+/g, ' ').trim(); return `${mot} : ${t.length > 90 ? `${t.slice(0, 88).replace(/[\s,;(]+\S*$/, '')}…` : t}`; });
  if (!connu.length && e.adresse) connu.push(`Adresse : ${e.adresse}`);
  if (e.avis) {
    const c = e.avis.chiffres || {};
    return `L'avis de valeur de ${e.bien} est rédigé${c.valeur ? ` : ${c.valeur.toLocaleString('fr-FR')} € (fourchette ${c.bas?.toLocaleString('fr-FR')} – ${c.haut?.toLocaleString('fr-FR')} €)` : ''}. Dites-moi ce qu'il faut corriger ou compléter : je le rédigerai de nouveau.`;
  }
  if (e.de_la_visite && !e.de_la_visite.confirme_le) return messageDeLaVisite(e);
  // À l'arrivée sur l'Avis de valeur (27 oct. 2026, Jules) : la conversation montre déjà ce que Haka a repris de la visite
  // et les questions qui restent, numérotées, au lieu d'une invitation à tout redire.
  const ordre = Object.keys(QUESTIONS_REPRISE);
  // La question des charges (ou de la taxe foncière) demande déjà qui paie : le critère du taux ne se redemande pas.
  const reste = manquants({ type_bien: 'murs_commerce', ...q }).filter((k) => QUESTIONS_REPRISE[k])
    .filter(sansDoublon)
    .sort((x, y) => ordre.indexOf(x) - ordre.indexOf(y));
  const visite = e.infos_rdv ? '\nJ\'ai repris le compte rendu de la visite.' : '';
  const questions = [...reste.slice(0, 12), ...(q.juridique == null ? ['juridique'] : [])].map((k, i) => `${i + 1}. ${QUESTIONS_REPRISE[k]}`);
  return `Reprenons l'estimation de ${e.bien}.${visite}${connu.length ? `\nCe que j'ai déjà : ${connu.join(' · ')}.` : ''}\n${questions.length ? `Pour rédiger l'avis, il me manque :\n${questions.join('\n')}\nRépondez en vrac, au micro si vous voulez, ou joignez le bail avec « + ». « Je ne sais pas » ne bloque rien.` : 'Dites « rédige l\'avis » et je m\'y mets, ou ajoutez ce que vous savez encore.'}`;
}

// --- De la visite à l'avis (29 oct. 2026, Jules) -------------------------------
//
// « Oui, passer à l'estimation » mène à l'Avis de valeur du bien : l'avis à droite n'est pas encore rempli ; à gauche,
// Haka dit ce qu'il sait déjà (la fiche, le compte rendu de visite) et demande de le confirmer. Au oui, ces réponses
// entrent dans l'avis (il se remplit pour la première fois), puis viennent les questions qui manquent. Sans modèle.

const LIBELLES_VISITE = {
  // Ce qu'on estime, en premier : un fonds ne s'estime pas comme des murs (3 nov. 2026, Jules) ; le mandataire le corrige d'un mot.
  type_bien: 'À estimer',
  adresse: 'Adresse', demandeur: 'Propriétaire des murs', occupe: 'Loué', locataire: 'Locataire', activite_locataire: 'Activité',
  surface_utile: 'Surface utile', loyer_annuel_hc: 'Loyer annuel HT HC', date_effet: 'Bail depuis', echeance: 'Fin du bail',
  taxe_fonciere: 'Taxe foncière', charges: 'Charges', etat: 'État du local', flux: 'Passage', environnement: 'Voisinage', date_visite: 'Visite',
  // Ce que le fil peut aussi dire (1er nov. 2026) : le bail et les critères du taux.
  bail_type: 'Type de bail', indexation: 'Indexation', facade: 'Façade', rang_rue: 'Rang de la rue', profil_locataire: 'Profil du locataire',
  charges_refacturees: 'Charges refacturées', taxe_fonciere_refacturee: 'Taxe foncière refacturée',
};
// Ce qu'on cherche dans le fil du bien à l'ouverture de l'avis : chaque clé avec sa question (le taux de base, jamais :
// c'est au mandataire de le valider).
const CLES_DU_FIL = Object.fromEntries(Object.entries({ ...QUESTIONS_REPRISE, ...LIBELLES_VISITE }).filter(([k]) => !['type_bien', 'taux_base'].includes(k)));
export const OUI_VISITE = "Oui, c'est juste.";

const ouiNon = (coche, texte) => (coche === true || /refactur|locataire/i.test(texte || '') ? 'oui' : coche === false || /propri[ée]taire|non refactur/i.test(texte || '') ? 'non' : null);

/** Pure : le type de l'avis d'après la fiche du bien (le type prospecté) ; des murs de commerce par défaut. */
export const typeDeLaFiche = (p) => (['fonds_commerce', 'bureaux', 'murs_commerce'].includes(p?.type_bien) ? p.type_bien : 'murs_commerce');

/** Pure : ce que la fiche et le compte rendu de visite disent déjà, en réponses du questionnaire de l'avis. */
export function reponsesDeLaVisite(p = {}) {
  const cr = p.biens?.compte_rendu || {};
  const b = cr.bien || {}; const e = cr.etat || {};
  const faite = p.biens?.visite?.faite_le || cr.le || null;
  const charges = [b.charges, b.refacturees === true ? 'refacturées au locataire' : b.refacturees === false ? 'non refacturées' : null].filter(Boolean).join(', ');
  // Le type de la fiche, celui qu'on prospectait (3 nov. 2026) ; un fonds a l'exploitant pour demandeur.
  const fonds = p.type_bien === 'fonds_commerce';
  const r = {
    type_bien: typeDeLaFiche(p),
    ...(fonds ? { activite_fonds: p.activite || null } : {}),
    adresse: [p.adresse, p.ville].filter(Boolean).join(', ') || null,
    demandeur: (fonds ? p.commerce : p.nom) || null,
    // Un local des murs libres (3 nov. 2026) : pas de locataire, l'avis se fait sur le loyer de marché.
    occupe: p.libre ? false : p.commerce || b.loyer_annuel ? true : null,
    locataire: p.libre ? null : p.commerce || null,
    activite_locataire: p.activite || null,
    surface_utile: b.surface || null,
    loyer_annuel_hc: b.loyer_annuel || null,
    date_effet: b.bail_date || null,
    echeance: b.fin_bail || null,
    taxe_fonciere: b.taxe_fonciere || null,
    charges: charges || null,
    // « refacturées » vaut pour les charges ET la taxe foncière (compte rendu de visite) ; dit en toutes lettres dans l'une
    // ou l'autre (« taxe foncière refacturée »), il compte aussi : rien ne se redemande (31 oct. 2026).
    charges_refacturees: ouiNon(b.refacturees, b.charges),
    taxe_fonciere_refacturee: ouiNon(b.refacturees, b.taxe_fonciere),
    etat: [e.local, b.travaux ? `travaux : ${b.travaux}` : null].filter(Boolean).join(' ; ') || null,
    flux: e.passage || null,
    environnement: e.voisinage || null,
    date_visite: faite && Number.isFinite(Date.parse(faite)) ? jourLong(new Date(faite)) : null,
  };
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v != null && v !== ''));
}

/** Pure : le message « De ce que je sais… », à confirmer d'un tap. */
export function messageDeLaVisite(e) {
  const r = e.de_la_visite?.reponses || {};
  const lignes = Object.entries(LIBELLES_VISITE).filter(([k]) => r[k] != null && r[k] !== '').map(([k, mot]) => {
    const v = k === 'type_bien' ? (r[k] === 'fonds_commerce' ? 'le fonds de commerce' : 'les murs commerciaux') : k === 'occupe' ? (r[k] ? 'oui' : 'non') : k === 'loyer_annuel_hc' ? `${Number(r[k]).toLocaleString('fr-FR')} €` : k === 'surface_utile' ? `${r[k]} m²` : String(r[k]).replace(/\s+/g, ' ').trim();
    return `- ${mot} : ${v}`;
  });
  const recit = e.de_la_visite?.recit ? `\nDu récit de la visite : ${String(e.de_la_visite.recit).slice(0, 400)}` : '';
  // Sans adresse dans la fiche, c'est la première chose demandée : tout le marché en dépend.
  if (!r.adresse) return `Commençons l'avis de valeur de ${e.bien}.${lignes.length ? ` De ce que je sais :\n${lignes.join('\n')}${recit}\n` : '\n'}La fiche n'a pas d'adresse : quelle est l'adresse du bien ?`;
  return `Commençons l'avis de valeur de ${e.bien}. De ce que je sais :\n${lignes.join('\n')}${recit}\nVous me le confirmez ? Corrigez ce qui est faux, ou dites oui : l'avis commence.`;
}

/**
 * L'Avis de valeur ouvert depuis la visite : l'estimation du bien (créée au besoin, rattachée à la fiche), avec ce que
 * la visite dit, gardé à part jusqu'au oui. Rien ne s'écrit dans l'avis avant.
 */
export async function avisDepuisLeBien({ proprietaire_id = null, adresse = null, titre = null, surEtape = null, lireLeFil = null } = {}, user) {
  const p = proprietaire_id ? Records.get('ProprietaireMandataire', proprietaire_id) : null;
  if (proprietaire_id && (!p || String(p.mandataire_email || '').toLowerCase() !== moi(user) && user?.role !== 'admin')) return { ok: false, error: 'Bien introuvable.' };
  const { objetsDuBien } = await import('./bien-etapes.js');
  let e = p ? objetsDuBien(p).estimation : null;
  if (e?.avis || e?.de_la_visite) return { ok: true, estimation_id: e.id };
  // L'adresse vient de la fiche du bien (le propriétaire, ou le dossier d'où l'on vient) ; sinon Haka la demande.
  const reponses = reponsesDeLaVisite({ ...(p || {}), adresse: p?.adresse || adresse || null, ville: p?.adresse ? p.ville : p ? p.ville : null });
  if (!reponses.adresse && adresse) reponses.adresse = String(adresse).trim();
  // Tout le fil du bien et sa fiche relus (1er nov. 2026, Jules : « pour pas que ça me repose les mêmes questions ») :
  // ce qui y a été dit, même au premier appel, entre dans « De ce que je sais ». L'adresse de la fiche reste.
  if (p) {
    surEtape?.('Je relis tout le fil du bien');
    try {
      const { lireLeBien } = await import('./avis-du-fil.js');
      const { filDuBien } = await import('./fil-du-bien.js');
      const lu = await lireLeBien({ p, messages: filDuBien(user, p.id)?.messages || [], cles: CLES_DU_FIL, aujourdhui: jourLong(), user, invoke: lireLeFil });
      for (const [k, v] of Object.entries(lu)) if (k !== 'adresse' || !reponses.adresse) reponses[k] = v;
    } catch (err) { console.warn(`[avis] lecture du fil : ${err?.message || err}`); }
  }
  const recit = p && !p.biens?.compte_rendu?.bien && p.biens?.compte_rendu?.texte ? p.biens.compte_rendu.texte : null;
  const de_la_visite = { reponses, ...(recit ? { recit } : {}), le: new Date().toISOString() };
  const bien = [p?.commerce || p?.nom, p?.ville].filter(Boolean).join(' · ') || titre || reponses.adresse || 'Bien';
  const q = { type_bien: typeDeLaFiche(p), adresse: reponses.adresse || null };
  if (!e) {
    e = Records.create(ENTITE, {
      mandataire_email: moi(user), proprietaire_id: p?.id || null, bien, adresse: reponses.adresse || null,
      statut: 'brouillon', questionnaire: q, de_la_visite,
      cree_le: new Date().toISOString(), historique: [{ le: new Date().toISOString(), par: user?.email || null, action: 'avis commencé depuis la fiche du bien' }],
    });
  } else {
    // Pas encore rédigé, l'avis suit le type de la fiche : un murs commencé sur un fonds bascule en fonds.
    const suit = e.questionnaire && !e.avis && e.questionnaire.type_bien !== q.type_bien ? { questionnaire: { ...e.questionnaire, type_bien: q.type_bien } } : {};
    e = Records.update(ENTITE, e.id, { de_la_visite, ...(e.questionnaire ? suit : { questionnaire: q }) });
  }
  if (!e.proprietaire_id && e.adresse) import('./fiche-du-bien.js').then((f) => f.ficheDeLAvis(e.id, user)).catch((err) => console.warn(`[fiche] ${err?.message || err}`));
  // La valeur locative et l'emplacement se lisent en fond pendant les questions (3 nov. 2026).
  if (e.adresse) prechaufferAvis(e.id, user);
  // L'avis commencé depuis la fiche : la visite a eu lieu, la fiche entre dans Biens (2 nov. 2026).
  if (p) (await import('./bien-etapes.js')).entrerDansBiens(p, user);
  // La photo de la ville, en fond : la couverture de l'avis l'a dès qu'elle arrive.
  const commune = villeDuTexte(reponses.adresse || '');
  if (commune) import('./photo-commerce.js').then((m) => m.photosDeLaVille(commune)).then((ph) => { if (ph?.[0]?.url) Records.update(ENTITE, e.id, { photo_ville: ph[0].url }); }).catch(() => {});
  return { ok: true, estimation_id: e.id, cree: true };
}

/** Le oui à « De ce que je sais » : les réponses de la visite entrent dans l'avis, puis les questions qui restent. */
export function confirmerLaVisite(e, user, conversationId = null) {
  const r = e.de_la_visite?.reponses || {};
  Records.update(ENTITE, e.id, { de_la_visite: { ...e.de_la_visite, confirme_le: new Date().toISOString() }, ...(e.de_la_visite?.recit && !e.infos_rdv ? { infos_rdv: e.de_la_visite.recit } : {}) });
  const n = noter(r, user, conversationId);
  if (!n.ok) return { texte: n.error };
  // L'essentiel seulement (1er nov. 2026, Jules : « l'estimation en cinq minutes ») : le reste reste « à compléter ».
  const reste = (n.essentiels_manquants || []).filter((k) => QUESTIONS_REPRISE[k]).filter(sansDoublon);
  // La question juridique et technique, une fois (3 nov. 2026, Jules) : elle ne retient pas la rédaction.
  const juridique = n.question_juridique_a_poser ? `\n${n.question_juridique_a_poser}` : '';
  // Un fonds se vaut par ses comptes, jamais par un taux de rendement (3 nov. 2026, Jules).
  const fonds = r.type_bien === 'fonds_commerce';
  if (!reste.length) return { texte: `C'est noté dans l'avis. J'ai l'essentiel : dites « rédige » et je ${fonds ? 'croise le barème, la rentabilité et les cessions autour' : 'vous propose le taux de base en rédigeant'}.${juridique}` };
  return { texte: `C'est noté dans l'avis. Pour le rédiger, il me manque seulement :\n${[...reste.map((k) => QUESTIONS_REPRISE[k]), ...(juridique ? [n.question_juridique_a_poser] : [])].map((t, i) => `${i + 1}. ${t}`).join('\n')}\nRépondez en un vocal : je rédige aussitôt${fonds ? '' : ', avec un taux de base et un rang de rue que je vous propose'}. Le reste se complète après, « je ne sais pas » ne bloque rien.` };
}

/**
 * La conversation d'une estimation, toujours valable : la sienne si elle
 * existe encore, sinon une nouvelle qui reprend où on en était. L'estimation
 * y est rattachée, et redevient l'avis en cours de cette conversation.
 */
export async function conversationDeLEstimation(id, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  const C = await import('./assistant-conversations.js');
  // Un avis né d'un bien s'écrit dans le fil du bien (1er nov. 2026, Jules : « toujours un fil par bien »).
  const F = await import('./fil-du-bien.js');
  const pid = e.proprietaire_id || null;
  if (pid && F.dansLeFil(user, pid, e.conversation_id)) return { ok: true, conversation_id: e.conversation_id, fil: pid };
  if (!pid && e.conversation_id && C.lireConversation(user, e.conversation_id, { espace: ESPACE_CHAT })) return { ok: true, conversation_id: e.conversation_id };
  const messages = [
    { role: 'user', contenu: `Estimation · ${e.bien}` },
    {
      role: 'assistant', contenu: messageDeReprise(e),
      ...(!e.avis && e.de_la_visite && !e.de_la_visite.confirme_le && e.de_la_visite.reponses?.adresse ? { boutons: [{ libelle: "Oui, c'est juste", texte: OUI_VISITE, principal: true }] } : {}),
      ...(e.avis ? { cartes: [{ titre: 'Avis de valeur', detail: e.avis.chiffres?.valeur ? `${e.avis.chiffres.valeur.toLocaleString('fr-FR')} € · fourchette ${e.avis.chiffres.bas?.toLocaleString('fr-FR')} – ${e.avis.chiffres.haut?.toLocaleString('fr-FR')} €` : 'À compléter dans l’éditeur', etat: 'fait', lien: `avis:${e.id}`, action: 'Ouvrir l’avis' }] } : {}),
    },
  ];
  const r = pid ? F.rejoindreLeFil(user, pid, messages) : C.enregistrerConversation(user, { messages, espace: ESPACE_CHAT });
  if (!r.ok) return r;
  // Sans avis rédigé, le questionnaire reprend : c'est l'avis en cours de cette conversation.
  const maj = { conversation_id: r.id };
  if (!e.avis) {
    for (const x of Records.list(ENTITE).filter((y) => y.mandataire_email === e.mandataire_email && y.questionnaire_en_cours && y.id !== e.id && !y.conversation_id)) {
      Records.update(ENTITE, x.id, { questionnaire_en_cours: false });
    }
    maj.questionnaire_en_cours = true;
    if (!e.questionnaire) maj.questionnaire = { adresse: e.adresse || null, ...(e.infos_rdv ? { etat: String(e.infos_rdv).slice(0, 2000) } : {}) };
  }
  Records.update(ENTITE, e.id, maj);
  return { ok: true, conversation_id: r.id, cree: true, ...(pid ? { fil: pid } : {}) };
}

// --- L'aperçu : l'avis qui se construit pendant les questions -----------------

const lignesDe = (paires) => paires.filter(([, v]) => v != null && v !== '').map(([mot, texte, alerte]) => ({ mot, texte: sansEtiquettes(String(texte)), ...(alerte ? { alerte: true } : {}) }));

/**
 * Pure : l'avis tel qu'on peut déjà l'écrire avec les réponses du
 * questionnaire, avant la rédaction. Les chiffres, le marché et les analyses
 * attendent ; tout le reste se remplit à mesure.
 */
export function avisProvisoire(e, signataireAvis = {}) {
  const q = e.questionnaire || {};
  const occupe = q.occupe === true;
  // Lu en fond pendant les questions (3 nov. 2026) : les commerces voisins, l'accès et la vacance paraissent déjà.
  const lues = lectureFraiche(e.emplacement_lu, q.adresse || e.adresse) ? lignesDeLEmplacement(e.emplacement_lu.lu || {}) : {};
  const juridiqueDit = juridiqueSignale(q);
  const loyer = Number(q.loyer_annuel_hc) || null;
  const surface = Number(q.surface_utile) || null;
  return {
    version: 1,
    provisoire: true,
    type_bien: q.type_bien || 'murs_commerce',
    type_libelle: TYPES_BIEN[q.type_bien] || 'Avis de valeur',
    occupe,
    date: jourLong(),
    bien: { rue: q.adresse || e.adresse || null, ville: '', adresse: q.adresse || e.adresse || null, lat: null, lon: null },
    demandeur: q.demandeur || null,
    signataire: signataireAvis,
    cadre: {
      objet: `Estimer la valeur vénale ${q.type_bien === 'murs_commerce' || !q.type_bien ? 'des murs' : 'du bien'} en vue d'une éventuelle cession`,
      bien: q.type_bien ? `${TYPES_BIEN[q.type_bien]}${q.occupe === true ? ' occupé' : q.occupe === false ? ' libre' : ''}${q.adresse ? `, ${q.adresse}` : ''}` : null,
      visite: q.date_visite ? `Réalisée le ${q.date_visite}${q.visite_avec ? ` en présence ${q.visite_avec}` : ''}` : null,
    },
    description: {
      resume: surface ? `${surface} m² utiles${q.reserve ? `, réserve ${q.reserve}` : ''}.` : null,
      lignes: lignesDe([['Désignation', q.description], ['Configuration', q.configuration], ['Façade', q.facade], ['Équipements', q.equipements], ['État', q.etat]]),
      surfaces: surfacesDe(q),
    },
    emplacement: {
      synthese: q.emplacement || '',
      lignes: lignesDe([['Flux', q.flux], ['Commerces voisins', lues.commerces_voisins], ['Environnement', q.environnement], ['Dynamique', q.dynamique], ['Vacance', q.vacance || lues.vacance], ['Accès', q.acces || lues.acces]]),
    },
    locatif: occupe ? {
      synthese: '',
      lignes: lignesDe([
        ['Locataire', [q.locataire, q.activite_locataire].filter(Boolean).join(', ') || null],
        ['Bail', [q.bail_type, q.date_effet ? `à effet du ${q.date_effet}` : null].filter(Boolean).join(', ') || null],
        ['Échéance', q.echeance],
        ['Loyer', loyer ? `${loyer.toLocaleString('fr-FR')} € HT HC par an${surface ? `, soit ${Math.round(loyer / surface)} €/m²` : ''}` : null],
        ['Indexation', q.indexation], ['Taxe foncière', q.taxe_fonciere], ['Charges', q.charges],
        ['Dépôt de garantie', q.depot_garantie], ['Paiements', q.paiements],
      ]),
      solidite: '',
      valeur_locative: '',
    } : null,
    juridique: { synthese: juridiqueDit?.libre || '', lignes: juridiqueDit?.lignes || [] },
    marche: { synthese: 'Le marché de la rue (Data-B, Equimmox) et les ventes alentour (DVF) se lisent à la rédaction.', references: [], source: '', loyers: null, lecture: '' },
    methodes: { synthese: 'Le taux de rendement se fixe à la rédaction : le taux de base de la ville, ajusté par les critères du bien.', taux: null, justification_taux: '', prix_m2: null, justification_prix: '', loyer: occupe ? loyer : null, surface },
    chiffres: { valeur: null, bas: null, haut: null, rendement: null, honoraires_pct: 5, frais_pct: 7.5, prix_affiche: null, cout_total: null },
    conclusion: { points: [], reserves: RESERVES, fait_a: signataireAvis.ville_signature || '[ville]' },
    // La photo de la ville, cherchée dès l'avis commencé (1er nov. 2026) : la couverture la montre avant la rédaction.
    photos: { couverture: null, emplacement: null, portrait: null, ville: e.photo_ville || null },
  };
}

/** L'aperçu d'une estimation : l'avis rédigé, sinon celui qui se construit. */
export function apercuEstimation(id, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  const manque = e.questionnaire ? manquants(e.questionnaire) : [];
  return {
    ok: true,
    estimation: e,
    provisoire: !e.avis,
    avis: e.avis || appliquerSurcouche(avisProvisoire(e, signataire({ email: e.mandataire_email })), e.surcouche),
    manquants: manque,
  };
}

// --- La surcouche : les retouches à la main avant la rédaction ----------------
//
// Pendant les questions, l'avis à droite du chat se modifie déjà. Ces
// retouches ne vivent pas dans l'avis (il n'existe pas encore) : elles se
// gardent à part, chemin par chemin, avec les styles, les positions, l'ordre
// des pages et les photos, et se reposent sur l'avis à chaque rédaction. Une
// ligne de tableau se désigne par son intitulé (« locatif.lignes.@Loyer.texte »),
// pas par sa place, qui change à mesure que les réponses arrivent.

const CHAMPS_DU_QUESTIONNAIRE = {
  demandeur: ['demandeur'],
  adresse: ['bien.rue', 'bien.adresse', 'cadre.bien'],
  date_visite: ['cadre.visite'], visite_avec: ['cadre.visite'],
  surface_utile: ['description.resume'], reserve: ['description.resume'],
  emplacement: ['emplacement.synthese'],
};

/** Pure : la surcouche sans les champs que le chat vient de renseigner. */
export function sansChampsRepondus(sc, cles = []) {
  if (!sc?.chemins) return sc;
  const visés = new Set(cles.flatMap((k) => CHAMPS_DU_QUESTIONNAIRE[k] || []));
  if (!visés.size || !Object.keys(sc.chemins).some((c) => visés.has(c))) return sc;
  return { ...sc, chemins: Object.fromEntries(Object.entries(sc.chemins).filter(([c]) => !visés.has(c))) };
}

/** Pure : l'avis, retouches à la main reposées dessus. */
export function appliquerSurcouche(avis, sc) {
  if (!avis || !sc) return avis;
  let a = avis;
  for (const [chemin, valeur] of Object.entries(sc.chemins || {})) {
    const ligne = chemin.match(/^(.*\.lignes)\.@([^.]+)\.(mot|texte)$/);
    if (ligne) {
      const liste = lireChemin(a, ligne[1]);
      const i = Array.isArray(liste) ? liste.findIndex((l) => memeIntitule(l?.mot, ligne[2])) : -1;
      if (i >= 0) a = poserChemin(a, `${ligne[1]}.${i}.${ligne[3]}`, valeur);
      continue;
    }
    if (/(^|\.)(signataire|__proto__|constructor|prototype)(\.|$)/.test(chemin)) continue;
    a = poserChemin(a, chemin, valeur);
  }
  if (sc.styles) a = { ...a, styles: { ...(a.styles || {}), ...sc.styles } };
  if (sc.positions) a = { ...a, positions: { ...(a.positions || {}), ...sc.positions } };
  if (sc.photos) a = { ...a, photos: { ...(a.photos || {}), ...sc.photos } };
  if (Object.keys(sc.chemins || {}).some((c) => c.startsWith('chiffres.'))) a = recalculerChiffres(a);
  // Les retouches demandées à l'atelier avant la rédaction se rejouent, dans l'ordre.
  if (Array.isArray(sc.operations) && sc.operations.length) a = appliquerOperations(a, sc.operations).avis;
  return a;
}

/** Les retouches à la main d'un avis pas encore rédigé : elles s'ajoutent à la surcouche. */
export function enregistrerSurcouche(id, patch = {}, user) {
  const e = Records.get(ENTITE, id);
  if (!e || e.mandataire_email !== moi(user) && user?.role !== 'admin') return { ok: false, error: 'Estimation introuvable.' };
  const avant = e.surcouche || {};
  // « remplacer » : l'éditeur envoie l'état entier (une annulation retire une retouche).
  const chemins = patch.remplacer ? {} : { ...(avant.chemins || {}) };
  for (const [c, v] of Object.entries(patch.chemins || {})) {
    if (typeof c !== 'string' || c.length > 200 || /(^|\.)(__proto__|constructor|prototype)(\.|$)/.test(c)) continue;
    chemins[c] = v;
  }
  const garde = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : undefined);
  const surcouche = {
    chemins,
    ...(garde(patch.styles) ? { styles: patch.styles } : avant.styles ? { styles: avant.styles } : {}),
    ...(garde(patch.positions) ? { positions: patch.positions } : avant.positions ? { positions: avant.positions } : {}),
    ...(avant.photos ? { photos: avant.photos } : {}),
    // L'éditeur renvoie les retouches du chat qu'il garde : une annulation en retire.
    ...(Array.isArray(patch.operations) ? { operations: patch.operations.slice(-200) } : avant.operations ? { operations: avant.operations } : {}),
  };
  Records.update(ENTITE, e.id, { surcouche });
  return { ok: true, surcouche };
}
