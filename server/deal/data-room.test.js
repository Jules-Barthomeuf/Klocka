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

test('les versions : Annuler remet la case d\'avant, Rétablir celle d\'après, un geste nouveau efface ce qu\'on pouvait rétablir', async () => {
  dossier('DR7', [{ id: 'b', nom: 'bail.pdf' }]);
  A.rangerPiece('DR7', 'b', 'bail', null, { lire: false });
  await A.lirePiece('DR7', 'b', { uploadDir, lire: async () => JSON.stringify({ criteres: { depot: { valeur: '3 000 €' } } }) });
  const ligne = () => A.lireAnalyse('DR7').grilles[0].lignes.find((x) => x.id === 'depot');
  assert.equal(A.changerDeVersion('DR7', 'annuler').ok, false, 'rien à annuler');
  A.deciderCase('DR7', 'bail', 'depot', { action: 'corriger', valeur: '6 000 €' }, { email: 'nora@klocka.immo' });
  A.deciderCase('DR7', 'bail', 'depot', { action: 'verifier', valeur: '6 000 €' }, null);
  assert.deepEqual(A.versionsDe('DR7'), { annuler: 2, retablir: 0 });
  A.changerDeVersion('DR7', 'annuler');
  assert.equal(ligne().statut, 'corrige');
  A.changerDeVersion('DR7', 'annuler');
  assert.equal(ligne().statut, 'ia');
  assert.equal(ligne().valeur, '3 000 €');
  A.changerDeVersion('DR7', 'retablir');
  assert.equal(ligne().statut, 'corrige');
  assert.equal(ligne().valeur, '6 000 €');
  assert.deepEqual(A.versionsDe('DR7'), { annuler: 1, retablir: 1 });
  A.deciderCase('DR7', 'bail', 'depot', { action: 'introuvable' }, null);
  assert.deepEqual(A.versionsDe('DR7'), { annuler: 2, retablir: 0 });
});

test("le simulateur d'un dossier sans lot : ses chiffres se gardent sur un lot neuf, le dernier chiffre l'emporte", async () => {
  const { enregistrerSimulateur } = await import('./index.js');
  Records.create('Deal', { deal_id: 'DR8', nom: 'Sans lot' });
  const r = await enregistrerSimulateur('DR8', 0, { prixBienFAI: 350 }, { email: 'nora@klocka.immo' });
  assert.equal(r.error, undefined);
  assert.equal(Records.findBy('Deal', 'deal_id', 'DR8').lots[0].simulateur.prixBienFAI, 350);
  await enregistrerSimulateur('DR8', 0, { prixBienFAI: 420 }, null);
  assert.equal(Records.findBy('Deal', 'deal_id', 'DR8').lots[0].simulateur.prixBienFAI, 420);
});

test("modifier une valeur la met en OK ; repasser par « Lu par l'IA » puis OK remet la valeur saisie", async () => {
  dossier('DR9', [{ id: 'b', nom: 'bail.pdf' }]);
  A.rangerPiece('DR9', 'b', 'bail', null, { lire: false });
  await A.lirePiece('DR9', 'b', { uploadDir, lire: async () => JSON.stringify({ criteres: { depot: { valeur: '3 000 €' } } }) });
  const ligne = () => A.lireAnalyse('DR9').grilles[0].lignes.find((x) => x.id === 'depot');
  A.deciderCase('DR9', 'bail', 'depot', { action: 'verifier', valeur: '6 000 €', main: true }, { email: 'nora@klocka.immo' });
  assert.equal(ligne().statut, 'verifie');
  assert.equal(ligne().valeur, '6 000 €');
  A.deciderCase('DR9', 'bail', 'depot', { action: 'reinitialiser' }, null);
  assert.equal(ligne().statut, 'ia');
  assert.equal(ligne().valeur, '3 000 €');
  A.deciderCase('DR9', 'bail', 'depot', { action: 'verifier', valeur: ligne().valeur_main }, null);
  assert.equal(ligne().valeur, '6 000 €');
});

test("ajouter au Drive : seules les pièces cochées partent, les autres ne sont ni renommées ni renvoyées", async () => {
  dossier('DR10', [{ id: 'b', nom: 'bail.pdf' }, { id: 'p1', nom: 'pv1.pdf' }, { id: 'p2', nom: 'pv2.pdf' }]);
  A.rangerPiece('DR10', 'b', 'bail', null, { lire: false });
  A.rangerPiece('DR10', 'p1', 'pv_ag', null, { lire: false });
  A.rangerPiece('DR10', 'p2', 'pv_ag', null, { lire: false });
  let recu = null;
  const drive = { rangerDataRoom: async (compte, o) => { recu = o; return { folder_id: 'F2', folder_url: 'https://drive/F2', liens: Object.fromEntries(o.groupes.flatMap((g) => g.fichiers).map((f) => [f.id, { drive_file_id: `id-${f.id}`, drive_url: `https://drive/${f.id}` }])), erreurs: [] }; } };
  const r = await D.rangerDansDrive('DR10', { p1: 'PV AG 2026.pdf', p2: 'Ne pas prendre.pdf' }, { uploadDir, drive, seulement: ['p1'] });
  assert.equal(r.ok, true);
  assert.deepEqual(recu.groupes.flatMap((g) => g.fichiers.map((f) => f.id)), ['p1']);
  const deal = Records.findBy('Deal', 'deal_id', 'DR10');
  assert.equal(deal.documents_espace.find((d) => d.id === 'p1').nom, 'PV AG 2026.pdf');
  assert.equal(deal.documents_espace.find((d) => d.id === 'p2').nom, 'pv2.pdf');
  assert.equal(deal.documents_espace.find((d) => d.id === 'p2').drive_range_le, undefined);
  assert.equal((await D.rangerDansDrive('DR10', {}, { uploadDir, drive, seulement: [] })).ok, false);
});

test("un nom corrigé avant le Drive devient le nom de la Data Room, de la colonne Source et du Drive", async () => {
  dossier('DR11', [{ id: 'b', nom: 'doc0165752026.pdf' }]);
  A.rangerPiece('DR11', 'b', 'bail', null, { lire: false });
  await D.proposerNoms('DR11', { uploadDir, proposer: async () => ({ intitule: 'Bail commercial', precision: 'MACSF', date: '27.05.2005' }) });
  const drive = { rangerDataRoom: async (c, o) => ({ folder_id: 'F', folder_url: 'u', liens: Object.fromEntries(o.groupes.flatMap((g) => g.fichiers).map((f) => [f.id, { drive_file_id: 'x', drive_url: 'y' }])), erreurs: [] }) };
  await D.rangerDansDrive('DR11', { b: 'Bail commercial MACSF corrigé.pdf' }, { uploadDir, drive });
  const doc = A.lireDepots('DR11').emplacements.flatMap((e) => e.documents).find((d) => d.id === 'b');
  assert.equal(doc.nom, 'Bail commercial MACSF corrigé.pdf');
  assert.equal(doc.nom_propose, 'Bail commercial MACSF corrigé.pdf');
});

test("la vacance du lot : l'outil Vacance autour et sur la rue, gardée sur le lot ; la commune qui se recense se redemande", async () => {
  const { mesurerVacance } = await import('./marche-vacance.js');
  Records.create('Deal', { deal_id: 'DR12', lots: [{ lot: { adresse: { valeur: { rue: '12 rue Foch', code_postal: '56100', ville: 'Lorient' } } } }] });
  const adresse = { resoudreAdresse: async () => ({ label: '12 Rue Foch 56100 Lorient', lat: 47.7, lon: -3.36, code_insee: '56121', rue: 'Rue Foch', ville: 'Lorient' }) };
  const charge = { tauxDeVacance: async () => ({ ok: true, statut: 202, etat: 'chargement' }), tauxDeLaRue: async () => ({ ok: true, statut: 202 }) };
  assert.equal((await mesurerVacance('DR12', { adresse, outil: charge })).etat, 'chargement');
  const pret = {
    tauxDeVacance: async (q) => { assert.equal(q.commune, '56121'); return { ok: true, statut: 200, taux: { taux: 12.5, vacants: 3, occupes: 21, incertains: 2, locaux: 26, fiable: true }, zone: { rayon_m: 300 } }; },
    tauxDeLaRue: async (q) => { assert.equal(q.voie, 'Rue Foch'); return { ok: true, statut: 200, taux: { taux: 8, vacants: 1, occupes: 12, incertains: 0, locaux: 13, fiable: true }, zone: {} }; },
  };
  const r = await mesurerVacance('DR12', { adresse, outil: pret });
  assert.equal(r.etat, 'pret');
  const v = Records.findBy('Deal', 'deal_id', 'DR12').lots[0].vacance;
  assert.equal(v.zone.taux, 12.5);
  assert.equal(v.sur_la_rue.taux, 8);
  assert.equal(v.zone.rayon_m, 300);
});

test("rentrer le projet puis le mettre à jour depuis le dossier : chiffres du lot et cases tranchées, rien d'effacé", async () => {
  const P = await import('./projet.js');
  Records.create('Deal', { deal_id: 'DR13', nom: 'Lorient', documents_espace: [{ id: 'b', nom: 'bail.pdf', url: '/uploads/b13.pdf', mime: 'application/pdf' }],
    lots: [{ lot: { adresse: { absent: false, valeur: { rue: '12 rue Foch', code_postal: '56100', ville: 'Lorient' } }, surface_m2: { absent: false, valeur: 80 }, loyer_annuel_ht_hc: { absent: false, valeur: 12000 } } }] });
  fs.writeFileSync(path.join(uploadDir, 'b13.pdf'), 'bail');
  const cree = P.creerProjetDepuisDeal('DR13', 0, { email: 'nora@klocka.immo' });
  assert.equal(cree.ok !== false, true);
  const id = Records.findBy('Deal', 'deal_id', 'DR13').projet_id;
  assert.equal(Records.get('Project', id).loyer_annuel_ht, 12000);
  Records.update('Project', id, { photos: ['p.jpg'], nom_locataire: 'Gardé' });
  // L'analyse, plus tard : le bail lu, l'échéance et le loyer tranchés.
  A.rangerPiece('DR13', 'b', 'bail', null, { lire: false });
  await A.lirePiece('DR13', 'b', { uploadDir, lire: async () => JSON.stringify({ criteres: { echeance: { valeur: '31/12/2034' }, loyer_signature: { valeur: '1 500 € HT par mois' } } }) });
  A.deciderCase('DR13', 'bail', 'echeance', { action: 'verifier', valeur: '31/12/2034' }, null);
  A.deciderCase('DR13', 'bail', 'loyer_signature', { action: 'verifier', valeur: '1 500 € HT par mois' }, null);
  const r = await P.mettreAJourProjetDepuisDeal('DR13', null);
  assert.equal(r.ok, true);
  const projet = Records.get('Project', id);
  assert.equal(projet.echeance_bail, '2034-12-31', 'en date, pour la frise et la durée restante');
  assert.equal(projet.loyer_annuel_ht, 18000);
  assert.deepEqual(projet.photos, ['p.jpg']);
  assert.equal(projet.nom_locataire, 'Gardé', 'une case vide du dossier n\'efface rien');
});

test("une pièce lue met le projet à jour toute seule : les cases vides se remplissent, les autres attendent une vérification", async () => {
  const P = await import('./projet.js');
  Records.create('Deal', { deal_id: 'DR15', nom: 'Vannes', documents_espace: [{ id: 'k', nom: 'kbis.pdf', url: '/uploads/k15.pdf', mime: 'application/pdf' }],
    lots: [{ lot: { surface_m2: { absent: false, valeur: 60 } } }] });
  fs.writeFileSync(path.join(uploadDir, 'k15.pdf'), 'kbis');
  P.creerProjetDepuisDeal('DR15', 0, null);
  const id = Records.findBy('Deal', 'deal_id', 'DR15').projet_id;
  Records.update('Project', id, { activite_locataire: 'Boulangerie' });
  A.rangerPiece('DR15', 'k', 'kbis', null, { lire: false });
  await A.lirePiece('DR15', 'k', { uploadDir, lire: async () => JSON.stringify({ criteres: { denomination: { valeur: 'SARL Le Fournil' }, activite: { valeur: 'Restauration rapide' } } }) });
  await P.projetSuitLeDossier('DR15', null);
  const projet = Records.get('Project', id);
  assert.equal(projet.nom_locataire, 'SARL Le Fournil');
  assert.equal(projet.activite_locataire, 'Boulangerie', 'une case remplie ne change que par une valeur vérifiée');
  assert.ok(projet.maj_depuis_dossier_le);
  assert.equal(await P.projetSuitLeDossier('inconnu'), null);
});

test("la vacance lit l'adresse donnée sans virgule ni code postal, rangée tout entière dans la ville", async () => {
  const { mesurerVacance } = await import('./marche-vacance.js');
  Records.create('Deal', { deal_id: 'DR14', lots: [{ lot: { adresse: { absent: false, valeur: { rue: null, code_postal: null, ville: '12 rue Foch Lorient' } } } }] });
  let demandee = null;
  const adresse = { resoudreAdresse: async (t) => { demandee = t; return { label: '12 Rue Foch 56100 Lorient', lat: 47.7, lon: -3.36, code_insee: '56121', rue: 'Rue Foch', ville: 'Lorient' }; } };
  const outil = { tauxDeVacance: async () => ({ ok: true, statut: 200, taux: { taux: 10, vacants: 2, occupes: 18, locaux: 20, fiable: true }, zone: { rayon_m: 300 } }), tauxDeLaRue: async () => ({ ok: true, statut: 200, taux: { taux: 5, vacants: 1, occupes: 19, locaux: 20, fiable: true }, zone: {} }) };
  const r = await mesurerVacance('DR14', { adresse, outil });
  assert.equal(r.etat, 'pret');
  assert.equal(demandee, '12 rue Foch Lorient');
});

test("la note de l'IA effacée à la main reste effacée ; une note écrite la remplace", async () => {
  const { noterCritere, notesDuDossier } = await import('./grilles.js');
  Records.create('Deal', { deal_id: 'DR15' });
  noterCritere('DR15', 'pieces-bail', 'depot', '', null, { iaRetiree: true });
  assert.equal(notesDuDossier('DR15').notes['pieces-bail.depot'].ia_retiree, true);
  noterCritere('DR15', 'pieces-bail', 'depot', 'Vu avec l\'agent', { email: 'nora@klocka.immo' });
  assert.equal(notesDuDossier('DR15').notes['pieces-bail.depot'].texte, 'Vu avec l\'agent');
  noterCritere('DR15', 'pieces-bail', 'depot', '', null);
  assert.equal(notesDuDossier('DR15').notes['pieces-bail.depot'], undefined);
});

test("passer une ligne en vert ou modifier sa valeur ne retire pas l'alerte de la règle (la note de l'IA)", async () => {
  dossier('DR16', [{ id: 'b', nom: 'bail.pdf' }]);
  A.rangerPiece('DR16', 'b', 'bail', null, { lire: false });
  await A.lirePiece('DR16', 'b', { uploadDir, lire: async () => JSON.stringify({ criteres: { depot: { valeur: '3 000 €' } } }) });
  const ligne = () => A.lireAnalyse('DR16').grilles[0].lignes.find((x) => x.id === 'depot');
  const avant = ligne().alerte;
  A.deciderCase('DR16', 'bail', 'depot', { action: 'verifier', valeur: ligne().valeur }, null);
  assert.equal(ligne().statut, 'verifie');
  assert.deepEqual(ligne().alerte, avant);
  A.deciderCase('DR16', 'bail', 'depot', { action: 'verifier', valeur: '6 000 €', main: true }, null);
  assert.equal(ligne().valeur_main, '6 000 €');
  assert.deepEqual(ligne().alerte, avant);
  A.deciderCase('DR16', 'bail', 'depot', { action: 'corriger', valeur: '7 000 €' }, null);
  assert.deepEqual(ligne().alerte, avant);
});

test("une pièce reçue après coup : l'onglet de la pièce, la plus récente retenue, une ligne verte contredite à revérifier", async () => {
  dossier('DR17', [{ id: 'b', nom: 'bail.pdf' }, { id: 'av', nom: 'avenant.pdf' }]);
  A.rangerPiece('DR17', 'b', 'bail', null, { lire: false });
  await A.lirePiece('DR17', 'b', { uploadDir, lire: async () => JSON.stringify({ criteres: { depot: { valeur: '3 000 €' } } }) });
  const ligne = () => A.lireAnalyse('DR17').grilles[0].lignes.find((x) => x.id === 'depot');
  A.deciderCase('DR17', 'bail', 'depot', { action: 'verifier', valeur: '3 000 €' }, null);
  assert.equal(ligne().statut, 'verifie');
  A.rangerPiece('DR17', 'av', 'avenants', null, { lire: false });
  const r = D.lancerAnalyse('DR17', { uploadDir });
  assert.equal(r.onglet, 'bail');
  await A.lirePiece('DR17', 'av', { uploadDir, lire: async () => JSON.stringify({ criteres: { depot: { valeur: '4 500 €' } } }) });
  assert.equal(ligne().statut, 'ia', 'la ligne verte contredite revient à vérifier');
  assert.equal(ligne().valeur, '4 500 €', "l'avenant, plus récent, est retenu");
  assert.equal(A.ongletDuType('pv_ag'), 'copropriete');
});

test("rentrer le projet après l'Analyse : le Kbis nomme le local dans le titre, les pièces remplissent, le reste devient des questions", async () => {
  const P = await import('./projet.js');
  dossier('DR18', [{ id: 'k', nom: 'kbis.pdf' }, { id: 'b', nom: 'bail.pdf' }]);
  A.rangerPiece('DR18', 'k', 'kbis', null, { lire: false });
  A.rangerPiece('DR18', 'b', 'bail', null, { lire: false });
  await A.lirePiece('DR18', 'k', { uploadDir, lire: async () => JSON.stringify({ criteres: { denomination: { valeur: 'SARL Le Perroquet Bleu' }, activite: { valeur: 'Restaurant' } } }) });
  await A.lirePiece('DR18', 'b', { uploadDir, lire: async () => JSON.stringify({ criteres: { echeance: { valeur: '31/12/2034' }, loyer_signature: { valeur: '2 000 € HT par mois' } } }) });
  const r = P.creerProjetDepuisDeal('DR18', 0, null, { analyse: A.lireAnalyse('DR18') });
  assert.notEqual(r.ok, false);
  const projet = Records.get('Project', Records.findBy('Deal', 'deal_id', 'DR18').projet_id);
  assert.equal(projet.titre, 'Restaurant Le Perroquet Bleu', "le nom seul, l'adresse est écrite en dessous (30 oct. 2026)");
  assert.equal(projet.echeance_bail, '2034-12-31', 'en date, pour la frise et la durée restante');
  assert.equal(projet.loyer_annuel_ht, 24000);
  assert.match(projet.questions_ouverture, /surface du local, en m² : manquant/);
  assert.doesNotMatch(projet.questions_ouverture, /l'échéance du bail : manquant/i);
  // Le nom et le profil sans majuscules partout, le message dit ce qui a été mis, une ligne par valeur (30 oct. 2026).
  assert.equal(projet.nom_locataire, 'Sarl le perroquet bleu');
  assert.equal(projet.profil_locataire, 'Sarl');
  assert.match(projet.questions_ouverture, /^Voici ce que j'ai mis dans le projet :/);
  assert.match(projet.questions_ouverture, /- Loyer annuel HT HC : 24 000 €/);
  assert.match(projet.questions_ouverture, /À vérifier :/);
  assert.equal(projet.sim_loyer_initial_ht, 24000, 'le simulateur prend le loyer lu');
});

test("décocher une source sur une ligne de Marché, puis la recocher", () => {
  Records.create('Deal', { deal_id: 'DR19' });
  assert.equal(A.deciderCase('DR19', 'marche', 'loyer_marche', { action: 'exclure', source: 'Data-B' }, null).ok, true);
  assert.deepEqual(A.lireAnalyse('DR19').cases_marche.loyer_marche.exclues, ['Data-B']);
  A.deciderCase('DR19', 'marche', 'loyer_marche', { action: 'exclure', source: 'Data-B' }, null);
  assert.deepEqual(A.lireAnalyse('DR19').cases_marche.loyer_marche.exclues, []);
});

test("le projet rentré reprend la taxe foncière de l'avis lu et pose les travaux des années 10 et 20", async () => {
  const P = await import('./projet.js');
  Records.create('Deal', { deal_id: 'DR40', nom: 'Toulouse', documents_espace: [{ id: 't', nom: 'avis.pdf', url: '/uploads/t40.pdf', mime: 'application/pdf' }],
    lots: [{ lot: { surface_m2: { absent: false, valeur: 50 } }, simulateur: { chargesCopropriete: 900 } }] });
  fs.writeFileSync(path.join(uploadDir, 't40.pdf'), 'avis');
  A.rangerPiece('DR40', 't', 'taxe_fonciere', null, { lire: false });
  await A.lirePiece('DR40', 't', { uploadDir, lire: async () => JSON.stringify({ criteres: { montant: { valeur: '1 850 €', donnees: { montant: 1850 } } } }) });
  P.creerProjetDepuisDeal('DR40', 0, null, { analyse: A.lireAnalyse('DR40') });
  const projet = Records.get('Project', Records.findBy('Deal', 'deal_id', 'DR40').projet_id);
  assert.equal(projet.sim_taxe_fonciere, 1850);
  assert.equal(projet.sim_charges_copropriete, 900);
  assert.equal(projet.sim_travaux_montant10, 10000);
  assert.equal(projet.sim_travaux_annee20, 20);
});

test("les images du projet : déposées dans la Data Room, l'image de la ville d'abord, puis une fois chacune (30 oct. 2026)", async () => {
  const P = await import('./projet.js');
  dossier('DR50', [{ id: 'img1', nom: 'facade.jpg' }]);
  const deal = Records.findBy('Deal', 'deal_id', 'DR50');
  Records.update('Deal', deal.id, { documents_espace: [{ id: 'img1', nom: 'facade.jpg', url: '/uploads/facade.jpg', mime: 'image/jpeg' }] });
  A.rangerPiece('DR50', 'img1', 'photos', null, { lire: false });
  assert.ok(A.lireDepots('DR50').emplacements.find((e) => e.id === 'photos').documents.length, 'un emplacement « Images du projet »');
  P.creerProjetDepuisDeal('DR50', 0, null, { imageVille: '/uploads/ville.jpg' });
  const id = Records.findBy('Deal', 'deal_id', 'DR50').projet_id;
  assert.deepEqual(Records.get('Project', id).photos, ['/uploads/ville.jpg', '/uploads/facade.jpg']);
  // Une image ajoutée ensuite rejoint le projet ; une image retirée du projet n'y revient pas.
  const d2 = Records.findBy('Deal', 'deal_id', 'DR50');
  Records.update('Deal', d2.id, { documents_espace: [...d2.documents_espace, { id: 'img2', nom: 'vitrine.png', url: '/uploads/vitrine.png', mime: 'image/png' }] });
  A.rangerPiece('DR50', 'img2', 'photos', null, { lire: false });
  Records.update('Project', id, { photos: ['/uploads/ville.jpg'] });
  await P.mettreAJourProjetDepuisDeal('DR50', null);
  assert.deepEqual(Records.get('Project', id).photos, ['/uploads/ville.jpg', '/uploads/vitrine.png']);
});
