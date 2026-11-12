import test from 'node:test';
import assert from 'node:assert/strict';
import { ligne, objet } from './prospection.js';

test('la Prospection du CRM : une agence appelée dit quand, par qui et l\'issue ; une jamais appelée, rien', () => {
  const appelee = ligne({ id: 'a1', nom: 'Cabinet Vogue', telephone: '04 93 01 04 10', gerants: [{ nom: 'Fanny Peters' }], pour: ['coralie.g@klocka.immo'],
    statut: { libelle: 'Déjà en contact', appelee: true, quand: '2026-10-08T07:37:04Z', qui: 'jules.b@klocka.immo', dernier_statut: 'Pas de bien pour l\'instant', relance_le: '2026-11-12', proprietaire: 'jules.b@klocka.immo' } }, 'Nice');
  assert.deepEqual(appelee, { id: 'a1', name: 'Cabinet Vogue', ville: 'Nice', interlocuteur: 'Fanny Peters', telephone: '04 93 01 04 10', statut: 'Déjà en contact', dernierAppel: '2026-10-08T07:37:04Z', appelePar: 'Jules', issue: 'Pas de bien pour l\'instant', relance: '2026-11-12', associe: 'Coralie, Jules' });
  const jamais = ligne({ id: 'a2', nom: 'Ace', agents: [{ nom: 'David', telephone: '06 00 00 00 00' }], statut: { libelle: 'Jamais contactée', appelee: false } }, 'Nice');
  assert.equal(jamais.dernierAppel, null);
  assert.equal(jamais.appelePar, '');
  assert.equal(jamais.telephone, '06 00 00 00 00');
  assert.ok(objet().champs.every((c) => !c.modifiable));
});
