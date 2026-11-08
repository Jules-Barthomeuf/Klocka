// Importer un bien qu'on a déjà : la fiche née vide, remplie par le récit (4 nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-bien-repris-'));
const { Records } = await import('./db.js');
const R = await import('./bien-repris.js');
const D = await import('./documents-du-bien.js');

const user = { email: 'm@kpartners.fr', role: 'mandataire' };

test('« Importer » : une fiche vide dans Biens, que le chat sait en cours d’import', async () => {
  const r = R.creerBienAImporter(user);
  assert.ok(r.ok);
  assert.equal(r.proprietaire.statut, 'rdv_pris', 'elle est dans Biens tout de suite');
  assert.ok(r.proprietaire.biens.import.le);
  assert.match(R.cadreImport(r.proprietaire), /IL MANQUE ENCORE POUR SON ÉTAPE : l'adresse, le type de bien/);
  assert.ok((await R.finirImport(r.proprietaire.id, user)).ok);
  assert.equal(R.cadreImport(Records.get('ProprietaireMandataire', r.proprietaire.id)), '', 'fini, le chat ne la reprend plus');
});

test('le récit : la fiche, les jalons datés, l’étape d’aujourd’hui, sans doublon', async () => {
  const { proprietaire: p } = R.creerBienAImporter(user);
  const input = {
    adresse: '12 rue Mercière', ville: 'Lyon', type_bien: 'fonds_commerce', activite: 'Boulangerie', proprietaire: 'M. Ginet', prix: 140000, ca: 450000,
    etape_actuelle: 'mandat',
    jalons: [
      { quoi: 'visite', date: '2026-09' },
      { quoi: 'avis_envoye', date: '2026-09-20' },
      { quoi: 'avis_accepte', date: '2026-10-02', texte: 'accepté à 140 k€' },
      { quoi: 'mandat_signe', date: '' },
    ],
  };
  const r = await R.executerReprise(input, user, { fiche: p });
  assert.ok(r.ok);
  assert.equal(r.jalons_ajoutes, 3, 'un jalon sans date ne s’écrit pas');
  assert.match(r.fait, /relance/, 'mandat pas encore signé : il propose une relance');
  const f = Records.get('ProprietaireMandataire', p.id);
  assert.equal(f.adresse, '12 rue Mercière');
  assert.equal(f.type_bien, 'fonds_commerce');
  assert.equal(f.commerce, '12 rue Mercière', '« Nouveau bien » prend le nom de son adresse');
  assert.equal(f.nom, 'M. Ginet');
  assert.equal(f.biens.validee, 'avis_accepte', 'au Mandat : l’Avis de valeur est franchi');
  assert.equal(f.biens.prix_accord, 140000);
  assert.equal(f.biens.repris.ca, 450000);
  assert.equal(f.biens.jalons[0].le, '2026-09-01T09:00:00.000Z', '« début septembre » : le 1er du mois');
  assert.equal(f.biens.jalons[2].detail, 'accepté à 140 k€');
  assert.ok(f.historique.some((h) => h.type === 'jalon' && h.texte === 'Avis de valeur envoyé au propriétaire'));
  assert.equal((await R.executerReprise(input, user, { fiche: f })).jalons_ajoutes, 0, 'le même récit ne double rien');
  assert.equal((await R.executerReprise(input, { email: 'autre@kpartners.fr' }, { fiche: p })).ok, false);
});

test('un avis ou un mandat importés : rangés à part, jamais copiés dans la Data room', () => {
  assert.equal(D.natureDuNom('Mandat de vente Ginet signé.pdf'), 'mandat');
  assert.equal(D.natureDuNom('Avis de valeur - 12 rue Mercière.pdf'), 'avis');
  assert.ok(D.horsDataroom('mandat'));
  assert.ok(!D.horsDataroom('bail'));
});

test("une reprise ne fait jamais reculer le bien ; un mandat importé le met au mandat signé", async () => {
  const R = await import('./bien-repris.js');
  assert.equal(R.auPlusLoin('mandat', 'previsite'), 'mandat');
  assert.equal(R.auPlusLoin('mandat', 'marche'), 'marche');
  assert.equal(R.auPlusLoin(null, R.franchiParDocument('mandat')), 'mandat');
  assert.equal(R.franchiParDocument('bail'), null);
  const { maj } = R.repriseDe({ biens: { validee: 'dataroom' } }, { etape_actuelle: 'mandat' });
  assert.equal(maj.biens.validee, 'dataroom', 'dire « au mandat » après le mandat importé ne recule pas');
});

// L'assistant libre, comme Jules le fait (4 nov. 2026, QCM avec Jules).
test('un mandat lu : le bien au mandat signé, ses dates ; signé ailleurs, à re-signer avec une relance', async () => {
  const { proprietaire: p } = R.creerBienAImporter(user);
  const r = await R.executerReprise({ adresse: '3 rue Neuve', ville: 'Lyon', type_bien: 'murs_commerce', prix: 450000, mandat: { signe_le: '2026-09-12', echeance: '2026-12-12', exclusif: true, enseigne: 'K Partners' } }, user, { fiche: p });
  assert.equal(r.etape, 'dataroom');
  const f = Records.get('ProprietaireMandataire', p.id);
  assert.equal(f.statut, 'mandat_signe');
  assert.equal(f.biens.validee, 'mandat');
  assert.equal(f.mandat_importe.echeance, '2026-12-12');
  assert.ok(f.biens.jalons.some((j) => j.quoi === 'mandat_signe' && j.le.startsWith('2026-09-12')));
  assert.match(r.fait, /le PDF du mandat/, 'le minimum du mandat signé : le PDF manque encore');
  const { proprietaire: q } = R.creerBienAImporter(user);
  const r2 = await R.executerReprise({ adresse: '5 rue Neuve', ville: 'Lyon', mandat: { signe_le: '2026-09-01', echeance: '2030-01-01', enseigne: 'Century 21' } }, user, { fiche: q });
  assert.equal(r2.etape, 'mandat', 'signé ailleurs : à re-signer chez K Partners');
  const g = Records.get('ProprietaireMandataire', q.id);
  assert.equal(g.prochaine_action, 'Re-signer le mandat chez K Partners');
  assert.ok(g.prochaine_action_le.startsWith('2029-12-01'));
});

test('le minimum selon l’étape : piste, mandat signé, sous offre', () => {
  const base = { id: 'x', adresse: '1 rue A', type_bien: 'murs_commerce', nom: 'M. A', telephone: '0600000000', biens: { validee: 'avis_accepte', jalons: [] } };
  assert.deepEqual(R.manqueSelonEtape(base, [], []), ['la date de la visite']);
  const signe = { ...base, biens: { validee: 'mandat', jalons: [{ quoi: 'visite', le: '2026-09-01' }], prix_accord: 400000 }, mandat_importe: { signe_le: '2026-09-02', echeance: '2026-12-02' } };
  assert.deepEqual(R.manqueSelonEtape(signe, [], []), ['le PDF du mandat']);
  assert.deepEqual(R.manqueSelonEtape(signe, [{ nom: 'Mandat.pdf', nature: 'mandat' }], []), []);
  const offre = { ...signe, biens: { ...signe.biens, validee: 'marche' } };
  assert.deepEqual(R.manqueSelonEtape(offre, [{ nom: 'm', nature: 'mandat' }], []), ["le montant de l'offre", "l'acquéreur qui a fait l'offre"]);
});

test('une adresse déjà là : le bien existant est complété, l’import est retiré sans doublon', async () => {
  const ancien = Records.create('ProprietaireMandataire', { mandataire_email: user.email, commerce: 'Tabac', adresse: '8, rue des Remparts', ville: 'Lyon', statut: 'a_appeler', biens: {} });
  const { proprietaire: p } = R.creerBienAImporter(user);
  Records.create('AcquereurMandataire', { mandataire_email: user.email, nom: 'Mme B', proprietaire_id: p.id });
  const r = await R.executerReprise({ adresse: '8 rue des remparts', ville: 'Lyon', proprietaire: 'M. Remparts' }, user, { fiche: p });
  assert.equal(r.ouvrir_bien.id, ancien.id);
  const f = Records.get('ProprietaireMandataire', ancien.id);
  assert.equal(f.nom, 'M. Remparts');
  assert.equal(f.statut, 'rdv_pris', 'il entre dans Mes biens');
  assert.ok(f.biens.import && !f.biens.import.fini);
  const vieux = Records.get('ProprietaireMandataire', p.id);
  assert.ok(vieux.retire_le && vieux.fusionne_dans === ancien.id);
  assert.equal(Records.list('AcquereurMandataire').find((a) => a.nom === 'Mme B').proprietaire_id, ancien.id);
  // La suite de la conversation, encore sur l'ancienne fiche ouverte, écrit sur le bien vivant.
  await R.executerReprise({ telephone: '0611223344' }, user, { fiche: p });
  assert.equal(Records.get('ProprietaireMandataire', ancien.id).telephone, '0611223344');
});

test('touches, documents rangés, envoi en Prospection, relecture, Data room à la fin', async () => {
  const { proprietaire: p } = R.creerBienAImporter(user);
  await R.executerReprise({ adresse: '20 quai Est', ville: 'Lyon', type_bien: 'murs_commerce', proprietaire: 'SCI Quai', mandat: { signe_le: '2026-10-01', echeance: '2027-01-01' } }, user, { fiche: p });
  const t = await R.executerOutilImport({ name: 'noter_touche', input: { nom: 'M. Achat', statut: 'offre', offre_montant: 420000, budget: 450000 } }, user, { fiche: p });
  assert.ok(t.ok);
  assert.equal((await R.executerOutilImport({ name: 'noter_touche', input: { nom: 'm. achat', budget_valide: true } }, user, { fiche: p })).fait.includes('mis à jour'), true, 'le même nom met à jour');
  assert.equal(Records.list('AcquereurMandataire').filter((a) => a.proprietaire_id === p.id).length, 1);
  await D.deposerAuBien(p.id, [{ nom: 'scan_0042.pdf', url: '/uploads/scan-0042.pdf' }], user);
  const rg = await R.executerOutilImport({ name: 'ranger_documents', input: { documents: [{ document: 'scan_0042.pdf', nom: 'Mandat exclusif', nature: 'mandat' }] } }, user, { fiche: p });
  assert.ok(rg.ok);
  const f = Records.get('ProprietaireMandataire', p.id);
  assert.equal(f.biens.pieces[0].nature, 'mandat');
  const { annotationsDe } = await import('./annotations-documents.js');
  assert.equal(annotationsDe(['/uploads/scan-0042.pdf'])['/uploads/scan-0042.pdf'].nom, 'Mandat exclusif');
  assert.ok(R.corrigerInfos(p.id, { prix: 480000, mandat: { exclusif: true } }, user).ok);
  const g = Records.get('ProprietaireMandataire', p.id);
  assert.equal(g.biens.prix_accord, 480000);
  assert.equal(g.mandat_importe.exclusif, true);
  assert.equal(R.corrigerInfos(p.id, { type_bien: 'chateau' }, user).ok, false);
  const fin = await R.finirImport(p.id, user);
  assert.ok(fin.dossier_id, 'mandat signé chez K Partners : la Data room est ouverte');
  const d = Records.get('DossierMandataire', fin.dossier_id);
  assert.equal(d.proprietaire_id, p.id);
  assert.equal(d.documents.autres, undefined, 'le mandat ne va pas dans la Data room');

  const { proprietaire: q } = R.creerBienAImporter(user);
  await R.executerReprise({ adresse: '1 place Rien', ville: 'Lyon', proprietaire: 'Mme Rien', telephone: '0600000001' }, user, { fiche: q });
  const sans = await R.executerOutilImport({ name: 'envoyer_en_prospection', input: {} }, user, { fiche: q });
  assert.ok(Array.isArray(sans.listes), 'sans liste : il rend ses listes');
  const en = await R.executerOutilImport({ name: 'envoyer_en_prospection', input: { liste: 'Presqu’île', proprietaire: 'Mme Rien-Bis', commerce: 'Tabac' } }, user, { fiche: q });
  assert.ok(en.vers_prospection);
  const h = Records.get('ProprietaireMandataire', q.id);
  assert.equal(h.statut, 'a_appeler', 'il quitte Mes biens');
  assert.equal(h.nom, 'Mme Rien-Bis', 'ce qu’il a dit du propriétaire part avec');
  assert.equal(h.commerce, 'Tabac');
  assert.ok(h.liste_id && h.biens.import.fini);
});

test("une visite faite met le bien à l'Estimation, jamais en Pré-visite", () => {
  const p = { biens: { import: { le: '2026-11-06' } } };
  const a = R.repriseDe(p, { visite_le: '2026-11-04', etape_actuelle: 'previsite' });
  assert.equal(a.etape, 'estimation');
  assert.equal(a.maj.biens.validee, 'previsite', 'la pré-visite est franchie');
  const b = R.repriseDe(p, { jalons: [{ quoi: 'visite', date: '2026-11-04' }] });
  assert.equal(b.etape, 'estimation');
  const c = R.repriseDe(p, { visite_le: '2099-01-10' });
  assert.equal(c.etape, null, 'une visite à venir ne change rien');
  const d = R.repriseDe(p, { visite_le: '2026-11-04', etape_actuelle: 'mandat' });
  assert.equal(d.etape, 'mandat', 'une étape plus loin reste');
});

// Le banc d'import du 6 nov. 2026 (11 scénarios de Jules) : ce que l'assistant comprenait mais que la fiche enregistrait mal.
test("un mandat pas encore signé reste à l'étape Mandat ; « Import terminé » n'ouvre pas de dossier de vente", async () => {
  const { proprietaire: p } = R.creerBienAImporter(user);
  const r = await R.executerReprise({ adresse: '31 rue Hoche', ville: 'Cannes', type_bien: 'murs_commerce', prix: 395000, etape_actuelle: 'dataroom', mandat: { exclusif: true, honoraires: '20 000 €' } }, user, { fiche: p });
  assert.equal(r.etape, 'mandat');
  const f = Records.get('ProprietaireMandataire', p.id);
  assert.notEqual(f.statut, 'mandat_signe');
  assert.equal(f.biens.validee, 'avis_accepte');
  const fin = await R.finirImport(p.id, user);
  assert.ok(fin.ok && !fin.dossier_id, 'pas de dossier de vente sans signature');
});

test("l'étape corrigée par le mandataire se pose, même en arrière, pendant l'import", () => {
  const p = { statut: 'mandat_signe', biens: { import: { le: '2026-11-06' }, validee: 'mandat' } };
  const { maj } = R.repriseDe(p, { etape_actuelle: 'mandat', corriger_etape: true });
  assert.equal(maj.biens.validee, 'avis_accepte');
  assert.equal(maj.statut, 'rdv_pris');
  assert.equal(R.repriseDe(p, { etape_actuelle: 'mandat' }).maj.biens.validee, 'mandat', 'sans correction, rien ne recule');
});

test('un bien vendu : toutes les étapes faites, le dossier clos, pas de dossier de vente', async () => {
  const { proprietaire: p } = R.creerBienAImporter(user);
  await R.executerReprise({ adresse: "17 rue d'Italie", ville: 'Aix-en-Provence', prix: 395000, mandat: { signe_le: '2025-03-24', echeance: '2025-06-24' },
    jalons: [{ quoi: 'offre', date: '2025-05-02' }, { quoi: 'compromis', date: '2025-06-10' }, { quoi: 'vente', date: '2025-09-12' }] }, user, { fiche: p });
  const f = Records.get('ProprietaireMandataire', p.id);
  assert.equal(f.biens.validee, 'vente');
  assert.ok(f.biens.vendu?.le.startsWith('2025-09-12'));
  const fin = await R.finirImport(p.id, user);
  assert.ok(fin.ok && !fin.dossier_id);
  const { statutDuBien, etapesFaites } = await import('../src/lib/biens-mandataire.js');
  assert.equal(statutDuBien({ proprietaire: f }), 'Vendu');
  assert.ok(etapesFaites({ proprietaire: f }).has('vente'));
});

test('une location : ni prix ni dossier de vente, des candidats locataires', async () => {
  const { proprietaire: p } = R.creerBienAImporter(user);
  await R.executerReprise({ adresse: "9 rue de l'Oratoire", ville: 'Grasse', transaction: 'location', loyer_annuel: 13200, prix: 13200, mandat: { signe_le: '2026-10-22', echeance: '2027-04-22' } }, user, { fiche: p });
  const f = Records.get('ProprietaireMandataire', p.id);
  assert.equal(f.biens.transaction, 'location');
  assert.equal(f.biens.prix_accord, undefined);
  const t = await R.executerOutilImport({ name: 'noter_touche', input: { nom: 'Sofia Lemaire', locataire: true } }, user, { fiche: f });
  assert.match(t.fait, /candidat locataire/);
  const fin = await R.finirImport(p.id, user);
  assert.ok(fin.ok && !fin.dossier_id);
});

// Le cas S08 du banc d'import (6 nov. 2026) : un local vacant à Grasse, un mandat de location, une candidate.
test('S08 : la location de Grasse, sans prix, 13 200 € de loyer, Sofia Lemaire candidate, puis le bail signé', async () => {
  const { statutDuBien, etapesDuBien, etapesFaites } = await import('../src/lib/biens-mandataire.js');
  // Pur : le loyer redit en « prix » n'en fait pas un prix.
  const pur = R.repriseDe({ biens: { import: { le: 'x' } } }, { transaction: 'location', prix: 13200, mandat: { signe_le: '2026-10-22', echeance: '2027-04-22' } });
  assert.equal(pur.maj.biens.transaction, 'location');
  assert.equal(pur.maj.biens.repris.loyer_annuel, 13200);
  assert.equal(pur.maj.biens.repris.prix, undefined);
  assert.equal(pur.maj.mandat_importe.prix, undefined);
  assert.equal(pur.maj.mandat_importe.loyer_annuel, 13200);
  assert.equal(pur.maj.biens.prix_accord, undefined);
  // Le récit entier.
  const { proprietaire: p } = R.creerBienAImporter(user);
  await R.executerReprise({ adresse: '4 place aux Aires', ville: 'Grasse', type_bien: 'murs_commerce', transaction: 'location', loyer_annuel: 13200, prix: 13200, mandat: { signe_le: '2026-10-22', echeance: '2027-04-22' } }, user, { fiche: p });
  let f = Records.get('ProprietaireMandataire', p.id);
  assert.equal(f.biens.repris.prix, undefined, 'pas de prix');
  assert.equal(f.biens.repris.loyer_annuel, 13200);
  assert.deepEqual(etapesDuBien({ proprietaire: f }).map((e) => e.label).slice(1, 3), ['Estimation du loyer', 'Mandat de location']);
  assert.equal(statutDuBien({ proprietaire: f }), 'Mandat de location signé');
  assert.ok(R.manqueSelonEtape(f, [{ nom: 'Mandat.pdf', nature: 'mandat' }], []).every((m) => m !== 'le prix'));
  await R.executerOutilImport({ name: 'noter_touche', input: { nom: 'Sofia Lemaire', statut: 'dossier', budget: 12600 } }, user, { fiche: f });
  const sofia = Records.list('AcquereurMandataire').find((a) => a.proprietaire_id === p.id);
  assert.equal(sofia.role, 'locataire', 'sur un bien à louer, une touche est une candidate');
  assert.equal(sofia.statut_touche, 'dossier');
  assert.match(R.cadreImport(Records.get('ProprietaireMandataire', p.id)), /LOCATION : on cherche un locataire.*candidats : Sofia Lemaire \(dossier\)/);
  // Le bail signé : le bien est loué, toutes les étapes sont faites.
  await R.executerOutilImport({ name: 'noter_touche', input: { nom: 'Sofia Lemaire', statut: 'bail_signe' } }, user, { fiche: f });
  f = Records.get('ProprietaireMandataire', p.id);
  assert.equal(f.biens.loue.locataire, 'Sofia Lemaire');
  assert.equal(f.biens.loue.loyer_annuel, 12600, 'le loyer accepté par la candidate');
  assert.equal(statutDuBien({ proprietaire: f }), 'Loué');
  assert.ok(etapesFaites({ proprietaire: f }).has('vente'));
  const fin = await R.finirImport(p.id, user);
  assert.ok(fin.ok && !fin.dossier_id);
});

test('les loyers gardent leur source ; plusieurs lots ; l’adresse sans la ville répétée', () => {
  const p = { biens: { import: { le: '2026-11-06' } } };
  const { maj } = R.repriseDe(p, { adresse: '38 rue de la République, 06600 Antibes', ville: 'Antibes', loyers: [{ montant: 37200, depuis: '2022-03-01', source: 'avenant n°1' }, { montant: 36000, depuis: '2018-03-01', source: 'bail' }, { montant: 39450, source: 'quittances', actuel: true }] });
  assert.equal(maj.adresse, '38 rue de la République');
  assert.deepEqual(maj.biens.repris.loyers.map((l) => l.source), ['quittances', 'bail', 'avenant n°1'], 'tous gardés, datés du plus ancien (le sans date en tête)');
  assert.equal(maj.biens.repris.loyer_annuel, 39450);
  const lots = R.repriseDe(p, { lots: [{ nom: 'Lot A', loyer_actuel: 14400 }, { nom: 'Lot B', loyer_actuel: 9600, locataire_personne: true, fin_bail: '2027-01-31' }] }).maj.biens.repris;
  assert.equal(lots.lots.length, 2);
  assert.equal(lots.loyer_annuel, 24000);
  const lotsEtLoyers = R.repriseDe(p, { lots: [{ loyer_actuel: 14400 }, { loyer_actuel: 9600 }], loyers: [{ montant: 14400, source: 'lot A', actuel: true }, { montant: 9600, source: 'lot B', actuel: true }] }).maj.biens.repris;
  assert.equal(lotsEtLoyers.loyer_annuel, 24000, 'la somme des lots, pas le premier loyer actuel');
  assert.equal(lots.lots[1].locataire_personne, true);
  assert.equal(R.sansVille('12 rue Carnot', 'Mâcon'), '12 rue Carnot');
});

test('un bien hors de ses villes entre quand même, signalé', async () => {
  const S = Records.create('SecteurMandataire', { nom: 'Lyonnais', mandataire_email: user.email, villes_seules: true, villes_choisies: [{ nom: 'Lyon', code: '69123' }] });
  const { proprietaire: p } = R.creerBienAImporter(user);
  const r = await R.executerReprise({ adresse: '112 boulevard Gambetta', ville: 'Nice' }, user, { fiche: p });
  assert.equal(r.hors_secteur?.ville, 'Nice');
  assert.ok(Records.get('ProprietaireMandataire', p.id).hors_secteur);
  const { proprietaire: q } = R.creerBienAImporter(user);
  const r2 = await R.executerReprise({ adresse: '2 rue Mercière', ville: 'Lyon' }, user, { fiche: q });
  assert.equal(r2.hors_secteur, undefined);
  Records.update('SecteurMandataire', S.id, { retire_le: new Date().toISOString(), mandataire_email: 'personne@x.fr' });
});
