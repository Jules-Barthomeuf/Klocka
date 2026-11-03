// La relecture de l'annuaire (3 nov. 2026) : qui relire, ce qu'elle ajoute, et la reprise après une coupure.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_TEST_CONTEXT ||= '1';
const { Records } = await import('./db.js');
const R = await import('./annuaire-relecture.js');

test('qui relire : un SIREN, un dirigeant de 50 à 70 ans, pas encore relu', () => {
  const g = (t) => JSON.stringify([{ nom: 'A', tranche_age: t }]);
  assert.equal(R.aRelire({ 'exploitant.siren': '123456789', 'exploitant.gerants': g('50-70') }), true);
  assert.equal(R.aRelire({ 'exploitant.siren': '123456789', 'exploitant.gerants': g('70+') }), false, 'déjà sûr');
  assert.equal(R.aRelire({ 'exploitant.siren': '123456789', 'exploitant.gerants': g('50-70'), 'exploitant.relu_annuaire_le': '2026-11-04' }), false);
  assert.equal(R.aRelire({ 'exploitant.siren': null, 'exploitant.gerants': g('50-70') }), false);
});

test('la relecture ajoute « plus de 60 ans » et les comptes, jamais l’année', () => {
  const c = R.completer({ siren: '1', gerants: [{ nom: 'Jean Martin', tranche_age: '50-70' }] }, { gerants: [{ nom: 'JEAN  MARTIN', plus_de_60: true }], comptes: { 2023: { ca: 1 }, 2024: { ca: 2 } }, comptes_deposes: true, derniers_comptes: { ca: 2 } }, '2026-11-04T02:00:00Z');
  assert.equal(c.gerants[0].plus_de_60, true);
  assert.equal(c.gerants[0].annee_naissance, undefined);
  assert.deepEqual(Object.keys(c.comptes), ['2023', '2024']);
  assert.equal(c.relu_annuaire_le, '2026-11-04T02:00:00Z');
});

test('elle reprend là où elle s’est arrêtée', async () => {
  const base = String(100000000 + Math.floor(Math.random() * 899999990)).slice(0, 8);
  const ids = [1, 2, 3].map((i) => Records.create('CommerceSimple', { ville_id: 'test-relecture', exploitant: { siren: `${base}${i}`, gerants: [{ nom: `G${i}`, tranche_age: '50-70' }] } }).id);
  const appels = [];
  const annuaire = { refusRecent: () => false, societe: async ({ siren }) => { appels.push(siren); return { gerants: [{ nom: `G${siren.slice(-1)}`, plus_de_60: true }] }; } };
  const relus = () => ids.filter((id) => Records.get('CommerceSimple', id).exploitant.relu_annuaire_le).length;
  const miens = () => appels.filter((x) => ids.some((id) => Records.get('CommerceSimple', id).exploitant.siren === x));
  // Coupée après un premier commerce, comme un redémarrage.
  await R.relire({ annuaire, filtre: (l) => ids.includes(l.id), entreAppels: 0, entreLots: 0, arreter: () => relus() >= 1 });
  assert.equal(relus(), 1);
  await R.relire({ annuaire, filtre: (l) => ids.includes(l.id), entreAppels: 0, entreLots: 0, arreter: () => relus() === 3 });
  assert.equal(relus(), 3);
  assert.equal(new Set(miens()).size, miens().length, 'aucun commerce relu deux fois');
  assert.equal(Records.get('CommerceSimple', ids[2]).exploitant.gerants[0].plus_de_60, true);
});
