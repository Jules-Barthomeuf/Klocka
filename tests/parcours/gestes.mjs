// Les gestes du mandataire à l'écran, partagés par l'ordinateur et le téléphone.

import { expect } from '@playwright/test';
import { MANDATAIRE } from './donnees.mjs';

const echapper = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const motif = (t) => new RegExp(echapper(t));

/** Les fenêtres d'accueil d'un premier passage (secteur, installation de l'appli) se ferment d'elles-mêmes. */
export async function ecarterAccueil(page) {
  await page.addLocatorHandler(page.getByRole('dialog', { name: 'Installer l\'application Klocka' }), async () => {
    await page.getByRole('button', { name: 'Plus tard' }).filter({ hasText: 'Plus tard' }).click();
  });
  await page.addLocatorHandler(page.getByRole('dialog', { name: 'Bienvenue dans votre espace' }), async () => {
    await page.getByRole('dialog', { name: 'Bienvenue dans votre espace' }).getByRole('button', { name: 'Valider' }).click();
  });
}

export async function connecter(page) {
  await ecarterAccueil(page);
  await page.goto('/');
  await page.locator('#connexion-email').fill(MANDATAIRE.email);
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await page.locator('#connexion-mdp').fill(MANDATAIRE.mot_de_passe);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
}

/** Une page du menu de gauche ; au téléphone, le menu se déplie d'abord. */
export async function allerA(page, nom) {
  const lien = page.getByRole('link', { name: nom, exact: true }).filter({ visible: true });
  const menu = page.getByRole('button', { name: 'Ouvrir le menu' }).filter({ visible: true });
  await expect(lien.or(menu).first()).toBeVisible({ timeout: 15_000 });
  if (!(await lien.count())) await menu.first().click();
  await lien.first().click();
}

/** Clique la ligne du commerce et attend sa fiche ; rend le temps mis, en millisecondes. */
export async function ouvrirFiche(page, nom) {
  const ligne = page.getByRole('row', { name: motif(nom) });
  await expect(ligne).toBeVisible({ timeout: 15_000 });
  const t0 = Date.now();
  await ligne.getByText(nom, { exact: true }).click();
  // La fiche est là quand son geste principal l'est : il n'apparaît qu'une fois la fiche lue par le serveur.
  await expect(page.getByRole('button', { name: /Ajouter à (ma liste|une nouvelle liste)/ }).or(page.getByTitle('Changer le statut'))).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: nom })).toBeVisible();
  return Date.now() - t0;
}

/** Ajoute le commerce ouvert à une nouvelle liste. */
export async function ajouterAUneListe(page, nomListe) {
  await page.getByRole('button', { name: 'Choisir une autre liste' }).click();
  await page.getByRole('textbox', { name: 'Nom de la nouvelle liste' }).fill(nomListe);
  await page.getByRole('button', { name: 'Créer la liste' }).click();
  await expect(page.getByText(`Dans la liste « ${nomListe} »`)).toBeVisible();
}

/** Une dictée, écrite dans le chat de la fiche (le micro passe par le même chemin une fois transcrit). */
export async function dicter(page, texte, placeholder = /Parler à l'assistant|racontez la visite|Racontez la suite|Répondre ou ajouter/) {
  const saisie = page.getByPlaceholder(placeholder).last();
  await saisie.fill(texte);
  await saisie.press('Enter');
}

/** La fiche du commerce, lue par le serveur au nom du mandataire. */
export async function ficheDuCommerce(page, commerceId) {
  const r = await page.request.get('/api/mandataire/proprietaires');
  const { proprietaires = [] } = await r.json();
  return proprietaires.find((p) => p.commerce_simple_id === commerceId) || null;
}

/**
 * L'étape 3 : le temps du clic à la fiche. Le premier clic après le démarrage paie des chargements uniques (Vite en
 * développement, les modules du serveur) : au-delà de 2 s, la fiche est refermée et rouverte, et c'est ce second
 * temps qui compte. Les deux sont affichés.
 */
export async function mesurerFiche(page, test, nom) {
  const froid = await ouvrirFiche(page, nom);
  let chaud = null;
  if (froid >= 2000) {
    await page.getByRole('button', { name: 'Fermer la fiche' }).first().click();
    chaud = await ouvrirFiche(page, nom);
  }
  const s = (ms) => `${(ms / 1000).toFixed(2)} s`;
  test.info().annotations.push({ type: 'mesure', description: chaud == null ? `fiche ouverte en ${s(froid)}` : `fiche ouverte en ${s(froid)} au premier clic, ${s(chaud)} au second` });
  expect(chaud ?? froid, `fiche ouverte en ${chaud ?? froid} ms`).toBeLessThan(2000);
}
