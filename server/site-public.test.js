import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import express from 'express';
import { siteMiddleware, estHoteSite, pageDuSite } from './site-public.js';

test('seuls les hôtes du site public sont aiguillés', () => {
  assert.equal(estHoteSite('klocka.immo'), true);
  assert.equal(estHoteSite('www.klocka.immo'), true);
  assert.equal(estHoteSite('KLOCKA.IMMO'), true);
  assert.equal(estHoteSite('app.klocka.immo'), false);
  assert.equal(estHoteSite('localhost'), false);
});

test('les pages du site, avec ou sans barre finale', () => {
  for (const p of ['/', '/equipe', '/equipe/', '/qui-sommes-nous', '/simulateur', '/legal']) assert.equal(pageDuSite(p), true, p);
  for (const p of ['/Bienvenue', '/Dashboard', '/kpartners/']) assert.equal(pageDuSite(p), false, p);
});

async function serveur() {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<p>site</p>');
  fs.mkdirSync(path.join(dist, 'img'));
  fs.writeFileSync(path.join(dist, 'img', 'a.png'), 'png');
  const app = express();
  app.use(siteMiddleware(dist));
  app.get('*', (req, res) => res.send('plateforme'));
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  // fetch ignore l'en-tête Host : http.request le transmet.
  const appel = (chemin, hote) => new Promise((ok, ko) => {
    http.get({ port: s.address().port, path: chemin, headers: { host: hote } }, (r) => {
      let corps = '';
      r.on('data', (d) => { corps += d; });
      r.on('end', () => ok({ status: r.statusCode, headers: { get: (n) => r.headers[n] }, text: async () => corps }));
    }).on('error', ko);
  });
  return { s, appel };
}

test('klocka.immo sert le site et renvoie le reste vers la plateforme', async () => {
  const { s, appel } = await serveur();
  try {
    assert.equal(await (await appel('/', 'klocka.immo')).text(), '<p>site</p>');
    assert.equal(await (await appel('/equipe', 'klocka.immo')).text(), '<p>site</p>');
    assert.equal(await (await appel('/klocka.immo/img/a.png', 'klocka.immo')).text(), 'png');
    const r = await appel('/Bienvenue?jeton=abc', 'klocka.immo');
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'https://app.klocka.immo/Bienvenue?jeton=abc');
    assert.equal(await (await appel('/api/x', 'klocka.immo')).text(), 'plateforme');
  } finally { s.close(); }
});

test('app.klocka.immo garde sa racine et montre le site sous /klocka.immo/', async () => {
  const { s, appel } = await serveur();
  try {
    assert.equal(await (await appel('/', 'app.klocka.immo')).text(), 'plateforme');
    assert.equal(await (await appel('/equipe', 'app.klocka.immo')).text(), 'plateforme');
    assert.equal(await (await appel('/klocka.immo/', 'app.klocka.immo')).text(), '<p>site</p>');
    assert.equal(await (await appel('/klocka.immo/equipe', 'app.klocka.immo')).text(), '<p>site</p>');
    assert.equal(await (await appel('/klocka.immo/img/a.png', 'app.klocka.immo')).text(), 'png');
    assert.equal(await (await appel('/klocka.immo/Dashboard', 'app.klocka.immo')).text(), 'plateforme');
  } finally { s.close(); }
});

test('le site K Partners répond sur kpartners.immo et www, jamais sur les domaines de l’application', async () => {
  const { estHoteSiteKpartners } = await import('./site-public.js');
  for (const h of ['kpartners.immo', 'www.kpartners.immo', 'WWW.KPARTNERS.IMMO']) assert.equal(estHoteSiteKpartners(h), true, h);
  for (const h of ['app.kpartners.immo', 'app.klocka.immo', 'klocka.immo', 'kpartners.localhost']) assert.equal(estHoteSiteKpartners(h), false, h);
});
