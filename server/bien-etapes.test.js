import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-bien-etapes-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const { lirePrix, noterPrixAccord, lierConversation, objetsDuBien, cadreDuBien } = await import('./bien-etapes.js');
const { executerOutilMandataire } = await import('./mandataire.js');

const MOI = { email: 'm@kpartners.fr', role: 'mandataire' };
const AUTRE = { email: 'autre@kpartners.fr', role: 'mandataire' };
const fiche = (champs = {}) => Records.create('ProprietaireMandataire', {
  mandataire_email: MOI.email, statut: 'rdv_pris', commerce: 'Optique du Cours', ville: 'Aix-en-Provence', adresse: '40 cours Mirabeau', nom: 'SCI Cours',
  biens: { validee: 'visite', pause: null }, historique: [{ le: '2026-10-10T09:00:00Z', type: 'note', texte: 'Local visité : 85 m², bail 3-6-9 de 2019.' }], ...champs,
});

test('le prix se lit comme il se dit', () => {
  assert.equal(lirePrix('680 000 €'), 680000);
  assert.equal(lirePrix('680k'), 680000);
  assert.equal(lirePrix('1,2 M€'), 1200000);
  assert.equal(lirePrix(450000), 450000);
  assert.equal(lirePrix('beaucoup'), null);
  assert.equal(lirePrix(''), null);
});

test("le prix d'accord fait l'avis de valeur, s'écrit dans l'historique, et reste au mandataire de la fiche", () => {
  const p = fiche();
  assert.equal(noterPrixAccord(p.id, '680 000', AUTRE).ok, false);
  const r = noterPrixAccord(p.id, '680 000', MOI);
  assert.equal(r.ok, true);
  assert.equal(r.proprietaire.biens.prix_accord, 680000);
  assert.equal(r.proprietaire.biens.validee, 'avis_accepte', 'le prix d’accord fait l’Avis de valeur');
  assert.match(r.proprietaire.historique.at(-1).texte, /680/);
  // Une étape déjà plus loin ne recule pas.
  Records.update('ProprietaireMandataire', p.id, { biens: { ...r.proprietaire.biens, validee: 'mandat' } });
  assert.equal(noterPrixAccord(p.id, 700000, MOI).proprietaire.biens.validee, 'mandat');
  assert.equal(noterPrixAccord(p.id, 'n/a', MOI).ok, false);
  assert.equal(noterPrixAccord(fiche({ statut: 'contacte' }).id, 1, MOI).ok, false, 'pas encore dans Biens');
});

test('la conversation du bien se garde sur la fiche', () => {
  const p = fiche();
  assert.equal(lierConversation(p.id, 'conv-1', MOI).proprietaire.biens.conversation_id, 'conv-1');
  assert.equal(lierConversation(p.id, 'conv-2', AUTRE).ok, false);
});

test("L'Assistant KPartners lit l'étape, l'historique et le prix d'accord du bien", () => {
  const p = fiche({ biens: { validee: 'prix_accord', prix_accord: 680000 } });
  const c = cadreDuBien(p);
  assert.match(c, /85 m², bail 3-6-9/);
  assert.match(c, /680\s000 € net vendeur/);
  assert.match(c, /Pas encore d'avis/);
  assert.equal(cadreDuBien({ ...p, statut: 'contacte' }), '');
});

test("depuis la fiche, l'estimation se rattache au bien et le mandat suit son estimation au prix d'accord", async () => {
  const p = fiche({ biens: { validee: 'prix_accord', prix_accord: 650000 } });
  const r = await executerOutilMandataire({ name: 'lancer_estimation', input: { bien: 'Optique du Cours Aix', infos: '85 m², loyer 42 000 € HT HC' } }, MOI, { fiche: p });
  assert.equal(r.ok, true);
  const { estimation } = objetsDuBien(p);
  assert.equal(estimation?.id, r.estimation_id);
  assert.match(estimation.adresse, /40 cours Mirabeau/);
  const m = await executerOutilMandataire({ name: 'demander_mandat', input: { vendeur: 'SCI Cours', bien: 'Murs de l\'Optique du Cours', honoraires: 5 } }, MOI, { fiche: p });
  assert.equal(m.ok, true);
  const mandat = Records.get('MandatMandataire', m.mandat_id);
  assert.equal(mandat.prix, 650000);
  assert.equal(mandat.estimation_id, estimation.id);
  assert.equal(objetsDuBien(p).mandat?.id, mandat.id);
});
