// L'onglet Synthèse du module d'analyse (spec du 17 oct. 2026, Jules) : l'écran
// d'arrivée. Il n'a aucune donnée propre : il rassemble ce que les autres
// onglets ont trouvé. Quatre blocs : verdict et documents, croisements entre
// sources, signalements à traiter, validation.
//
// Tout est calculé par le CODE, sur les lignes déjà lues et mises en forme
// (lecture du cache des grilles, jamais d'appel au modèle ici). L'analyste
// tranche : la valeur retenue d'un croisement, la décision sur un signalement
// (Accepter, Négocier, Écarter avec motif), la validation. Chaque geste est
// écrit dans l'historique de l'analyse, qui ne s'efface pas.

import { Records } from '../db.js';
import { prixFai } from './prix.js';

const val = (c) => (c && c.absent === false ? c.valeur : null);
const sans = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const eur = (n) => `${Math.round(n).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} €`;
const maintenant = () => new Date().toISOString();

/** Les onglets de documents, dans l'ordre de l'écran, et leurs grilles. */
export const ONGLETS = [
  { id: 'bail', titre: 'Bail', grilles: ['bail'] },
  { id: 'quittances', titre: 'Quittances', grilles: ['quittances'] },
  { id: 'copropriete', titre: 'Copropriété', grilles: ['pv_ag', 'rcp'] },
  { id: 'diagnostics', titre: 'Diagnostics', grilles: ['diagnostics'] },
];

/** Les documents attendus (spec § 6) : obligatoires et facultatifs, et comment les reconnaître. */
export const DOCUMENTS = [
  { cle: 'bail', nom: 'Bail commercial', onglet: 'bail', obligatoire: true, re: /\bbail\b|bail commercial/ },
  { cle: 'avenants', nom: 'Avenants', onglet: 'bail', obligatoire: true, re: /avenant/ },
  { cle: 'inventaire', nom: 'Inventaire des charges', onglet: 'bail', obligatoire: true, re: /inventaire|repartition des charges|charges/ },
  { cle: 'quittances', nom: 'Quittances (12 mois)', onglet: 'quittances', obligatoire: true, re: /quittance|appel de loyer|releve de compte|avis d.?echeance/ },
  { cle: 'pv_ag', nom: "PV des 3 dernières AG", onglet: 'copropriete', obligatoire: true, copro: true, re: /\bpv\b|assemblee|proces.verbal/ },
  { cle: 'rcp', nom: 'Règlement de copropriété', onglet: 'copropriete', obligatoire: true, copro: true, re: /reglement|\brcp\b|etat descriptif|\bedd\b/ },
  { cle: 'dpe', nom: 'DPE', onglet: 'diagnostics', obligatoire: true, re: /\bdpe\b|performance energetique/ },
  { cle: 'amiante', nom: 'Amiante', onglet: 'diagnostics', obligatoire: true, re: /amiante|\bdta\b/ },
  { cle: 'erp', nom: 'ERP', onglet: 'diagnostics', obligatoire: true, re: /\berp\b|etat des risques|\bernmt\b|\besris\b/ },
  { cle: 'electricite', nom: 'Électricité', onglet: 'diagnostics', obligatoire: true, re: /electri/ },
  { cle: 'taxe_fonciere', nom: 'Avis de taxe foncière', onglet: 'bien', obligatoire: true, re: /taxe fonciere|avis d.?imposition|\btf\b/ },
  { cle: 'kbis', nom: 'Kbis du locataire', onglet: 'bien', obligatoire: true, re: /kbis|k bis|extrait k/ },
  { cle: 'dtg', nom: 'DTG', onglet: 'diagnostics', obligatoire: false, re: /\bdtg\b|diagnostic technique global/ },
  { cle: 'termites', nom: 'Termites', onglet: 'diagnostics', obligatoire: false, re: /termite/ },
  { cle: 'plomb', nom: 'Plomb', onglet: 'diagnostics', obligatoire: false, re: /plomb|\bcrep\b/ },
  { cle: 'bilans', nom: 'Bilans du locataire', onglet: 'bien', obligatoire: false, re: /bilan|liasse|compte de resultat/ },
  { cle: 'titre', nom: 'Titre de propriété', onglet: 'bien', obligatoire: false, re: /titre de propriete|\bacte\b|attestation notariee/ },
];

/** Pure : la checklist des documents attendus, cochée d'après le nom et la catégorie des documents reçus. */
export function checklistDocuments(documents = [], { copropriete = true, demandes = [] } = {}) {
  const texte = (d) => sans(`${d.categorie || ''} ${d.nom || d.document_nom || ''}`);
  return DOCUMENTS.filter((x) => copropriete || !x.copro).map((x) => {
    const recus = documents.filter((d) => x.re.test(texte(d)));
    return { cle: x.cle, nom: x.nom, onglet: x.onglet, obligatoire: x.obligatoire, recu: recus.length > 0, documents: recus.map((d) => d.nom || d.document_nom).slice(0, 5), demande: demandes.includes(x.cle) };
  });
}

/** Pure : un nombre lu dans un texte (« 18 000 € / an » → 18000). */
export function nombreDe(t) {
  const m = String(t ?? '').replace(/\u202f|\u00a0/g, ' ').match(/(\d[\d\s]*(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const MOTS_VIDES = new Set(['toutes', 'activites', 'activite', 'commerce', 'commerces', 'locaux', 'local', 'sauf', 'avec', 'sans', 'vente', 'exception', 'exercice', 'autorisee', 'autorisees', 'interdite', 'interdites', 'aucune', 'dans', 'pour', 'ainsi', 'leurs', 'cette', 'celles', 'ceux', 'notamment', 'produits', 'services', 'nature', 'toute']);
const motsDe = (t) => new Set(sans(t).split(/[^a-z]+/).filter((m) => m.length >= 5 && !MOTS_VIDES.has(m)));

/**
 * Pure : les croisements entre sources (spec § 6, bloc 2). Chaque ligne : les valeurs côte à côte,
 * s'il y a un écart, et la valeur retenue par l'analyste s'il en a choisi une.
 * @param {{bail?: object, quittances?: object, pv_ag?: object, rcp?: object, diagnostics?: object}} v  valeurs brutes des grilles
 */
export function croisements({ v = {}, lot = {}, retenues = {}, corrections = {} }) {
  const out = [];
  const ajouter = (cle, information, sources, ecart, motif, extra = {}) => {
    const s = sources.filter((x) => x.valeur != null && x.valeur !== '');
    if (!s.length) return;
    out.push({ cle, information, sources: s, ecart: !!ecart, motif: ecart ? motif : null, retenue: retenues[cle] || null, ...extra });
  };

  // Loyer annuel HC HT : fiche, bail (loyer de signature), quittances × 12 (ou × 4).
  const loyerFiche = Number(val(lot.loyer_annuel_ht_hc)) || null;
  // Une valeur corrigée à la main l'emporte sur la lecture : elle est verrouillée.
  const loyerBail = nombreDe(corrections['bail.loyer_signature']) || Number(v.bail?.loyer_signature?.annuel_ht) || nombreDe(v.bail?.loyer_signature?.texte);
  const qLu = v.quittances?.loyer_hc_ht;
  const q = corrections['quittances.loyer_hc_ht'] && nombreDe(corrections['quittances.loyer_hc_ht']) ? { ...qLu, montant: nombreDe(corrections['quittances.loyer_hc_ht']), periodicite: /trimestr/i.test(corrections['quittances.loyer_hc_ht']) ? 'trimestriel' : /an\b|annuel/i.test(corrections['quittances.loyer_hc_ht']) ? 'annuel' : (qLu?.periodicite || 'mensuel') } : qLu;
  const loyerQ = q?.montant ? (q.periodicite === 'trimestriel' ? q.montant * 4 : q.periodicite === 'annuel' ? q.montant : q.montant * 12) : null;
  const loyers = [loyerFiche, loyerBail, loyerQ].filter(Boolean);
  const ecartLoyer = loyers.length > 1 && (Math.max(...loyers) - Math.min(...loyers)) / Math.min(...loyers) > 0.02;
  ajouter('loyer', 'Loyer annuel HC HT', [
    { nom: 'Fiche commerciale', valeur: loyerFiche ? eur(loyerFiche) : null, nombre: loyerFiche },
    { nom: 'Bail · Loyer de signature', valeur: loyerBail ? eur(loyerBail) : null, nombre: loyerBail },
    { nom: 'Quittances · Prix du loyer', valeur: loyerQ ? `${eur(loyerQ)} (${eur(q.montant)} × ${q.periodicite === 'trimestriel' ? 4 : q.periodicite === 'annuel' ? 1 : 12})` : null, nombre: loyerQ },
  ], ecartLoyer, `Plus de 2 % d'écart entre ${eur(Math.min(...loyers))} et ${eur(Math.max(...loyers))}.`);

  // TVA : bail et quittances.
  const tvaB = v.bail?.tva?.oui; const tvaQ = v.quittances?.tva?.oui;
  const ouiNon = (x) => (x === true ? 'OUI' : x === false ? 'NON' : null);
  ajouter('tva', 'TVA sur le loyer', [{ nom: 'Bail', valeur: ouiNon(tvaB) }, { nom: 'Quittances', valeur: ouiNon(tvaQ) }], tvaB != null && tvaQ != null && tvaB !== tvaQ, 'Le bail et les quittances ne disent pas la même chose.');

  // Fréquence de paiement : bail (mode de règlement) et quittances.
  const freqB = v.bail?.mode_reglement?.periodicite; const freqQ = q?.periodicite;
  const libre = (x) => (x && x !== 'inconnu' ? x : null);
  ajouter('frequence', 'Fréquence de paiement', [{ nom: 'Bail · Mode de règlement', valeur: libre(freqB) }, { nom: 'Quittances', valeur: libre(freqQ) }], libre(freqB) && libre(freqQ) && freqB !== freqQ, 'Fréquences différentes.');

  // Provision pour charges : quittances (et bail si lu).
  ajouter('provision', 'Provision pour charges', [{ nom: 'Quittances', valeur: v.quittances?.provision?.montant ? eur(v.quittances.provision.montant) : v.quittances?.provision?.texte || null }], false, null);

  // Locataire : fiche et bail (les parties).
  const locFiche = val(lot.locataire_nom);
  const locBail = v.bail?.parties?.texte || null;
  const communs = locFiche && locBail ? [...motsDe(locFiche)].filter((m) => motsDe(locBail).has(m)) : null;
  ajouter('locataire', 'Locataire', [{ nom: 'Fiche commerciale', valeur: locFiche }, { nom: 'Bail · Les parties', valeur: locBail }],
    !!(locFiche && locBail && communs && !communs.length && motsDe(locFiche).size), 'Les noms ne se recoupent pas : sans acte de cession, à vérifier.');

  // Activité : destination du bail face aux activités interdites par le règlement de copropriété.
  const destination = v.bail?.destination?.texte || null;
  const interdites = v.rcp?.activites_interdites?.texte || null;
  const touche = destination && interdites && !/^aucune/i.test(sans(interdites)) ? [...motsDe(destination)].filter((m) => motsDe(interdites).has(m)) : [];
  ajouter('activite', 'Activité', [{ nom: 'Bail · Destination', valeur: destination }, { nom: 'Copropriété · Activités non autorisées', valeur: interdites }], touche.length > 0,
    `L'activité du bail est citée parmi les activités interdites (${touche.slice(0, 3).join(', ')}).`, { bloquant: touche.length > 0 });

  // Travaux à la charge du propriétaire : bail, PV d'AG, DTG ; chiffrés quand il y en a.
  const items = v.bail?.charges_bailleur?.items || [];
  ajouter('travaux', 'Travaux à la charge du propriétaire', [
    { nom: 'Bail · Charges restant au bailleur', valeur: items.length ? items.join(' ; ') : null },
    { nom: "PV d'AG · Travaux votés", valeur: v.pv_ag?.travaux_votes?.texte && !/^aucun/i.test(sans(v.pv_ag.travaux_votes.texte)) ? v.pv_ag.travaux_votes.texte : null, nombre: nombreDe(v.pv_ag?.travaux_votes?.texte) },
    { nom: 'Diagnostics · DTG', valeur: v.diagnostics?.dtg?.texte || null },
  ], !!(v.pv_ag?.travaux_votes?.article_606 || v.diagnostics?.dtg?.travaux_606), 'Des gros travaux reviennent au propriétaire : à chiffrer.');

  // Taxe foncière : refacturée ou non (bail).
  const tf = v.bail?.taxes?.taxe_fonciere_refacturee;
  ajouter('taxe_fonciere', 'Taxe foncière', [{ nom: 'Bail · Taxes refacturées', valeur: tf === true ? 'Refacturée au locataire' : tf === false ? 'Reste au bailleur' : null }], tf === false, 'La taxe foncière reste au bailleur.');
  return out;
}

const STATUT_SIGNALE = { warning: 'signale', a_verifier: 'signale', no_go: 'bloquant' };

/**
 * Pure : la synthèse complète. `grilles` : les grilles formatées (lignes et valeurs brutes) par id.
 */
export function synthese({ grilles = {}, lot = {}, documents = [], copropriete = true, retenues = {}, decisions = {}, demandes = [], validee = null }) {
  const v = Object.fromEntries(Object.entries(grilles).map(([id, g]) => [id, g?.valeurs_brutes || {}]));
  const corrections = Object.fromEntries(Object.entries(grilles).flatMap(([id, g]) => (g?.lignes || []).filter((l) => l.correction?.valeur).map((l) => [`${id}.${l.id}`, l.correction.valeur])));
  const cr = croisements({ v, lot, retenues, corrections });

  // Les signalements : chaque ligne signalée de chaque onglet, puis les écarts des croisements, puis les bloquants calculés.
  const sig = [];
  for (const o of ONGLETS) {
    if (o.id === 'copropriete' && !copropriete) continue;
    for (const gid of o.grilles) {
      for (const l of grilles[gid]?.lignes || []) {
        const niveau = STATUT_SIGNALE[l.statut_calcule] || STATUT_SIGNALE[l.statut];
        if (!niveau) continue;
        sig.push({ cle: `${gid}.${l.id}`, onglet: o.id, onglet_titre: o.titre, ligne: l.libelle, valeur: l.valeur, motif: l.motif, source: l.lue_dans || null, niveau });
      }
    }
  }
  for (const c of cr.filter((x) => x.ecart)) {
    sig.push({ cle: `croisement.${c.cle}`, onglet: 'synthese', onglet_titre: 'Croisements', ligne: c.information, valeur: c.retenue?.valeur || c.sources.map((s) => `${s.nom} : ${s.valeur}`).join(' · '), motif: c.motif, source: c.sources.map((s) => s.nom).join(', '), niveau: c.bloquant ? 'bloquant' : 'signale' });
  }
  // Bloquant : rendement brut sous 5 %, sur le loyer retenu s'il y en a un, sinon celui de la fiche.
  const prix = prixFai(lot);
  const loyerRetenu = nombreDe(retenues.loyer?.valeur) || Number(val(lot.loyer_annuel_ht_hc)) || null;
  const rendement = prix && loyerRetenu ? (loyerRetenu / prix) * 100 : null;
  if (rendement != null && rendement < 5) sig.push({ cle: 'bien.rendement', onglet: 'bien', onglet_titre: 'Bien', ligne: 'Rendement brut', valeur: `${rendement.toFixed(1).replace('.', ',')} %`, motif: 'Rendement brut sous 5 %.', source: 'Calcul', niveau: 'bloquant' });

  const avecDecision = sig.map((s) => ({ ...s, decision: s.niveau === 'bloquant' ? null : decisions[s.cle] || null }));
  const bloquants = avecDecision.filter((s) => s.niveau === 'bloquant');
  const signales = avecDecision.filter((s) => s.niveau === 'signale');
  const traites = signales.filter((s) => s.decision);
  const docs = checklistDocuments(documents, { copropriete, demandes });
  const parOnglet = Object.fromEntries([...ONGLETS.map((o) => o.id), 'bien', 'synthese'].map((id) => [id, avecDecision.filter((s) => s.onglet === id && s.niveau === 'signale' && !s.decision).length + avecDecision.filter((s) => s.onglet === id && s.niveau === 'bloquant').length]));
  return {
    verdict: {
      bloquants: bloquants.length, signalements: signales.length, traites: traites.length,
      rendement: rendement == null ? null : Math.round(rendement * 10) / 10,
      phrase: `${bloquants.length} bloquant${bloquants.length > 1 ? 's' : ''}, ${signales.length} signalement${signales.length > 1 ? 's' : ''}, ${traites.length} traité${traites.length > 1 ? 's' : ''}`,
    },
    documents: { liste: docs, recus: docs.filter((d) => d.recu).length, total: docs.length, obligatoires_manquants: docs.filter((d) => d.obligatoire && !d.recu).length },
    croisements: cr,
    signalements: [...bloquants, ...signales.sort((a, b) => ONGLETS.findIndex((o) => o.id === a.onglet) - ONGLETS.findIndex((o) => o.id === b.onglet))],
    par_onglet: parOnglet,
    validable: !bloquants.length && traites.length === signales.length,
    validee,
  };
}

/* ------------------------------ lecture et gestes ------------------------------ */

const deal = (dealId) => Records.findBy('Deal', 'deal_id', dealId);

/** La synthèse d'un dossier, depuis le cache des grilles (aucun appel au modèle). */
export async function syntheseDu(dealId) {
  const d = deal(dealId);
  if (!d) return null;
  const { lireGrilleFormatee } = await import('./grilles.js');
  const grilles = {};
  for (const id of ['bail', 'quittances', 'pv_ag', 'rcp', 'diagnostics']) {
    try { grilles[id] = await lireGrilleFormatee(dealId, id, { cacheSeul: true }); } catch { grilles[id] = null; }
  }
  const documents = [...(d.documents_espace || []), ...((d.matrice?.lignes || []).map((l) => ({ nom: l.document_nom, categorie: l.categorie })))];
  const copropriete = d.copropriete !== false;
  return synthese({ grilles, lot: d.lots?.[0]?.lot || {}, documents, copropriete, retenues: d.valeurs_retenues || {}, decisions: d.decisions_signalements || {}, demandes: d.documents_a_demander || [], validee: d.analyse_validee || null });
}

function tracer(d, entree) {
  const h = [...(d.historique_analyse || []), { le: maintenant(), ...entree }].slice(-500);
  Records.update('Deal', d.id, { historique_analyse: h });
}

export function retenir(dealId, cle, { valeur, source }, user) {
  const d = deal(dealId);
  if (!d) return { ok: false, statut: 404, error: 'Dossier introuvable' };
  const retenues = { ...(d.valeurs_retenues || {}) };
  if (valeur == null || valeur === '') delete retenues[cle];
  else retenues[cle] = { valeur: String(valeur).slice(0, 300), source: String(source || '').slice(0, 120), par: user?.email || null, le: maintenant() };
  Records.update('Deal', d.id, { valeurs_retenues: retenues, ...(d.analyse_validee ? { analyse_a_revoir: true } : {}) });
  tracer(Records.get('Deal', d.id), { type: 'correction', cle, texte: valeur ? `${cle} : « ${valeur} » retenu (${source || 'choix de l\'analyste'})` : `${cle} : choix retiré`, par: user?.email || null });
  return { ok: true };
}

export const DECISIONS = ['accepter', 'negocier', 'ecarter'];

export function decider(dealId, cle, { decision, motif = '' }, user) {
  const d = deal(dealId);
  if (!d) return { ok: false, statut: 404, error: 'Dossier introuvable' };
  const decisions = { ...(d.decisions_signalements || {}) };
  if (!decision) delete decisions[cle];
  else {
    if (!DECISIONS.includes(decision)) return { ok: false, statut: 400, error: 'Décision inconnue' };
    if (decision === 'ecarter' && !String(motif).trim()) return { ok: false, statut: 400, error: 'Un motif est obligatoire pour écarter.' };
    decisions[cle] = { decision, motif: String(motif).trim().slice(0, 300) || null, par: user?.email || null, le: maintenant() };
  }
  Records.update('Deal', d.id, { decisions_signalements: decisions });
  const mots = { accepter: 'Accepter', negocier: 'Négocier', ecarter: 'Écarter' };
  tracer(Records.get('Deal', d.id), { type: 'decision', cle, texte: decision ? `${cle} : ${mots[decision]}${motif ? ` (${String(motif).trim()})` : ''}` : `${cle} : décision retirée`, par: user?.email || null });
  return { ok: true };
}

export function demanderDocument(dealId, cle, user) {
  const d = deal(dealId);
  if (!d) return { ok: false, statut: 404, error: 'Dossier introuvable' };
  if (!DOCUMENTS.some((x) => x.cle === cle)) return { ok: false, statut: 400, error: 'Document inconnu' };
  const demandes = [...new Set([...(d.documents_a_demander || []), cle])];
  Records.update('Deal', d.id, { documents_a_demander: demandes });
  tracer(Records.get('Deal', d.id), { type: 'document', cle, texte: `${DOCUMENTS.find((x) => x.cle === cle).nom} : à demander à l'agent`, par: user?.email || null });
  return { ok: true, demandes };
}

/** Valider : aucun bloquant, chaque signalement traité. Produit la fiche deal et fait avancer le dossier. */
export async function valider(dealId, user) {
  const s = await syntheseDu(dealId);
  if (!s) return { ok: false, statut: 404, error: 'Dossier introuvable' };
  if (s.verdict.bloquants) return { ok: false, statut: 400, error: 'Un bloquant reste : corrigez la valeur ou arrêtez le dossier.' };
  if (!s.validable) return { ok: false, statut: 400, error: 'Chaque signalement doit être traité avant de valider.' };
  const d = deal(dealId);
  const fiche = {
    le: maintenant(), par: user?.email || null, verdict: s.verdict,
    signalements: s.signalements.map(({ cle, ligne, valeur, motif, decision }) => ({ cle, ligne, valeur, motif, decision })),
    valeurs_retenues: d.valeurs_retenues || {},
  };
  Records.update('Deal', d.id, { analyse_validee: { le: fiche.le, par: fiche.par }, analyse_a_revoir: false, fiche_deal: fiche });
  try {
    const { changerStatut } = await import('./lifecycle.js');
    if (['documents_demandes', 'documents_recus'].includes(d.statut)) changerStatut(Records.get('Deal', d.id), 'depouille', { user, note: 'Analyse validée' });
  } catch { /* le statut suivra à la création du projet */ }
  tracer(Records.get('Deal', d.id), { type: 'validation', texte: `Analyse validée${user?.email ? ` par ${user.email.split('@')[0]}` : ''}, fiche deal produite`, par: user?.email || null });
  return { ok: true, fiche };
}

export const historique = (dealId) => [...(deal(dealId)?.historique_analyse || [])].reverse();
