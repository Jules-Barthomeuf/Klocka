// Les liens du locataire (25 nov. 2026) : Pappers d'après le SIREN, le site et les réseaux d'après une recherche web dont
// seules les adresses vues sont gardées.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-liens-locataire-'));
const { Records } = await import('./db.js');
const L = await import('./liens-locataire.js');

test('le SIREN : le projet, le dossier confirmé, le Kbis lu, puis l’outil Locataire', () => {
  assert.equal(L.urlPappers('981167141'), 'https://www.pappers.fr/entreprise/981167141');
  assert.equal(L.urlPappers('123'), null);
  assert.equal(L.sirenDuLocataire({ siren_locataire: '111222333' }), '111222333');
  Records.create('Deal', { deal_id: 'LL1', lots: [{ lot: {}, locataire_siren: '444555666' }] });
  assert.equal(L.sirenDuLocataire({ deal_id: 'LL1' }), '444555666');
  Records.create('Deal', { deal_id: 'LL2', lots: [{ lot: {} }] });
  const analyse = { grilles: [{ id: 'kbis', lignes: [{ id: 'immatriculation', valeur: 'RCS Lyon 981 167 141' }] }] };
  assert.equal(L.sirenDuLocataire({ deal_id: 'LL2' }, { analyse }), '981167141');
  Records.create('LancementOutil', { deal_id: 'LL2', outil: 'locataire', statut: 'fini', fini_le: '2026-11-20', resultat: { points: [{ cle: 'societe', detail: { siren: '777888999' } }] } });
  assert.equal(L.sirenDuLocataire({ deal_id: 'LL2' }), '777888999');
  assert.equal(L.sirenDuLocataire({}), null);
});

test('les liens gardés sont ceux que la recherche a vus, chacun sur son réseau', () => {
  const texte = [
    'site_web : https://www.lecomptoir-lyon.fr/menu',
    'instagram : https://www.instagram.com/lecomptoirlyon/',
    'facebook : https://www.facebook.com/inventee',
    'linkedin : https://www.instagram.com/pas-linkedin',
    'tripadvisor : https://www.tripadvisor.fr/Restaurant_Review-g187265-Le_Comptoir.html.',
  ].join('\n');
  const sources = [
    { url: 'https://www.lecomptoir-lyon.fr/' },
    { url: 'https://www.instagram.com/lecomptoirlyon' },
    { url: 'https://www.instagram.com/pas-linkedin' },
    { url: 'https://www.tripadvisor.fr/Restaurant_Review-g187265-Le_Comptoir.html' },
  ];
  assert.deepEqual(L.liensDeLaReponse(texte, sources), [
    { type: 'site_web', url: 'https://www.lecomptoir-lyon.fr/menu', label: 'Site web' },
    { type: 'instagram', url: 'https://www.instagram.com/lecomptoirlyon', label: 'Instagram' },
    { type: 'tripadvisor', url: 'https://www.tripadvisor.fr/Restaurant_Review-g187265-Le_Comptoir.html', label: 'TripAdvisor' },
  ]);
  assert.deepEqual(L.liensDeLaReponse('site_web : https://www.pappers.fr/entreprise/x', [{ url: 'https://www.pappers.fr/entreprise/x' }]), [], 'un annuaire n’est pas le site');
});

test('la recherche rend le SIREN et les liens ; sans nom de locataire, rien ne part', async () => {
  const chercher = async () => ({ final: 'instagram : https://instagram.com/x', sources: [{ url: 'https://instagram.com/x' }] });
  const r = await L.chercherLiens({ id: 'p', nom_locataire: 'X', siren_locataire: '111222333' }, { chercher });
  assert.deepEqual(r, { ok: true, siren: '111222333', liens: [{ type: 'instagram', url: 'https://instagram.com/x', label: 'Instagram' }] });
  assert.equal((await L.chercherLiens({ id: 'p' }, { chercher })).ok, false);
  assert.equal(L.fusionnerLiens([{ type: 'instagram', url: 'https://instagram.com/a' }], [{ type: 'instagram', url: 'https://instagram.com/b' }, { type: 'facebook', url: 'https://facebook.com/a' }]).length, 2);
});

test('sans SIREN connu, la recherche demande aussi la fiche Pappers ; avec, elle ne la garde pas', async () => {
  assert.match(L.consigneLiens({ nom: 'X', avecPappers: true }), /pappers/);
  assert.doesNotMatch(L.consigneLiens({ nom: 'X' }), /pappers/);
  const chercher = async () => ({ final: 'pappers : https://www.pappers.fr/entreprise/sas-x-981167141', sources: [{ url: 'https://www.pappers.fr/entreprise/sas-x-981167141' }] });
  assert.deepEqual((await L.chercherLiens({ id: 'p', nom_locataire: 'X' }, { chercher })).liens.map((l) => l.type), ['pappers']);
  assert.deepEqual((await L.chercherLiens({ id: 'p', nom_locataire: 'X', siren_locataire: '111222333' }, { chercher })).liens, []);
});

test('la fiche de la société : le SIREN d’un lien Pappers, et ce que l’aperçu montre', () => {
  assert.equal(L.sirenDuLocataire({ liens_locataire: [{ type: 'pappers', url: 'https://www.pappers.fr/entreprise/klocka-932230394' }] }), '932230394');
  const f = L.ficheDeSociete({
    siren: '932230394', nom: 'KLOCKA', forme: 'SAS', active: true, creation: '14/08/2024', activite_code: '68.31Z', effectif_societe: '01',
    siege: { adresse: '229 RUE SAINT-HONORE 75001 PARIS' }, dirigeants: [{ nom: 'PDZ CAPITAL' }, { nom: 'SAS MDI' }],
  }, { libelleActivite: (c) => (c === '68.31Z' ? 'Agences immobilières' : null), tranches: { '01': '1 ou 2 salariés' } });
  assert.deepEqual(f, {
    siren: '932230394', nom: 'KLOCKA', forme: 'SAS', active: true, creation: '14/08/2024', adresse: '229 RUE SAINT-HONORE 75001 PARIS',
    activite: 'Agences immobilières', activite_code: '68.31Z', effectif: '1 ou 2 salariés', dirigeants: ['PDZ CAPITAL', 'SAS MDI'],
    pappers: 'https://www.pappers.fr/entreprise/932230394',
  });
  assert.equal(L.ficheDeSociete(null), null);
});


test('les pages trouvées d’office : cherchées une fois par projet, gardées même vides ; le client ne lance rien', async () => {
  const p = Records.create('Project', { titre: 'KFC', nom_locataire: 'KFC', adresse_complete: '12 rue de la République, 69002 Lyon' });
  let appels = 0;
  const chercher = async () => { appels++; return { final: 'instagram : https://instagram.com/kfc', sources: [{ url: 'https://instagram.com/kfc' }] }; };
  assert.deepEqual((await L.liensTrouves(p, { lancer: false, chercher })).liens, [], 'le client ne lance pas la recherche');
  assert.equal(appels, 0);
  const r = await L.liensTrouves(p, { chercher });
  assert.deepEqual(r.liens.map((l) => l.type), ['instagram']);
  await L.liensTrouves(p, { chercher });
  assert.equal(appels, 1, 'gardé : pas de seconde recherche');
  assert.deepEqual(L.liensTrouvesGardes(p).liens.map((l) => l.url), ['https://instagram.com/kfc']);
  assert.equal(L.liensTrouvesGardes({ ...p, nom_locataire: 'Autre' }), null, 'un autre nom : rien de gardé');
});

test('les avis Google : la note et la répartition lues sur la fiche, gardées ; le client ne lance rien', async () => {
  const libelles = [' étoiles', '4,5 étoiles ', '5 étoiles, 1 724 avis', '4 étoiles, 227 avis', '3 étoiles, 59 avis', '2 étoiles, 49 avis', '1 étoiles, 146 avis', '4,5 étoiles', '2 étoiles'];
  assert.deepEqual(L.lireAvisGoogle(libelles), { note: 4.5, total: 2205, repartition: [{ etoiles: 5, avis: 1724 }, { etoiles: 4, avis: 227 }, { etoiles: 3, avis: 59 }, { etoiles: 2, avis: 49 }, { etoiles: 1, avis: 146 }] });
  assert.equal(L.lireAvisGoogle(['4,5 étoiles']), null, 'sans répartition, rien');
  const p = Records.create('Project', { titre: 'KFC', nom_locataire: 'KFC', adresse_complete: '12 rue de la République, 69002 Lyon' });
  let lectures = 0;
  const lire = async (q) => { lectures++; assert.equal(q, 'KFC, 12 rue de la République, 69002 Lyon'); return { libelles, titre: 'KFC LYON RÉPUBLIQUE', url: 'https://www.google.com/maps/place/x' }; };
  assert.equal((await L.avisGoogle(p, { lancer: false, lire })).avis, null);
  const r = await L.avisGoogle(p, { lire });
  assert.deepEqual([r.avis.note, r.avis.total, r.avis.nom, r.avis.url], [4.5, 2205, 'KFC LYON RÉPUBLIQUE', 'https://www.google.com/maps/place/x']);
  await L.avisGoogle(p, { lire });
  assert.equal(lectures, 1);
  assert.equal(L.avisGoogleGarde(p).total, 2205);
});
