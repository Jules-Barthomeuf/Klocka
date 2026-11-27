// La passation avant une absence (27 nov. 2026, Jules, sur le brief de Nora à Maxime du 30 oct.).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-passation-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('../db.js');
const M = await import('./modele.js');
const P = await import('./passation.js');
const { cadreDemande } = await import('../ak/cadre-demande.js');

const nora = { email: 'nora.l@klocka.immo', role: 'admin' };
const maxime = { email: 'maxime.p@klocka.immo', role: 'admin' };
const depart = new Date('2026-10-30T17:00:00Z');

test("préparer, passer à Maxime, revenir : ses fiches, ses actions, ses ajouts gardés, ce qui a bougé", () => {
  Records.create('Deal', { deal_id: 'd-taster', nom: 'Taster Bordeaux', statut: 'preanalyse', lots: [] });
  const taster = M.fiche('deal:d-taster', { genre: 'bien', nom: 'Taster Bordeaux' });
  const pitiot = M.fiche('twenty:clients:t-pitiot', { genre: 'client', nom: 'Tony Pitiot' });
  Records.create('EntreeDossier', { fiche_cle: taster.cle, genre: 'evenement', texte: "L'agent a transmis les documents.", par: nora.email, le: '2026-10-29T10:00:00Z' });
  const loi = Records.create('ActionDossier', { titre: 'Revérifier la LOI avant de la donner à Paul', genre: 'tache', responsable: nora.email, statut: 'ouverte', fiches: [pitiot.cle], contexte: [], cree_le: '2026-10-30T09:00:00Z' });
  const autre = Records.create('ActionDossier', { titre: "Celle d'un autre", genre: 'tache', responsable: 'coralie.g@klocka.immo', statut: 'ouverte', fiches: [taster.cle], contexte: [] });

  const p = P.preparer(nora, { maintenant: depart });
  assert.equal(p.ok, true);
  assert.deepEqual(p.fiches.map((f) => f.nom), ['Tony Pitiot', 'Taster Bordeaux'], 'les fiches à actions d\'abord');
  assert.deepEqual(p.fiches[0].actions.map((a) => a.titre), ['Revérifier la LOI avant de la donner à Paul']);
  assert.equal(p.fiches[1].actions.length, 0, "l'action d'une autre ne se passe pas");

  assert.equal(P.passer(nora, { vers: 'Nora' }, { maintenant: depart }).ok, false, 'pas à soi');
  const r = P.passer(nora, {
    vers: 'Maxime', du: '2026-11-02', au: '2026-11-09', toutes: true,
    ajouts: [{ fiche: 'Taster', texte: "Selon l'agent, il faudrait qu'il parte entre 280 et 300 k." }],
    nouvelles: [{ titre: 'Créer le dossier et le Drive du Taster, puis lancer l\'analyse', fiche: 'Taster Bordeaux' }],
  }, { maintenant: depart });
  assert.equal(r.ok, true);
  assert.equal(r.vers, 'Maxime');
  assert.equal(Records.get('ActionDossier', loi.id).responsable, 'maxime.p@klocka.immo');
  assert.match(Records.get('ActionDossier', loi.id).contexte.at(-1), /^Passée par Nora \(absence du 2026-11-02 au 2026-11-09\)$/);
  assert.equal(Records.get('ActionDossier', autre.id).responsable, 'coralie.g@klocka.immo');
  assert.equal(r.actions_creees.length, 1);
  assert.equal(M.mesActions(maxime).length, 2, "les deux arrivent dans « À faire » de Maxime");
  const ajout = Records.filter('EntreeDossier', { fiche_cle: taster.cle }).find((e) => e.source === 'passation');
  assert.equal(ajout.texte, "Selon l'agent, il faudrait qu'il parte entre 280 et 300 k.");

  // Pendant l'absence, Maxime avance.
  M.changerAction(loi.id, { statut: 'faite' }, maxime, { maintenant: () => new Date('2026-11-03T10:00:00Z') });
  Records.create('EntreeDossier', { fiche_cle: taster.cle, genre: 'evenement', texte: 'Dossier créé et analyse lancée.', par: maxime.email, le: '2026-11-04T10:00:00Z' });
  const ret = P.retour(nora, { maintenant: new Date('2026-11-10T08:00:00Z') });
  assert.equal(ret.ok, true);
  assert.equal(ret.vers, 'Maxime');
  assert.ok(ret.fiches_qui_ont_bouge.find((f) => f.nom === 'Taster Bordeaux').lignes.some((l) => l.texte === 'Dossier créé et analyse lancée.'));
  assert.deepEqual(ret.actions_faites.map((a) => a.titre), ['Revérifier la LOI avant de la donner à Paul']);
  assert.equal(ret.actions_ouvertes.length, 1);
});

test('le raccourci « Préparer ma passation » donne sa consigne au chat', () => {
  assert.match(cadreDemande({ competence: 'geste:passation' }), /RACCOURCI « Préparer ma passation »[\s\S]*preparer_passation[\s\S]*« ok »[\s\S]*passer_a/);
});
