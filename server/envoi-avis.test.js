// L'avis part de la plateforme, de la boîte Gmail du mandataire, PDF joint (1er nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-envoi-avis-'));
const { Records } = await import('./db.js');
const R = await import('./restitution-avis.js');

const lea = { email: 'lea@kpartners.fr', role: 'mandataire' };
const pdf = path.join(process.env.KLOCKA_DATA_DIR, 'avis.pdf');
fs.writeFileSync(pdf, '%PDF-1.4 essai');
const exporter = async () => ({ ok: true, fichier: pdf, nom: 'Avis de valeur.pdf' });

test('sans boîte, rien ne part ; avec, le PDF est joint et l’avis passe en Envoyé', async () => {
  const e = Records.create('EstimationMandataire', { mandataire_email: lea.email, statut: 'prete', avis: { chiffres: {} } });
  const mail = { a: 'proprio@exemple.fr', objet: 'Votre avis de valeur', texte: 'Bonjour, voici l’avis.' };
  const sans = await R.envoyerAvis(e.id, mail, lea, { exporter, boites: [], envoyer: async () => ({ success: true }) });
  assert.equal(sans.sans_boite, true);
  assert.equal(Records.get('EstimationMandataire', e.id).statut, 'prete');
  assert.equal((await R.envoyerAvis(e.id, { ...mail, a: 'pas une adresse' }, lea, { exporter, boites: [{ id: 'lea@gmail.com', email: 'lea@gmail.com' }] })).ok, false);
  let parti = null;
  const r = await R.envoyerAvis(e.id, mail, lea, { exporter, boites: [{ id: 'lea@gmail.com', email: 'lea@gmail.com' }], envoyer: async (m) => { parti = m; return { success: true, expediteur: 'lea@gmail.com' }; } });
  assert.equal(r.ok, true);
  assert.equal(r.de, 'lea@gmail.com');
  assert.equal(parti.to, 'proprio@exemple.fr');
  assert.equal(parti.attachments[0].filename, 'Avis de valeur.pdf');
  assert.equal(parti.attachments[0].content.toString(), '%PDF-1.4 essai');
  assert.equal(Records.get('EstimationMandataire', e.id).statut, 'envoye');
});

test('un mail refusé par Gmail ne marque rien', async () => {
  const e = Records.create('EstimationMandataire', { mandataire_email: lea.email, statut: 'prete', avis: { chiffres: {} } });
  const r = await R.envoyerAvis(e.id, { a: 'p@x.fr', objet: 'o', texte: 't' }, lea, { exporter, boites: [{ id: 'b' }], envoyer: async () => ({ success: false, error: 'Gmail a refusé' }) });
  assert.equal(r.ok, false);
  assert.equal(Records.get('EstimationMandataire', e.id).statut, 'prete');
});

test('la boîte choisie parmi les siennes ; une autre est refusée', async () => {
  const boites = [{ id: 'lea@gmail.com', email: 'lea@gmail.com' }, { id: 'lea@cabinet.fr', email: 'lea@cabinet.fr' }];
  const mail = { a: 'p@x.fr', objet: 'o', texte: 't' };
  const e1 = Records.create('EstimationMandataire', { mandataire_email: lea.email, statut: 'prete', avis: { chiffres: {} } });
  let de = null;
  const r = await R.envoyerAvis(e1.id, { ...mail, de: 'lea@cabinet.fr' }, lea, { exporter, boites, envoyer: async (m) => { de = m.from; return { success: true }; } });
  assert.equal(r.ok, true);
  assert.equal(de, 'lea@cabinet.fr');
  const e2 = Records.create('EstimationMandataire', { mandataire_email: lea.email, statut: 'prete', avis: { chiffres: {} } });
  assert.equal((await R.envoyerAvis(e2.id, { ...mail, de: 'sourcing@klocka.immo' }, lea, { exporter, boites, envoyer: async () => ({ success: true }) })).ok, false);
});

test('le mail ne dit aucun montant', () => {
  const t = R.sansMontant("Bonjour,\n\nVoici l'avis de valeur de vos murs. Nous l'estimons à 1,3 M€ net vendeur, entre 1 200 000 € et 1 400 000 €. Je vous appelle demain.\nLe loyer de 24 000 euros est au marché.\n\nBien cordialement,");
  assert.doesNotMatch(t, /€|euros/);
  assert.match(t, /Voici l'avis de valeur de vos murs\. Je vous appelle demain\./);
  assert.match(t, /Bien cordialement/);
  const d = R.mailParDefaut({ avis: { chiffres: { valeur: 450000, bas: 420000, haut: 480000 }, type_libelle: 'Murs de commerce' } });
  assert.doesNotMatch(d.texte, /€|\d{3}/);
});
