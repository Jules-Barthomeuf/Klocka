import test from 'node:test';
import assert from 'node:assert/strict';
import { coupables, ligneGel } from './gel.js';

// Un profil : programme > tourPrix (server) > list (server/db.js) ; un échantillon toutes les 10 ms.
const cadre = (id, functionName, url, enfants = []) => ({ id, callFrame: { functionName, url, lineNumber: 9 }, children: enfants });
const profil = {
  nodes: [cadre(1, '(root)', '', [2, 5]), cadre(2, 'tourPrix', 'file:///app/server/off-market/simple.js', [3]), cadre(3, 'list', 'file:///app/server/db.js', [4]), cadre(4, 'parse', ''), cadre(5, '(idle)', '')],
  startTime: 0, endTime: 100_000,
  samples: [4, 4, 4, 4, 5, 5, 4, 4, 5, 5], timeDeltas: Array(10).fill(10_000),
};

test('le gel est attribué aux fonctions du serveur qui tenaient le fil pendant le gel seul', () => {
  // Le gel couvre les 40 premières ms (décalage nul : l'horloge du profil est celle de performance.now()).
  const c = coupables(profil, [[0, 40]], 0);
  assert.equal(c.total_ms, 40);
  // À égalité, la plus proche du haut de la pile d'abord.
  assert.deepEqual(c.serveur, [['list server/db.js:10', 40], ['tourPrix server/off-market/simple.js:10', 40]]);
  assert.deepEqual(c.propre, [['parse', 40]]);
  // Hors du gel, rien n'est compté.
  assert.equal(coupables(profil, [[200, 300]], 0).total_ms, 0);
});

test('la ligne du journal dit le plus long gel et ses coupables', () => {
  const t = performance.now();
  const l = ligneGel([[t - 9200, t], [t - 20000, t - 18000]], { serveur: [['relever server/deal/veille-mails.js:121', 8900]], propre: [] });
  assert.match(l, /^\[gel\] 9,2 s à \d\d:\d\d:\d\d \(2 gels dans la minute\) · relever server\/deal\/veille-mails\.js:121 8,9 s$/);
  assert.match(ligneGel([[t - 2000, t]], { serveur: [], propre: [['(garbage collector)', 1500]] }), /hors du code du serveur : \(garbage collector\) 1,5 s/);
});
