// Les villes Klocka et les communes de l'agent IA : l'agent lit les villes
// Klocka de son secteur d'abord, toujours, puis les communes cochées par le
// mandataire, et rien d'autre. Sans réseau : un secteur dessiné par communes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-villes-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const VK = await import('./villes-klocka.js');
const A = await import('./mandataire-agent.js');

const MARC = { email: 'marc@kpartners.fr', role: 'mandataire' };
const LYON = { nom: 'Lyon', code: '69123', departement: '69' };
const secteur = Records.create('SecteurMandataire', {
  nom: 'Lyonnais', mandataire_email: MARC.email,
  unites: [{ niveau: 'commune', code: '69034', nom: 'Caluire-et-Cuire' }, { niveau: 'commune', code: '69123', nom: 'Lyon' }, { niveau: 'commune', code: '69029', nom: 'Bron' }],
});

test('pure : les villes Klocka du secteur à part, les autres cochées ou non', () => {
  const r = VK.rangerCommunes([{ nom: 'Lyon', code: '69123' }, { nom: 'Bron', code: '69029' }, { nom: 'Écully' }], [LYON], ['69029', 'ecully']);
  assert.deepEqual(r.klocka.map((c) => c.nom), ['Lyon']);
  assert.deepEqual(r.autres.map((c) => [c.nom, c.choisie]), [['Bron', true], ['Écully', true]]);
});

test("la liste part de Lyon ; une ville s'ajoute une fois, se retire, et le code est exigé", () => {
  assert.deepEqual(VK.villesKlocka().map((v) => v.nom), ['Lyon']);
  assert.equal(VK.ajouterVilleKlocka({ nom: 'Lyon' }).ok, false);
  VK.ajouterVilleKlocka(LYON);
  VK.ajouterVilleKlocka(LYON);
  VK.ajouterVilleKlocka({ nom: 'Bordeaux', code: '33063', departement: '33' });
  assert.deepEqual(VK.villesKlocka().map((v) => v.nom), ['Bordeaux', 'Lyon']);
  VK.retirerVilleKlocka('33063');
  assert.deepEqual(VK.villesKlocka().map((v) => v.code), ['69123']);
});

test("rien de coché : l'agent ne lit que Lyon, et l'accueil attend le réglage", async () => {
  assert.deepEqual(await A.communesAgent(Records.get('SecteurMandataire', secteur.id)), ['Lyon']);
  const r = await A.reglageCommunes(MARC);
  assert.equal(r.regle, false);
  assert.deepEqual(r.klocka.map((c) => c.nom), ['Lyon']);
  assert.deepEqual(r.autres.map((c) => c.nom), ['Caluire-et-Cuire', 'Bron']);
});

test('le mandataire coche Bron : Lyon d\'abord, puis Bron ; ni Caluire, ni une ville hors secteur, ni Lyon décochable', async () => {
  const r = await A.choisirCommunes(MARC, ['69029', '33063', 'Nice']);
  assert.equal(r.ok, true);
  assert.equal(r.regle, true);
  assert.deepEqual(Records.get('SecteurMandataire', secteur.id).communes_activite, ['69029']);
  assert.deepEqual(await A.communesAgent(Records.get('SecteurMandataire', secteur.id)), ['Lyon', 'Bron']);
});

test("l'onglet Agent IA : les trouvailles de Caluire (décochée) ne s'affichent plus, elles restent en base", async () => {
  const ici = (ville, n) => {
    const c = Records.create('Cible', { ville, adresse: `${n} rue Test`, enseigne: `Commerce ${n}` });
    return Records.create('TrouvailleAgent', { mandataire_email: MARC.email, cible_id: c.id, statut: 'nouvelle', raison: 'test', trouve_le: new Date().toISOString(), investisseurs: [{ reference: 'J.B.' }] });
  };
  ici('Lyon', 1); ici('Bron', 2); ici('Caluire-et-Cuire', 3);
  const v = await A.vueAgent(MARC);
  assert.deepEqual(v.trouvailles.map((t) => [t.ville, t.groupe]).sort(), [['Bron', 'activite'], ['Lyon', 'klocka']]);
  assert.equal(v.trouvailles.find((t) => t.ville === 'Bron').investisseurs.length, 0, 'les investisseurs Klocka seulement dans les villes Klocka');
  assert.deepEqual(v.cherche, { klocka: ['Lyon'], activite: ['Bron'], regle: true });
  assert.equal(Records.list('TrouvailleAgent').length, 3);
});

test("Data-B : l'arrondissement au code postal, la commune pour le reste, et l'agent écarte un commerce d'ailleurs", async () => {
  const M = await import('./mandataire-prospective.js');
  assert.equal(M.baseCommune('LYON 5EME'), 'LYON');
  assert.equal(M.baseCommune('MARSEILLE CEDEX 08'), 'MARSEILLE');
  assert.equal(M.arrondissementDe('69005'), 'Lyon 5e');
  assert.equal(M.arrondissementDe('69001'), 'Lyon 1er');
  assert.equal(M.arrondissementDe('75116'), 'Paris 16e');
  assert.equal(M.arrondissementDe('13015'), 'Marseille 15e');
  assert.equal(M.arrondissementDe('69100'), null);
  Records.create('Ville', { nom: 'Lyon', rues: [] });
  const a = await M.cibleDepuisDataB({ ville: 'LYON 5EME', code_postal: '69005', adresse: '59 MONT DE CHOULANS', nom: 'X', siret: '1', lat: 45.75, lon: 4.81 }, { villeNom: 'Lyon', horsCommune: 'ignorer' });
  assert.equal(a.ok, true);
  assert.equal(a.cible.ville, 'Lyon');
  assert.equal(a.cible.arrondissement, 'Lyon 5e');
  const b = await M.cibleDepuisDataB({ ville: 'MARSEILLE', code_postal: '13015', adresse: '39 RUE DE LYON', nom: 'SR', siret: '2', lat: 45.75, lon: 4.83 }, { villeNom: 'Lyon', horsCommune: 'ignorer' });
  assert.equal(b.ok, false);
  assert.equal(b.hors, true);
  assert.equal(Records.list('Ville').filter((v) => /lyon e|marseille/i.test(v.nom)).length, 0, 'ni « Lyon Eme » ni Marseille créées');
});

test('les budgets : 450 k€, 1,7 M€', () => {
  assert.equal(A.montantCourt(450000), '450 k€');
  assert.equal(A.montantCourt(1700000), '1,7 M€');
  assert.equal(A.montantCourt(2000000), '2 M€');
  assert.equal(A.montantCourt(null), null);
});

test("une fiche d'un ancien export Data-B, sans commerce, retrouve le sien à l'ouverture de la liste", async () => {
  const L = await import('./mandataire-lancement.js');
  const liste = Records.create('ListeMandataire', { mandataire_email: MARC.email, nom: 'Boucherie Lyon' });
  const f = Records.create('ProprietaireMandataire', { mandataire_email: MARC.email, liste_id: liste.id, commerce: 'AU BON STEAK', activite: 'MONSIEUR DIDIER DUGELAY', ville: 'LYON', adresse: '24 RUE DE LA MARTINIERE', cible_id: null, datab: { lat: 45.768, lon: 4.83 } });
  const r = L.completerProprietairesListe(liste.id, MARC);
  assert.ok(r.lancees >= 1);
  for (let i = 0; i < 50 && !Records.get('ProprietaireMandataire', f.id).cible_id; i += 1) await new Promise((ok) => setTimeout(ok, 50));
  const apres = Records.get('ProprietaireMandataire', f.id);
  assert.ok(apres.cible_id, 'le commerce est rattaché');
  assert.notEqual(apres.activite, 'MONSIEUR DIDIER DUGELAY', "le nom de la société n'est plus l'activité");
});
