// L'espace de travail d'un dossier : ses documents importés et ses
// conversations (questions libres ou analyses lancées sur des documents
// cochés). Tout vit à plat sur l'enregistrement Deal :
//   documents_espace : [{ id, nom, url, mime, taille, ajoute_le }]
//   conversations    : [{ id, titre, mode, documents, messages, cree_le, maj_le }]
//
// Invariant conservé : le chat ne voit jamais le texte source de la fiche ;
// il lit les documents importés par l'utilisateur et les faits rédigés.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Records } from '../db.js';
import { chatDocuments, extraireDonneesDocument, invokeLLMGrounded } from '../llm.js';
import { vueRedacteur } from './redact.js';
import { ETAPES, etapeMax } from './etapes.js';
import { grilleDe, typeDepuisCategorie, categorieDepuisNom, STATUTS_LIGNE, BLOCS_PV_AG } from './grille.js';

const brutDe = (dealId) => Records.filter('Deal', { deal_id: dealId })[0] || null;

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function ajouterDocument(dealId, { nom, url, mime, taille }, user) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const nomPropre = String(nom || 'Document').trim();
  // Le nom de fichier suffit le plus souvent à classer la pièce ; à défaut, la
  // file de extraction demandera au modèle. Le drapeau dit que la valeur
  // vient de la machine — l'analyste corrige au lieu de saisir.
  const categorie = categorieDepuisNom(nomPropre);
  const doc = {
    id: randomUUID(),
    nom: nomPropre,
    url,
    mime: mime || 'application/octet-stream',
    taille: taille || 0,
    ajoute_le: new Date().toISOString(),
    ajoute_par: user?.email || null,
    ...(categorie ? { categorie, categorie_auto: true } : {}),
  };
  Records.update('Deal', brut.id, { documents_espace: [...(brut.documents_espace || []), doc] });
  // La pièce arrivée peut solder une promesse du registre — jamais bloquant.
  import('./engagements.js')
    .then((m) => m.rapprocherDocuments(dealId, user))
    .catch(() => {});
  return { ok: true, document: doc };
}

export function renommerDocument(dealId, docId, nom, categorie) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const propre = String(nom || '').trim();
  if (!propre) return { ok: false, error: 'Le nom ne peut pas être vide.' };
  const liste = (brut.documents_espace || []).map((d) =>
    d.id === docId ? { ...d, nom: propre, ...(categorie !== undefined ? { categorie: String(categorie || '') } : {}) } : d
  );
  Records.update('Deal', brut.id, { documents_espace: liste });
  return { ok: true };
}

export function supprimerDocument(dealId, docId, uploadDir) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const doc = (brut.documents_espace || []).find((d) => d.id === docId);
  if (!doc) return { ok: false, error: 'Document introuvable' };
  Records.update('Deal', brut.id, { documents_espace: (brut.documents_espace || []).filter((d) => d.id !== docId) });
  // Le fichier physique suit, s'il est à nous.
  try {
    if (uploadDir && doc.url?.startsWith('/uploads/')) {
      const chemin = path.join(uploadDir, doc.url.replace('/uploads/', ''));
      if (chemin.startsWith(uploadDir) && fs.existsSync(chemin)) fs.unlinkSync(chemin);
    }
  } catch { /* un fichier orphelin ne bloque pas la suppression */ }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export function chargerPieces(brut, ids, uploadDir, avecIdentite = false) {
  const voulus = new Set(ids || []);
  return (brut.documents_espace || [])
    .filter((d) => voulus.has(d.id))
    .map((d) => {
      let buffer = null;
      try {
        if (uploadDir && d.url?.startsWith('/uploads/')) {
          const chemin = path.join(uploadDir, d.url.replace('/uploads/', ''));
          if (chemin.startsWith(uploadDir) && fs.existsSync(chemin)) buffer = fs.readFileSync(chemin);
        }
      } catch { /* pièce illisible : on l'annonce au modèle sans bloquer */ }
      const piece = { nom: d.nom, buffer, mimetype: d.mime };
      return avecIdentite ? { ...piece, id: d.id, url: d.url, categorie: d.categorie || null } : piece;
    });
}

// Faits du bien, tels que le rédacteur les voit (jamais le texte source).
function faitsDuDossier(brut) {
  const lot = brut.lots?.[0];
  if (!lot) return null;
  try {
    const vue = vueRedacteur({ lot: lot.lot, enrichissement: lot.enrichissement, evaluation: lot.evaluation });
    return JSON.stringify({ bien: vue.bien, finances: vue.finances, marche: vue.marche }).slice(0, 6000);
  } catch {
    return null;
  }
}

function consigne(brut, mode, pieces) {
  const etape = etapeMax(brut);
  const nomEtape = ETAPES.find((e) => e.n === etape)?.label || '';
  const faits = faitsDuDossier(brut);
  const base =
    `Tu es l'assistant de Klocka, conseil en investissement dans les murs commerciaux. ` +
    `Tu réponds en français, de façon précise et sobre, sans superlatifs. ` +
    `Dossier « ${brut.nom || brut.lots?.[0]?.synthese?.titre || 'sans nom'} », étape ${etape} (${nomEtape}).`;

  if (!pieces.length) {
    // Aucun document : réponses générales (étape 1, ou question hors pièces).
    return (
      base +
      ` Aucun document n'est joint : réponds sur le fond (droit des baux commerciaux, ` +
      `financement, fiscalité, méthode d'analyse) sans inventer de données sur ce bien.` +
      (faits ? ` Faits connus du dossier : ${faits}` : '')
    );
  }
  if (mode === 'analyse') {
    return (
      base +
      ` Mode ANALYSE : examine les documents joints au regard des critères d'investissement ` +
      `(emplacement, signature du locataire, économie du bail, rendement, liquidité à la revente). ` +
      `Structure en sections courtes — Synthèse, Points clés, Risques et réserves — et cite la pièce, ` +
      `la page ou la clause. Ne déduis rien qui ne soit pas écrit.` +
      (faits ? ` Faits connus du dossier : ${faits}` : '')
    );
  }
  if (mode === 'verification') {
    return (
      base +
      ` Mode POINTS À VÉRIFIER : liste ce qu'il reste à contrôler avant de décider. ` +
      `Une liste numérotée, chaque point tenant en une phrase, du plus bloquant au moins ` +
      `critique, en précisant la pièce ou l'interlocuteur qui donnera la réponse. ` +
      `Ne recopie pas ce qui est déjà établi par les documents.` +
      (faits ? ` Faits connus du dossier : ${faits}` : '')
    );
  }
  if (mode === 'web') {
    return (
      base +
      ` Mode RECHERCHE WEB : réponds en t'appuyant sur des sources publiques à jour ` +
      `(enseigne et santé du locataire, marché locatif et prix de la commune, actualité du secteur, ` +
      `projets urbains). Distingue toujours ce qui est sourcé de ce qui est une hypothèse, donne les ` +
      `chiffres avec leur date, et dis-le franchement quand une information n'est pas trouvable.` +
      (faits ? ` Faits connus du dossier : ${faits}` : '')
    );
  }
  return (
    base +
    ` Réponds à la question en t'appuyant d'abord sur les documents joints ; si la réponse ` +
    `n'y figure pas, dis-le clairement avant de compléter par des généralités.` +
    (faits ? ` Faits connus du dossier : ${faits}` : '')
  );
}

async function reponseWeb(brut, messages) {
  const historique = messages
    .map((m) => `${m.role === 'user' ? 'Question' : 'Réponse'} : ${m.contenu}`)
    .join('\n\n');
  const r = await invokeLLMGrounded({
    prompt: `${consigne(brut, 'web', [])}\n\n${historique}`,
  });
  if (!r) {
    return (
      "La recherche web n'est pas disponible : elle demande le fournisseur Gemini " +
      '(grounding Google Search). Utilisez « Question libre » pour une réponse sans sources web.'
    );
  }
  const sources = r.sources?.length
    ? `\n\nSources :\n${r.sources.map((x) => `- ${x.titre} — ${x.url}`).join('\n')}`
    : '';
  return `${r.text}${sources}`;
}

const titreDepuis = (message, mode) => {
  const court = String(message || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  return `${mode === 'analyse' ? 'Analyse — ' : ''}${court}${court.length === 70 ? '…' : ''}` || 'Conversation';
};

/**
 * Pose une question (ou lance une analyse) dans une conversation, nouvelle
 * ou existante. Renvoie la conversation complète mise à jour.
 */
export async function converser(dealId, { message, mode = 'question', documents = [], conversationId = null, uploadDir, user }) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const texte = String(message || '').trim();
  if (!texte) return { ok: false, error: 'Message vide.' };

  const conversations = [...(brut.conversations || [])];
  let conv = conversationId ? conversations.find((c) => c.id === conversationId) : null;
  const maintenant = new Date().toISOString();
  if (!conv) {
    conv = {
      id: randomUUID(),
      titre: titreDepuis(texte, mode),
      mode,
      documents: [...documents],
      messages: [],
      cree_le: maintenant,
      cree_par: user?.email || null,
    };
    conversations.unshift(conv);
  } else {
    // Les pièces d'une conversation existante peuvent s'élargir.
    conv.documents = [...new Set([...(conv.documents || []), ...documents])];
  }

  conv.messages.push({ role: 'user', contenu: texte, le: maintenant });
  const pieces = chargerPieces(brut, conv.documents, uploadDir);
  const reponse =
    conv.mode === 'web'
      ? await reponseWeb(brut, conv.messages)
      : await chatDocuments({
          system: consigne(brut, conv.mode, pieces),
          messages: conv.messages.map((m) => ({ role: m.role, contenu: m.contenu })),
          documents: pieces,
        });
  conv.messages.push({ role: 'assistant', contenu: reponse, le: new Date().toISOString() });
  conv.maj_le = new Date().toISOString();

  Records.update('Deal', brut.id, { conversations });
  return { ok: true, conversation: conv };
}

/**
 * Question ponctuelle sur les pièces d'un dossier.
 *
 * Même moteur que le chat du dossier, mais sans rien persister : l'assistant
 * pose une question de passage, il n'ouvre pas une conversation dans le dossier.
 * Sans document précisé, toutes les pièces sont chargées.
 */
export async function questionnerDocuments(dealId, { question, documents = null, uploadDir } = {}) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };

  const ids = documents?.length ? documents : (brut.documents_espace || []).map((d) => d.id);
  if (!ids.length) return { ok: false, error: 'Aucun document au dossier' };

  const pieces = chargerPieces(brut, ids, uploadDir);
  const reponse = await chatDocuments({
    system: consigne(brut, 'question', pieces),
    messages: [{ role: 'user', contenu: question }],
    documents: pieces,
  });
  return { ok: true, reponse, documents_lus: pieces.length };
}

export function supprimerConversation(dealId, conversationId) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  Records.update('Deal', brut.id, { conversations: (brut.conversations || []).filter((c) => c.id !== conversationId) });
  return { ok: true };
}

export function renommerConversation(dealId, conversationId, titre) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const propre = String(titre || '').trim();
  if (!propre) return { ok: false, error: 'Le titre ne peut pas être vide.' };
  Records.update('Deal', brut.id, {
    conversations: (brut.conversations || []).map((c) => (c.id === conversationId ? { ...c, titre: propre } : c)),
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Extraction : chaque document coché devient une table de données sourcées.
// Le résultat vit sur le Deal (extractions), pour être rouvert plus tard.
// ---------------------------------------------------------------------------

/** Extrait une pièce déjà chargée. Ne touche pas à la base. */
export async function extraireUnePiece(piece, user) {
  const base = {
    id: `ext_${piece.id}`,
    document_id: piece.id,
    document_nom: piece.nom,
    document_url: piece.url,
    document_mime: piece.mimetype || null,
    document_categorie: piece.categorie || null,
    extrait_le: new Date().toISOString(),
    extrait_par: user?.email || null,
  };
  const type = typeDepuisCategorie(piece.categorie, piece.nom);
  const grille = grilleDe(type);
  try {
    const { mesurer } = await import('../llm-couts.js');
    const { resultat: { lignes, synthese } } = await mesurer({ operation: 'extraction', par: user?.email || null, sur: piece.id }, () => extraireDonneesDocument({
      ...piece,
      elements: grille?.elements || null,
      statuts: STATUTS_LIGNE,
      // Le PV d'AG se lit résolution par résolution, en blocs.
      parBloc: type === 'pv_ag',
      groupes: type === 'pv_ag' ? BLOCS_PV_AG : null,
    }));
    return { ...base, type, type_label: grille?.label || null, synthese: synthese || null, lignes, erreur: null };
  } catch (e) {
    const quota = /quota|rate limit|429/i.test(e?.message || '');
    return {
      ...base,
      type,
      type_label: grille?.label || null,
      lignes: [],
      erreur: quota
        ? 'Quota du modèle atteint — réessayez dans une minute.'
        : e?.message || 'Extraction impossible',
    };
  }
}

/** Charge une pièce du dossier (buffer compris) pour la extraire. */
export function chargerPiece(dealId, docId, uploadDir) {
  const brut = brutDe(dealId);
  if (!brut) return null;
  return chargerPieces(brut, [docId], uploadDir, true)[0] || null;
}

/** Enregistre une extraction sur le deal, en remplaçant celle du même document. */
export function enregistrerExtraction(dealId, resultat) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const conservees = (brut.extractions || []).filter((e) => e.document_id !== resultat.document_id);
  Records.update('Deal', brut.id, { extractions: [resultat, ...conservees] });
  return { ok: true };
}

export async function extraireDocuments(dealId, { documents = [], uploadDir, user } = {}) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const pieces = chargerPieces(brut, documents, uploadDir, true);
  if (!pieces.length) return { ok: false, error: 'Aucun document sélectionné.' };

  // Un document à la fois : le palier gratuit du modèle plafonne le débit, et
  // une rafale ferait échouer les dernières pièces. Un échec isolé n'emporte
  // pas les autres, il est rapporté sur sa propre table. Chaque résultat est
  // écrit dès qu'il tombe : une extraction interrompue garde ce qui est fait.
  const resultats = [];
  for (const p of pieces) {
    const r = await extraireUnePiece(p, user);
    enregistrerExtraction(dealId, r);
    resultats.push(r);
  }
  return { ok: true, extractions: resultats };
}

/** Renomme l'onglet d'une extraction (titre libre, sinon la catégorie sert). */
export function renommerExtraction(dealId, extractionId, titre) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const propre = String(titre || '').trim().slice(0, 120);
  const extractions = (brut.extractions || []).map((e) =>
    e.id === extractionId ? { ...e, titre: propre || null } : e
  );
  Records.update('Deal', brut.id, { extractions });
  return { ok: true };
}

export function supprimerExtraction(dealId, extractionId) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  Records.update('Deal', brut.id, {
    extractions: (brut.extractions || []).filter((e) => e.id !== extractionId),
  });
  return { ok: true };
}

/** Corrige une ligne d'extraction (constat, statut, commentaire) à la main. */
export function majLigneExtraction(dealId, extractionId, index, patch = {}) {
  const brut = brutDe(dealId);
  if (!brut) return { ok: false, error: 'Dossier introuvable' };
  const extractions = (brut.extractions || []).map((e) => {
    if (e.id !== extractionId) return e;
    const lignes = [...(e.lignes || [])];
    if (!lignes[index]) return e;
    const champs = {};
    for (const cle of ['constat', 'statut', 'commentaire']) {
      if (patch[cle] !== undefined) champs[cle] = String(patch[cle]).slice(0, 600);
    }
    lignes[index] = { ...lignes[index], ...champs, modifie: true };
    return { ...e, lignes };
  });
  Records.update('Deal', brut.id, { extractions });
  return { ok: true };
}
