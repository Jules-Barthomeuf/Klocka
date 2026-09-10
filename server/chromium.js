// Où Playwright range son navigateur.
//
// Chez un hébergeur, le navigateur est téléchargé pendant la construction et
// doit encore être là quand le serveur tourne. Le dossier par défaut, sous
// $HOME/.cache, n'a rien qui le garantisse : on le range dans le dossier du
// projet, seul endroit dont la survie est certaine. En local on ne touche à
// rien, pour réutiliser le navigateur déjà installé sur la machine.
//
// Les deux appelants — le script d'installation et le module Equimmox —
// passent par ici, sinon ils ne chercheraient pas au même endroit.

import path from 'path';
import { fileURLToPath } from 'url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const heberge = () => !!(
  process.env.RENDER || process.env.FLY_APP_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.DYNO
);

/** Fixe PLAYWRIGHT_BROWSERS_PATH si besoin. À appeler avant d'importer playwright-core. */
export function poserChemin() {
  if ((process.env.PLAYWRIGHT_BROWSERS_PATH || '').trim()) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!heberge()) return null;
  const dossier = path.join(RACINE, '.playwright');
  process.env.PLAYWRIGHT_BROWSERS_PATH = dossier;
  return dossier;
}
