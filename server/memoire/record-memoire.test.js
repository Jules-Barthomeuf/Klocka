// Le record de fiches reçues compté dans la Mémoire (24 nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-record-memoire-'));
const { Records, Meta } = await import('../db.js');
const R = await import('./record-memoire.js');

const MAX = 'maxime.p@klocka.immo';
const mails = new Map([['m1', { id: 'm1', compte: 'sourcing@klocka.immo', de_email: MAX }], ['m2', { id: 'm2', compte: 'sourcing@klocka.immo', de_email: 'jules.b@klocka.immo' }]]);
const deals = new Map([['d1', { deal_id: 'd1', responsable_email: 'nora.l@klocka.immo' }]]);

test('qui a envoyé : le collègue du transfert, le titulaire de la boîte, le responsable du dossier', () => {
  assert.equal(R.quiDuBien({ origine: 'transfert', compte: 'sourcing@klocka.immo', par: MAX }, { mails, deals }), MAX);
  assert.equal(R.quiDuBien({ origine: 'transfert', compte: 'sourcing@klocka.immo', mail_recu_id: 'm1' }, { mails, deals }), MAX);
  assert.equal(R.quiDuBien({ origine: 'scraper', compte: 'paul.dz@klocka.immo' }, { mails, deals }), 'paul.dz@klocka.immo');
  assert.equal(R.quiDuBien({ origine: 'veille', compte: 'sourcing@klocka.immo', mail_recu_id: 'm2' }, { mails, deals }), 'jules.b@klocka.immo');
  assert.equal(R.quiDuBien({ origine: 'dossier', deal_id: 'd1' }, { mails, deals }), 'nora.l@klocka.immo');
});

test('une semaine du lundi au dimanche : les fiches par personne, sans appels ni annonces, un renvoi une fois, les lots d\'un envoi chacun', () => {
  const b = (o) => ({ id: Math.random().toString(36).slice(2), ...o });
  const biens = [
    // Sept commerces du même immeuble, un seul envoi : sept fiches.
    ...Array.from({ length: 7 }, (_, i) => b({ origine: 'transfert', par: MAX, mail_recu_id: 'm1', recu_le: '2026-11-20', cle_adresse: '109|quai de la banquiere|06730', surface_m2: 50 + i })),
    // Le même bien rentré par la veille puis en dossier : une fois.
    b({ origine: 'scraper', compte: MAX, recu_le: '2026-11-18', ville: 'Blagnac', prix: 125000, surface_m2: 30, mail_recu_id: 'm9' }),
    b({ origine: 'dossier', deal_id: 'd1', recu_le: '2026-11-18', ville: 'Blagnac', prix: 125000, surface_m2: 30 }),
    // Ni appel, ni annonce, ni copie d'un dossier supprimé.
    b({ origine: 'appel', par: MAX, recu_le: '2026-11-18', ville: 'Montpellier' }),
    b({ origine: 'equimmox', recu_le: '2026-11-18', ville: 'Nice' }),
    b({ origine: 'suppression', recu_le: '2026-11-18', ville: 'Le Crès' }),
    // Le dimanche 22 compte encore ; le lundi 23 est la semaine suivante.
    b({ origine: 'transfert', par: 'jules.b@klocka.immo', recu_le: '2026-11-22T21:30:00Z', ville: 'Angers', mail_recu_id: 'm2' }),
    b({ origine: 'transfert', par: MAX, recu_le: '2026-11-23', ville: 'Pau', mail_recu_id: 'm3' }),
  ];
  const s = R.fichesParSemaine(biens, { mails, deals });
  assert.deepEqual(s.map((x) => [x.semaine, x.total]), [['2026-11-16', 9], ['2026-11-23', 1]]);
  assert.deepEqual(s[0].par, { [MAX]: 8, 'jules.b@klocka.immo': 1 });
  assert.deepEqual(R.recordDes(s.slice(0, 1)), { email: MAX, fiches: 8, semaine: '2026-11-16' });
});

test('le dimanche soir, la semaine se vérifie une fois, et le record change s\'il est battu', () => {
  const cree = (o) => Records.create('BienMemoire', { statut: 'memoire', ...o });
  for (let i = 0; i < 3; i += 1) cree({ origine: 'transfert', par: MAX, recu_le: '2026-11-10', ville: `A${i}`, mail_recu_id: `a${i}` });
  for (let i = 0; i < 5; i += 1) cree({ origine: 'transfert', par: 'nora.l@klocka.immo', recu_le: '2026-11-18', ville: `B${i}`, mail_recu_id: `b${i}` });
  const journal = () => {};
  // Mardi 17 nov. : la dernière semaine finie, celle du lundi 9, se vérifie (record de Maxime, 3).
  const a = R.verifierRecord({ maintenant: new Date('2026-11-17T08:00:00Z'), journal });
  assert.deepEqual([a.semaine, a.battu, a.record.email, a.record.fiches], ['2026-11-09', true, MAX, 3]);
  assert.equal(R.verifierRecord({ maintenant: new Date('2026-11-18T08:00:00Z'), journal }), null, 'une fois par semaine');
  // Dimanche 23 nov., 22 h 30 à Paris : la semaine du 16 se compte ; Nora bat le record avec 5.
  const b = R.verifierRecord({ maintenant: new Date('2026-11-23T21:30:00Z'), journal });
  assert.deepEqual([b.semaine, b.battu, b.record.email, b.record.fiches], ['2026-11-16', true, 'nora.l@klocka.immo', 5]);
  assert.equal(R.recordGarde().email, 'nora.l@klocka.immo');
  assert.ok(Meta.get('record.memoire'));
});

test('une fiche supprimée de la Mémoire ne compte plus', () => {
  const b = { id: 'x1', origine: 'transfert', par: MAX, recu_le: '2026-11-17', ville: 'Nice', mail_recu_id: 'z1' };
  assert.equal(R.fichesParSemaine([b], { mails, deals })[0].total, 1);
  assert.equal(R.fichesParSemaine([{ ...b, supprime_le: '2026-11-24' }], { mails, deals }).length, 0);
});

test('la carte « Fiches reçues » : la semaine en cours depuis le lundi, la semaine d\'avant au même jour', () => {
  const l = (jour) => ({ jour, semaine: R.lundiDe(jour), qui: MAX });
  const lignes = [l('2026-11-17'), l('2026-11-18'), l('2026-11-20'), l('2026-11-23'), l('2026-11-24'), l('2026-11-24')];
  const c = R.carteFichesRecues(lignes, { aujourdhui: '2026-11-24', n: 2 });
  assert.equal(c.depuis, '2026-11-23');
  assert.equal(c.fiches, 3);
  assert.equal(c.avant, 1, 'du lundi 16 au mardi 17 : seulement le 17');
  assert.deepEqual(c.semaines, [{ semaine: '2026-11-16', fiches: 3 }, { semaine: '2026-11-23', fiches: 3 }]);
});
