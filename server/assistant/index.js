// Alexis — assistant de dépouillement documentaire.
//
// Un dossier regroupe les documents reçus pour un deal. Chaque document est
// classé, dépouillé selon la grille de son type, et chaque donnée relevée reste
// reliée à sa page d'origine.

import { randomUUID } from 'crypto';
import { Records } from '../db.js';
import { lirePages } from './pages.js';
import { classer, typeParCode, TYPES, GRILLE } from './classify.js';
import { extraireDocument } from './extract-doc.js';

export { TYPES, GRILLE };

/**
 * Analyse un document et l'ajoute au dossier (créé si besoin).
 * @param {object} entree - { buffer, filename, mimetype, texte, url }
 * @param {object} opts   - { dossierId, typeForce, user }
 */
export async function analyserDocument(entree, { dossierId, typeForce, user } = {}) {
  const debut = Date.now();

  const { pages, transcrit, avertissements } = await lirePages(entree);
  const texteComplet = pages.map((p) => p.texte).join('\n');
  if (!texteComplet.trim()) {
    throw new Error("Ce document n'a produit aucun texte exploitable.");
  }

  // Un type imposé par l'utilisateur prime toujours sur la détection.
  const classement = typeForce
    ? { code: typeForce, libelle: typeParCode(typeForce)?.libelle || typeForce, confiance: 'haute', source: 'humain', candidats: [] }
    : await classer(texteComplet, entree.filename);

  const type = typeParCode(classement.code);
  const extraction = type
    ? await extraireDocument(type, pages)
    : { champs: {}, incidents: [{ champ: '*', motif: 'type_inconnu' }], ia: false };

  const document = {
    doc_id: randomUUID(),
    nom_fichier: entree.filename || 'document',
    url: entree.url || null,
    nb_pages: pages.length,
    // Le texte paginé est conservé : il permet de redépouiller le document si
    // l'utilisateur corrige son type, sans lui demander de le redéposer.
    pages,
    transcrit,
    avertissements,
    classement,
    champs: extraction.champs,
    incidents: extraction.incidents,
    analyse_le: new Date().toISOString(),
    duree_ms: Date.now() - debut,
  };

  const dossier = dossierId ? Records.filter('DossierDoc', { dossier_id: dossierId })[0] : null;
  if (dossier) {
    Records.update('DossierDoc', dossier.id, { documents: [...(dossier.documents || []), document] });
    return { dossier_id: dossier.dossier_id, document };
  }

  const nouveau = Records.create(
    'DossierDoc',
    {
      dossier_id: randomUUID(),
      titre: entree.filename || 'Nouveau dossier',
      cree_le: new Date().toISOString(),
      cree_par: user?.email || null,
      documents: [document],
    },
    user?.email
  );
  return { dossier_id: nouveau.dossier_id, document };
}

export function listerDossiers(limit = 50) {
  return Records.list('DossierDoc', { sort: '-created_date', limit }).map((d) => ({
    dossier_id: d.dossier_id,
    titre: d.titre,
    cree_le: d.cree_le,
    nb_documents: (d.documents || []).length,
    types: [...new Set((d.documents || []).map((x) => x.classement?.libelle).filter(Boolean))],
  }));
}

export function obtenirDossier(dossierId) {
  return Records.filter('DossierDoc', { dossier_id: dossierId })[0] || null;
}

export function renommerDossier(dossierId, titre) {
  const d = obtenirDossier(dossierId);
  if (!d) return { error: 'Dossier introuvable' };
  Records.update('DossierDoc', d.id, { titre: String(titre || '').slice(0, 200) });
  return { success: true };
}

export function supprimerDocument(dossierId, docId) {
  const d = obtenirDossier(dossierId);
  if (!d) return { error: 'Dossier introuvable' };
  Records.update('DossierDoc', d.id, {
    documents: (d.documents || []).filter((x) => x.doc_id !== docId),
  });
  return { success: true };
}

/** Reclasse un document et le redépouille selon le type choisi par l'utilisateur. */
export async function reclasserDocument(dossierId, docId, code) {
  const d = obtenirDossier(dossierId);
  if (!d) return { error: 'Dossier introuvable' };
  const doc = (d.documents || []).find((x) => x.doc_id === docId);
  if (!doc) return { error: 'Document introuvable' };
  const type = typeParCode(code);
  if (!type) return { error: 'Type inconnu' };
  if (!doc.pages?.length) {
    return { error: 'Texte du document indisponible : redéposez-le en imposant son type.' };
  }

  const extraction = await extraireDocument(type, doc.pages);
  const maj = {
    ...doc,
    classement: { code: type.code, libelle: type.libelle, confiance: 'haute', source: 'humain', candidats: [] },
    champs: extraction.champs,
    incidents: extraction.incidents,
    analyse_le: new Date().toISOString(),
  };

  Records.update('DossierDoc', d.id, {
    documents: (d.documents || []).map((x) => (x.doc_id === docId ? maj : x)),
  });
  return { dossier_id: dossierId, document: maj };
}
