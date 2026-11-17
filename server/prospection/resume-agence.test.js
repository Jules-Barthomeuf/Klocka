// Le résumé IA de la carte d'appel (15 nov. 2026) : les faits seuls, gardé tant qu'ils ne changent pas.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-resume-agence-'));
const { Records } = await import('../db.js');
const R = await import('./resume-agence.js');

test('les faits disent la spécialité, les interlocuteurs et les appels, sans le standard ni le nombre d\'annonces', () => {
  const f = R.faitsDeLAgence(
    { nom: 'Giboire Entreprise', annonces: 14, annonces_commerce: 10, apollo_description: 'Immobilier d\'entreprise à Rennes' },
    { ville: 'Rennes', pertinence: { specialite: 'commerce', motifs: ['commerce ou entreprise'] }, contacts: [{ nom: 'Sophie Le Gall', fonction: 'Responsable commerce' }, { nom: 'Standard', standard: true }], appels: [{ le: '2026-11-02T10:00:00Z', issue: 'sans_reponse' }] },
  );
  assert.equal(f.specialite, 'commerce');
  assert.equal(f.annonces_commerce, undefined, 'plus le nombre d\'annonces (17 nov. 2026)');
  assert.equal(f.annonces, undefined);
  assert.deepEqual(f.interlocuteurs, ['Sophie Le Gall, Responsable commerce']);
  assert.equal(f.appels[0].issue, 'sans_reponse');
  const p = R.construirePrompt(f);
  assert.ok(p.includes('n\'invente rien'));
  assert.ok(p.includes('Sophie Le Gall'));
});

test('le résumé est gardé tant que les faits ne bougent pas, refait quand ils changent', async () => {
  const a = Records.create('AgenceProspect', { nom: 'Agence du Port', apollo_description: 'Commerce' });
  let n = 0;
  const lire = async () => { n += 1; return { texte: `Agence de commerce — résumé ${n}.` }; };
  const r1 = await R.resumeDeLAgence(a.id, { lire });
  assert.equal(r1.ok, true);
  assert.equal(r1.texte, 'Agence de commerce, résumé 1.', 'pas de tiret cadratin');
  const r2 = await R.resumeDeLAgence(a.id, { lire });
  assert.equal(r2.texte, r1.texte);
  assert.equal(n, 1, 'aucune nouvelle demande au modèle');
  Records.update('AgenceProspect', a.id, { apollo_description: 'Commerce et bureaux' });
  const r3 = await R.resumeDeLAgence(a.id, { lire });
  assert.equal(n, 2);
  assert.ok(r3.texte.includes('résumé 2'));
  assert.equal((await R.resumeDeLAgence('inconnue', { lire })).ok, false);
});
