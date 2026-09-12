// Ce que le journal d'audit retient, et ce qu'il laisse passer.
//
// Un journal qui garde tout est illisible ; un journal qui garde trop peu ne
// sert à rien. La règle est ici, et elle est testée : les écritures, les
// lectures sensibles, et tous les refus.

import test from 'node:test';
import assert from 'node:assert/strict';
import { aTracer } from './audit.js';

test('tout ce qui modifie est retenu', () => {
  assert.ok(aTracer('POST', '/api/entities/Project', 200));
  assert.ok(aTracer('PUT', '/api/entities/User/abc', 200));
  assert.ok(aTracer('DELETE', '/api/entities/Project/abc', 200));
  assert.ok(aTracer('POST', '/api/preanalyse/dossiers/x/documents', 200));
});

test('une lecture ordinaire ne remplit pas le journal', () => {
  // Sinon la moindre navigation noierait ce qui compte, et la page de suivi
  // compte déjà les consultations.
  assert.equal(aTracer('GET', '/api/entities/Project', 200), false);
  assert.equal(aTracer('GET', '/api/preanalyse/dossiers', 200), false);
  assert.equal(aTracer('GET', '/api/health', 200), false);
});

test('lire un document déposé ou emporter la base laisse une trace', () => {
  // Un bail, une quittance, une photo de dossier : c'est précisément ce qu'on
  // veut pouvoir retracer.
  assert.ok(aTracer('GET', '/uploads/1786-bail.pdf', 200));
  assert.ok(aTracer('GET', '/api/admin/sauvegarde', 200));
});

test('tout refus est retenu, même sur une lecture ordinaire', () => {
  // Le signal le plus utile : un compte qui sonde une surface qui ne le
  // concerne pas répète des 401 et des 403.
  assert.ok(aTracer('GET', '/api/entities/Deal', 403));
  assert.ok(aTracer('GET', '/api/entities/Project', 401));
  assert.ok(aTracer('GET', '/api/preanalyse/dossiers', 403));
  assert.ok(aTracer('GET', '/uploads/bail.pdf', 401));
});

test('le journal ne se journalise pas lui-même', () => {
  // Sans cela, le consulter le remplit, et il finit par ne plus parler que
  // de lui.
  assert.equal(aTracer('GET', '/api/monitoring/audit', 200), false);
  assert.equal(aTracer('GET', '/api/monitoring/audit', 403), false);
  // Déclarer sa propre visite est ce que fait un client en naviguant.
  assert.equal(aTracer('POST', '/api/journal/page', 200), false);
});

test('ce qui n’est ni API ni document n’est pas suivi', () => {
  // L'interface elle-même : ses fichiers ne sont pas des actions.
  assert.equal(aTracer('GET', '/Dashboard', 200), false);
  assert.equal(aTracer('GET', '/assets/index-abc.js', 200), false);
  assert.equal(aTracer('GET', '/assets/index-abc.js', 404), false);
});
