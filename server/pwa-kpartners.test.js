import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { pageKpartners, demandeDePage } from './pwa-kpartners.js';

test('la page K Partners porte son manifeste, son icône et son nom, plus rien de Klocka', () => {
  const html = pageKpartners(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  assert.match(html, /href="\/manifest-kpartners\.webmanifest"/);
  assert.match(html, /apple-touch-icon" href="\/icones\/kpartners\/apple-touch-icon\.png"/);
  assert.match(html, /apple-mobile-web-app-title" content="K Partners"/);
  assert.match(html, /<title>K Partners<\/title>/);
  assert.doesNotMatch(html, /manifest\.webmanifest"|logo-klocka|og-klocka|<title>Klocka/);
});

test('seules les demandes de page reçoivent la page', () => {
  assert.equal(demandeDePage('GET', '/'), true);
  assert.equal(demandeDePage('GET', '/Biens'), true);
  assert.equal(demandeDePage('GET', '/api/me'), false);
  assert.equal(demandeDePage('GET', '/uploads/a'), false);
  assert.equal(demandeDePage('GET', '/sw.js'), false);
  assert.equal(demandeDePage('POST', '/'), false);
});

test('le manifeste K Partners désigne des icônes qui existent', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../public/manifest-kpartners.webmanifest', import.meta.url), 'utf8'));
  assert.equal(m.name, 'K Partners');
  for (const i of m.icons) assert.ok(fs.existsSync(new URL(`../public${i.src}`, import.meta.url)), i.src);
});
