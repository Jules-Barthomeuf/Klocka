// L'éditeur de projet avec AK (14 oct. 2026) : modifier champ par champ, avec la source ; les sources de la page.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-projet-edition-'));
const E = await import('./projet-edition.js');
const S = await import('./projet-sources.js');
const { Records } = await import('./db.js');

test('les champs modifiables : les chiffres oui, l\'identité et les accès jamais', () => {
  for (const c of ['marche_loyer_autour', 'surface_m2', 'sim_apport', 'valeurs_forcees.prix_revient', 'cases_forcees.bail.loyer_actuel', 'quote_part_lot']) assert.equal(E.champModifiable(c), true, c);
  for (const c of ['titre', 'client_email', 'admins', 'admin_principal', 'sources_champs', 'id', '']) assert.equal(E.champModifiable(c), false, c);
  assert.equal(E.valeurRangee('marche_loyer_autour', '1 240,5 €'), 1240.5);
  assert.equal(E.valeurRangee('sim_pret_in_fine', 'true'), true);
  assert.equal(E.valeurRangee('valeurs_forcees.commercial_ecart', '-12 %'), '-12 %', 'une valeur forcée reste telle qu\'affichée');
});

test('modifier : seulement les champs touchés, la source posée, les règles de l\'éditeur', () => {
  const p = Records.create('Project', { titre: 'Libourne', surface_m2: 55, sim_surface: 55, marche_loyer_autour: 180, sim_loyer_initial_ht: 30693, client_email: 'client@x.fr' });
  const r = E.modifierChamps(p.id, [
    { champ: 'marche_loyer_autour', valeur: '240', source: 'Equimmox, baux à 500 m', raison: 'plus cohérent que le chiffre saisi' },
    { champ: 'loyer_m2_an', valeur: 600, source: 'bail' },
    { champ: 'echeance_bail', valeur: '2030-05-17' },
  ], { par: 'AK' });
  assert.equal(r.ok, true);
  const lu = Records.get('Project', p.id);
  assert.equal(lu.marche_loyer_autour, 240);
  assert.equal(lu.sim_loyer_initial_ht, 33000, 'le loyer au m² fixe le loyer annuel d\'après la surface');
  assert.equal(lu.bail_date_echeance, '2030-05-17', 'l\'échéance rangée sous ses deux noms');
  assert.equal(lu.sources_champs.marche_loyer_autour.source, 'Equimmox, baux à 500 m');
  assert.equal(lu.client_email, 'client@x.fr');
  assert.deepEqual(r.faits[0], { champ: 'marche_loyer_autour', avant: 180, apres: 240, source: 'Equimmox, baux à 500 m', raison: 'plus cohérent que le chiffre saisi' });
  // Une retouche à la main sans source : la source d'AK ne vaut plus pour ce chiffre.
  E.modifierChamps(p.id, [{ champ: 'marche_loyer_autour', valeur: 250 }], { par: 'jules@klocka.immo' });
  assert.equal(Records.get('Project', p.id).sources_champs.marche_loyer_autour, undefined);
  assert.equal(E.modifierChamps(p.id, [{ champ: 'titre', valeur: 'X' }]).ok, false, 'rien n\'est appliqué si un champ est interdit');
});

test('les sources de la page : celle posée, la saisie à la main, sinon la source publique', () => {
  const p = { id: 'x', marche_loyer_autour: 240, sources_champs: { marche_loyer_autour: { source: 'Equimmox, baux à 500 m', par: 'AK', raison: 'plus cohérent' } }, ville_revenu_median: 21000, valeurs_forcees: { prix_revient: '400 000 €' } };
  const s = S.sourcesDuProjet(p, { rue: { loyer_m2_an: 199, loyer_source: 'Equimmox', loyer_bas: 182, loyer_haut: 190 } });
  assert.equal(s.marche_loyer_autour.origine, 'Equimmox, baux à 500 m');
  assert.match(s.marche_loyer_autour.detail, /plus cohérent.*Posé par AK/);
  assert.equal(s.ville_revenu_median.origine, 'Saisi dans l\'éditeur');
  assert.equal(s['valeurs_forcees.prix_revient'].origine, 'Valeur forcée dans l\'éditeur');
  assert.equal(s.marche_rue_prix_m2.origine, 'Le Figaro Immobilier');
  const vide = S.sourcesDuProjet({ id: 'y' }, { rue: null });
  assert.equal(vide.marche_loyer_autour.nature, 'a_remplir');
});

test('AK voit le bail comme la page : la frise, la période ferme, la synthèse ; il peut les corriger', async () => {
  const p = Records.create('Project', { titre: 'Libourne', bail_date_debut: '2026-07-01', bail_date_echeance: '2036-06-30', analyse_bail: 'Échéance non communiquée.' });
  assert.match(await S.projetPourAK(p.id), /1 juillet 2029 : 1re échéance triennale/);
  const r = E.modifierChamps(p.id, [
    { champ: 'bail_duree_ferme_ans', valeur: '6', source: 'Indiqué par Jules dans le chat' },
    { champ: 'analyse_bail', valeur: 'Bail de 10 ans dont 6 ans ferme.', source: 'Indiqué par Jules dans le chat' },
  ], { par: 'AK' });
  assert.equal(r.ok, true);
  assert.equal(Records.get('Project', p.id).bail_duree_ferme_ans, 6);
  const ctx = await S.projetPourAK(p.id);
  assert.match(ctx, /1 juillet 2032 : Fin de la période ferme/);
  assert.doesNotMatch(ctx, /2029/);
  assert.match(ctx, /Bail de 10 ans dont 6 ans ferme/);
});
