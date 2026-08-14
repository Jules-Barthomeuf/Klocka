// Authentification par email + mot de passe.
//
// Les mots de passe ne sont jamais stockés en clair : on conserve une empreinte
// scrypt avec sel aléatoire par utilisateur. scrypt est fourni par Node, ce qui
// évite une dépendance, et il est volontairement coûteux en mémoire pour rendre
// une attaque par force brute hors ligne peu rentable.

import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// Paramètres de coût. N=16384 est le compromis usuel : ~50 ms par calcul, assez
// lent pour gêner une attaque, assez rapide pour ne pas peser sur la connexion.
const N = 16384;
const r = 8;
const p = 1;
const LONGUEUR_CLE = 64;

export const LONGUEUR_MINIMALE = 8;

/** @returns {string} empreinte au format scrypt$N$r$p$sel$cle */
export async function hacherMotDePasse(motDePasse) {
  const sel = randomBytes(16);
  const cle = await scryptAsync(motDePasse, sel, LONGUEUR_CLE, { N, r, p });
  return ['scrypt', N, r, p, sel.toString('hex'), cle.toString('hex')].join('$');
}

/** Comparaison à temps constant : ne renseigne pas sur la partie correcte. */
export async function verifierMotDePasse(motDePasse, empreinte) {
  if (!motDePasse || !empreinte) return false;
  const parts = String(empreinte).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, selHex, cleHex] = parts;
  try {
    const cleAttendue = Buffer.from(cleHex, 'hex');
    const cle = await scryptAsync(motDePasse, Buffer.from(selHex, 'hex'), cleAttendue.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    return timingSafeEqual(cle, cleAttendue);
  } catch {
    return false;
  }
}

/**
 * Contrôle de robustesse minimal. Volontairement sobre : imposer des symboles
 * pousse surtout à choisir « Motdepasse1! », plus court et plus devinable
 * qu'une phrase longue.
 */
export function validerMotDePasse(motDePasse) {
  const mdp = String(motDePasse || '');
  if (mdp.length < LONGUEUR_MINIMALE) {
    return { valide: false, erreur: `Le mot de passe doit faire au moins ${LONGUEUR_MINIMALE} caractères.` };
  }
  if (mdp.length > 200) return { valide: false, erreur: 'Mot de passe trop long.' };
  const courants = ['password', 'motdepasse', '12345678', 'azertyui', 'qwertyui', 'klocka12'];
  if (courants.includes(mdp.toLowerCase())) {
    return { valide: false, erreur: 'Ce mot de passe est trop courant, choisissez-en un autre.' };
  }
  return { valide: true };
}

// ---------------------------------------------------------------------------
// Limitation des tentatives
// ---------------------------------------------------------------------------

const MAX_TENTATIVES = 8;
const FENETRE_MS = 15 * 60 * 1000;
const tentatives = new Map(); // clé -> { compte, premiere }

function cle(email, ip) {
  return `${String(email || '').toLowerCase()}|${ip || '?'}`;
}

export function tropDeTentatives(email, ip) {
  const entree = tentatives.get(cle(email, ip));
  if (!entree) return false;
  if (Date.now() - entree.premiere > FENETRE_MS) {
    tentatives.delete(cle(email, ip));
    return false;
  }
  return entree.compte >= MAX_TENTATIVES;
}

export function enregistrerEchec(email, ip) {
  const k = cle(email, ip);
  const entree = tentatives.get(k);
  if (!entree || Date.now() - entree.premiere > FENETRE_MS) {
    tentatives.set(k, { compte: 1, premiere: Date.now() });
  } else {
    entree.compte += 1;
  }
}

export function reinitialiserTentatives(email, ip) {
  tentatives.delete(cle(email, ip));
}

export const minutesDAttente = Math.round(FENETRE_MS / 60000);
