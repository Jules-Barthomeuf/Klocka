// Haka : le moteur de tâches. Reprise après une coupure, un pas externe jamais
// rejoué, la clé unique, trois essais.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-taches-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@test.local';
const db = (await import('../db.js')).default;
const { Records } = await import('../db.js');
const T = await import('./taches.js');

const compteur = { a: 0, b: 0, externe: 0, cassant: 0 };
T.enregistrer('essai', {
  version: '7',
  etapes: [
    { nom: 'a', run: async () => { compteur.a += 1; return { valeur: 1, dossier: 'deal-1' }; } },
    { nom: 'b', run: async ({ resultats }) => { compteur.b += 1; return { somme: resultats.a.valeur + 1, attendre: 'validation' }; } },
    { nom: 'envoyer', externe: true, run: async ({ charge, user }) => { compteur.externe += 1; return { parti: true, a: charge.a, par: user?.email || null }; } },
    { nom: 'apres', run: async () => ({ fini: true }) },
  ],
});
T.enregistrer('cassante', { etapes: [{ nom: 'casse', run: async () => { compteur.cassant += 1; throw new Error('boum'); } }] });
T.enregistrer('saut', { etapes: [{ nom: 'un', run: async () => ({ sauter: ['deux'] }) }, { nom: 'deux', run: async () => { throw new Error('ne doit pas tourner'); } }, { nom: 'trois', run: async () => ({ ok: true }) }] });

const etat = (id) => T.tache(id).etat;
const etape = (id, nom) => T.etapesDe(id).find((e) => e.nom === nom);

test('les pas se suivent, la file s\'arrête devant un pas externe, la validation l\'exécute une seule fois', async () => {
  const t = T.enfiler('essai', { a: 'agent@x.fr' }, { cle: 'essai:1', pour: 'nora@test.local', lancer: false });
  assert.equal(t.version, '7');
  await T.tourner();
  assert.equal(etat(t.id), 'en_attente_validation');
  assert.equal(compteur.externe, 0, 'le pas externe n\'a pas tourné depuis la file');
  assert.equal(T.tache(t.id).dossier, 'deal-1', 'le dossier remonte du premier pas');
  assert.deepEqual(JSON.parse(etape(t.id, 'b').resultat).somme, 2);
  // La reprise ne l'exécute pas non plus.
  await T.reprendre();
  await T.tourner();
  assert.equal(compteur.externe, 0);
  assert.equal(etat(t.id), 'en_attente_validation');
  const r = await T.executerExterne(t.id, 'envoyer', { user: { email: 'jules@test.local' }, charge: { a: 'agent@x.fr' } });
  assert.deepEqual(r, { parti: true, a: 'agent@x.fr', par: 'jules@test.local' });
  assert.equal(etat(t.id), 'faite', 'les pas suivants ont tourné après la validation');
  // Une seconde validation rend le résultat gardé, sans rejouer.
  const r2 = await T.executerExterne(t.id, 'envoyer', { user: { email: 'jules@test.local' } });
  assert.equal(compteur.externe, 1);
  assert.equal(r2.parti, true);
});

test('la clé : une tâche vivante de même clé n\'est pas doublée ; finie, une nouvelle peut naître', async () => {
  const a = T.enfiler('essai', {}, { cle: 'essai:2', lancer: false });
  const b = T.enfiler('essai', {}, { cle: 'essai:2', lancer: false });
  assert.equal(a.id, b.id);
  T.annuler(a.id, 'test');
  const c = T.enfiler('essai', {}, { cle: 'essai:2', lancer: false });
  assert.notEqual(c.id, a.id);
  assert.equal(etat(a.id), 'annulee');
  assert.equal(etape(a.id, 'envoyer').etat, 'sautee');
  T.annuler(c.id, 'test');
});

test('reprise : un pas interne surpris en cours est rejoué ; un pas externe en cours devient incertain et met la tâche en pause', async () => {
  // Un pas interne « en cours » laissé par une coupure.
  const t = T.enfiler('essai', {}, { cle: 'essai:3', lancer: false });
  const a = etape(t.id, 'a');
  db.prepare("UPDATE haka_etapes SET etat = 'en_cours' WHERE id = ?").run(a.id);
  db.prepare("UPDATE haka_taches SET etat = 'en_cours' WHERE id = ?").run(t.id);
  const avantA = compteur.a;
  const r = await T.reprendre();
  assert.equal(r.reprises, 1);
  await T.tourner();
  assert.equal(compteur.a, avantA + 1, 'le pas interne a été rejoué');
  assert.equal(etat(t.id), 'en_attente_validation');
  // Un pas externe « en cours » : l'action est peut-être partie.
  Records.create('User', { email: 'jules@test.local', role: 'admin' });
  const e = etape(t.id, 'envoyer');
  db.prepare("UPDATE haka_etapes SET etat = 'en_cours' WHERE id = ?").run(e.id);
  db.prepare("UPDATE haka_taches SET etat = 'en_cours' WHERE id = ?").run(t.id);
  const r2 = await T.reprendre();
  await T.tourner();
  assert.equal(r2.incertaines, 1);
  assert.equal(etape(t.id, 'envoyer').etat, 'incertaine');
  assert.equal(etat(t.id), 'en_pause');
  assert.equal(compteur.externe, 1, 'rien n\'est reparti');
  assert.ok(Records.list('Notification').some((n) => n.cle === `haka:incertaine:${e.id}` && n.pour === 'jules@test.local'));
  // Jules a vérifié : l'action n'était pas partie, le pas redevient à valider.
  assert.equal(T.leverPause(t.id, { reprendreLePas: true }), true);
  assert.equal(etape(t.id, 'envoyer').etat, 'a_faire');
  assert.equal(etat(t.id), 'en_attente_validation');
});

test('trois essais, puis échec ; le délai s\'allonge', async () => {
  const t = T.enfiler('cassante', {}, { cle: 'cassante:1', lancer: false });
  await T.tourner();
  assert.equal(etat(t.id), 'en_attente');
  assert.ok(T.tache(t.id).apres > new Date().toISOString(), 'différée');
  // On force les deux passages suivants.
  for (let i = 0; i < 2; i += 1) { db.prepare("UPDATE haka_taches SET apres = NULL WHERE id = ?").run(t.id); await T.tourner(); }
  assert.equal(etat(t.id), 'echec');
  assert.equal(compteur.cassant, 3);
  assert.match(T.tache(t.id).erreur, /boum/);
});

test('un pas peut en sauter d\'autres ; le plafond compte les tâches du jour', async () => {
  const t = T.enfiler('saut', {}, { lancer: false });
  await T.tourner();
  assert.equal(etat(t.id), 'faite');
  assert.equal(etape(t.id, 'deux').etat, 'sautee');
  assert.equal(etape(t.id, 'trois').etat, 'faite');
  assert.equal(T.tachesDuJour('saut'), 1);
  // Les annulées ne comptent pas : essai:1 et essai:3.
  assert.equal(T.tachesDuJour('essai'), 2);
  assert.ok(T.etatFile().faite >= 2);
});
