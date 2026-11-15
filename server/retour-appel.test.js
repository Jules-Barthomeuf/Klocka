import test from 'node:test';
import assert from 'node:assert/strict';
import { demandeRetour } from '../src/lib/retour-appel.js';
import { ticsDe, construirePrompt, avecTics } from './prospection/retour-appel.js';

test('le « oui » à l\'offre d\'analyse, ou une demande d\'analyse, lance le retour', () => {
  for (const m of ['oui', 'Oui !', 'ouais', 'vas-y', 'Oui merci', 'je veux bien', 'Oui, regardons', 'regardons ensemble', 'on y va', 'Donne-moi ton analyse', 'qu\'est-ce que je peux améliorer ?', 'un retour sur mon appel', 'des conseils']) assert.ok(demandeRetour(m), m);
  for (const m of ['', 'non', 'ajoute une relance jeudi', 'oui et décoche le mail', 'son mail est paul@agence.fr']) assert.ok(!demandeRetour(m), m);
  assert.ok(!demandeRetour('oui', { offert: false }), 'un oui seul, sans offre, ne suffit pas');
});

test('les tics sont relevés avec leur contexte, les plus fréquents d\'abord', () => {
  const t = 'Alors en fait je travaille pour des investisseurs, en fait on a un mandat, et en fait voilà. Un peu partout du coup.';
  const r = ticsDe(t);
  assert.equal(r[0].mot, 'en fait');
  assert.equal(r[0].n, 3);
  assert.ok(r[0].extraits[0].includes('en fait'));
  assert.ok(r.find((x) => x.mot === 'du coup'));
  assert.deepEqual(ticsDe(''), []);
});

test('le prompt porte la grille, la rémunération en positif et la transcription', () => {
  const p = construirePrompt({ appel: { transcription_gardee: 'Bonjour, Maxime de Klocka.', issue_tapee: 'veut_mail', duree_s: 217 }, agence: 'FDI', par: 'Maxime', tics: [] });
  assert.ok(p.includes('Vous gardez 100 % de vos honoraires'));
  assert.ok(p.includes('FDI'));
  assert.ok(p.includes('Bonjour, Maxime de Klocka.'));
  assert.ok(!p.includes('—'));
});

test('la ligne des tics s\'ajoute quand le message l\'a oubliée, pas deux fois', () => {
  const tics = [{ mot: 'en fait', n: 5 }, { mot: 'un peu', n: 4 }];
  assert.ok(avecTics('Bon appel.', tics).endsWith('Vos tics : « en fait » 5 fois, « un peu » 4 fois. Retirez-les : le message gagne en assurance.'));
  assert.equal(avecTics('Vous avez dit « en fait » 5 fois.', tics), 'Vous avez dit « en fait » 5 fois.');
  assert.equal(avecTics('Bon appel.', []), 'Bon appel.');
});
