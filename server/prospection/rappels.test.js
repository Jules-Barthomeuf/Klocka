// « Il me rappelle » (spec du 8 oct. 2026) : les notes font foi, les candidats
// (l'appel sans réponse d'abord), chercher par les quatre derniers chiffres,
// identifier (« Ne plus appeler », la relance d'un collègue libérée), « Rien
// de nouveau », abandonner, et le bandeau « Rappel à terminer ».

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.MONDAY_BOARD_AGENTS = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-rappels-'));
const RP = await import('./rappels.js');
const RL = await import('./relances.js');
const { Records } = await import('../db.js');

const NORA = { email: 'nora.l@klocka.immo' };
const MAXIME = { email: 'maxime.p@klocka.immo' };
const MAINTENANT = new Date('2026-10-08T14:00:00Z');

test('les notes font foi : leur email et leur numéro remplacent ceux entendus ; un email mal tapé est signalé', () => {
  const compris = { champs: { email: { valeur: 'marc.dupon@riviera.fr', source: 'mon mail c\'est marc dupon' }, interlocuteur: { valeur: 'Marc Dupont' } } };
  const c = RP.notesFontFoi(compris, 'email : marc.dupont@riviera-immo.fr, tel 06 12 34 56 78');
  assert.equal(c.champs.email.valeur, 'marc.dupont@riviera-immo.fr');
  assert.equal(c.champs.email.note, true);
  assert.equal(R_norm(c.champs.telephone.valeur), '0612345678');
  assert.equal(c.champs.interlocuteur.valeur, 'Marc Dupont', 'le reste ne bouge pas');
  assert.deepEqual(RP.lireNotes('marc.dupont@riviera').avertissements, ['« marc.dupont@riviera » n\'est pas une adresse valide']);
  assert.match(RP.texteAAnalyser('Bonjour, Marc de Riviera.', 'email marc@riviera.fr'), /Notes de l'analyste \(elles font foi/);
  assert.equal(RP.sansContenu('Allô ? Oui.', ''), true);
  assert.equal(RP.sansContenu('Allô ? Oui.', 'il a un local'), false);
});
const R_norm = (t) => String(t).replace(/\D/g, '');

test("les candidats : l'appel sans réponse d'abord, un numéro tapé passe devant tout, deux homonymes restent deux", () => {
  const agents = [
    { id: 'a1', nom: 'Marc Dupont', agence: 'Riviera Immo', ville: 'Nice', telephones: ['0611111111'] },
    { id: 'a2', nom: 'Sophie Martin', agence: 'Azur Commerces', ville: 'Nice', telephones: ['0622222222'] },
    { id: 'a3', nom: 'Marc Dupont', agence: 'Dupont Conseil', ville: 'Lyon', telephones: ['0633333333'] },
  ];
  const sansReponse = [{ agent_id: 'a1', le: '2026-10-07T08:12:00Z' }];
  const c = RP.classer({ sansReponse, agents, texte: 'Bonjour, vous avez essayé de me joindre hier.', maintenantD: MAINTENANT });
  assert.equal(c[0].agent_id, 'a1');
  assert.equal(c[0].raison, 'appelé hier à 10 h 12');
  // Le nom entendu : les deux Marc Dupont, chacun avec son agence et sa ville.
  const h = RP.classer({ agents, texte: 'Oui bonjour, Marc Dupont à l\'appareil.', maintenantD: MAINTENANT });
  assert.deepEqual(h.map((x) => x.agent_id).sort(), ['a1', 'a3']);
  assert.ok(h.every((x) => x.agence && x.ville));
  // Le numéro des notes l'emporte sur l'appel sans réponse.
  const n = RP.classer({ sansReponse, agents, notes: 'rappeler au 06 22 22 22 22', maintenantD: MAINTENANT });
  assert.equal(n[0].agent_id, 'a2');
  assert.equal(n[0].raison, 'numéro des notes');
  assert.equal(n.length, 2);
  assert.ok(RP.classer({ agents: Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, nom: `Agent Commun${i}`, agence: 'Riviera Immo' })), texte: 'Riviera Immo' }).length <= 3, 'trois au plus');
});

test("un rappel de bout en bout : ouvrir, Stop, candidats, chercher par quatre chiffres, identifier, « Ne plus appeler » levé, abandon", async () => {
  const l = Records.create('ListeAgences', { ville: 'Nice' });
  const f = Records.create('AgentImmo', { nom: 'Marc Dupont', agence: 'Riviera Immo', ville: 'Nice', telephones: ['06 11 11 11 11'], ne_plus_appeler: true, statut: 'archive', ne_plus_appeler_le: '2026-10-08T09:00:00Z' });
  const g = Records.create('AgenceProspect', { liste_id: l.id, nom: 'Riviera Immo', telephone: '04 93 00 00 01', carnet_id: f.id, sources: ['Google Maps'] });
  Records.create('AppelAgent', { agent_id: f.id, agence_id: g.id, par: NORA.email, issue: 'pas_de_reponse', etat: 'valide', le: new Date(Date.now() - 86400000).toISOString() });

  const o = RP.ouvrir(NORA);
  assert.equal(o.rappel.etat, 'enregistrement');
  assert.deepEqual(RP.enCours(NORA).map((x) => x.id), [o.rappel.id], 'le bandeau « Rappel à terminer » le montre déjà');
  assert.deepEqual(RP.enCours(MAXIME), [], 'chacun ses rappels');
  const fin = await RP.finir(o.rappel.id, { morceaux: ['Bonjour, vous m\'avez appelé hier, c\'est pour mon local.'], notes: '', duree_s: 42 }, NORA);
  assert.equal(fin.rappel.etat, 'a_identifier');
  assert.equal(fin.rappel.candidats[0].agent_id, f.id);
  assert.equal(fin.rappel.candidats[0].ne_plus_appeler, true);
  assert.ok(RP.chercher('1111').some((x) => x.agent_id === f.id), 'les quatre derniers chiffres');
  assert.ok(RP.chercher('riviera').some((x) => x.agent_id === f.id));

  // Rien ne s'exécute avant l'identification.
  assert.equal((await RP.analyser(o.rappel.id, {}, NORA)).ok, false);
  // Maxime avait pris sa relance : le rappel passe devant, la ligne est libérée.
  RL.oublierPrises();
  RL.prendre(f.id, MAXIME);
  const id = await RP.identifier(o.rappel.id, { agent_id: f.id }, NORA);
  assert.equal(id.ok, true);
  assert.equal(id.rappel.agence.id, g.id);
  assert.deepEqual(id.rappel.avertissements.map((x) => x.genre), ['ne_plus_appeler', 'pris']);
  assert.match(id.rappel.avertissements[0].texte, /^Ne plus appeler, depuis le 8 octobre/);
  assert.match(id.rappel.avertissements[1].texte, /^En cours chez Maxime/);
  assert.equal(RL.prises()[f.id], undefined);
  const lv = await RP.lever(o.rappel.id, NORA);
  assert.deepEqual(lv.rappel.avertissements.map((x) => x.genre), ['pris']);
  assert.equal(Records.get('AgentImmo', f.id).ne_plus_appeler, false);
  assert.equal(Records.get('AgentImmo', f.id).statut, 'a_rappeler');

  assert.equal(RP.abandonner(o.rappel.id, NORA).ok, true);
  assert.equal(Records.get('RappelEntrant', o.rappel.id).transcription, null, 'la transcription s\'efface');
  assert.deepEqual(RP.enCours(NORA), []);
});

test("« Rien de nouveau » : agent identifié, dernier contact aujourd'hui, la retentative tombe, rien d'autre ; un nouveau contact se crée", async () => {
  const f = Records.create('AgentImmo', { nom: 'Lucie Bref', telephones: ['0644444444'], statut: 'a_rappeler', tentatives: 1, prochaine: { le: '2026-10-09', quoi: 'rappeler (essai 2 sur 3), plutôt le matin' } });
  const o = RP.ouvrir(NORA);
  await RP.finir(o.rappel.id, { morceaux: ['Allô ? Oui.'], notes: '' }, NORA);
  await RP.identifier(o.rappel.id, { agent_id: f.id }, NORA);
  const a = await RP.analyser(o.rappel.id, {}, NORA);
  assert.equal(a.rien_de_nouveau, true);
  const v = await RP.rienDeNouveau(o.rappel.id, NORA, { maintenantD: MAINTENANT });
  assert.equal(v.ok, true);
  const apres = Records.get('AgentImmo', f.id);
  assert.equal(apres.dernier_contact_le, MAINTENANT.toISOString());
  assert.match(apres.prochaine.quoi, /point du mois/);
  assert.equal(apres.statut, 'en_discussion');
  assert.equal(apres.tentatives, 0);
  assert.equal(Records.get('RappelEntrant', o.rappel.id).etat, 'valide');
  assert.ok(Records.list('AppelAgent').some((x) => x.agent_id === f.id && x.issue === 'rien_de_nouveau' && x.rappel_entrant));
  assert.ok(Records.list('ProspectionMail').every((m) => m.agent_id !== f.id), 'aucun mail');

  // Un inconnu : nouveau contact, avec le numéro tapé dans les notes.
  const o2 = RP.ouvrir(NORA);
  await RP.finir(o2.rappel.id, { morceaux: [], notes: 'Paul Neuf, 07 55 55 55 55' }, NORA);
  const n = await RP.identifier(o2.rappel.id, { nouveau: { nom: 'Paul Neuf', agence: 'Agence Neuve', ville: 'Antibes' } }, NORA);
  assert.equal(n.ok, true);
  const cree = Records.get('AgentImmo', Records.get('RappelEntrant', o2.rappel.id).agent_id);
  assert.equal(cree.nom, 'Paul Neuf');
  assert.ok((cree.telephones || []).some((t) => R_norm(t) === '0755555555'));
  assert.equal(n.rappel.agence.nom, 'Agence Neuve');
  RP.abandonner(o2.rappel.id, NORA);
});

test("l'heure dite départage : « vous m'avez appelé à 10h » écarte l'appel de 20 h 47, « Probablement » seulement s'il se détache", () => {
  const agents = [
    { id: 'p', nom: 'Petrova Investissement', agence: 'Petrova Investissement Immobilier', ville: 'Nice', telephones: ['0611111111'] },
    { id: 'r', nom: 'Riviera Commerce', agence: 'Riviera Commerce', ville: 'Nice', telephones: ['0622222222'] },
  ];
  const hier = (h, m) => new Date(Date.UTC(2026, 9, 7, h - 2, m)).toISOString(); // heure de Paris (UTC+2)
  // Le sans-réponse le plus récent (20 h 47) ne colle pas à l'heure dite : il n'est pas proposé.
  const seul = RP.classer({ sansReponse: [{ agent_id: 'p', le: hier(20, 47) }], agents, texte: "Oui bonjour, vous m'avez appelé à 10h.", maintenantD: MAINTENANT });
  assert.deepEqual(seul, []);
  // Celui de 10 h 05 passe devant, avec « l'heure dite ».
  const deux = RP.classer({ sansReponse: [{ agent_id: 'p', le: hier(20, 47) }, { agent_id: 'r', le: hier(10, 5) }], agents, texte: "Vous m'avez appelé hier à dix heures.", maintenantD: MAINTENANT });
  assert.equal(deux[0].agent_id, 'r');
  assert.match(deux[0].raison, /appelé hier à 10 h 05, l'heure dite/);
  assert.equal(deux[0].probable, true);
  assert.equal(deux.length, 1);
  // Sans heure dite, deux sans-réponse proches : « Peut-être », l'analyste choisit.
  const flou = RP.classer({ sansReponse: [{ agent_id: 'p', le: hier(20, 47) }, { agent_id: 'r', le: hier(10, 5) }], agents, texte: 'Bonjour, vous avez essayé de me joindre.', maintenantD: MAINTENANT });
  assert.equal(flou.length, 2);
  assert.equal(flou[0].probable, false);
});

test('la remarque Monday : la date et ce que l\'agent a dit, ni qui a appelé ni l\'issue', async () => {
  const { ligneDeRemarque } = await import('./monday-agents.js');
  assert.equal(ligneDeRemarque({ jour: '2026-10-08', analyste: 'Jules', issue: "Pas de bien pour l'instant", resume: "L'agent a un bien vide actuellement et prévoit de prendre un mandat sur un commerce bien placé d'ici 2 à 3 semaines." }),
    "08/10/2026 · L'agent a un bien vide actuellement et prévoit de prendre un mandat sur un commerce bien placé d'ici 2 à 3 semaines.");
  assert.equal(ligneDeRemarque({ jour: '2026-10-08', issue: 'Pas intéressé', ne_plus_appeler: true }), '08/10/2026 · Ne plus appeler · Pas intéressé');
});
