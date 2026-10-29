import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-offres-styles-'));
const O = await import('./offres.js');

test('le design d’un élément de la lettre se garde, se fusionne et s’efface', () => {
  const a = O.fusionnerStyles({}, { 'bloc:objet': { taille: 14, gras: true }, 'zone:logo': { opacite: 50 } });
  assert.deepEqual(a['bloc:objet'], { taille: 14, gras: true });
  const b = O.fusionnerStyles(a, { 'bloc:objet': { taille: 12 }, 'zone:logo': null, 'x': 'pas un objet', 'y': { f: () => 1 } });
  assert.deepEqual(b['bloc:objet'], { taille: 12 }, 'le nouveau style remplace celui de l’élément');
  assert.equal(b['zone:logo'], undefined);
  assert.equal(b.x, undefined);
  assert.equal(b.y, undefined, 'rien d’autre que des nombres, textes et booléens');
});

test('la marque de la lettre : gardée sur elle, sinon K Partners pour un dossier de mandataire, sinon Klocka', async () => {
  const { Records } = await import('./db.js');
  Records.create('Deal', { deal_id: 'd-mand', origine: 'mandataire' });
  assert.equal(O.marqueDe({}), 'klocka');
  assert.equal(O.marqueDe({ deal_id: 'd-mand' }), 'kp');
  assert.equal(O.marqueDe({ marque: 'kp' }), 'kp');
  const l = O.creerLettre({ champs: {}, marque: 'kp' });
  assert.equal(O.marqueDe(Records.get('LettreIntention', l.id)), 'kp');
  const v = await O.lettreVierge({ marque: 'kp' });
  assert.equal(v.cadre.marque, 'kp');
});

test('la LOI K Partners ne nomme jamais Klocka', async () => {
  const { blocs, cadre } = await import('./ak/loi.js');
  const brut = { adresse_bien: '1 rue X, 69001 Lyon', prix: 200000, acquereur_nom: 'M. A', marque: 'kp', modele: 'classique', textes: {} };
  const tout = JSON.stringify([blocs(brut), cadre(brut), cadre({ ...brut, modele: 'menthe' })]);
  assert.doesNotMatch(tout, /klocka/i);
  assert.match(tout, /K Partners/);
  assert.match(JSON.stringify(blocs({ ...brut, marque: 'klocka' })), /KLOCKA/);
});
