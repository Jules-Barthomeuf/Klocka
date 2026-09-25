// L'onglet Fiches commerciales : les étapes, les semaines, le record, les agents.

import test from 'node:test';
import assert from 'node:assert/strict';
import { etapeDuDossier, listerFiches, statsParSemaine, recordDeFiches, agentsDeLaPeriode, semaineDe } from './fiches-stats.js';

const lot = { lot: { adresse: { valeur: { ville: 'Paris' } } }, evaluation: { verdict: 'GO' } };

test('la dernière étape atteinte par un dossier', () => {
  const projets = new Map([['d3', { id: 'p3' }], ['d4', { id: 'p4', client_emails: ['c@x.fr'] }], ['d5', { id: 'p5', statut: 'signe', client_email: 'c@x.fr' }]]);
  assert.equal(etapeDuDossier({ deal_id: 'd0', statut: 'analyse' }, projets), 'recue');
  assert.equal(etapeDuDossier({ deal_id: 'd1', statut: 'documents_demandes' }, projets), 'oui');
  assert.equal(etapeDuDossier({ deal_id: 'd1b', statut: 'abandonne', suivi: [{ intention: 'demande_documents' }] }, projets), 'oui', 'abandonné après un Oui : le Oui compte');
  assert.equal(etapeDuDossier({ deal_id: 'd2', statut: 'abandonne' }, projets), 'non');
  assert.equal(etapeDuDossier({ deal_id: 'd3', statut: 'projet_cree' }, projets), 'projet');
  assert.equal(etapeDuDossier({ deal_id: 'd4' }, projets), 'presente');
  assert.equal(etapeDuDossier({ deal_id: 'd5' }, projets), 'abouti');
});

test('les fiches : les dossiers nés d\'une fiche et les fiches pas encore préanalysées, une seule fois chacune', () => {
  const deals = [
    { deal_id: 'd1', nom: 'Glacier - Paris', created_date: '2026-09-24T11:15:00Z', source: {}, lots: [lot], source_mail: { mail_recu_id: 'm1' }, statut: 'documents_demandes' },
    { deal_id: 'coquille', nom: 'Nommé à la main', created_date: '2026-09-24T10:00:00Z', lots: [] },
    { deal_id: 'test', test: true, lots: [lot] },
  ];
  const mails = [
    { id: 'm1', date: '2026-09-24T11:07:00Z', de: 'Laurent Sebban <laurent@pdv.fr>', de_email: 'laurent@pdv.fr', compte: 'jules.b@klocka.immo', deal_id: 'd1', pieces_jointes: [{ nom: 'fiche.pdf' }] },
    { id: 'm2', date: '2026-09-25T09:00:00Z', de_email: 'sophie@barnes.fr', objet: 'Murs Lyon', compte: 'sourcing@klocka.immo', pieces_jointes: [{ nom: 'Fiche Lyon.pdf' }] },
    { id: 'm3', date: '2026-09-25T09:30:00Z', de_email: 'nora.l@klocka.immo', interne: true, pieces_jointes: [{ nom: 'fiche.pdf' }] },
  ];
  const f = listerFiches({ deals, mails, projets: [] });
  assert.deepEqual(f.map((x) => x.id), ['mail:m2', 'd1']);
  assert.equal(f[1].le, '2026-09-24T11:07:00Z', 'la date d\'arrivée du mail, pas celle du dossier');
  assert.equal(f[1].agent_email, 'laurent@pdv.fr');
  assert.equal(f[1].etape, 'oui');
  assert.equal(f[0].a_preanalyser, true);
});

test('les semaines, le record, les appels et les agents', () => {
  const maintenant = new Date('2026-09-25T12:00:00Z');
  assert.equal(semaineDe('2026-09-25T12:00:00Z'), '2026-09-21');
  const fiches = [
    { le: '2026-09-22T10:00:00Z', etape: 'presente', agent_email: 'a@x.fr', agent: 'Anne' },
    { le: '2026-09-23T10:00:00Z', etape: 'non', agent_email: 'b@x.fr', agent: 'Bob' },
    { le: '2026-09-16T10:00:00Z', etape: 'oui', agent_email: 'a@x.fr', agent: 'Anne' },
    { le: '2026-09-15T10:00:00Z', etape: 'recue', agent_email: 'b@x.fr', agent: 'Bob' },
    { le: '2026-09-14T10:00:00Z', etape: 'recue', agent_email: 'b@x.fr', agent: 'Bob' },
  ];
  const appels = [{ le: '2026-09-22T08:00:00Z', resultat: 'fiche_promise' }, { le: '2026-09-22T08:10:00Z', resultat: 'pas_de_reponse' }];
  const s = statsParSemaine(fiches, appels, { semaines: 2, maintenant });
  assert.deepEqual(s.map((x) => x.semaine), ['2026-09-14', '2026-09-21']);
  assert.deepEqual(s[1], { semaine: '2026-09-21', fiches: 2, oui: 1, projet: 1, presente: 1, abouti: 0, appels: 2, appels_fiche: 1 });
  assert.equal(s[0].fiches, 3);
  assert.deepEqual(recordDeFiches(fiches), { semaine: '2026-09-14', fiches: 3 });
  const agents = agentsDeLaPeriode(fiches);
  assert.equal(agents[0].email, 'a@x.fr', 'classés par fiches qui ont eu un Oui');
  assert.deepEqual([agents[0].fiches, agents[0].oui], [2, 2]);
});
