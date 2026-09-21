// Déposer un document sur un dossier : le lire, le ranger dans son dossier
// documentaire, refaire la synthèse « points à vérifier », faire avancer le
// statut. C'est ce que fait l'écran quand on glisse un fichier ; AK fait la
// même chose avec une pièce jointe du chat.

import { Records } from '../db.js';
import { analyserDocument, obtenirDossier as obtenirDossierDoc, renommerDossier } from '../assistant/index.js';
import { syntheseDocuments } from './synthese-docs.js';
import { changerStatut, statutDe } from './lifecycle.js';
import { obtenirDossier } from './index.js';

/**
 * @param {string} dealId
 * @param {{buffer:Buffer, filename:string, mimetype?:string, url?:string}} fichier
 * @param {{user?:object, typeForce?:string}} [ctx]
 */
export async function deposerDocument(dealId, fichier, { user = null, typeForce = undefined } = {}) {
  const dossier = obtenirDossier(dealId);
  if (!dossier) return { ok: false, error: 'Dossier introuvable' };
  if (dossier.test) return { ok: false, error: 'Deal de test : utilisez « Simuler la réception des documents ».' };
  if (!fichier?.buffer) return { ok: false, error: 'Fichier manquant' };

  const r = await analyserDocument(
    { buffer: fichier.buffer, filename: fichier.filename, mimetype: fichier.mimetype, url: fichier.url || null },
    { dossierId: dossier.dossier_doc_id || undefined, typeForce, user }
  );

  const patch = {};
  if (!dossier.dossier_doc_id) {
    patch.dossier_doc_id = r.dossier_id;
    // Le dossier documentaire porte le titre du deal pour s'y retrouver.
    const titre = dossier.lots?.[0]?.synthese?.titre;
    if (titre) renommerDossier(r.dossier_id, titre);
  }

  // La synthèse « points à vérifier » est recalculée à chaque dépôt.
  const dossierDoc = obtenirDossierDoc(r.dossier_id);
  const synthese = await syntheseDocuments(dossier.lots?.[0], dossierDoc);
  if (synthese) patch.synthese_documents = synthese;
  if (Object.keys(patch).length) Records.update('Deal', dossier.id, patch);

  // Avancement : demandés → reçus → extrait (les transitions invalides sont
  // ignorées, un dépôt sur un deal déjà extrait ne change rien).
  const enrichi = { ...dossier, ...patch };
  if (statutDe(enrichi) === 'documents_demandes' || statutDe(enrichi) === 'analyse') {
    changerStatut(enrichi, 'documents_recus', { user, note: `Document reçu : ${fichier.filename}` });
    enrichi.statut = 'documents_recus';
    enrichi.suivi = Records.get('Deal', dossier.id)?.suivi || enrichi.suivi;
  }
  if (statutDe(enrichi) === 'documents_recus') {
    changerStatut(enrichi, 'depouille', { user, note: 'Extraction effectuée' });
  }

  return {
    ok: true,
    ...r,
    deal: { deal_id: dossier.deal_id, statut: statutDe(Records.get('Deal', dossier.id)), dossier_doc_id: patch.dossier_doc_id || dossier.dossier_doc_id, synthese_documents: patch.synthese_documents || dossier.synthese_documents || null },
  };
}
