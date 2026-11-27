// Ce que Jules a fait sur une fiche ne bouge plus sous un import (27 nov. 2026, Jules : « juste rajoute, ne modifie rien ;
// sinon je dois tout refaire, les photos… »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fiche-a-la-main-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('../db.js');
const M = await import('./modele.js');
const { proposer } = await import('./ranger.js');

const jules = { email: 'jules.b@klocka.immo', role: 'admin' };
const maintenant = new Date('2026-11-27T10:00:00Z');
const source = { genre: 'appel', de: 'Nora', le: '2026-11-26T10:00:00Z', lieu: 'appel avec Laurent Aliaga' };
const lu = (resume) => async () => ({
  nature: 'note', titre: 'Appel', actions: [], questions: [], mentions: [],
  fiches: [{ lien: 'L1', elements: [{ genre: 'maj', texte: 'Il a deux murs à Montpellier en exclusivité.' }], resume, comment_parler: 'Direct, pressé.', etape: 'Relation', etat: 'actif' }],
});

async function importer(cle, nom, resume) {
  const n = await proposer({ texte: 'Appel avec Laurent', liens: [{ cle, genre: 'agent', nom }], source }, jules, { maintenant, lire: lu(resume) });
  return M.rangerNote(Records.get('NoteDossier', n.note_id), {}, jules);
}

test('une fiche relue, ou travaillée à la main, ne reçoit que des lignes ; son résumé, son étape et sa photo restent', async () => {
  const a = Records.create('AgentImmo', { nom: 'Laurent Aliaga', agence: 'Agence du Midi', ville: 'Montpellier' });
  const cle = `agent:${a.id}`;
  const f = M.fiche(cle, { genre: 'agent', nom: 'Laurent Aliaga' });
  Records.update('FicheDossier', f.id, { resume: 'Écrit par Jules : fiable, envoie des fiches propres.', comment_parler: 'Le tutoyer.', etape: 'Partenaire', relue_le: '2026-11-25T10:00:00Z' });
  Records.create('PhotoFiche', { cle, url: '/uploads/laurent.jpg', source: 'importee', par: 'jules.b@klocka.immo', le: '2026-11-25T10:00:00Z', ordre: 0 });

  const r = await importer(cle, 'Laurent Aliaga', 'Résumé refait par la lecture des appels.');
  assert.equal(r.ok, true);
  const apres = Records.findBy('FicheDossier', 'cle', cle);
  assert.equal(apres.resume, 'Écrit par Jules : fiable, envoie des fiches propres.');
  assert.equal(apres.comment_parler, 'Le tutoyer.');
  assert.equal(apres.etape, 'Partenaire');
  assert.equal(Records.filter('PhotoFiche', { cle })[0].url, '/uploads/laurent.jpg');
  assert.deepEqual(Records.filter('EntreeDossier', { fiche_cle: cle }).map((e) => e.texte), ['Il a deux murs à Montpellier en exclusivité.']);
  assert.equal(apres.a_relire, true, 'la ligne ajoutée se relit');
});

test("une fiche que seul l'import a remplie se met encore à jour", async () => {
  const a = Records.create('AgentImmo', { nom: 'Jean Bozec', agence: 'Bozec Immo', ville: 'Brest' });
  const cle = `agent:${a.id}`;
  const f = M.fiche(cle, { genre: 'agent', nom: 'Jean Bozec' });
  Records.update('FicheDossier', f.id, { resume: 'Agent appelé le 3 nov.' });
  await importer(cle, 'Jean Bozec', 'Jean Bozec, Brest : deux murs en exclusivité.');
  assert.equal(Records.findBy('FicheDossier', 'cle', cle).resume, 'Jean Bozec, Brest : deux murs en exclusivité.');
});

test('une note tapée dans l\'onglet Notes rend la fiche « à la main »', () => {
  const a = Records.create('AgentImmo', { nom: 'Étienne Merel', agence: 'Merel', ville: 'Toulouse' });
  const cle = `agent:${a.id}`;
  M.fiche(cle, { genre: 'agent', nom: 'Étienne Merel' });
  assert.equal(M.aLaMain(Records.findBy('FicheDossier', 'cle', cle)), false);
  M.noterSurLaFiche(cle, 'Regarde le pied d\'immeuble pour nous.', jules);
  assert.equal(M.aLaMain(Records.findBy('FicheDossier', 'cle', cle)), true);
});
