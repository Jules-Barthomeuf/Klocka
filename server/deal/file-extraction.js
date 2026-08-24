// File de dépouillement en arrière-plan.
//
// Un document déposé part immédiatement à l'analyse, sans que personne n'attende
// devant l'écran : l'analyste importe et passe à autre chose. La file est
// strictement séquentielle — un document à la fois, tous dossiers confondus —
// parce que le palier gratuit du modèle plafonne le débit et qu'une rafale
// ferait échouer les dernières pièces.
//
// L'état vit sur le document lui-même (documents_espace[].extraction), donc il
// survit à un rechargement de page. Au redémarrage du serveur, les pièces
// laissées en route sont remises en file (reprendreEnAttente) : sans cela elles
// resteraient affichées « Analyse… » pour toujours.

import { Records } from '../db.js';
import { chargerPiece, extraireUnePiece, enregistrerExtraction } from './espace.js';
import { CATEGORIE_PAR_TYPE } from './grille.js';
import { generateFromDocument } from '../llm.js';

const attente = [];
let enMarche = false;

function dealDe(dealId) {
  return Records.filter('Deal', { deal_id: dealId })[0] || null;
}

// L'état d'avancement se pose sur la fiche du document : « en_attente »,
// « en_cours », « fait », « erreur ».
function marquer(dealId, docId, extraction) {
  const deal = dealDe(dealId);
  if (!deal) return;
  const documents = (deal.documents_espace || []).map((d) =>
    d.id === docId ? { ...d, extraction } : d
  );
  Records.update('Deal', deal.id, { documents_espace: documents });
}

function classerDocument(dealId, docId, categorie) {
  const deal = dealDe(dealId);
  if (!deal) return;
  const documents = (deal.documents_espace || []).map((d) =>
    d.id === docId ? { ...d, categorie, categorie_auto: true } : d
  );
  Records.update('Deal', deal.id, { documents_espace: documents });
}

// Le nom de fichier n'a rien dit : on demande au modèle de ranger la pièce dans
// l'une des catégories de la grille, en lisant le document. Une réponse hors
// liste est ignorée — mieux vaut pas de catégorie qu'une fausse.
async function deviner(piece) {
  const libelles = Object.values(CATEGORIE_PAR_TYPE);
  const reponse = await generateFromDocument({
    buffer: piece.buffer,
    mimetype: piece.mimetype || 'application/pdf',
    prompt:
      `Ce document est destiné à un dossier d'investissement en murs commerciaux. ` +
      `Réponds par UNE SEULE de ces catégories, sans phrase ni ponctuation : ` +
      `${libelles.join(' | ')} | Autre`,
  });
  const propre = String(reponse || '').trim().replace(/[.\s]+$/, '');
  return libelles.find((l) => l.toLowerCase() === propre.toLowerCase()) || null;
}

async function traiter({ dealId, docId, uploadDir, user }) {
  marquer(dealId, docId, { statut: 'en_cours', le: new Date().toISOString() });

  let piece = chargerPiece(dealId, docId, uploadDir);
  if (!piece) {
    // Document supprimé entre-temps : rien à faire, rien à signaler.
    return;
  }

  // Classement par le modèle quand le nom de fichier n'a pas suffi.
  if (!piece.categorie && piece.buffer) {
    try {
      const categorie = await deviner(piece);
      if (categorie) {
        classerDocument(dealId, docId, categorie);
        piece = { ...piece, categorie };
      }
    } catch {
      // Classement impossible : le dépouillement se fait sans grille, comme avant.
    }
  }

  const resultat = await extraireUnePiece(piece, user);
  enregistrerExtraction(dealId, resultat);
  marquer(dealId, docId, {
    statut: resultat.erreur ? 'erreur' : 'fait',
    le: new Date().toISOString(),
    erreur: resultat.erreur || null,
    lignes: (resultat.lignes || []).filter((l) => l.constat).length,
  });
}

async function tourner() {
  if (enMarche) return;
  enMarche = true;
  try {
    while (attente.length) {
      const tache = attente.shift();
      try {
        await traiter(tache);
      } catch (e) {
        console.warn(`[file-extraction] ${tache.docId} : ${e?.message || e}`);
        marquer(tache.dealId, tache.docId, {
          statut: 'erreur',
          le: new Date().toISOString(),
          erreur: e?.message || 'Dépouillement impossible',
        });
      }
    }
  } finally {
    enMarche = false;
  }
}

/**
 * Met des documents en file. Retourne le nombre de pièces acceptées.
 * L'appel ne bloque pas : le traitement continue après la réponse HTTP.
 */
export function enfiler(dealId, docIds = [], { uploadDir, user } = {}) {
  const ids = docIds.filter(Boolean);
  for (const docId of ids) {
    // Une pièce déjà en file n'y entre pas deux fois.
    if (attente.some((t) => t.dealId === dealId && t.docId === docId)) continue;
    marquer(dealId, docId, { statut: 'en_attente', le: new Date().toISOString() });
    attente.push({ dealId, docId, uploadDir, user });
  }
  // Volontairement non attendu : la file tourne en tâche de fond.
  tourner();
  return ids.length;
}

/**
 * Remet en file les pièces interrompues par un arrêt du serveur.
 * Appelé au démarrage ; renvoie le nombre de pièces reprises.
 */
export function reprendreEnAttente(uploadDir) {
  let reprises = 0;
  for (const deal of Records.list('Deal')) {
    const aReprendre = (deal.documents_espace || [])
      .filter((d) => ['en_attente', 'en_cours'].includes(d.extraction?.statut))
      .map((d) => d.id);
    if (!aReprendre.length) continue;
    enfiler(deal.deal_id, aReprendre, { uploadDir, user: null });
    reprises += aReprendre.length;
  }
  return reprises;
}

/** Nombre de pièces en attente ou en cours, pour un dossier ou en tout. */
export function enFile(dealId = null) {
  const taches = dealId ? attente.filter((t) => t.dealId === dealId) : attente;
  return taches.length + (enMarche ? 1 : 0);
}
