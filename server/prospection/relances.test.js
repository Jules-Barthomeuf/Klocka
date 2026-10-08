// La page Relances (spec du 8 oct. 2026) : les motifs et leur ordre, les biens
// jugés, « Pris par » (une seule personne, libéré après quinze minutes), les
// mails préparés une fois, l'activité et le pilotage, l'envoi depuis la
// Prospection.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.MONDAY_BOARD_AGENTS = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-relances-'));
const RL = await import('./relances.js');
const MA = await import('./mode-appel.js');
const { Records } = await import('../db.js');

const JOUR = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
const MAINTENANT = new Date(`${JOUR}T09:00:00Z`);
const plus = (n) => { const d = new Date(`${JOUR}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const CORALIE = { email: 'coralie.g@klocka.immo' };
const MAXIME = { email: 'maxime.p@klocka.immo' };

test('le motif : biens jugés d\'abord, puis engagement, fiche non reçue, retenter, point mensuel', () => {
  assert.equal(RL.motifDe({ aJuger: [{ verdict: 'refuse' }, { verdict: 'retenu' }] }), 'bien_retenu');
  assert.equal(RL.motifDe({ aJuger: [{ verdict: 'refuse' }] }), 'bien_refuse');
  assert.equal(RL.motifDe({ fiche: { prochaine: { quoi: 'faire le point sur le mandat annoncé : un local' } } }), 'engagement');
  assert.equal(RL.motifDe({ fiche: { prochaine: { quoi: 'rappeler', date_choisie: true } } }), 'engagement');
  assert.equal(RL.motifDe({ fiche: { prochaine: { quoi: 'rappeler si la fiche n\'est pas arrivée', si_fiche: true } } }), 'fiche_non_recue');
  assert.equal(RL.motifDe({ fiche: { prochaine: { quoi: 'rappeler (essai 2 sur 3)' } }, statut: { derniere_issue: 'pas_de_reponse' } }), 'retenter');
  assert.equal(RL.motifDe({ fiche: { statut: 'pause', prochaine: { quoi: 'rappeler après la pause' } }, statut: { derniere_issue: 'pas_de_reponse' } }), 'point_mensuel');
  assert.equal(RL.motifDe({ fiche: { statut: 'pas_de_murs', prochaine: { quoi: 'point du mois' } } }), 'point_mensuel');
});

test('la phrase à dire, et l\'ordre de la liste : le motif le plus urgent, puis la plus ancienne', () => {
  assert.equal(RL.phraseDe('point_mensuel', { recherche: 'murs de commerce, 400 à 800 k€' }), 'Point mensuel : nouveau client qui cherche des murs de commerce, 400 à 800 k€.');
  assert.equal(RL.phraseDe('bien_refuse', { bien: { titre: 'Boulangerie rue de France', raison: 'Prix trop élevé' } }), 'Bien refusé : Boulangerie rue de France. Raison : Prix trop élevé.');
  assert.equal(RL.phraseDe('retenter', { statut: { tentatives: 1 }, fiche: { prochaine: { moment: "l'après-midi" } } }), "Retenter : 2e essai, plutôt l'après-midi.");
  const l = (cle, le, agence) => ({ motif: { cle }, le, agence });
  const t = RL.ordreDesRelances([l('retenter', '2026-09-01', 'A'), l('point_mensuel', '2026-10-01', 'B'), l('bien_retenu', '2026-10-07', 'C'), l('point_mensuel', '2026-09-20', 'D'), l('engagement', null, 'E')]);
  assert.deepEqual(t.map((x) => x.agence), ['C', 'E', 'D', 'B', 'A']);
  assert.equal(RL.groupeDe(null, JOUR), 'aujourdhui');
  assert.equal(RL.groupeDe(plus(-4), JOUR), 'retard');
  assert.equal(RL.groupeDe(plus(1), JOUR), 'a_venir');
});

test('un bien jugé : retenu (dossier en Oui) ou refusé (abandonné, avec sa raison) ; plus de relance une fois l\'agent prévenu ou après trente jours', () => {
  const retenu = RL.bienDe({ deal_id: 'd1', titre: 'Pharmacie', etape: 'oui', le: '2026-10-01T10:00:00Z' }, { suivi: [{ vers: 'documents_demandes', le: `${plus(-2)}T10:00:00Z` }], lots: [{ lot: { adresse: { valeur: { rue: '3 rue de France', code_postal: '06000', ville: 'Nice' } } } }] });
  assert.equal(retenu.verdict, 'retenu');
  assert.equal(retenu.verdict_le, plus(-2));
  assert.equal(retenu.adresse, '3 rue de France 06000 Nice');
  const refuse = RL.bienDe({ deal_id: 'd2', titre: 'Kebab', etape: 'non' }, { decision: { decision: 'non', raison: 'Emplacement', le: `${plus(-40)}T10:00:00Z` } });
  assert.equal(refuse.raison, 'Emplacement');
  assert.deepEqual(RL.biensAJuger([retenu, refuse], JOUR).map((b) => b.deal_id), ['d1'], 'refusé il y a quarante jours : trop vieux');
  assert.deepEqual(RL.biensAJuger([RL.bienDe({ deal_id: 'd1', etape: 'oui' }, { suivi: [{ vers: 'documents_demandes', le: `${plus(-2)}T10:00:00Z` }] }, ['d1'])], JOUR), [], 'déjà prévenu');
});

test("« Pris par » : une seule personne à la fois, refus avec son prénom ; libre en partant, ou seul après quinze minutes sans activité", () => {
  RL.oublierPrises();
  const a = Records.create('AgenceProspect', { liste_id: null, hors_liste: true, nom: 'Agence Témoin', telephone: '0600000001' });
  const cle = `ag:${a.id}`;
  assert.equal(RL.prendre(cle, CORALIE, { maintenantD: MAINTENANT }).ok, true);
  const refus = RL.prendre(cle, MAXIME, { maintenantD: MAINTENANT });
  assert.equal(refus.ok, false);
  assert.equal(refus.error, 'Coralie vient de la prendre.');
  assert.equal(RL.prises(MAINTENANT)[cle].initiales, 'CG');
  // Coralie s'en sert : quatorze minutes plus tard, toujours à elle.
  const t14 = new Date(MAINTENANT.getTime() + 14 * 60000);
  assert.equal(RL.garder(cle, CORALIE, { maintenantD: t14 }).ok, true);
  assert.equal(RL.prendre(cle, MAXIME, { maintenantD: new Date(t14.getTime() + 10 * 60000) }).ok, false);
  // Plus rien depuis quinze minutes : la ligne se libère d'elle-même.
  const t30 = new Date(t14.getTime() + 16 * 60000);
  assert.equal(RL.prises(t30)[cle], undefined);
  assert.equal(RL.prendre(cle, MAXIME, { maintenantD: t30 }).ok, true);
  assert.equal(RL.garder(cle, CORALIE, { maintenantD: t30 }).perdue, true, 'Coralie apprend que Maxime l\'a reprise');
  RL.lacher(cle, MAXIME);
  assert.equal(RL.prises(t30)[cle], undefined);
  // La prise survit à un redémarrage : elle est aussi sur l'agence.
  RL.prendre(cle, CORALIE, { maintenantD: t30 });
  RL.oublierPrises();
  assert.equal(RL.prises(t30)[cle].par, CORALIE.email);
  RL.lacher(cle, CORALIE);
});

test("la liste partagée : motifs, échéances, « demain », agents du carnet sans agence, et la fiche du mode appel", async () => {
  RL.oublierPrises();
  const l = Records.create('ListeAgences', { ville: 'Nice' });
  const mk = (nom, tel, fiche, appel) => {
    const f = Records.create('AgentImmo', { nom, telephones: [tel], ...fiche });
    const a = Records.create('AgenceProspect', { liste_id: l.id, nom, telephone: tel, carnet_id: f.id, sources: ['Google Maps'] });
    if (appel) Records.create('AppelAgent', { agent_id: f.id, etat: 'valide', le: `${plus(-6)}T10:00:00Z`, par: appel.par, issue: appel.issue, resume: appel.resume || null, biens: appel.biens || [] });
    return { a, f };
  };
  mk('Agence du Port', '0493000001', { tentatives: 1, prochaine: { le: plus(-4), quoi: 'rappeler (essai 2 sur 3)' } }, { par: CORALIE.email, issue: 'pas_de_reponse' });
  const azurea = mk('Azurea Commerces', '0493000002', { emails: ['contact@azurea.fr'], statut: 'en_discussion', prochaine: { le: JOUR, quoi: 'rappeler si la fiche n\'est pas arrivée', si_fiche: true } }, { par: CORALIE.email, issue: 'a_des_murs', resume: 'un local rue de France', biens: ['un local rue de France'] });
  mk('Riviera Pro', '0493000003', { statut: 'pas_de_murs', prochaine: { le: plus(1), quoi: 'point du mois' } }, { par: MAXIME.email, issue: 'pas_de_murs' });
  mk('Jamais Appelée', '0493000004', {}, null);
  mk('Ne Plus', '0493000005', { ne_plus_appeler: true, statut: 'archive' }, { par: CORALIE.email, issue: 'pas_interesse' });
  // Un agent du carnet sans ligne d'agence, avec une échéance qu'il a donnée.
  const seul = Records.create('AgentImmo', { nom: 'Paul Carnet', agence: 'Cabinet Carnet', ville: 'Lyon', telephones: ['0478000009'], prochaine: { le: JOUR, quoi: 'rappeler à l\'échéance qu\'il a donnée' } });

  const r = await RL.relances({ maintenantD: MAINTENANT });
  const noms = r.lignes.map((x) => x.agence);
  assert.deepEqual(noms, ['Cabinet Carnet', 'Azurea Commerces', 'Agence du Port'], 'Engagement, Fiche non reçue, Retenter');
  assert.equal(r.total, 3);
  assert.equal(r.retard, 1);
  assert.equal(r.demain, 1, 'Riviera Pro demain');
  assert.equal(r.lignes[2].retard, 4);
  assert.deepEqual(r.motifs.filter((m) => m.n).map((m) => m.cle), ['engagement', 'fiche_non_recue', 'retenter']);
  assert.ok(r.motifs.find((m) => m.cle === 'bien_retenu').urgent);
  // La fiche non reçue a préparé son mail, une seule fois.
  assert.equal(r.mails.length, 1);
  assert.equal(r.mails[0].motif, 'Fiche non reçue');
  assert.match(r.mails[0].corps, /de un local rue de France/);
  assert.equal((await RL.relances({ maintenantD: MAINTENANT })).mails.length, 1);

  // Prendre l'agent du carnet lui donne une ligne d'agence, hors des listes de villes.
  const p = RL.prendre(seul.id, CORALIE, { maintenantD: MAINTENANT });
  assert.equal(p.ok, true);
  const cachee = Records.get('AgenceProspect', p.agence_id);
  assert.equal(cachee.hors_liste, true);
  assert.equal(cachee.carnet_id, seul.id);
  const f = await RL.ficheDeRelance(p.agence_id, CORALIE, { maintenantD: MAINTENANT });
  assert.equal(f.file[0].relance.motif.libelle, 'Engagement');
  assert.equal(f.file[0].relance.phrase, "Engagement : rappeler à l'échéance qu'il a donnée.");
  assert.equal(f.file[0].telephone, '0478000009');
  // Elle reste une seule ligne, prise par Coralie, chez tout le monde.
  const r2 = await RL.relances({ maintenantD: MAINTENANT });
  assert.equal(r2.lignes.filter((x) => x.agence === 'Cabinet Carnet').length, 1);
  assert.equal(r2.prises[seul.id].prenom, 'Coralie');
  // La file de la Prospection ne la voit pas.
  assert.ok(!MA.fileDAppel(l.id, CORALIE, { maintenantD: MAINTENANT }).file.some((x) => x.nom === 'Cabinet Carnet'));

  const fa = await RL.ficheDeRelance(azurea.a.id, CORALIE, { maintenantD: MAINTENANT });
  assert.equal(fa.file[0].relance.bien.recue, false);
  assert.equal(fa.file[0].relance.dernier.resume, 'un local rue de France');
  RL.lacher(seul.id, CORALIE);
});

test("après l'appel : l'agent joint est prévenu de son bien retenu, la ligne se libère ; un sans-réponse ne compte pas", async () => {
  RL.oublierPrises();
  const f = Records.create('AgentImmo', { nom: 'Lucie Bien', emails: ['lucie@agence-bien.fr'], telephones: ['0611111111'] });
  const a = Records.create('AgenceProspect', { liste_id: null, hors_liste: true, nom: 'Agence Bien', telephone: '0611111111', carnet_id: f.id });
  Records.create('Deal', { deal_id: 'deal-bien-1', nom: 'Murs de pharmacie', contact_agent_email: 'lucie@agence-bien.fr', statut: 'documents_demandes', suivi: [{ vers: 'documents_demandes', le: `${plus(-1)}T10:00:00Z` }], lots: [{ lot: { adresse: { valeur: { rue: '1 rue Haute', ville: 'Nice' } } } }] });
  const avant = await RL.relances({ maintenantD: MAINTENANT });
  const ligne = avant.lignes.find((x) => x.agence === 'Agence Bien');
  assert.equal(ligne?.motif.cle, 'bien_retenu');
  assert.equal(ligne.groupe, 'retard');
  RL.prendre(f.id, CORALIE, { maintenantD: MAINTENANT });
  await RL.apresAppel({ agent_id: f.id, agence_id: a.id, issue: 'pas_de_reponse', user: CORALIE, maintenantD: MAINTENANT });
  assert.equal(RL.prises(MAINTENANT)[f.id], undefined, 'libérée');
  assert.ok(!(Records.get('AgentImmo', f.id).prevenus || []).length, 'pas prévenu : il n\'a pas décroché');
  await RL.apresAppel({ agent_id: f.id, agence_id: a.id, issue: 'agent_prevenu', user: CORALIE, maintenantD: MAINTENANT });
  assert.deepEqual(Records.get('AgentImmo', f.id).prevenus, ['deal-bien-1']);
  assert.ok(!(await RL.relances({ maintenantD: MAINTENANT })).lignes.some((x) => x.agence === 'Agence Bien'));
});

test("« Agent prévenu » : le point du mois suit, sans mail ; les mails à valider après trois appels sans réponse", async () => {
  const R = await import('./regles.js');
  const s = R.suiteDeLIssue('agent_prevenu', { statut: 'envoie_des_fiches', maintenant: MAINTENANT });
  assert.equal(s.statut, 'envoie_des_fiches');
  assert.deepEqual(s.mails, []);
  assert.match(s.prochaine.quoi, /point du mois/);
  assert.equal(MA.ISSUES_APPEL.agent_prevenu.simple, true);
  const f = Records.create('AgentImmo', { nom: 'Marc Silence', emails: ['marc@silence.fr'], statut: 'pause', prochaine: { le: JOUR, quoi: 'rappeler après la pause (3 appels sans réponse)' } });
  assert.equal(RL.preparerMails([f], JOUR), 1);
  assert.equal(RL.preparerMails([f], JOUR), 0, 'une fois');
  assert.ok(RL.mailsAValider().some((m) => m.motif === '3 appels sans réponse' && m.a === 'marc@silence.fr'));
});

test("l'activité par analyste et le pilotage (agents suivis joints sur trente jours, cible 90 %)", () => {
  const appels = [
    { par: CORALIE.email, le: `${JOUR}T08:00:00Z`, issue: 'pas_de_murs', agent_id: 'x' },
    { par: CORALIE.email, le: `${JOUR}T09:00:00Z`, issue: 'pas_de_reponse', agent_id: 'y' },
    { par: MAXIME.email, le: `${plus(-40)}T09:00:00Z`, issue: 'pas_de_murs', agent_id: 'z' },
  ];
  const a = RL.activite({ appels, fiches: [{ le: `${JOUR}T07:00:00Z` }], jour: JOUR });
  assert.equal(a.analystes.find((x) => x.prenom === 'Coralie').jour, 2);
  assert.equal(a.equipe.jour, 2);
  assert.equal(a.fiches_recues.jour, 1);
  const p = RL.pilotage({ agents: [{ id: 'x', statut: 'pas_de_murs' }, { id: 'y', statut: 'a_rappeler' }, { id: 'z', statut: 'envoie_des_fiches' }, { id: 'n', statut: 'nouveau' }], appels, fiches: [], retard: 2, jour: JOUR });
  assert.deepEqual(p.contactes, { n: 1, sur: 3, part: 33, cible: 90 }, 'x seul : y n\'a pas décroché, z il y a quarante jours');
  assert.equal(p.retard, 2);
});

test("envoyer dans Relances depuis la Prospection : due aujourd'hui, hors de la file des nouvelles", async () => {
  const lyon = Records.create('ListeAgences', { ville: 'Lyon' });
  const contact = Records.create('AgenceProspect', { liste_id: lyon.id, nom: 'Cabinet Bellecour', telephone: '0478000001', sources: ['Google Maps'], monday_connu: { qui: 'thomas.r@klocka.immo', date: '2026-09-15', statut: 'Intéressé', confiance: 'sure' } });
  const morte = Records.create('AgenceProspect', { liste_id: lyon.id, nom: 'Fermée', telephone: '0478000003', fermee: true });
  const r = await RL.envoyer([contact.id, morte.id], CORALIE, { maintenantD: MAINTENANT });
  assert.equal(r.envoyees, 1);
  assert.deepEqual(r.refusees, ['Fermée']);
  assert.equal((await RL.envoyer([contact.id], CORALIE, { maintenantD: MAINTENANT })).deja, 1);
  const t = await RL.relances({ maintenantD: MAINTENANT });
  const b = t.lignes.find((x) => x.agence === 'Cabinet Bellecour');
  assert.equal(b.ville, 'Lyon');
  assert.equal(b.groupe, 'aujourdhui');
  assert.equal(b.motif.cle, 'point_mensuel');
  assert.deepEqual(MA.fileDAppel(lyon.id, CORALIE, { maintenantD: MAINTENANT }).file, []);
});

test("la liste des relances : un nom en double ne fait qu'une ligne ; supprimer et renvoyer en prospection ; la phrase de « Retenter »", async () => {
  const RL = await import('./relances.js');
  const MA = await import('./mode-appel.js');
  const { Records } = await import('../db.js');
  assert.match(RL.phraseRetenter([{ le: '2026-10-07T08:00:00Z', issue: 'pas_de_reponse', par: 'nora.l@klocka.immo' }, { le: '2026-10-09T08:00:00Z', issue: 'repondeur', par: 'jules.b@klocka.immo' }], { moment: 'le matin' }),
    /^Vous l'avez déjà appelé 2 fois, le 7 octobre \(Nora\) et le 9 octobre \(Jules\), sans réponse\. Un message a été laissé sur son répondeur\. Il faut le rappeler, plutôt le matin\.$/);
  const L = Records.create('ListeAgences', { ville: 'Grasse', etat: 'fini', journal: [] });
  const jour = new Date().toISOString().slice(0, 10);
  const f1 = Records.create('AgentImmo', { nom: 'Nicolas Mened', agence: 'Agence A', telephones: ['0493000101'], emails: [], statut: 'pas_de_murs', prochaine: { quoi: 'point', le: jour } });
  const f2 = Records.create('AgentImmo', { nom: 'Nicolas MENED', agence: 'Agence B', telephones: ['0493000102'], emails: [], statut: 'pas_de_murs', prochaine: { quoi: 'point', le: jour } });
  const a1 = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Agence A', telephone: '04 93 00 01 01', carnet_id: f1.id, agents: [], gerants: [], sources: ['Google Maps'] });
  Records.create('AgenceProspect', { liste_id: L.id, nom: 'Agence B', telephone: '04 93 00 01 02', carnet_id: f2.id, agents: [], gerants: [], sources: ['Google Maps'] });
  const r = await RL.relances();
  assert.equal(r.lignes.filter((x) => /mened/i.test(x.nom || '')).length, 1, 'un seul Nicolas Mened');
  const ligne = r.lignes.find((x) => /mened/i.test(x.nom || ''));
  const user = { email: 'nora.l@klocka.immo', role: 'admin' };
  // Renvoyer en prospection : hors des relances, de retour dans la file du mode appel.
  const cleA = RL.cleDe(a1);
  assert.equal(RL.renvoyerEnProspection([cleA], user).renvoyees, 1);
  const r2 = await RL.relances();
  assert.ok(!r2.lignes.some((x) => x.cle === cleA));
  assert.ok(MA.fileDAppel(L.id, user).file.some((x) => x.id === a1.id), "revenue dans la prospection");
  // Supprimer : la ligne restante sort de la liste.
  const autre = r2.lignes.find((x) => /mened/i.test(x.nom || ''));
  if (autre) {
    assert.equal(RL.retirerDesRelances([autre.cle], user).retirees, 1);
    assert.ok(!(await RL.relances()).lignes.some((x) => x.cle === autre.cle));
  }
  assert.ok(ligne);
});
