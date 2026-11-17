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

test("un téléphone refusé par Twenty n'arrête plus l'envoi : le lot est repris ligne par ligne (17 nov. 2026)", async () => {
  const liste = Records.create('ListeAgences', { ville: 'Lyon', nom: 'Lyon' });
  const bonne = Records.create('AgenceProspect', { liste_id: liste.id, nom: 'Agence Bellecour', telephone: '04 78 11 11 11' });
  const fautive = Records.create('AgenceProspect', { liste_id: liste.id, nom: 'Agence Confluence', telephone: '+33 4 78 22 22 22 99' });
  const posees = [];
  const T = {
    LOT_MAX: 60,
    lister: async () => [],
    creerEnLot: async (_p, lignes) => {
      if (lignes.some((l) => l.name === 'Agence Confluence' && l.telephone.primaryPhoneNumber)) throw new Error('Provided and inferred country code are conflicting');
      return lignes.map((l, i) => { const x = { ...l, id: `l${posees.length + i}` }; posees.push(x); return x; });
    },
    modifier: async () => {},
  };
  const r = await M.synchroniser({ go: true, T });
  assert.equal(r.erreurs, 0);
  assert.ok(Records.get('AgenceProspect', bonne.id).twenty_agence_id);
  assert.ok(Records.get('AgenceProspect', fautive.id).twenty_agence_id, 'posée sans son téléphone');
  assert.equal(posees.find((x) => x.name === 'Agence Confluence').telephone.primaryPhoneNumber, '');
});

test("les agents d'Agent immobilier : leur agence passe En contact, l'agence inconnue est créée une fois, le statut posé à la main reste (17 nov. 2026)", async () => {
  const base = new Map([
    ['g1', { id: 'g1', name: 'Immothep', ville: 'GRENOBLE', contact: 'JAMAIS', telephone: { primaryPhoneNumber: '476000000' } }],
    ['g2', { id: 'g2', name: 'Agence De Lille', ville: 'LILLE', contact: 'JAMAIS' }],
    ['g3', { id: 'g3', name: 'Foncia', ville: 'BORDEAUX', contact: 'MORT' }],
  ]);
  const agents = [
    { id: 'a1', name: 'Stéphane BENIMONT', ville: 'Grenoble', entreprise: 'Immothep', eMail: { primaryEmail: 's@gmail.com' } },
    { id: 'a2', name: 'Bruno HUBERT', ville: 'Lille', entreprise: 'Lille Immo', eMail: { primaryEmail: 'b@lilleimmo.fr' }, telephone: { primaryPhoneNumber: '611111111', primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33' } },
    { id: 'a3', name: 'Paul Bordeaux', ville: 'Bordeaux', entreprise: 'Foncia' },
    { id: 'a4', name: 'Essai', ville: 'Lyon (essai par l’écran)', entreprise: 'Test' },
  ];
  let n = 0;
  const T = {
    LOT_MAX: 60,
    lister: async (_p, o = {}) => (o.filtre ? [] : [...base.values()]),
    creerEnLot: async (_p, lignes) => lignes.map((l) => { const x = { ...l, id: `c${++n}` }; base.set(x.id, x); return x; }),
    modifier: async (_p, id, v) => base.set(id, { ...base.get(id), ...v }),
  };
  const r = await M.synchroniser({ go: true, T, agents });
  assert.equal(base.get('g1').contact, 'EN_CONTACT');
  assert.match(base.get('g1').agentsImmo, /BENIMONT/);
  assert.equal(base.get('g2').contact, 'JAMAIS', '« Lille Immo » n’est pas « Agence De Lille »');
  assert.equal(base.get('g3').contact, 'MORT', 'Mort reste mort');
  const nees = [...base.values()].filter((x) => String(x.klockaId || '').startsWith('agent:'));
  assert.deepEqual(nees.map((x) => [x.name, x.ville, x.contact]), [['Lille Immo', 'LILLE', 'EN_CONTACT']]);
  assert.equal(r.agences_agents, 1);
  const r2 = await M.synchroniser({ go: true, T, agents });
  assert.equal(r2.agences_agents, 0, 'pas recréée au passage suivant');
  assert.equal([...base.values()].filter((x) => String(x.klockaId || '').startsWith('agent:')).length, 1);
});

test("un lot refusé parmi les agences des agents ne fait pas recréer les lots déjà passés (17 nov. 2026)", async () => {
  const base = new Map();
  const agents = Array.from({ length: 5 }, (_, i) => ({ id: `z${i}`, name: `Agent ${i}`, ville: 'Brest', entreprise: `Agence Numero${i}x`, telephone: { primaryPhoneNumber: `61000000${i}` } }));
  let n = 0;
  const T = {
    LOT_MAX: 2,
    lister: async (_p, o = {}) => (o.filtre ? [] : [...base.values()].filter((x) => x.ville !== undefined)),
    creerEnLot: async (_p, lignes) => {
      if (lignes.length > 1 && lignes.some((l) => l.name === 'Agence Numero3x')) throw new Error('refusé');
      return lignes.map((l) => { const x = { ...l, id: `c${++n}` }; base.set(x.id, x); return x; });
    },
    modifier: async () => {},
  };
  await M.synchroniser({ go: true, T, agents });
  const nees = [...base.values()].filter((x) => String(x.klockaId || '').startsWith('agent:'));
  assert.equal(nees.length, 5);
  assert.equal(new Set(nees.map((x) => x.klockaId)).size, 5, 'aucun doublon');
});
