// « Compléter les colonnes vides » de l'agent IA des agences : ce qui compte
// comme vide, et quand une fiche trouvée est bien la même agence.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-completer-'));
const { colonnesVides, memeNom } = await import('./agent-ia.js');

test('les colonnes vides sont celles que le tableau montre en tiret', () => {
  assert.deepEqual(colonnesVides({ nom: 'Agence du Centre' }), ['adresse', 'site', 'maps', 'telephone', 'gerants', 'agents']);
  const pleine = { adresse: '3 rue X', site: 'x.fr', maps_url: 'https://maps', telephone: '01 02', gerants: [{ nom: 'A' }], agents: [{ nom: 'B' }] };
  assert.deepEqual(colonnesVides(pleine), []);
  // Le numéro d'un agent suffit : le tableau l'affiche dans la colonne Téléphone.
  assert.deepEqual(colonnesVides({ ...pleine, telephone: null, agents: [{ telephone: '06' }] }), []);
});

test("une fiche trouvée n'est prise que si elle porte un mot du nom", () => {
  assert.equal(memeNom('Agence du Centre Immobilier', 'Centre Immobilier Mâcon'), true);
  assert.equal(memeNom('Laforêt Mâcon', 'Laforêt'), true);
  assert.equal(memeNom('Agence du Centre', 'Century 21 Saint-Pierre'), false);
});

test("un agent ne va dans une agence que si son mail est le sien", async () => {
  const { agentVaAvec, agenceDuDomaine, domaineDuNom } = await import('./agent-ia.js');
  const azurea = { nom: 'AZUREA COMMERCES & ENTREPRISES', site: 'https://www.azurea-immo-entreprise.com/', email: 'contact@azurea-commerces.com' };
  assert.equal(agentVaAvec({ email: 'l.durand@azurea-commerces.com' }, azurea), true);
  assert.equal(agentVaAvec({ email: 'margaux.scannella@coldwellbanker.fr' }, azurea), false);
  assert.equal(agentVaAvec({ email: 'jeanne-marie.fauvet@realestate.bnpparibas.com' }, azurea), false);
  assert.equal(agentVaAvec({ email: 'famille.galiffi@gmail.com' }, azurea), false, 'un Gmail chez une agence qui a son domaine');
  assert.equal(agentVaAvec({ email: 'pergola.transactions@gmail.com' }, { nom: 'Pergola' }), true, 'une agence sans domaine garde son Gmail');
  assert.equal(agentVaAvec({ telephone: '04 22 67 07 59' }, azurea), true, 'un numéro seul ne contredit rien');
  // Le domaine qui porte le nom, sans site connu.
  assert.equal(domaineDuNom('cbre.fr', 'Cbre - Nice'), true);
  assert.equal(domaineDuNom('berge.fr', 'Cbre - Nice'), false);
  const coldwell = { nom: 'Coldwell Banker Nice', site: 'coldwellbanker.fr' };
  assert.equal(agenceDuDomaine({ email: 'didier.vanosmael@coldwellbanker.fr' }, [azurea, coldwell]), coldwell);
});

test('la réparation remet chaque agent chez lui et fusionne les doublons, sans rien perdre', async () => {
  const { reparerListe } = await import('./agent-ia.js');
  const { Records } = await import('../db.js');
  const L = Records.create('ListeAgences', { ville: 'Nice', etat: 'fini', journal: [] });
  const az = Records.create('AgenceProspect', { liste_id: L.id, nom: 'AZUREA COMMERCES & ENTREPRISES', site: 'https://www.azurea-immo-entreprise.com/', email: 'contact@azurea-commerces.com', siren: '1', sources: ['Data-B'], gerants: [], agents: [
    { email: 'l.durand@azurea-commerces.com' }, { email: 'margaux.scannella@coldwellbanker.fr' }, { email: 'famille.galiffi@gmail.com' },
  ] });
  const doublon = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Azurea Commerces', site: 'https://www.azurea-immo-entreprise.com/', sources: ['Equimmox'], gerants: [], agents: [{ telephone: '04 22 67 07 59' }] });
  const cw = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Coldwell Banker Nice', site: 'https://coldwellbanker.fr', sources: ['Google Maps'], gerants: [], agents: [] });
  const r = reparerListe(L.id);
  assert.deepEqual([r.fusions, r.deplaces, r.ecartes], [1, 1, 1]);
  const a = Records.get('AgenceProspect', az.id);
  assert.deepEqual(a.agents.map((x) => x.email || x.telephone), ['l.durand@azurea-commerces.com', '04 22 67 07 59']);
  assert.deepEqual(a.agents_ecartes.map((x) => x.email), ['famille.galiffi@gmail.com']);
  assert.equal(Records.get('AgenceProspect', doublon.id).fusionnee_dans, az.id, 'le doublon reste en base, caché');
  assert.deepEqual(Records.get('AgenceProspect', cw.id).agents.map((x) => x.email), ['margaux.scannella@coldwellbanker.fr']);
  // Une seconde fois : rien ne bouge.
  assert.deepEqual(reparerListe(L.id), { deplaces: 0, ecartes: 0, fusions: 0 });
});

test('une ligne se donne à celui qui clique, à un autre de l\'équipe, et se reprend', async () => {
  const { attribuer, equipe, prenomDe } = await import('./agent-ia.js');
  const { Records } = await import('../db.js');
  Records.create('User', { email: 'nora.l@klocka.immo', role: 'admin', full_name: 'Nora Lorinquer' });
  Records.create('User', { email: 'coralie.g@klocka.immo', role: 'admin', full_name: 'Guillaud Coralie' });
  Records.create('User', { email: 'client@exemple.fr', role: 'user' });
  // Les analystes, puis Alexis, l'ancien, en dernier.
  assert.deepEqual(equipe().map((m) => m.nom), ['Coralie', 'Jules', 'Maxime', 'Nora', 'Alexis']);
  assert.equal(equipe().find((m) => m.nom === 'Alexis').ancien, true);
  assert.equal(prenomDe('paul.dz@klocka.immo'), 'Paul');
  const a = Records.create('AgenceProspect', { liste_id: 'x', nom: 'Agence Test', agents: [], gerants: [] });
  assert.deepEqual(attribuer(a.id, {}, { email: 'nora.l@klocka.immo' }).pour, ['nora.l@klocka.immo']);
  assert.deepEqual(attribuer(a.id, { email: 'coralie.g@klocka.immo' }, { email: 'nora.l@klocka.immo' }).pour, ['nora.l@klocka.immo', 'coralie.g@klocka.immo']);
  assert.deepEqual(attribuer(a.id, { email: 'nora.l@klocka.immo', retirer: true }).pour, ['coralie.g@klocka.immo']);
  assert.equal(attribuer(a.id, { email: 'client@exemple.fr' }).ok, false, 'hors de l\'équipe');
});

test('une ligne supprimée disparaît de la liste et ne revient pas à la recherche suivante', async () => {
  const { retirerAgences, ranger, liste } = await import('./agent-ia.js');
  const { Records } = await import('../db.js');
  const L = Records.create('ListeAgences', { ville: 'Grasse', etat: 'fini', journal: [] });
  const bnp = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Bnp', telephone: '06 14 21 71 93', agents: [], gerants: [] });
  assert.equal(retirerAgences([bnp.id], { email: 'nora.l@klocka.immo' }).retirees, 1);
  assert.ok(!liste(L.id).lignes.some((x) => x.id === bnp.id));
  assert.equal(Records.get('AgenceProspect', bnp.id).retiree_par, 'nora.l@klocka.immo', 'gardée en base, avec qui l\'a retirée');
  // La même agence relue par Google Maps : retrouvée, et toujours masquée.
  ranger(L.id, { nom: 'Bnp', telephone: '06 14 21 71 93', sources: ['Google Maps'] });
  assert.ok(!liste(L.id).lignes.some((x) => x.nom === 'Bnp'));
});

test('un motif de suppression qui nomme un métier devient une règle : les autres lignes de ce métier sortent aussi', async () => {
  const { retirerAgences, liste, metierDuMotif, retirees } = await import('./agent-ia.js');
  const { Records } = await import('../db.js');
  assert.equal(metierDuMotif('c\'est un notaire').cle, 'notaire');
  assert.equal(metierDuMotif('que des entrepôts sur le site').cle, 'entrepots');
  assert.equal(metierDuMotif('trop petit'), null);
  const L = Records.create('ListeAgences', { ville: 'Antibes', etat: 'fini', journal: [] });
  const n1 = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Etude Martin', raison_sociale: 'SCP MARTIN NOTAIRES', telephone: '04 93 00 00 11', agents: [], gerants: [] });
  const n2 = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Office Notarial du Port', telephone: '04 93 00 00 12', agents: [], gerants: [] });
  const ag = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Agence du Port', telephone: '04 93 00 00 13', agents: [], gerants: [] });
  const r = retirerAgences([n1.id], { email: 'jules.b@klocka.immo' }, 'notaire');
  assert.deepEqual([r.retirees, r.metier, r.aussi], [1, 'Notaire', 1]);
  const ids = liste(L.id).lignes.map((x) => x.id);
  assert.ok(!ids.includes(n2.id), 'l\'autre notaire est retiré seul');
  assert.ok(ids.includes(ag.id));
  assert.match(retirees(L.id).find((x) => x.id === n2.id).motif, /Notaire \(appris de « notaire »\)/);
  // Une ligne qu'on suit (associée à quelqu'un) ne disparaît jamais seule.
  const suivie = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Notaires Associés', pour: ['nora.l@klocka.immo'], agents: [], gerants: [] });
  const { appliquerRegles } = await import('./agent-ia.js');
  appliquerRegles(L.id);
  assert.equal(Records.get('AgenceProspect', suivie.id).hors_cible, undefined);
});
