import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-foncier-local-'));
const { scoreRapprochement, alertesDe, PERSONNE_PHYSIQUE, SCORE_MIN, proprietaireDuLocal } = await import('./kfoncier-local.js');

const candidat = (nom, cp, ville) => ({ nom_raison_sociale: nom, siege: { code_postal: cp, libelle_commune: ville } });

test('le score : le nom sans les formes juridiques, et la commune', () => {
  assert.equal(scoreRapprochement('SCI LES OLIVIERS', '12 RUE X 06000 NICE', candidat('SCI LES OLIVIERS', '06000', 'Nice')), 1);
  assert.equal(scoreRapprochement('SCI LES OLIVIERS', '12 RUE X 06400 CANNES', candidat('LES OLIVIERS', '75008', 'Paris')), 0.8);
  assert.ok(scoreRapprochement('SCI LES OLIVIERS', '', candidat('SARL BOULANGERIE MARTIN', '06000', 'Nice')) < SCORE_MIN);
  assert.equal(scoreRapprochement('', '', candidat('X')), 0);
});

test('seules les annonces BODACC qui comptent font une alerte', () => {
  const ev = [{ type: 'procédure collective' }, { type: 'transfert de siège' }, { type: 'cession' }, { type: 'création' }];
  assert.deepEqual(alertesDe(ev).map((e) => e.type), ['procédure collective', 'cession']);
});

test("sans parcelle, une erreur claire ; sans personne morale, « personne physique, non identifiable »", async () => {
  assert.equal((await proprietaireDuLocal({ parcelle: null }, [])).ok, false);
  process.env.SOURCES_COUPEES = 'dvf,inpi_rne,bodacc';
  const r = await proprietaireDuLocal({ id_local: 'L-1', adresse: { code_insee: '06088' }, parcelle: { idu: '06088000KT0402', section: 'KT', numero: '0402' } }, [{ idu: '06088000KT0402', proprietaires: [] }]);
  delete process.env.SOURCES_COUPEES;
  assert.equal(r.ok, true);
  assert.deepEqual(r.constat, PERSONNE_PHYSIQUE);
  assert.equal(r.derniere_mutation, null);
});
