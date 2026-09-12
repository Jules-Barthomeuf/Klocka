// Un vrai navigateur, sans écran, pour les services qu'on ne peut pas rejouer
// en HTTP — Equimmox (application Bubble) et le module Expertise de Data-B
// (assistant JavaScript). Equimmox a écrit ce code le premier, dans son propre
// fichier ; il vit ici pour que le deuxième service n'en garde pas une copie.
//
// CHROMIUM_PATH désigne un navigateur local ; NAVIGATEUR_CDP_URL (ou, par
// compatibilité, EQUIMMOX_CDP_URL) un navigateur distant chez un hébergeur qui
// ne peut pas faire tourner Chromium.

import { poserChemin } from '../chromium.js';
import { ErreurSource } from './erreurs.js';

const CHROMIUM = (process.env.CHROMIUM_PATH || '').trim() || undefined;
const CDP = (process.env.NAVIGATEUR_CDP_URL || process.env.EQUIMMOX_CDP_URL || '').trim();

let navigateur = null;

/** Le navigateur, lancé une fois et gardé tant qu'il répond. */
export async function lancerNavigateur(service = 'Ce service') {
  poserChemin();
  const { chromium } = await import('playwright-core');
  if (navigateur && navigateur.isConnected()) return navigateur;
  if (CDP) {
    navigateur = await chromium.connectOverCDP(CDP, { timeout: 30000 });
    return navigateur;
  }
  try {
    navigateur = await chromium.launch({
      executablePath: CHROMIUM,
      // Un Chromium tient facilement trois cents mégaoctets ; sur une petite
      // machine, c'est ce qui reste au serveur. On lui retire tout ce dont une
      // lecture de page n'a pas besoin.
      args: [
        '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
        '--disable-extensions', '--disable-background-networking',
        '--disable-default-apps', '--mute-audio', '--no-first-run',
        '--js-flags=--max-old-space-size=256',
      ],
    });
  } catch (e) {
    if (/Executable doesn't exist|ENOENT/i.test(e?.message || '')) {
      throw new Error(
        `${service} a besoin d'un navigateur, et le serveur n'en a pas. ` +
        "Installez-le avec « npm run chromium » au déploiement, ou indiquez-en un " +
        'avec CHROMIUM_PATH, ou un navigateur distant avec NAVIGATEUR_CDP_URL.'
      );
    }
    throw e;
  }
  return navigateur;
}

/**
 * Aller sur une page EN REGARDANT ce que le serveur a répondu. Playwright ne se
 * plaint pas d'un 502 : il rend la page d'erreur et la suite échoue plus loin,
 * sur le mauvais coupable. Le statut décide s'il faut repasser ou prévenir.
 */
export async function aller(p, url, { service = 'Le service', timeout = 60000 } = {}) {
  const r = await p.goto(url, { waitUntil: 'domcontentloaded', timeout });
  const statut = r?.status?.() ?? null;
  if (statut != null && statut >= 400) throw new ErreurSource(`${service} a répondu ${statut}.`, { service, statut });
  return r;
}

/** Le texte visible de la page, ligne à ligne, sans les vides. */
export const texteDe = async (p) => (await p.evaluate(() => document.body.innerText)).split('\n').map((l) => l.trim()).filter(Boolean);
