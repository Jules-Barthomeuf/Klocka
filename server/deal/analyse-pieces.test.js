// L'analyse pièce par pièce (29 oct. 2026) : l'humain range, une pièce = une lecture, la preuve
// retrouvée dans le texte, les cases de l'analyste jamais écrasées, les écarts signalés.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-analyse-pieces-'));
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-analyse-pieces-up-'));
const { Records } = await import('../db.js');
const A = await import('./analyse-pieces.js');

function dossier(id, documents) {
  for (const d of documents) fs.writeFileSync(path.join(uploadDir, `${d.id}.txt`), `contenu de ${d.nom}`);
  Records.create('Deal', {
    deal_id: id,
    nom: 'Lorient',
    lots: [{ lot: { loyer_annuel_ht_hc: { valeur: 24000, absent: false } } }],
    documents_espace: documents.map((d) => ({ ...d, url: `/uploads/${d.id}.txt`, mime: 'text/plain' })),
  });
}

// Le modèle simulé : il répond pour les critères demandés, selon la pièce.
const lecteur = (reponses) => async ({ nom, prompt }) => {
  const r = reponses[nom] || {};
  const ids = [...prompt.matchAll(/^- (\w+) \(/gm)].map((m) => m[1]);
  return JSON.stringify({ criteres: Object.fromEntries(ids.filter((i) => r[i]).map((i) => [i, r[i]])) });
};

test("le nom propose un emplacement, la fiche d'abord : « Fiche murs bail 3-6-9 » n'est pas un bail", () => {
  assert.equal(A.suggestion({ nom: 'Fiche murs loués bail 3-6-9.pdf' }), 'fiche');
  assert.equal(A.suggestion({ nom: 'BAIL_COMMERCIAL_2021.pdf' }), 'bail');
  assert.equal(A.suggestion({ nom: 'PV AG 2024.pdf' }), 'pv_ag');
  assert.equal(A.suggestion({ nom: 'etat_descriptif_de_division_foch 1.pdf' }), 'rcp', 'Lorient : l\'EDD n\'est pas une fiche');
  assert.equal(A.suggestion({ nom: 'scan001.pdf' }), null);
});

test('la consigne ne porte que les critères de la grille de l\'emplacement, avec leurs données', () => {
  const g = A.grilleDe('quittances');
  const c = A.consigneLecture({ type: 'quittances', nom: 'Q1.pdf', criteres: g.criteres, grille: g, aujourdHui: '2026-10-29' });
  assert.match(c, /- loyer_hc_ht \(Prix du loyer HC HT\)/);
  assert.match(c, /periodicite \(texte : mensuel \| trimestriel \| annuel \| inconnu\)/);
  assert.doesNotMatch(c, /type_bail/);
});

test('la citation est retrouvée dans le texte : la page corrigée, ou « non retrouvée » si elle n\'y est pas', () => {
  const pages = A.pagesDuTexte('--- page 1 ---\nEntre les soussignés\n--- page 2 ---\nLe présent bail est consenti pour une durée de neuf années entières et consécutives');
  assert.equal(pages.length, 2);
  assert.deepEqual(A.trouverPage(pages, 'Le présent bail est consenti pour une durée de NEUF années', 1), { page: 2, verifiee: true });
  assert.deepEqual(A.trouverPage(pages, 'Le loyer est fixé à vingt-quatre mille euros', 2), { page: 2, verifiee: false });
  assert.deepEqual(A.trouverPage(null, 'une citation quelconque', 3), { page: 3, verifiee: null });
});

test('ranger une pièce la lit seule ; une autre pièce rangée ne relit pas la première', async () => {
  dossier('AP1', [{ id: 'bail1', nom: 'Bail.pdf' }, { id: 'q1', nom: 'Quittance janvier.pdf' }]);
  const vus = [];
  const lire = async (p) => { vus.push(p.nom); return lecteur({ 'Bail.pdf': { loyer_signature: { valeur: '24 000 € / an', page: 4, citation: 'loyer annuel de 24 000 euros', donnees: { annuel_ht: 24000 } } } })(p); };
  assert.equal(A.rangerPiece('AP1', 'bail1', 'bail', { email: 'nora@klocka.immo' }).lire, true);
  await A.lirePiece('AP1', 'bail1', { uploadDir, lire });
  A.rangerPiece('AP1', 'q1', 'quittances', null);
  await A.lirePiece('AP1', 'q1', { uploadDir, lire });
  assert.deepEqual(vus, ['Bail.pdf', 'Quittance janvier.pdf']);
  const a = A.lireAnalyse('AP1');
  const loyer = a.grilles.find((g) => g.id === 'bail').lignes.find((l) => l.id === 'loyer_signature');
  assert.equal(loyer.statut, 'ia');
  assert.equal(loyer.valeur, '24 000 € / an');
  assert.equal(loyer.sources[0].page, 4);
  assert.equal(Records.findBy('Deal', 'deal_id', 'AP1').documents_espace.find((d) => d.id === 'bail1').categorie, 'Bail commercial');
  assert.equal(a.grilles.find((g) => g.id === 'pv_ag').lignes[0].statut, 'manquant');
  assert.equal(a.grilles.find((g) => g.id === 'quittances').lignes[0].statut, 'introuvable', 'quittance lue, rien trouvé');
});

test("une correction ou une vérification de l'analyste survit à la relecture ; réinitialiser rend la lecture", async () => {
  dossier('AP2', [{ id: 'b', nom: 'Bail.pdf' }]);
  A.rangerPiece('AP2', 'b', 'bail', null);
  await A.lirePiece('AP2', 'b', { uploadDir, lire: lecteur({ 'Bail.pdf': { tva: { valeur: 'NON', donnees: { oui: false } }, depot: { valeur: '3 000 €' } } }) });
  assert.equal(A.lireAnalyse('AP2').grilles[0].lignes.find((l) => l.id === 'tva').alerte?.statut, 'warning');
  assert.equal(A.deciderCase('AP2', 'bail', 'tva', { action: 'corriger', valeur: 'OUI' }, { email: 'jules@klocka.immo' }).ok, true);
  assert.equal(A.deciderCase('AP2', 'bail', 'depot', { action: 'verifier', valeur: '3 000 €' }, null).ok, true);
  await A.lirePiece('AP2', 'b', { uploadDir, lire: lecteur({ 'Bail.pdf': { tva: { valeur: 'NON' }, depot: { valeur: '6 000 €' } } }) });
  const lignes = A.lireAnalyse('AP2').grilles[0].lignes;
  const tva = lignes.find((l) => l.id === 'tva');
  assert.equal(tva.statut, 'corrige');
  assert.equal(tva.valeur, 'OUI');
  assert.equal(tva.alerte, null, 'la règle ne juge pas une valeur corrigée à la main');
  const depot = lignes.find((l) => l.id === 'depot');
  assert.equal(depot.valeur, '3 000 €');
  assert.equal(depot.relue, '6 000 €', 'la relecture qui contredit se dit sans remplacer');
  A.deciderCase('AP2', 'bail', 'depot', { action: 'reinitialiser' }, null);
  assert.equal(A.lireAnalyse('AP2').grilles[0].lignes.find((l) => l.id === 'depot').valeur, '6 000 €');
});

test('bail et avenant qui divergent : la case demande un choix, l\'avenant d\'abord, retenir le bail le règle', async () => {
  dossier('AP3', [{ id: 'b', nom: 'Bail.pdf' }, { id: 'av', nom: 'Avenant 2023.pdf' }]);
  A.rangerPiece('AP3', 'b', 'bail', null);
  A.rangerPiece('AP3', 'av', 'avenants', null);
  const lire = lecteur({ 'Bail.pdf': { loyer_signature: { valeur: '20 000 € / an', donnees: { annuel_ht: 20000 } } }, 'Avenant 2023.pdf': { loyer_signature: { valeur: '24 000 € / an', donnees: { annuel_ht: 24000 } } } });
  await A.lirePiece('AP3', 'b', { uploadDir, lire });
  await A.lirePiece('AP3', 'av', { uploadDir, lire });
  let l = A.lireAnalyse('AP3').grilles[0].lignes.find((x) => x.id === 'loyer_signature');
  assert.equal(l.a_choisir, true);
  assert.equal(l.valeur, '24 000 € / an', 'la pièce la plus récente d\'abord, tant que rien n\'est choisi (30 oct. 2026)');
  A.deciderCase('AP3', 'bail', 'loyer_signature', { action: 'retenir', source: 'b' }, null);
  l = A.lireAnalyse('AP3').grilles[0].lignes.find((x) => x.id === 'loyer_signature');
  assert.equal(l.a_choisir, false);
  assert.equal(l.valeur, '20 000 € / an');
});

test('les écarts : loyer fiche / bail / quittances, TVA, locataire du Kbis ; retenir une valeur le referme', async () => {
  dossier('AP4', [{ id: 'b', nom: 'Bail.pdf' }, { id: 'q', nom: 'Quittance.pdf' }, { id: 'k', nom: 'Kbis.pdf' }]);
  A.rangerPiece('AP4', 'b', 'bail', null);
  A.rangerPiece('AP4', 'q', 'quittances', null);
  A.rangerPiece('AP4', 'k', 'kbis', null);
  const lire = lecteur({
    'Bail.pdf': { loyer_signature: { valeur: '24 000 € / an', donnees: { annuel_ht: 24000 } }, tva: { valeur: 'OUI', donnees: { oui: true } }, parties: { valeur: 'SARL Le Fournil', donnees: { locataire: 'SARL Le Fournil' } } },
    'Quittance.pdf': { loyer_hc_ht: { valeur: '2 200 € par mois', donnees: { montant: 2200, periodicite: 'mensuel' } }, tva: { valeur: 'OUI', donnees: { oui: true } } },
    'Kbis.pdf': { denomination: { valeur: 'SAS Boulangerie Martin' }, procedure: { valeur: 'Redressement judiciaire du 02/03/2026', donnees: { en_cours: true } } },
  });
  for (const id of ['b', 'q', 'k']) await A.lirePiece('AP4', id, { uploadDir, lire });
  const a = A.lireAnalyse('AP4');
  const loyer = a.ecarts.find((e) => e.cle === 'loyer');
  assert.equal(loyer.ecart, true, '26 400 € contre 24 000 €');
  assert.deepEqual(loyer.valeurs.map((v) => v.id), ['fiche', 'bail', 'quittances']);
  assert.equal(a.ecarts.find((e) => e.cle === 'tva').ecart, false);
  assert.equal(a.ecarts.find((e) => e.cle === 'locataire').ecart, true);
  assert.equal(a.grilles.find((g) => g.id === 'kbis').lignes.find((l) => l.id === 'procedure').alerte.statut, 'warning');
  assert.ok(a.a_voir.quittances >= 1);
  A.deciderEcart('AP4', 'loyer', 'quittances', null);
  assert.equal(A.lireAnalyse('AP4').ecarts.find((e) => e.cle === 'loyer').retenu, 'quittances');
});

test("le simulateur prend les chiffres des onglets : les quittances d'abord, le loyer retenu s'il y en a un", () => {
  // AP4, lu au test d'avant : bail à 24 000 € / an, quittances à 2 200 € par mois, TVA au bail.
  A.deciderEcart('AP4', 'loyer', null, null);
  let s = A.lireAnalyse('AP4').simulateur;
  assert.equal(s.valeurs.loyerInitialHTHC, 26400);
  assert.equal(s.sources.loyerInitialHTHC, 'Quittances');
  assert.equal(s.valeurs.loyerSoumisTVA, true);
  assert.equal(s.sources.loyerSoumisTVA, 'Bail');
  assert.equal(s.valeurs.taxeFonciere, undefined, "pas d'avis de taxe foncière : rien de posé");
  A.deciderEcart('AP4', 'loyer', 'bail', null);
  s = A.lireAnalyse('AP4').simulateur;
  assert.equal(s.valeurs.loyerInitialHTHC, 24000);
  assert.equal(s.sources.loyerInitialHTHC, 'Bail (retenu)');
});

test('ranger ailleurs pendant la lecture : la lecture tardive est jetée', async () => {
  dossier('AP5', [{ id: 'x', nom: 'Scan.pdf' }]);
  A.rangerPiece('AP5', 'x', 'bail', null);
  const lente = async (p) => { A.rangerPiece('AP5', 'x', 'diagnostics', null); return lecteur({ 'Scan.pdf': { type_bail: { valeur: '3/6/9 classique' } } })(p); };
  await A.lirePiece('AP5', 'x', { uploadDir, lire: lente });
  const d = Records.findBy('Deal', 'deal_id', 'AP5').analyse_pieces.docs.x;
  assert.equal(d.type, 'diagnostics');
  assert.deepEqual(d.valeurs, {});
});

test('un fichier disparu du disque : erreur dite, pas de lecture', async () => {
  Records.create('Deal', { deal_id: 'AP6', documents_espace: [{ id: 'z', nom: 'Bail.pdf', url: '/uploads/absent.pdf', mime: 'application/pdf' }] });
  A.rangerPiece('AP6', 'z', 'bail', null);
  const r = await A.lirePiece('AP6', 'z', { uploadDir, lire: async () => { throw new Error('ne doit pas lire'); } });
  assert.equal(r.ok, false);
  assert.match(Records.findBy('Deal', 'deal_id', 'AP6').analyse_pieces.docs.z.extraction.erreur, /déposez-le à nouveau/);
});

test('la question libre rend la réponse et sa preuve, gardée sur la pièce', async () => {
  dossier('AP7', [{ id: 'b', nom: 'Bail.pdf' }]);
  const r = await A.poserQuestion('AP7', 'b', 'Qui paie la taxe foncière ?', { uploadDir, lire: async () => '{"reponse":"Le preneur.","page":6,"citation":"La taxe foncière sera remboursée par le preneur"}' });
  assert.equal(r.reponse, 'Le preneur.');
  assert.equal(r.page, 6);
  assert.equal(A.lireAnalyse('AP7').a_ranger[0].questions[0].question, 'Qui paie la taxe foncière ?');
});

test("la Data Room : déposer range sans lire ; une pièce d'avant se range d'après sa catégorie", () => {
  dossier('AP8', [{ id: 'b', nom: 'Bail.pdf' }, { id: 'v', nom: 'PV.pdf', categorie: "PV d'AG copro" }, { id: 'x', nom: 'scan.pdf' }]);
  assert.equal(A.rangerPiece('AP8', 'b', 'bail', null, { lire: false }).lire, false);
  assert.equal(Records.findBy('Deal', 'deal_id', 'AP8').analyse_pieces.docs.b.extraction, null);
  const d = A.lireDepots('AP8').emplacements;
  assert.deepEqual(d.find((e) => e.id === 'bail').documents.map((x) => x.id), ['b']);
  assert.deepEqual(d.find((e) => e.id === 'pv_ag').documents.map((x) => x.id), ['v']);
  assert.deepEqual(d.find((e) => e.id === 'autre').documents.map((x) => x.id), ['x']);
  assert.equal(A.lireAnalyse('AP8').grilles[0].lignes[0].statut, 'non_lu', 'déposée, pas lue : pas « introuvable »');
});

test("le « + » : un type nommé par l'analyste, sa zone, retiré seulement vide ; « Sans type » n'apparaît que s'il sert", () => {
  dossier('AP9', [{ id: 'a', nom: 'Bail 2005.pdf' }]);
  assert.equal(A.lireDepots('AP9').emplacements.some((e) => e.id === 'autre'), true, 'la pièce sans catégorie se voit dans « Sans type »');
  const t = A.creerType('AP9', '  Ancien bail  ', null);
  assert.equal(t.titre, 'Ancien bail');
  assert.equal(A.creerType('AP9', ' ', null).ok, false);
  assert.equal(A.rangerPiece('AP9', 'a', t.id, null, { lire: false }).ok, true);
  const zone = A.lireDepots('AP9').emplacements.find((e) => e.id === t.id);
  assert.equal(zone.perso, true);
  assert.equal(A.lireDepots('AP9').emplacements.some((e) => e.id === 'autre'), false, 'rangée, « Sans type » disparaît');
  assert.deepEqual(zone.documents.map((d) => d.id), ['a']);
  assert.equal(Records.findBy('Deal', 'deal_id', 'AP9').documents_espace[0].categorie, 'Ancien bail');
  assert.equal(A.retirerType('AP9', t.id).ok, false, 'une zone avec sa pièce ne se retire pas');
  A.rangerPiece('AP9', 'a', null, null);
  assert.equal(A.retirerType('AP9', t.id).ok, true);
});

test("le contexte d'une pièce : gardé quand on la range ailleurs, et dit à l'IA à la lecture", async () => {
  dossier('AP10', [{ id: 'b', nom: 'Bail.pdf' }]);
  A.rangerPiece('AP10', 'b', 'bail', null, { lire: false });
  A.poserContexte('AP10', 'b', 'Bail de 2005, en tacite reconduction depuis le 31/12/2014.', { email: 'nora@klocka.immo' });
  A.rangerPiece('AP10', 'b', 'avenants', null, { lire: false });
  A.rangerPiece('AP10', 'b', 'bail', null, { lire: false });
  assert.equal(A.lireDepots('AP10').emplacements.find((e) => e.id === 'bail').documents[0].contexte, 'Bail de 2005, en tacite reconduction depuis le 31/12/2014.');
  let vue = '';
  await A.lirePiece('AP10', 'b', { uploadDir, lire: async ({ prompt }) => { vue = prompt; return '{"criteres":{}}'; } });
  assert.match(vue, /Ce que l'analyste sait de cette pièce.*tacite reconduction depuis le 31\/12\/2014/);
});
