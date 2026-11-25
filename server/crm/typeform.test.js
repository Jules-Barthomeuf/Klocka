// Typeform → Prospects de Twenty CRM (25 nov. 2026, Jules). Pur : rien n'est écrit dans Twenty.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { informationAvec, lireEnvoi, montant, signatureTypeform, valeursProspect } from './typeform.js';

const envoi = {
  form_id: 'GD7sREFs', submitted_at: '2026-11-25T10:12:00Z',
  definition: { title: 'Site', fields: [
    { id: 'a', title: 'Votre prénom ?', type: 'short_text' }, { id: 'b', title: 'Votre nom', type: 'short_text' },
    { id: 'c', title: 'Votre e-mail', type: 'email' }, { id: 'd', title: 'Téléphone', type: 'phone_number' },
    { id: 'e', title: 'Votre patrimoine immobilier', type: 'multiple_choice' }, { id: 'f', title: 'Revenus annuels du foyer', type: 'short_text' },
    { id: 'g', title: 'Apport disponible', type: 'short_text' }, { id: 'h', title: 'Votre objectif', type: 'long_text' },
  ] },
  answers: [
    { field: { id: 'a', type: 'short_text' }, type: 'text', text: 'Claire' }, { field: { id: 'b', type: 'short_text' }, type: 'text', text: 'Martin' },
    { field: { id: 'c', type: 'email' }, type: 'email', email: 'Claire.Martin@exemple.fr' }, { field: { id: 'd', type: 'phone_number' }, type: 'phone_number', phone_number: '+33612345678' },
    { field: { id: 'e', type: 'multiple_choice' }, type: 'choice', choice: { label: 'Entre 500 k€ et 1 M€' } }, { field: { id: 'f', type: 'short_text' }, type: 'text', text: '120 000 €' },
    { field: { id: 'g', type: 'short_text' }, type: 'text', text: '1,2 M€' }, { field: { id: 'h', type: 'long_text' }, type: 'text', text: 'Des murs loués, rendement 7 %' },
  ],
};

test('la signature Typeform se vérifie sur le corps brut, et rien ne passe sans secret', () => {
  const corps = JSON.stringify({ a: 1 });
  const entete = `sha256=${crypto.createHmac('sha256', 'secret').update(corps).digest('base64')}`;
  assert.equal(signatureTypeform({ entete, corps, cle: 'secret' }), true);
  assert.equal(signatureTypeform({ entete, corps, cle: 'autre' }), false);
  assert.equal(signatureTypeform({ entete, corps, cle: '' }), false);
});

test("un envoi se lit : nom, mail, téléphone, patrimoine, montants, et toutes les réponses gardées", () => {
  const lu = lireEnvoi(envoi);
  assert.equal(lu.prenom, 'Claire');
  assert.equal(lu.nom, 'Martin');
  assert.equal(lu.email, 'claire.martin@exemple.fr');
  assert.equal(lu.telephone, '+33612345678');
  assert.equal(lu.patrimoine, 'Entre 500 k€ et 1 M€');
  assert.equal(lu.revenu, 120000);
  assert.equal(lu.fondsPropre, 1200000);
  assert.equal(lu.reponses.length, 8);
  assert.equal(montant('500k'), 500000);
});

test('une nouvelle ligne : Source VSL ou SITE WEB, A Relancer ; une ligne existante garde ce qui y est écrit', () => {
  const lu = lireEnvoi(envoi);
  const neuve = valeursProspect(lu, 'vsl');
  assert.equal(neuve.name, 'Claire Martin');
  assert.equal(neuve.source9, 'VSL');
  assert.equal(neuve.statut, 'A_RELANCER');
  assert.equal(neuve.numero.primaryPhoneNumber, '612345678');
  assert.match(neuve.information, /Typeform VSL[\s\S]*Votre objectif : Des murs loués/);
  const site = valeursProspect(lu, 'site', { id: 'x', name: 'Claire M.', statut: 'R1_VISIO', revenu: 90000, email: { primaryEmail: 'claire.martin@exemple.fr' }, information: 'Rencontrée au salon' });
  assert.equal(site.source9, 'SITE_WEB');
  assert.equal(site.name, undefined);
  assert.equal(site.statut, undefined);
  assert.equal(site.revenu, undefined);
  assert.equal(site.email, undefined);
  assert.match(site.information, /^Rencontrée au salon\n\nTypeform SITE WEB/);
});

test("une réponse partielle puis complète, ou un import refait, remplace son bloc au lieu de le recopier", () => {
  const partielle = { ...lireEnvoi({ ...envoi, token: 'abc' }), partielle: true };
  const complete = { ...lireEnvoi({ ...envoi, token: 'abc' }), partielle: false };
  const une = informationAvec('Rencontrée au salon', partielle, 'site');
  assert.match(une, /\(incomplet\) · réponse abc/);
  const deux = informationAvec(une, complete, 'site');
  assert.equal((deux.match(/réponse abc/g) || []).length, 1);
  assert.doesNotMatch(deux, /incomplet/);
  assert.match(deux, /^Rencontrée au salon\n\nTypeform SITE WEB/);
  assert.equal(informationAvec(deux, complete, 'site'), deux);
});
