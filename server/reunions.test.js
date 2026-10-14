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

test('les redites d\'un même passage (deux enregistrements à la fois) sont écartées, la version la plus complète reste', () => {
  const a = "Il y a des murs, mais ça, c'est 1,9 million. Ce sont des fonds de tarte qu'il n'arrive pas à faire porter. Oui, mais il essaye. Non, je n'ai pas encore regardé.";
  const b = `${a} Coralie, toi aussi ? Oui, je vais y aller toute seule.`;
  const c = 'Tu peux lui proposer demain à 15h. Ah oui, tu as ta visite vendredi après-midi.';
  assert.ok(M.ressemblance(a, b) >= M.SEUIL_REDITE);
  assert.ok(M.ressemblance(a, c) < M.SEUIL_REDITE);
  assert.equal(M.texteDe([{ i: 0, texte: a }, { i: 1, texte: b }, { i: 2, texte: a }, { i: 3, texte: c }]), `${b}\n${c}`);
});

test('renvoyer une réunion déjà envoyée : le texte relu entre comme une nouvelle source, une seule fois par renvoi', async () => {
  const ajoutees = [];
  const C = { ajouterSource: (s) => { const src = { id: `r${ajoutees.length + 1}`, ...s }; ajoutees.push(src); return { ok: true, source: src }; }, extraire: async () => {} };
  const id = M.demarrer(JULES, { titre: 'Réunion longue' }).reunion.id;
  M.ajouterMorceau(id, 0, 'On présente Mom Café aux investisseurs de Bordeaux, la renta est bonne.', JULES);
  M.ajouterMorceau(id, 1, 'On présente Mom Café aux investisseurs de Bordeaux, la renta est bonne, vraiment.', JULES);
  await M.terminer(id, {}, JULES, { C });
  assert.equal(ajoutees.length, 1);
  assert.equal(ajoutees[0].contenu, 'On présente Mom Café aux investisseurs de Bordeaux, la renta est bonne, vraiment.', 'la redite est écartée dès l\'envoi');
  const r = await M.renvoyer(id, { C });
  assert.equal(r.ok, true);
  assert.equal(ajoutees.length, 2);
  assert.equal(ajoutees[1].cle, `reunion-${id}-v2-1`);
  assert.match(ajoutees[1].titre, /\(relue\)$/);
  assert.equal(r.reunion.sources.length, 2);
  assert.equal((await M.renvoyer('inconnue', { C })).ok, false);
});
