// L'onglet Fiches commerciales : la remise à zéro, les étapes, les semaines,
// le record, et le vrai agent de chaque fiche.

import test from 'node:test';
import assert from 'node:assert/strict';
import { etapeDuDossier, listerFiches, statsParSemaine, recordDeFiches, semaineDe, expediteurDOrigine, agentDeLaFiche } from './fiches-stats.js';

const lot = { lot: { adresse: { valeur: { ville: 'Paris' } } }, evaluation: { verdict: 'GO' } };
const equipe = (e) => /@klocka\.immo$/.test(e) || e === 'jules.btmf@gmail.com';

test('les étapes : reçue, Oui, présentée, aboutie ; un projet sans client reste un Oui', () => {
  const projets = new Map([['d3', { id: 'p3' }], ['d4', { id: 'p4', client_emails: ['c@x.fr'] }], ['d5', { id: 'p5', statut: 'signe', client_email: 'c@x.fr' }]]);
  assert.equal(etapeDuDossier({ deal_id: 'd0', statut: 'analyse' }, projets), 'recue');
  assert.equal(etapeDuDossier({ deal_id: 'd1', statut: 'documents_demandes' }, projets), 'oui');
  assert.equal(etapeDuDossier({ deal_id: 'd1b', statut: 'abandonne', suivi: [{ intention: 'demande_documents' }] }, projets), 'oui', 'abandonné après un Oui : le Oui compte');
  assert.equal(etapeDuDossier({ deal_id: 'd2', statut: 'abandonne' }, projets), 'non');
  assert.equal(etapeDuDossier({ deal_id: 'd3', statut: 'projet_cree' }, projets), 'oui');
  assert.equal(etapeDuDossier({ deal_id: 'd4' }, projets), 'presente');
  assert.equal(etapeDuDossier({ deal_id: 'd5' }, projets), 'abouti');
});

test('le vrai agent : jamais quelqu\'un de l\'équipe, l\'expéditeur d\'origine d\'un transfert, la correction d\'abord', () => {
  const transfert = { de: 'Jules Barthomeuf <jules.btmf@gmail.com>', de_email: 'jules.btmf@gmail.com', texte: "Voilà la fiche\n\n---------- Message transféré ---------\nDe : Laurent Sebban <laurent.sebban@pointdevente.fr>\nDate : 23 sept.\nObjet : Glacier" };
  assert.deepEqual(expediteurDOrigine(transfert.texte, equipe), { email: 'laurent.sebban@pointdevente.fr', nom: 'Laurent Sebban' });
  assert.deepEqual(agentDeLaFiche({ mail: transfert }, equipe), { email: 'laurent.sebban@pointdevente.fr', nom: 'Laurent Sebban' });
  assert.deepEqual(agentDeLaFiche({ mail: { de: 'Sophie <sophie@barnes.fr>', de_email: 'sophie@barnes.fr' } }, equipe), { email: 'sophie@barnes.fr', nom: 'Sophie' });
  assert.equal(agentDeLaFiche({ mail: { de_email: 'paul.dz@klocka.immo', texte: 'rien' }, contact: 'paul.dz@klocka.immo' }, equipe), null, 'Paul n\'est pas un agent');
  assert.deepEqual(agentDeLaFiche({ corrige: { nom: 'Rosario Aiello', email: 'a.r@wanadoo.fr' }, mail: transfert }, equipe), { email: 'a.r@wanadoo.fr', nom: 'Rosario Aiello', corrige: true });
});

test('la remise à zéro : seules les fiches arrivées depuis comptent, une fois chacune', () => {
  const deals = [
    { deal_id: 'd1', nom: 'Glacier - Paris', created_date: '2026-09-25T11:15:00Z', source: {}, lots: [lot], source_mail: { mail_recu_id: 'm1' }, statut: 'documents_demandes' },
    { deal_id: 'vieux', nom: 'Essai d\'avant', created_date: '2026-09-20T10:00:00Z', source: {}, lots: [lot] },
    { deal_id: 'coquille', nom: 'Nommé à la main', created_date: '2026-09-25T10:00:00Z', lots: [] },
  ];
  const mails = [
    { id: 'm1', date: '2026-09-25T11:07:00Z', de: 'Laurent Sebban <laurent@pdv.fr>', de_email: 'laurent@pdv.fr', compte: 'jules.b@klocka.immo', deal_id: 'd1', pieces_jointes: [{ nom: 'fiche.pdf' }] },
    { id: 'm2', date: '2026-09-25T13:00:00Z', de_email: 'sophie@barnes.fr', objet: 'Murs Lyon', compte: 'sourcing@klocka.immo', pieces_jointes: [{ nom: 'Fiche Lyon.pdf' }] },
    { id: 'm3', date: '2026-09-25T13:30:00Z', de_email: 'nora.l@klocka.immo', interne: true, texte: 'on regarde ?', pieces_jointes: [{ nom: 'fiche.pdf' }] },
  ];
  const f = listerFiches({ deals, mails, projets: [] }, { depuis: '2026-09-24T22:00:00.000Z', estInterne: equipe });
  assert.deepEqual(f.map((x) => x.id), ['mail:m2', 'd1'], 'ni l\'essai d\'avant la remise à zéro, ni la coquille, ni l\'échange interne');
  assert.equal(f[1].le, '2026-09-25T11:07:00Z', 'la date d\'arrivée du mail, pas celle du dossier');
  assert.equal(f[1].agent, 'Laurent Sebban');
  assert.equal(f[0].a_preanalyser, true);
});

test('les semaines et le record', () => {
  const maintenant = new Date('2026-10-02T12:00:00Z');
  assert.equal(semaineDe('2026-09-25T12:00:00Z'), '2026-09-21');
  const fiches = [
    { le: '2026-09-29T10:00:00Z', etape: 'presente' },
    { le: '2026-09-30T10:00:00Z', etape: 'non' },
    { le: '2026-09-25T10:00:00Z', etape: 'oui' },
    { le: '2026-09-25T11:00:00Z', etape: 'recue' },
    { le: '2026-09-26T10:00:00Z', etape: 'abouti' },
  ];
  const s = statsParSemaine(fiches, { semaines: 2, maintenant });
  assert.deepEqual(s.map((x) => x.semaine), ['2026-09-21', '2026-09-28']);
  assert.deepEqual(s[0], { semaine: '2026-09-21', fiches: 3, oui: 2, presente: 1, abouti: 1 });
  assert.deepEqual(s[1], { semaine: '2026-09-28', fiches: 2, oui: 1, presente: 1, abouti: 0 });
  assert.deepEqual(recordDeFiches(fiches), { semaine: '2026-09-21', fiches: 3 });
});
