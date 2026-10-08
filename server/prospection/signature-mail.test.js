// Le mail du mode appel s'arrête à la formule de politesse (8 oct. 2026) : la
// signature s'ajoute à l'envoi (texte), la bannière dans le HTML.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-signature-mail-'));
const MA = await import('./mode-appel.js');
const M = await import('./mails.js');
const { Records } = await import('../db.js');

test("à l'écran, le mail s'arrête à « Bien cordialement, »", () => {
  assert.equal(MA.sansJetonSignature('Bonjour Marc,\n\nMerci.\n\nBien cordialement,\n{signature}\n'), 'Bonjour Marc,\n\nMerci.\n\nBien cordialement,');
  assert.equal(MA.sansJetonSignature('Bien à vous,\n\n{signature}'), 'Bien à vous,');
});

test("à l'envoi, la signature revient sous la formule de politesse, une seule fois", async () => {
  const m = M.mettreEnAttente({ genre: 'agent', signature_auto: true, a: 'marc@riviera.fr', objet: 'Suite à notre échange', corps: 'Bonjour Marc,\n\nBien cordialement,' });
  await M.envoyerMails([m.id], { email: 'jules.b@klocka.immo', full_name: 'Jules Barthomeuf' });
  const corps = Records.get('ProspectionMail', m.id).corps;
  assert.equal(corps, 'Bonjour Marc,\n\nBien cordialement,\nJules Barthomeuf\nKlocka · klocka.immo\njules.b@klocka.immo');
  // Un ancien mail qui porte encore le jeton : il est remplacé, pas doublé.
  const v = M.mettreEnAttente({ genre: 'agent', signature_auto: true, a: 'marc@riviera.fr', objet: 'x', corps: 'Bien cordialement,\n{signature}' });
  await M.envoyerMails([v.id], { email: 'jules.b@klocka.immo', full_name: 'Jules Barthomeuf' });
  assert.equal(Records.get('ProspectionMail', v.id).corps.split('Jules Barthomeuf').length, 2);
});
