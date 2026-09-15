// Les cases de la page projet : des mots courts, et jamais un chiffre inventé.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-cases-'));
const {
  montant, activiteCourte, detailSurface, typeBailCourt, preneurDe, tvaCourte, taxeFonciereCourte, depotCourt,
  pasDePorteCourt, provisionCourte, indexationCourte, travauxCourts, datesDuBail, anciennete, casesDuProjet,
} = await import('./projet-cases.js');

const nbsp = (s) => String(s).replace(/\s/g, ' ');

test('un montant se lit avec ses espaces et ses centimes', () => {
  assert.equal(montant('3 105,00 EUROS, soit trois mois'), 3105);
  assert.equal(montant('48 000,00 € HT par an'), 48000);
  assert.equal(montant('Aucun montant'), null);
});

test("l'activité tient en un mot, la phrase reste derrière le « i »", () => {
  assert.deepEqual(activiteCourte('Pharmacie'), { valeur: 'Pharmacie', info: null });
  const longue = activiteCourte('Usage exclusivement commercial : « Import/ Export, achat en gros, demi-gros, détail de meubles »');
  assert.ok(longue.valeur.split(' ').length <= 2, longue.valeur);
  assert.match(longue.info, /Import/);
  assert.equal(activiteCourte(''), null);
});

test('la surface se détaille par niveau', () => {
  assert.equal(nbsp(detailSurface('Surface 60 m² — 40 RDC + 20 soussol')), '40 m² rez-de-chaussée · 20 m² sous-sol');
  assert.equal(nbsp(detailSurface('112 m² dont 80 m² au rez-de-chaussée et une réserve de 32 m²')), '80 m² rez-de-chaussée · 32 m² réserve');
  assert.equal(detailSurface('lot n°6 au RDC'), null, 'un numéro de lot n\'est pas une surface');
  assert.match(nbsp(detailSurface('surface pondérée : 95 m²')), /95 m² pondérés/);
});

test('le type de bail et sa durée', () => {
  const bail = typeBailCourt('Bail commercial soumis au statut (art. L.145-1)', 'Neuf années entières et consécutives');
  assert.deepEqual({ ...bail, valeur: bail.valeur.split(String.fromCharCode(8209)).join('-') }, { valeur: 'Commercial 3-6-9', detail: '9 ans' });
  assert.equal(typeBailCourt('Convention d\'occupation précaire').valeur, 'Dérogatoire');
  assert.equal(typeBailCourt(''), null);
});

test('le preneur, sans son capital ni son siège', () => {
  assert.equal(preneurDe('Bailleur : SC GAJUSTE, société civile ; Preneur : SARL RIMEL, au capital de 10 000 €'), 'SARL RIMEL');
  assert.equal(preneurDe('Bailleur seul'), null);
});

test('la TVA dit qui la paie', () => {
  assert.deepEqual(tvaCourte('Loyer soumis à TVA : 48 000 € HT / 57 600 € TTC (taux 20 %)'), { valeur: 'Soumis à TVA', detail: '20 %, payée par le preneur' });
  assert.equal(tvaCourte('Loyer non assujetti à la TVA').valeur, 'Non soumis');
  assert.equal(tvaCourte('', false), null);
});

test('taxe foncière, dépôt, pas de porte, provision', () => {
  const taxe = taxeFonciereCourte('4 706,00 € au titre de 2025 ; intégralement remboursée par le preneur');
  assert.equal(taxe.valeur, 'Refacturée');
  assert.equal(nbsp(taxe.detail), '4 706 € (2025)');
  assert.equal(taxeFonciereCourte('La taxe foncière reste à la charge du bailleur').valeur, 'Non refacturée');
  const depot = depotCourt('8 000,00 €, représentant DEUX (2) mois de loyer HT');
  assert.equal(nbsp(depot.valeur), '8 000 €');
  assert.equal(depot.detail, '2 mois de loyer');
  assert.equal(pasDePorteCourt('Aucun pas de porte ni droit d\'entrée').valeur, 'Aucun');
  assert.equal(provisionCourte('Aucune provision sur charges').valeur, 'Aucune');
  assert.equal(nbsp(provisionCourte('Provision mensuelle de 35,00 EUROS').valeur), '35 €/mois');
});

test("l'indexation et les travaux", () => {
  assert.equal(indexationCourte('Indice trimestriel des loyers commerciaux (ILC), indexation annuelle').valeur, 'ILC · annuelle');
  assert.equal(indexationCourte('Révision triennale sur l\'indice du coût de la construction').valeur, 'ICC · triennale');
  assert.deepEqual(travauxCourts("Grosses réparations de l'article 606 du Code civil", 'Entretien et menues réparations à la charge du preneur'), { valeur: 'Art. 606 : bailleur', detail: 'Entretien courant : preneur' });
});

test('les dates du bail et l\'ancienneté', () => {
  assert.deepEqual(datesDuBail("Prise d'effet : 01/11/2018. Fin prorogée : 31/01/2028 (au lieu du 31/10/2027)"), { debut: '2018-11-01', fin: '2028-01-31' });
  assert.deepEqual(datesDuBail("Date d'effet : 01 AVRIL 2007 — Date d'échéance : 31 MARS 2016"), { debut: '2007-04-01', fin: '2016-03-31' });
  assert.deepEqual(anciennete('2018-11-01', new Date('2026-09-15')), { valeur: '7 ans', detail: 'depuis novembre 2018' });
  assert.equal(anciennete('2030-01-01', new Date('2026-09-15')), null);
});

test("l'assemblage : chaque case garde sa pièce et sa page, et les cases vides restent réservées", () => {
  const preuve = (page) => [{ document_id: 'd1', document_nom: 'Bail.pdf', document_url: '/uploads/bail.pdf', page, citation: 'extrait' }];
  const fiche = { blocs: [{ champs: [
    { id: 'dates_bail', valeur: 'Prise d\'effet le 16/03/2026, fin le 15/03/2035', preuves: preuve(8) },
    { id: 'loyer', valeur: '48 000,00 € HT par an', preuves: preuve(9) },
    { id: 'depot', valeur: '8 000,00 €, DEUX (2) mois', preuves: preuve(12) },
    { id: 'parties', valeur: 'Preneur : SARL RIMEL, capital 10 000 €', preuves: preuve(1) },
  ] }] };
  const c = casesDuProjet({ loyer_annuel_ht: 48960, surface_m2: 153, activite_locataire: 'Meubles' }, { fiche, maintenant: new Date('2026-09-15') });
  const parId = (liste) => Object.fromEntries(liste.map((x) => [x.id, x]));
  const bail = parId(c.bail);
  assert.equal(bail.depot.source.page, 12);
  assert.equal(bail.preneurs.valeur, 'SARL RIMEL');
  assert.equal(bail.loyer_indexe.detail, '+2 % depuis la signature');
  assert.equal(bail.pas_de_porte.valeur, null, 'rien dans le dossier : la case reste vide');
  assert.equal(bail.pas_de_porte.source, null);
  assert.deepEqual({ debut: c.frise.debut, fin: c.frise.fin, page: c.frise.source.page }, { debut: '2026-03-16', fin: '2035-03-15', page: 8 });
  assert.equal(parId(c.locataire).en_place.valeur, '5 mois');
  assert.equal(parId(c.bien).activite.valeur, 'Meubles');

  const publique = casesDuProjet({ loyer_annuel_ht: 1 }, { fiche, sansSources: true });
  assert.ok(publique.bail.every((x) => x.source === null));
});
