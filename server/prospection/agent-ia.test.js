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

test('05/10 · Google Maps : une agence de la commune, ouverte ; son site sans pistage', async () => {
  const M = await import('./agences-maps.js');
  const nice = { nom: 'Nice', codes_postaux: ['06000', '06100'] };
  const lieu = (cp, extra = {}) => ({ id: `p${cp}`, displayName: { text: 'Orpi Nice Centre' }, formattedAddress: `3 rue de France, ${cp} Nice, France`, primaryType: 'real_estate_agency', types: ['real_estate_agency'], businessStatus: 'OPERATIONAL', nationalPhoneNumber: '04 93 00 00 01', websiteUri: 'https://www.orpi.com/nice/?utm_source=gmb&utm_medium=x', ...extra });
  assert.equal(M.aGarder(lieu('06000'), nice), true);
  assert.equal(M.aGarder(lieu('06600'), nice), false, 'Antibes : une autre commune');
  assert.equal(M.aGarder(lieu('06000', { businessStatus: 'CLOSED_PERMANENTLY' }), nice), false);
  assert.equal(M.aGarder(lieu('06000', { primaryType: 'real_estate_developer', types: ['real_estate_developer'] }), nice), false);
  const a = M.versAgence(lieu('06000'));
  assert.equal(a.site, 'https://www.orpi.com/nice/');
  assert.equal(a.telephone, '04 93 00 00 01');
  assert.equal(a.code_postal, '06000');
  assert.equal(M.decouper({ sud: 0, nord: 2, ouest: 0, est: 2 }).length, 4);
});

test('05/10 · Maps fait foi pour le téléphone et le site ; Equimmox n\'invente plus de site', async () => {
  const l = Records.create('ListeAgences', { ville: 'Antibes', etat: 'fini', journal: [] });
  // Avant : une agence née d'Equimmox avec le domaine du mail d'un agent CBRE.
  const vieille = Records.create('AgenceProspect', { liste_id: l.id, nom: 'Bergé Immobilier', site: 'https://cbre.fr', sources: ['Equimmox'], agents: [], gerants: [] });
  IA.reprendre();
  assert.equal(Records.get('AgenceProspect', vieille.id).site, null, 'un site déduit d\'un mail ne vaut rien');
  assert.equal(Records.get('AgenceProspect', vieille.id).site_mail, 'https://cbre.fr', 'gardé à part, pas perdu');
  const d = IA.ranger(l.id, { nom: 'Orpi Antibes', telephone: '04 00 00 00 09', site: 'https://ancien.fr', sources: ['Data-B'] });
  const chercher = async () => ({
    commune: { nom: 'Antibes' }, ecartes: 0,
    agences: [
      { nom: 'Bergé Immobilier', telephone: '04 93 99 52 52', site: 'https://www.berge.fr/', place_id: 'pb', maps_url: 'https://maps.google.com/?cid=1' },
      { nom: 'ORPI Antibes', telephone: '04 93 11 11 11', site: 'https://www.orpi.com/antibes/', place_id: 'po' },
    ],
  });
  await IA._parMaps(l, { chercher });
  const berge = Records.get('AgenceProspect', vieille.id);
  assert.equal(berge.site, 'https://www.berge.fr/');
  assert.equal(berge.telephone, '04 93 99 52 52');
  assert.equal(berge.site_source, 'Google Maps');
  const orpi = Records.get('AgenceProspect', d.agence.id);
  assert.equal(orpi.site, 'https://www.orpi.com/antibes/', 'la fiche Maps remplace le site lu ailleurs');
  assert.equal(orpi.telephone, '04 93 11 11 11');
  assert.equal(IA.liste(l.id).agences, 2, 'sans doublon');
});

test('05/10 · supprimer une ville : sa liste et ses lignes partent, le carnet reste', async () => {
  const l = Records.create('ListeAgences', { ville: 'Grasse', etat: 'fini', journal: [] });
  const a = IA.ranger(l.id, { nom: 'Orpi Grasse', telephone: '04 93 22 22 22', sources: ['Google Maps'] }).agence;
  const r = await IA.auCarnet(a.id, {}, { email: 'jules.b@klocka.immo' });
  assert.equal(r.ok, true);
  const carnetAvant = Records.list('AgentImmo').length;
  const s = IA.supprimerListe(l.id);
  assert.deepEqual([s.ok, s.ville, s.agences], [true, 'Grasse', 1]);
  assert.equal(Records.get('ListeAgences', l.id), null);
  assert.equal(Records.list('AgenceProspect').filter((x) => x.liste_id === l.id).length, 0);
  assert.equal(Records.list('AgentImmo').length, carnetAvant, 'le carnet ne dépend pas de la liste');
  assert.equal(IA.supprimerListe(l.id).ok, false);
});

test('06/10 · Monday : une agence déjà en contact (téléphone, mail, domaine, nom ou un de ses agents) est marquée', async () => {
  const MC = await import('./monday-connus.js');
  const lire = async () => [
    { tableau: 'Prospection Agent Immo', nom: 'Olivier Lamy', agence: 'Mâcon Centre Transactions', telephone: '03 85 40 12 18', email: 'olivier@mct-immo.fr', statut: 'À rappeler', date: '2026-10-01' },
    { tableau: 'Agent immobilier', nom: 'Sandrine Perrot', agence: 'Immobilière de la Saône', telephone: '06 11 22 33 44', email: null, statut: 'Intéressé' },
  ];
  const index = await MC.contactsMonday({ forcer: true, lire });
  assert.equal(MC.connu(index, { telephone: '+33 3 85 40 12 18' }).par, 'téléphone');
  assert.equal(MC.connu(index, { site: 'https://www.mct-immo.fr/agence' }).par, 'domaine');
  assert.equal(MC.connu(index, { nom: "L'Immobilière de la Saône" }).par, 'nom');
  assert.equal(MC.connu(index, { telephone: '03 85 00 00 00', nom: 'Autre Agence' }), null);
  const l = Records.create('ListeAgences', { ville: 'Mâcon', etat: 'fini', journal: [] });
  const mct = IA.ranger(l.id, { nom: 'Mâcon Centre Transactions', telephone: '03 85 40 12 18', sources: ['Google Maps'] }).agence;
  const autre = IA.ranger(l.id, { nom: 'Les Clés du Mâconnais', telephone: '03 85 39 77 02', agents: [], sources: ['Google Maps'] }).agence;
  Records.update('AgenceProspect', autre.id, { agents: [{ nom: 'Sandrine', telephone: '06 11 22 33 44' }] });
  const r = await MC.marquerListe(l.id, { index });
  assert.deepEqual([r.connues, r.total], [2, 2]);
  assert.equal(Records.get('AgenceProspect', mct.id).monday_connu.tableau, 'Prospection Agent Immo');
  assert.equal(Records.get('AgenceProspect', autre.id).monday_connu.par, 'un de ses agents');
  assert.equal(IA.liste(l.id).deja_monday, 2);
});
