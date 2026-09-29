// La chronologie de l'onglet Bien (src/lib/chronologie-bien.js) : l'histoire
// du bien, puis ce qui attend le bail. Pas les étapes du projet avec Klocka.

import test from 'node:test';
import assert from 'node:assert/strict';
import { evenementsDuBien, libelleDate } from '../src/lib/chronologie-bien.js';

const AUJOURDHUI = new Date('2026-09-29T12:00:00Z');

test('le passé puis le futur, dans l\'ordre, avec les échéances triennales', () => {
  const ev = evenementsDuBien({
    type_construction: 'Immeuble de 1965',
    derniere_vente_annee: 2019, derniere_vente_prix: 350000,
    locataire_depuis: '2023-02-01', nom_locataire: 'Picard',
    bail_date_debut: '2021-03-01', bail_date_echeance: '2030-03-01',
    assemblees_generales: [{ annee: 2024, resolutions_votees: 'Ravalement\nAscenseur' }],
  }, null, AUJOURDHUI);
  assert.deepEqual(ev.map((e) => e.cle), ['construction', 'vente', 'bail-debut', 'locataire', 'ag-2024', 'triennale-6', 'bail-fin']);
  assert.equal(ev.find((e) => e.cle === 'vente').detail, '350 000 €');
  assert.equal(ev.find((e) => e.cle === 'ag-2024').detail, '2 résolutions votées');
  assert.equal(ev.find((e) => e.cle === 'triennale-6').iso, '2027-03-01');
  assert.ok(ev.filter((e) => e.futur).every((e) => e.alerte));
  assert.ok(!ev.some((e) => e.cle === 'triennale-3'), 'une échéance passée ne revient pas');
});

test('sans début de bail : un bail de 9 ans supposé, et dit', () => {
  const ev = evenementsDuBien({ bail_date_echeance: '2030-03-01', derniere_vente_annee: 2019 }, null, AUJOURDHUI);
  const t = ev.find((e) => e.cle === 'triennale-6');
  assert.equal(t.iso, '2027-03-01');
  assert.match(t.detail, /9 ans supposé/);
});

test('une cession du fonds sur place, une fois par date', () => {
  const c = { date: '2018-05-10', prix: 120000, activite: 'Boulangerie', sur_place: true };
  const ev = evenementsDuBien({ transactions_fonds: { transactions: [c, c, { ...c, date: '2015-01-01', sur_place: false }] } }, null, AUJOURDHUI);
  assert.deepEqual(ev.map((e) => e.detail), ['Boulangerie · 120 000 €']);
});

test('libelleDate : l\'année seule, ou la date en toutes lettres', () => {
  assert.equal(libelleDate({ anneeSeule: true, annee: 2019 }), '2019');
  assert.equal(libelleDate({ anneeSeule: false, iso: '2023-02-01' }), '1 févr. 2023');
});
