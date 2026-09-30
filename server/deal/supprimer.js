// Supprimer un dossier — un doublon, un essai raté. Contrairement à
// l'abandon, qui archive, la suppression efface : le dossier, ses pièces sur
// le disque, ses traces liées. Et sa fiche redevient « jamais importée » :
// le mail d'origine garde une marque (dossier_supprime_le) pour que le
// compteur de fiches redescende et que rien ne le repropose ni ne le
// ré-analyse tout seul.
//
// Deux garde-fous : un projet né du dossier bloque la suppression (on
// supprime ou détache le projet d'abord), et le Drive part à la corbeille,
// jamais détruit.

import fs from 'fs';
import path from 'path';
import { Records, Meta, CHEMIN_UPLOADS } from '../db.js';

// Les entités qui suivent un dossier et n'ont plus de sens sans lui.
const LIEES = [
  ['Engagement', 'deal_id'],
  ['DossierDoc', 'dossier_id'],
  ['MarcheJournal', 'deal_id'],
  ['MemoireMatrice', 'deal_id'],
  ['SuiviProposition', 'deal_id'],
];

/** Les fichiers du dossier sous uploads : la source, l'espace, les présentations. */
export function fichiersDuDossier(deal, docs = []) {
  const urls = [
    deal?.source?.url,
    ...(deal?.documents_espace || []).map((d) => d?.url),
    ...(deal?.lots || []).map((l) => l?.presentation?.pptx_url),
    ...docs.map((d) => d?.url),
  ];
  const chemins = urls
    .filter((u) => typeof u === 'string' && u.startsWith('/uploads/'))
    .map((u) => path.join(CHEMIN_UPLOADS, u.replace(/^\/uploads\//, '')));
  // Les vidéos portent le deal_id dans leur nom.
  const videos = path.join(CHEMIN_UPLOADS, 'videos');
  try {
    for (const f of fs.readdirSync(videos)) if (f.startsWith(`${deal.deal_id}-lot`)) chemins.push(path.join(videos, f));
  } catch { /* pas de dossier vidéos */ }
  return [...new Set(chemins)].filter((c) => path.resolve(c).startsWith(path.resolve(CHEMIN_UPLOADS)));
}

/**
 * Détache le dossier de ses mails. Un mail dont c'était le seul dossier est
 * marqué dossier_supprime_le : sa fiche ne compte plus, et rien ne la
 * repropose. Un mail à plusieurs fiches garde les autres dossiers.
 * @returns {number} mails touchés
 */
export function detacherMails(dealId, maintenant = new Date().toISOString()) {
  let touches = 0;
  for (const m of Records.list('MailRecu')) {
    const lie = m.deal_id === dealId || (m.deal_ids || []).includes(dealId);
    if (!lie) continue;
    const restants = (m.deal_ids || []).filter((x) => x && x !== dealId);
    const patch = restants.length
      ? { deal_id: m.deal_id === dealId ? restants[0] : m.deal_id, deal_ids: restants }
      : { deal_id: null, deal_ids: null, dossier_supprime_le: maintenant };
    Records.update('MailRecu', m.id, patch);
    touches += 1;
  }
  return touches;
}

/**
 * @returns {Promise<{ok: true, titre, mails, fichiers} | {ok: false, error}>}
 */
export async function supprimerDossier(dealId, { user = null } = {}) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return { ok: false, error: 'Dossier introuvable.' };
  if (deal.projet_id && Records.get('Project', deal.projet_id)) {
    return { ok: false, error: 'Un projet est né de ce dossier : supprimez ou détachez d\'abord le projet.' };
  }

  const docs = Records.filter('DossierDoc', { dossier_id: dealId });
  const chemins = fichiersDuDossier(deal, docs);
  const mails = detacherMails(dealId);

  for (const [entite, champ] of LIEES) {
    for (const r of Records.filter(entite, { [champ]: dealId })) Records.delete(entite, r.id);
  }
  // Une cible ALX liée redevient libre : sans cela, elle resterait « en
  // dossier » pour toujours et bloquerait une nouvelle préanalyse.
  for (const c of Records.filter('Cible', { deal_id: dealId })) Records.update('Cible', c.id, { deal_id: null });

  let fichiers = 0;
  for (const chemin of chemins) {
    try { fs.unlinkSync(chemin); fichiers += 1; } catch { /* déjà parti */ }
  }

  // Monday et le Drive, sans bloquer : la suppression locale prime.
  if (deal.monday_item_id) {
    try {
      const { mondayConfigure, supprimerElement } = await import('../monday.js');
      if (mondayConfigure()) await supprimerElement(deal.monday_item_id);
    } catch (e) { console.warn(`[suppression] Monday non nettoyé pour ${dealId} :`, e?.message || e); }
  }
  const faits = Meta.get('prospection.monday.dossiers');
  if (faits?.[dealId]) { delete faits[dealId]; Meta.set('prospection.monday.dossiers', faits); }
  if (deal.drive_folder_id) {
    try {
      const { corbeille } = await import('../google-drive.js');
      const compte = Records.get('MailRecu', deal.source_mail?.mail_recu_id)?.compte || (process.env.AK_COMPTE || 'sourcing@klocka.immo').trim().toLowerCase();
      await corbeille(compte, deal.drive_folder_id);
    } catch (e) { console.warn(`[suppression] Drive non mis à la corbeille pour ${dealId} :`, e?.message || e); }
  }

  const titre = deal.nom || deal.lots?.[0]?.synthese?.titre || dealId;
  Records.delete('Deal', deal.id);
  console.log(`[suppression] dossier « ${titre} » (${dealId}) supprimé${user?.email ? ` par ${user.email}` : ''} : ${mails} mail(s) détaché(s), ${fichiers} fichier(s) effacé(s)`);
  return { ok: true, titre, mails, fichiers };
}
