// Ce que l'écran des contacts et la timeline des séquences lisent : le type
// d'un contact (et son filtre), sa dernière activité, l'heure d'envoi propre
// à chaque email d'une séquence.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-emailing-type-'));
process.env.RESEND_API_KEY = '';
const K = await import('./contacts.js');
const E = await import('./index.js');

test('le type d’un contact se lit dans les mots courants, et un contact sans type est un lead', () => {
  assert.equal(K.typeContact('Client'), 'client');
  assert.equal(K.typeContact('CGP'), 'partenaire');
  assert.equal(K.typeContact('agent immobilier'), 'mandataire');
  assert.equal(K.typeContact(''), null);
  const a = K.creerContact({ email: 'a@exemple.fr' }).contact;
  const b = K.creerContact({ email: 'b@exemple.fr', type: 'client' }).contact;
  assert.equal(a.type, 'lead');
  assert.equal(b.type, 'client');
  assert.deepEqual(K.rechercher({ type: 'client' }).contacts.map((c) => c.email), ['b@exemple.fr']);
  K.modifierContact(a.id, { type: 'Partenaire' });
  assert.deepEqual(K.rechercher({ type: 'partenaire' }).contacts.map((c) => c.email), ['a@exemple.fr']);
});

test('l’import reconnaît une colonne « Type »', () => {
  const r = K.importer('email;type\nc@exemple.fr;Mandataire\nd@exemple.fr;', { source: 'test' });
  assert.equal(r.ok, true);
  const parEmail = Object.fromEntries(K.rechercher({}).contacts.map((c) => [c.email, c.type]));
  assert.equal(parEmail['c@exemple.fr'], 'mandataire');
  assert.equal(parEmail['d@exemple.fr'], 'lead');
});

test('la dernière activité : l’événement le plus récent, sinon l’ajout', () => {
  const c = { id: 'x', ajoute_le: '2026-10-01T08:00:00Z', source: 'webinaire', statut: 'abonne' };
  assert.equal(K.derniereActivite(c, [], []).texte, 'Ajouté (webinaire)');
  const envois = [{ id: 'e1', le: '2026-10-02T09:00:00Z', objet: 'Newsletter octobre', statut: 'envoye' }];
  assert.equal(K.derniereActivite(c, envois, []).texte, 'A reçu « Newsletter octobre »');
  const evts = [{ envoi_id: 'e1', type: 'clique', le: '2026-10-02T10:00:00Z' }];
  assert.equal(K.derniereActivite(c, envois, evts).texte, 'A cliqué « Newsletter octobre »');
  assert.equal(K.derniereActivite({ ...c, statut: 'desinscrit', statut_le: '2026-10-05T00:00:00Z' }, envois, evts).texte, 'Désinscrit');
});

test('chaque email d’une séquence peut avoir son heure, sinon celle de la séquence', () => {
  const s = { heure_envoi: 9 };
  assert.deepEqual(E.heureDe(s, { heure: '14:30' }), [14, 30]);
  assert.deepEqual(E.heureDe(s, {}), [9, 0]);
  // Le 7 oct. 2026 à 14 h 30 à Paris (UTC+2) : 12 h 30 UTC.
  assert.equal(E.prochainEnvoi('2026-10-05T08:00:00Z', 2, 14, 30), '2026-10-07T12:30:00.000Z');
  const seq = E.creerSequence({ nom: 'Heures' }, null);
  E.modifierSequence(seq.id, { etapes: [{ id: 'a', delai_jours: 0, objet: 'Un', heure: '7:05' }, { id: 'b', delai_jours: 2, objet: 'Deux', heure: '25:00' }] });
  const etapes = E.sequence(seq.id).etapes;
  assert.equal(etapes[0].heure, '07:05');
  assert.equal(etapes[1].heure, null, 'une heure impossible est ignorée');
});
