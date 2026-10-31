// Le dossier de vente du mandataire (27 oct. 2026, Jules : « on ne passe plus par l'analyste »). Après le mandat
// signé, la Commercialisation commence par le dossier : les pièces et leur état, les vérifications faites sur les
// pièces lues (les grilles de l'analyse de l'équipe, reprises telles quelles), le droit de préférence du locataire
// (article L. 145-46-1 du Code de commerce), puis « Mettre en vente », que le mandataire déclenche lui-même.
//
// Les pièces se lisent dans un dossier d'analyse muet (`cache_equipe`) : l'équipe ne le voit pas dans sa liste tant
// que le bien n'est pas en vente. Rien ne part vers Drive ni Monday avant la mise en vente.

import { Records } from './db.js';

const JOUR = 86400000;
const maintenant = () => new Date().toISOString();
const sans = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const eur = (n) => `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} €`;

/** Ce que le mandataire décide d'un point relevé sur les pièces. */
export const DECISIONS_POINT = { traite: 'Traité', expliquer: "À expliquer à l'acheteur", corriger: 'À corriger avec le vendeur' };

/** Pure : la catégorie d'une pièce d'après son nom de fichier (dépôt groupé) ; null quand rien ne la reconnaît. */
export function categorieDuNom(nom) {
  const t = sans(nom).replace(/[_\-.]+/g, ' ');
  const regles = [
    ['quittances', /quittance|appel de loyer|avis d ?echeance|etat locatif/],
    ['bail', /\bbail\b|avenant/],
    ['taxe_fonciere', /taxe fonciere|\btf\b|avis d ?imposition|impots? fonciers?/],
    ['diagnostics', /\bdpe\b|amiante|\bdta\b|diagnostic|\berp\b|\besris\b|termite|plomb|\bcrep\b|electri/],
    ['kbis', /k ?bis|extrait k/],
    ['titre', /titre de propriete|attestation (notariee|de propriete)|acte de vente/],
    ['copropriete', /copro|\bpv\b|proces verbal|assemblee|reglement|\brcp\b|\bedd\b|etat descriptif/],
    ['charges', /appel de (charges|fonds)|\bcharges\b/],
    ['plans', /\bplans?\b|surfaces?|metrage|carrez/],
  ];
  return regles.find(([, re]) => re.test(t))?.[0] || null;
}

// ---------------------------------------------------------------------------
// Le droit de préférence du locataire (article L. 145-46-1 du Code de commerce)
// ---------------------------------------------------------------------------

/** Les cas où l'article ne s'applique pas, dits comme le mandataire les choisit. */
export const EXCEPTIONS_PREFERENCE = {
  libre: 'Le local est vendu libre, sans locataire',
  pas_commercial: "Le local n'est pas loué à usage commercial ou artisanal",
  ensemble: "Vente unique de plusieurs locaux d'un ensemble commercial",
  distincts: 'Vente unique de locaux commerciaux distincts',
  immeuble: "Vente globale d'un immeuble comprenant des locaux commerciaux",
  copro: "Vente au copropriétaire d'un ensemble commercial",
  famille: "Vente au conjoint, à un ascendant ou à un descendant du bailleur (ou de son conjoint)",
};

const plusUnMois = (iso) => { const d = new Date(iso); d.setMonth(d.getMonth() + 1); return d.toISOString(); };

/**
 * Pure : où en est le droit de préférence. `pref` est ce que le mandataire a noté ; `occupe` dit si le bien est loué.
 * Le locataire a un mois, à compter de la réception de la notification, pour répondre ; sans réponse, l'offre tombe.
 */
export function etatPreference(pref = {}, { occupe = null, aujourdhui = new Date() } = {}) {
  const p = pref || {};
  if (p.exception) return { statut: 'ne_s_applique_pas', phrase: `Ne s'applique pas : ${(EXCEPTIONS_PREFERENCE[p.exception] || p.exception).toLowerCase()}.`, ok_pour_vente: true };
  if (occupe === false && !p.notifie_le) return { statut: 'ne_s_applique_pas', phrase: "Ne s'applique pas : le bien est vendu libre.", ok_pour_vente: true, deduit: true };
  if (p.reponse === 'accepte') return { statut: 'accepte', phrase: "Le locataire achète : il a deux mois pour réaliser la vente (quatre s'il emprunte). Le bien ne part pas aux investisseurs.", ok_pour_vente: false };
  if (p.reponse === 'refuse') return { statut: 'refuse', phrase: 'Le locataire a refusé : le bien peut être vendu à un tiers, au prix notifié ou plus cher.', ok_pour_vente: true };
  if (p.notifie_le) {
    const fin = plusUnMois(p.notifie_le);
    const passe = new Date(fin).getTime() <= new Date(aujourdhui).getTime();
    const jour = new Date(fin).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return passe
      ? { statut: 'expire', fin_delai: fin, phrase: `Le mois du locataire est passé (le ${jour}) sans acceptation : le bien peut être vendu à un tiers.`, ok_pour_vente: true }
      : { statut: 'notifie', fin_delai: fin, phrase: `Notifié au locataire : il a jusqu'au ${jour} pour répondre. On peut présenter le bien, mais pas signer avec un acheteur avant.`, ok_pour_vente: true };
  }
  return { statut: 'a_notifier', phrase: "Le locataire est prioritaire pour acheter : notifiez-lui l'offre de vente avant de vendre à un tiers.", ok_pour_vente: false };
}

/** Pure : la notification au locataire, préparée pour le propriétaire (il la signe et l'envoie en recommandé). */
export function courrierPreference({ bailleur = null, locataire = null, adresse = null, designation = null, prix = null } = {}) {
  const ligne = (x, defaut) => (x ? String(x).trim() : defaut);
  return [
    ligne(bailleur, '[Nom et adresse du propriétaire]'),
    '',
    `À l'attention de ${ligne(locataire, '[locataire, société et représentant]')}`,
    '',
    'Lettre recommandée avec demande d’avis de réception (ou remise en main propre contre récépissé)',
    '',
    `Objet : offre de vente du local que vous louez${adresse ? `, ${adresse}` : ''} (article L. 145-46-1 du Code de commerce)`,
    '',
    'Madame, Monsieur,',
    '',
    `Je vous informe de mon intention de vendre ${ligne(designation, 'le local commercial')} que vous occupez en vertu d'un bail commercial${adresse ? `, situé ${adresse}` : ''}.`,
    '',
    `Conformément à l'article L. 145-46-1 du Code de commerce, la présente notification vaut offre de vente à votre profit, au prix de ${prix ? eur(prix) : '[prix] €'}, hors honoraires de négociation, et aux conditions suivantes : [conditions de la vente].`,
    '',
    "Vous disposez d'un délai d'un mois à compter de la réception de cette offre pour vous prononcer. En cas d'acceptation, vous disposerez, à compter de la date d'envoi de votre réponse, d'un délai de deux mois pour la réalisation de la vente, porté à quatre mois si vous notifiez dans votre réponse votre intention de recourir à un prêt.",
    '',
    '[Reproduire ici, mot pour mot, les quatre premiers alinéas de l’article L. 145-46-1 du Code de commerce, à recopier depuis Légifrance : la notification les reproduit à peine de nullité.]',
    '',
    'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
    '',
    '[Date et signature du propriétaire]',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Les points relevés sur les pièces
// ---------------------------------------------------------------------------

const dateFr = (t) => { const m = String(t || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`) : null; };

/**
 * Pure : les points que les pièces lues font apparaître. Ceux des grilles de l'analyse (un bloquant, ou ce qu'un
 * acheteur relèvera), et le terme du bail : à moins de deux ans, l'acheteur demandera ce que fera le locataire.
 */
export function pointsDesPieces(synth, { echeance = null, aujourdhui = new Date() } = {}) {
  const points = (synth?.signalements || [])
    // Le rendement sous 5 % est un critère d'investisseur de l'équipe, pas un défaut du dossier du vendeur.
    .filter((s) => s.cle !== 'bien.rendement')
    .map((s) => ({ cle: s.cle, niveau: s.niveau, onglet: s.onglet_titre, ligne: s.ligne, valeur: s.valeur || null, motif: s.motif || null, source: s.source || null }));
  const fin = dateFr(String(echeance || '').split(/\bau\b/i)[1] || '');
  if (fin) {
    const mois = (fin.getTime() - new Date(aujourdhui).getTime()) / (30.44 * JOUR);
    if (mois < 24) points.push({ cle: 'bail.terme', niveau: 'signale', onglet: 'Bail', ligne: 'Terme du bail', valeur: fin.toLocaleDateString('fr-FR'), motif: mois < 0 ? 'Le bail est échu : il court en tacite prolongation, le locataire peut partir à tout moment avec six mois de préavis.' : `Le bail se termine dans ${Math.max(1, Math.round(mois))} mois : l'acheteur demandera si le locataire reste.`, source: 'Bail' });
  }
  return points;
}

/**
 * Pure : l'état du dossier, tel que le mandataire le lit. `checklist` vient de mandataire-portes (pièces reçues et
 * manquantes) ; `points` des pièces lues ; `lecture` dit si la lecture tourne encore.
 */
export function etatDuDossier({ dossier, checklist, points = [], lecture = null, preference }) {
  const decisions = dossier?.points_vente || {};
  const avecDecision = points.map((p) => ({ ...p, decision: decisions[p.cle]?.decision || null }));
  // Une pièce est « à vérifier » quand un point de son onglet reste ouvert.
  const ongletDe = { bail: 'bail', quittances: 'quittances', copropriete: 'copropriete', diagnostics: 'diagnostics' };
  const ouverts = new Set(avecDecision.filter((p) => !p.decision).map((p) => sans(p.onglet)));
  const lignes = checklist.lignes.map((l) => {
    const aVoir = l.recue && ouverts.has(ongletDe[l.cle]);
    const etat = !l.recue ? 'manquante' : lecture === 'en_cours' ? 'en_lecture' : aVoir ? 'a_verifier' : 'recue';
    return { cle: l.cle, mot: l.mot, requise: !!l.requise, etat, fichiers: l.fichiers };
  });
  const bloquants = avecDecision.filter((p) => p.niveau === 'bloquant' && p.decision !== 'traite');
  const manquantes = lignes.filter((l) => l.requise && l.etat === 'manquante');
  const raisons = [];
  if (manquantes.length) raisons.push(`Il manque ${manquantes.map((m) => m.mot.charAt(0).toLowerCase() + m.mot.slice(1)).join(', ')}.`);
  if (lecture === 'en_cours') raisons.push('Les pièces se lisent.');
  if (bloquants.length) raisons.push(`${bloquants.length} point${bloquants.length > 1 ? 's' : ''} bloquant${bloquants.length > 1 ? 's' : ''} à traiter.`);
  if (preference && !preference.ok_pour_vente) raisons.push(preference.statut === 'accepte' ? 'Le locataire achète le local.' : 'Le droit de préférence du locataire est à régler.');
  const recues = lignes.filter((l) => l.etat !== 'manquante').length;
  return {
    pieces: lignes,
    points: avecDecision,
    preference,
    pret: raisons.length === 0,
    raisons,
    phrase: raisons[0] || `Dossier complet : ${recues} pièce${recues > 1 ? 's' : ''}, ${avecDecision.length ? `${avecDecision.filter((p) => p.decision).length} point${avecDecision.length > 1 ? 's' : ''} sur ${avecDecision.length} traités` : 'aucun point relevé'}.`,
  };
}

// ---------------------------------------------------------------------------
// La lecture des pièces, dans un dossier d'analyse muet
// ---------------------------------------------------------------------------

const GRILLES_LUES = ['bail', 'quittances', 'pv_ag', 'rcp', 'diagnostics'];
const mises = new Map();

const naissances = new Map();

/** La naissance en cours du dossier d'analyse d'un dossier (le transfert l'attend plutôt que d'en créer un second). */
export const naissanceEnCours = (dossierId) => naissances.get(dossierId) || null;

/** Le dossier d'analyse où les pièces se lisent : créé au premier dépôt, caché de la liste de l'équipe. */
function dealDeLecture(d, user) {
  if (d.deal_id && Records.findBy('Deal', 'deal_id', d.deal_id)) return Promise.resolve(d.deal_id);
  // Plusieurs pièces déposées d'un coup : un seul dossier d'analyse naît.
  if (!naissances.has(d.id)) naissances.set(d.id, naitre(d, user).finally(() => naissances.delete(d.id)));
  return naissances.get(d.id);
}

async function naitre(d, user) {
  const { creerCoquille } = await import('./deal/index.js');
  // Transféré entre-temps (l'ancien envoi à l'équipe) : son dossier d'analyse sert.
  const frais = Records.get('DossierMandataire', d.id);
  if (frais?.deal_id) return frais.deal_id;
  const deal = creerCoquille({ nom: d.bien, user, apercu: { origine: 'mandataire', mandataire: d.mandataire_email, adresse: d.adresse || null, proprietaire: d.proprietaire || null } });
  const cree = Records.findBy('Deal', 'deal_id', deal.deal_id);
  Records.update('Deal', cree.id, { origine: 'mandataire', mandataire_email: d.mandataire_email, dossier_mandataire_id: d.id, proprietaire_vendeur: d.proprietaire || null, cache_equipe: true });
  Records.update('DossierMandataire', d.id, { deal_id: deal.deal_id, deal_lecture: true });
  return deal.deal_id;
}

/** Les grilles mises en forme une fois la lecture finie (le modèle, une fois par état des pièces ; le cache ensuite). */
async function mettreEnForme(dealId, user) {
  if (mises.get(dealId) === 'en_cours') return;
  mises.set(dealId, 'en_cours');
  try {
    const { etatRemplissage } = await import('./deal/matrice.js');
    for (let i = 0; i < 200 && etatRemplissage(dealId)?.etat === 'en_cours'; i++) await new Promise((r) => setTimeout(r, 3000));
    const { lireGrilleFormatee } = await import('./deal/grilles.js');
    for (const id of GRILLES_LUES) {
      try { await lireGrilleFormatee(dealId, id, { user }); } catch (e) { console.warn(`[dossier de vente] grille ${id} :`, e?.message || e); }
    }
  } finally { mises.delete(dealId); }
}

const files = new Map();

/**
 * Une pièce déposée : elle part à la lecture (sans Drive ni Monday), puis les grilles se mettent en forme. Les dépôts d'un
 * même dossier passent l'un après l'autre (28 oct. 2026, Jules : « une fois lu, pas besoin de relire ») : deux dépôts en
 * même temps déposaient chacun les pièces de l'autre, qui se relisaient ; une lecture en cours est attendue, puis seules
 * les pièces jamais lues partent.
 */
export function lirePieces(dossierId, user, opts = {}) {
  const avant = files.get(dossierId) || Promise.resolve();
  const suite = avant.catch(() => {}).then(() => lireUneFois(dossierId, user, opts));
  files.set(dossierId, suite);
  suite.finally(() => { if (files.get(dossierId) === suite) files.delete(dossierId); }).catch(() => {});
  return suite;
}

async function lireUneFois(dossierId, user, { uploadDir } = {}) {
  const d = Records.get('DossierMandataire', dossierId);
  if (!d || d.exemple || ['go', 'no_go', 'en_etude'].includes(d.statut)) return null;
  const dealId = await dealDeLecture(d, user);
  const P = await import('./mandataire-portes.js');
  // Une lecture déjà lancée sur ce dossier : on l'attend (sinon les nouvelles pièces n'étaient jamais lues).
  const { etatRemplissage } = await import('./deal/matrice.js');
  for (let i = 0; i < 200 && etatRemplissage(dealId)?.etat === 'en_cours'; i++) await new Promise((r) => setTimeout(r, 3000));
  await P.deposerSurDeal(d.id, dealId, user, uploadDir, { drive: false });
  mettreEnForme(dealId, user).catch(() => {});
  return dealId;
}

/** Ce que l'écran montre : pièces, points, droit de préférence, et si le bien peut partir en vente. */
export async function vueDuDossier(id, user) {
  const P = await import('./mandataire-portes.js');
  const d = P.lireDossier(id, user);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  const c = P.checklist(d);
  let synth = null;
  let lecture = null;
  let echeance = null;
  if (d.deal_id) {
    const { etatRemplissage } = await import('./deal/matrice.js');
    const { syntheseDu } = await import('./deal/synthese-analyse.js');
    lecture = etatRemplissage(d.deal_id)?.etat === 'en_cours' || mises.get(d.deal_id) === 'en_cours' ? 'en_cours' : null;
    synth = await syntheseDu(d.deal_id);
    const deal = Records.findBy('Deal', 'deal_id', d.deal_id);
    const bail = deal?.grilles_formatees?.bail?.valeurs?.echeance;
    echeance = bail?.texte || (bail?.debut && bail?.fin ? `du ${bail.debut} au ${bail.fin}` : null);
  }
  const mandat = d.mandat_id ? Records.get('MandatMandataire', d.mandat_id) : null;
  const q = mandat?.questionnaire || {};
  const occupe = typeof q.bien_occupe === 'boolean' ? q.bien_occupe : c.lignes.some((l) => l.cle === 'bail' && l.recue) ? true : null;
  const preference = etatPreference(d.preference, { occupe });
  const etat = etatDuDossier({ dossier: d, checklist: c, points: pointsDesPieces(synth, { echeance }), lecture, preference });
  const vendeur = [q.vendeur_societe, [q.vendeur_civilite, q.vendeur_prenom, q.vendeur_nom].filter(Boolean).join(' ')].filter(Boolean).join(', ') || d.proprietaire || null;
  return {
    ok: true,
    dossier: { id: d.id, bien: d.bien, statut: d.statut, en_vente_le: d.en_vente_le || null, photos: d.photos || [], proprietaire_email: d.proprietaire_email || null },
    ...etat,
    relance: P.relanceProprietaire(d),
    courrier: courrierPreference({ bailleur: [vendeur, q.vendeur_adresse].filter(Boolean).join('\n') || null, locataire: q.bien_locataire || null, adresse: q.bien_adresse || d.adresse || null, designation: q.bien_designation || null, prix: d.preference?.prix || mandat?.prix || d.prix || null }),
    exceptions: EXCEPTIONS_PREFERENCE,
    decisions: DECISIONS_POINT,
    depot: d.depot?.jeton ? { url: urlDeDepot(d.depot.jeton), propose_le: d.depot.propose_le || null, relance_le: d.depot.relance_le || null, ouvert_le: d.depot.ouvert_le || null, deposes: d.depot.deposes || 0, dernier_depot_le: d.depot.dernier_depot_le || null } : null,
    gestes: prochainsGestes(etat, { depot: d.depot }),
    mail_propose: d.mail_propose || null,
    boite: (await boiteDuMandataire(d.mandataire_email))?.email || null,
  };
}

/** Le mandataire tranche un point : Traité, À expliquer à l'acheteur, À corriger avec le vendeur (ou rien). */
export async function deciderPoint(id, cle, decision, user) {
  const P = await import('./mandataire-portes.js');
  const d = P.lireDossier(id, user);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  if (decision && !DECISIONS_POINT[decision]) return { ok: false, error: 'Décision inconnue.' };
  const points = { ...(d.points_vente || {}) };
  if (decision) points[String(cle)] = { decision, par: user?.email || null, le: maintenant() };
  else delete points[String(cle)];
  Records.update('DossierMandataire', d.id, { points_vente: points });
  return { ok: true };
}

/** Ce que le mandataire note du droit de préférence : une exception, la notification (date), la réponse, le prix. */
export async function noterPreference(id, body = {}, user) {
  const P = await import('./mandataire-portes.js');
  const d = P.lireDossier(id, user);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  const avant = d.preference || {};
  const pref = { ...avant };
  if ('exception' in body) {
    if (body.exception && !EXCEPTIONS_PREFERENCE[body.exception]) return { ok: false, error: 'Exception inconnue.' };
    pref.exception = body.exception || null;
  }
  if ('notifie_le' in body) {
    const t = body.notifie_le ? Date.parse(body.notifie_le) : null;
    if (body.notifie_le && !Number.isFinite(t)) return { ok: false, error: 'Date de notification illisible.' };
    if (t && t > Date.now() + JOUR) return { ok: false, error: 'La notification ne peut pas être datée dans le futur.' };
    pref.notifie_le = t ? new Date(t).toISOString() : null;
    if (!t) pref.reponse = null;
  }
  if ('reponse' in body) {
    if (body.reponse && !['accepte', 'refuse'].includes(body.reponse)) return { ok: false, error: 'Réponse inconnue.' };
    if (body.reponse && !pref.notifie_le) return { ok: false, error: "Notez d'abord la date de la notification." };
    pref.reponse = body.reponse || null;
  }
  if ('prix' in body) pref.prix = Number(body.prix) > 0 ? Math.round(Number(body.prix)) : null;
  pref.le = maintenant();
  Records.update('DossierMandataire', d.id, { preference: pref });
  return { ok: true, preference: pref };
}

/** « Mettre en vente » : le mandataire ouvre la commercialisation lui-même, quand le dossier est prêt. */
export async function mettreEnVente(id, user, { uploadDir } = {}) {
  const v = await vueDuDossier(id, user);
  if (!v.ok) return v;
  if (['go'].includes(v.dossier.statut)) return { ok: true, deja: true };
  if (!v.pret) return { ok: false, error: v.raisons.join(' ') };
  const P = await import('./mandataire-portes.js');
  return P.ouvrirLaVente(id, user, { uploadDir });
}

// ---------------------------------------------------------------------------
// L'espace de dépôt du vendeur (27 oct. 2026, Jules : « le premier mail avec un lien pour accéder à une data room et
// permettant au vendeur de déposer tout ce qu'il a »). Un lien personnel, sans compte : le vendeur voit la liste des
// pièces (sans les points relevés, réservés au mandataire), dépose ses fichiers, et le mandataire est prévenu.
// ---------------------------------------------------------------------------

const DUREE_DEPOT = 90 * JOUR;
const urlApp = () => (process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');
export const urlDeDepot = (jeton) => `${urlApp()}/DepotVendeur?jeton=${encodeURIComponent(jeton)}`;

/** Le lien de dépôt du dossier : créé une fois, prolongé quand il sert de nouveau. */
export async function lienDeDepot(id, user) {
  const P = await import('./mandataire-portes.js');
  const d = P.lireDossier(id, user);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  const { randomBytes } = await import('crypto');
  const depot = d.depot?.jeton ? { ...d.depot } : { jeton: randomBytes(24).toString('base64url'), cree_le: maintenant() };
  depot.expire_le = new Date(Date.now() + DUREE_DEPOT).toISOString();
  Records.update('DossierMandataire', d.id, { depot });
  return { ok: true, url: urlDeDepot(depot.jeton), depot };
}

/** Le dossier d'un jeton de dépôt encore valable, ou null. */
export function dossierDuJeton(jeton) {
  const j = String(jeton || '').trim();
  if (j.length < 20) return null;
  const d = Records.list('DossierMandataire').find((x) => x.depot?.jeton === j);
  if (!d || d.exemple || d.statut === 'no_go') return null;
  if (d.depot.expire_le && Date.parse(d.depot.expire_le) < Date.now()) return null;
  return d;
}

const signataire = (email) => {
  const u = Records.list('User').find((x) => String(x.email || '').toLowerCase() === String(email || '').toLowerCase());
  return { nom: u?.full_name || String(email || '').split('@')[0], email, telephone: u?.telephone || u?.phone || null };
};

/** Ce que le vendeur voit sur sa page : le bien, son mandataire, les pièces et ce qui est déjà reçu. */
export async function vueVendeur(jeton) {
  const d = dossierDuJeton(jeton);
  if (!d) return { ok: false, error: "Ce lien n'est plus valable : demandez-en un nouveau à votre conseiller." };
  if (!d.depot.ouvert_le) Records.update('DossierMandataire', d.id, { depot: { ...d.depot, ouvert_le: maintenant() } });
  const P = await import('./mandataire-portes.js');
  const c = P.checklist(d);
  const s = signataire(d.mandataire_email);
  return {
    ok: true,
    bien: d.bien,
    adresse: d.adresse || null,
    conseiller: { nom: s.nom, email: s.email, telephone: s.telephone },
    pieces: c.lignes.map((l) => ({ cle: l.cle, mot: l.mot, requise: !!l.requise, recue: l.recue, fichiers: l.fichiers.map((f) => f.nom) })),
    expire_le: d.depot.expire_le,
  };
}

/** Le vendeur dépose : chaque fichier va à la pièce choisie, sinon d'après son nom, sinon dans « Autres documents ». */
export async function deposerParLeVendeur(jeton, fichiers = [], { categorie = null, uploadDir } = {}) {
  const d = dossierDuJeton(jeton);
  if (!d) return { ok: false, error: "Ce lien n'est plus valable." };
  if (!fichiers.length) return { ok: false, error: 'Aucun fichier reçu.' };
  const P = await import('./mandataire-portes.js');
  const connues = new Set(P.piecesDu(d).map((p) => p.cle));
  if (categorie && !connues.has(categorie)) return { ok: false, error: 'Pièce inconnue.' };
  const proprio = { email: d.mandataire_email, role: 'mandataire', full_name: 'le vendeur' };
  const rangees = [];
  for (const f of fichiers) {
    const cle = categorie || categorieDuNom(f.nom) || 'autres';
    const r = P.ajouterPiece(d.id, cle, { filename: f.nom, mimetype: f.mimetype, url: f.url }, proprio, { uploadDir });
    if (!r.ok) return r;
    rangees.push({ nom: f.nom, piece: P.piecesDu(d).find((p) => p.cle === cle)?.mot || cle });
  }
  const frais = Records.get('DossierMandataire', d.id);
  Records.update('DossierMandataire', d.id, { depot: { ...frais.depot, dernier_depot_le: maintenant(), deposes: (frais.depot?.deposes || 0) + rangees.length } });
  try {
    const { notifier } = await import('./notifications.js');
    // Une notification par heure et par dossier : un vendeur qui dépose dix fichiers ne fait pas dix alertes.
    notifier({ pour: d.mandataire_email, titre: `Le vendeur a déposé ${rangees.length > 1 ? `${rangees.length} pièces` : 'une pièce'} · ${d.bien}`, texte: rangees.map((r) => `${r.piece} : ${r.nom}`).join(' ; '), lien: `/MandataireBiens?bien=${encodeURIComponent(`dossier:${d.id}`)}&etape=marche`, action: 'Voir le dossier', cle: `depot-vendeur:${d.id}:${new Date().toISOString().slice(0, 13)}` });
  } catch { /* la pièce est rangée, l'alerte attendra */ }
  return { ok: true, rangees };
}

// ---------------------------------------------------------------------------
// Haka pilote le dossier : ce qu'il propose, ses mails, ses outils
// ---------------------------------------------------------------------------

/** Pure : les gestes que Haka propose, dans l'ordre du travail (au plus trois). */
export function prochainsGestes(v, { depot = null, aujourdhui = new Date() } = {}) {
  const g = [];
  if (!v) return g;
  const manquantes = v.pieces.filter((p) => p.requise && p.etat === 'manquante');
  const jours = (iso) => (iso ? (new Date(aujourdhui).getTime() - Date.parse(iso)) / JOUR : null);
  if (!depot?.propose_le && manquantes.length) g.push({ cle: 'premier_mail', libelle: 'Écrire au vendeur', texte: 'Prépare le premier mail au vendeur, avec le lien de son espace de dépôt et la liste des pièces.' });
  else if (manquantes.length && jours(depot?.relance_le || depot?.propose_le) >= 3 && !(depot?.dernier_depot_le && jours(depot.dernier_depot_le) < 2)) g.push({ cle: 'relance', libelle: 'Relancer le vendeur', texte: 'Prépare la relance du vendeur pour les pièces qui manquent.', principal: true });
  const ouverts = v.points.filter((p) => !p.decision);
  if (ouverts.length) g.push({ cle: 'points', libelle: `Voir ${ouverts.length > 1 ? `les ${ouverts.length} points` : 'le point'} relevé${ouverts.length > 1 ? 's' : ''}`, texte: 'Explique-moi les points relevés sur les pièces et ce que tu me conseilles pour chacun.' });
  // Le droit de préférence en tête (28 oct. 2026, Jules : « Haka doit direct le proposer ») : le mois du locataire ne
  // court qu'à la réception de la notification, plus tôt elle part, plus tôt le bien peut être vendu à un tiers.
  if (v.preference?.statut === 'a_notifier') g.unshift({ cle: 'preference', libelle: 'Préparer la notification au locataire', texte: 'Prépare la notification du droit de préférence au locataire et dis-moi comment l’envoyer.', principal: true });
  if (v.pret) g.unshift({ cle: 'vente', libelle: 'Mettre en vente', texte: 'Le dossier est prêt : mets le bien en vente.', principal: true });
  return g.slice(0, 3);
}

/** Pure : le mail au vendeur, premier envoi ou relance, avec le lien de son espace de dépôt. */
export function mailVendeur({ genre = 'premier', bien, proprietaire = null, manquantes = [], url, signature = null }) {
  const bonjour = `Bonjour${proprietaire ? ` ${proprietaire}` : ''},`;
  const liste = manquantes.map((m) => `- ${m}`).join('\n');
  const fin = `\n\nBien cordialement,${signature ? `\n${signature}` : ''}`;
  if (genre === 'relance') {
    return {
      objet: `${bien} : les documents qui manquent encore`,
      corps: `${bonjour}\n\nPour présenter votre bien aux investisseurs, il me manque encore :\n${liste || '- quelques documents'}\n\nVous pouvez les déposer directement ici, en photo ou en PDF, sans créer de compte :\n${url}\n\nMerci beaucoup.${fin}`,
    };
  }
  return {
    objet: `${bien} : votre espace pour déposer les documents de la vente`,
    corps: `${bonjour}\n\nMerci encore pour votre confiance. Pour préparer la mise en vente de votre bien, j'ai besoin de quelques documents :\n${liste || '- les documents de votre bien'}\n\nVous pouvez tout déposer ici, en photo ou en PDF, sans créer de compte : chaque document se range tout seul, et je suis prévenu à chaque envoi.\n${url}\n\nTout autre document utile (plans, travaux, correspondances avec le locataire) est le bienvenu. Je reviens vers vous dès que le dossier est complet, avec les prochaines étapes.${fin}`,
  };
}

/** Le dossier de vente lié à la conversation : celui choisi, sinon celui du mandat de la fiche ouverte. */
export function dossierDuContexte({ dossier_vente_id = null, fiche = null } = {}, user) {
  const moi = String(user?.email || '').toLowerCase();
  const a = (d) => (d && String(d.mandataire_email || '').toLowerCase() === moi ? d : null);
  if (dossier_vente_id) return a(Records.get('DossierMandataire', dossier_vente_id));
  if (!fiche) return null;
  const mandats = Records.list('MandatMandataire').filter((m) => m.proprietaire_id === fiche.id || (fiche.biens?.estimation_id && m.estimation_id === fiche.biens.estimation_id));
  const ids = new Set(mandats.map((m) => m.id));
  return a(Records.list('DossierMandataire').find((d) => d.mandat_id && ids.has(d.mandat_id)) || null);
}

/** Pure : ce que Haka sait du dossier, en tête de la conversation. */
export function cadreDuDossier(v, d, gestes = []) {
  if (!v?.ok) return '';
  const pieces = v.pieces.map((p) => `${p.mot}${p.requise ? '' : ' (facultatif)'} : ${{ recue: 'reçue', en_lecture: 'en lecture', a_verifier: 'à vérifier', manquante: 'manquante' }[p.etat]}`).join(' ; ');
  const points = v.points.map((p) => `[${p.cle}] ${p.niveau === 'bloquant' ? 'BLOQUANT' : 'à voir'} · ${p.onglet} · ${p.ligne}${p.motif ? ` : ${p.motif}` : ''}${p.decision ? ` → ${DECISIONS_POINT[p.decision]}` : ' (non tranché)'}`).join('\n');
  const depot = d?.depot;
  return [
    `\n\nDOSSIER DE VENTE ouvert à l'écran : « ${d.bien} » (dossier ${d.id}), statut ${d.statut}. Plus d'analyste : le mandataire complète le dossier, puis le met en vente lui-même. Tu es son assistant pour cette étape : tu proposes le geste suivant, tu rédiges, il valide.`,
    `Pièces : ${pieces}.`,
    points ? `Points relevés sur les pièces :\n${points}` : 'Aucun point relevé pour l\'instant.',
    `Droit de préférence du locataire (art. L. 145-46-1) : ${v.preference.phrase}`,
    `Espace de dépôt du vendeur : ${depot?.jeton ? `lien créé${depot.propose_le ? `, mail proposé le ${depot.propose_le.slice(0, 10)}` : ''}${depot.ouvert_le ? `, ouvert par le vendeur le ${depot.ouvert_le.slice(0, 10)}` : ', pas encore ouvert'}${depot.deposes ? `, ${depot.deposes} fichier(s) déposé(s) par le vendeur` : ''}` : 'pas encore créé'}.`,
    `Mise en vente : ${v.pret ? 'possible maintenant' : `pas encore (${v.raisons.join(' ')})`}.`,
    gestes.length ? `Gestes à proposer, dans l'ordre : ${gestes.map((x) => x.libelle).join(', ')}.` : '',
    "Outils : dossier_de_vente (relire l'état), mail_vendeur (premier mail avec le lien de dépôt, ou relance : un brouillon que le mandataire envoie de sa messagerie), trancher_point (Traité, À expliquer à l'acheteur, À corriger avec le vendeur), droit_de_preference (notifiée le, réponse, exception, ou le courrier), mettre_en_vente (une carte à confirmer d'un tap). Pour un point, explique en une phrase ce qu'un acheteur en dira et conseille une décision ; ne tranche que si le mandataire le dit. N'invente jamais une date de notification ni une réponse du locataire.",
  ].filter(Boolean).join('\n');
}

export const OUTILS_DOSSIER_VENTE = [
  { name: 'dossier_de_vente', description: "L'état du dossier de vente du bien ouvert : pièces, points relevés, droit de préférence, lien de dépôt du vendeur, et si le bien peut être mis en vente.", input_schema: { type: 'object', properties: {} } },
  {
    name: 'mail_vendeur',
    description: "Rédige le mail au vendeur avec le lien de son espace de dépôt (genre « premier ») ou la relance des pièces manquantes (genre « relance »). Brouillon seulement : le mandataire l'envoie de sa messagerie. `corps` remplace le texte proposé ; le lien y est toujours.",
    input_schema: { type: 'object', properties: { genre: { type: 'string', enum: ['premier', 'relance'] }, corps: { type: 'string' } }, required: ['genre'] },
  },
  {
    name: 'trancher_point',
    description: 'Tranche un point relevé sur les pièces, seulement quand le mandataire l\'a décidé. decision : traite, expliquer, corriger, ou vide pour revenir en arrière.',
    input_schema: { type: 'object', properties: { cle: { type: 'string' }, decision: { type: 'string', enum: ['traite', 'expliquer', 'corriger', ''] } }, required: ['cle'] },
  },
  {
    name: 'droit_de_preference',
    description: "Le droit de préférence du locataire. action « courrier » : la notification à faire signer au propriétaire. « notifiee » : la date où le locataire l'a reçue (dite par le mandataire). « reponse » : accepte ou refuse. « exception » : la raison pour laquelle il ne s'applique pas (libre, pas_commercial, ensemble, distincts, immeuble, copro, famille).",
    input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['courrier', 'notifiee', 'reponse', 'exception'] }, date: { type: 'string', description: 'AAAA-MM-JJ' }, reponse: { type: 'string', enum: ['accepte', 'refuse', ''] }, exception: { type: 'string' } }, required: ['action'] },
  },
  { name: 'mettre_en_vente', description: 'Propose la mise en vente du bien : une carte que le mandataire confirme d\'un tap. Seulement quand le dossier est prêt.', input_schema: { type: 'object', properties: {} } },
];
export const NOMS_DOSSIER_VENTE = new Set(OUTILS_DOSSIER_VENTE.map((o) => o.name));

/** Les outils du dossier de vente, pour Haka. */
export async function executerOutilDossier(appel, user, contexte = {}) {
  const d = dossierDuContexte(contexte, user);
  if (!d) return { ok: false, error: "Aucun dossier de vente ouvert : il naît au mandat signé, dans la Commercialisation du bien." };
  const input = appel.input || {};
  if (appel.name === 'dossier_de_vente') {
    const v = await vueDuDossier(d.id, user);
    if (!v.ok) return v;
    return { ok: true, phrase: v.phrase, pret: v.pret, raisons: v.raisons, pieces: v.pieces.map((p) => ({ piece: p.mot, requise: p.requise, etat: p.etat })), points: v.points, preference: v.preference.phrase, depot: d.depot || null, gestes: prochainsGestes(v, { depot: d.depot }) };
  }
  if (appel.name === 'mail_vendeur') {
    const l = await lienDeDepot(d.id, user);
    if (!l.ok) return l;
    const v = await vueDuDossier(d.id, user);
    const manquantes = v.pieces.filter((p) => p.etat === 'manquante' && (p.requise || input.genre !== 'relance')).filter((p) => p.cle !== 'autres').map((p) => (p.requise ? p.mot : `${p.mot} (si vous l'avez)`));
    const s = signataire(d.mandataire_email);
    const m = mailVendeur({ genre: input.genre, bien: d.bien, proprietaire: d.proprietaire, manquantes, url: l.url, signature: [s.nom, s.telephone].filter(Boolean).join('\n') });
    let corps = String(input.corps || '').trim() || m.corps;
    if (!corps.includes(l.url)) corps = `${corps}\n\nLe lien pour déposer les documents :\n${l.url}`;
    // Le mail attend sur le dossier comme celui de la veille ; il est marqué parti à l'envoi seulement.
    const genre = input.genre === 'relance' ? 'relance' : 'premier';
    Records.update('DossierMandataire', d.id, { mail_propose: { genre, raison: genre === 'relance' ? 'Relance préparée à votre demande.' : 'Mail au vendeur préparé à votre demande.', a: d.proprietaire_email || '', objet: m.objet, corps, le: maintenant() } });
    const boite = await boiteDuMandataire(user.email);
    return { ok: true, brouillon: { destinataire: d.proprietaire_email || '', objet: m.objet, corps, dossier_vente: { id: d.id, genre } }, lien: l.url, note: boite ? `Brouillon prêt sous la conversation : « Envoyer » le fait partir de ${boite.email}.` : "Brouillon prêt sous la conversation : sans boîte connectée, il s'ouvre dans la messagerie du mandataire." };
  }
  if (appel.name === 'trancher_point') return deciderPoint(d.id, input.cle, input.decision || null, user);
  if (appel.name === 'droit_de_preference') {
    if (input.action === 'courrier') {
      const v = await vueDuDossier(d.id, user);
      return { ok: true, courrier: v.courrier, note: "Le courrier est aussi sous « Préparer la notification », à droite. Le propriétaire le signe et l'envoie en recommandé avec accusé de réception ; le notaire le relit (il doit reproduire l'article mot pour mot)." };
    }
    if (input.action === 'notifiee') return noterPreference(d.id, { notifie_le: input.date || null }, user);
    if (input.action === 'reponse') return noterPreference(d.id, { reponse: input.reponse || null }, user);
    if (input.action === 'exception') return noterPreference(d.id, { exception: input.exception || null }, user);
    return { ok: false, error: 'Action inconnue.' };
  }
  if (appel.name === 'mettre_en_vente') {
    const v = await vueDuDossier(d.id, user);
    if (!v.pret) return { ok: false, error: `Pas encore : ${v.raisons.join(' ')}` };
    return { ok: true, a_confirmer: true, carte: { type: 'confirmer_vente', id: `vente-${d.id}`, dossier_id: d.id, mot: 'Mettre en vente', titre: d.bien, pour: 'Mettre en vente' }, note: "Pas encore fait : le mandataire confirme d'un tap." };
  }
  return { ok: false, error: 'Outil inconnu.' };
}

// ---------------------------------------------------------------------------
// La veille du dossier (28 oct. 2026, Jules : « ce n'est pas au mandataire de faire le travail : l'assistant surveille
// la data room, dit qu'il reste les PV d'AG, que ça fait deux jours, qu'il a préparé un mail : envoyer ? »). Aucun appel
// au modèle : des modèles de mails fixes. Le mail préparé attend sur le dossier (`mail_propose`) ; il part au « Envoyer »
// du mandataire, depuis sa propre boîte Google si elle est connectée, sinon par sa messagerie.
// ---------------------------------------------------------------------------

export const DELAI_RELANCE_JOURS = 2;

/** Pure : le mail que Haka doit préparer maintenant (le premier, ou une relance), ou null. */
export function mailAPreparer(v, depot = null, { aujourdhui = new Date(), deja = null } = {}) {
  if (!v || deja) return null;
  const manquantes = v.pieces.filter((p) => p.requise && p.etat === 'manquante').map((p) => p.mot);
  if (!manquantes.length) return null;
  const jours0 = (iso) => (iso ? (new Date(aujourdhui).getTime() - Date.parse(iso)) / JOUR : Infinity);
  if (!depot?.propose_le && jours0(depot?.premier_ecarte_le) < DELAI_RELANCE_JOURS) return null;
  if (!depot?.propose_le) return { genre: 'premier', manquantes, raison: "Le mandat est signé : j'ai préparé le mail au vendeur, avec le lien de son espace de dépôt." };
  const jours = (iso) => (iso ? (new Date(aujourdhui).getTime() - Date.parse(iso)) / JOUR : Infinity);
  const dernierContact = jours(depot.relance_le || depot.propose_le);
  if (dernierContact < DELAI_RELANCE_JOURS || jours(depot.dernier_depot_le) < DELAI_RELANCE_JOURS) return null;
  const n = Math.floor(dernierContact);
  const quoi = manquantes.length > 2 ? `${manquantes.slice(0, 2).join(', ')} et ${manquantes.length - 2} autre${manquantes.length > 3 ? 's' : ''}` : manquantes.join(' et ');
  return { genre: 'relance', manquantes, raison: `Il manque encore ${quoi.charAt(0).toLowerCase()}${quoi.slice(1)} depuis ${n} jour${n > 1 ? 's' : ''} : j'ai préparé la relance.` };
}

/** Prépare (une fois) le mail que la veille demande, et prévient le mandataire. Rien ne part. */
export async function veilleDuDossier(id) {
  const d = Records.get('DossierMandataire', id);
  if (!d || d.exemple || ['go', 'no_go'].includes(d.statut)) return null;
  const proprio = { email: d.mandataire_email, role: 'mandataire' };
  const v = await vueDuDossier(d.id, proprio);
  if (!v.ok) return null;
  const a = mailAPreparer(v, d.depot, { deja: d.mail_propose });
  if (!a) return null;
  const l = await lienDeDepot(d.id, proprio);
  const s = signataire(d.mandataire_email);
  const m = mailVendeur({ genre: a.genre, bien: d.bien, proprietaire: d.proprietaire, manquantes: a.genre === 'premier' ? v.pieces.filter((p) => p.etat === 'manquante' && p.cle !== 'autres').map((p) => (p.requise ? p.mot : `${p.mot} (si vous l'avez)`)) : a.manquantes, url: l.url, signature: [s.nom, s.telephone].filter(Boolean).join('\n') });
  const mail = { genre: a.genre, raison: a.raison, a: d.proprietaire_email || '', objet: m.objet, corps: m.corps, le: maintenant() };
  Records.update('DossierMandataire', d.id, { mail_propose: mail });
  try {
    const { notifier } = await import('./notifications.js');
    notifier({ pour: d.mandataire_email, titre: `Assistant KPartners · ${d.bien}`, texte: `${a.raison} Envoyer ?`, lien: `/MandataireBiens?bien=${encodeURIComponent(`dossier:${d.id}`)}&etape=marche`, action: 'Voir le mail', cle: `mail-vendeur:${d.id}:${mail.le.slice(0, 10)}` });
  } catch { /* le mail attend sur le dossier */ }
  return mail;
}

/** Un tour de veille sur tous les dossiers de vente ouverts. */
export async function tourDeVeille() {
  let n = 0;
  for (const d of Records.list('DossierMandataire').filter((x) => !x.exemple && !x.essai_bien && !['go', 'no_go'].includes(x.statut) && x.mandat_id)) {
    try { if (await veilleDuDossier(d.id)) n += 1; } catch (e) { console.warn(`[dossier de vente] veille ${d.id} :`, e?.message || e); }
  }
  return n;
}

/** La veille tourne toutes les heures, de 8 h à 19 h (heure de Paris), en ligne ou avec DOSSIER_VEILLE=1. */
export function planifier() {
  const actif = process.env.DOSSIER_VEILLE === '1' || (!!process.env.RENDER && process.env.DOSSIER_VEILLE !== '0');
  if (!actif) return null;
  const t = setInterval(() => {
    const h = Number(new Date().toLocaleString('fr-FR', { hour: '2-digit', hour12: false, timeZone: 'Europe/Paris' }));
    if (h >= 8 && h < 19) tourDeVeille().catch((e) => console.error('[dossier de vente] veille :', e?.message || e));
  }, 3600 * 1000);
  t.unref?.();
  return t;
}

/** La boîte Google du mandataire qui sait envoyer, ou null (jamais une boîte partagée de Klocka). */
export async function boiteDuMandataire(email) {
  const { listAccounts } = await import('./email.js');
  return listAccounts(email).find((a) => a.provider === 'google' && a.peut_envoyer && !a.needs_reconnect) || null;
}

/**
 * « Envoyer » : le mail préparé (ou celui que le mandataire a retouché) part de sa boîte. Sans boîte connectée, rien ne
 * part : l'écran ouvre sa messagerie, puis « C'est envoyé » marque le mail comme parti (`marquer`).
 */
export async function envoyerMailVendeur(id, user, { objet = null, corps = null, a = null, marquer = false } = {}) {
  const P = await import('./mandataire-portes.js');
  const d = P.lireDossier(id, user);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  const mail = { ...(d.mail_propose || {}), ...(objet ? { objet } : {}), ...(corps ? { corps } : {}), ...(a != null ? { a } : {}) };
  if (!mail.objet || !mail.corps) return { ok: false, error: 'Aucun mail préparé.' };
  const genre = mail.genre || (d.depot?.propose_le ? 'relance' : 'premier');
  if (!marquer) {
    if (!String(mail.a || '').includes('@')) return { ok: false, error: "L'adresse du vendeur manque : ajoutez-la au mail." };
    const boite = await boiteDuMandataire(user.email);
    if (!boite) return { ok: false, sans_boite: true, mail };
    const { sendEmail } = await import('./email.js');
    const r = await sendEmail({ from: boite.id, owner: user.email, to: mail.a, subject: mail.objet, body: mail.corps, intention: `dossier_vente_${genre}` });
    if (!r?.success) return { ok: false, error: r?.error || "Le mail n'est pas parti." };
  }
  const frais = Records.get('DossierMandataire', d.id);
  const depot = { ...(frais.depot || {}), [genre === 'premier' ? 'propose_le' : 'relance_le']: maintenant() };
  Records.update('DossierMandataire', d.id, { depot, mail_propose: null, ...(mail.a && !frais.proprietaire_email ? { proprietaire_email: String(mail.a).trim().toLowerCase() } : {}) });
  return { ok: true, envoye: !marquer, genre };
}

/** « Pas maintenant » : le mail préparé est retiré ; la veille en reproposera un après le délai. */
export async function ecarterMailVendeur(id, user) {
  const P = await import('./mandataire-portes.js');
  const d = P.lireDossier(id, user);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  const genre = d.mail_propose?.genre;
  Records.update('DossierMandataire', d.id, { mail_propose: null, depot: { ...(d.depot || {}), [genre === 'relance' ? 'relance_le' : 'premier_ecarte_le']: maintenant() } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Après le teaser, deux voies (28 oct. 2026, Jules) : le mandataire le commercialise lui-même, ou l'envoie à Klocka.
// Chez Klocka, l'analyste coche l'avancement dans la conversation du dossier ; le mandataire le lit, sans plus.
// ---------------------------------------------------------------------------

export const ETAPES_KLOCKA = [['analyse', 'Analyse'], ['presentation', 'Présentation'], ['interesse', 'Intéressé'], ['offre', 'Offre'], ['financement', 'Financement']];

/** Le mandataire choisit la voie : « klocka » (envoyé à Klocka) ou « moi » (il le commercialise lui-même). */
export async function choisirVoie(marcheId, voie, user) {
  if (!['klocka', 'moi'].includes(voie)) return { ok: false, error: 'Voie inconnue.' };
  const P = await import('./mandataire-portes.js');
  const m = P.lireMarche(marcheId, user);
  if (!m) return { ok: false, error: 'Commercialisation introuvable.' };
  const d = m.dossier_id ? Records.get('DossierMandataire', m.dossier_id) : null;
  if (voie === 'klocka' && !d) return { ok: false, error: "Ce bien n'a pas de dossier à envoyer." };
  Records.update('MiseEnMarche', m.id, { voie, voie_le: maintenant() });
  if (voie === 'klocka') {
    // L'équipe voit le dossier, un analyste le prend, la conversation s'ouvre.
    if (d.deal_id) { const deal = Records.findBy('Deal', 'deal_id', d.deal_id); if (deal?.cache_equipe) Records.update('Deal', deal.id, { cache_equipe: false }); }
    // Pas d'analyste attitré (28 oct. 2026, Jules) : le mandataire parle à l'équipe, n'importe quel membre répond.
    Records.update('DossierMandataire', d.id, { envoye_klocka_le: maintenant(), deal_lecture: false, equipe: true });
    const F = await import('./fil-dossier.js');
    F.evenement(d.id, "Envoyé à Klocka : le teaser, le mandat, l'avis de valeur, les photos et la data room. L'équipe Klocka suit le dossier ici : n'importe qui peut vous répondre.");
    try {
      const { notifier } = await import('./notifications.js');
      for (const a of F.ANALYSTES) notifier({ pour: a.email, titre: `Bien envoyé par un mandataire · ${d.bien}`, texte: 'Teaser validé, data room lue : à analyser et présenter.', lien: d.deal_id ? `/Analyse?deal_id=${d.deal_id}` : `/Conversations?dossier=${d.id}`, action: 'Ouvrir', cle: `envoi-klocka:${d.id}:${a.email}` });
    } catch { /* le fil le dit déjà */ }
  }
  return { ok: true, marche: Records.get('MiseEnMarche', m.id) };
}

/** L'analyste coche (ou décoche) une étape de l'avancement ; la conversation le dit. */
export async function cocherAvancement(dossierId, etape, fait, user) {
  if (user?.role !== 'admin') return { ok: false, error: 'Réservé à Klocka.' };
  const libelle = ETAPES_KLOCKA.find(([k]) => k === etape)?.[1];
  if (!libelle) return { ok: false, error: 'Étape inconnue.' };
  const d = Records.get('DossierMandataire', dossierId);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  const avancement = { ...(d.avancement || {}) };
  if (fait) avancement[etape] = { le: maintenant(), par: user.email };
  else delete avancement[etape];
  Records.update('DossierMandataire', d.id, { avancement });
  const F = await import('./fil-dossier.js');
  F.evenement(d.id, fait ? `Avancement : ${libelle}.` : `Avancement : ${libelle} décoché.`);
  // Le passage à l'offre se notifie au mandataire (28 oct. 2026, Jules) ; l'étape du bien, elle, ne bouge pas.
  if (fait && etape === 'offre') {
    try {
      const { notifier } = await import('./notifications.js');
      notifier({ pour: d.mandataire_email, titre: `Offre en cours · ${d.bien}`, texte: "Klocka est passée à l'offre sur votre bien.", lien: `/MandataireBiens?bien=${encodeURIComponent(`dossier:${d.id}`)}&etape=offre`, action: 'Voir', cle: `avancement-offre:${d.id}` });
    } catch { /* la conversation le dit déjà */ }
  }
  return { ok: true, avancement };
}
