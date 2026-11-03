// L'équipe (10 oct. 2026) : les rôles qui se cumulent, qui les change, l'invitation.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-equipe-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@klocka.test';
const { Records } = await import('./db.js');
const { listerEquipe, changerRole, inviterEquipe, rolesDe, fixerRoles } = await import('./equipe.js');
const { estMandataire } = await import('./mandataire-espace.js');

const jules = Records.create('User', { email: 'jules@klocka.test', role: 'admin', mot_de_passe: 'x' });
const nora = Records.create('User', { email: 'nora@klocka.test', full_name: 'Nora', role: 'admin', mot_de_passe: 'x' });
const paul = Records.create('User', { email: 'paul@kpartners.test', full_name: 'Paul', role: 'mandataire', mot_de_passe: 'x' });
Records.create('User', { email: 'client@test.local', full_name: 'Un client', role: 'user', mot_de_passe: 'x' });
Records.create('SecteurMandataire', { nom: 'Lyonnais', mandataire_email: 'paul@kpartners.test' });

test('la liste : admins et mandataires, jamais les clients ; le super admin marqué', () => {
  const e = listerEquipe();
  assert.deepEqual(e.admins.map((u) => u.email), ['jules@klocka.test', 'nora@klocka.test']);
  assert.ok(e.admins[0].super_admin && !e.admins[1].super_admin);
  assert.deepEqual(e.mandataires.map((u) => u.email), ['paul@kpartners.test']);
  assert.equal(e.mandataires[0].secteur.nom, 'Lyonnais');
  assert.ok(!JSON.stringify(e).includes('client@test.local'));
});

test('un admin devient aussi mandataire, puis ne l\'est plus ; un mandataire reçoit l\'admin et le garde ; un client devient mandataire', () => {
  assert.equal(changerRole(nora, 'paul@kpartners.test', { role: 'admin' }).code, 403, 'seul un super admin');
  assert.equal(changerRole(jules, 'jules@klocka.test', { role: 'user' }).code, 400, 'pas sur un super admin');
  let r = changerRole(jules, 'nora@klocka.test', { role: 'admin', aussi_mandataire: true });
  assert.deepEqual(r.user.roles, ['admin', 'mandataire']);
  assert.ok(estMandataire(Records.get('User', nora.id)));
  assert.equal(listerEquipe().mandataires.length, 2);
  r = changerRole(jules, 'nora@klocka.test', { role: 'admin', aussi_mandataire: false });
  assert.deepEqual(r.user.roles, ['admin']);
  r = changerRole(jules, 'paul@kpartners.test', { role: 'admin' });
  assert.deepEqual(r.user.roles, ['admin', 'mandataire'], 'il reste mandataire par défaut');
  assert.equal(listerEquipe().mandataires.find((u) => u.email === 'paul@kpartners.test').secteur.nom, 'Lyonnais');
  r = changerRole(jules, 'paul@kpartners.test', { role: 'mandataire' });
  assert.deepEqual(r.user.roles, ['mandataire']);
  assert.equal(Records.get('User', paul.id).aussi_mandataire, false);
  r = changerRole(jules, 'client@test.local', { role: 'mandataire' });
  assert.deepEqual(r.user.roles, ['mandataire']);
  assert.equal(Records.get('User', paul.id).role_modifie_par, 'jules@klocka.test');
});

test('l\'invitation : un compte neuf avec un lien, un compte actif qui change de rôle', () => {
  const r = inviterEquipe(jules, { email: 'Nouveau@KPartners.test', nom: 'Léa', role: 'mandataire', base: 'https://app.klocka.test/' });
  assert.ok(r.ok && /^https:\/\/app\.klocka\.test\/Bienvenue\?jeton=[0-9a-f]{48}$/.test(r.lien));
  const u = Records.findBy('User', 'email', 'nouveau@kpartners.test');
  assert.equal(u.role, 'mandataire');
  assert.equal(u.full_name, 'Léa');
  const r2 = inviterEquipe(jules, { email: 'client@test.local', role: 'admin', base: 'https://app.klocka.test' });
  assert.ok(r2.ok && r2.deja_actif && r2.lien === null);
  assert.deepEqual(rolesDe(Records.findBy('User', 'email', 'client@test.local')), ['admin', 'mandataire']);
  assert.equal(inviterEquipe(nora, { email: 'x@y.z', role: 'admin', base: '' }).code, 403);
  assert.equal(inviterEquipe(jules, { email: 'pas une adresse', role: 'admin', base: '' }).code, 400);
});

test('le tableau : un seul tableau, deux cases ; décocher les deux rend client ; le super admin coche mandataire sans perdre l\'admin', () => {
  const lea = Records.create('User', { email: 'lea@klocka.test', full_name: 'Léa', role: 'user', mot_de_passe: 'x' });
  assert.equal(fixerRoles(nora, 'lea@klocka.test', { admin: true }).code, 403, 'seul un super admin');
  let r = fixerRoles(jules, 'lea@klocka.test', { admin: true, mandataire: true });
  assert.deepEqual(r.user.roles, ['admin', 'mandataire']);
  assert.ok(listerEquipe().membres.some((u) => u.email === 'lea@klocka.test'), 'passée admin, elle entre dans le tableau');
  r = fixerRoles(jules, 'lea@klocka.test', { admin: false, mandataire: true });
  assert.deepEqual(r.user.roles, ['mandataire']);
  r = fixerRoles(jules, 'lea@klocka.test', { admin: true, mandataire: false });
  assert.deepEqual(r.user.roles, ['admin']);
  r = fixerRoles(jules, 'lea@klocka.test', {});
  assert.deepEqual(r.user.roles, []);
  assert.ok(!listerEquipe().membres.some((u) => u.email === 'lea@klocka.test'), 'redevenue cliente, elle quitte le tableau');
  assert.equal(Records.get('User', lea.id).role, 'user');
  r = fixerRoles(jules, 'jules@klocka.test', { admin: true, mandataire: true });
  assert.deepEqual(r.user.roles, ['admin', 'mandataire'], 'le super admin peut aussi être mandataire');
  assert.equal(fixerRoles(jules, 'jules@klocka.test', { mandataire: true }).code, 400, 'il ne perd jamais l\'admin');
  const membres = listerEquipe().membres.map((u) => u.email);
  assert.equal(membres[0], 'jules@klocka.test');
  assert.equal(new Set(membres).size, membres.length, 'un admin mandataire n\'apparaît qu\'une fois');
});
