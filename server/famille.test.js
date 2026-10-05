// Les familles : chacun son lien et son mot de passe, un seul dossier, celui
// du titulaire. Ce qui est verrouillé ici : le membre voit le dossier du
// titulaire, n'y écrit que là, et ne peut pas se rattacher lui-même.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-famille-'));
const { Records } = await import('./db.js');
const F = await import('./famille.js');
const { visiblePar } = await import('./acces-entites.js');
const { retirerChampsProteges } = await import('./contexte.js');

const ADMIN = Records.create('User', { email: 'jules@klocka.immo', role: 'admin', full_name: 'Jules' });
const BASE = 'https://app.exemple';

test('inviter une famille : un lien par personne, la première est titulaire', () => {
  const r = F.inviterFamille({
    membres: [
      { full_name: 'Paul Martin', email: 'Paul@exemple.fr' },
      { full_name: 'Marie Martin', email: 'marie@exemple.fr' },
    ],
    admin: ADMIN,
    base: BASE,
  });
  assert.equal(r.ok, true, r.error);
  const [paul, marie] = r.resultats;
  assert.ok(paul.lien && marie.lien && paul.lien !== marie.lien, 'deux liens distincts');
  const m = Records.get('User', marie.user_id);
  assert.equal(m.est_compte_shadow, true);
  assert.equal(m.compte_maitre_email, 'paul@exemple.fr');
  assert.deepEqual(Records.get('User', paul.user_id).comptes_lies, ['marie@exemple.fr']);
});

test('le membre voit le dossier du titulaire, sous son nom, et y écrit', () => {
  const paul = Records.findBy('User', 'email', 'paul@exemple.fr');
  const marie = Records.findBy('User', 'email', 'marie@exemple.fr');
  Records.update('User', paul.id, { etape_actuelle: 3, projet_selectionne_id: 'p1' });

  const vue = F.vueDuCompte(Records.get('User', marie.id));
  assert.equal(vue.id, marie.id);
  assert.equal(vue.email, 'marie@exemple.fr');
  assert.equal(vue.full_name, 'Marie Martin');
  assert.equal(vue.etape_actuelle, 3);
  assert.equal(vue.projet_selectionne_id, 'p1');
  assert.deepEqual(vue.famille.prenoms, ['Marie', 'Paul']);
  assert.deepEqual(F.vueDuCompte(Records.get('User', paul.id)).famille.prenoms, ['Paul', 'Marie']);

  F.ecrireCompte(Records.get('User', marie.id), { rdv_strategique_le: '2026-10-05', full_name: 'Marie M.' });
  assert.equal(Records.get('User', paul.id).rdv_strategique_le, '2026-10-05', 'le dossier va chez le titulaire');
  assert.equal(Records.get('User', paul.id).full_name, 'Paul Martin', 'le nom reste à chacun');
  assert.equal(Records.get('User', marie.id).full_name, 'Marie M.');
});

test('les données : le membre voit celles du titulaire, pas l’inverse', () => {
  const paul = Records.findBy('User', 'email', 'paul@exemple.fr');
  const marie = Records.findBy('User', 'email', 'marie@exemple.fr');
  const projet = { id: 'p1', client_email: 'paul@exemple.fr' };
  assert.equal(visiblePar(marie, 'Project')(projet), true);
  assert.equal(visiblePar(marie, 'Strategy')({ client_email: 'PAUL@exemple.fr' }), true);
  assert.equal(visiblePar(paul, 'Project')({ id: 'p2', client_email: 'marie@exemple.fr' }), false);
  // Une remarque reste à qui l'a écrite.
  assert.equal(visiblePar(marie, 'Suggestion')({ client_email: 'paul@exemple.fr' }), false);
});

test('un client ne peut pas se rattacher lui-même au dossier d’un autre', () => {
  const patch = retirerChampsProteges({ est_compte_shadow: true, compte_maitre_email: 'paul@exemple.fr', comptes_lies: ['x'] });
  assert.deepEqual(patch, {});
});

test('lier deux comptes existants, changer de titulaire, délier', () => {
  const a = Records.create('User', { email: 'a@exemple.fr', role: 'user', full_name: 'Anne Durand', etape_actuelle: 2 });
  const b = Records.create('User', { email: 'b@exemple.fr', role: 'user', full_name: 'Bruno Durand', etape_actuelle: 4 });
  assert.equal(F.lier(b.id, [a.id]).ok, true);
  assert.equal(F.vueDuCompte(Records.get('User', a.id)).etape_actuelle, 4, 'les deux voient le compte choisi');

  assert.equal(F.changerTitulaire(a.id).ok, true);
  assert.equal(F.vueDuCompte(Records.get('User', b.id)).etape_actuelle, 2);
  assert.equal(Records.get('User', a.id).est_compte_shadow, false);
  assert.deepEqual(Records.get('User', a.id).comptes_lies, ['b@exemple.fr']);

  assert.equal(F.delier(b.id).ok, true);
  assert.equal(F.vueDuCompte(Records.get('User', b.id)).etape_actuelle, 4, 'il retrouve son dossier');
  assert.deepEqual(Records.get('User', a.id).comptes_lies, []);
  assert.equal(F.familleDe(Records.get('User', a.id)), null);
});

test('un compte de l’équipe ne rejoint pas une famille', () => {
  const r = F.inviterFamille({ membres: [{ email: 'c@exemple.fr' }, { email: 'jules@klocka.immo' }], admin: ADMIN, base: BASE });
  assert.equal(r.ok, false);
  assert.equal(Records.findBy('User', 'email', 'c@exemple.fr'), null, 'rien de créé avant le refus');
});

test('un compte déjà actif est rattaché sans nouveau lien', () => {
  const actif = Records.create('User', { email: 'd@exemple.fr', role: 'user', mot_de_passe: 'x', etape_actuelle: 1 });
  const r = F.inviterFamille({ membres: [{ email: 'e@exemple.fr', full_name: 'Eve' }, { email: 'd@exemple.fr' }], admin: ADMIN, base: BASE });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.resultats[1].lien, null);
  assert.equal(r.resultats[1].deja_actif, true);
  assert.equal(Records.get('User', actif.id).compte_maitre_email, 'e@exemple.fr');
  assert.equal(F.listerFamilles().some((f) => f.comptes.some((c) => c.email === 'd@exemple.fr')), true);
});
