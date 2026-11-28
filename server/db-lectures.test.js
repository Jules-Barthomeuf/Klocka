// Les lectures rapides de Records (27 nov. 2026, Jules : « le moins de temps de chargement possible ») : findBy par
// l'index du jeton, les journaux élagués dans la base, les agences gardées décodées et jetées à chaque écriture, le
// dernier élément d'une liste lu par champs, la veille d'ALX sans le journal entier.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-lectures-'));
const { default: db, Records, oublierLectures } = await import('./db.js');

test('findBy retrouve une session par son jeton, et passe par l\'index', () => {
  Records.create('Session', { token: 'abc', user_email: 'a@b.fr' });
  Records.create('Session', { token: 'def', user_email: 'c@d.fr' });
  assert.equal(Records.findBy('Session', 'token', 'def').user_email, 'c@d.fr');
  assert.equal(Records.findBy('Session', 'token', 'inconnu'), null);
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM records WHERE entity = 'Session' AND json_extract(data, '$.token') = ? LIMIT 1").all('x');
  assert.match(plan.map((l) => l.detail).join(' '), /idx_records_token/);
  // Un champ sans index garde la recherche d'avant.
  Records.create('Note', { cle: 'k1' });
  assert.equal(Records.findBy('Note', 'cle', 'k1').cle, 'k1');
});

test('elaguer garde les plus récentes au champ « le » et redescend sous le plafond', () => {
  for (let i = 0; i < 25; i += 1) Records.create('JournalEssai', { le: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), i });
  assert.equal(Records.elaguer('JournalEssai', 30), 0);
  const partis = Records.elaguer('JournalEssai', 20);
  assert.equal(partis, 6); // 25 - floor(20 × 0,95)
  const restes = Records.list('JournalEssai').map((x) => x.i).sort((a, b) => a - b);
  assert.deepEqual(restes, Array.from({ length: 19 }, (_, k) => k + 6));
});

test('les agences gardées décodées suivent chaque écriture, et une lecture modifiée ne touche pas la copie gardée', () => {
  const a = Records.create('AgenceProspect', { nom: 'Agence A', liste_id: 'L1', agents: [{ nom: 'Paul' }] });
  Records.create('AgenceProspect', { nom: 'Agence B', liste_id: 'L2' });
  assert.equal(Records.list('AgenceProspect').length, 2);
  // Une fiche lue puis changée en surface : la lecture suivante ne le voit pas.
  const lue = Records.list('AgenceProspect').find((x) => x.id === a.id);
  lue.nom = 'Changé en mémoire';
  assert.equal(Records.list('AgenceProspect').find((x) => x.id === a.id).nom, 'Agence A');
  // update, create, delete : la lecture suivante est juste.
  Records.update('AgenceProspect', a.id, { nom: 'Agence A bis' });
  assert.equal(Records.list('AgenceProspect').find((x) => x.id === a.id).nom, 'Agence A bis');
  assert.deepEqual(Records.filter('AgenceProspect', { liste_id: 'L1' }).map((x) => x.nom), ['Agence A bis']);
  const c = Records.create('AgenceProspect', { nom: 'Agence C', liste_id: 'L1' });
  assert.equal(Records.filter('AgenceProspect', { liste_id: 'L1' }).length, 2);
  Records.delete('AgenceProspect', c.id);
  assert.equal(Records.list('AgenceProspect').length, 2);
  // Tri par défaut (-created_date), tri demandé, limite.
  assert.equal(Records.list('AgenceProspect', { sort: 'nom' })[0].nom, 'Agence A bis');
  assert.equal(Records.list('AgenceProspect', { limit: 1 }).length, 1);
  // Une écriture directe en SQL : oublierLectures la fait voir.
  db.prepare("UPDATE records SET data = json_set(data, '$.nom', 'Direct') WHERE id = ?").run(a.id);
  oublierLectures();
  assert.equal(Records.get('AgenceProspect', a.id).nom, 'Direct');
  assert.equal(Records.list('AgenceProspect').find((x) => x.id === a.id).nom, 'Direct');
});

test('champs lit le dernier élément d\'une liste, et la veille d\'ALX ne rend que le parcours utile', async () => {
  const v = Records.create('Ville', { nom: 'Annecy', parcours: { etat: 'erreur', phase: 'commerces', rues_faites: 3, journal: [{ texte: 'un' }, { texte: 'deux' }], rues_a_faire: ['a', 'b'] } });
  const ligne = Records.champs('Ville', ['parcours.journal[#-1]']).find((x) => x.id === v.id);
  assert.deepEqual(ligne['parcours.journal[#-1]'], { texte: 'deux' });
  const { listerVillesLeger } = await import('./alx/index.js');
  const lue = listerVillesLeger().find((x) => x.id === v.id);
  assert.equal(lue.parcours.etat, 'erreur');
  assert.equal(lue.parcours.rues_faites, 3);
  assert.deepEqual(lue.parcours.journal, [{ texte: 'deux' }]);
  assert.equal(lue.parcours.rues_a_faire, undefined);
  // Une ville jamais lancée n'a pas de parcours.
  const w = Records.create('Ville', { nom: 'Évian' });
  assert.equal(listerVillesLeger().find((x) => x.id === w.id).parcours, null);
});
