// La Mise en vente côté mandataire et la Data room partagée avec les acquéreurs (7 nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mise-en-vente-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const MV = await import('./mise-en-vente.js');
const DR = await import('./dataroom-acquereur.js');
const A = await import('./acquereurs-du-bien.js');

const MOI = { email: 'lucie@kpartners.fr', role: 'mandataire' };
const JOUR = 86400000;

function bien({ prix = 600000, documents = {} } = {}) {
  const d = Records.create('DossierMandataire', { mandataire_email: MOI.email, bien: '(test) Local de 60 m² · 38 rue de la Paix', prix, statut: 'go', documents });
  const m = Records.create('MiseEnMarche', { mandataire_email: MOI.email, bien: d.bien, dossier_id: d.id, statut: 'preparation', voie: 'moi', offres: [], activite: [], cree_le: new Date().toISOString() });
  return { d, m };
}

test('le score et la température : le statut, le budget face au prix, la fraîcheur', () => {
  const maintenant = Date.now();
  const recent = new Date(maintenant - JOUR).toISOString();
  const vieux = new Date(maintenant - 60 * JOUR).toISOString();
  assert.equal(MV.scoreDe({ statut: 'contact', derniere: recent }, maintenant), 20);
  assert.equal(MV.scoreDe({ statut: 'offre', budget: 650000, prix: 600000, derniere: recent }, maintenant), 100);
  assert.equal(MV.scoreDe({ statut: 'qualifie', budget: 400000, prix: 600000, derniere: vieux }, maintenant), 0);
  assert.equal(MV.scoreDe({ statut: 'ecarte', budget: 900000, prix: 600000, derniere: recent }, maintenant), 0);
  assert.equal(MV.temperatureDe(80, 'offre'), 'chaud');
  assert.equal(MV.temperatureDe(40, 'qualifie'), 'tiede');
  assert.equal(MV.temperatureDe(20, 'contact'), 'froid');
  assert.equal(MV.temperatureDe(80, 'ecarte'), 'sans_suite');
  assert.equal(MV.temperatureDe(20, 'contact', 'chaud'), 'chaud', 'le choix du mandataire passe devant');
  assert.equal(MV.prochaineDe({ statut: 'contact' }), 'Qualifier : budget et financement');
  assert.equal(MV.prochaineDe({ statut: 'ecarte', note: 'Budget trop court' }), 'Budget trop court');
  assert.equal(MV.prochaineDe({ statut: 'ecarte' }), 'Sans suite');
  assert.equal(MV.canalDe('Teaser envoyé'), 'mail');
  assert.equal(MV.canalDe('ajouté', 'Leboncoin'), 'leboncoin');
  assert.equal(MV.canalDe('Data room : a consulté bail'), 'dataroom');
});

test('la phase suit ce qui existe : préparer, diffuser, qualifier, visiter, offres, acceptée', async () => {
  const { m } = bien();
  const phase = async () => (await MV.etatVente(m.id, MOI)).phase;
  assert.equal(await phase(), 'preparer');
  Records.update('MiseEnMarche', m.id, { annonces: { canaux: { leboncoin: { texte: 'x' }, portail: { texte: 'y' } }, diffusion: { leboncoin: new Date(Date.now() - 5 * JOUR).toISOString() } } });
  const e = await MV.etatVente(m.id, MOI);
  assert.equal(e.phase, 'diffuser');
  assert.equal(e.compteurs.jours_en_ligne, 5);
  assert.equal(e.phases.length, 6);
  const l = await A.ajouterLigne(m.id, { nom: 'Paul Durand', source: 'Leboncoin', statut: 'qualifie', budget: '600 k' }, MOI);
  assert.equal(await phase(), 'qualifier');
  A.modifierLigne(l.ligne.id, { statut: 'visite' }, MOI);
  assert.equal(await phase(), 'visiter');
  A.modifierLigne(l.ligne.id, { offre: '560 k' }, MOI);
  const o = await MV.etatVente(m.id, MOI);
  assert.equal(o.phase, 'offres');
  assert.equal(o.compteurs.offres, 1);
  assert.equal(o.onglets.acquereurs, 1);
  assert.match(o.conseils.offres.texte, /560 k€/);
  assert.match(o.conseils.offres.texte, /financement/, 'la preuve de financement manque');
  A.modifierLigne(l.ligne.id, { statut: 'signe' }, MOI);
  assert.equal(await phase(), 'acceptee');
  for (const k of ['dataroom', 'diffusion', 'acquereurs', 'offres', 'vendeur']) {
    assert.ok(o.conseils[k].texte, `conseil ${k}`);
    assert.ok(o.conseils[k].actions.length <= 3);
  }
});

test('les pistes enrichies et le patch : type, documents, offre en détail', async () => {
  const { m } = bien();
  const l = await A.ajouterLigne(m.id, { nom: 'SCI Horizon', source: 'LinkedIn', budget: '650 k' }, MOI);
  const r = await MV.modifierPiste(l.ligne.id, { type: 'SCI', financement: 'Prêt accordé', documents: { confidentialite: 'signe' }, offre: { montant: '580 k', conditions: 'Sous réserve de prêt', le: '2026-11-06' } }, MOI);
  assert.equal(r.ok, true);
  assert.equal(r.ligne.type, 'SCI');
  assert.equal(r.ligne.offre, 580000);
  assert.equal(r.ligne.statut, 'offre');
  assert.equal(r.ligne.offre_detail.conditions, 'Sous réserve de prêt');
  assert.equal(r.ligne.documents.confidentialite, 'signe');
  assert.equal(r.ligne.documents.offre, 'a_faire');
  assert.equal((await MV.modifierPiste(l.ligne.id, { documents: { offre: 'signe' } }, MOI)).ligne.documents.confidentialite, 'signe', 'les documents se fusionnent');
  assert.equal((await MV.modifierPiste(l.ligne.id, { type: 'martien' }, MOI)).ok, false);
  const t = await MV.tableauEnrichi(m.id, MOI);
  const x = t.lignes.find((y) => y.id === l.ligne.id);
  assert.ok(x.score > 0);
  assert.match(x.resume, /SCI Horizon/);
  assert.ok(x.historique.every((h) => h.canal));
  assert.ok(String(x.historique[0].le) >= String(x.historique[x.historique.length - 1].le), 'le plus récent en premier');
});

test('la Data room partagée : le titre de propriété est interne, la consultation et la demande se notent', async () => {
  const { d, m } = bien({ documents: { bail: [{ nom: 'Bail.pdf', url: '/uploads/bail-test.pdf' }], titre: [{ nom: 'Titre.pdf', url: '/uploads/titre-test.pdf' }] } });
  assert.equal(DR.caseVisible(d, 'titre'), false);
  assert.equal(DR.caseVisible(d, 'titre_propriete'), false);
  assert.equal(DR.caseVisible(d, 'bail'), true);
  const l = await A.ajouterLigne(m.id, { nom: 'Marie Leroy' }, MOI);
  const lien = await DR.lienDataroom(l.ligne.id, MOI);
  assert.match(lien.lien, /^\/data-room\/[A-Za-z0-9_-]{20,}$/);
  assert.equal((await DR.lienDataroom(l.ligne.id, MOI)).lien, lien.lien, 'le même lien la deuxième fois');
  assert.equal((await DR.lienDataroom(l.ligne.id, { email: 'autre@kpartners.fr', role: 'mandataire' })).ok, false);
  const jeton = lien.lien.split('/').pop();
  const v = await DR.vuePublique(jeton);
  assert.equal(v.ok, true);
  assert.doesNotMatch(v.bien.titre, /rue de la Paix/);
  assert.ok(!v.cases.some((c) => c.cle === 'titre'), 'le titre de propriété ne sort pas');
  const bail = v.cases.find((c) => c.cle === 'bail');
  assert.equal(bail.fichiers.length, 1);
  assert.equal(bail.fichiers[0].url, undefined, "jamais l'adresse du fichier");
  const f = DR.fichierPublic(jeton, bail.fichiers[0].id);
  assert.equal(f.ok, true);
  const titreId = DR.idFichier({ url: '/uploads/titre-test.pdf' });
  assert.equal(DR.fichierPublic(jeton, titreId).ok, false, 'une case interne ne se télécharge pas');
  assert.equal((await DR.demanderPiece(jeton, 'quittances')).ok, true);
  assert.equal((await DR.demanderPiece(jeton, 'quittances')).deja, true, 'une demande par case');
  assert.equal((await DR.demanderPiece(jeton, 'titre')).ok, false);
  assert.equal((await DR.vuePublique('court')).ok, false);
  const frais = Records.get('DossierMandataire', d.id);
  assert.equal(frais.consultations.length, 1);
  assert.equal(frais.demandes.length, 1);
  const pieces = DR.enrichirPieces([{ cle: 'bail', mot: 'Bail' }, { cle: 'quittances', mot: 'Quittances' }, { cle: 'titre', mot: 'Titre' }], frais, Records.list('PisteAcquereur'));
  assert.equal(pieces[0].consulte_par[0].nom, 'Marie Leroy');
  assert.equal(pieces[0].consulte_par[0].fois, 1);
  assert.equal(pieces[1].demande_par[0].nom, 'Marie Leroy');
  assert.equal(pieces[2].visible, false);
  assert.ok(Records.list('Notification').some((n) => n.pour === MOI.email && /demande une pièce/.test(n.titre)));
  // La case montrée : elle sort.
  assert.equal((await DR.poserVisibilite(d.id, 'titre', true, MOI)).ok, true);
  assert.ok((await DR.vuePublique(jeton)).cases.some((c) => c.cle === 'titre'));
  const t = await MV.tableauEnrichi(m.id, MOI);
  assert.equal(t.lignes.find((y) => y.id === l.ligne.id).consultations[0].cle, 'bail');
});

test('la diffusion : les contacts par canal, les cibles du fichier, et l’envoi du teaser crée la piste', async () => {
  const { m } = bien();
  Records.update('MiseEnMarche', m.id, { annonces: { canaux: { leboncoin: {}, portail: {}, linkedin: {} }, diffusion: { leboncoin: new Date().toISOString() } } });
  await A.ajouterLigne(m.id, { nom: 'Un', source: 'Leboncoin', statut: 'qualifie' }, MOI);
  await A.ajouterLigne(m.id, { nom: 'Deux', source: 'Leboncoin' }, MOI);
  await A.ajouterLigne(m.id, { nom: 'Trois', source: 'SeLoger', statut: 'visite' }, MOI);
  const cible = Records.create('AcquereurMandataire', { mandataire_email: MOI.email, nom: 'Investisseur Fichier', email: 'if@exemple.fr', budget_max: 700000, cree_le: new Date().toISOString() });
  Records.create('AcquereurMandataire', { mandataire_email: MOI.email, nom: 'Trop court', budget_max: 300000, cree_le: new Date().toISOString() });
  const r = await MV.diffusionVente(m.id, MOI);
  const lbc = r.canaux.find((c) => c.cle === 'leboncoin');
  assert.deepEqual([lbc.statut, lbc.contacts, lbc.qualifies], ['en_ligne', 2, 1]);
  const portail = r.canaux.find((c) => c.cle === 'portail');
  assert.deepEqual([portail.statut, portail.contacts, portail.qualifies], ['brouillon', 1, 1]);
  assert.ok(r.cibles.some((c) => c.acquereur_id === cible.id));
  assert.ok(!r.cibles.some((c) => c.nom === 'Trop court'), 'hors budget');
  assert.ok(!r.cibles.some((c) => c.nom === 'Un'), 'déjà dans le tableau');
  assert.equal(r.reseaux.length, 3);
  const e = await MV.envoyerTeaser(m.id, cible.id, MOI);
  assert.equal(e.ok, true);
  assert.equal(e.mail.a, 'if@exemple.fr');
  assert.match(e.mail.teaser_pdf, /teaser\/pdf$/);
  assert.doesNotMatch(e.mail.objet, /rue de la Paix/);
  const p = Records.get('PisteAcquereur', e.piste_id);
  assert.deepEqual([p.source, p.statut, p.historique[0].action], ['Fichier', 'contact', 'Teaser envoyé']);
  const apres = await MV.diffusionVente(m.id, MOI);
  assert.ok(!apres.cibles.some((c) => c.acquereur_id === cible.id), 'devenue une piste');
  assert.equal((await MV.envoyerTeaser(m.id, 'inconnu', MOI)).ok, false);
});

test('les offres de toutes sources et l’écart des deux meilleures', async () => {
  const { m } = bien();
  Records.update('MiseEnMarche', m.id, { offres: [{ id: 'o-1', montant: 590000, validee: true, client_nom: 'Secret', reponse: null, le: new Date().toISOString() }, { id: 'o-2', montant: 640000, validee: false, client_nom: 'Pas transmise' }] });
  const l = await A.ajouterLigne(m.id, { nom: 'Paul', offre: '560 k' }, MOI);
  const r = await MV.offresVente(m.id, MOI);
  assert.equal(r.offres.length, 2, "l'offre non validée de Klocka ne sort pas");
  assert.equal(r.offres[0].nom, 'Investisseur Klocka');
  assert.ok(!JSON.stringify(r).includes('Secret'));
  assert.equal(r.offres[1].piste_id, l.ligne.id);
  assert.equal(r.ecart, 30000);
  assert.equal(r.prix_demande, 600000);
  const seul = bien();
  assert.equal((await MV.offresVente(seul.m.id, MOI)).ecart, null);
  const rap = await MV.rapportVendeur(m.id, MOI);
  assert.equal(rap.pret, true);
  assert.ok(!JSON.stringify(rap.offres).includes('Paul'), 'le rapport au vendeur est anonyme');
  assert.equal((await MV.offresVente(m.id, { email: 'autre@kpartners.fr', role: 'mandataire' })).ok, false);
});
