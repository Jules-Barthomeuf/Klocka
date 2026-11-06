// Les enregistrements d'écran des appels (14 oct. 2026). L'audience est supprimée (6 nov. 2026).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-visiteurs-'));
const E = await import('./enregistrements-ecran.js');
const { Records } = await import('./db.js');


test('un enregistrement d\'écran : gzip seulement, retrouvé par son appel, effacé après 30 jours', () => {
  const contenu = zlib.gzipSync(Buffer.from(JSON.stringify([{ type: 4 }, { type: 2 }, { type: 3 }])));
  assert.equal(E.deposer({ contenu: Buffer.from('pas du gzip'), par: 'a@k.fr' }).ok, false);
  const r = E.deposer({ contenu, par: 'Maxime@klocka.immo', appel_id: 'appel-1', debut: '2026-10-14T09:00:00Z', fin: '2026-10-14T09:04:30Z', evenements: 3 });
  assert.equal(r.ok, true);
  const [e] = E.liste({ appel_id: 'appel-1' });
  assert.equal(e.duree_s, 270);
  assert.equal(e.par, 'maxime@klocka.immo');
  assert.ok(E.fichier(r.id));
  assert.equal(E.purger({ maintenant: new Date(Date.now() + 31 * 86400000) }), 1);
  assert.equal(E.fichier(r.id), null);
});
