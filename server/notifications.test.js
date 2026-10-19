import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-notif-'));
const { notifier, mesNotifications, marquer, toutLire, supprimer, toutSupprimer } = await import('./notifications.js');

const JULES = { email: 'jules.b@klocka.immo', role: 'admin' };
const NORA = { email: 'nora.l@klocka.immo', role: 'admin' };
const MARC = { email: 'marc@kpartners.fr', role: 'mandataire' };

test("une notification d'équipe va aux admins, une personnelle à sa personne", () => {
  notifier({ titre: 'Nouvelle fiche commerciale', texte: 'Reçue de Sophie Morel.', lien: '/Dossiers?deal_id=d1', action: 'Voir la pré-analyse', cle: 'fiche:d1' });
  notifier({ pour: MARC.email, titre: 'Rapport validé', lien: '/EstimationMandataire' });
  assert.equal(mesNotifications(JULES).notifications.length, 1);
  assert.equal(mesNotifications(NORA).notifications[0].action, 'Voir la pré-analyse');
  assert.deepEqual(mesNotifications(MARC).notifications.map((n) => n.titre), ['Rapport validé'], 'le mandataire ne voit pas les fiches de l’équipe');
});

test('une même clé ne notifie qu’une fois', () => {
  assert.equal(notifier({ titre: 'Nouvelle fiche commerciale', cle: 'fiche:d1' }), null);
  assert.equal(mesNotifications(JULES).notifications.length, 1);
});

test('vue puis lue, chacun pour soi', () => {
  const n = mesNotifications(JULES).notifications[0];
  assert.equal(mesNotifications(JULES).non_lues, 1);
  marquer(n.id, JULES, 'vue');
  assert.equal(mesNotifications(JULES).notifications[0].vue, true);
  assert.equal(mesNotifications(JULES).non_lues, 1, 'vue n’est pas lue');
  marquer(n.id, JULES, 'lue');
  assert.equal(mesNotifications(JULES).non_lues, 0);
  assert.equal(mesNotifications(NORA).non_lues, 1, 'Nora ne l’a pas lue');
  assert.equal(marquer(n.id, MARC, 'lue').ok, false);
  toutLire(NORA);
  assert.equal(mesNotifications(NORA).non_lues, 0);
});

test("supprimer : une notification d'équipe ne part que de sa liste, une personnelle disparaît", () => {
  const equipe = notifier({ titre: 'Fiche à voir', cle: 'fiche:sup' });
  const perso = notifier({ pour: JULES.email, titre: 'Pour Jules seul' });
  assert.equal(supprimer(equipe.id, JULES).ok, true);
  assert.ok(!mesNotifications(JULES).notifications.some((n) => n.id === equipe.id));
  assert.ok(mesNotifications(NORA).notifications.some((n) => n.id === equipe.id), 'Nora la garde');
  assert.equal(supprimer(perso.id, NORA).ok, false, 'pas la sienne');
  supprimer(perso.id, JULES);
  assert.ok(!mesNotifications(JULES).notifications.some((n) => n.id === perso.id));
  toutSupprimer(NORA);
  assert.equal(mesNotifications(NORA).notifications.length, 0);
  assert.equal(mesNotifications(MARC).notifications.length, 1, 'le mandataire garde la sienne');
});
