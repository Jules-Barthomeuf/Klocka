// Haka : à qui est un dossier né d'un mail (17 oct. 2026, Jules).
//
// La fiche arrive dans la boîte Gmail connectée d'un analyste : le dossier
// est à lui, et le mail de demande de documents part de SA boîte, pour garder
// la relation avec l'agent. Une boîte commune (sourcing@) n'a pas de
// propriétaire : la proposition va dans la section « Commun » de la file.

import { Records } from '../db.js';
import { BOITES_COMMUNES } from './drapeaux.js';

const norm = (e) => String(e || '').trim().toLowerCase();

/**
 * L'analyste propriétaire d'une boîte, ou null (boîte commune, compte non rattaché, pas un admin).
 * @returns {{email: string, nom: string, user: object}|null}
 */
export function proprietaireDeLaBoite(compte) {
  const boite = norm(compte);
  if (!boite || BOITES_COMMUNES.has(boite)) return null;
  const account = Records.filter('MailAccount', { email: boite })[0] || null;
  const owner = norm(account?.owner_email || account?.email || boite);
  const user = Records.list('User').find((u) => norm(u.email) === owner) || null;
  if (!user || user.role !== 'admin') return null;
  return { email: norm(user.email), nom: user.full_name || user.email, user };
}

/**
 * La boîte qui enverra pour cette personne : la boîte réceptrice si elle peut
 * envoyer, sinon la boîte par défaut de la personne, sinon null (la proposition
 * le dira : « aucune boîte connectée »).
 */
export function boiteQuiEnvoie(compte, pour) {
  const boite = norm(compte);
  const comptes = Records.list('MailAccount');
  const recevante = comptes.find((a) => norm(a.email) === boite && a.peut_envoyer !== false && a.refresh_token);
  if (recevante && (!pour || norm(recevante.owner_email || recevante.email) === norm(pour))) return norm(recevante.email);
  if (!pour) return recevante ? norm(recevante.email) : null;
  const siennes = comptes.filter((a) => norm(a.owner_email || a.email) === norm(pour) && a.peut_envoyer !== false && a.refresh_token);
  if (!siennes.length) return null;
  const user = Records.list('User').find((u) => norm(u.email) === norm(pour));
  const defaut = norm(user?.boite_envoi);
  return norm((siennes.find((a) => norm(a.email) === defaut) || siennes.find((a) => norm(a.email) === norm(pour)) || siennes[0]).email);
}
