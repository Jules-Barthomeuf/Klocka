// Les documents d'un bien en un seul endroit, la vue d'ensemble du bien (3 nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-documents-bien-'));
const { Records } = await import('./db.js');
const D = await import('./documents-du-bien.js');
const P = await import('./mandataire-portes.js');

test('la nature se lit dans le nom : bilans, bail, photos, le reste en Autres', () => {
  assert.equal(D.natureDuNom('Bilan 2024 Ginet.pdf'), 'bilans');
  assert.equal(D.natureDuNom('liasse_fiscale_2023.pdf'), 'bilans');
  assert.equal(D.natureDuNom('BAIL commercial signé.pdf'), 'bail');
  assert.equal(D.natureDuNom('Taxe foncière 2025.pdf'), 'taxe_fonciere');
  assert.equal(D.natureDuNom('IMG_2041.HEIC'), 'photos');
  assert.equal(D.natureDuNom('scan.pdf', 'image/jpeg'), 'photos');
  assert.equal(D.natureDuNom('document.pdf'), 'autres');
  assert.equal(D.caseDataroom('bilans'), 'autres', 'la Data room n’a pas de case Bilans');
  assert.equal(D.caseDataroom('bail'), 'bail');
});

test('un seul endroit : déposé, joint à l’avis, Data room, vendeur, photos, ce que l’assistant a fait ; un fichier une fois', () => {
  const fiche = { id: 'f1', commerce: 'Boulangerie Ginet', ville: 'Lyon', biens: {
    pieces: [{ id: 'a', nom: 'Bilan 2024.pdf', url: '/uploads/bilan.pdf', nature: 'bilans', le: '2026-11-03T10:00:00Z', par: 'mandataire' }],
    visite: { photos: [{ url: '/uploads/v1.jpg' }] },
  } };
  const estimations = [{ id: 'e1', bail: { nom: 'bail.pdf', url: '/uploads/bail.pdf' }, avis: { chiffres: { valeur: 140000 } }, statut: 'pret', cree_le: '2026-11-02T10:00:00Z' }];
  const dossier = { documents: {
    bail: [{ nom: 'bail.pdf', url: '/uploads/bail.pdf', repris: true }],
    quittances: [{ nom: 'quittances.pdf', url: '/uploads/q.pdf', par: 'vendeur', le: '2026-11-03T12:00:00Z' }],
    autres: [{ nom: 'Bilan 2024.pdf', url: '/uploads/bilan.pdf' }],
    kbis_vendeur: [{ nom: 'kbis.pdf', url: '/uploads/k.pdf' }],
  } };
  const r = D.documentsDuBien({ fiche, estimations, dossier });
  const par = Object.fromEntries(r.groupes.map((g) => [g.nature, g.documents]));
  assert.equal(par.bilans.length, 1, 'le bilan déposé puis copié dans la Data room ne se voit qu’une fois');
  assert.equal(par.bilans[0].source, 'déposé par vous');
  assert.equal(par.bail.length, 1);
  assert.equal(par.bail[0].source, "joint à l'avis de valeur");
  assert.equal(par.quittances[0].source, 'déposé par le vendeur');
  assert.equal(par.kbis[0].nom, 'kbis.pdf', 'le Kbis de la société vendeuse se range avec les Kbis');
  assert.equal(par.photos.length, 1);
  assert.equal(par.assistant[0].nom, 'Avis de valeur');
  assert.equal(par.assistant[0].etape, 'estimation', 'un document de l’assistant s’ouvre dans son étape');
  assert.deepEqual(r.groupes.map((g) => g.nature), ['bail', 'quittances', 'bilans', 'kbis', 'photos', 'assistant'], 'dans l’ordre des natures');
});

test('déposer sur le bien : rangé par nature, le sien seulement, reclassable ; la Data room en hérite à sa naissance', async () => {
  const user = { email: 'm@kpartners.fr', role: 'mandataire' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: 'm@kpartners.fr', commerce: 'Tabac du Port', statut: 'rdv_pris', biens: {} });
  const r = await D.deposerAuBien(p.id, [{ nom: 'Bail 2019.pdf', url: '/uploads/b19.pdf' }, { nom: 'compte de résultat 2024.pdf', url: '/uploads/cr.pdf' }], user);
  assert.ok(r.ok);
  assert.deepEqual(r.deposes.map((x) => x.nature), ['bail', 'bilans']);
  assert.equal((await D.deposerAuBien(p.id, [{ nom: 'x.pdf', url: '/uploads/x.pdf' }], { email: 'autre@kpartners.fr', role: 'mandataire' })).ok, false, 'pas sur le bien d’un autre');
  const again = await D.deposerAuBien(p.id, [{ nom: 'Bail 2019.pdf', url: '/uploads/b19.pdf' }], user);
  assert.equal(again.deposes.length, 0, 'un même fichier ne se range pas deux fois');
  const id = r.deposes[1].id;
  assert.ok(D.reclasser(p.id, id, 'autres', user).ok);
  assert.equal(D.reclasser(p.id, id, 'assistant', user).ok, false);
  assert.ok(D.retirerPiece(p.id, id, user).ok);
  assert.equal(Records.get('ProprietaireMandataire', p.id).biens.pieces.length, 1);
  assert.ok((await D.deposerAuBien(p.id, [{ nom: 'compte de résultat 2024.pdf', url: '/uploads/cr.pdf' }], user, { nature: 'autres' })).ok);
  const fiche = Records.get('ProprietaireMandataire', p.id);
  const h = P.heritageDuDossier({ fiche });
  assert.equal(h.documents.bail[0].url, '/uploads/b19.pdf');
  assert.equal(h.documents.autres[0].url, '/uploads/cr.pdf');
});

test('une case nommée sur le bien : ses documents y vont, la Data room la reprend à sa naissance (4 nov. 2026)', async () => {
  const user = { email: 'm@kpartners.fr', role: 'mandataire' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: 'm@kpartners.fr', commerce: 'Cave', statut: 'rdv_pris', biens: {} });
  assert.equal(D.nouvelleCaseDuBien(p.id, '  ', user).ok, false, 'un nom est demandé');
  assert.equal(D.nouvelleCaseDuBien(p.id, 'Licence IV', { email: 'autre@kpartners.fr', role: 'mandataire' }).ok, false);
  const c = D.nouvelleCaseDuBien(p.id, 'Licence IV', user);
  assert.ok(c.ok && c.cle.startsWith('perso-'));
  assert.equal(D.nouvelleCaseDuBien(p.id, 'licence iv', user).cle, c.cle, 'un nom déjà pris rend la même case');
  assert.equal((await D.deposerAuBien(p.id, [{ nom: 'x.pdf', url: '/uploads/x-perso.pdf' }], user, { casePerso: 'perso-inconnue' })).ok, false);
  const r = await D.deposerAuBien(p.id, [{ nom: 'Bail licence.pdf', url: '/uploads/licence.pdf' }], user, { casePerso: c.cle });
  assert.equal(r.deposes[0].nature, 'autres');
  assert.equal(r.deposes[0].case_perso, c.cle, 'rangé dans la case choisie, pas d’après son nom');
  const lus = await D.documentsLus({ proprietaire: p.id }, user);
  assert.deepEqual(lus.cases_perso.map((x) => x.mot), ['Licence IV']);
  assert.equal(lus.groupes.flatMap((g) => g.documents).find((d) => d.url === '/uploads/licence.pdf').case_perso, c.cle);
  const h = P.heritageDuDossier({ fiche: Records.get('ProprietaireMandataire', p.id) });
  assert.deepEqual(h.pieces_perso.map((x) => [x.cle, x.mot]), [[c.cle, 'Licence IV']]);
  assert.equal(h.documents[c.cle][0].url, '/uploads/licence.pdf');
});

test("les outils de l'assistant : sans bien ouvert, il le dit ; il lit un fichier texte du bien", async () => {
  const user = { email: 'm@kpartners.fr', role: 'mandataire' };
  assert.equal((await D.executerOutilDocuments({ name: 'documents_du_bien', input: {} }, user, {})).ok, false);
  const { CHEMIN_UPLOADS } = await import('./db.js');
  fs.mkdirSync(CHEMIN_UPLOADS, { recursive: true });
  fs.writeFileSync(path.join(CHEMIN_UPLOADS, 'note-bail.txt'), 'Cession libre au profit du successeur.');
  const p = Records.create('ProprietaireMandataire', { mandataire_email: 'm@kpartners.fr', commerce: 'Fleurs', statut: 'rdv_pris', biens: {} });
  await D.deposerAuBien(p.id, [{ nom: 'note bail.txt', url: '/uploads/note-bail.txt' }], user);
  const liste = await D.executerOutilDocuments({ name: 'documents_du_bien', input: {} }, user, { fiche: p });
  assert.equal(liste.total, 1);
  const lu = await D.executerOutilDocuments({ name: 'lire_document', input: { document: 'note bail' } }, user, { fiche: p });
  assert.ok(lu.ok, lu.error);
  assert.match(lu.texte, /Cession libre/);
});

test("retirer pour réimporter : une pièce jointe à l'import d'un portefeuille se retire aussi, par son adresse", () => {
  const user = { email: 'm@kpartners.fr', role: 'mandataire' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: 'm@kpartners.fr', commerce: 'Fleuriste', statut: 'rdv_pris', biens: {}, pieces_importees: [{ nom: 'Mandat.pdf', url: '/uploads/m.pdf' }] });
  assert.equal(D.retirerPiece(p.id, 'importee:/uploads/autre.pdf', user).ok, false);
  assert.ok(D.retirerPiece(p.id, 'importee:/uploads/m.pdf', user).ok);
  assert.deepEqual(Records.get('ProprietaireMandataire', p.id).pieces_importees, []);
});

test('une case du bien garde dix documents au plus ; « autres » sans limite', async () => {
  const user = { email: 'm@kpartners.fr', role: 'mandataire' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: 'm@kpartners.fr', commerce: 'Murs Gambetta', statut: 'rdv_pris', biens: {} });
  const lot = (n, de = 0) => Array.from({ length: n }, (_, i) => ({ nom: `quittance ${de + i}.pdf`, url: `/uploads/q-${de + i}.pdf` }));
  assert.ok((await D.deposerAuBien(p.id, lot(8), user, { nature: 'quittances' })).ok);
  const trop = await D.deposerAuBien(p.id, lot(3, 8), user, { nature: 'quittances' });
  assert.equal(trop.ok, false);
  assert.match(trop.error, /il reste 2 places/);
  assert.ok((await D.deposerAuBien(p.id, lot(2, 8), user, { nature: 'quittances' })).ok);
  assert.ok((await D.deposerAuBien(p.id, lot(12, 100), user, { nature: 'autres' })).ok);
});
