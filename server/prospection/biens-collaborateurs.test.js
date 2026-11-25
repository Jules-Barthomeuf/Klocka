// Les biens de chaque collaborateur sur la carte d'avant l'appel (25 nov. 2026, Jules : « voir leurs biens pour cibler
// celui qu'on appelle »).
import test from 'node:test';
import assert from 'node:assert/strict';
import { biensDesCollaborateurs, bienDeLAgence } from './biens-collaborateurs.js';

const agence = { nom: 'Azurea Commerces', site: 'https://www.azurea-commerces.com', telephone: '04 93 00 00 00' };
const contacts = [
  { id: 'c0', nom: 'Sophie Martin', email: 'sophie@azurea-commerces.com', telephone: '06 11 22 33 44' },
  { id: 'c1', nom: 'Paul Durand', email_deduit: 'paul.durand@azurea-commerces.com', telephone: null },
  { id: 'c2', nom: 'Léa Bernard', telephone: '04 93 00 00 00' },
  { id: 'c3', nom: 'Standard', standard: true, telephone: '04 93 00 00 00' },
];
const annonce = (champs) => ({ origine: 'equimmox', transaction: 'vente', adresse: { rue: '1 rue Haute' }, ville: 'Nice', agent: { agence: 'Azurea Commerces' }, ...champs });

test('chaque bien va à sa personne : par mail, mail déduit, numéro perso, ou nom quand le bien est de l’agence', () => {
  const biens = [
    annonce({ id: 'a1', agent_email: 'sophie@azurea-commerces.com', prix: 300000, publiee_le: '2026-11-01' }),
    annonce({ id: 'a2', agent_email: 'paul.durand@azurea-commerces.com', loyer_annuel: 24000, publiee_le: '2026-10-01' }),
    annonce({ id: 'a3', agent: { telephone: '+33 6 11 22 33 44', agence: 'Azurea Commerces' }, prix: 500000, retiree_le: '2026-11-10', publiee_le: '2026-11-05' }),
    { id: 'f1', origine: 'transfert', agent: { nom: 'Bernard Léa', agence: 'Azurea Commerces' }, ville: 'Nice', prix: 210000, recu_le: '2026-11-20' },
    // Au numéro du standard : à personne, l'agence le garde.
    annonce({ id: 'a4', agent: { telephone: '04 93 00 00 00', agence: 'Azurea Commerces' }, prix: 150000 }),
    // Une autre agence, un autre Paul Durand : rien.
    annonce({ id: 'a5', agent_email: 'paul@cbre.fr', agent: { nom: 'Paul Durand', agence: 'CBRE' }, prix: 900000 }),
    annonce({ id: 'a6', agent_email: 'sophie@azurea-commerces.com', supprime_le: '2026-11-21' }),
  ];
  const r = biensDesCollaborateurs(agence, contacts, biens);
  assert.deepEqual(r.par_contact.c0.map((b) => b.id), ['a1', 'a3'], 'en ligne d’abord, la retirée ensuite');
  assert.equal(r.par_contact.c0[1].retiree, true);
  assert.deepEqual(r.par_contact.c1.map((b) => b.id), ['a2']);
  assert.deepEqual(r.par_contact.c2.map((b) => b.id), ['f1'], 'le nom à l’envers, une fiche reçue de cette agence');
  assert.equal(r.par_contact.c2[0].genre, 'fiche');
  assert.equal(r.par_contact.c3, undefined, 'le standard n’a pas de biens');
  assert.deepEqual(r.agence.map((b) => b.id), ['a4']);
});

test('un bien est de l’agence par le domaine du mail, sinon par son nom ; un Gmail ne dit rien', () => {
  assert.equal(bienDeLAgence({ agent_email: 'x@azurea-commerces.com' }, agence), true);
  assert.equal(bienDeLAgence({ agent: { agence: 'AZUREA COMMERCES & ENTREPRISES' } }, agence), true);
  assert.equal(bienDeLAgence({ agent_email: 'x@gmail.com' }, agence), false);
  assert.equal(bienDeLAgence({ agent: { agence: 'Century 21' } }, agence), false);
});
