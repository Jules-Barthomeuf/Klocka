// Le tri des notifications (23 nov. 2026, Jules : « des notifications réellement utiles »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-notifs-'));
const { Records } = await import('./db.js');
const N = await import('./notifications.js');

test('les retirées ne sont plus créées ; les gardées se montrent ; les autres restent écrites sans se montrer', () => {
  for (const titre of ['Votre analyste est maintenant Jules', 'Vous reprenez un dossier · Lunel', "Je t'ai préparé un petit quiz !", 'Votre matinée', 'Maxime a appelé Paul Durand', 'Mandat validé · Lunel', 'Import raté : X', 'Paul Durand a répondu', 'Paul Durand est prêt à parler affaires', "L'Assistant Klocka a une question sur un de tes appels", 'Réponse sur Murs Foch', 'Assistant Klocka : côté mandataire ?']) {
    assert.equal(N.notifier({ pour: 'jules.b@klocka.immo', titre }), null, titre);
  }
  assert.equal(N.notifier({ pour: 'jules.b@klocka.immo', titre: 'Votre transfert', cle: 'haka-transfert:1' }), null, 'le compte rendu remplace');
  const loi = N.notifier({ pour: 'jules.b@klocka.immo', titre: 'Votre LOI est prête', lien: '/Offres' });
  const autre = N.notifier({ pour: 'jules.b@klocka.immo', titre: "J'ai trouvé un commerce" });
  assert.equal(loi.montrer, true);
  assert.equal(autre.montrer, false);
  const user = { email: 'jules.b@klocka.immo' };
  assert.deepEqual(N.aMontrer(user).map((n) => n.titre), ['Votre LOI est prête']);
  // Fermée sans l'ouvrir : dans « À faire », jusqu'à ce qu'on l'ouvre.
  N.marquer(loi.id, user, 'plus_tard');
  assert.equal(N.aMontrer(user).length, 0);
  assert.deepEqual(N.aFaire(user).map((a) => [a.genre, a.titre, a.lien]), [['notification', 'Votre LOI est prête', '/Offres']]);
  N.marquer(loi.id, user, 'lue');
  assert.equal(N.aFaire(user).length, 0);
  assert.equal(Records.list('Notification').length, 2);
});
