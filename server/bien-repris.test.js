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
