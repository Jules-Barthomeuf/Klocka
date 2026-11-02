// Après le parcours : tout ce que le test a créé est supprimé, par l'API.
//
// Le parcours crée lui-même des enregistrements (fiche, liste, rappels, avis,
// mandat, conversations) : on les retrouve dans la base par le préfixe
// « [TEST] » ou l'adresse du compte de test, et on vérifie qu'il n'en reste
// aucun. La base entière est ensuite effacée par le lanceur.

import path from 'path';
import Database from 'better-sqlite3';
import { test as nettoyer, expect } from '@playwright/test';
import { DOSSIER, MANDATAIRE, PREFIXE } from './donnees.mjs';
import { appeler, lireEtat, sessionAdmin } from './outils.mjs';

const BASE = path.join(DOSSIER, 'data', 'klocka.db');

/** Les enregistrements du test : créés par la préparation, ou qui portent son marqueur. */
function restants(ids) {
  const db = new Database(BASE, { readonly: true, fileMustExist: true });
  try {
    const marques = db.prepare("SELECT id, entity FROM records WHERE instr(data, ?) > 0 OR instr(data, ?) > 0 OR created_by = ?").all(PREFIXE, MANDATAIRE.email, MANDATAIRE.email);
    const crees = ids.length ? db.prepare(`SELECT id, entity FROM records WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
    const vus = new Map();
    for (const r of [...marques, ...crees]) vus.set(r.id, r);
    return [...vus.values()];
  } finally {
    db.close();
  }
}

nettoyer('nettoyage des données test', async () => {
  // PARCOURS_GARDER=1 : on garde tout pour comprendre un échec (la base reste dans le dossier temporaire).
  nettoyer.skip(process.env.PARCOURS_GARDER === '1', 'PARCOURS_GARDER=1');
  let etat = { crees: [] };
  try { etat = lireEtat(); } catch { /* la préparation n'a pas abouti : on cherche quand même par le marqueur */ }
  const admin = await sessionAdmin();
  const avant = restants(etat.crees.map((c) => c.id));
  const refus = [];
  // Le compte en dernier : ses fiches se suppriment encore en son nom.
  const fermees = [];
  for (const r of avant.sort((a, b) => (a.entity === 'User') - (b.entity === 'User'))) {
    try { await appeler(admin, 'DELETE', `/api/entities/${r.entity}/${r.id}`); } catch (e) {
      // Les sessions ne passent pas par l'API : retirées de la base de test directement.
      if (/pas accessible par l.API/.test(e.message)) fermees.push(r); else refus.push(`${r.entity} ${r.id} : ${e.message}`);
    }
  }
  if (fermees.length) {
    const db = new Database(BASE, { fileMustExist: true });
    try { const del = db.prepare('DELETE FROM records WHERE id = ?'); for (const r of fermees) del.run(r.id); } finally { db.close(); }
  }
  await admin.dispose();
  const apres = restants(etat.crees.map((c) => c.id));
  console.log(`  Nettoyage : ${avant.length - apres.length} enregistrement(s) test supprimé(s), ${apres.length} restant(s).`);
  expect(refus, refus.join('\n')).toEqual([]);
  expect(apres.map((r) => `${r.entity} ${r.id}`)).toEqual([]);
});
