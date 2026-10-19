import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-appels-v2-'));
delete process.env.APPELS_V2;
const V2 = await import('./appels-v2.js');
const A = await import('./appel.js');
const { Records } = await import('../db.js');

const MAINT = new Date('2026-10-19T10:00:00Z');

test("l'interrupteur : éteint par défaut, allumé par la base, l'environnement l'emporte", () => {
  assert.equal(V2.appelsV2Actif(), false);
  assert.equal(V2.poserAppelsV2(true), true);
  process.env.APPELS_V2 = '0';
  assert.equal(V2.appelsV2Actif(), false);
  delete process.env.APPELS_V2;
  assert.equal(V2.appelsV2Actif(), true);
  V2.poserAppelsV2(false);
  assert.equal(V2.effortFinal(), 'low');
  process.env.APPEL_EFFORT_FINAL = 'medium';
  assert.equal(V2.effortFinal(), 'medium');
  delete process.env.APPEL_EFFORT_FINAL;
});

test("le contexte : biens envoyés, trois derniers mails, statut, tentatives, relance, collègues de l'agence", () => {
  const a = { id: 'a1', nom: 'Manon Primo', agence: 'Primo Immobilier', emails: ['manon@primo.fr'], statut: 'a_rappeler', tentatives: 2, dernier_contact_le: '2026-10-12T09:00:00Z', prochaine: { le: '2026-10-20', quoi: 'rappeler (essai 3 sur 3)' } };
  const c = V2.contexteAgent(a, {
    agents: [a, { id: 'a2', nom: 'Luc Primo', agence: 'Primo  Immobilier', statut: 'nouveau' }, { id: 'a3', nom: 'Autre', agence: 'Orpi' }, { id: 'a4', nom: 'Archivé', agence: 'Primo Immobilier', statut: 'archive' }],
    deals: [{ nom: 'Boulangerie Dupont', statut: 'analyse', contact_agent_email: 'MANON@primo.fr', cree_le: '2026-10-10T10:00:00Z' }, { nom: 'Ancien', archived: true, contact_agent_email: 'manon@primo.fr' }, { nom: 'Pas lui', contact_agent_email: 'x@y.fr' }],
    mailsRecus: [{ de_email: 'manon@primo.fr', objet: 'Fiche boulangerie', date: '2026-10-10T08:00:00Z', extrait: 'Ci-joint la fiche' }, { de_email: 'x@y.fr', objet: 'Autre', date: '2026-10-11T00:00:00Z' }],
    mailsEnvoyes: [{ agent_id: 'a1', etat: 'envoye', objet: 'Nos critères', envoye_le: '2026-10-12T09:30:00Z', corps: 'Bonjour' }, { agent_id: 'a1', essai: true, objet: 'Essai', cree_le: '2026-10-13T00:00:00Z' }],
  });
  assert.equal(c.tentatives, 2);
  assert.equal(c.relance.le, '2026-10-20');
  assert.deepEqual(c.biens.map((b) => b.nom), ['Boulangerie Dupont']);
  assert.deepEqual(c.mails.map((m) => m.sens), ['envoyé', 'reçu'], 'le plus récent d\'abord, sans les essais ni les autres expéditeurs');
  assert.deepEqual(c.collegues.map((x) => x.nom), ['Luc Primo'], 'même agence, ni lui-même ni les archivés');
  const t = V2.texteDuContexte(c);
  assert.match(t, /Boulangerie Dupont/);
  assert.match(t, /Relance en cours : le 2026-10-20/);
  assert.match(t, /Luc Primo/);
  const vide = V2.texteDuContexte(V2.contexteAgent({ id: 'z', nom: 'Z' }));
  assert.match(vide, /aucun/);
});

test("le bloc du prompt : la compétence et le contexte quand ils existent, le « parce que » toujours", () => {
  assert.match(V2.blocDuPrompt({ competence: { texte: 'Je rappelle toujours le matin.', version: 3 }, contexte: V2.contexteAgent({ id: 'a', nom: 'A' }) }), /version 3[\s\S]*Je rappelle toujours le matin[\s\S]*CE QU'ON SAIT DÉJÀ[\s\S]*parce_que/);
  const sans = V2.blocDuPrompt({});
  assert.doesNotMatch(sans, /FAÇON DE PENSER/);
  assert.match(sans, /parce_que/);
});

test("la relance conseillée : le code vérifie, la date par défaut reste sinon", () => {
  const ok = V2.relanceConseillee({ date_en_mots: 'dans trois semaines', parce_que: 'son mandat rentre fin du mois' }, { issue: 'pas_de_murs', maintenant: MAINT });
  assert.equal(ok.ok, true);
  assert.ok(ok.le > '2026-10-19' && ok.le <= '2026-11-20');
  assert.equal(ok.parce_que, 'son mandat rentre fin du mois');
  assert.equal(V2.relanceConseillee({ date_en_mots: '' }, { issue: 'pas_de_murs', maintenant: MAINT }), null);
  assert.equal(V2.relanceConseillee({ date_en_mots: 'jeudi' }, { issue: 'a_rappeler', date_dite: '2026-10-22', maintenant: MAINT }).ok, false, 'une date dite l\'emporte');
  assert.equal(V2.relanceConseillee({ date_en_mots: 'dans deux semaines' }, { issue: 'pas_interesse', maintenant: MAINT }).ok, false, 'pas de relance pour cette issue');
  assert.equal(V2.relanceConseillee({ date_en_mots: 'dans un an' }, { issue: 'pas_de_murs', maintenant: MAINT }).ok, false, 'au-delà de 90 jours');
  assert.equal(V2.relanceConseillee({ date_en_mots: 'bientôt peut-être' }, { issue: 'pas_de_murs', maintenant: MAINT }).ok, false);
});

test("propositions : la date conseillée et les « parce que » du modèle arrivent sur les propositions", () => {
  const a = { id: 'a1', nom: 'Manon Primo', emails: [], telephones: ['0400000000'], tentatives: 0, statut: 'nouveau' };
  const lu = { issue: 'pas_de_murs', relance_conseillee_le: '2026-11-09', relance_conseillee_parce_que: 'mandat annoncé début novembre', parce_que: { issue: 'Elle n\'a rien en ce moment', fiche: 'Elle travaille sur Lyon' }, secteurs: ['Lyon'] };
  const { propositions } = A.propositions(a, lu, { maintenant: MAINT });
  const rel = propositions.find((p) => p.type === 'relance');
  assert.equal(rel.prochaine.le, '2026-11-09');
  assert.equal(rel.parce_que, 'mandat annoncé début novembre');
  assert.equal(rel.conseillee, true);
  assert.equal(propositions.find((p) => p.type === 'statut').parce_que, 'Elle n\'a rien en ce moment');
  assert.equal(propositions.find((p) => p.type === 'fiche').parce_que, 'Elle travaille sur Lyon');
  const sans = A.propositions(a, { issue: 'pas_de_murs' }, { maintenant: MAINT }).propositions.find((p) => p.type === 'relance');
  assert.ok(!sans.conseillee && !sans.parce_que, 'sans v2, rien ne change');
});

test("le journal des corrections : action décochée, ajoutée, mail et date changés, texte d'origine et corrigé, raisons", () => {
  const actions = [
    { id: 'statut', type: 'statut', titre: 'Noter l\'appel', cache: true },
    { id: 'mail', type: 'mail', titre: 'Lui envoyer « Nos critères »', a: 'm@p.fr', objet: 'Nos critères', corps: 'Bonjour,\nVoici.', coche: true },
    { id: 'diffusion', type: 'diffusion', titre: 'Liste de diffusion', coche: true },
    { id: 'relance', type: 'relance', titre: 'Le rappeler', prochaine: { le: '2026-10-26' }, parce_que: 'délai habituel' },
    { id: 'sms', type: 'sms', titre: 'SMS', coche: false },
  ];
  const appel = { id: 'ap1', agent_id: 'a1', agent: 'Manon', par: 'maxime.p@klocka.immo', issue: 'pas_de_murs', issue_deduite: true, compris: { champs: { email: { valeur: 'manon@primo.fr' } } }, lecture_v2: { competence_version: 2, effort: 'low', contexte: true } };
  const j = V2.journalDeCorrection({
    appel, actions, pris: new Set(['mail', 'relance', 'sms']), mail: { a: 'm@p.fr', objet: 'Nos critères', corps: 'Bonjour Manon,\nVoici.' }, relanceChoisie: '2026-11-02',
    passeAvant: 'Pas de murs', passeApres: 'Pas de murs, rentre un bien en novembre', corrections: [{ cle: 'email', valeur: 'manon@primo-immo.fr' }], issueFinale: 'pas_de_murs',
    raisons: { diffusion: 'deja_fait', relance: 'trop_tot', mail: 'mauvais_ton' },
  });
  assert.equal(j.corrige, true);
  assert.equal(j.lecture.competence_version, 2);
  const par = (t) => j.actions.find((x) => x.type === t);
  assert.equal(par('diffusion').decision, 'decochee');
  assert.equal(par('diffusion').raison, 'deja_fait');
  assert.equal(par('sms').decision, 'ajoutee');
  assert.equal(par('mail').decision, 'gardee');
  assert.ok(!j.actions.some((x) => x.type === 'statut'), 'les étapes en coulisse ne comptent pas');
  assert.deepEqual([j.relance.proposee, j.relance.choisie, j.relance.changee, j.relance.raison], ['2026-10-26', '2026-11-02', true, 'trop_tot']);
  assert.equal(j.mail.modifie, true);
  assert.equal(j.mail.propose.corps, 'Bonjour,\nVoici.');
  assert.equal(j.mail.envoye.corps, 'Bonjour Manon,\nVoici.');
  assert.equal(j.passe.origine, 'Pas de murs');
  assert.equal(j.passe.corrigee, 'Pas de murs, rentre un bien en novembre');
  assert.deepEqual(j.champs, [{ cle: 'email', avant: 'manon@primo.fr', apres: 'manon@primo-immo.fr' }]);
  const propre = V2.journalDeCorrection({ appel, actions, pris: new Set(['mail', 'diffusion', 'relance']), mail: { a: 'm@p.fr', objet: 'Nos critères', corps: 'Bonjour,\nVoici.' }, relanceChoisie: '2026-10-26', passeAvant: 'x', passeApres: 'x', issueFinale: 'pas_de_murs' });
  assert.equal(propre.corrige, false, 'rien changé : pas de correction');
});

test("noter la raison : un clic, une raison connue, stockée sur l'appel", () => {
  const a = Records.create('AppelAgent', { agent: 'Manon', etat: 'a_valider' });
  assert.equal(V2.noterRaison(a.id, 'relance', 'trop_tot').ok, true);
  assert.equal(V2.noterRaison(a.id, 'mail', 'mauvais_ton').ok, true);
  assert.deepEqual(Records.get('AppelAgent', a.id).raisons, { relance: 'trop_tot', mail: 'mauvais_ton' });
  assert.equal(V2.noterRaison(a.id, 'mail', 'nimporte').ok, false);
  assert.equal(V2.noterRaison('inconnu', 'mail', 'autre').ok, false);
});

test("à la validation, le journal des corrections s'écrit (APPELS_V2 allumé), et pas pour un essai", async () => {
  process.env.MONDAY_TOKEN = '';
  process.env.MONDAY_BOARD_AGENTS = '';
  const MA = await import('./mode-appel.js');
  V2.poserAppelsV2(true);
  const f = Records.create('AgentImmo', { nom: 'Manon Primo', agence: 'Primo Immobilier', emails: ['manon@primo.fr'], telephones: ['0400000001'], statut: 'nouveau', tentatives: 0 });
  const ag = Records.create('AgenceProspect', { nom: 'Primo Immobilier', hors_liste: true, carnet_id: f.id, ville: 'Lyon' });
  const actions = [
    { id: 'statut', type: 'statut', titre: 'Noter l\'appel', issue: 'pas_de_murs', statut: 'pas_de_murs', tentatives: 0, cache: true },
    { id: 'diffusion', type: 'diffusion', titre: 'Liste de diffusion', coche: true, a: 'manon@primo.fr' },
    { id: 'relance', type: 'relance', titre: 'Le rappeler', prochaine: { le: '2026-11-19', quoi: 'point du mois' }, coche: true },
  ];
  const appel = Records.create('AppelAgent', { agent_id: f.id, agent: f.nom, agence_id: ag.id, par: 'jules.b@klocka.immo', le: new Date().toISOString(), issue: 'pas_de_murs', issue_deduite: true, resume: 'Rien en ce moment', passe: 'Pas de murs', compris: { champs: {} }, propositions: actions, etat: 'a_valider', lecture_v2: { competence_version: 1, effort: 'low', contexte: true } });
  V2.noterRaison(appel.id, 'diffusion', 'deja_fait');
  const v = await MA.validerIssue({ appel_id: appel.id, choix: ['relance'], user: { email: 'jules.b@klocka.immo', role: 'admin' }, issue: 'pas_de_murs', passe: 'Pas de murs, rentre un bien en novembre' });
  assert.equal(v.ok, true);
  const j = Records.list('CorrectionAppel').find((x) => x.appel_id === appel.id);
  assert.ok(j, 'le journal est écrit');
  assert.equal(j.actions.find((x) => x.type === 'diffusion').decision, 'decochee');
  assert.equal(j.actions.find((x) => x.type === 'diffusion').raison, 'deja_fait');
  assert.equal(j.passe.origine, 'Pas de murs');
  assert.equal(j.passe.corrigee, 'Pas de murs, rentre un bien en novembre');
  assert.equal(j.corrige, true);
  V2.poserAppelsV2(false);
});
