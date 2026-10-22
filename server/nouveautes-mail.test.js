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

test('par défaut (22 oct.) : plus de nouveautés dans le mail ; un matin sans relance ni dossier, rien ne part', async () => {
  const envoyes = [];
  const envoyer = async (cle, { a }) => { envoyes.push(a); return { ok: true }; };
  Records.create('User', { email: 'coralie.t@klocka.immo', role: 'admin' });
  const r = await M.envoyerSiNouveau({ maintenant: new Date('2026-10-19T07:00:00Z'), envoyer, relances: async () => [], dossiers: async () => [] });
  assert.equal(r.envoye, 0);
  assert.equal(r.raison, 'rien à dire');
  assert.deepEqual(envoyes, []);
  const { Meta } = await import('./db.js');
  Meta.set('nouveautes:mail:dernier_jour:passe', '');
});

test('envoyé une fois : le lendemain, rien ne repart', async () => {
  process.env.NOUVEAUTES_DANS_LE_MAIL = 'true';
  Records.create('User', { email: 'nora.l@klocka.immo', role: 'admin' });
  Records.create('User', { email: 'maxime.p@klocka.immo', role: 'admin' });
  const envoyes = [];
  const envoyer = async (cle, { a, vars }) => { envoyes.push([cle, a, vars.objet]); return { ok: true }; };
  const vide = { relances: async () => [], dossiers: async () => [] };
  const r = await M.envoyerSiNouveau({ maintenant: new Date('2026-10-19T07:00:00Z'), envoyer, ...vide });
  assert.equal(r.envoye, 3);
  assert.equal(envoyes[0][0], 'ma_journee');
  assert.equal((await M.envoyerSiNouveau({ maintenant: new Date('2026-10-19T09:00:00Z'), envoyer, ...vide })).envoye, 0);
  const { Meta } = await import('./db.js');
  Meta.set('nouveautes:mail:dernier_jour', '');
  Meta.set('nouveautes:mail:dernier_jour:passe', '');
  Meta.set('nouveautes:mail:dernier_jour:partis', '');
});

test('ni samedi ni dimanche ; le lundi reprend le vendredi et le week-end', async () => {
  const { Meta } = await import('./db.js');
  assert.equal(M.ouvre(new Date('2026-10-17T08:00:00Z')), false, 'samedi');
  assert.equal(M.ouvre(new Date('2026-10-18T08:00:00Z')), false, 'dimanche');
  assert.equal(M.ouvre(new Date('2026-10-19T08:00:00Z')), true, 'lundi');
  Meta.set('nouveautes:mail:dernier_jour', '2026-10-15');
  const envoyer = async () => ({ ok: true });
  const vide = { relances: async () => [], dossiers: async () => [] };
  assert.equal((await M.envoyerSiNouveau({ maintenant: new Date('2026-10-17T09:00:00Z'), envoyer, ...vide })).raison, 'week-end');
  const lundi = await M.envoyerSiNouveau({ maintenant: new Date('2026-10-20T07:00:00Z'), envoyer, ...vide });
  assert.ok(lundi.journees.includes('2026-10-16'), 'le vendredi part le lundi');
  delete process.env.NOUVEAUTES_DANS_LE_MAIL;
});

test('Ma journée : les trois parties, seulement celles qui ont quelque chose à dire', async () => {
  const { classer } = await import('../src/lib/dossiers-architecture.js');
  const lignes = [{ agent_id: 'a1', nom: 'Marc Agent', agence: 'Agence Test', motif: 'point_mensuel' }, { agent_id: 'a2', nom: 'Sans Maître', motif: 'retenter' }, { agent_id: 'a3', nom: 'À Paul', motif: 'retenu' }];
  const proprio = (id) => ({ a1: 'nora@klocka.immo', a3: 'paul@klocka.immo' })[id] || null;
  const r = M.relancesDe('Nora@klocka.immo', lignes, proprio);
  assert.deepEqual(r.miennes.map((l) => l.nom), ['Marc Agent']);
  assert.equal(r.sansProprietaire, 1);
  const dossiers = [
    { deal_id: 'd1', titre: '5 rue Hoche', statut: 'documents_recus', responsables: ['Nora'] },
    { deal_id: 'd2', titre: '3 rue Thouron', statut: 'documents_demandes', responsables: ['Nora'] },
    { deal_id: 'd3', titre: 'Chez Paul', statut: 'documents_recus', responsables: ['Paul'] },
  ];
  const d = M.dossiersAFaire('nora@klocka.immo', dossiers, classer);
  assert.deepEqual(d.toi.map((x) => x.titre), ['5 rue Hoche']);
  assert.equal(d.tiers, 1);
  const v = M.contenuJournee({ journees: [J[1]], relances: r, dossiers: d, prenom: 'Nora', aujourdhui: '2026-10-19' });
  assert.match(v.titre, /Bonjour Nora, votre journée/);
  assert.match(v.contenu, /\*\*NOUVEAU SUR KLOCKA\*\*/);
  assert.match(v.contenu, /\*\*RELANCES À FAIRE AUJOURD'HUI\*\* · 1\n\n\*\*Marc Agent\*\* \(Agence Test\) · point mensuel/);
  assert.match(v.contenu, /1 relance sans propriétaire/);
  assert.match(v.contenu, /\*\*À FAIRE DANS DOSSIERS\*\* · 1\n\n\*\*5 rue Hoche\*\* · Documents reçus, à lire/);
  assert.match(v.contenu, /1 dossier attend une réponse d'un tiers/);
  assert.match(v.objet, /lundi 19 octobre : 2 nouveautés, 1 relance, 1 dossier/);
  const sansNouveaute = M.contenuJournee({ journees: [], relances: { miennes: [], sansProprietaire: 0 }, dossiers: { toi: [], tiers: 0 }, aujourdhui: '2026-10-19' });
  assert.equal(sansNouveaute, null, 'rien à dire : rien ne part');
  const seulementRelances = M.contenuJournee({ journees: [], relances: r, dossiers: { toi: [], tiers: 0 }, aujourdhui: '2026-10-19' });
  assert.ok(!/NOUVEAU SUR KLOCKA|À FAIRE DANS DOSSIERS/.test(seulementRelances.contenu));
});
