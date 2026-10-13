// Bloc 3 (13 oct. 2026) : ce qu'AK a lu ou fait pour une réponse revient avec
// elle au tour suivant, au lieu d'être perdu d'un message à l'autre.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ANTHROPIC_API_KEY = '';
const { memoireDesOutils, avecMemoire } = await import('./app.js');

test('une ligne par outil, arguments et résultat tronqués', () => {
  const m = memoireDesOutils([
    { outil: 'etat_projet', args: { projet_id: 'p1' }, resultat: { ok: true, loyer: 30693, surface: 55 } },
    { outil: 'loyers_equimmox', args: { projet_id: 'p1' }, resultat: 'x'.repeat(5000) },
  ]);
  const lignes = m.split('\n');
  assert.equal(lignes.length, 2);
  assert.match(lignes[0], /^- etat_projet\(\{"projet_id":"p1"\}\) → \{"ok":true,"loyer":30693,"surface":55\}$/);
  assert.ok(lignes[1].length < 1500 && lignes[1].endsWith('…'));
});

test('au-delà de 8 000 signes, le reste est compté sans être repris', () => {
  const appels = Array.from({ length: 12 }, (_, i) => ({ outil: `o${i}`, args: {}, resultat: 'y'.repeat(1300) }));
  const m = memoireDesOutils(appels);
  assert.ok(m.length < 9000);
  assert.match(m, /autre\(s\) appel\(s\) non repris$/);
});

test('seule une réponse d\'AK récente reprend sa mémoire', () => {
  const r = { role: 'assistant', contenu: 'Le loyer est de 30 693 €.', memoire: '- etat_projet(…) → {"loyer":30693}' };
  assert.match(avecMemoire(r, true), /Le loyer est de 30 693 €\.\n\n\[Pour cette réponse, tu avais appelé ces outils/);
  assert.equal(avecMemoire(r, false), r.contenu);
  assert.equal(avecMemoire({ role: 'user', contenu: 'Et le prix ?', memoire: 'x' }, true), 'Et le prix ?');
});

const { blocsNatifs } = await import('./app.js');

test('bloc 4 : image et PDF partent tels quels, le reste garde son chemin', () => {
  const pieces = [
    { nom: 'facade.jpg', type: 'image/jpeg', chemin: '/u/a.jpg' },
    { nom: 'bail.pdf', type: 'application/pdf', chemin: '/u/b.pdf' },
    { nom: 'photo.heic', type: 'image/heic', chemin: '/u/c.heic' },
    { nom: 'enorme.png', type: 'image/png', chemin: '/u/d.png' },
  ];
  const tailles = { '/u/a.jpg': 1000, '/u/b.pdf': 2000, '/u/c.heic': 10, '/u/d.png': 6 * 1024 * 1024 };
  const { blocs, lues } = blocsNatifs(pieces, { taille: (c) => tailles[c], lire: () => Buffer.from('abc') });
  assert.deepEqual(blocs.map((b) => b.type), ['image', 'document']);
  assert.equal(blocs[0].source.media_type, 'image/jpeg');
  assert.equal(blocs[1].title, 'bail.pdf');
  assert.ok(lues.has(pieces[0]) && lues.has(pieces[1]) && !lues.has(pieces[2]) && !lues.has(pieces[3]));
});
