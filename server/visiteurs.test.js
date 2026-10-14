// L'audience hors équipe (14 oct. 2026) et les enregistrements d'écran des appels.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-visiteurs-'));
const V = await import('./visiteurs.js');
const E = await import('./enregistrements-ecran.js');
const { Records } = await import('./db.js');

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1';

test('le système, l\'appareil, le pays, la provenance', () => {
  assert.deepEqual(V.appareilDe(MAC, 1440), { os: 'Mac OS X', appareil: 'ordinateur', robot: false });
  assert.equal(V.appareilDe(IPHONE).appareil, 'mobile');
  assert.equal(V.appareilDe('Mozilla/5.0 HeadlessChrome/126').robot, true);
  assert.equal(V.paysDe('Europe/Paris', 'fr-FR'), 'France');
  assert.equal(V.paysDe('America/Martinique'), 'Martinique');
  assert.equal(V.paysDe('Pacific/Fiji', 'en-IE'), 'Irlande');
  assert.equal(V.provenanceDe('https://www.google.com/search?q=klocka', 'app.klocka.immo'), 'google.com');
  assert.equal(V.provenanceDe('https://app.klocka.immo/Projet', 'app.klocka.immo'), 'Direct');
  assert.equal(V.provenanceDe(null), 'Direct');
});

test('une visite : les pages d\'un navigateur sans pause de 30 min ; l\'équipe n\'y compte jamais', () => {
  Records.create('User', { email: 'client@x.fr', role: 'user' });
  Records.create('User', { email: 'jules@klocka.immo', role: 'admin' });
  const t0 = new Date('2026-10-14T09:00:00Z');
  const m = (min) => new Date(t0.getTime() + min * 60000);
  V.consignerPassage({ visiteur: 'v1', page: 'SimulateurPublic', referrer: 'https://www.google.com/', fuseau: 'Europe/Paris', ua: MAC, maintenant: t0 });
  V.consignerPassage({ visiteur: 'v1', page: 'Portail', ua: MAC, maintenant: m(2) });
  V.battement({ visiteur: 'v1', maintenant: m(3) });
  V.consignerPassage({ visiteur: 'v1', page: 'MesProjets', ua: MAC, user: { email: 'client@x.fr', role: 'user' }, maintenant: m(50) });
  // L'équipe : connectée ici, puis anonyme sur une page publique depuis le même navigateur.
  V.consignerPassage({ visiteur: 'v2', page: 'AdminProjets', ua: MAC, user: { email: 'jules@klocka.immo', role: 'admin' }, maintenant: m(5) });
  V.consignerPassage({ visiteur: 'v2', page: 'SimulateurPublic', ua: MAC, maintenant: m(120) });
  V.consignerPassage({ visiteur: 'v3', page: 'ProjetPublic', ua: 'Googlebot/2.1', maintenant: m(6) });
  const a = V.audience({ jours: 7, maintenant: m(200) });
  assert.equal(a.totaux.visites, 2, 'deux visites du client, aucune de l\'équipe, aucun robot');
  assert.equal(a.totaux.visiteurs, 2, 'le navigateur anonyme, puis le client connecté');
  assert.equal(a.totaux.duree_s, 90, 'la première visite dure 3 min (battement), la seconde 0');
  assert.deepEqual(a.provenances.map((x) => x.nom).sort(), ['Direct', 'google.com']);
  assert.ok(a.pages.some((x) => x.nom === 'SimulateurPublic' && x.n === 1));
  assert.ok(a.pays.some((x) => x.nom === 'France' && x.n === 1));
});

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
