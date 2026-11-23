// Les fiches reçues par analyste : le rattachement (appel, transfert, correction), le compte des biens, le taux.

import test from 'node:test';
import assert from 'node:assert/strict';
import { analysteDeLaFiche, appelsParAdresse, fichesParAnalyste, recordAnalyste } from './fiches-par-analyste.js';
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
    { id: 'd1', deal_id: 'd1', le: '2026-11-06T10:00:00Z', agent_email: 'martin@foncia-antibes.fr', agent: 'Martin', ville: 'Antibes', biens: 3, titre: 'Trois murs', etape: 'presente' },
    { id: 'd2', le: '2026-11-07T10:00:00Z', agent_email: 'inconnu@agence.fr', biens: 1 },
    { id: 'd3', le: '2026-11-07T11:00:00Z', agent_email: 'martin@foncia-antibes.fr', biens: 1, compte: { pas_fiche: true } },
    { id: 'd4', le: '2026-11-08T10:00:00Z', agent_email: 'autre@agence.fr', transferee_par: 'nora.l@klocka.immo', biens: 2, etape: 'non' },
  ];
  const r = fichesParAnalyste({ fiches, appels, agents, equipe: EQUIPE, depuis: '2026-11-01T00:00:00Z', maintenant: new Date('2026-11-10T12:00:00Z') });
  // Tout compte en fiches (22 nov. 2026, Jules : « un pdf avec plusieurs fiches dedans et ça en compte qu'une ») : le PDF
  // de trois murs en vaut trois, partout ; `envois` garde les trois mails comptés.
  assert.deepEqual(r.total, { appels: 20, biens: 6, biens_appel: 3, biens_transfert: 2, biens_spontanes: 1, ecartees: 1, fiches: 6, envois: 3, dossiers: 3, oui: 3, presente: 3, abouti: 0, non: 2, sans_analyste: 1, a_verifier: 0, listes: 0, biens_listes: 0, non_rentrees: 0, fiches_appel: 3, fiches_par_appel: 15 });
  const coralie = r.analystes.find((a) => a.prenom === 'Coralie');
  assert.equal(coralie.biens_appel, 3);
  assert.equal(coralie.pour_100_appels, 15);
  // Trois fiches suite à un appel (un PDF) pour vingt appels : 15 %.
  assert.equal(coralie.fiches_par_appel, 15);
  // L'entonnoir par analyste : la fiche présentée a eu son Oui.
  assert.deepEqual([coralie.fiches, coralie.envois, coralie.dossiers, coralie.oui, coralie.presente, coralie.taux_oui], [3, 1, 3, 3, 3, 100]);
  const nora = r.analystes.find((a) => a.prenom === 'Nora');
  assert.equal(nora.biens_transfert, 2);
  assert.equal(nora.pour_100_appels, null);
  assert.deepEqual([nora.non, nora.taux_oui], [2, 0]);
  const semaine = r.semaines.find((s) => s.semaine === '2026-11-02');
  assert.deepEqual(semaine, { semaine: '2026-11-02', appels: 20, biens_appel: 3, biens: 6, fiches: 6, envois: 3, dossiers: 3, oui: 3, par_analyste: { 'coralie.g@klocka.immo': 3, personne: 1, 'nora.l@klocka.immo': 2 }, fiches_par_analyste: { 'coralie.g@klocka.immo': 3, personne: 1, 'nora.l@klocka.immo': 2 }, dossiers_par_analyste: { 'coralie.g@klocka.immo': 3 } });
  // Global : les agents et les villes qui envoient le plus, le record de biens en une semaine.
  assert.deepEqual(r.agents[0], { cle: 'martin@foncia-antibes.fr', nom: 'Martin', fiches: 3, biens: 3, oui: 3, analyste: 'Coralie', analyste_email: 'coralie.g@klocka.immo', ville: 'Antibes' });
  assert.deepEqual(r.villes.map((v) => v.nom), ['Antibes']);
  assert.deepEqual(r.record, { semaine: '2026-11-02', biens: 6 });
  assert.equal(r.fiches.find((f) => f.id === 'd3').biens, 0);
});

test('le record d\'un analyste : le plus de fiches en une semaine, un PDF de trois fiches en vaut trois', () => {
  const qui = (f) => f.qui;
  const fiches = [
    { le: '2026-11-03T09:00:00Z', qui: 'nora.l@klocka.immo', biens: 1 },
    { le: '2026-11-05T09:00:00Z', qui: 'nora.l@klocka.immo', biens: 1 },
    { le: '2026-11-10T09:00:00Z', qui: 'coralie.g@klocka.immo', biens: 3 },
    { le: '2026-11-11T09:00:00Z', qui: 'coralie.g@klocka.immo', biens: 1 },
    { le: '2026-11-12T09:00:00Z', qui: null, biens: 1 },
    { le: '2026-11-12T10:00:00Z', qui: null, biens: 1 },
    { le: '2026-11-12T11:00:00Z', qui: null, biens: 1 },
  ];
  assert.deepEqual(recordAnalyste(fiches, qui, (e) => e.split('.')[0]), { email: 'coralie.g@klocka.immo', semaine: '2026-11-09', fiches: 4, biens: 4, envois: 2, prenom: 'coralie' });
  // Trois mails d'une fiche contre un PDF de quatre : le PDF l'emporte.
  const pdf = [
    { le: '2026-11-03T09:00:00Z', qui: 'nora.l@klocka.immo', biens: 1 }, { le: '2026-11-04T09:00:00Z', qui: 'nora.l@klocka.immo', biens: 1 }, { le: '2026-11-05T09:00:00Z', qui: 'nora.l@klocka.immo', biens: 1 },
    { le: '2026-11-10T09:00:00Z', qui: 'maxime.p@klocka.immo', biens: 4 },
  ];
  assert.equal(recordAnalyste(pdf, qui).email, 'maxime.p@klocka.immo');
  // Une fiche écartée (« pas une fiche ») ne compte pas.
  assert.equal(recordAnalyste([{ le: '2026-11-10T09:00:00Z', qui: 'nora.l@klocka.immo', biens: 1, compte: { pas_fiche: true } }], qui), null);
  assert.equal(recordAnalyste([], qui), null);
});
