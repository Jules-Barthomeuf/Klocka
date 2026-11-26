// Le lien public d'un projet (25 nov. 2026, Jules : « rajoute un truc dans le projet pour qu'on puisse créer un lien
// accessible sans connexion »). Le lien porte une clé tirée au hasard, pas l'identifiant du projet : on le crée depuis
// le projet, on le coupe d'un clic, et un lien coupé ne rouvre plus rien. La clé vit dans son entité (LienPublic,
// fermée au CRUD HTTP) : un enregistrement de l'éditeur, qui renvoie tout le projet, ne peut ni la remettre ni l'effacer.

import crypto from 'crypto';
import { Records } from './db.js';

/** Ce qu'un visiteur sans compte ne voit jamais : les comptes, les traces de l'équipe. */
const CHAMPS_PRIVES = [
  'client_email', 'client_emails', 'admins', 'admin_principal', 'created_by', 'journal_champs', 'champs_a_la_main',
  'maj_depuis_dossier_par', 'questions_ouverture', 'conversation_id', 'suivi_retour_client', 'suivi_message_envoye',
];

/** Pure : le projet tel qu'un lien public le montre. */
export function projetPourLePublic(projet) {
  const sortie = { ...projet };
  for (const k of CHAMPS_PRIVES) delete sortie[k];
  return sortie;
}

/** Le lien en service du projet, ou null. */
export function lienDuProjet(projectId) {
  return Records.filter('LienPublic', { project_id: projectId }).find((l) => l.actif) || null;
}

/** Crée le lien du projet, ou rend celui qui existe déjà. */
export function creerLien(projectId, user = null) {
  if (!Records.get('Project', projectId)) return { ok: false, error: 'Projet introuvable.' };
  const deja = lienDuProjet(projectId);
  if (deja) return { ok: true, lien: deja };
  const lien = Records.create('LienPublic', {
    project_id: projectId,
    cle: crypto.randomBytes(18).toString('base64url'),
    actif: true,
    cree_le: new Date().toISOString(),
    cree_par: user?.email || null,
  }, user?.email);
  return { ok: true, lien };
}

/** Coupe le lien du projet : la clé ne rouvre plus rien. */
export function couperLien(projectId, user = null) {
  const lien = lienDuProjet(projectId);
  if (!lien) return { ok: true, coupe: false };
  Records.update('LienPublic', lien.id, { actif: false, coupe_le: new Date().toISOString(), coupe_par: user?.email || null });
  return { ok: true, coupe: true };
}

/** Le projet qu'ouvre une clé en service, ou null. */
export function projetDeLaCle(cle) {
  const c = String(cle || '').trim();
  if (!/^[\w-]{16,64}$/.test(c)) return null;
  const lien = Records.findBy('LienPublic', 'cle', c);
  if (!lien?.actif) return null;
  return Records.get('Project', lien.project_id) || null;
}

/** Pure : ce que l'écran reçoit du lien (jamais qui l'a créé). */
export const lienPourEcran = (lien) => (lien ? { cle: lien.cle, cree_le: lien.cree_le } : null);
