// Les présentations bancaires : créées depuis un projet, gardées en
// diapositives éditables, retouchées par l'éditeur et par le chat d'AK, puis
// dessinées en PPTX telles qu'elles sont. Sans réseau ni modèle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-presentations-'));
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.MISTRAL_API_KEY = '';
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const P = await import('./presentation-bancaire.js');
const { rendrePptx } = await import('./presentation-projet.js');
const { executerOutil } = await import('./ak/agent.js');

const JULES = { email: 'jules.b@klocka.immo', role: 'admin', full_name: 'Jules B' };

// Un projet sans adresse : ni géocodage, ni enseignes, ni modèle à appeler.
const projet = Records.create('Project', {
  titre: 'Murs Boulangerie Dupont',
  nom_locataire: 'Dupont',
  activite_locataire: 'Boulangerie',
  sim_loyer_initial_ht: 24000,
  sim_prix_bien_negocie: 360000,
  surface_m2: 80,
  photos: ['/uploads/a.jpg', '/uploads/b.jpg'],
});

/** Les diapositives d'un PPTX, comptées dans le répertoire de l'archive. */
const diapositives = (buffer) => new Set(buffer.toString('latin1').match(/ppt\/slides\/slide\d+\.xml/g)).size;

test('poserChemin pose, ajoute, retire, et refuse un chemin inconnu', () => {
  const d = { id: 'sommaire', type: 'sommaire', titre: 'Sommaire', items: ['A', 'B', 'C'], photo: null };
  assert.equal(P.poserChemin(d, 'titre', 'Plan').diapo.titre, 'Plan');
  assert.deepEqual(P.poserChemin(d, 'items.+', 'D').diapo.items, ['A', 'B', 'C', 'D']);
  assert.deepEqual(P.poserChemin(d, 'items.1', null).diapo.items, ['A', 'C']);
  assert.deepEqual(P.poserChemin(d, 'items.0', 'Z').diapo.items, ['Z', 'B', 'C']);
  assert.equal(P.poserChemin(d, 'masquee', true).diapo.masquee, true);
  assert.equal(P.poserChemin(d, 'items.9', 'X').ok, false);
  assert.equal(P.poserChemin(d, 'inconnu', 'X').ok, false);
  assert.equal(P.poserChemin(d, 'id', 'autre').ok, false);
  assert.deepEqual(d.items, ['A', 'B', 'C'], "l'original ne bouge pas");
});

test('creer_presentation_bancaire : seize diapositives remplies depuis le projet', async () => {
  const r = await executerOutil({ name: 'creer_presentation_bancaire', input: { projet_id: projet.id } }, JULES);
  assert.equal(r.ok, true);
  const p = P.lirePresentation(r.presentation_id);
  assert.deepEqual(p.diapos.map((d) => d.id), ['couverture', 'sommaire', 'ville', 'emplacement', 'quartier', 'local', 'photos', 'bail', 'enseignes', 'marche', 'projection', 'revenus', 'conditions', 'porteur', 'structuration', 'merci']);
  const local = p.diapos.find((d) => d.id === 'local');
  assert.equal(local.heros.grand, '24\u202f000 €');
  assert.equal(local.stats[0].valeur, '300 €');
  assert.equal(p.diapos.find((d) => d.id === 'revenus').lignes.length, 20);
  assert.equal(p.diapos.find((d) => d.id === 'projection').barres.at(-1), 100);
  assert.equal(p.diapos.find((d) => d.id === 'couverture').photo, '/uploads/a.jpg');
  assert.equal(p.diapos.find((d) => d.id === 'couverture').heros.porteur, '[Prénom NOM]');
  assert.deepEqual(p.photos_projet, ['/uploads/a.jpg', '/uploads/b.jpg']);
});

test('modifier_presentation : les changements du chat, appliqués d\'un bloc ou pas du tout', async () => {
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);
  const r = await executerOutil({ name: 'modifier_presentation', input: { presentation_id: id, changements: [
    { diapo: 'couverture', chemin: 'heros.porteur', valeur: 'Jules Barthomeuf' },
    { diapo: 'couverture', chemin: 'heros.banque', valeur: 'Crédit Agricole' },
    { diapo: 'sommaire', chemin: 'items.2', valeur: null },
    { diapo: 'enseignes', chemin: 'masquee', valeur: true },
  ] } }, JULES);
  assert.equal(r.ok, true);
  assert.equal(r.presentation_id, id);
  const p = P.lirePresentation(id);
  assert.equal(p.diapos[0].heros.porteur, 'Jules Barthomeuf');
  assert.equal(p.diapos[0].heros.banque, 'Crédit Agricole');
  assert.equal(p.diapos[1].items.length, 7);
  assert.equal(p.diapos.find((d) => d.id === 'enseignes').masquee, true);

  // Un chemin faux : rien n'est appliqué, l'erreur le dit.
  const faux = P.appliquerChangements(id, [{ diapo: 'couverture', chemin: 'heros.porteur', valeur: 'X' }, { diapo: 'nulle-part', chemin: 'titre', valeur: 'Y' }]);
  assert.equal(faux.ok, false);
  assert.match(faux.error, /nulle-part/);
  assert.equal(P.lirePresentation(id).diapos[0].heros.porteur, 'Jules Barthomeuf');
});

test("l'éditeur remplace une diapositive et change l'ordre, sans changer son type", async () => {
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);
  const avant = P.lirePresentation(id).diapos;
  const merci = { ...avant.at(-1), heros: { ...avant.at(-1).heros, titre: 'Merci beaucoup.' } };
  assert.equal(P.modifierPresentation(id, { diapo: merci }).ok, true);
  assert.equal(P.lirePresentation(id).diapos.at(-1).heros.titre, 'Merci beaucoup.');
  assert.equal(P.modifierPresentation(id, { diapo: { ...merci, type: 'porteur' } }).ok, false);
  const ordre = avant.map((d) => d.id);
  [ordre[1], ordre[2]] = [ordre[2], ordre[1]];
  assert.equal(P.modifierPresentation(id, { ordre }).ok, true);
  assert.equal(P.lirePresentation(id).diapos[1].id, 'ville');
  assert.equal(P.modifierPresentation(id, { ordre: ordre.slice(1) }).ok, false);
});

test('le PPTX dessine le modèle retouché et saute les diapositives masquées', async () => {
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);
  const toutes = await rendrePptx(P.lirePresentation(id).diapos, { titre: 'Essai' });
  assert.equal(diapositives(toutes), 16);
  P.appliquerChangements(id, [{ diapo: 'porteur', chemin: 'masquee', valeur: true }, { diapo: 'couverture', chemin: 'heros.porteur', valeur: 'Prénom Retouché' }]);
  const buffer = await rendrePptx(P.lirePresentation(id).diapos, { titre: 'Essai' });
  assert.equal(diapositives(buffer), 15);
  assert.match(buffer.toString('latin1'), /ppt\/media\//, 'le logo Klocka est dans le PPTX');
  assert.ok(buffer.length > 10000);
});

test('une mise en forme de l\'éditeur (diapo.styles) sort dans le PPTX : masqué, gras, couleur', async () => {
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);
  const avant = (await rendrePptx(P.lirePresentation(id).diapos, { titre: 'Essai' })).toString('latin1');
  assert.match(avant, /Nous restons/, "l'accroche de la dernière diapositive est là");
  const merci = P.lirePresentation(id).diapos.at(-1);
  P.modifierPresentation(id, { diapo: { ...merci, styles: { 'heros.accroche': { masque: true }, 'heros.titre': { gras: true, couleur: '#ABCDEF', taille: 90 } } } });
  const apres = (await rendrePptx(P.lirePresentation(id).diapos, { titre: 'Essai' })).toString('latin1');
  assert.doesNotMatch(apres, /Nous restons/, "l'accroche masquée ne sort pas");
  assert.match(apres, /ABCDEF/, 'la couleur libre est posée');
  // Le chat peut poser des styles d'un bloc ; AK voit ce qui est masqué, pas la mise en forme.
  assert.equal(P.appliquerChangements(id, [{ diapo: 'couverture', chemin: 'styles', valeur: { 'heros.banque': { masque: true } } }]).ok, true);
  const ctx = P.presentationPourAK(id);
  assert.match(ctx, /elements_masques.*heros\.banque/);
  assert.doesNotMatch(ctx, /ABCDEF/);
});

test("ce qu'AK lit de la présentation ouverte : les ids et les champs", async () => {
  const { presentation_id: id } = await P.creerPresentation(projet.id, JULES);
  const ctx = P.presentationPourAK(id);
  assert.match(ctx, /\[couverture\] \(couverture\)/);
  assert.match(ctx, /\[projection\] \(projection\)/);
  assert.match(ctx, /20 lignes/);
  assert.equal(P.presentationPourAK('inconnue'), null);
});
