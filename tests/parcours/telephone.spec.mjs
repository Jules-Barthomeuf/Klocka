// Le parcours au téléphone (390 × 844) : les étapes 3, 5 et 7, sur un second
// commerce test, pour ne pas dépendre de l'ordinateur. Ce qui précède chaque
// étape (la liste, le rendez-vous) est posé par l'API.

import { test, expect } from '@playwright/test';
import { COMMERCE_TEL, DICTEES } from './donnees.mjs';
import { allerA, connecter, dicter, ficheDuCommerce, mesurerFiche, ouvrirFiche } from './gestes.mjs';
import { appeler, lireEtat } from './outils.mjs';

test.describe.configure({ mode: 'serial' });

let page;
let etat;
test.beforeAll(async ({ browser }) => {
  etat = lireEtat();
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await connecter(page);
});
test.afterAll(async () => { await page?.close(); });

const fiche = () => ficheDuCommerce(page, etat.commerce_tel_id);

test('Étape 3 (téléphone) · un clic sur le commerce ouvre sa fiche en moins de 2 s', async () => {
  await allerA(page, 'Prospection');
  await expect(page).toHaveURL(/\/MandataireProspection/);
  await mesurerFiche(page, test, COMMERCE_TEL.nom);
});

test('Étape 5 (téléphone) · dictée « Vu l’exploitante… » → statut « Contacté »', async () => {
  // Dans une liste d'abord (l'étape 4, faite à l'ordinateur).
  await appeler(page.request, 'POST', '/api/off-market/simple/listes/envoyer', { ids: [etat.commerce_tel_id], nom: '[TEST] Liste du téléphone' });
  await page.reload();
  await ouvrirFiche(page, COMMERCE_TEL.nom);
  await expect(page.getByTitle('Changer le statut')).toContainText('À contacter');
  await dicter(page, DICTEES.contact);
  await expect.poll(async () => (await fiche())?.statut, { timeout: 15_000 }).toBe('contacte');
});

test('Étape 7 (téléphone) · la Pré-visite affiche la préparation', async () => {
  // Le rendez-vous fixé (l'étape 6, faite à l'ordinateur).
  const p = await fiche();
  await appeler(page.request, 'POST', `/api/mandataire/proprietaires/${p.id}/statut`, { statut: 'rdv_pris' });
  await page.goto(`/Biens?bien=proprietaire:${p.id}&etape=previsite`);
  // Au téléphone, la Visite s'ouvre sur le chat ; la préparation est sous « Voir la fiche ».
  await page.getByRole('button', { name: 'Voir la fiche' }).click({ timeout: 15_000 });
  for (const partie of ['La pré-estimation, interne', 'Les questions à poser', 'Les documents à demander']) {
    await expect(page.getByText(partie, { exact: true }).first(), `partie « ${partie} »`).toBeVisible({ timeout: 15_000 });
  }
});
