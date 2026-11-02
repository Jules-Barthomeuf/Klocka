// Les gestes communs du test du parcours : parler au serveur en admin, lire
// et écrire l'état partagé entre la préparation, les étapes et le nettoyage.

import fs from 'fs';
import path from 'path';
import { request } from '@playwright/test';
import { ADMIN, DOSSIER, URL_ECRAN } from './donnees.mjs';

const ETAT = path.join(DOSSIER, 'etat.json');
export const lireEtat = () => JSON.parse(fs.readFileSync(ETAT, 'utf8'));
export const ecrireEtat = (e) => fs.writeFileSync(ETAT, JSON.stringify(e, null, 2));

/** Un appel au serveur ; une réponse en erreur arrête le test en disant laquelle. */
export async function appeler(ctx, methode, adresse, donnees) {
  const r = await ctx.fetch(adresse, { method: methode, data: donnees });
  const texte = await r.text();
  if (!r.ok()) throw new Error(`${methode} ${adresse} → ${r.status()} : ${texte.slice(0, 300)}`);
  try { return JSON.parse(texte); } catch { return texte; }
}

/** Une session d'admin : le premier passage pose son mot de passe (base vierge), les suivants se connectent. */
export async function sessionAdmin() {
  const ctx = await request.newContext({ baseURL: URL_ECRAN });
  const r = await ctx.post('/api/auth/definir-mot-de-passe', { data: ADMIN });
  if (r.status() === 409) await appeler(ctx, 'POST', '/api/auth/connexion', ADMIN);
  else if (!r.ok()) throw new Error(`Compte admin de test : ${r.status()} ${await r.text()}`);
  return ctx;
}

/** Une session au nom d'un compte (le mandataire de test), pour lire ce que lui voit. */
export async function sessionDe(compte) {
  const ctx = await request.newContext({ baseURL: URL_ECRAN });
  await appeler(ctx, 'POST', '/api/auth/connexion', { email: compte.email, mot_de_passe: compte.mot_de_passe });
  return ctx;
}
