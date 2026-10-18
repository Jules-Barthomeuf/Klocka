// L'onglet Bien du module d'analyse : les lignes, leurs sources et leurs statuts, calculés par le code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lignesBien, apres, nomPropre, nomCourt } from './bien-analyse.js';

const champ = (valeur) => ({ valeur, absent: false });
const lot = { adresse: champ({ rue: '14 rue Cheverus', code_postal: '33000', ville: 'Bordeaux' }), type_actif: champ('Boutique en rez-de-chaussée'), surface_m2: champ(52), prix_fai: champ(230000), loyer_annuel_ht_hc: champ(18000) };
const bail = { document_nom: 'Bail ADG.pdf', categorie: 'Bail commercial', document_id: 'b1', cellules: {
  surface: { reponse: '48 m²', page: 3 },
  parties: { reponse: 'Bailleur : SCI Cheverus, au capital de 1 000 €. Preneur : ADG SARL, capital de 5 000 €, RCS Bordeaux', page: 1 },
  destination: { reponse: '« Coiffure, barbier » — destination stricte', page: 4 },
} };
const tf = { document_nom: 'TF 2025.pdf', categorie: 'Taxe foncière', cellules: { parties: { reponse: 'Propriétaire : SCI CHEVERUS, débiteur légal', page: 1 }, taxe_fonciere: { reponse: '1 240 €', page: 1 } } };
const dpe = { document_nom: 'DPE.pdf', categorie: 'Diagnostics', cellules: { surface: { reponse: '48,0 m²', page: 1 } } };

test('la maquette ADG : surface signalée (52 contre 48), vendeur identique, taxe foncière, rendement OK', () => {
  const l = Object.fromEntries(lignesBien({ lot, lignes: [bail, tf, dpe] }).map((x) => [x.id, x]));
  assert.equal(l.adresse.statut, 'info');
  assert.match(l.adresse.valeur, /14 rue Cheverus, 33000 Bordeaux/);
  assert.equal(l.surface.statut, 'signale');
  assert.match(l.surface.motif, /Écart de 8 % entre 48 m² et 52 m²/);
  assert.deepEqual(l.surface.sources.map((s) => s.libelle), ['Fiche p. 1', 'Bail p. 3', 'DPE p. 1']);
  assert.equal(l.surface.par_document.length, 3);
  assert.equal(l.prix.valeur, '230 000 € FAI · honoraires non précisés');
  assert.equal(l.rendement.valeur, '7,8 % (18 000 € / 230 000 €)');
  assert.equal(l.rendement.statut, 'ok');
  assert.equal(l.vendeur.statut, 'ok');
  assert.match(l.vendeur.valeur, /même nom sur l'avis de taxe foncière et le bail/);
  assert.equal(l.taxe_fonciere.valeur, '1 240 €');
  assert.equal(l.locataire.valeur, 'ADG SARL, capital 5 000 €');
  assert.equal(l.procedure.statut, 'non_trouve');
});

test('une surface retenue lève le signalement ; un rendement sous 5 % bloque ; une procédure collective bloque', () => {
  const l = Object.fromEntries(lignesBien({ lot: { ...lot, prix_fai: champ(400000) }, lignes: [bail, dpe, { document_nom: 'Kbis.pdf', categorie: 'Kbis', cellules: { procedures: { reponse: 'Redressement judiciaire ouvert le 02/02/2026' } } }], retenues: { surface: { valeur: '48 m²' } } }).map((x) => [x.id, x]));
  assert.equal(l.surface.statut, 'info');
  assert.equal(l.surface.valeur, '48 m² (retenue)');
  assert.equal(l.rendement.statut, 'bloquant');
  assert.equal(l.procedure.statut, 'bloquant');
});

test('des noms de vendeur différents se signalent', () => {
  const autre = { ...tf, cellules: { parties: { reponse: 'Propriétaire : M. Dupont Jean', page: 2 } } };
  const l = lignesBien({ lot, lignes: [bail, autre] }).find((x) => x.id === 'vendeur');
  assert.equal(l.statut, 'signale');
});

test('petits outils', () => {
  assert.equal(apres('Bailleur : SAS X IMMO, capital 100 €', 'bailleur'), 'SAS X IMMO');
  assert.equal(nomPropre('SAS ASSJ42 IMMOBILIER'), nomPropre('SASU ASSJ42 Immobilier'));
  assert.equal(nomCourt({ document_nom: 'avenantbail1et2.pdf', categorie: 'Avenants' }), 'Avenant');
});
