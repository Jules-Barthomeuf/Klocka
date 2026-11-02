// Le parcours mandataire complet, de la carte au mandat signé (PLAN.md, T.1).
// Une étape = un test ; à la première étape cassée, les suivantes ne tournent
// pas et le bilan dit laquelle (rapporteur.mjs).

import { test, expect } from '@playwright/test';
import { ANTIBES, COMMERCE, DICTEES, PRIX_ACCORD } from './donnees.mjs';
import { ajouterAUneListe, allerA, connecter, dicter, ficheDuCommerce, mesurerFiche, motif } from './gestes.mjs';
import { appeler, lireEtat, sessionAdmin } from './outils.mjs';

test.describe.configure({ mode: 'serial' });

let page;
let etat;
test.beforeAll(async ({ browser }) => {
  etat = lireEtat();
  page = await browser.newPage();
});
test.afterAll(async () => { await page?.close(); });

const statutDe = async () => (await ficheDuCommerce(page, etat.commerce_id))?.statut || null;

test('Étape 1 · connexion en mandataire → Prospection s’affiche', async () => {
  await connecter(page);
  await allerA(page, 'Prospection');
  await expect(page).toHaveURL(/\/MandataireProspection/);
  await expect(page.getByRole('button', { name: 'Mon secteur' })).toBeVisible({ timeout: 15_000 });
});

test('Étape 2 · le client test est dans le carrousel ; un clic applique ses villes', async () => {
  // Le client n'est montré que par ses initiales (« [TEST] Client Alpes-Maritimes » → CA) et ce qu'il cherche.
  const choisir = page.getByRole('button', { name: 'Choisir un client' });
  await expect(choisir, 'aucun client dans le carrousel : le client test (Alpes-Maritimes) n’est pas proposé pour Antibes').toBeVisible();
  const option = page.getByRole('option').filter({ hasText: 'Alimentaire' }).filter({ hasText: 'CA' });
  // Une fenêtre d'accueil qui s'ouvre referme la liste : on la rouvre.
  await expect(async () => {
    if ((await choisir.getAttribute('aria-expanded')) !== 'true') await choisir.click();
    await option.click({ timeout: 2_000 });
  }, 'le client test n’est pas dans la liste des clients').toPass({ timeout: 15_000 });
  // Ses villes dans le secteur : Antibes.
  const secteur = page.getByText('Dans votre secteur').locator('..');
  await expect(secteur).toContainText(ANTIBES.nom);
  // PLAN 1.1 : le clic sur le client devrait suffire à poser ses murs ; aujourd'hui il faut encore « Prospecter ».
  const prospecter = page.getByRole('button', { name: /^(Prospecter|Voir ses murs)$/ });
  if (await prospecter.isVisible()) {
    await prospecter.click();
    test.info().annotations.push({ type: 'mesure', description: 'murs posés après « Prospecter » (un second clic, PLAN 1.1)' });
  }
  await expect(page.getByRole('row', { name: motif(COMMERCE.nom) })).toBeVisible();
});

test('Étape 3 · le commerce test est sur la carte ; un clic ouvre sa fiche en moins de 2 s', async () => {
  await mesurerFiche(page, test, COMMERCE.nom);
});

test('Étape 4 · ajout à une liste → la fiche passe « À contacter »', async () => {
  await ajouterAUneListe(page, '[TEST] Liste du parcours');
  await expect(page.getByTitle('Changer le statut')).toContainText('À contacter');
  expect(await statutDe()).toBe('a_appeler');
});

test('Étape 5 · dictée « Vu l’exploitante… » → statut « Contacté »', async () => {
  await dicter(page, DICTEES.contact);
  await expect.poll(statutDe, { timeout: 15_000 }).toBe('contacte');
});

test('Étape 6 · dictée « Rendez-vous fixé… » → un bien dans Biens, étape Pré-visite, avec l’historique', async () => {
  await dicter(page, DICTEES.rdv);
  await expect.poll(statutDe, { timeout: 15_000 }).toBe('rdv_pris');
  const p = await ficheDuCommerce(page, etat.commerce_id);
  etat.fiche_id = p.id;
  // L'historique de la fiche suit le bien : l'ajout à la liste, le contact, le rendez-vous.
  const textes = (p.historique || []).map((h) => h.texte).join(' | ');
  expect(textes, 'historique de la fiche').toMatch(/exploitante|Contacté/i);
  expect(textes).toMatch(/RDV|rendez-vous/i);
  await allerA(page, 'Biens');
  await expect(page).toHaveURL(/\/Biens/);
  await page.getByText(COMMERCE.nom).first().click();
  await expect(page).toHaveURL(/etape=previsite/);
});

test('Étape 7 · la Pré-visite affiche la préparation (pré-estimation, questions, documents)', async () => {
  await expect(page.getByRole('heading', { name: 'Préparer la visite' })).toBeVisible();
  for (const partie of ['La pré-estimation, interne', 'Les questions à poser', 'Les documents à demander']) {
    await expect(page.getByText(partie, { exact: true }).first(), `partie « ${partie} »`).toBeVisible({ timeout: 15_000 });
  }
});

test('Étape 8 · dictée de visite → l’Avis de valeur démarre sans redemander le loyer', async () => {
  await page.getByRole('button', { name: 'Parler à mon assistant' }).click();
  await dicter(page, DICTEES.visite);
  // Le compte rendu est fait ; Haka propose l'estimation.
  await page.getByRole('button', { name: 'Oui, passer à l\'estimation' }).click({ timeout: 15_000 });
  await expect(page).toHaveURL(/etape=estimation/);
  // L'avis reprend ce que la visite a dit : le loyer est déjà là, il n'est pas redemandé.
  const debut = page.getByText(/Commençons l'avis de valeur/).last();
  await expect(debut).toBeVisible({ timeout: 15_000 });
  const message = debut.locator('xpath=ancestor::div[.//*[contains(text(), "Loyer annuel")]][1]');
  await expect(message).toContainText(/24\s?000/);
  expect(await message.innerText(), 'l’avis redemande le loyer').not.toMatch(/quel est le loyer|loyer \?|il me manque[^]*loyer/i);
  const avis = await (await page.request.get('/api/mandataire/estimations')).json();
  const e = (avis.estimations || avis || []).find?.((x) => x.proprietaire_id === etat.fiche_id);
  expect(e?.de_la_visite?.reponses?.loyer_annuel_hc, 'loyer repris de la visite').toBe(24000);
  etat.estimation_id = e.id;
});

test('Étape 9 · avis envoyé, accord sur le prix → étape Mandat, mandat pré-rempli avec le prix', async () => {
  // La rédaction de l'avis lit Equimmox et Data-B, payants : elle est simulée, un avis rédigé posé par l'admin.
  const admin = await sessionAdmin();
  await appeler(admin, 'PUT', `/api/entities/EstimationMandataire/${etat.estimation_id}`, {
    statut: 'prete', avis: { chiffres: { valeur: 400000, bas: 380000, haut: 420000, rendement: 6 } }, redige_le: new Date().toISOString(),
  });
  await admin.dispose();
  // L'envoi au propriétaire (le mail part ailleurs), puis son accord à 410 000 €.
  await appeler(page.request, 'POST', `/api/mandataire/estimations/${etat.estimation_id}/envoye`, { a: 'proprietaire@klocka.test' });
  await appeler(page.request, 'POST', `/api/mandataire/proprietaires/${etat.fiche_id}/restitution`, { cas: 'accord_fourchette', prix: PRIX_ACCORD });
  await page.goto(`/Biens?bien=proprietaire:${etat.fiche_id}&etape=mandat`);
  await expect(page.getByText('Prix de vente').first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => {
    const { mandats = [] } = await (await page.request.get('/api/mandataire/mandats')).json();
    const m = mandats.find((x) => x.estimation_id === etat.estimation_id);
    etat.mandat_id = m?.id;
    return Number(m?.questionnaire?.prix || m?.prix) || null;
  }, { message: 'prix du mandat', timeout: 10_000 }).toBe(PRIX_ACCORD);
  await expect(page.getByText(/quatre cent dix mille/i).first()).toBeVisible();
});

test('Étape 10 · signature MyNotary simulée → « Mandat signé »', async () => {
  // Ce que le mandataire complète d'ordinaire avec Haka dans le mandat : posé par l'aperçu, champ par champ, sans toucher au prix.
  const { mandats = [] } = await (await page.request.get('/api/mandataire/mandats')).json();
  const q = mandats.find((x) => x.id === etat.mandat_id)?.questionnaire || {};
  const complements = {
    type_mandat: 'exclusif', vendeur_societe: '[TEST] SCI des Remparts', vendeur_adresse: '1 avenue de Verdun, 06600 Antibes',
    bien_adresse: '12 rue du Safranier, 06600 Antibes', bien_designation: 'Local commercial en rez-de-chaussée',
    honoraires: '5', honoraires_charge: 'vendeur', duree_mois: '12',
  };
  for (const [champ, valeur] of Object.entries(complements)) {
    if (q[champ] == null || q[champ] === '') await appeler(page.request, 'POST', `/api/mandataire/mandats/${etat.mandat_id}/questionnaire/champ`, { champ, valeur });
  }
  await appeler(page.request, 'POST', `/api/mandataire/mandats/${etat.mandat_id}/envoyer`);
  // Klocka dépose le mandat rédigé sur MyNotary (simulé : un PDF factice), le mandataire passe à la suite une fois signé.
  const admin = await sessionAdmin();
  const r = await admin.post(`/api/mandataire/admin/mandats/${etat.mandat_id}/pret`, {
    multipart: { fichier: { name: 'mandat-test.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% mandat de test\n') } },
  });
  expect(r.ok(), await r.text()).toBe(true);
  await admin.dispose();
  await page.reload();
  await page.getByRole('button', { name: 'Passer à l\'étape suivante' }).click({ timeout: 15_000 });
  await expect.poll(async () => {
    const { mandats = [] } = await (await page.request.get('/api/mandataire/mandats')).json();
    return mandats.find((x) => x.id === etat.mandat_id)?.statut;
  }, { message: 'statut du mandat', timeout: 10_000 }).toBe('signe');
  // Dans Biens, la carte du bien test dit « Mandat signé ».
  await allerA(page, 'Biens');
  const carte = page.getByText(COMMERCE.nom).first().locator('xpath=ancestor::*[contains(., "Mandat signé")][1]');
  await expect(carte).toBeVisible({ timeout: 15_000 });
});
