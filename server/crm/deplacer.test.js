import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { planDeplacement, lisible, signatureValide, objetPourOption, recevoirEvenement } from './deplacer.js';

const depart = [
  { name: 'name', label: 'Name', type: 'TEXT' },
  { name: 'id', label: 'Id', type: 'UUID' },
  { name: 'telephone', label: 'Téléphone', type: 'PHONES' },
  { name: 'statut', label: 'Statut', type: 'SELECT', options: [{ value: 'SIGNE', label: 'Signé' }, { value: 'EN_COURS', label: 'En cours' }] },
  { name: 'budget', label: 'Budget', type: 'NUMBER' },
  { name: 'secteur', label: 'Secteur', type: 'TEXT' },
  { name: 'clientFiche', label: 'Client (fiche)', type: 'RELATION' },
];
const arrivee = [
  { name: 'name', label: 'Name', type: 'TEXT' },
  { name: 'tel', label: 'Telephone', type: 'PHONES' },
  { name: 'statut', label: 'Statut', type: 'SELECT', options: [{ value: 'EN_COURS', label: 'En cours' }] },
  { name: 'budgetTexte', label: 'Budget', type: 'TEXT' },
];

test('déplacement : même nom ou même libellé, même type ; un choix seulement si l\'option existe', () => {
  const fiche = { id: 'x', name: 'Dupont', telephone: { primaryPhoneNumber: '612345678', primaryPhoneCallingCode: '+33' }, statut: 'SIGNE', budget: 450000, secteur: 'Nice', clientFiche: 'y' };
  const { valeurs, nonRepris } = planDeplacement(fiche, depart, arrivee);
  assert.deepEqual(valeurs, { name: 'Dupont', tel: fiche.telephone, budgetTexte: '450000' });
  assert.deepEqual(nonRepris, [{ label: 'Statut', texte: 'Signé' }, { label: 'Secteur', texte: 'Nice' }]);
});

test('déplacement : une option présente à l\'arrivée passe telle quelle, le vide est ignoré', () => {
  const { valeurs, nonRepris } = planDeplacement({ name: 'A', statut: 'EN_COURS', secteur: '' }, depart, arrivee);
  assert.deepEqual(valeurs, { name: 'A', statut: 'EN_COURS' });
  assert.deepEqual(nonRepris, []);
});

test('déplacement : valeurs lisibles, signature Twenty exigée, tableau d\'arrivée par son option', () => {
  assert.equal(lisible({ primaryEmail: 'a@b.fr', additionalEmails: ['c@d.fr'] }), 'a@b.fr, c@d.fr');
  assert.equal(lisible({ amountMicros: 2500000000, currencyCode: 'EUR' }), '2500 EUR');
  const avant = process.env.CRM_DEPLACER_SECRET;
  const secret = 'x'.repeat(32);
  process.env.CRM_DEPLACER_SECRET = secret;
  const corps = { eventName: 'clients.updated', record: { id: 'a' } };
  const ts = String(Date.now());
  const sig = crypto.createHmac('sha256', secret).update(`${ts}:${JSON.stringify(corps)}`).digest('hex');
  assert.equal(signatureValide(corps, ts, sig), true);
  assert.equal(signatureValide({ ...corps, record: { id: 'b' } }, ts, sig), false);
  assert.equal(signatureValide(corps, ts, 'f'.repeat(64)), false);
  assert.equal(signatureValide(corps, String(Date.now() - 3_600_000), sig), false);
  process.env.CRM_DEPLACER_SECRET = 'court';
  assert.equal(signatureValide(corps, ts, sig), false);
  if (avant === undefined) delete process.env.CRM_DEPLACER_SECRET;
  else process.env.CRM_DEPLACER_SECRET = avant;
  assert.equal(objetPourOption('CLIENTS')?.nameSingular, 'clients');
  assert.equal(objetPourOption('INCONNU'), null);
});

test('déplacement : seul un événement de modification avec « Déplacer vers » rempli déclenche', () => {
  assert.equal(recevoirEvenement({ eventName: 'clients.updated', objectMetadata: { nameSingular: 'clients' }, record: { id: 'r1' } }), false);
  assert.equal(recevoirEvenement({ eventName: 'clients.created', objectMetadata: { nameSingular: 'clients' }, record: { id: 'r1', deplacerVers: 'PROSPECTS' } }), false);
  assert.equal(recevoirEvenement({ eventName: 'clients.updated', objectMetadata: { nameSingular: 'clients' }, record: { id: 'r1', deplacerVers: 'PROSPECTS', deletedAt: '2026-10-28' } }), false);
});
