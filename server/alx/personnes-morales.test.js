// Le fichier des personnes morales : le raccord avec DVF, et le regroupement.
// Pur : les lignes sont écrites à la main, rien n'est téléchargé.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-pm-'));
const { grouper, parcelleDe, parParcelle, parSiren, detentionMinimale } = await import('./personnes-morales.js');

const ENTETE = '"Département (Champ géographique)";"Code Direction";"Code Commune (Champ géographique)";"Nom Commune";"Préfixe (Références cadastrales)";"Section";"N° plan (Références cadastrales)";"Bâtiment";"Entrée";"Niveau";"Porte";"N° voirie";"Indice";"Code voie MAJIC";"Code voie rivoli";"Nature voie";"Nom voie";"Code droit";"N° MAJIC";"N° SIREN (Propriétaire(s) du local)";"Groupe personne";"Forme juridique";"Forme juridique abrégée";"Dénomination (Propriétaire(s) du local)"';

/** Une ligne du fichier, telle que la DGFiP l'écrit. */
const ligne = ({ commune = '004', prefixe = '   ', section = 'AH', plan = '0020', niveau = '00', droit = 'P', siren = '123456789', forme = 'SCI', nom = 'SCI DU COMMERCE' }) =>
  `"06";"0";"${commune}";"ANTIBES";"${prefixe}";"${section}";"${plan}";"A";"01";"${niveau}";"01001";"12";"";"00060";"B060";"";"RUE DE LA REPUBLIQUE";"${droit}";"PBFSVF";"${siren}";"0";"7345";"${forme}";"${nom}"`;

test('la parcelle se reconstitue au format DVF', () => {
  // DVF écrit « 06004000AH0020 » : commune 5, préfixe 3, section 2, plan 4.
  assert.equal(parcelleDe(ligne({}).split(';')), '06004000AH0020');
  // Un préfixe renseigné, une section d'une lettre, un plan court.
  assert.equal(parcelleDe(ligne({ commune: '29', prefixe: '302', section: 'B', plan: '45' }).split(';')), '06029302 B0045'.replace(' ', '0'));
});

test('une copropriété fait un seul enregistrement par propriétaire', () => {
  const g = grouper([ENTETE, ligne({ niveau: '00' }), ligne({ niveau: '01' }), ligne({ niveau: '02' })]);
  assert.equal(g.length, 1);
  assert.equal(g[0].locaux, 3);
  assert.equal(g[0].rez_de_chaussee, true, 'un local au niveau 00 : la parcelle peut porter un commerce');
  assert.equal(g[0].siren, '123456789');
  assert.equal(g[0].nom, 'SCI DU COMMERCE');
  assert.equal(g[0].commune, '06004');
});

test('deux propriétaires sur la même parcelle restent deux', () => {
  const g = grouper([ENTETE, ligne({}), ligne({ siren: '987654321', nom: 'SARL VOISINE' })]);
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => x.siren).sort(), ['123456789', '987654321']);
});

test('sans SIREN, la ligne ne sert à rien', () => {
  assert.equal(grouper([ENTETE, ligne({ siren: '' })]).length, 0);
});

test('un fichier qui change de colonnes se signale au lieu de se lire de travers', () => {
  const faux = '"Autre chose";"x";"y";"z";"a";"b";"c";"d";"e";"f";"g";"h";"i";"j";"k";"l";"m";"n";"o";"p";"q";"r";"s";"t"';
  assert.throws(() => grouper([faux, ligne({})]), /a changé de colonnes/);
});

test('les index donnent la parcelle et le portefeuille', () => {
  const g = grouper([
    ENTETE,
    ligne({}),
    ligne({ plan: '0021' }),
    ligne({ plan: '0022', siren: '987654321', nom: 'SARL VOISINE' }),
  ]);
  const parcelles = parParcelle(g);
  assert.equal(parcelles.get('06004000AH0020')[0].siren, '123456789');
  const sirens = parSiren(g);
  assert.equal(sirens.get('123456789').length, 2, 'deux parcelles au portefeuille');
  assert.equal(sirens.get('987654321').length, 1);
});

test('la détention minimale ne prétend pas savoir avant le premier millésime', () => {
  const index = (siren) => parParcelle(grouper([ENTETE, ligne({ siren })]));
  const parAnnee = new Map([[2021, index('111111111')], [2022, index('111111111')], [2023, index('111111111')]]);
  // Présent dès le plus vieux millésime : on sait « au moins trois ans », pas depuis quand.
  const d = detentionMinimale(parAnnee, '06004000AH0020', '111111111');
  assert.equal(d.complet, false);
  assert.equal(d.annees_min, 3);

  // Arrivé en 2022 : la date est connue, la durée est exacte.
  const arrive = new Map([[2021, index('999999999')], [2022, index('111111111')], [2023, index('111111111')]]);
  const e = detentionMinimale(arrive, '06004000AH0020', '111111111');
  assert.equal(e.complet, true);
  assert.equal(e.depuis, 2022);
  assert.equal(e.annees_min, 1);

  // Absent du dernier millésime : il a vendu, ce n'est plus une détention.
  const parti = new Map([[2021, index('111111111')], [2022, index('111111111')], [2023, index('999999999')]]);
  assert.equal(detentionMinimale(parti, '06004000AH0020', '111111111'), null);
});
