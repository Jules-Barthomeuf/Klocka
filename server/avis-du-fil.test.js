// L'avis lit tout le fil du bien (1er nov. 2026, Jules : « pour pas que ça me repose les mêmes questions »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-avis-fil-'));
const F = await import('./avis-du-fil.js');
const { essentielsManquants } = await import('./mandataire-avis.js');
const { choisirPhotoDeVille } = await import('./photo-commerce.js');

const fil = [
  { role: 'user', contenu: 'Appel au propriétaire : le loyer est de 2 000 € par mois.' },
  { role: 'assistant', contenu: 'Noté.' },
  { role: 'user', contenu: '' },
  { role: 'user', contenu: 'Visite faite, 85 m², bail jusqu’en 2031.' },
];

test('le fil se lit dans l’ordre, la fiche avant, les messages vides écartés', () => {
  const t = F.texteDuBien({ commerce: 'Boulangerie', nom: 'SCI du Port', historique: [{ le: '2026-10-01', texte: 'Appelé' }] }, fil);
  assert.match(t, /^Fiche : Boulangerie/);
  assert.ok(t.indexOf('2 000 €') < t.indexOf('85 m²'));
  assert.equal(t.split('\n').filter((l) => /^Mandataire : $/.test(l)).length, 0);
});

test('trop long, il garde le plus récent', () => {
  const lignes = Array.from({ length: 100 }, (_, i) => `ligne ${i} ${'x'.repeat(50)}`);
  const t = F.borne(lignes, 600);
  assert.ok(t.includes('ligne 99') && !t.includes('ligne 0 '));
});

test('les réponses lues : clés connues, valeurs dites seulement', () => {
  assert.deepEqual(F.reponsesLues({ loyer_annuel_hc: 24000, echeance: 'nc', inconnue: 'x', surface_utile: null, rang_rue: 'n1' }, ['loyer_annuel_hc', 'echeance', 'surface_utile', 'rang_rue']), { loyer_annuel_hc: 24000, rang_rue: 'n1' });
});

test('le modèle reçoit tout le fil, et rien sans rien à lire', async () => {
  let vu = '';
  const lu = await F.lireLeBien({ p: { commerce: 'Boulangerie' }, messages: fil, cles: { loyer_annuel_hc: 'Loyer annuel' }, invoke: async ({ prompt }) => { vu = prompt; return { loyer_annuel_hc: 24000 }; } });
  assert.deepEqual(lu, { loyer_annuel_hc: 24000 });
  assert.match(vu, /2 000 € par mois/);
  assert.deepEqual(await F.lireLeBien({ p: null, messages: [], cles: { x: 'x' }, invoke: async () => ({ x: 'y' }) }), {});
});

test('l’essentiel pour rédiger : loué, des murs de commerce', () => {
  assert.deepEqual(essentielsManquants({ type_bien: 'murs_commerce', occupe: true, adresse: '2 quai, Mâcon', surface_utile: 85, loyer_annuel_hc: 24000 }), ['echeance', 'rang_rue', 'taux_base']);
  assert.deepEqual(essentielsManquants({ type_bien: 'immeuble', occupe: false, adresse: 'x', surface_utile: 300 }), []);
});

test('la photo d’une ville : la première en paysage assez grande', () => {
  assert.equal(choisirPhotoDeVille([{ name: 'a', widthPx: 900, heightPx: 600 }, { name: 'b', widthPx: 3000, heightPx: 4000 }, { name: 'c', widthPx: 4000, heightPx: 3000 }]).name, 'c');
  assert.equal(choisirPhotoDeVille([{ name: 'a', widthPx: 900, heightPx: 1200 }]).name, 'a');
  assert.equal(choisirPhotoDeVille([]), null);
});

test('l’avis ouvert depuis le bien reprend ce que dit le fil ; un taux à valider n’apprend rien', async () => {
  const { Records } = await import('./db.js');
  const A = await import('./mandataire-avis.js');
  const { rejoindreLeFil } = await import('./fil-du-bien.js');
  const lea = { email: 'lea@kpartners.fr', role: 'mandataire' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: lea.email, commerce: 'Boulangerie du Port', adresse: '2 quai Lamartine', ville: 'Mâcon', statut: 'rdv_pris' });
  rejoindreLeFil(lea, p.id, fil);
  let lu = '';
  const r = await A.avisDepuisLeBien({ proprietaire_id: p.id, lireLeFil: async ({ prompt }) => { lu = prompt; return { loyer_annuel_hc: 24000, surface_utile: 85, echeance: '2031', adresse: 'ailleurs' }; } }, lea);
  assert.equal(r.ok, true);
  assert.match(lu, /2 000 € par mois/, 'tout le fil est relu');
  const e = Records.get('EstimationMandataire', r.estimation_id);
  assert.equal(e.de_la_visite.reponses.loyer_annuel_hc, 24000);
  assert.equal(e.de_la_visite.reponses.adresse, '2 quai Lamartine, Mâcon', 'l’adresse de la fiche reste');
  // Le oui : seules les questions essentielles restent.
  Records.update('EstimationMandataire', e.id, { questionnaire_en_cours: true });
  const oui = A.confirmerLaVisite(e, lea);
  assert.match(oui.texte, /rang n°1|n°1/);
  assert.doesNotMatch(oui.texte, /indexation|façade/i);
  // Un taux posé pour rédiger, pas encore validé : pas de TauxBaseValide ; validé ensuite : gardé.
  A.noter({ taux_base: 6.5, taux_base_a_valider: true }, lea);
  assert.equal(Records.list('TauxBaseValide').length, 0);
  A.noter({ taux_base: 6.75 }, lea);
  assert.equal(Records.list('TauxBaseValide').length, 1);
  assert.equal(Records.get('EstimationMandataire', e.id).questionnaire.taux_base_a_valider, false);
});

test('les photos de la ville au choix, et la couverture choisie', async () => {
  const { choisirPhotosDeVille } = await import('./photo-commerce.js');
  const { Records } = await import('./db.js');
  const A = await import('./mandataire-avis.js');
  assert.deepEqual(choisirPhotosDeVille([{ name: 'p', widthPx: 800, heightPx: 1200 }, { name: 'a', widthPx: 4000, heightPx: 3000 }, { name: 'b', widthPx: 3000, heightPx: 2000 }], 2).map((p) => p.name), ['a', 'b']);
  const lea = { email: 'lea@kpartners.fr', role: 'mandataire' };
  const e = Records.create('EstimationMandataire', { mandataire_email: lea.email, bien: 'Test', avis: { photos: { ville: '/uploads/commerces/a.jpg' } } });
  assert.equal(A.poserPhotoDeCouverture(e.id, 'https://ailleurs.com/x.jpg', lea).ok, false, 'seulement une photo gardée par le serveur');
  assert.equal(A.poserPhotoDeCouverture(e.id, '/uploads/commerces/b.jpg', { email: 'autre@kpartners.fr' }).ok, false);
  assert.equal(A.poserPhotoDeCouverture(e.id, '/uploads/commerces/b.jpg', lea).ok, true);
  assert.equal(Records.get('EstimationMandataire', e.id).avis.photos.couverture, '/uploads/commerces/b.jpg');
});
