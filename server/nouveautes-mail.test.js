// Le mail des nouveautés : quelles journées, quel contenu, à qui, une fois.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-nouveautes-mail-'));
const M = await import('./nouveautes-mail.js');
const { Records } = await import('./db.js');

const J = [
  { jour: '2026-10-14', items: [{ titre: 'A', texte: 'La première nouveauté, assez longue.' }] },
  { jour: '2026-10-15', items: [{ titre: 'B', texte: 'La deuxième nouveauté, assez longue.' }, { titre: 'C', texte: 'Et une troisième, assez longue.' }] },
  { jour: '2026-10-16', items: [{ titre: 'D', texte: 'Celle d’aujourd’hui part demain.' }] },
];

test('les journées d’avant aujourd’hui, pas encore envoyées, dans l’ordre', () => {
  assert.deepEqual(M.journeesAEnvoyer(null, '2026-10-16', J).map((j) => j.jour), ['2026-10-14', '2026-10-15']);
  assert.deepEqual(M.journeesAEnvoyer('2026-10-14', '2026-10-16', J).map((j) => j.jour), ['2026-10-15']);
  assert.deepEqual(M.journeesAEnvoyer('2026-10-15', '2026-10-16', J), []);
  assert.deepEqual(M.journeesAEnvoyer(null, '2026-10-30', J), [], 'plus d’une semaine : rien');
});

test('le contenu : une ligne par nouveauté, l’objet compte', () => {
  const v = M.contenuMail([J[1]], { lien: 'https://app.klocka.immo/TableauDeBord' });
  assert.match(v.objet, /^Klocka : 2 nouveautés de jeudi 15 octobre$/);
  assert.equal(v.liste, '**B** · La deuxième nouveauté, assez longue.\n\n**C** · Et une troisième, assez longue.');
  assert.match(M.contenuMail(J.slice(0, 2)).objet, /3 nouveautés depuis mercredi 14 octobre/);
});

test('l’équipe seulement, sans les comptes de test', () => {
  const d = M.destinataires([
    { email: 'Nora.L@klocka.immo', role: 'admin' }, { email: 'testeur@klocka.local', role: 'admin' }, { email: 'admin.stress@test.local', role: 'admin' },
    { email: 'client@gmail.com', role: 'user' }, { email: 'mandataire@kpartners.fr', role: 'mandataire' },
  ]);
  assert.deepEqual(d, ['nora.l@klocka.immo']);
});

test('envoyé une fois : le lendemain, rien ne repart', async () => {
  Records.create('User', { email: 'nora.l@klocka.immo', role: 'admin' });
  Records.create('User', { email: 'maxime.p@klocka.immo', role: 'admin' });
  const envoyes = [];
  const envoyer = async (cle, { a, vars }) => { envoyes.push([cle, a, vars.objet]); return { ok: true }; };
  const r = await M.envoyerSiNouveau({ maintenant: new Date('2026-10-19T07:00:00Z'), envoyer });
  assert.equal(r.envoye, 2);
  assert.equal(envoyes[0][0], 'nouveautes_du_jour');
  assert.equal((await M.envoyerSiNouveau({ maintenant: new Date('2026-10-19T09:00:00Z'), envoyer })).envoye, 0);
  const { Meta } = await import('./db.js');
  Meta.set('nouveautes:mail:dernier_jour', '');
});

test('ni samedi ni dimanche ; le lundi reprend le vendredi et le week-end', async () => {
  const { Meta } = await import('./db.js');
  assert.equal(M.ouvre(new Date('2026-10-17T08:00:00Z')), false, 'samedi');
  assert.equal(M.ouvre(new Date('2026-10-18T08:00:00Z')), false, 'dimanche');
  assert.equal(M.ouvre(new Date('2026-10-19T08:00:00Z')), true, 'lundi');
  Meta.set('nouveautes:mail:dernier_jour', '2026-10-15');
  const envoyer = async () => ({ ok: true });
  assert.equal((await M.envoyerSiNouveau({ maintenant: new Date('2026-10-17T09:00:00Z'), envoyer })).raison, 'week-end');
  const lundi = await M.envoyerSiNouveau({ maintenant: new Date('2026-10-19T07:00:00Z'), envoyer });
  assert.ok(lundi.journees.includes('2026-10-16'), 'le vendredi part le lundi');
});
