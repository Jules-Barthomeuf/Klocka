// L'agent IA de la prospection : reconnaître une agence d'une source à
// l'autre, ne pas la ranger deux fois, la faire entrer au carnet. Sans réseau.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-agent-ia-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('../db.js');
const IA = await import('./agent-ia.js');
const C = await import('./carnet.js');

test('une agence se reconnaît à son nom, sans les mots creux, et à son domaine', () => {
  assert.equal(IA.cleAgence('Agence Century 21 CCE SARL'), IA.cleAgence('century 21 cce'));
  assert.equal(IA.domaineDe('https://www.orpi-nice.fr/agence'), 'orpi-nice.fr');
  assert.equal(IA.domaineDe('jean@orpi-nice.fr'), 'orpi-nice.fr');
  assert.equal(IA.domaineDe('jean@gmail.com'), null);
  assert.equal(IA.nomDuMail('jean.dupont@orpi.fr'), 'Jean Dupont');
  assert.equal(IA.nomDuMail('contact.nice@orpi.fr'), null);
  assert.equal(IA.nomDuMail('jdupont@orpi.fr'), null);
});

test("une même agence de deux sources n'est rangée qu'une fois, et se complète", () => {
  const l = Records.create('ListeAgences', { ville: 'Nice', etat: 'fini', journal: [] });
  const a = IA.ranger(l.id, { nom: 'Orpi Nice Centre', siret: '123', telephone: '04 93 00 00 00', sources: ['Data-B'] });
  assert.equal(a.nouvelle, true);
  const b = IA.ranger(l.id, { nom: 'ORPI NICE CENTRE', site: 'https://orpi-nice.fr', sources: ['Equimmox'] });
  assert.equal(b.nouvelle, false);
  assert.equal(b.agence.site, 'https://orpi-nice.fr');
  assert.deepEqual(b.agence.sources, ['Data-B', 'Equimmox']);
  assert.equal(b.agence.telephone, '04 93 00 00 00', 'rien d\'écrasé');
  const liste = IA.liste(l.id);
  assert.equal(liste.agences, 1);
  assert.equal(IA.listes()[0].ville, 'Nice');
});

test('au carnet : chacun des agents de l\'agence, ou l\'agence par son standard', async () => {
  const l = Records.create('ListeAgences', { ville: 'Lyon', etat: 'fini', journal: [] });
  const avec = IA.ranger(l.id, { nom: 'Century 21 Lyon', telephone: '04 78 11 11 11', agents: [], sources: ['Data-B'] }).agence;
  Records.update('AgenceProspect', avec.id, { agents: [{ nom: 'Jean Dupont', email: 'jean.dupont@c21.fr', telephone: '06 11 22 33 44', annonces: 4 }, { nom: null, email: 'paul@c21.fr', telephone: null, annonces: 1 }] });
  const r = await IA.auCarnet(avec.id, {}, { email: 'jules.b@klocka.immo' });
  assert.equal(r.ok, true);
  assert.equal(r.crees, 2);
  const carnet = C.agents();
  assert.ok(carnet.some((x) => (x.emails || []).includes('jean.dupont@c21.fr') && x.onglet === 'Lyon'));
  assert.ok(Records.get('AgenceProspect', avec.id).carnet_id);
  const seule = IA.ranger(l.id, { nom: 'Petite Agence', telephone: '04 78 22 22 22', gerants: [], sources: ['Data-B'] }).agence;
  Records.update('AgenceProspect', seule.id, { gerants: [{ nom: 'Marie Martin' }] });
  const r2 = await IA.auCarnet(seule.id, {}, null);
  assert.equal(r2.crees, 1);
  assert.ok(C.agents().some((x) => x.nom === 'Marie Martin' && x.agence === 'Petite Agence'));
  const vide = IA.ranger(l.id, { nom: 'Sans Contact', sources: ['Data-B'] }).agence;
  assert.equal((await IA.auCarnet(vide.id)).ok, false);
});

test("le gérant en prénom et nom, sans les autres prénoms ni l'usage", () => {
  assert.equal(IA.nomCourt({ nom: 'Clémence Marie-Claude Marjorie Clémence Duchi Colacicco (Colacicco)', nom_famille: 'Duchi Colacicco (Colacicco)' }), 'Clémence Duchi Colacicco');
  assert.equal(IA.nomCourt({ nom: 'Nicolas Pierre Denis Mouette', nom_famille: 'Mouette' }), 'Nicolas Mouette');
  assert.equal(IA.nomCourt({ nom: 'Jean Dupont' }), 'Jean Dupont');
});

test("appeler depuis une liste : l'agence ou l'un de ses agents au carnet, et sa fiche pour le panneau d'appel", async () => {
  const l = Records.create('ListeAgences', { ville: 'Lille', etat: 'fini', journal: [] });
  const a = IA.ranger(l.id, { nom: 'Agence du Beffroi', telephone: '03 20 00 00 01', sources: ['Data-B'] }).agence;
  Records.update('AgenceProspect', a.id, { gerants: [{ nom: 'Luc Martin' }], agents: [{ nom: 'Eva Roux', email: 'eva.roux@beffroi.fr', telephone: '06 00 00 00 02' }] });
  const r = await IA.pourAppeler(a.id, {}, { email: 'jules.b@klocka.immo' });
  assert.equal(r.ok, true);
  assert.equal(C.agentDe(r.agent_id).nom, 'Luc Martin');
  const r2 = await IA.pourAppeler(a.id, {}, null);
  assert.equal(r2.agent_id, r.agent_id, 'pas de doublon au second appel');
  const r3 = await IA.pourAppeler(a.id, { agent: 'eva.roux@beffroi.fr' }, null);
  assert.notEqual(r3.agent_id, r.agent_id);
  assert.ok((C.agentDe(r3.agent_id).emails || []).includes('eva.roux@beffroi.fr'));
  const muette = IA.ranger(l.id, { nom: 'Sans Numero', sources: ['Data-B'] }).agence;
  assert.equal((await IA.pourAppeler(muette.id)).ok, false);
});

test("que des agences immobilières (NAF 68.31Z) : syndics, promoteurs, SCI écartés ; une ligne écartée reste en base, cachée", () => {
  assert.equal(IA.estAgence({ ape: '6831Z' }), true);
  assert.equal(IA.estAgence({ ape: '68.31Z' }), true);
  assert.equal(IA.estAgence({ ape: '6832A' }), false, 'administration de biens, syndics');
  assert.equal(IA.estAgence({ ape: '4110A' }), false, 'promotion');
  assert.equal(IA.estAgence({ ape: '6820B' }), false, 'SCI');
  assert.equal(IA.estAgence({}), false);
  const l = Records.create('ListeAgences', { ville: 'Toulon', etat: 'fini', journal: [] });
  const syndic = IA.ranger(l.id, { nom: 'Syndic du Port', siret: '999', telephone: '04 94 00 00 00', sources: ['Data-B'] }).agence;
  Records.update('AgenceProspect', syndic.id, { hors_cible: true });
  assert.equal(IA.liste(l.id).agences, 0);
  assert.equal(IA.ranger(l.id, { nom: 'Syndic du Port', siret: '999', sources: ['Data-B'] }).nouvelle, false, 'pas recréée');
  assert.ok(Records.get('AgenceProspect', syndic.id), 'toujours en base');
});

test('Monday : les valeurs du tableau « Prospection Agent Immo », et la note lue sans modèle', async () => {
  process.env.ANTHROPIC_API_KEY = '';
  const MC = await import('./monday-contacts.js');
  const c = { email: 'e', telephone: 't', agence: 'ag', ville: 'v', remarques: 'r', priorite: 'p', date: 'd', relance: 'rl', collaborateurs: 'col' };
  const v = MC.valeursContact(c, { email: 'seb@orpi.fr', telephone: '0678899876', agence: 'Orpi', ville: 'Nice', remarques: 'Rappeler lundi', relance: '2026-10-12' }, { aujourdhui: '2026-10-05', collaborateur: '42' });
  assert.equal(v.t, '06 78 89 98 76');
  assert.deepEqual(v.p, { label: 'Nouveau contact' });
  assert.deepEqual(v.d, { date: '2026-10-05' });
  assert.deepEqual(v.rl, { date: '2026-10-12' });
  assert.deepEqual(v.col, { personsAndTeams: [{ id: 42, kind: 'person' }] });
  const sansMonday = await MC.versMonday([{ nom: 'X', telephone: '0600000000' }]);
  assert.equal(sansMonday.ok, false, 'sans jeton Monday, rien ne part');
});
