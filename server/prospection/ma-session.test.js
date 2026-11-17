import test from 'node:test';
import assert from 'node:assert/strict';

const M = await import('./ma-session.js');

const entrees = (issues) => issues.map((issue, i) => ({ appel_id: `a${i}`, issue }));

test('ma session : le record, le taux de décroché contre la moyenne et le record, l\'heure où le record tombe', () => {
  const maintenant = new Date('2026-11-17T09:30:00Z');
  const session = { id: 's', demarree_le: '2026-11-17T09:00:00Z', pauses: [{ de: '2026-11-17T09:10:00Z', a: '2026-11-17T09:20:00Z' }], appels: entrees(['a_des_murs', 'pas_de_reponse', 'pas_de_murs', 'repondeur']) };
  const passees = [
    { id: 'p1', demarree_le: '2026-11-10T09:00:00Z', appels: entrees(Array(6).fill('pas_de_murs').concat(['pas_de_reponse', 'pas_de_reponse'])) },
    { id: 'p2', demarree_le: '2026-11-12T09:00:00Z', appels: entrees(['pas_de_reponse', 'pas_de_reponse', 'pas_de_reponse', 'pas_de_murs', 'pas_de_murs', 'pas_de_reponse']) },
    { id: 'pas-commencee', appels: entrees(Array(30).fill('pas_de_murs')) },
    { id: 'essai', essai: true, demarree_le: '2026-11-11T09:00:00Z', appels: entrees(Array(40).fill('pas_de_murs')) },
  ];
  const b = M.bilanDeSession({ session, passees, maintenant });
  assert.equal(b.etat, 'en_cours');
  assert.equal(b.appels, 4);
  assert.equal(b.record, 8, 'ni une session jamais commencée ni un essai ne font le record');
  assert.equal(b.reste_pour_record, 4);
  assert.equal(b.taux, 50);
  assert.equal(b.taux_record, 75);
  assert.equal(b.taux_moyen, 57, '8 décrochés sur 14 appels');
  assert.equal(b.ecart_moyenne, -7);
  assert.equal(b.ecart_record, -25);
  assert.equal(b.actif_ms, 20 * 60000, 'trente minutes moins dix de pause');
  // 4 appels en 20 minutes : les 4 suivants dans 20 minutes, à 09 h 50 UTC, 10 h 50 à Paris.
  assert.equal(b.record_vers, '10 h 50');
});

test('ma session : commencer, pause, reprendre, terminer ; l\'état suit', () => {
  const s = { demarree_le: '2026-11-17T09:00:00Z', pauses: [{ de: '2026-11-17T09:10:00Z' }] };
  assert.equal(M.etatDe({}), 'pas_commencee');
  assert.equal(M.etatDe(s), 'en_pause');
  assert.equal(M.etatDe({ ...s, pauses: [{ de: '2026-11-17T09:10:00Z', a: '2026-11-17T09:12:00Z' }] }), 'en_cours');
  assert.equal(M.etatDe({ ...s, terminee_le: '2026-11-17T10:00:00Z' }), 'terminee');
  // Pendant une pause, le chronomètre est arrêté.
  assert.equal(M.tempsActif(s, new Date('2026-11-17T09:40:00Z')), 10 * 60000);
});

test('ma session : les fiches de la semaine, par moi et par l\'équipe, et ma meilleure semaine en cumul', () => {
  const moi = 'nora.l@klocka.immo';
  const f = (le, analyste, biens = 1, ecartee = false) => ({ le, analyste, biens, ecartee });
  const r = M.fichesDeLaSemaine({
    moi, maintenant: new Date('2026-11-17T10:00:00Z'),
    fiches: [
      f('2026-11-16T08:00:00Z', moi), f('2026-11-16T09:00:00Z', 'coralie.g@klocka.immo', 5), f('2026-11-17T08:00:00Z', moi, 2),
      f('2026-11-17T08:30:00Z', moi, 4, true), f('2026-11-17T08:40:00Z', null, 3),
      // La semaine d'avant : 2 le lundi, 1 le mercredi, 1 le samedi (compté vendredi).
      f('2026-11-09T08:00:00Z', moi, 2), f('2026-11-11T08:00:00Z', moi), f('2026-11-14T08:00:00Z', moi),
    ],
  });
  assert.equal(r.lundi, '2026-11-16');
  assert.equal(r.aujourdhui, 1);
  assert.deepEqual(r.moi.par_jour, [1, 2, 0, 0, 0]);
  assert.equal(r.moi.total, 3, 'une fiche écartée ne compte pas');
  assert.deepEqual(r.equipe.par_jour, [6, 2, 0, 0, 0], 'une fiche sans analyste (spontanée) ne compte pas pour l\'équipe');
  assert.deepEqual(r.record, { total: 4, cumul: [2, 2, 3, 3, 4] });
});
