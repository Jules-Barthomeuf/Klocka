// Les fiches reçues par analyste : le rattachement (appel, transfert, correction), le compte des biens, le taux.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analysteDeLaFiche, appelsParAdresse, fichesParAnalyste } from './fiches-par-analyste.js';
import { biensDe, transfereePar } from '../deal/fiches-stats.js';

const EQUIPE = [{ prenom: 'Coralie', email: 'coralie.g@klocka.immo' }, { prenom: 'Nora', email: 'nora.l@klocka.immo' }];
const agents = new Map([['a1', { id: 'a1', emails: ['martin@foncia-antibes.fr'] }]]);
const agences = new Map([['g1', { id: 'g1', email: 'contact@cabinet-x.fr', agents: [{ email: 'paul@cabinet-x.fr' }] }]]);

test('une fiche revient à qui a appelé son agent dans les 60 jours, sinon à qui l\'a transférée', () => {
  const appels = [{ par: 'coralie.g@klocka.immo', agent_id: 'a1', le: '2026-11-01T09:00:00Z' }, { par: 'nora.l@klocka.immo', agence_id: 'g1', le: '2026-11-02T09:00:00Z' }];
  const par = appelsParAdresse(appels, { agents, agences });
  const equipe = new Set(EQUIPE.map((m) => m.email));
  assert.deepEqual(analysteDeLaFiche({ agent_email: 'Martin@foncia-antibes.fr', le: '2026-11-10T10:00:00Z' }, par, { equipe }), { analyste: 'coralie.g@klocka.immo', via: 'appel', appel_le: '2026-11-01T09:00:00Z' });
  // L'agent de l'agence appelée, joint par la fiche de l'agence.
  assert.equal(analysteDeLaFiche({ agent_email: 'paul@cabinet-x.fr', le: '2026-11-05T10:00:00Z' }, par, { equipe }).analyste, 'nora.l@klocka.immo');
  // Un appel passé après la fiche ne compte pas ; trop vieux non plus.
  assert.equal(analysteDeLaFiche({ agent_email: 'martin@foncia-antibes.fr', le: '2026-10-30T10:00:00Z' }, par, { equipe }).via, 'spontanee');
  assert.equal(analysteDeLaFiche({ agent_email: 'martin@foncia-antibes.fr', le: '2027-02-01T10:00:00Z' }, par, { equipe }).via, 'spontanee');
  // Sans appel, la personne qui l'a transférée ; la correction l'emporte sur tout.
  assert.deepEqual(analysteDeLaFiche({ agent_email: 'x@y.fr', transferee_par: 'nora.l@klocka.immo', le: '2026-11-10T10:00:00Z' }, par, { equipe }), { analyste: 'nora.l@klocka.immo', via: 'transfert' });
  assert.equal(analysteDeLaFiche({ agent_email: 'martin@foncia-antibes.fr', le: '2026-11-10T10:00:00Z', compte: { analyste: 'Nora.L@klocka.immo' } }, par, { equipe }).analyste, 'nora.l@klocka.immo');
  // « Personne » à la main : spontanée, même si l'agent a été appelé.
  assert.deepEqual(analysteDeLaFiche({ agent_email: 'martin@foncia-antibes.fr', le: '2026-11-10T10:00:00Z', compte: { analyste: 'personne' } }, par, { equipe }), { analyste: null, via: 'spontanee' });
});

test('une fiche compte ses biens : les lots lus, la correction, au moins un', () => {
  assert.equal(biensDe({ lots: [{}, {}, {}] }), 3);
  assert.equal(biensDe({}), 1);
  assert.equal(biensDe({ lots: [{}], fiche_compte: { biens: 4 } }), 4);
  assert.equal(transfereePar({ de_email: 'Coralie.G@klocka.immo', interne: true }), 'coralie.g@klocka.immo');
  assert.equal(transfereePar({ de_email: 'martin@foncia-antibes.fr' }, () => false), null);
});

test('le tableau : biens suite à l\'appel pour 100 appels, spontanées et fiches écartées à part', () => {
  const appels = Array.from({ length: 20 }, (_, i) => ({ par: 'coralie.g@klocka.immo', agent_id: i === 0 ? 'a1' : `z${i}`, le: '2026-11-03T09:00:00Z' }));
  const fiches = [
    { id: 'd1', le: '2026-11-06T10:00:00Z', agent_email: 'martin@foncia-antibes.fr', biens: 3, titre: 'Trois murs' },
    { id: 'd2', le: '2026-11-07T10:00:00Z', agent_email: 'inconnu@agence.fr', biens: 1 },
    { id: 'd3', le: '2026-11-07T11:00:00Z', agent_email: 'martin@foncia-antibes.fr', biens: 1, compte: { pas_fiche: true } },
    { id: 'd4', le: '2026-11-08T10:00:00Z', agent_email: 'autre@agence.fr', transferee_par: 'nora.l@klocka.immo', biens: 2 },
  ];
  const r = fichesParAnalyste({ fiches, appels, agents, equipe: EQUIPE, depuis: '2026-11-01T00:00:00Z', maintenant: new Date('2026-11-10T12:00:00Z') });
  assert.deepEqual(r.total, { appels: 20, biens: 6, biens_appel: 3, biens_transfert: 2, biens_spontanes: 1, ecartees: 1 });
  const coralie = r.analystes.find((a) => a.prenom === 'Coralie');
  assert.equal(coralie.biens_appel, 3);
  assert.equal(coralie.pour_100_appels, 15);
  const nora = r.analystes.find((a) => a.prenom === 'Nora');
  assert.equal(nora.biens_transfert, 2);
  assert.equal(nora.pour_100_appels, null);
  const semaine = r.semaines.find((s) => s.semaine === '2026-11-02');
  assert.deepEqual(semaine, { semaine: '2026-11-02', appels: 20, biens_appel: 3, biens: 6 });
  assert.equal(r.fiches.find((f) => f.id === 'd3').biens, 0);
});
