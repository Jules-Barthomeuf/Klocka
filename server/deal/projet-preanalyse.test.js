// Le projet suit la Pré-analyse (10 nov. 2026, Jules) : ce que le tableau dit passe devant le reste, une case modifiée à
// la main dans le projet ne bouge plus. Rien ne part chez le modèle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-projet-preanalyse-'));
const { Records } = await import('../db.js');
const P = await import('./projet.js');
const { casesDuProjet } = await import('../projet-cases.js');

const lu = (valeur) => ({ absent: false, valeur });

function dossier(id, lot, enrichissement = {}) {
  Records.create('Deal', { deal_id: id, nom: 'Toulouse', lots: [{ lot: { adresse: lu({ rue: '3 rue Alsace', code_postal: '31000', ville: 'Toulouse' }), ...lot }, enrichissement }] });
}

test("l'activité, le nom et le type de bail du projet sont ceux de la Pré-analyse, pas la catégorie devinée", () => {
  dossier('PA1', { locataire_nom: lu('Artilect'), locataire_activite: lu('Coworking et fablab'), bail_type: lu('3/6/9') }, { activite: { libelle: 'Alimentaire / supérette' } });
  const r = P.creerProjetDepuisDeal('PA1', 0, { email: 'nora@klocka.immo' });
  assert.equal(r.ok, true);
  const projet = Records.get('Project', r.project.id);
  assert.equal(projet.activite_locataire, 'Coworking et fablab');
  assert.equal(projet.nom_locataire, 'Artilect');
  assert.equal(projet.type_bail, '3/6/9');
  assert.deepEqual(projet.bail_admin_fields[0], { label: 'Type de bail', value: '3/6/9' });
});

test("sans activité écrite dans la Pré-analyse, le projet n'en invente pas (10 nov. 2026)", () => {
  dossier('PA2', {}, { activite: { libelle: 'Activité à qualifier' } });
  const r = P.creerProjetDepuisDeal('PA2', 0, { email: 'nora@klocka.immo' });
  assert.equal(Records.get('Project', r.project.id).activite_locataire || '', '');
  dossier('PA3', { locataire_nom: lu('restaurant libanais') }, { activite: { libelle: 'Restauration assise' } });
  const r3 = P.creerProjetDepuisDeal('PA3', 0, { email: 'nora@klocka.immo' });
  const p3 = Records.get('Project', r3.project.id);
  assert.equal(p3.activite_locataire || '', '', 'la catégorie devinée ne passe pas');
  assert.equal(p3.nom_locataire, 'restaurant libanais', 'le nom tel quel');
  assert.equal(p3.titre, 'restaurant libanais');
});

test('la Pré-analyse corrigée passe dans le projet, sauf les cases modifiées à la main', async () => {
  dossier('PA4', { locataire_nom: lu('Artilect'), locataire_activite: lu('Coworking'), surface_m2: lu(120) });
  const { project } = P.creerProjetDepuisDeal('PA4', 0, { email: 'nora@klocka.immo' });
  Records.update('Project', project.id, { nom_locataire: 'Artilect FabLab', champs_a_la_main: ['nom_locataire'] });
  const deal = Records.findBy('Deal', 'deal_id', 'PA4');
  const lots = [{ ...deal.lots[0], lot: { ...deal.lots[0].lot, locataire_nom: lu('ARTILECT SAS'), locataire_activite: lu('Fablab et formations'), surface_m2: lu(140) } }];
  Records.update('Deal', deal.id, { lots });
  const r = await P.mettreAJourProjetDepuisDeal('PA4', null);
  assert.equal(r.ok, true);
  const apres = Records.get('Project', project.id);
  assert.equal(apres.nom_locataire, 'Artilect FabLab', 'modifié à la main : il reste');
  assert.equal(apres.activite_locataire, 'Fablab et formations');
  assert.equal(apres.surface_m2, 140);
});

test("le type de bail de la Pré-analyse mène l'analyse du bail ; ce que les pièces disent reste dessous", () => {
  const fiche = { blocs: [{ champs: [{ id: 'type_bail', valeur: 'Bail dérogatoire de 23 mois', preuves: [] }] }] };
  const c = casesDuProjet({ type_bail: '3/6/9' }, { fiche, sansSources: true });
  const t = c.analyse.find((x) => x.id === 'type_bail');
  assert.match(t.texte, /^3\/6\/9/);
  assert.match(t.texte, /dérogatoire/);
  const seul = casesDuProjet({}, { lot: { bail_type: lu('Bail commercial 3/6/9') }, sansSources: true });
  assert.equal(seul.analyse.find((x) => x.id === 'type_bail').texte, 'Bail commercial 3/6/9');
});

test("un champ corrigé dans la Pré-analyse passe dans le projet, devant le projet ; le titre porte le nom du locataire", async () => {
  const saisi = (valeur) => ({ absent: false, valeur, saisi_a_la_main: true });
  dossier('PA5', { locataire_nom: lu('Artilect'), locataire_activite: lu('Coworking'), bail_echeance: lu('31/12/2030') });
  const { project } = P.creerProjetDepuisDeal('PA5', 0, { email: 'nora@klocka.immo' });
  Records.update('Project', project.id, { echeance_bail: '2029-06-30', titre: 'Murs commerciaux', champs_a_la_main: ['echeance_bail'] });
  const deal = Records.findBy('Deal', 'deal_id', 'PA5');
  Records.update('Deal', deal.id, { lots: [{ ...deal.lots[0], lot: { ...deal.lots[0].lot, locataire_nom: saisi('Le Fournil'), bail_echeance: saisi('30/09/2033') } }] });
  await P.mettreAJourProjetDepuisDeal('PA5', null, { forcer: ['locataire_nom', 'bail_echeance'] });
  const p = Records.get('Project', project.id);
  assert.equal(p.nom_locataire, 'Le Fournil');
  assert.equal(p.echeance_bail, '2033-09-30', "la Pré-analyse qu'on vient de changer passe devant le projet, en date lisible");
  assert.equal(p.bail_date_echeance, '2033-09-30');
  assert.equal(p.champs_a_la_main.includes('echeance_bail'), false);
  assert.match(p.titre, /Le Fournil/);
  // Un titre écrit à la main ne bouge plus.
  Records.update('Project', project.id, { titre: 'Boulangerie du port', champs_a_la_main: ['titre'] });
  await P.mettreAJourProjetDepuisDeal('PA5', null, { forcer: ['locataire_nom'] });
  assert.equal(Records.get('Project', project.id).titre, 'Boulangerie du port');
});

test("un projet qui portait la catégorie devinée la perd, et son titre redevient le nom écrit", async () => {
  dossier('PA6', { locataire_nom: { absent: false, valeur: 'restaurant libanais', saisi_a_la_main: true } }, { activite: { libelle: 'Restauration assise' } });
  const { project } = P.creerProjetDepuisDeal('PA6', 0, { email: 'nora@klocka.immo' });
  Records.update('Project', project.id, { activite_locataire: 'Restauration assise', titre: 'Restauration assise restaurant libanais' });
  await P.mettreAJourProjetDepuisDeal('PA6', null);
  const p = Records.get('Project', project.id);
  assert.equal(p.activite_locataire, '');
  assert.equal(p.titre, 'restaurant libanais');
});

test("le bail écrit librement passe dans le projet : type et période ferme, et plus de dates quand il n'en dit pas", async () => {
  const saisi = (valeur) => ({ absent: false, valeur, saisi_a_la_main: true });
  dossier('PA7', { bail_type: lu('3/6/9'), bail_echeance: lu('31/12/2030') });
  const { project } = P.creerProjetDepuisDeal('PA7', 0, { email: 'nora@klocka.immo' });
  assert.equal(Records.get('Project', project.id).echeance_bail, '2030-12-31');
  const deal = Records.findBy('Deal', 'deal_id', 'PA7');
  const bail_lu = { texte: '12 ans ferme', type_bail: 'Bail de 12 ans ferme', duree_ans: 12, duree_ferme_ans: 12, date_debut: null, date_echeance: null };
  Records.update('Deal', deal.id, { lots: [{ ...deal.lots[0], lot: { ...deal.lots[0].lot, bail_texte: saisi('12 ans ferme'), bail_lu, bail_type: saisi('Bail de 12 ans ferme'), bail_echeance: { valeur: null, absent: true, saisi_a_la_main: true } } }] });
  await P.mettreAJourProjetDepuisDeal('PA7', null, { forcer: ['bail_texte'] });
  const p = Records.get('Project', project.id);
  assert.equal(p.type_bail, 'Bail de 12 ans ferme');
  assert.equal(p.bail_duree_ferme_ans, 12);
  assert.equal(p.echeance_bail || '', '', "l'ancienne échéance ne reste pas");
  assert.equal(p.bail_date_echeance || '', '');
  assert.deepEqual(p.bail_admin_fields[0], { label: 'Type de bail', value: 'Bail de 12 ans ferme' });
});

test("l'onglet Bien du projet reçoit le contexte de la vente, les équipements et les plans de l'Analyse (25 nov. 2026)", async () => {
  dossier('PA9', { locataire_nom: lu('Le Comptoir'), equipements: lu('extraction, terrasse de 20 m², cave') });
  const deal = Records.findBy('Deal', 'deal_id', 'PA9');
  Records.update('Deal', deal.id, {
    contexte_vente: '## Pourquoi il vend\n- Départ à la retraite',
    documents_espace: [{ id: 'd1', nom: 'Plan RDC.pdf', url: '/uploads/plan-rdc.pdf' }, { id: 'd2', nom: 'Bail.pdf', url: '/uploads/bail.pdf' }],
    analyse_pieces: { docs: { d1: { type: 'plans' }, d2: { type: 'bail' } } },
  });
  const { project } = P.creerProjetDepuisDeal('PA9', 0, { email: 'nora@klocka.immo' });
  const p = Records.get('Project', project.id);
  assert.equal(p.contexte_vente, '## Pourquoi il vend\n- Départ à la retraite');
  assert.equal(p.equipements, 'extraction, terrasse de 20 m², cave');
  assert.deepEqual(p.fichiers_projet.filter((f) => f.groupe === 'Plans'), [{ nom: 'Plan RDC.pdf', url: '/uploads/plan-rdc.pdf', groupe: 'Plans' }]);

  // Un plan rangé plus tard arrive une fois ; le contexte du projet reste celui de l'Analyse.
  Records.update('Project', project.id, { contexte_vente: 'Écrit dans le projet' });
  const d = Records.findBy('Deal', 'deal_id', 'PA9');
  Records.update('Deal', d.id, {
    documents_espace: [...d.documents_espace, { id: 'd3', nom: 'Plan R-1.png', url: '/uploads/plan-r1.png' }],
    analyse_pieces: { docs: { ...d.analyse_pieces.docs, d3: { type: 'plans' } } },
  });
  await P.mettreAJourProjetDepuisDeal('PA9', null);
  await P.mettreAJourProjetDepuisDeal('PA9', null);
  const apres = Records.get('Project', project.id);
  assert.equal(apres.contexte_vente, '## Pourquoi il vend\n- Départ à la retraite');
  assert.deepEqual(apres.fichiers_projet.filter((f) => f.groupe === 'Plans').map((f) => f.nom), ['Plan RDC.pdf', 'Plan R-1.png']);
});

test("l'étape Projet voit les cases modifiées à la main qui s'écartent de l'analyse, et les y ramène (26 nov. 2026)", async () => {
  dossier('PA20', { locataire_nom: lu('Artilect'), locataire_activite: lu('Coworking'), surface_m2: lu(120) });
  const { project } = P.creerProjetDepuisDeal('PA20', 0, { email: 'nora@klocka.immo' });
  // Le nom changé pour le client, la surface aussi mais à la même valeur que l'analyse : seul le nom est un écart.
  Records.update('Project', project.id, { nom_locataire: 'Artilect FabLab', surface_m2: '120', champs_a_la_main: ['nom_locataire', 'surface_m2', 'description_bien'] });
  const { ecarts } = await P.ecartsAvecLeDossier('PA20');
  assert.deepEqual(ecarts.map((e) => [e.champ, e.projet, e.dossier]), [['nom_locataire', 'Artilect FabLab', 'Artilect']]);
  assert.equal(ecarts[0].libelle, 'Nom du locataire');
  // L'essai n'a rien écrit.
  assert.equal(Records.get('Project', project.id).nom_locataire, 'Artilect FabLab');
  const r = await P.revenirAuDossier('PA20', 'nom_locataire', { email: 'nora@klocka.immo' });
  assert.equal(r.ok, true);
  const apres = Records.get('Project', project.id);
  assert.equal(apres.nom_locataire, 'Artilect');
  assert.deepEqual(apres.champs_a_la_main, ['surface_m2', 'description_bien']);
  assert.deepEqual((await P.ecartsAvecLeDossier('PA20')).ecarts, []);
  assert.equal((await P.revenirAuDossier('PA20', 'nom_locataire')).ok, false, 'une case qui suit déjà l\'analyse');
});
