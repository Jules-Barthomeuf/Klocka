// Les bureaux vides (4 nov. 2026, Jules) : ce qui est un bureau, ce qui n'en est pas un.
import test from 'node:test';
import assert from 'node:assert/strict';

test('les bureaux vides : ni vitrine, ni rez-de-chaussée, l’effectif dit', async () => {
  const B = await import('./bureaux-vides.js');
  const { bureauDe } = await import('./off-market/simple.js');
  assert.equal(B.CODES_BUREAU.includes('70.22Z'), true, 'le conseil reste un bureau');
  for (const vitrine of ['68.31Z', '64.19Z', '66.22Z', '78.20Z', '64.20Z']) assert.equal(B.CODES_BUREAU.includes(vitrine), false, vitrine);
  assert.equal(B.auRezDeChaussee('RDC'), true);
  assert.equal(B.auRezDeChaussee('Rez-de-chaussée gauche'), true);
  assert.equal(B.auRezDeChaussee('3EME ETAGE'), false);
  assert.equal(B.EFFECTIFS['01'], undefined, 'une ou deux personnes : pas des bureaux');
  assert.equal(B.EFFECTIFS['02'], '3 à 5 salariés');
  const [s] = bureauDe({ classe: 'bureau', demenagement: { ferme_le: '2026-06-01', effectif: '6 à 9 salariés', vers: { adresse: '4 AVENUE FOCH 69006 LYON' } } }, { maintenantMs: Date.parse('2026-11-04') });
  assert.match(s.texte, /^L'occupant \(6 à 9 salariés\) est parti au 4 AVENUE FOCH/);
});
