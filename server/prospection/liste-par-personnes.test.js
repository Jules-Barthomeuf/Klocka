import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-personnes-'));
const { Records } = await import('../db.js');
const L = await import('./liste-par-personnes.js');

const p = (prenom, masque, title, org) => ({ id: `${prenom}-${org}`, first_name: prenom, last_name_obfuscated: masque, title, organization: { name: org } });

test('liste par personnes : les agences gardées avec leurs collaborateurs ; bailleurs, BTP et réseaux de mandataires écartés', async () => {
  const people = [
    p('Nathalie', 'La***r', 'CEO', 'ACTION IMMOBILIER'),
    p('Paul', 'Du***d', 'Négociateur Transaction', 'ACTION IMMOBILIER'),
    p('Julie', 'Gi***t', 'Assistante Syndic', 'ACTION IMMOBILIER'),
    p('David', 'Du***u', 'Real Estate Advisor', 'CAPITAL IMMOBILIER'),
    p('Marc', 'Ro***s', 'Directeur', 'Alpes Isère Habitat'),
    p('Léa', 'Ma***n', 'Conseillère immobilier', 'iad France'),
    p('Tom', 'Be***t', 'Chef de chantier', 'Bouygues Bâtiment Sud-Est'),
    p('Anne', 'Co***e', 'Négociatrice transaction', 'Citya Audras et Delaunois'),
    p('Luc', 'Fa***x', 'Conseiller transaction', 'citya immobilier'),
  ];
  const { gardees, ecartees } = await L.choisirEntreprises(people);
  assert.deepEqual(gardees.map((g) => g.nom), ['ACTION IMMOBILIER', 'CAPITAL IMMOBILIER', 'Citya Audras et Delaunois', 'citya immobilier']);
  const action = gardees.find((g) => g.nom === 'ACTION IMMOBILIER');
  assert.deepEqual(action.gens.map((g) => g.prenom), ['Paul', 'Nathalie'], 'le syndic n\'est pas un interlocuteur ; la transaction avant la direction');
  assert.equal(gardees.find((g) => g.nom === 'CAPITAL IMMOBILIER').gens[0].poste, 'Conseiller immobilier', 'un poste en anglais, traduit et gardé');
  assert.deepEqual(ecartees.reseau, ['iad France']);
  assert.ok(ecartees.pas_agence.includes('Alpes Isère Habitat') && ecartees.pas_agence.includes('Bouygues Bâtiment Sud-Est'));

  // Maps : deux noms Citya, une seule vitrine ; Capital Immobilier sans vitrine dans la commune.
  const fiches = {
    'ACTION IMMOBILIER': { nom: 'Action Immobilier Grenoble', place_id: 'pl-1', telephone: '04 76 00 00 01', site: 'https://action-immo.fr', adresse: '1 rue Félix Poulat' },
    'Citya Audras et Delaunois': { nom: 'Citya Audras & Delaunois', place_id: 'pl-2', telephone: '04 76 00 00 02' },
    'citya immobilier': { nom: 'Citya Audras & Delaunois', place_id: 'pl-2', telephone: '04 76 00 00 02' },
  };
  const r = await L.creerListeParPersonnes({ ville: 'Grenoble', nom: 'Grenoble 2', journal: () => {}, deps: { personnes: people, commune: { nom: 'Grenoble', codes_postaux: ['38000'] }, chercher: async (n) => fiches[n] || null } });
  assert.equal(r.agences, 2);
  assert.equal(r.hors_ville, 1);
  const l = Records.get('ListeAgences', r.liste);
  assert.equal(l.ville, 'Grenoble 2');
  assert.equal(L.communeDeListe(l), 'Grenoble', 'la carte d\'appel cherche l\'équipe à Grenoble, pas à « Grenoble 2 »');
  const agences = Records.list('AgenceProspect').filter((a) => a.liste_id === l.id);
  const citya = agences.find((a) => a.place_id === 'pl-2');
  assert.deepEqual(citya.apollo_equipe.gens.map((g) => g.prenom).sort(), ['Anne', 'Luc']);
  assert.equal(citya.apollo_equipe.par_personnes, true);
  assert.equal(citya.ville, 'Grenoble');
  assert.ok(L.memeEnseigne('HAPI IMMOBILIER', 'Hapi Immobilier Meylan') && !L.memeEnseigne('HAPI IMMOBILIER', 'Groupe H-Immo Agence Immobilière'));
  assert.ok(L.memeEnseigne("ZAN'IMMO", 'ZANIMMO Grenoble') && !L.memeEnseigne('ABimmo', 'APPIMMO'));
  assert.equal((await L.creerListeParPersonnes({ ville: 'Grenoble', nom: 'Grenoble 2', deps: { personnes: [] } })).deja, true, 'une seule fois');
});
