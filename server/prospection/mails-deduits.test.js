import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avecMailsDeduits, formatDe, mailDe, morceaux } from './mails-deduits.js';

test('morceaux : prénom composé, nom à particule, initiale refusée', () => {
  assert.deepEqual(morceaux('Jean-Philippe Douvre'), { prenom: 'jean-philippe', prenomColle: 'jeanphilippe', initiale: 'jp', nom: 'douvre' });
  assert.equal(morceaux('Sophie Le Gall').nom, 'legall');
  assert.equal(morceaux('Hélène Dupré').prenom, 'helene');
  assert.equal(morceaux('Sandrine R.'), null);
  assert.equal(morceaux('Sandrine'), null);
});

test('formatDe reconnaît les formats courants', () => {
  assert.equal(formatDe('Stanislas Foucaud', 's.foucaud@reseau3c.fr'), 'p.nom');
  assert.equal(formatDe('Jean-Philippe Douvre', 'jp.douvre@reseau3c.fr'), 'p.nom');
  assert.equal(formatDe('Olivier Renault', 'olivier.renault@x.fr'), 'prenom.nom');
  assert.equal(formatDe('Jean-Philippe Douvre', 'jeanphilippe.douvre@x.fr'), 'prenom.nom');
  assert.equal(formatDe('Olivier Renault', 'orenault@x.fr'), 'pnom');
  assert.equal(formatDe('Olivier Renault', 'contact@x.fr'), null);
});

test('mailDe applique le format', () => {
  assert.equal(mailDe('Olivier Renault', 'p.nom', 'reseau3c.fr'), 'o.renault@reseau3c.fr');
  assert.equal(mailDe('Jean-Philippe Douvre', 'prenom.nom', 'x.fr'), 'jean-philippe.douvre@x.fr');
});

test('avecMailsDeduits : le format des mails nommés de l\'agence, les mails connus intacts', () => {
  const contacts = [
    { nom: 'Stanislas Foucaud', email: 's.foucaud@reseau3c.fr' },
    { nom: 'Olivier Renault' },
    { nom: 'Standard', standard: true, telephone: '04' },
  ];
  const r = avecMailsDeduits(contacts, { site: 'https://www.reseau3c.fr' });
  assert.equal(r[0].email, 's.foucaud@reseau3c.fr');
  assert.equal(r[0].email_deduit, undefined);
  assert.deepEqual([r[1].email, r[1].email_deduit, r[1].email_deduit_par], [undefined, 'o.renault@reseau3c.fr', 'format']);
  assert.equal(r[2].email_deduit, undefined);
});

test('avecMailsDeduits : sans mail nommé, rien (ni le domaine du site, ni un contact@)', () => {
  assert.deepEqual(avecMailsDeduits([{ nom: 'Olivier Renault' }], { email: 'contact@agence-azur.fr', site: 'agence-azur.fr/equipe' }), [{ nom: 'Olivier Renault' }]);
});

test('avecMailsDeduits : les agents de l\'agence donnent aussi le format', () => {
  const r = avecMailsDeduits([{ nom: 'Olivier Renault' }], { agents: [{ nom: 'Marie Curie', email: 'mcurie@azur.fr' }] });
  assert.equal(r[0].email_deduit, 'orenault@azur.fr');
});
