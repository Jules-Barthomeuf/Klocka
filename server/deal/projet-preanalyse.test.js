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

test("sans activité dans la Pré-analyse, la catégorie de l'enrichissement sert, jamais « à qualifier »", () => {
  dossier('PA2', {}, { activite: { libelle: 'Activité à qualifier' } });
  const r = P.creerProjetDepuisDeal('PA2', 0, { email: 'nora@klocka.immo' });
  assert.equal(Records.get('Project', r.project.id).activite_locataire || '', '');
  dossier('PA3', {}, { activite: { libelle: 'Restauration' } });
  const r3 = P.creerProjetDepuisDeal('PA3', 0, { email: 'nora@klocka.immo' });
  assert.equal(Records.get('Project', r3.project.id).activite_locataire, 'Restauration');
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
