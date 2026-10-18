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
import { nomCourt } from './bien-analyse.js';

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

/** Les colonnes du tableau des croisements, dans l'ordre de l'écran (maquette du 18 oct. 2026). */
export const COLONNES = [['fiche', 'Fiche'], ['bail', 'Bail'], ['quittances', 'Quittances'], ['copropriete', 'Copropriété'], ['diagnostics', 'Diagnostics'], ['bien', 'Bien (Kbis, avis, Pappers)']];

/** La colonne d'une pièce lue, d'après son nom court. */
const colonneDe = (l) => {
  const n = nomCourt(l);
  if (['Bail', 'Avenant'].includes(n)) return 'bail';
  if (/quittance/i.test(`${l.categorie} ${l.document_nom}`)) return 'quittances';
  if (['Règlement', 'PV d\'AG', 'Appel de fonds'].includes(n)) return 'copropriete';
  if (['DPE', 'Diagnostic'].includes(n) || /diagnostic|amiante|dta|crep|erp/i.test(`${l.categorie} ${l.document_nom}`)) return 'diagnostics';
  if (['Avis TF', 'Kbis'].includes(n)) return 'bien';
  return null;
};

/**
 * Pure : les croisements entre sources (spec § 6, bloc 2), en tableau : une ligne par information,
 * une colonne par onglet, et ce qui est retenu. `pieces` : les pièces lues (la matrice), pour les
 * valeurs qui ne sont pas dans une grille (surfaces, avis de taxe foncière, Kbis).
 */
export function croisements({ v = {}, lot = {}, retenues = {}, corrections = {}, pieces = [] }) {
  const out = [];
  const cellules = (col) => pieces.flatMap((l) => (l.cellules?.[col]?.reponse ? [{ l, c: l.cellules[col], colonne: colonneDe(l) }] : []));
  const ajouter = (cle, information, colonnes, { ecart = false, motif = null, bloquant = false, coherent = null, choix = null } = {}) => {
    const remplies = Object.fromEntries(Object.entries(colonnes).filter(([, x]) => x && x.valeur != null && x.valeur !== ''));
    if (!Object.keys(remplies).length) return;
    const sources = COLONNES.filter(([k]) => remplies[k]).map(([k, nom]) => ({ colonne: k, nom: remplies[k].nom || nom, valeur: remplies[k].valeur, nombre: remplies[k].nombre ?? null, citation: remplies[k].citation || null }));
    const retenue = retenues[cle] || null;
    const resume = retenue ? `${retenue.valeur} · retenu` : ecart ? (bloquant ? motif : 'Écart : choisir la valeur') : coherent;
    out.push({ cle, information, colonnes: remplies, sources, ecart: !!ecart, bloquant: !!bloquant, motif: ecart ? motif : null, retenue, resume, choix });
  };

  // Loyer annuel HC HT : fiche, bail (loyer de signature), quittances × 12 (ou × 4). Une valeur corrigée à la main l'emporte.
  const loyerFiche = Number(val(lot.loyer_annuel_ht_hc)) || null;
  const loyerBail = nombreDe(corrections['bail.loyer_signature']) || Number(v.bail?.loyer_signature?.annuel_ht) || nombreDe(v.bail?.loyer_signature?.texte);
  const qLu = v.quittances?.loyer_hc_ht;
  const corrQ = corrections['quittances.loyer_hc_ht'];
  const q = corrQ && nombreDe(corrQ) ? { ...qLu, montant: nombreDe(corrQ), periodicite: /trimestr/i.test(corrQ) ? 'trimestriel' : /an\b|annuel/i.test(corrQ) ? 'annuel' : (qLu?.periodicite || 'mensuel') } : qLu;
  const fois = q?.periodicite === 'trimestriel' ? 4 : q?.periodicite === 'annuel' ? 1 : 12;
  const loyerQ = q?.montant ? q.montant * fois : null;
  const loyers = [loyerFiche, loyerBail, loyerQ].filter(Boolean);
  const ecartLoyer = loyers.length > 1 && (Math.max(...loyers) - Math.min(...loyers)) / Math.min(...loyers) > 0.02;
  ajouter('loyer', 'Loyer annuel HC HT', {
    fiche: loyerFiche ? { valeur: eur(loyerFiche), nombre: loyerFiche, nom: 'Fiche commerciale' } : null,
    bail: loyerBail ? { valeur: eur(loyerBail), nombre: loyerBail, nom: 'Bail · Loyer de signature' } : null,
    quittances: loyerQ ? { valeur: `${eur(loyerQ)} (${eur(q.montant)} × ${fois})`, nombre: loyerQ, nom: 'Quittances · Prix du loyer' } : null,
  }, { ecart: ecartLoyer, motif: `Plus de 2 % d'écart entre ${eur(Math.min(...loyers))} et ${eur(Math.max(...loyers))}.`, coherent: loyers.length ? `${eur(loyers[0])} · cohérent` : null,
    choix: ecartLoyer ? [...new Set(loyers)].map((n) => ({ valeur: eur(n), source: [loyerFiche === n && 'fiche', loyerBail === n && 'bail', loyerQ === n && 'quittances'].filter(Boolean).join(', ') })) : null });

  // Surface : la fiche et chaque pièce qui la donne ; plus de 5 % d'écart.
  const sFiche = Number(val(lot.surface_m2)) || null;
  const parCol = {};
  for (const x of cellules('surface')) { const n = nombreDe(x.c.reponse); if (n && x.colonne && !parCol[x.colonne]) parCol[x.colonne] = { valeur: `${String(n).replace('.', ',')} m²`, nombre: n, citation: x.c.citation || null }; }
  const surfaces = [sFiche, ...Object.values(parCol).map((x) => x.nombre)].filter(Boolean);
  const ecartS = surfaces.length > 1 && (Math.max(...surfaces) - Math.min(...surfaces)) / Math.min(...surfaces) > 0.05;
  ajouter('surface', 'Surface', { fiche: sFiche ? { valeur: `${String(sFiche).replace('.', ',')} m²`, nombre: sFiche } : null, ...parCol },
    { ecart: ecartS, motif: `Écart de ${surfaces.length ? Math.round(((Math.max(...surfaces) - Math.min(...surfaces)) / Math.min(...surfaces)) * 100) : 0} % entre les sources.`, coherent: surfaces.length ? `${String(surfaces[0]).replace('.', ',')} m² · cohérent` : null,
      choix: ecartS ? [...new Set(surfaces)].map((n) => ({ valeur: `${String(n).replace('.', ',')} m²`, source: n === sFiche ? 'fiche' : 'pièces' })) : null });

  // Locataire : fiche, bail (les parties), quittances, Kbis.
  const locFiche = val(lot.locataire_nom);
  const locBail = v.bail?.parties?.texte || null;
  const locKbis = cellules('parties').find((x) => x.colonne === 'bien' && nomCourt(x.l) === 'Kbis');
  const locQ = cellules('parties').find((x) => x.colonne === 'quittances');
  const noms = [locFiche, locBail, locKbis?.c.reponse, locQ?.c.reponse].filter(Boolean);
  const communs = noms.length > 1 ? [...motsDe(noms[0])].filter((m) => noms.slice(1).every((n) => motsDe(n).has(m))) : null;
  const ecartLoc = !!(noms.length > 1 && communs && !communs.length && motsDe(noms[0]).size);
  ajouter('locataire', 'Locataire', {
    fiche: locFiche ? { valeur: locFiche } : null, bail: locBail ? { valeur: locBail, nom: 'Bail · Les parties' } : null,
    quittances: locQ ? { valeur: locQ.c.reponse, citation: locQ.c.citation } : null, bien: locKbis ? { valeur: locKbis.c.reponse, citation: locKbis.c.citation, nom: 'Kbis' } : null,
  }, { ecart: ecartLoc, motif: 'Les noms ne se recoupent pas : sans acte de cession, à vérifier.', coherent: noms.length > 1 ? 'Même société partout' : 'Une seule source' });

  // Activité : fiche, destination du bail, activités interdites par le règlement ; interdite → bloquant.
  const destination = v.bail?.destination?.texte || null;
  const interdites = v.rcp?.activites_interdites?.texte || null;
  const touche = destination && interdites && !/^aucune/i.test(sans(interdites)) ? [...motsDe(destination)].filter((m) => motsDe(interdites).has(m)) : [];
  ajouter('activite', 'Activité', {
    fiche: val(lot.type_actif) ? { valeur: val(lot.type_actif) } : null, bail: destination ? { valeur: destination, nom: 'Bail · Destination' } : null,
    copropriete: interdites ? { valeur: `Interdites : ${interdites}`, nom: 'Copropriété · Activités non autorisées' } : null,
  }, { ecart: touche.length > 0, bloquant: touche.length > 0, motif: `L'activité du bail est citée parmi les activités interdites (${touche.slice(0, 3).join(', ')}).`, coherent: interdites ? 'Compatible avec le règlement' : 'Pas de règlement lu' });

  // TVA, provision, fréquence : bail et quittances.
  const ouiNon = (x) => (x === true ? 'OUI' : x === false ? 'NON' : null);
  const tvaB = v.bail?.tva?.oui; const tvaQ = v.quittances?.tva?.oui;
  ajouter('tva', 'TVA', { bail: { valeur: ouiNon(tvaB) }, quittances: { valeur: ouiNon(tvaQ) } }, { ecart: tvaB != null && tvaQ != null && tvaB !== tvaQ, motif: 'Le bail et les quittances ne disent pas la même chose.', coherent: tvaB === true || tvaQ === true ? 'Assujetti · cohérent' : 'Non assujetti · cohérent' });
  const provQ = v.quittances?.provision?.montant;
  ajouter('provision', 'Provision pour charges', { quittances: { valeur: provQ ? `${eur(provQ)} / mois` : v.quittances?.provision?.texte || null } }, { coherent: provQ ? `${eur(provQ)} / mois` : 'Une seule source' });
  const libre = (x) => (x && x !== 'inconnu' ? x : null);
  const freqB = libre(v.bail?.mode_reglement?.periodicite); const freqQ = libre(q?.periodicite);
  ajouter('frequence', 'Fréquence de paiement', { bail: { valeur: freqB }, quittances: { valeur: freqQ } }, { ecart: freqB && freqQ && freqB !== freqQ, motif: 'Fréquences différentes.', coherent: freqB || freqQ ? `${freqB || freqQ} · cohérent` : null });

  // Travaux à la charge du propriétaire : bail, PV d'AG, DTG ; chiffrés quand il y en a.
  const items = v.bail?.charges_bailleur?.items || [];
  const votes = v.pv_ag?.travaux_votes?.texte && !/^aucun/i.test(sans(v.pv_ag.travaux_votes.texte)) ? v.pv_ag.travaux_votes.texte : null;
  const discussion = v.pv_ag?.travaux_discussion?.texte && !/^aucun/i.test(sans(v.pv_ag.travaux_discussion.texte)) ? v.pv_ag.travaux_discussion.texte : null;
  const dtg = v.diagnostics?.dtg?.texte || null;
  const montant = nombreDe(votes);
  ajouter('travaux', 'Travaux à la charge du propriétaire', {
    bail: items.length ? { valeur: items.join(' ; '), nom: 'Bail · Charges restant au bailleur' } : null,
    copropriete: votes || discussion ? { valeur: [votes, discussion && `en discussion : ${discussion}`].filter(Boolean).join(' · ') } : null,
    diagnostics: { valeur: dtg || (items.length || votes ? 'DTG non fourni' : null) },
  }, { ecart: !!(v.pv_ag?.travaux_votes?.article_606 || v.diagnostics?.dtg?.travaux_606), motif: montant ? `${eur(montant)} chiffrés${discussion ? ' + travaux en discussion à chiffrer' : ''}` : 'Des gros travaux reviennent au propriétaire : à chiffrer.', coherent: 'Rien de chiffré' });

  // Taxe foncière : refacturée ou non (bail), montant de l'avis.
  const tf = v.bail?.taxes?.taxe_fonciere_refacturee;
  const avis = cellules('taxe_fonciere').map((x) => ({ ...x, n: nombreDe(x.c.reponse) })).find((x) => x.n);
  ajouter('taxe_fonciere', 'Taxe foncière', {
    bail: { valeur: tf === true ? 'Refacturée au locataire' : tf === false ? 'Au bailleur' : null },
    bien: avis ? { valeur: `Avis ${eur(avis.n)}`, citation: avis.c.citation, nom: 'Avis de taxe foncière' } : null,
  }, { ecart: tf === false, motif: avis ? `${eur(avis.n)} / an à charge` : 'Reste au bailleur', coherent: tf === true ? 'Refacturée · cohérent' : avis ? `Avis ${eur(avis.n)}` : null });
  return out;
}

const STATUT_SIGNALE = { warning: 'signale', a_verifier: 'signale', no_go: 'bloquant' };

/**
 * Pure : la synthèse complète. `grilles` : les grilles formatées (lignes et valeurs brutes) par id.
 */
export function synthese({ grilles = {}, lot = {}, documents = [], copropriete = true, retenues = {}, decisions = {}, demandes = [], validee = null, pieces = [] }) {
  const v = Object.fromEntries(Object.entries(grilles).map(([id, g]) => [id, g?.valeurs_brutes || {}]));
  const corrections = Object.fromEntries(Object.entries(grilles).flatMap(([id, g]) => (g?.lignes || []).filter((l) => l.correction?.valeur).map((l) => [`${id}.${l.id}`, l.correction.valeur])));
  const cr = croisements({ v, lot, retenues, corrections, pieces });

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
  for (const c of cr.filter((x) => x.ecart && (x.bloquant || !x.retenue))) {
    sig.push({ cle: `croisement.${c.cle}`, onglet: 'synthese', onglet_titre: 'Croisements', ligne: c.information, valeur: c.sources.map((s) => `${s.valeur} (${s.nom})`).join(' · '), motif: c.motif, source: c.sources.map((s) => s.nom).join(', '), niveau: c.bloquant ? 'bloquant' : 'signale', choix: c.choix || null, croisement: c.cle });
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
  return synthese({ grilles, pieces: (d.matrice?.lignes || []).filter((l) => !l.perime), lot: d.lots?.[0]?.lot || {}, documents, copropriete, retenues: d.valeurs_retenues || {}, decisions: d.decisions_signalements || {}, demandes: d.documents_a_demander || [], validee: d.analyse_validee || null });
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
