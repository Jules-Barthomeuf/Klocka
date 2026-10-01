// Les outils d'AK : la recherche d'agents, pure sur ses listes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { chercherAgents, cleTelephone } from './outils.js';

test('cleTelephone : la même clé sous toute écriture', () => {
  assert.equal(cleTelephone('07 85 27 19 24'), '785271924');
  assert.equal(cleTelephone('+33 7 85 27 19 24'), '785271924');
  assert.equal(cleTelephone('07.85.27.19.24'), '785271924');
  assert.equal(cleTelephone('12345'), null);
});

test('chercherAgents retrouve un agent de la grille par son numéro, sous toute écriture', () => {
  const agentsImmo = [{ id: 'g1', nom: 'Sébastien ROBIC', agence: null, emails: ['srobic@pro.bzh'], telephones: ['07 85 27 19 24'], ville: 'Lorient', statut: 'envoie_des_fiches' }];
  for (const q of [{ telephone: '0785271924' }, { telephone: '+33 7 85 27 19 24' }, { recherche: '07.85.27.19.24' }]) {
    const r = chercherAgents(q, { contacts: [], deals: [], mails: [], agentsImmo });
    assert.equal(r.length, 1, JSON.stringify(q));
    assert.equal(r[0].nom, 'Sébastien ROBIC');
    assert.deepEqual(r[0].telephones, ['07 85 27 19 24']);
    assert.equal(r[0].villes.includes('Lorient'), true);
  }
  assert.equal(chercherAgents({ telephone: '0600000000' }, { contacts: [], deals: [], mails: [], agentsImmo }).length, 0, 'un numéro inconnu ne rend personne');
});

test('la grille complète le carnet sans doubler un agent au même mail', () => {
  const contacts = [{ email: 'srobic@pro.bzh', nom: 'S. Robic', fonction: 'agent immobilier', localisation: 'Lorient' }];
  const agentsImmo = [{ id: 'g1', nom: 'Sébastien ROBIC', emails: ['srobic@pro.bzh'], telephones: ['07 85 27 19 24'], ville: 'Lorient', statut: 'envoie_des_fiches' }];
  const r = chercherAgents({ recherche: 'robic' }, { contacts, deals: [], mails: [], agentsImmo });
  assert.equal(r.length, 1);
  assert.equal(r[0].telephones.length, 1, 'le numéro de la grille est là');
  assert.equal(r[0].statut_prospection, 'envoie_des_fiches');
});
