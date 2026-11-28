// La page Productivité (src/lib/productivite.js) : la journée et le temps qui reste avant la pause.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blocsDuJour, compteARebours, enMots, etatDuMoment, nomDeSite, normaliserPlanning, tempsDuJour } from '../src/lib/productivite.js';

const a = (h, m, s = 0) => new Date(2026, 10, 28, h, m, s);
const JOUR = { debut: '09:00', fin: '18:00', pauses: [{ heure: '16:00', duree: 15 }, { heure: '10:30', duree: 10 }] };

test('productivité : pauses rangées, durées bornées, heures illisibles et doublons écartés', () => {
  const p = normaliserPlanning({ debut: '09:00', fin: '18:00', pauses: [{ heure: '14:00', duree: 500 }, { heure: '11:00', duree: 0 }, { heure: 'midi', duree: 10 }, { heure: '14:00', duree: 5 }] });
  assert.deepEqual(p.pauses, [{ heure: '11:00', duree: 1 }, { heure: '14:00', duree: 240 }]);
  assert.deepEqual(normaliserPlanning({ debut: '18:00', fin: '09:00', pauses: [] }).debut, '09:00');
});

test('productivité : la journée en morceaux, travail et pauses', () => {
  const b = blocsDuJour(JOUR).map((x) => `${x.type}:${x.de}-${x.a}`);
  assert.deepEqual(b, ['travail:540-630', 'pause:630-640', 'travail:640-960', 'pause:960-975', 'travail:975-1080']);
});

test("productivité : avant la pause, le temps qui reste jusqu'à elle", () => {
  const e = etatDuMoment(JOUR, a(9, 50));
  assert.equal(e.phase, 'travail');
  assert.equal(e.restant, 40 * 60);
  assert.equal(e.pause.de, 630);
  assert.equal(compteARebours(e.restant), '40:00');
  assert.equal(enMots(e.restant), '40 minutes');
});

test('productivité : pendant la pause, la reprise ; après la dernière, la fin de journée ; puis fini', () => {
  const p = etatDuMoment(JOUR, a(10, 35, 30));
  assert.equal(p.phase, 'pause');
  assert.equal(p.restant, 4 * 60 + 30);
  const d = etatDuMoment(JOUR, a(17, 0));
  assert.equal(d.phase, 'travail');
  assert.equal(d.pause, null);
  assert.equal(d.restant, 3600);
  assert.equal(etatDuMoment(JOUR, a(18, 0)).phase, 'fini');
  const avant = etatDuMoment(JOUR, a(8, 0));
  assert.equal(avant.phase, 'avant');
  assert.equal(avant.restant, 3600);
});

test('productivité : le compte à rebours au-delà d’une heure', () => {
  assert.equal(compteARebours(3909), '1:05:09');
  assert.equal(enMots(3900), '1 h 05');
});

test('productivité : le temps de travail prévu, les pauses, et ce qui reste', () => {
  assert.deepEqual(tempsDuJour(JOUR, a(8, 0)), { travail: 515, pauses: 25, reste: 515 });
  assert.equal(tempsDuJour(JOUR, a(17, 0)).reste, 60);
  assert.equal(tempsDuJour(JOUR, a(19, 0)).reste, 0);
});

test('productivité : les sites bloqués, nettoyés ; YouTube par défaut', () => {
  assert.equal(nomDeSite('https://www.YouTube.com/watch?v=x'), 'youtube.com');
  assert.equal(nomDeSite('pas un site'), null);
  assert.deepEqual(normaliserPlanning({}).sites, ['youtube.com']);
  assert.deepEqual(normaliserPlanning({ sites: ['x.com', 'https://x.com/home', 'rien'] }).sites, ['x.com']);
  assert.equal(normaliserPlanning({ blocage: false }).blocage, false);
});

test("productivité : l'extension du bloqueur et la page disent la même chose, minute par minute", async () => {
  const { enTravail, estBloque } = await import('../extensions/bloqueur-productivite/journee.js');
  const jour = normaliserPlanning({ ...JOUR, pauses: [...JOUR.pauses, { heure: '13:00', duree: 60 }] });
  for (let m = 0; m < 1440; m += 1) {
    const d = a(Math.floor(m / 60), m % 60, 30);
    assert.equal(enTravail(jour, d), etatDuMoment(jour, d).phase === 'travail', `à ${m} min`);
  }
  assert.equal(enTravail({ ...jour, blocage: false }, a(9, 30)), false);
  assert.equal(estBloque('https://m.youtube.com/watch?v=1', ['youtube.com']), true);
  assert.equal(estBloque('https://notyoutube.com/', ['youtube.com']), false);
});
