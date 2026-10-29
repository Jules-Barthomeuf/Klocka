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

test("une pièce reçue après coup : seule elle est à lire ; une pièce lue sans les infos du Bien ne relit que celles-là", () => {
  dossier('DR4', [{ id: 'b', nom: 'bail.pdf' }, { id: 'p', nom: 'pv.pdf' }, { id: 'q', nom: 'q.pdf' }]);
  A.rangerPiece('DR4', 'b', 'bail', null, { lire: false });
  A.rangerPiece('DR4', 'p', 'pv_ag', null, { lire: false });
  A.rangerPiece('DR4', 'q', 'quittances', null, { lire: false });
  const brut = Records.findBy('Deal', 'deal_id', 'DR4');
  const etat = structuredClone(brut.analyse_pieces);
  etat.docs.b.extraction = { statut: 'fait' };
  etat.docs.b.valeurs = { type_bail: { valeur: '3/6/9' } };
  etat.docs.q.extraction = { statut: 'fait' };
  etat.docs.q.valeurs = { loyer_hc_ht: { valeur: '2 000 €' } };
  Records.update('Deal', brut.id, { analyse_pieces: etat });
  const a = D.aLire('DR4');
  assert.deepEqual(a.nouvelles.map((x) => x.id), ['p'], 'le PV arrivé après : lui seul');
  assert.deepEqual(a.completer.map((x) => [x.id, x.manque]), [['b', ['bien_adresse', 'bien_surface', 'bien_bailleur']]], 'les quittances n\'ont rien à donner au Bien');
  assert.equal(A.lireDepots('DR4').nouvelles, 1);
});

test("l'onglet Bien se remplit avec les pièces lues ; une ligne modifiée par l'analyste reste la sienne", async () => {
  dossier('DR5', [{ id: 'b', nom: 'bail.pdf' }, { id: 't', nom: 'tf.pdf' }]);
  A.rangerPiece('DR5', 'b', 'bail', null, { lire: false });
  A.rangerPiece('DR5', 't', 'taxe_fonciere', null, { lire: false });
  await A.lirePiece('DR5', 'b', { uploadDir, lire: async () => JSON.stringify({ criteres: { bien_surface: { valeur: '85 m² utiles', page: 2, donnees: { m2: 85 } }, bien_bailleur: { valeur: 'SCI DU PORT', page: 1 }, bien_adresse: { valeur: '12 rue Foch, 56100 Lorient', page: 1 }, parties: { valeur: 'SARL RIMEL', donnees: { locataire: 'SARL RIMEL' } } } }) });
  await A.lirePiece('DR5', 't', { uploadDir, lire: async () => JSON.stringify({ criteres: { montant: { valeur: '2 140 €', page: 1 }, bien_proprietaire: { valeur: 'SCI DU PORT', page: 1 } } }) });
  const { bienDu } = await import('./bien-analyse.js');
  let b = (await bienDu('DR5')).lignes;
  const l = (id) => b.find((x) => x.id === id);
  assert.match(l('surface').valeur, /85/);
  assert.equal(l('surface').sources[0].page, 2);
  assert.match(l('vendeur').valeur, /SCI DU PORT/);
  assert.equal(l('taxe_fonciere').valeur, '2 140 €');
  assert.match(l('locataire').valeur, /SARL RIMEL/);
  assert.equal(l('surface').etat, 'ia');
  assert.equal(A.deciderCase('DR5', 'bien', 'surface', { action: 'corriger', valeur: '82 m² Carrez' }, { email: 'nora@klocka.immo' }).ok, true);
  b = (await bienDu('DR5')).lignes;
  assert.equal(l('surface').valeur, '82 m² Carrez');
  assert.equal(l('surface').etat, 'corrige');
  assert.equal(l('surface').par, 'nora@klocka.immo');
  assert.match(l('surface').valeur_lue, /85/);
});

test("faire tourner l'état : la valeur saisie à la main reste de côté quand on repasse par « Lu par l'IA »", async () => {
  dossier('DR6', [{ id: 'b', nom: 'bail.pdf' }]);
  A.rangerPiece('DR6', 'b', 'bail', null, { lire: false });
  await A.lirePiece('DR6', 'b', { uploadDir, lire: async () => JSON.stringify({ criteres: { depot: { valeur: '3 000 €' } } }) });
  const ligne = () => A.lireAnalyse('DR6').grilles[0].lignes.find((x) => x.id === 'depot');
  A.deciderCase('DR6', 'bail', 'depot', { action: 'corriger', valeur: '6 000 €' }, { email: 'nora@klocka.immo' });
  A.deciderCase('DR6', 'bail', 'depot', { action: 'verifier', valeur: '6 000 €' }, null);
  assert.equal(ligne().statut, 'verifie');
  A.deciderCase('DR6', 'bail', 'depot', { action: 'reinitialiser' }, null);
  assert.equal(ligne().statut, 'ia');
  assert.equal(ligne().valeur, '3 000 €');
  assert.equal(ligne().valeur_main, '6 000 €', 'gardée pour le clic suivant');
});
