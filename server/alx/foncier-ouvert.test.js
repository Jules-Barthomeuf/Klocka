// Qui possède les murs, d'après les fichiers publics : la lecture d'une ligne
// DGFiP, le choix du propriétaire, la parcelle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-foncier-'));
const { enProprietaire, choisirProprietaire, estRezDeChaussee, trancheAge, decomposerParcelle, droitDe, formeCourte, aireDe, SOURCE } = await import('./foncier-ouvert.js');

test('une ligne DGFiP devient un propriétaire lisible, avec son droit en clair', () => {
  // La forme du millésime national : pas de lots détaillés, un compte et un drapeau.
  const p = enProprietaire({ siren: '123456789', nom: 'SCI DES LICES', forme: 'Société civile immobilière', droit: 'P', locaux: 3, rez_de_chaussee: true });
  assert.equal(p.forme, 'SCI');
  assert.equal(p.droit, 'Propriétaire');
  assert.equal(p.droit_code, 'P');
  assert.equal(p.demembre, false);
  assert.equal(p.rez_de_chaussee, true);
  assert.equal(p.locaux, 3);
  assert.equal(p.proprietaire, true);
  assert.deepEqual(p.gerants, [], "les gérants viennent de l'annuaire, pas d'ici");

  // La forme MAJIC en ligne : des lots avec leur niveau, le droit en toutes lettres.
  const m = enProprietaire({ siren: '415176072', nom: 'CAISSE REGIONALE', forme: 'Caisse de crédit agricole mutuel', droit: 'Propriétaire', lots: [{ niveau: '01' }, { niveau: '02' }] });
  assert.equal(m.rez_de_chaussee, false, 'aucun lot au niveau 00');
  assert.equal(m.lots.length, 2);
  assert.equal(m.lots[0].etage, '01');
  assert.equal(m.forme, 'Caisse de crédit agricole mutuel');

  // Un usufruitier ne vend pas seul : le démembrement se lit dans le code.
  assert.equal(enProprietaire({ siren: '111111111', nom: 'X', droit: 'U - Usufruitier' }).demembre, true);
  assert.equal(enProprietaire({ siren: '111111111', nom: 'X', droit: 'N' }).demembre, true);
  assert.equal(enProprietaire({ siren: 'pas un siren', nom: 'Y' }).siren, null);
});

test('le droit se lit en code court comme en toutes lettres', () => {
  assert.deepEqual(droitDe('P'), { code: 'P', libelle: 'Propriétaire', demembre: false });
  assert.deepEqual(droitDe('P - Propriétaire'), { code: 'P', libelle: 'Propriétaire', demembre: false });
  assert.equal(droitDe('U').libelle, 'Usufruitier');
  assert.equal(droitDe('').libelle, null);
  assert.equal(droitDe('Quelque chose - Inconnu').libelle, 'Inconnu');
  assert.equal(formeCourte('SCI DU PORT'), 'SCI');
  assert.equal(formeCourte('SAS'), 'SAS');
  assert.equal(formeCourte(''), null);
});

test('le choix retient le rez-de-chaussée, ou le seul propriétaire, sinon personne', () => {
  const rdc = { nom: 'A', rez_de_chaussee: true, proprietaire: true };
  const etage = { nom: 'B', rez_de_chaussee: false, proprietaire: true };
  assert.equal(choisirProprietaire([etage]).choix, etage, 'seul propriétaire publié');
  assert.equal(choisirProprietaire([rdc, etage]).choix, rdc);
  assert.equal(choisirProprietaire([rdc, { ...rdc, nom: 'C' }]).choix, null, 'deux au rez-de-chaussée : à départager');
  assert.match(choisirProprietaire([rdc, { ...rdc, nom: 'C' }]).motif, /départager/);
  assert.equal(choisirProprietaire([etage, { ...etage, nom: 'D' }]).choix, null, 'aucun lot du bas identifié');
  assert.equal(choisirProprietaire([]).choix, null);
  assert.match(choisirProprietaire([]).motif, /aucun propriétaire publié/);
});

test("l'exploitant propriétaire de ses murs, ou la seule SCI du rez-de-chaussée, tranchent", () => {
  const sci = { nom: 'SCI DU PORT', siren: '111', forme: 'SCI', rez_de_chaussee: true, proprietaire: true };
  const sas = { nom: 'BOUTIQUE SAS', siren: '222', forme: 'SAS', rez_de_chaussee: true, proprietaire: true };
  const sarl = { nom: 'AUTRE SARL', siren: '333', forme: 'SARL', rez_de_chaussee: true, proprietaire: true };
  const r = choisirProprietaire([sci, sas], { siren: '222', nom: 'BOUTIQUE SAS' });
  assert.equal(r.choix, sas);
  assert.equal(r.occupant_proprietaire, true);
  assert.equal(choisirProprietaire([sci, sas, sarl], { siren: '999', nom: 'X' }).choix, sci, 'une seule société immobilière parmi trois au rez-de-chaussée');
  assert.equal(choisirProprietaire([sas, sarl], null).choix, null, 'deux commerçants, personne ne tranche');
});

test('le lot du bas se reconnaît sous ses écritures, et Parcelle vaut tout', () => {
  for (const e of ['00', '0', 'RDC', 'Étage RDC', 'Rez-de-chaussée', 'Parcelle']) assert.equal(estRezDeChaussee(e), true, e);
  for (const e of ['01', '1', 'Étage 02', '', null]) assert.equal(estRezDeChaussee(e), false, String(e));
});

test("l'âge devient une tranche, et une parcelle se décompose", () => {
  assert.equal(trancheAge(72), '70+');
  assert.equal(trancheAge(55), '50-70');
  assert.equal(trancheAge(31), '-50');
  assert.equal(trancheAge('x'), null);
  assert.deepEqual(decomposerParcelle('06029000CR0099'), { insee: '06029', prefixe: '000', section: 'CR', numero: '0099' });
  assert.deepEqual(decomposerParcelle('2A004000AB0012'), null, 'la Corse a un autre format, on ne devine pas');
  assert.equal(decomposerParcelle(''), null);
  assert.equal(SOURCE, 'DGFiP · locaux des personnes morales');
});

test("l'aire d'un contour se calcule en mètres carrés", () => {
  // Un carré de cent mètres de côté à Cannes, en [lat, lon].
  const dLat = 100 / 110540; const dLon = 100 / (111320 * Math.cos((43.55 * Math.PI) / 180));
  const carre = [[43.55, 7.02], [43.55 + dLat, 7.02], [43.55 + dLat, 7.02 + dLon], [43.55, 7.02 + dLon], [43.55, 7.02]];
  const aire = aireDe(carre);
  assert.ok(Math.abs(aire - 10000) < 50, `${aire} m²`);
  assert.equal(aireDe([]), null);
});
