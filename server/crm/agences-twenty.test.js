// Le tableau Agences de Twenty CRM (16 nov. 2026) : la ligne d'une agence, et un rejeu qui ne recrée rien.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-agences-twenty-'));
const { Records } = await import('../db.js');
const M = await import('./agences-twenty.js');

test('la ligne Twenty : ville en option, mandataire à part, téléphone au format de Twenty, interlocuteurs un par ligne', () => {
  const a = { id: 'k1', nom: 'Christian Arione', genre: 'mandataire', telephone: '06 72 32 13 76', site: 'www.exemple.fr/', agents: [{ nom: 'Sophie Le Gall', fonction: 'Responsable commerce', telephone: '04 93 00 00 00' }, { nom: 'sophie le gall' }], sources: ['Equimmox'] };
  const r = M.versTwenty(a, { name: 'Christian Arione', ville: 'Nice', statut: 'Jamais appelée' });
  assert.equal(r.ville, 'NICE');
  assert.equal(r.genre, 'MANDATAIRE');
  assert.deepEqual(r.telephone, { primaryPhoneNumber: '672321376', primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33' });
  assert.equal(r.siteWeb.primaryLinkUrl, 'https://www.exemple.fr', 'sans la barre finale, comme Twenty la garde');
  assert.equal(r.interlocuteurs, 'Sophie Le Gall · Responsable commerce · 04 93 00 00 00');
  assert.equal(r.klockaId, 'k1');
});

test('la différence ignore ce que Twenty ajoute aux champs composés et les vides équivalents', () => {
  const avant = { statut: 'Jamais appelée', telephone: { primaryPhoneNumber: '672321376', primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33', additionalPhones: [] }, issue: null, annonces: null };
  assert.deepEqual(M.difference(avant, { statut: 'Jamais appelée', telephone: { primaryPhoneNumber: '672321376', primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33' }, issue: '', annonces: null }), {});
  assert.deepEqual(M.difference(avant, { statut: 'Rappeler mardi' }), { statut: 'Rappeler mardi' });
});

test('le rejeu met à jour, crée les nouvelles, et ne recrée pas une ligne mise à la corbeille dans Twenty', async () => {
  const liste = Records.create('ListeAgences', { ville: 'Nice', nom: 'Nice' });
  const a1 = Records.create('AgenceProspect', { liste_id: liste.id, nom: 'Agence du Port', telephone: '04 93 11 11 11', sources: ['Google Maps'] });
  const a2 = Records.create('AgenceProspect', { liste_id: liste.id, nom: 'Agence du Cours', telephone: '04 93 22 22 22', sources: ['Google Maps'] });
  const base = new Map();
  let n = 0;
  const T = {
    LOT_MAX: 60,
    lister: async () => [...base.values()],
    creerEnLot: async (_p, lignes) => lignes.map((l) => { const x = { ...l, id: `t${++n}` }; base.set(x.id, x); return x; }),
    modifier: async (_p, id, v) => base.set(id, { ...base.get(id), ...v }),
  };
  const r1 = await M.synchroniser({ go: true, T });
  assert.equal(r1.nouvelles, 2);
  assert.ok(Records.get('AgenceProspect', a1.id).twenty_agence_id);
  const r2 = await M.synchroniser({ go: true, T });
  assert.deepEqual([r2.nouvelles, r2.majs, r2.inchangees], [0, 0, 2]);
  base.delete(Records.get('AgenceProspect', a2.id).twenty_agence_id);
  const r3 = await M.synchroniser({ go: true, T });
  assert.equal(r3.corbeille, 1);
  assert.equal(base.size, 1, 'la ligne mise à la corbeille n’est pas recréée');
});

test("une autre base qui écrit dans le même Twenty retrouve les lignes au lieu de les recréer (16 nov. 2026)", async () => {
  const liste = Records.create('ListeAgences', { ville: 'Rennes', nom: 'Rennes' });
  const a1 = Records.create('AgenceProspect', { liste_id: liste.id, nom: 'Agence Foch', telephone: '02 99 11 11 11' });
  const a2 = Records.create('AgenceProspect', { liste_id: liste.id, nom: 'Agence Gare', telephone: '02 99 22 22 22' });
  const a3 = Records.create('AgenceProspect', { liste_id: liste.id, nom: 'Agence Jetée', telephone: '02 99 33 33 33' });
  const L = await M.agencesDesListes();
  const ligne = (a) => { const x = L.find((y) => y.a.id === a.id); return M.versTwenty(x.a, x.l); };
  // Posées par l'autre base : a1 avec son id Klocka, a2 sous un autre id Klocka (même ville, nom, téléphone), a3 jetée.
  const vivantes = [{ ...ligne(a1), id: 'x1' }, { ...ligne(a2), id: 'x2', klockaId: 'ailleurs' }];
  const jetee = { ...ligne(a3), id: 'x3', deletedAt: '2026-11-16T10:00:00Z' };
  const crees = [];
  const T = {
    LOT_MAX: 60,
    lister: async (_p, o = {}) => (o.filtre ? [jetee] : vivantes),
    creerEnLot: async (_p, lignes) => { crees.push(...lignes); return lignes.map((l, i) => ({ ...l, id: `n${i}` })); },
    modifier: async () => {},
  };
  const r = await M.synchroniser({ go: true, T });
  assert.equal(crees.filter((c) => [a1.id, a2.id, a3.id].includes(c.klockaId)).length, 0, 'rien de recréé');
  assert.equal(Records.get('AgenceProspect', a1.id).twenty_agence_id, 'x1');
  assert.equal(Records.get('AgenceProspect', a2.id).twenty_agence_id, 'x2');
  assert.ok(r.retrouvees >= 3 && r.corbeille >= 1);
});
