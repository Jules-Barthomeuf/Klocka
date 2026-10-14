// Les réunions enregistrées (14 oct. 2026) : morceaux à leur rang, reprise, parties, envoi au Cerveau.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-reunions-'));
const M = await import('./reunions.js');
const { Records } = await import('./db.js');

const JULES = { email: 'Jules.B@klocka.immo', role: 'admin' };
const NORA = { email: 'nora.l@klocka.immo', role: 'admin' };

test('le texte suit le rang des morceaux, pas leur ordre d\'arrivée ; les vides sont écartés', () => {
  assert.equal(M.texteDe([{ i: 2, texte: 'trois' }, { i: 0, texte: 'un' }, { i: 1, texte: '  ' }]), 'un\ntrois');
});

test('une longue réunion se coupe en parties, entre deux morceaux', () => {
  const morceaux = Array.from({ length: 10 }, (_, i) => ({ i, texte: 'x'.repeat(30) }));
  const p = M.parties(morceaux, 100);
  assert.ok(p.every((x) => x.length <= 100));
  assert.equal(p.join('\n'), M.texteDe(morceaux));
  assert.equal(M.parties([{ i: 0, texte: 'y'.repeat(250) }], 100).length, 3, 'un morceau trop long est coupé net');
});

test('démarrer, garder chaque morceau à son rang, reprendre après une coupure', () => {
  const d = M.demarrer(JULES, { titre: 'Point hebdo' });
  assert.equal(d.ok, true);
  const id = d.reunion.id;
  assert.equal(M.ajouterMorceau(id, 1, 'deuxième', JULES).ok, true);
  assert.equal(M.ajouterMorceau(id, 0, 'premier', JULES).ok, true);
  assert.equal(M.ajouterMorceau(id, 0, 'premier, renvoyé', JULES).ok, true, 'un renvoi remplace');
  assert.equal(M.ajouterMorceau(id, 2, 'pas à moi', NORA).ok, false, 'la réunion d\'un autre');
  // La page se recharge : la même réunion revient, avec le rang du prochain morceau.
  const reprise = M.demarrer(JULES);
  assert.equal(reprise.reprise, true);
  assert.equal(reprise.reunion.id, id);
  assert.equal(reprise.reunion.prochain, 2);
  assert.equal(M.vue(M.enCoursDe(JULES)).morceaux.map((m) => m.texte).join(' | '), 'premier, renvoyé | deuxième');
});

test('terminer envoie au Cerveau une source par partie, une seule fois', async () => {
  const ajoutees = [];
  const extraites = [];
  const C = {
    ajouterSource: (s) => { const deja = ajoutees.find((x) => x.cle === s.cle); if (deja) return { ok: true, source: deja, deja: true }; const src = { id: `s${ajoutees.length + 1}`, ...s }; ajoutees.push(src); return { ok: true, source: src }; },
    extraire: async (id) => { extraites.push(id); },
  };
  const id = M.enCoursDe(JULES).id;
  const r = await M.terminer(id, { participants: 'Jules, Paul', notes: 'Décider Libourne' }, JULES, { C });
  assert.equal(r.ok, true);
  assert.equal(r.reunion.etat, 'envoyee');
  assert.equal(ajoutees.length, 1);
  assert.equal(ajoutees[0].type, 'compte_rendu');
  assert.equal(ajoutees[0].titre, 'Réunion : Point hebdo');
  assert.match(ajoutees[0].contenu, /^Participants : Jules, Paul\nNotes prises pendant la réunion : Décider Libourne\n\npremier, renvoyé\ndeuxième$/);
  assert.deepEqual(extraites, ['s1']);
  // Rejouée, elle n'entre pas deux fois.
  Records.update(M.REUNION, id, { etat: 'enregistrement' });
  await M.terminer(id, {}, JULES, { C });
  assert.equal(ajoutees.length, 1);
  assert.deepEqual(extraites, ['s1']);
  assert.equal(M.enCoursDe(JULES), null);
});

test('une réunion sans rien de transcrit n\'entre pas dans le Cerveau', async () => {
  const id = M.demarrer(NORA, {}).reunion.id;
  const r = await M.terminer(id, {}, NORA, { C: { ajouterSource: () => { throw new Error('ne doit pas être appelé'); } } });
  assert.equal(r.ok, false);
  assert.equal(Records.get(M.REUNION, id).etat, 'vide');
  assert.ok(M.lister().length >= 2);
});
