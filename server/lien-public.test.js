// Le lien public d'un projet (25 nov. 2026) : une clé qu'on crée et qu'on coupe, sans les comptes ni les traces de l'équipe.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-lien-public-'));
const { Records } = await import('./db.js');
const L = await import('./lien-public.js');
const { functions } = await import('./functions.js');

test('un lien créé ouvre le projet sans compte ; coupé, il ne rouvre plus rien', async () => {
  const p = Records.create('Project', { titre: 'Murs Foch', client_emails: ['client@exemple.fr'], admin_principal: 'nora@klocka.immo', contexte_vente: 'Retraite.' });
  const r = L.creerLien(p.id, { email: 'nora@klocka.immo' });
  assert.equal(r.ok, true);
  assert.match(r.lien.cle, /^[\w-]{24}$/);
  assert.equal(L.creerLien(p.id).lien.cle, r.lien.cle, 'un seul lien en service par projet');
  assert.deepEqual(Object.keys(L.lienPourEcran(r.lien)).sort(), ['cle', 'cree_le']);

  const vu = await functions.getPublicProject({ cle: r.lien.cle });
  assert.equal(vu.success, true);
  assert.equal(vu.project.titre, 'Murs Foch');
  assert.equal(vu.project.contexte_vente, 'Retraite.');
  assert.equal(vu.project.client_emails, undefined, 'les comptes ne sortent pas');
  assert.equal(vu.project.admin_principal, undefined);

  L.couperLien(p.id, { email: 'nora@klocka.immo' });
  assert.equal((await functions.getPublicProject({ cle: r.lien.cle })).success, false);
  assert.equal(L.lienDuProjet(p.id), null);
  const nouveau = L.creerLien(p.id).lien.cle;
  assert.notEqual(nouveau, r.lien.cle, 'un nouveau lien a une nouvelle clé');
  assert.equal((await functions.getPublicProject({ cle: 'pas-une-cle' })).success, false);
});
