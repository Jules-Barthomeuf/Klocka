// Après le dépôt dans la Data Room (29 oct. 2026) : noms proposés puis validés, rangement dans le Drive par famille,
// avec le Doc du contexte. Lecture et Drive simulés : rien ne part chez Google ni chez le modèle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-data-room-'));
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-data-room-up-'));
const { Records } = await import('../db.js');
const A = await import('./analyse-pieces.js');
const D = await import('./data-room.js');

function dossier(id, documents) {
  for (const d of documents) fs.writeFileSync(path.join(uploadDir, `${d.id}.pdf`), `contenu de ${d.nom}`);
  Records.create('Deal', {
    deal_id: id, nom: 'Lorient',
    lots: [{ lot: { adresse: { valeur: { ville: 'Lorient', rue: '12 rue Foch' } } } }],
    documents_espace: documents.map((d) => ({ ...d, url: `/uploads/${d.id}.pdf`, mime: 'application/pdf' })),
  });
}

test('le nom assemblé : intitulé, précision, date, extension d\'origine ; rien d\'interdit pour Drive', () => {
  assert.equal(D.assemblerNom({ intitule: 'Bail commercial', precision: 'SARL RIMEL', date: '16.03.2026' }, 'scan.PDF'), 'Bail commercial - SARL RIMEL - 16.03.2026.pdf');
  assert.equal(D.assemblerNom({ intitule: 'Quittance de loyer', precision: '', date: 'mars 2026' }, 'q.pdf'), 'Quittance de loyer - mars 2026.pdf');
  assert.equal(D.assemblerNom({ intitule: 'PV / AG', precision: '', date: '' }, 'x.pdf'), 'PV AG.pdf');
  assert.equal(D.assemblerNom({}, 'scan001.pdf'), 'scan001.pdf');
});

test('proposer : une lecture par pièce, la pièce d\'avant rangée par sa catégorie, la proposition gardée', async () => {
  dossier('DR1', [{ id: 'b', nom: 'BAIL.pdf' }, { id: 'q', nom: 'q3.pdf', categorie: 'Quittances' }]);
  A.rangerPiece('DR1', 'b', 'bail', null, { lire: false });
  A.poserContexte('DR1', 'b', 'En tacite reconduction depuis 2014.', null);
  const vus = [];
  const proposer = async ({ piece, zone, contexte }) => { vus.push([piece.nom, zone, contexte]); return zone === 'Bail' ? { intitule: 'Bail commercial', precision: 'SARL RIMEL', date: '16.03.2026' } : { intitule: 'Quittance de loyer', precision: '', date: 'mars 2026' }; };
  const r = await D.proposerNoms('DR1', { uploadDir, proposer });
  assert.equal(r.proposes, 2);
  assert.deepEqual(vus.find((v) => v[0] === 'BAIL.pdf'), ['BAIL.pdf', 'Bail', 'En tacite reconduction depuis 2014.']);
  assert.equal(Records.findBy('Deal', 'deal_id', 'DR1').analyse_pieces.docs.q.type, 'quittances');
  const r2 = await D.proposerNoms('DR1', { uploadDir, proposer: async () => { throw new Error('déjà proposé'); } });
  assert.equal(r2.proposes, 0);
});

test('ranger dans le Drive : noms validés dans Klocka, un sous-dossier par famille, le Doc du contexte', async () => {
  dossier('DR2', [{ id: 'b', nom: 'BAIL.pdf' }, { id: 'av', nom: 'av.pdf' }, { id: 'p', nom: 'pv.pdf' }, { id: 'z', nom: 'zz.pdf' }]);
  A.rangerPiece('DR2', 'b', 'bail', null, { lire: false });
  A.rangerPiece('DR2', 'av', 'avenants', null, { lire: false });
  A.rangerPiece('DR2', 'p', 'pv_ag', null, { lire: false });
  const t = A.creerType('DR2', 'Ancien bail', null);
  A.rangerPiece('DR2', 'z', t.id, null, { lire: false });
  A.poserContexte('DR2', 'b', 'Signé en 2005.', null);
  let recu = null;
  const drive = { rangerDataRoom: async (compte, o) => { recu = o; return { folder_id: 'F1', folder_url: 'https://drive/F1', liens: Object.fromEntries(o.groupes.flatMap((g) => g.fichiers).map((f) => [f.id, { drive_file_id: `id-${f.id}`, drive_url: `https://drive/${f.id}` }])), erreurs: [] }; } };
  const r = await D.rangerDansDrive('DR2', { b: 'Bail commercial - SARL RIMEL - 16.03.2026.pdf' }, { uploadDir, drive });
  assert.equal(r.ok, true);
  assert.equal(r.ranges, 4);
  assert.deepEqual(recu.groupes.map((g) => [g.sousDossier, g.fichiers.map((f) => f.id)]), [['01 Bail', ['b', 'av']], ['03 Copropriété', ['p']], ['06 Autres pièces', ['z']]]);
  assert.match(recu.contexte, /Bail commercial - SARL RIMEL - 16\.03\.2026\.pdf \(Bail\)\nSigné en 2005\./);
  const deal = Records.findBy('Deal', 'deal_id', 'DR2');
  assert.equal(deal.drive_folder_url, 'https://drive/F1');
  assert.equal(deal.documents_espace.find((d) => d.id === 'b').nom, 'Bail commercial - SARL RIMEL - 16.03.2026.pdf');
  assert.ok(A.lireDepots('DR2').emplacements.flatMap((e) => e.documents).every((d) => d.drive_range_le));
});

test('un dossier de test ne va jamais dans le Drive, mais ses pièces prennent le nom choisi', async () => {
  dossier('DR3', [{ id: 'b', nom: 'b.pdf' }]);
  A.rangerPiece('DR3', 'b', 'bail', null, { lire: false });
  Records.update('Deal', Records.findBy('Deal', 'deal_id', 'DR3').id, { test: true });
  const r = await D.rangerDansDrive('DR3', { b: 'Bail commercial - SARL RIMEL - 16.03.2026.pdf' }, { uploadDir, drive: { rangerDataRoom: async () => { throw new Error('ne doit pas partir'); } } });
  assert.equal(r.ok, true);
  assert.equal(r.test, true);
  assert.equal(r.renommees, 1);
  assert.equal(Records.findBy('Deal', 'deal_id', 'DR3').documents_espace[0].nom, 'Bail commercial - SARL RIMEL - 16.03.2026.pdf');
});
