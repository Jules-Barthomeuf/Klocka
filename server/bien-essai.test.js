import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-essai-'));
const { Records } = await import('./db.js');
const E = await import('./bien-essai.js');
const { regrouperBiens, statutDuBien, etapeDuBien } = await import('../src/lib/biens-mandataire.js');

const user = { email: 'jules.b@klocka.immo', role: 'admin', full_name: 'Jules' };
const lePeu = (email) => regrouperBiens({
  proprietaires: Records.list('ProprietaireMandataire').filter((x) => x.mandataire_email === email),
  estimations: Records.list('EstimationMandataire').filter((x) => x.mandataire_email === email),
  mandats: Records.list('MandatMandataire').filter((x) => x.mandataire_email === email),
  dossiers: Records.list('DossierMandataire').filter((x) => x.mandataire_email === email),
  marches: Records.list('MiseEnMarche').filter((x) => x.mandataire_email === email),
});

test('chaque scénario pose un seul bien d’essai, à la bonne étape, sans rien laisser d’avant', async () => {
  const attendu = { rdv: 1, avis_redige: 2, accord: 3, mandat_signe: 4, en_vente: 4, teaser_valide: 5, klocka_offre: 5, acte: 6 };
  for (const [cle, etape] of Object.entries(attendu)) {
    const r = await E.appliquerScenario(cle, user);
    assert.equal(r.ok, true, cle);
    const biens = lePeu(user.email);
    assert.equal(biens.length, 1, `${cle} : un seul bien`);
    assert.equal(etapeDuBien(biens[0]), etape, `${cle} : étape ${etape}`);
  }
  await E.appliquerScenario('refus_prix', user);
  assert.equal(statutDuBien(lePeu(user.email)[0]), 'En pause');
  await E.appliquerScenario('concurrent', user);
  assert.match(statutDuBien(lePeu(user.email)[0]), /Perdu · concurrent/);
  assert.ok(E.effacerEssai(user) > 0);
  assert.equal(lePeu(user.email).length, 0);
  assert.equal(Records.list('Notification').filter((n) => n.pour && n.pour !== user.email).length, 0, 'personne d’autre n’est prévenu');
});
