import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-bon-visite-'));
const { Records } = await import('./db.js');
const V = await import('./visites-acquereur.js');

const MOI = { email: 'bon@kpartners.fr', role: 'mandataire' };
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';

test("le bon signé passe le contact en Visite, puis « envoie le bon de visite » prépare le mail (8 nov. 2026)", async () => {
  const m = Records.create('MiseEnMarche', { mandataire_email: MOI.email, bien: 'Pressing du Port' });
  const a = Records.create('AcquereurMandataire', { mandataire_email: MOI.email, nom: 'Sophie Martin', email: 'sophie@exemple.fr' });
  const x = Records.create('PisteAcquereur', { mandataire_email: MOI.email, marche_id: m.id, acquereur_id: a.id, nom: 'Sophie Martin', statut: 'contact', prochaine: 'Visite à 15 h 00', prochaine_le: '2026-11-12' });
  const v = Records.create('VisiteAcquereur', { mandataire_email: MOI.email, quand: '2026-11-12T14:00:00.000Z', acquereur: { acquereur_id: a.id, nom: 'Sophie Martin', email: 'sophie@exemple.fr' }, bien: { titre: 'Pressing du Port', marche_id: m.id, cles: [`marche:${m.id}`] } });
  // Pas encore signé : rien à envoyer.
  assert.equal((await V.executerOutilVisite('envoyer_bon_visite', { acquereur: 'Sophie Martin' }, MOI)).ok, false);
  assert.equal(V.signerBon(v.id, { nom: 'Sophie Martin', signature: SIGNATURE }, MOI).ok, true);
  const apres = Records.get('PisteAcquereur', x.id);
  assert.equal(apres.statut, 'visite', 'le bon signé fait la visite');
  assert.match(apres.prochaine, /Envoyer le bon de visite/);
  const r = await V.executerOutilVisite('envoyer_bon_visite', { acquereur: 'Sophie Martin' }, MOI);
  assert.equal(r.ok, true);
  assert.equal(r.brouillon.destinataire, 'sophie@exemple.fr');
  assert.match(r.brouillon.corps, /SignerBon\?jeton=/);
  // Le lien montre le bon signé et sa signature.
  const jeton = Records.get('VisiteAcquereur', v.id).lien_bon.jeton;
  const page = await V.bonParJeton(jeton);
  assert.equal(page.ok, true);
  assert.ok(page.signe_le);
  assert.equal(page.signature, SIGNATURE);
});
