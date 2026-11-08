// Le tableau des acquéreurs d'un bien en vente et le bon de visite signé à distance (7 nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-acquereurs-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const A = await import('./acquereurs-du-bien.js');
const V = await import('./visites-acquereur.js');

const MOI = { email: 'lucie@kpartners.fr', role: 'mandataire' };

test('un montant dit se lit en euros', () => {
  assert.equal(A.montantDit('600 k'), 600000);
  assert.equal(A.montantDit('1,2 M€'), 1200000);
  assert.equal(A.montantDit('580 000'), 580000);
  assert.equal(A.montantDit(''), null);
  assert.equal(A.patchDe({ statut: 'inconnu' }).error, 'Statut inconnu.');
});

test('le tableau : une ligne ajoutée, corrigée, sa visite planifiée, son offre la fait passer en Offre', async () => {
  const d = Records.create('DossierMandataire', { mandataire_email: MOI.email, bien: '(test) Brasserie', statut: 'go' });
  const m = Records.create('MiseEnMarche', { mandataire_email: MOI.email, bien: '(test) Brasserie', dossier_id: d.id, statut: 'preparation', voie: 'moi' });
  const a = await A.ajouterLigne(m.id, { nom: 'Paul Durand', telephone: '06 11 22 33 44', budget: '600 k', source: 'Leboncoin' }, MOI);
  assert.equal(a.ok, true);
  assert.equal(a.ligne.statut, 'contact');
  assert.equal(a.ligne.budget, 600000);
  assert.equal(Records.list('AcquereurMandataire').filter((x) => x.nom === 'Paul Durand').length, 1, 'le contact rejoint le carnet');
  const v = await A.planifierVisite(a.ligne.id, { quand: '2030-01-10T14:00:00Z' }, MOI);
  assert.equal(v.ok, true);
  const t = await A.tableauDe(m.id, MOI);
  const l = t.lignes.find((x) => x.id === a.ligne.id);
  // Une visite à venir est la prochaine action (8 nov. 2026) : le statut passe à Visite au bon signé.
  assert.equal(l.statut, 'contact');
  assert.match(l.prochaine, /^Visite à \d{2} h \d{2}$/);
  assert.equal(l.prochaine_le, '2030-01-10');
  assert.equal(l.visite.bon, 'a_signer');
  assert.equal(A.modifierLigne(a.ligne.id, { offre: '560 k' }, MOI).ligne.statut, 'offre');
  assert.equal(A.modifierLigne(a.ligne.id, { statut: 'qualifie' }, MOI).ligne.statut, 'qualifie', 'le statut se repose à la main');
  assert.equal(A.modifierLigne(a.ligne.id, { nom: 'Paul Durand-Roy' }, { email: 'autre@kpartners.fr', role: 'mandataire' }).ok, false, "pas la ligne d'un autre");

  // Le bon signé à distance : le lien, la page du visiteur, la signature et sa preuve.
  const lien = await V.lienDeSignature(v.visite.id, MOI);
  assert.equal(lien.ok, true);
  assert.match(lien.url, /\/SignerBon\?jeton=/);
  const jeton = new URL(lien.url).searchParams.get('jeton');
  const lu = await V.bonParJeton(jeton);
  assert.equal(lu.ok, true);
  assert.match(lu.bon.lignes.join(' '), /K Partners/);
  assert.equal((await V.signerParJeton(jeton, { nom: '', signature: 'data:image/png;base64,AAAA' })).ok, false);
  assert.equal((await V.signerParJeton(jeton, { nom: 'Paul Durand', signature: 'data:image/png;base64,AAAA' }, { ip: '1.2.3.4' })).ok, true);
  const signee = Records.get('VisiteAcquereur', v.visite.id);
  assert.equal(signee.bon.via, 'lien');
  assert.equal(signee.bon.ip, '1.2.3.4');
  assert.match(signee.bon.empreinte, /^[0-9a-f]{64}$/);
  assert.equal((await V.signerParJeton(jeton, { nom: 'X', signature: 'data:image/png;base64,AAAA' })).deja, true, 'une seule signature');
  assert.equal((await V.lienDeSignature(v.visite.id, MOI)).ok, false, 'plus de lien une fois signé');
  assert.equal((await V.bonParJeton('court')).ok, false);
});

test("l'assistant note un acquéreur sur le seul bien en vente, puis le met à jour", async () => {
  const user = { email: 'marc@kpartners.fr', role: 'mandataire' };
  const d = Records.create('DossierMandataire', { mandataire_email: user.email, bien: '(test) Pharmacie', statut: 'go' });
  Records.create('MiseEnMarche', { mandataire_email: user.email, bien: '(test) Pharmacie', dossier_id: d.id, statut: 'preparation', voie: 'moi' });
  const r = await A.noterAcquereur({ nom: 'Mme Leroy', budget: '450 k', statut: 'qualifie' }, user);
  assert.equal(r.ok, true);
  assert.equal(r.cree, true);
  const r2 = await A.noterAcquereur({ nom: 'mme leroy', offre: '430 k' }, user);
  assert.equal(r2.cree, false);
  assert.equal(r2.ligne.statut, 'offre');
});
