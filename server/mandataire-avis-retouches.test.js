// Les retouches de l'avis : des opérations appliquées à un document JSON, sans muter.

import test from 'node:test';
import assert from 'node:assert/strict';
import { etapeDeReponse, appliquerOperations, appliquerSurcouche, avisProvisoire, sansChampsRepondus, recalculerChiffres, stylerElement, SECTIONS_AVIS } from './mandataire-avis.js';

const AVIS = () => ({
  version: 1,
  signataire: { nom: 'Jules' },
  description: { resume: 'Un local de 85 m².', lignes: [{ mot: 'Désignation', texte: 'Boutique' }, { mot: 'État', texte: 'Bon' }] },
  locatif: { lignes: [{ mot: 'Loyer', texte: '18 000 €' }, { mot: 'Taxe foncière', texte: 'Refacturée' }, { mot: 'Charges', texte: 'Locataire' }] },
  photos: { couverture: null, emplacement: null },
  conclusion: { points: ['Vérifier le DPE', 'Relire le bail'] },
  methodes: { loyer: 18000, taux: 7.5 },
  chiffres: { valeur: 240000, bas: 192000, haut: 288000, honoraires_pct: 5, frais_pct: 7.5, prix_affiche: 252000 },
  libre: { c_resume: 'La valeur est estimée à 240 000 €.', redige: 'Jules' },
});

test('poser remplace un texte sans toucher au reste', () => {
  const avant = AVIS();
  const { avis, faits } = appliquerOperations(avant, [{ op: 'poser', chemin: 'description.resume', valeur: 'Un local de 85 m² en angle.' }]);
  assert.equal(avis.description.resume, 'Un local de 85 m² en angle.');
  assert.equal(avant.description.resume, 'Un local de 85 m².', 'pas de mutation');
  assert.deepEqual(faits, [{ op: 'poser', chemin: 'description.resume' }]);
});

test('poser un chiffre recalcule le prix affiché et efface les phrases qui le citaient', () => {
  const { avis } = appliquerOperations(AVIS(), [{ op: 'poser', chemin: 'chiffres.valeur', valeur: '260 000 €' }]);
  assert.equal(avis.chiffres.valeur, 260000);
  assert.equal(avis.chiffres.prix_affiche, 273000);
  assert.equal(avis.chiffres.rendement, 6.9);
  assert.equal(avis.libre.c_resume, undefined);
  assert.equal(avis.libre.redige, 'Jules');
});

test('la signature et les photos sont protégées', () => {
  const { avis, faits } = appliquerOperations(AVIS(), [{ op: 'poser', chemin: 'signataire.nom', valeur: 'X' }]);
  assert.equal(avis.signataire.nom, 'Jules');
  assert.match(faits[0].refus, /protégé/);
});

test('supprimer, inserer et deplacer travaillent sur les listes', () => {
  let { avis } = appliquerOperations(AVIS(), [{ op: 'supprimer', chemin: 'description.lignes.0' }]);
  assert.deepEqual(avis.description.lignes.map((l) => l.mot), ['État']);
  ({ avis } = appliquerOperations(avis, [{ op: 'inserer', chemin: 'description.lignes', index: 0, valeur_objet: { mot: 'Façade', texte: '6 m' } }]));
  assert.deepEqual(avis.description.lignes.map((l) => l.mot), ['Façade', 'État']);
  ({ avis } = appliquerOperations(avis, [{ op: 'inserer', chemin: 'conclusion.points', valeur: 'Demander le règlement' }]));
  assert.equal(avis.conclusion.points.at(-1), 'Demander le règlement');
  ({ avis } = appliquerOperations(avis, [{ op: 'deplacer', chemin: 'conclusion.points', de: 2, vers: 0 }]));
  assert.equal(avis.conclusion.points[0], 'Demander le règlement');
  const { faits } = appliquerOperations(avis, [{ op: 'supprimer', chemin: 'description.resume.4' }]);
  assert.match(faits[0].refus, /liste/);
});

test("l'ordre des sections et les sections masquées", () => {
  let { avis } = appliquerOperations(AVIS(), [{ op: 'ordre_sections', sections: ['marche', 'methodes', 'inconnue'] }]);
  assert.equal(avis.ordre[0], 'marche');
  assert.equal(avis.ordre.length, SECTIONS_AVIS.length, 'les sections oubliées suivent');
  ({ avis } = appliquerOperations(avis, [{ op: 'masquer_section', section: 'juridique' }, { op: 'masquer_section', section: 'conclusion' }]));
  assert.deepEqual(avis.masquees, ['juridique']);
  ({ avis } = appliquerOperations(avis, [{ op: 'masquer_section', section: 'juridique', masquee: false }]));
  assert.deepEqual(avis.masquees, []);
});

test('recalculerChiffres laisse un avis sans valeur tel quel', () => {
  const a = { chiffres: { valeur: null }, libre: { c_x: 'y' } };
  assert.equal(recalculerChiffres(a), a);
});

test('appliquerOperations : une section ne se remplace pas par un texte, un supprimer sans chemin se refuse en français', async () => {
  const base = { chiffres: { valeur: 100000, honoraires_pct: 5, frais_pct: 7.5 }, locatif: { lignes: [] } };
  const { avis, faits } = appliquerOperations(base, [
    { op: 'poser', chemin: 'chiffres', valeur: 'beaucoup' },
    { op: 'supprimer' },
    { op: 'poser', chemin: 'chiffres.valeur', valeur: '120 000' },
  ]);
  assert.equal(typeof avis.chiffres, 'object', 'la section chiffres reste un objet');
  assert.match(faits[0].refus, /section/);
  assert.match(faits[1].refus, /chemin/);
  assert.doesNotMatch(faits[1].refus, /Cannot|undefined/, 'le refus se dit en français');
  assert.equal(avis.chiffres.valeur, 120000, 'le champ, lui, se pose');
});

test('styler : taille relative au modèle, palette ou hex, retour au modèle', () => {
  let { avis, faits } = appliquerOperations(AVIS(), [
    { op: 'styler', chemin: 'demandeur', style: { taille_delta: 2, gras: true } },
    { op: 'styler', chemin: 'chiffres.valeur', style: { couleur: 'menthe' } },
    { op: 'styler', chemin: 'date', style: { couleur: 'fuchsia', aligner: 'center' } },
  ]);
  assert.deepEqual(avis.styles.demandeur, { taille: 11, gras: true });
  assert.deepEqual(avis.styles['chiffres.valeur'], { couleur: 'menthe' });
  assert.deepEqual(avis.styles.date, { aligner: 'center' }, 'une couleur inconnue est ignorée');
  assert.equal(faits.filter((f) => !f.refus).length, 3);
  ({ avis } = appliquerOperations(avis, [{ op: 'styler', chemin: 'demandeur', style: { taille_delta: -1, gras: false } }]));
  assert.deepEqual(avis.styles.demandeur, { taille: 10 });
  ({ avis } = appliquerOperations(avis, [{ op: 'styler', chemin: 'demandeur', reinitialiser: true }]));
  assert.equal(avis.styles.demandeur, undefined);
  assert.equal(stylerElement({}, 'x', { couleur: '#1A2B3C' }).couleur, '#1A2B3C');
  assert.equal(stylerElement({ gras: true }, 'x', { gras: false }), null, 'plus rien : retour au modèle');
  ({ faits } = appliquerOperations(avis, [{ op: 'styler', chemin: 'section.cadre', style: { gras: true } }]));
  assert.match(faits[0].refus, /chemin/);
});

test('positionner : un décalage en millimètres, borné, et le retour en place', () => {
  let { avis, faits } = appliquerOperations(AVIS(), [
    { op: 'positionner', cle: 'couverture:bloc.logo', dx_mm: -10, dy_mm: 5.3 },
    { op: 'positionner', cle: 'cadre:chiffres.valeur', x_mm: 900 },
    { op: 'positionner', cle: 'logo', dx_mm: 3 },
  ]);
  assert.deepEqual(avis.positions['couverture:bloc.logo'], { x: -10, y: 5.5 });
  assert.deepEqual(avis.positions['cadre:chiffres.valeur'], { x: 250, y: 0 });
  assert.match(faits[2].refus, /page:chemin/);
  ({ avis } = appliquerOperations(avis, [{ op: 'positionner', cle: 'couverture:bloc.logo', dx_mm: 10, dy_mm: -5.5 }]));
  assert.equal(avis.positions['couverture:bloc.logo'], undefined, 'revenu à zéro : plus de décalage');
  ({ avis } = appliquerOperations(avis, [{ op: 'positionner', cle: 'cadre:chiffres.valeur', reinitialiser: true }]));
  assert.deepEqual(avis.positions, {});
});

test("supprimer par l'intitulé : « enlève la taxe foncière »", () => {
  let { avis, faits } = appliquerOperations(AVIS(), [{ op: 'supprimer', chemin: 'locatif.lignes', mot: 'taxe fonciere' }]);
  assert.deepEqual(avis.locatif.lignes.map((l) => l.mot), ['Loyer', 'Charges']);
  assert.deepEqual(faits, [{ op: 'supprimer', chemin: 'locatif.lignes.1' }]);
  ({ faits } = appliquerOperations(avis, [{ op: 'supprimer', chemin: 'locatif.lignes', mot: 'Dépôt' }]));
  assert.match(faits[0].refus, /aucune ligne/);
  ({ avis } = appliquerOperations(avis, [{ op: 'supprimer', chemin: 'conclusion.points', mot: 'Relire le bail' }]));
  assert.deepEqual(avis.conclusion.points, ['Vérifier le DPE']);
});

test('photo : une image jointe se pose, se retire ; sans image, refus', () => {
  let { avis, faits } = appliquerOperations(AVIS(), [
    { op: 'photo', cle: 'emplacement', url: '/uploads/facade.jpg' },
    { op: 'photo', cle: 'couverture' },
    { op: 'photo', cle: 'logo', url: '/uploads/x.png' },
  ]);
  assert.equal(avis.photos.emplacement, '/uploads/facade.jpg');
  assert.equal(avis.photos.couverture, null);
  assert.match(faits[1].refus, /image jointe/);
  assert.match(faits[2].refus, /couverture, emplacement ou portrait/);
  ({ avis } = appliquerOperations(avis, [{ op: 'photo', cle: 'emplacement', retirer: true }]));
  assert.equal(avis.photos.emplacement, null);
});

test('styler : les réglages avancés sont bornés et nommés', () => {
  const st = stylerElement({}, 'bloc.photo.emplacement', { police: 'serif', interligne: 9, espacement: 0.052, opacite: 60, fond: 'sauge', bordure: 'fine', bordure_couleur: 'rose', arrondi: 3.3, largeur: 150, hauteur_mm: 90, rotation: -5, ombre: true, masque: true, majuscules: true });
  assert.deepEqual(st, { police: 'serif', espacement: 0.05, opacite: 60, fond: 'sauge', bordure: 'fine', arrondi: 3.5, hauteur_mm: 90, rotation: -5, ombre: true, masque: true, majuscules: true });
  assert.equal(stylerElement(st, 'x', { masque: false, police: 'modele', bordure: 'aucune', fond: null }).fond, undefined);
  assert.equal(stylerElement(st, 'x', { masque: false, police: 'modele', bordure: 'aucune' }).masque, undefined);
});

test("avisProvisoire : l'avis se remplit avec les réponses, les chiffres attendent", () => {
  const vide = avisProvisoire({ adresse: '1 avenue Mirabeau, Nice' });
  assert.equal(vide.provisoire, true);
  assert.equal(vide.bien.rue, '1 avenue Mirabeau, Nice');
  assert.equal(vide.demandeur, null);
  assert.equal(vide.locatif, null);
  assert.equal(vide.chiffres.valeur, null);
  const a = avisProvisoire({ questionnaire: { type_bien: 'murs_commerce', occupe: true, adresse: '1 avenue Mirabeau, Nice', demandeur: 'SCI SAPI', surface_utile: 32, loyer_annuel_hc: 24000, locataire: 'Cookiestelier', echeance: '30/04/2032', date_visite: '29 août 2026' } }, { nom: 'Jules' });
  assert.equal(a.demandeur, 'SCI SAPI');
  assert.equal(a.cadre.visite, 'Réalisée le 29 août 2026');
  assert.match(a.cadre.bien, /occupé, 1 avenue Mirabeau/);
  assert.deepEqual(a.locatif.lignes.map((l) => l.mot), ['Locataire', 'Échéance', 'Loyer']);
  assert.match(a.locatif.lignes[2].texte, /24\s000 € HT HC par an, soit 750 €\/m²/);
  assert.equal(a.methodes.loyer, 24000);
  assert.equal(a.signataire.nom, 'Jules');
});

test("la surcouche : les retouches d'avant la rédaction se reposent, la ligne par son intitulé", () => {
  const sc = {
    chemins: { demandeur: 'SCI du Port', 'locatif.lignes.@Taxe foncière.texte': 'À la charge du bailleur', 'libre.redige': 'J. B.', 'signataire.nom': 'X' },
    styles: { demandeur: { gras: true } },
    photos: { emplacement: '/uploads/f.jpg' },
  };
  const a = appliquerSurcouche(AVIS(), sc);
  assert.equal(a.demandeur, 'SCI du Port');
  assert.equal(a.locatif.lignes[1].texte, 'À la charge du bailleur');
  assert.equal(a.libre.redige, 'J. B.');
  assert.equal(a.signataire.nom, 'Jules', 'la signature reste protégée');
  assert.deepEqual(a.styles.demandeur, { gras: true });
  assert.equal(a.photos.emplacement, '/uploads/f.jpg');
  // La ligne a changé de place : son intitulé la retrouve quand même.
  const autre = { ...AVIS(), locatif: { lignes: [{ mot: 'Taxe foncière', texte: 'Refacturée' }] } };
  assert.equal(appliquerSurcouche(autre, sc).locatif.lignes[0].texte, 'À la charge du bailleur');
  // Le chat renseigne le demandeur : sa réponse l'emporte sur la retouche.
  assert.equal(sansChampsRepondus(sc, ['demandeur']).chemins.demandeur, undefined);
  assert.equal(sansChampsRepondus(sc, ['loyer_annuel_hc']), sc);
});

test("la surcouche rejoue les retouches de l'atelier faites avant la rédaction", () => {
  const sc = { chemins: { demandeur: 'SCI du Port' }, operations: [{ op: 'supprimer', chemin: 'locatif.lignes', mot: 'Charges' }, { op: 'styler', chemin: 'demandeur', style: { couleur: 'menthe' } }] };
  const a = appliquerSurcouche(AVIS(), sc);
  assert.deepEqual(a.locatif.lignes.map((l) => l.mot), ['Loyer', 'Taxe foncière']);
  assert.deepEqual(a.styles.demandeur, { couleur: 'menthe' });
  assert.equal(a.demandeur, 'SCI du Port');
});

test('photo : le portrait du mandataire a sa place à lui', () => {
  const { avis } = appliquerOperations(AVIS(), [{ op: 'photo', cle: 'portrait', url: '/uploads/jb.jpg' }]);
  assert.equal(avis.photos.portrait, '/uploads/jb.jpg');
  assert.equal(avis.photos.couverture, null, 'la photo du bien ne bouge pas');
});

test("une réponse notée s'annonce avec sa valeur lisible", () => {
  assert.equal(etapeDeReponse('loyer_annuel_hc', 50000), 'Loyer annuel hc : 50 000 €');
  assert.equal(etapeDeReponse('surface_utile', '92'), 'Surface utile : 92 m²');
  assert.equal(etapeDeReponse('demandeur', 'SCI Mirabeau'), 'Demandeur : SCI Mirabeau');
  assert.equal(etapeDeReponse('bail_tous_commerces', true), 'Bail tous commerces : oui');
});
