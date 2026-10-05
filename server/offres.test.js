// Les offres (LOI) : AK les rédige depuis le chat de l'application, la
// lettre est gardée pour la page Offres, une notification « Relire » y mène,
// et le chat la corrige ensuite. Sans réseau ni modèle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-offres-'));
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.MISTRAL_API_KEY = '';
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const O = await import('./offres.js');
const { executerOutil } = await import('./ak/agent.js');

const JULES = { email: 'jules.b@klocka.immo', role: 'admin', full_name: 'Jules B' };
const APP = { message: { espace: `app:${JULES.email}`, auteur: { nom: JULES.email } } };
const OFFRE = {
  acquereur_nom: 'Olivier LUCCIONI', acquereur_societe: 'FONCIERE ANGULARIS', acquereur_adresse: 'LOT 12, STILETTO, 20090 AJACCIO',
  vendeur_societe: 'PAX AVENUE', vendeur_representant: 'Monsieur Jérôme ABECASSIS', vendeur_adresse: '85 rue de France, 06000 Nice',
  adresse_bien: '1 avenue Mirabeau, 06000 Nice', surface_m2: 40, locataire: 'Cookietelier', fin_bail: '2032-04-30', prix: 200000, apport: 40000,
};
let id;

test('il manque le prix : AK le demande, rien ne se crée', async () => {
  const { prix, ...sansPrix } = OFFRE;
  assert.ok(prix);
  const r = await executerOutil({ name: 'rediger_loi', input: sansPrix }, JULES, APP);
  assert.equal(r.ok, false);
  assert.ok(r.manque.some((m) => /prix/.test(m)));
  assert.equal(Records.list(O.ENTITE).length, 0);
});

test("depuis l'application : la LOI est gardée, et « Votre LOI est prête » mène à la relire", async () => {
  const r = await executerOutil({ name: 'rediger_loi', input: OFFRE }, JULES, APP);
  assert.equal(r.ok, true, r.error);
  id = r.loi_id;
  assert.equal(r.lien, `/Offres?loi=${id}`);
  const n = Records.list('Notification').find((x) => x.pour === JULES.email && x.titre === 'Votre LOI est prête');
  assert.ok(n, 'la notification est là');
  assert.equal(n.lien, `/Offres?loi=${id}`);
  assert.equal(n.action, 'Relire');
  assert.equal(O.listerLettres()[0].acquereur, 'Olivier LUCCIONI · FONCIERE ANGULARIS');
  const d = await O.lireLettre(id);
  assert.match(d.blocs.find((b) => b.cle === 'offre-3').texte, /\*\*200[\s\u202f]000 € \(deux cent mille euros\)\*\*/);
  assert.equal(d.parties.vendeur[1][1], 'Représentée par Monsieur Jérôme ABECASSIS');
});

test('le chat corrige la lettre ouverte : un champ, puis un paragraphe', async () => {
  const r = await executerOutil({ name: 'rediger_loi', input: { loi_id: id, prix: 190000 } }, JULES, APP);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.loi_id, id);
  assert.equal(Records.list(O.ENTITE).length, 1, 'pas de seconde lettre');
  let d = await O.lireLettre(id);
  assert.match(d.blocs.find((b) => b.cle === 'offre-3').texte, /cent quatre-vingt-dix mille euros/);
  assert.equal(d.lettre.champs.acquereur_nom, 'Olivier LUCCIONI', 'le reste ne bouge pas');
  await executerOutil({ name: 'rediger_loi', input: { loi_id: id, textes: { substitution: 'Aucune substitution ne sera possible.' } } }, JULES, APP);
  d = await O.lireLettre(id);
  assert.equal(d.blocs.find((b) => b.cle === 'substitution').texte, 'Aucune substitution ne sera possible.');
  // Le paragraphe retouché survit à un changement de champ ; vide, il revient au modèle.
  O.modifierLettre(id, { champs: { apport: 50000 } });
  d = await O.lireLettre(id);
  assert.equal(d.blocs.find((b) => b.cle === 'substitution').texte, 'Aucune substitution ne sera possible.');
  assert.match(d.blocs.find((b) => b.cle === 'financement').texte, /cinquante mille euros/);
  O.modifierLettre(id, { textes: { substitution: '' } });
  d = await O.lireLettre(id);
  assert.match(d.blocs.find((b) => b.cle === 'substitution').texte, /me substituer/);
});

test('la lettre sort en Word et en PDF, retouches comprises', async () => {
  const p = await O.fichierDe(id, 'pdf');
  assert.equal(p.contenu.slice(0, 5).toString(), '%PDF-');
  assert.match(p.nom, /^LOI 1 avenue Mirabeau, 06000 Nice\.pdf$/);
  const w = await O.fichierDe(id, 'docx');
  assert.equal(w.contenu.slice(0, 2).toString(), 'PK');
});

test("le bien vient d'un projet : adresse, surface, locataire, bail, prix", async () => {
  const projet = Records.create('Project', { titre: 'Boulangerie Dieppe', adresse_complete: '12 Grande Rue, 76200 Dieppe', ville_secteur_champ1: 'Dieppe', nom_locataire: 'Au Bon Pain', echeance_bail: '2031-06-30', surface_m2: 85, prix_acquisition: 310000 });
  const r = await executerOutil({ name: 'rediger_loi', input: { projet_id: projet.id, acquereur_nom: 'Claire FONTAINE', vendeur_societe: 'SCI DU PORT', apport: 60000 } }, JULES, APP);
  assert.equal(r.ok, true, r.error);
  const d = await O.lireLettre(r.loi_id);
  assert.equal(d.lettre.champs.adresse_bien, '12 Grande Rue, 76200 Dieppe');
  assert.equal(d.lettre.champs.locataire, 'Au Bon Pain');
  assert.equal(d.lettre.champs.prix, 310000);
  assert.equal(d.lettre.projet_id, projet.id);
  assert.match(d.blocs.find((b) => b.cle === 'offre-2').texte, /environ 85 m², actuellement loué à l'enseigne Au Bon Pain/);
  const faux = await executerOutil({ name: 'rediger_loi', input: { projet_id: 'nimporte', acquereur_nom: 'X', vendeur_societe: 'Y', apport: 1, prix: 1 } }, JULES, APP);
  assert.equal(faux.ok, false);
});

test('depuis la page Offres : la lettre s\'ouvre à droite, sans notification', async () => {
  const avant = Records.list('Notification').length;
  const r = await executerOutil({ name: 'rediger_loi', input: { ...OFFRE, adresse_bien: '3 rue Neuve, 06000 Nice' } }, JULES, { message: { ...APP.message, page: 'offres' } });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.nouvelle, true);
  assert.equal(Records.list('Notification').length, avant, 'pas de notification');
});

test("le modèle : rien de choisi, deux versions ; choisi, Word et PDF le suivent", async () => {
  let d = await O.lireLettre(id);
  assert.equal(d.lettre.modele, null);
  assert.deepEqual(Object.keys(d.versions), ['classique', 'menthe']);
  assert.equal(d.versions.menthe.blocs.find((b) => b.cle === 'h-offre').num, '01');
  assert.equal(d.versions.classique.blocs.find((b) => b.cle === 'h-offre').num, 'I.');
  assert.match(d.versions.menthe.blocs.find((b) => b.cle === 'offre-2').texte, /\*\*85 m²\*\*|\*\*40 m²\*\*/);
  assert.equal(d.versions.menthe.cadre.adresse_courte, '1 avenue Mirabeau, Nice');
  assert.equal(O.modifierLettre(id, { modele: 'bleu' }).ok, false, 'un modèle inconnu est refusé');
  O.modifierLettre(id, { modele: 'menthe' });
  d = await O.lireLettre(id);
  assert.equal(d.lettre.modele, 'menthe');
  assert.equal(d.versions, undefined, 'choisi : plus de choix à montrer');
  const p = await O.fichierDe(id, 'pdf');
  assert.equal(p.contenu.slice(0, 5).toString(), '%PDF-');
  const w = await O.fichierDe(id, 'docx');
  assert.equal(w.contenu.slice(0, 2).toString(), 'PK');
  O.modifierLettre(id, { modele: null });
  assert.ok((await O.lireLettre(id)).versions, 'changer de modèle rouvre le choix');
});

test("le contexte du chat dit la lettre ouverte et ses paragraphes", async () => {
  const c = await O.contexteLettre(id);
  assert.match(c, new RegExp(`loi_id=${id}`));
  assert.match(c, /substitution : /);
  assert.match(c, /prix=190000/);
});

test("les sources : la fiche du dossier et sa phrase, le chat, le modèle ; une retouche dans la lettre se dit saisie", async () => {
  const deal = Records.create('Deal', {
    deal_id: 'D-SOURCES', source: { nom_fichier: 'fiche Neyret.pdf', url: '/uploads/fiche-neyret.pdf', texte_source: 'Local commercial Lyon 69009. Prix de vente | 360 000 € ttc. Surface | 142 m².' },
    lots: [{ lot: { adresse: { valeur: { rue: '4 rue Masaryk', code_postal: '69009', ville: 'Lyon' }, citation: 'Lyon 69009' }, prix_fai: { valeur: 360000, citation: 'Prix de vente | 360 000 € ttc' }, surface_m2: { valeur: 142, citation: 'Surface | 142 m²' } } }],
  });
  const r = await executerOutil({ name: 'rediger_loi', input: { deal_id: deal.deal_id, acquereur_nom: 'Claire FONTAINE', vendeur_societe: 'SCI MASARYK', apport: 70000 } }, JULES, APP);
  assert.equal(r.ok, true, r.error);
  let s = await O.sourcesDe(r.loi_id);
  const dossier = s.find((x) => x.id === 'dossier');
  assert.equal(dossier.titre, 'fiche Neyret.pdf');
  assert.equal(dossier.document.url, '/uploads/fiche-neyret.pdf');
  assert.equal(dossier.champs.find((c) => c.cle === 'prix').citation, 'Prix de vente | 360 000 € ttc');
  assert.deepEqual(s.find((x) => x.id === 'chat').champs.map((c) => c.cle).sort(), ['acquereur_nom', 'apport', 'vendeur_societe']);
  assert.ok(s.find((x) => x.id === 'modele').champs.some((c) => c.cle === 'taux'));
  // Le prix corrigé au chat quitte le dossier ; la surface retouchée dans la lettre est saisie.
  await executerOutil({ name: 'rediger_loi', input: { loi_id: r.loi_id, prix: 340000 } }, JULES, APP);
  O.modifierLettre(r.loi_id, { champs: { surface_m2: 140 } });
  s = await O.sourcesDe(r.loi_id);
  assert.ok(s.find((x) => x.id === 'chat').champs.some((c) => c.cle === 'prix'));
  assert.deepEqual(s.find((x) => x.id === 'main').champs.map((c) => c.cle), ['surface_m2']);
  assert.deepEqual(s.find((x) => x.id === 'dossier').champs.map((c) => c.cle), ['adresse_bien']);
});

test('la lettre se relie à sa conversation, sans remonter dans la liste', async () => {
  const avant = Records.get(O.ENTITE, id).maj_le;
  assert.equal(O.modifierLettre(id, { conversation_id: 'conv-1' }).ok, true);
  const l = O.listerLettres().find((x) => x.id === id);
  assert.equal(l.conversation_id, 'conv-1');
  assert.equal(l.maj_le, avant);
});
