// Le test du parcours mandataire complet : `npm run test:parcours`.
// À relancer avant de dire « terminé » (PLAN.md, règle 3).

import { defineConfig } from '@playwright/test';
import { DOSSIER, URL_ECRAN } from './donnees.mjs';

export default defineConfig({
  testDir: '.',
  outputDir: `${DOSSIER}-resultats`,
  // Une étape après l'autre, sur un seul serveur.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  globalTimeout: 170_000,
  reporter: [['list'], ['./rapporteur.mjs']],
  use: {
    baseURL: URL_ECRAN,
    // Le Chrome de la machine : rien à télécharger.
    channel: 'chrome',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'preparation', testMatch: /preparation\.setup\.mjs/, teardown: 'nettoyage' },
    { name: 'nettoyage', testMatch: /nettoyage\.teardown\.mjs/ },
    { name: 'ordinateur', testMatch: /parcours\.spec\.mjs/, dependencies: ['preparation'], use: { viewport: { width: 1440, height: 900 } } },
    { name: 'telephone', testMatch: /telephone\.spec\.mjs/, dependencies: ['preparation'], use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node tests/parcours/lancer.mjs',
    cwd: '../..',
    // Par Vite jusqu'au serveur : les deux sont prêts.
    url: `${URL_ECRAN}/api/health`,
    // La construction de l'écran (une quinzaine de secondes), puis le serveur.
    timeout: 90_000,
    // PARCOURS_REUTILISER=1 : un lanceur déjà démarré à la main (node tests/parcours/lancer.mjs), pour mettre au point.
    reuseExistingServer: process.env.PARCOURS_REUTILISER === '1',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
