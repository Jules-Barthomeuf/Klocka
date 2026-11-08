// Les documents d'un bien, en un seul endroit (3 nov. 2026, Jules : « ils vont avoir plein de documents par bien, il
// faut qu'ils puissent bien voir où ils sont stockés, les consulter, poser des questions »). La vue d'ensemble du bien
// les montre tous, du premier document à la vente, rangés par nature, chacun avec d'où il vient et quand :
//   - déposés par le mandataire sur le bien (`biens.pieces` de sa fiche), ou joints dans le fil du bien ;
//   - le bail joint à l'avis de valeur ;
//   - les pièces de la Data room, dont celles du vendeur par son espace de dépôt ;
//   - les photos de la visite et de la Data room ;
//   - ce que l'assistant a fait : avis de valeur, mandat, compte rendu, teaser, offres.
// La Data room ne stocke rien de plus : c'est la même liste, vue par ce qui manque pour vendre. Un dépôt fait ici
// rejoint aussi la Data room quand elle existe ; à sa naissance, elle reprend ce qui a été déposé avant
// (heritageDuDossier).

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Records, CHEMIN_UPLOADS } from './db.js';
import { documentsDuMandataire } from './documents-mandataire.js';
import { CASES as CASES_CONNUES, caseDuType } from '../src/lib/data-room.js';

/** Les natures, dans l'ordre où la vue d'ensemble les montre. */
export const NATURES = [
  ['avis', 'Avis de valeur'],
  ['mandat', 'Mandat'],
  ['bail', 'Bail'],
  ['quittances', 'Quittances et loyers'],
  ['bilans', 'Bilans et comptes'],
  ['liasses', 'Liasses fiscales'],
  ['ca_en_cours', "Chiffre d'affaires de l'année"],
  ['taxe_fonciere', 'Taxe foncière'],
  ['diagnostics', 'Diagnostics'],
  ['copropriete', 'Copropriété'],
  ['charges', 'Charges'],
  ['titre', 'Titre de propriété'],
  ['plans', 'Plans et surfaces'],
  ['kbis', 'Kbis et statuts'],
  ['kbis_fonds', 'Kbis du fonds'],
  ['statuts', 'Statuts'],
  ['inventaire', 'Inventaire du matériel'],
  ['personnel', 'Personnel'],
  ['licences', 'Licences et autorisations'],
  ['contrats', 'Contrats en cours'],
  ['photos', 'Photos'],
  ['autres', 'Autres documents'],
  ['assistant', "Faits avec l'assistant"],
];
const CLES = new Set(NATURES.map(([k]) => k));
// Les pièces de la Data room qui portent un autre nom que leur nature.
const DE_LA_DATAROOM = { statuts_vendeur: 'kbis', kbis_vendeur: 'kbis', pouvoirs: 'kbis' };
// Une nature dont la Data room a la case ; les autres y vont dans « Autres documents ».
// Toutes les cases connues (murs, fonds…, src/lib/data-room.js, 6 nov. 2026).
const CASES_DATAROOM = new Set(Object.keys(CASES_CONNUES));

const sans = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pure : la nature d'un document d'après son nom (et son type) ; « autres » quand rien ne la reconnaît. */
export function natureDuNom(nom, mimetype = null) {
  if (/^image\//.test(String(mimetype || '')) || /\.(jpe?g|png|webp|heic|gif)$/i.test(String(nom || ''))) return 'photos';
  const t = sans(nom).replace(/[_\-.]+/g, ' ');
  const regles = [
    // Un avis ou un mandat fait ailleurs, importé avec le bien (4 nov. 2026).
    ['mandat', /\bmandat\b/],
    ['avis', /avis de valeur|\bestimation\b|avis d ?expert|rapport d ?expertise/],
    ['bilans', /bilan|liasse|compte de resultat|comptes annuels|attestation (comptable|de l ?expert|expert)|grand livre|chiffre d ?affaires|\bebe\b|previsionnel/],
    ['quittances', /quittance|appel de loyer|avis d ?echeance|etat locatif/],
    ['bail', /\bbail\b|avenant/],
    ['taxe_fonciere', /taxe fonciere|\btf\b|impots? fonciers?/],
    ['diagnostics', /\bdpe\b|amiante|\bdta\b|diagnostic|\berp\b|\besris\b|termite|plomb|\bcrep\b|electri/],
    ['kbis', /k ?bis|extrait k|statuts|pouvoirs?/],
    ['titre', /titre de propriete|attestation (notariee|de propriete)|acte de vente/],
    ['copropriete', /copro|\bpv\b|proces verbal|assemblee|reglement|\brcp\b|\bedd\b|etat descriptif/],
    ['charges', /appel de (charges|fonds)|\bcharges\b/],
    ['plans', /\bplans?\b|surfaces?|metrage|carrez/],
  ];
  return regles.find(([, re]) => re.test(t))?.[0] || 'autres';
}

/** Pure : un document qui n'a pas sa place dans la Data room (un avis, un mandat importés : ils ont leur étape). */
export const horsDataroom = (nature) => nature === 'avis' || nature === 'mandat';

/** Pure : la case de la Data room où va un document de cette nature. */
// La case dépend du type du bien (6 nov. 2026) : des bilans vont dans leur case pour un fonds, dans « Autres » pour des murs.
// Un bien à louer a sa liste à lui (`transaction`, 6 nov. 2026).
export const caseDataroom = (nature, type = null, transaction = null) => (CASES_DATAROOM.has(nature) && caseDuType(nature, type, transaction)) || 'autres';

// Ce que l'assistant a fait s'ouvre dans son étape du bien.
const ETAPE_DU_TYPE = { mandat: 'mandat', avis: 'estimation', compte_rendu: 'previsite', teaser: 'marche', offre: 'offre' };
const MOT_DU_TYPE = { mandat: 'Mandat', avis: 'Avis de valeur', compte_rendu: 'Compte rendu de visite', teaser: 'Teaser', offre: 'Offre reçue' };
const SOURCE_PIECE = { vendeur: 'déposé par le vendeur', fil: 'joint dans le fil du bien', mandataire: 'déposé par vous' };

/**
 * Pure : les documents d'un bien, rangés par nature. Chaque document : { id, nature, nom, url, le, source, etape,
 * detail, modifiable }. Un même fichier (même adresse) n'apparaît qu'une fois, sous sa première origine.
 */
export function documentsDuBien({ fiche = null, estimations = [], mandats = [], dossier = null, marches = [] } = {}) {
  const docs = [];
  const vus = new Set();
  const ajouter = (d) => {
    if (d.url && vus.has(d.url)) return;
    if (d.url) vus.add(d.url);
    docs.push(d);
  };
  for (const x of fiche?.biens?.pieces || []) {
    ajouter({ id: `piece:${x.id}`, nature: CLES.has(x.nature) ? x.nature : 'autres', nom: x.nom, url: x.url, le: x.le || null, source: SOURCE_PIECE[x.par] || SOURCE_PIECE.mandataire, modifiable: true, ...(x.case_perso ? { case_perso: x.case_perso } : {}) });
  }
  // Les pièces jointes à l'import d'un bien en portefeuille (server/biens-import.js).
  for (const x of fiche?.pieces_importees || []) {
    if (x?.url) ajouter({ id: `importee:${x.url}`, nature: natureDuNom(x.nom, x.mimetype), nom: x.nom || 'Pièce', url: x.url, le: x.le || null, source: 'importé avec le bien', modifiable: true });
  }
  for (const e of estimations) {
    if (e?.bail?.url) ajouter({ id: `bail:${e.id}`, nature: 'bail', nom: e.bail.nom || 'Bail', url: e.bail.url, le: e.bail.le || null, source: "joint à l'avis de valeur" });
  }
  if (dossier) {
    for (const [cle, fichiers] of Object.entries(dossier.documents || {})) {
      for (const f of fichiers || []) {
        const nature = DE_LA_DATAROOM[cle] || (CLES.has(cle) ? cle : 'autres');
        ajouter({ id: `dataroom:${cle}:${f.url}`, nature, nom: f.nom || 'Pièce', url: f.url, le: f.le || null, source: f.repris ? "joint à l'avis de valeur" : SOURCE_PIECE[f.par] || 'déposé dans la Data room' });
      }
    }
  }
  for (const x of fiche?.biens?.visite?.photos || []) {
    if (x?.url) ajouter({ id: `photo:${x.url}`, nature: 'photos', nom: x.nom || 'Photo de la visite', url: x.url, le: x.le || null, source: 'photo de la visite' });
  }
  for (const x of dossier?.photos || []) {
    if (x?.url) ajouter({ id: `photo:${x.url}`, nature: 'photos', nom: x.nom || 'Photo', url: x.url, le: x.le || null, source: 'déposée dans la Data room' });
  }
  const faits = documentsDuMandataire({ estimations, mandats, marches, proprietaires: fiche ? [fiche] : [] });
  for (const d of faits) {
    ajouter({ id: d.id, nature: 'assistant', nom: MOT_DU_TYPE[d.type] || 'Document', detail: d.detail || null, url: d.pdf || null, le: d.le || null, vignette: d.vignette || null, source: "fait avec l'assistant", etape: ETAPE_DU_TYPE[d.type] || null });
  }
  const groupes = NATURES.map(([nature, libelle]) => ({
    nature, libelle,
    documents: docs.filter((d) => d.nature === nature).sort((a, b) => String(b.le || '').localeCompare(String(a.le || ''))),
  })).filter((g) => g.documents.length);
  return { total: docs.length, groupes };
}

const email = (user) => String(user?.email || '').toLowerCase();
const aLui = (x, user) => !!x && (user?.role === 'admin' || String(x.mandataire_email || '').toLowerCase() === email(user));

/** Les objets d'un bien, lus et vérifiés : le sien seulement (l'admin voit tout). Les ids viennent de l'écran. */
export function objetsDuBienLus({ proprietaire = null, estimation = null, mandat = null, dossier = null, marche = null } = {}, user) {
  const fiche = proprietaire ? Records.get('ProprietaireMandataire', proprietaire) : null;
  const ficheOk = aLui(fiche, user) ? fiche : null;
  const estimations = [];
  const e0 = estimation ? Records.get('EstimationMandataire', estimation) : null;
  if (aLui(e0, user)) estimations.push(e0);
  if (ficheOk) for (const e of Records.list('EstimationMandataire').filter((x) => x.proprietaire_id === ficheOk.id && !estimations.some((y) => y.id === x.id))) estimations.push(e);
  const m0 = mandat ? Records.get('MandatMandataire', mandat) : null;
  const mandats = aLui(m0, user) ? [m0] : Records.list('MandatMandataire').filter((m) => estimations.some((e) => e.id === m.estimation_id) && aLui(m, user)).slice(0, 1);
  const d0 = dossier ? Records.get('DossierMandataire', dossier) : null;
  const d = aLui(d0, user) ? d0 : mandats[0] ? Records.list('DossierMandataire').find((x) => x.mandat_id === mandats[0].id && aLui(x, user)) || null
    // Un bien importé : sa Data room porte son propriétaire (4 nov. 2026).
    : ficheOk ? Records.list('DossierMandataire').find((x) => x.proprietaire_id === ficheOk.id && aLui(x, user)) || null : null;
  const k0 = marche ? Records.get('MiseEnMarche', marche) : null;
  const marches = aLui(k0, user) ? [k0] : [];
  return { fiche: ficheOk, estimations, mandats, dossier: d, marches };
}

/** Les documents d'un bien, depuis les ids que l'écran connaît. */
export async function documentsLus(ids, user) {
  const o = objetsDuBienLus(ids, user);
  const { marcheVuParMandataire } = await import('./mandataire-portes.js');
  const lus = documentsDuBien({ ...o, marches: o.marches.map(marcheVuParMandataire) });
  // Le nom choisi et la note de chaque pièce (4 nov. 2026, server/annotations-documents.js).
  const { annotationsDe, annote } = await import('./annotations-documents.js');
  const a = annotationsDe(lus.groupes.flatMap((g) => g.documents.map((d) => d.url)));
  return { ok: true, ...lus, groupes: lus.groupes.map((g) => ({ ...g, documents: g.documents.map((d) => annote(d, a)) })), deposable: !!o.fiche, cases_perso: o.fiche?.biens?.cases_perso || [] };
}

/**
 * Des fichiers déposés sur un bien (sa fiche) : rangés par nature d'après leur nom, sauf nature dite. Ils rejoignent
 * aussi la Data room du bien quand elle existe. `fichiers` : [{ nom, url, mimetype }]. `par` : mandataire, fil, vendeur.
 */
export async function deposerAuBien(proprietaireId, fichiers = [], user, { nature = null, casePerso = null, par = 'mandataire' } = {}) {
  const p = Records.get('ProprietaireMandataire', proprietaireId);
  if (!aLui(p, user)) return { ok: false, error: 'Bien introuvable.' };
  if (!fichiers.length) return { ok: false, error: 'Aucun fichier reçu.' };
  // Une case nommée par le mandataire (4 nov. 2026) : ses documents sont des « autres », rangés dans cette case.
  const perso = casePerso ? (p.biens?.cases_perso || []).find((x) => x.cle === casePerso) : null;
  if (casePerso && !perso) return { ok: false, error: 'Case inconnue.' };
  if (perso) nature = 'autres';
  if (nature && !CLES.has(nature)) return { ok: false, error: 'Nature inconnue.' };
  const le = new Date().toISOString();
  const avant = p.biens?.pieces || [];
  const nouvelles = fichiers.filter((f) => f?.url && !avant.some((x) => x.url === f.url))
    .map((f) => ({ id: crypto.randomUUID().slice(0, 12), nom: f.nom || 'Document', url: f.url, nature: nature || (f.nature && CLES.has(f.nature) ? f.nature : natureDuNom(f.nom, f.mimetype)), le, par, ...(f.decoupe_de ? { decoupe_de: f.decoupe_de } : {}), ...(perso ? { case_perso: perso.cle } : {}) }));
  if (!nouvelles.length) return { ok: true, deposes: [] };
  // Une case choisie (sa nature ou une case nommée) garde dix documents au plus (6 nov. 2026, Jules) ; « autres » et les
  // photos n'ont pas de limite.
  if ((nature && !['autres', 'photos'].includes(nature)) || perso) {
    const deja = avant.filter((x) => (perso ? x.case_perso === perso.cle : x.nature === nature && !x.case_perso)).length;
    if (deja + nouvelles.length > 10) return { ok: false, error: `10 documents au plus dans une case${deja < 10 ? ` : il reste ${10 - deja} place${10 - deja > 1 ? 's' : ''}` : ''}.` };
  }
  // Un bien en import : le mandat déposé le fait passer au mandat signé, l'avis à la visite faite (4 nov. 2026, Jules).
  let validee = p.biens?.validee ?? null;
  if (p.biens?.import && !p.biens.import.fini) {
    const { auPlusLoin, franchiParDocument } = await import('./bien-repris.js');
    for (const x of nouvelles) validee = auPlusLoin(validee, franchiParDocument(x.nature));
  }
  Records.update('ProprietaireMandataire', p.id, { biens: { ...(p.biens || {}), pieces: [...avant, ...nouvelles], ...(validee !== (p.biens?.validee ?? null) ? { validee } : {}) } });
  // La Data room, si le mandat l'a ouverte : la même pièce, dans sa case (les photos ont leur propre zone).
  const o = objetsDuBienLus({ proprietaire: p.id }, user);
  if (o.dossier) {
    const P = await import('./mandataire-portes.js');
    const qui = { ...user, email: o.dossier.mandataire_email };
    // La case nommée existe aussi dans la Data room : la même, retrouvée par son nom, ou créée.
    const cleDossier = perso ? (await (await import('./dossier-vente.js')).nouvelleCase(o.dossier.id, perso.mot, qui)).cle : null;
    for (const x of nouvelles) {
      if (x.nature === 'photos' || horsDataroom(x.nature)) continue;
      const r = P.ajouterPiece(o.dossier.id, cleDossier || caseDataroom(x.nature, P.typeDuDossier(o.dossier), P.transactionDuDossier(o.dossier)), { filename: x.nom, url: x.url, par }, qui);
      if (!r.ok) console.warn(`[documents du bien] Data room : ${r.error}`);
    }
  }
  return { ok: true, deposes: nouvelles };
}

/**
 * Une case nommée par le mandataire sur le bien, avant la Data room (4 nov. 2026, Jules : « soit la box de la data room,
 * soit une nouvelle que je vais nommer »). Un nom déjà pris rend la case existante. La Data room la reprend à sa naissance.
 */
export function nouvelleCaseDuBien(proprietaireId, mot, user) {
  const p = Records.get('ProprietaireMandataire', proprietaireId);
  if (!aLui(p, user)) return { ok: false, error: 'Bien introuvable.' };
  const nom = String(mot || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!nom) return { ok: false, error: 'Nommez la case.' };
  const cases = p.biens?.cases_perso || [];
  const meme = cases.find((x) => x.mot.toLowerCase() === nom.toLowerCase());
  if (meme) return { ok: true, cle: meme.cle, mot: meme.mot };
  const cle = `perso-${Date.now().toString(36)}`;
  Records.update('ProprietaireMandataire', p.id, { biens: { ...(p.biens || {}), cases_perso: [...cases, { cle, mot: nom, le: new Date().toISOString() }] } });
  return { ok: true, cle, mot: nom };
}

/** Une pièce déposée sur le bien, rangée dans une autre nature. */
export function reclasser(proprietaireId, pieceId, nature, user) {
  const p = Records.get('ProprietaireMandataire', proprietaireId);
  if (!aLui(p, user)) return { ok: false, error: 'Bien introuvable.' };
  if (!CLES.has(nature) || nature === 'assistant') return { ok: false, error: 'Nature inconnue.' };
  const pieces = p.biens?.pieces || [];
  if (!pieces.some((x) => x.id === pieceId)) return { ok: false, error: 'Document introuvable.' };
  Records.update('ProprietaireMandataire', p.id, { biens: { ...(p.biens || {}), pieces: pieces.map((x) => (x.id === pieceId ? { ...x, nature } : x)) } });
  return { ok: true };
}

/** Une pièce déposée sur le bien, retirée de sa liste (le fichier reste sur le disque). */
export function retirerPiece(proprietaireId, pieceId, user) {
  const p = Records.get('ProprietaireMandataire', proprietaireId);
  if (!aLui(p, user)) return { ok: false, error: 'Bien introuvable.' };
  // Une pièce jointe à l'import d'un portefeuille (server/biens-import.js) : retirée de sa liste, par son adresse.
  if (String(pieceId).startsWith('importee:')) {
    const url = String(pieceId).slice('importee:'.length);
    const importees = p.pieces_importees || [];
    if (!importees.some((x) => x?.url === url)) return { ok: false, error: 'Document introuvable.' };
    Records.update('ProprietaireMandataire', p.id, { pieces_importees: importees.filter((x) => x?.url !== url) });
    return { ok: true };
  }
  const pieces = p.biens?.pieces || [];
  if (!pieces.some((x) => x.id === pieceId)) return { ok: false, error: 'Document introuvable.' };
  Records.update('ProprietaireMandataire', p.id, { biens: { ...(p.biens || {}), pieces: pieces.filter((x) => x.id !== pieceId) } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// L'assistant lit les documents du bien : on lui pose des questions dessus.
// ---------------------------------------------------------------------------

export const OUTILS_DOCUMENTS = [
  {
    name: 'documents_du_bien',
    description: "La liste des documents du bien ouvert, rangés par nature (bail, bilans, taxe foncière, diagnostics, photos…), avec d'où chacun vient et quand. À appeler quand le mandataire demande ce qu'on a, où est un document, ou ce qui manque.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'lire_document',
    description: "Lit le texte d'un document du bien ouvert (PDF, texte) pour répondre à une question dessus (« que dit le bail sur la cession ? », « quel CA en 2024 ? »). Donne le nom du document tel que documents_du_bien le rend. Cite la page quand tu t'appuies sur un passage.",
    input_schema: { type: 'object', properties: { document: { type: 'string', description: 'Le nom du document (ou un mot de son nom)' } }, required: ['document'] },
  },
];
export const NOMS_DOCUMENTS = new Set(OUTILS_DOCUMENTS.map((o) => o.name));

const MAX_TEXTE = 40000;

/** Les outils des documents, sur la fiche ouverte. */
export async function executerOutilDocuments(appel, user, { fiche = null } = {}) {
  if (!fiche?.id) return { ok: false, error: "Aucun bien ouvert : demande de quel bien il parle, ou propose d'ouvrir le bien dans Biens." };
  const o = objetsDuBienLus({ proprietaire: fiche.id }, user);
  const { marcheVuParMandataire } = await import('./mandataire-portes.js');
  const { groupes } = documentsDuBien({ ...o, marches: o.marches.map(marcheVuParMandataire) });
  const tous = groupes.flatMap((g) => g.documents.map((d) => ({ ...d, libelle: g.libelle })));
  if (appel.name === 'documents_du_bien') {
    return { ok: true, total: tous.length, par_nature: groupes.map((g) => ({ nature: g.libelle, documents: g.documents.map((d) => `${d.nom} (${d.source}${d.le ? `, ${d.le.slice(0, 10)}` : ''})`) })) };
  }
  const q = sans(appel.input?.document).trim();
  const lisibles = tous.filter((d) => d.url && String(d.url).startsWith('/uploads/'));
  const d = lisibles.find((x) => sans(x.nom) === q) || lisibles.find((x) => sans(x.nom).includes(q)) || lisibles.find((x) => q && sans(x.libelle).includes(q));
  if (!d) return { ok: false, error: `Aucun document lisible ne correspond à « ${appel.input?.document || ''} ». Appelle documents_du_bien pour les noms.` };
  if (d.nature === 'photos') return { ok: false, error: "C'est une photo : elle ne se lit pas en texte." };
  const chemin = path.join(CHEMIN_UPLOADS, path.basename(d.url));
  if (!fs.existsSync(chemin)) return { ok: false, error: `Le fichier « ${d.nom} » n'est plus sur le serveur : demande au mandataire de le redéposer.` };
  const buffer = fs.readFileSync(chemin);
  let texte = '';
  if (/\.pdf$/i.test(d.nom) || buffer.subarray(0, 4).toString() === '%PDF') {
    const { coucheTexteDuPdf } = await import('./deal/ingest.js');
    texte = (await coucheTexteDuPdf(buffer))?.texte || '';
    if (!texte) return { ok: false, error: `« ${d.nom} » est un scan sans texte : dis-le, et propose au mandataire de le joindre dans le fil pour une lecture complète.` };
  } else if (/\.(txt|csv|md)$/i.test(d.nom)) {
    texte = buffer.toString('utf8');
  } else {
    const { ingerer } = await import('./deal/ingest.js');
    texte = (await ingerer({ buffer, filename: d.nom }).catch(() => null))?.texte || '';
    if (!texte) return { ok: false, error: `« ${d.nom} » ne se lit pas en texte.` };
  }
  return { ok: true, document: d.nom, nature: d.libelle, source: d.source, texte: texte.slice(0, MAX_TEXTE), tronque: texte.length > MAX_TEXTE };
}
