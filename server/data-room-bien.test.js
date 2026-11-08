// La Data room d'un bien avant son dossier : la même que celle du dossier (6 nov. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-dataroom-'));
const { Records } = await import('./db.js');
const D = await import('./data-room-bien.js');
const user = { email: 'm@kpartners.fr', role: 'mandataire' };

test('les cases suivent le type ; une pièce garde sa case quand le type change ; un autre bien part de zéro', () => {
  const p = { biens: { pieces: [{ id: '1', nature: 'quittances', nom: 'q.pdf', url: '/uploads/q.pdf' }, { id: '2', nature: 'photos', nom: 'f.jpg', url: '/uploads/f.jpg' }, { id: '3', nature: 'mandat', nom: 'm.pdf', url: '/uploads/m.pdf' }] } };
  const murs = D.dataroomDeLaFiche(p, 'murs_commerce');
  assert.equal(murs.pieces.find((c) => c.cle === 'quittances').etat, 'recue');
  assert.equal(murs.dossier.photos.length, 1, 'les photos à part');
  assert.ok(!murs.pieces.some((c) => c.fichiers.some((f) => f.url === '/uploads/m.pdf')), 'le mandat reste un document du bien');
  const fonds = D.dataroomDeLaFiche(p, 'fonds_commerce');
  assert.ok(fonds.pieces.some((c) => c.cle === 'bilans'));
  assert.equal(fonds.pieces.find((c) => c.cle === 'quittances')?.fichiers.length, 1, 'les quittances déposées restent');
  assert.deepEqual(D.dataroomDeLaFiche({ biens: {} }, 'autre').pieces.map((c) => c.cle), ['autres']);
});

test('déposer, masquer, nommer une case : sur la fiche, comme dans le dossier', async () => {
  const p = Records.create('ProprietaireMandataire', { mandataire_email: user.email, commerce: 'Boulangerie', statut: 'rdv_pris', type_bien: 'fonds_commerce', biens: {} });
  assert.ok((await D.deposerDansCase(p.id, 'bilans', { filename: 'Bilan 2024.pdf', url: '/uploads/b24.pdf' }, user)).ok);
  const r = await D.deposerParNom(p.id, [{ filename: 'Liasse 2023.pdf', url: '/uploads/l23.pdf' }, { filename: 'note.txt', url: '/uploads/n.txt' }], user);
  assert.deepEqual(r.rangees.map((x) => x.categorie), ['bilans'], 'les liasses vont avec les bilans');
  assert.deepEqual(r.a_classer, ['note.txt']);
  assert.ok(D.masquerCase(p.id, 'licences', true, user).ok);
  assert.equal(D.masquerCase(p.id, 'bilans', true, user).ok, false, 'une case pleine ne se masque pas');
  const c = D.nouvelleCase(p.id, 'Agrément sanitaire', user);
  assert.ok(c.ok && c.cle.startsWith('perso-'));
  const v = D.vueDataroom(p.id, user);
  assert.ok(!v.pieces.some((x) => x.cle === 'licences'));
  assert.ok(v.pieces.some((x) => x.cle === c.cle));
  assert.equal(v.pieces.at(-1).cle, 'autres', 'la case « + » en dernier');
  assert.ok(D.retirerDeLaFiche(p.id, '/uploads/b24.pdf', user).ok);
  assert.equal(D.vueDataroom(p.id, { email: 'autre@x.fr', role: 'mandataire' }).ok, false, 'pas le bien d’un autre');
});

test('la location a sa liste : DPE et plans obligatoires, ni bail ni quittances ni bilans, quel que soit le type (6 nov. 2026)', async () => {
  const L = await import('../src/lib/data-room.js');
  for (const type of ['murs_commerce', 'fonds_commerce', 'bureaux', null]) {
    const cases = L.casesDuType(type, 'location');
    assert.deepEqual(cases.map((c) => c.cle), ['diagnostics', 'plans', 'titre', 'copropriete', 'taxe_fonciere', 'charges', 'conformite', 'autres']);
    assert.deepEqual(cases.filter((c) => c.requise).map((c) => c.cle), ['diagnostics', 'plans']);
  }
  assert.ok(L.casesDuType('murs_commerce').some((c) => c.cle === 'bail'), 'la vente garde ses cases');
  assert.ok(L.casesDuType('murs_commerce', 'vente').some((c) => c.cle === 'quittances'));
  assert.equal(L.caseDuNom('Bail commercial.pdf', 'murs_commerce', { biens: { transaction: 'location' } }), null, 'pas de case Bail en location');
  assert.equal(L.caseDuNom('Appel de charges T3.pdf', null, 'location'), 'charges', 'les charges ont leur case');
  assert.equal(L.caseDuNom('Rapport ERP.pdf', null, 'location'), 'conformite');
  assert.equal(L.caseDuNom('Rapport ERP.pdf', 'murs_commerce'), 'diagnostics', 'en vente, l’ERP reste aux diagnostics');
  const p = Records.create('ProprietaireMandataire', { mandataire_email: user.email, commerce: 'Local rue Neuve', statut: 'rdv_pris', type_bien: 'murs_commerce', biens: { transaction: 'location' } });
  const v = D.vueDataroom(p.id, user);
  assert.ok(!v.pieces.some((c) => ['bail', 'quittances'].includes(c.cle)));
  assert.ok(v.pieces.some((c) => c.cle === 'plans' && c.requise));
  const r = await D.deposerParNom(p.id, [{ filename: 'Plans du local.pdf', url: '/uploads/plans.pdf' }, { filename: 'Bail 2019.pdf', url: '/uploads/bail.pdf' }], user);
  assert.deepEqual(r.rangees.map((x) => x.categorie), ['plans']);
  assert.deepEqual(r.a_classer, ['Bail 2019.pdf']);
});
