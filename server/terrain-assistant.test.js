// Le terrain, dit à l'assistante (31 oct. 2026, Jules) : le mandataire parle d'un commerce qu'il vient de voir, sans
// l'avoir mis dans une liste ; l'assistante retrouve le commerce, crée la fiche, note ce qui s'est dit et demande où la ranger.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-terrain-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const M = await import('./mandataire.js');
const { retrouverCommerce } = await import('./off-market/simple.js');

const MOI = { email: 'terrain@kpartners.fr', role: 'mandataire' };
const ville = Records.create('Ville', { nom: 'Cannes', centre: { lat: 43.55, lon: 7.01 } });
const boulangerie = Records.create('CommerceSimple', { ville_id: ville.id, ville: 'Cannes', enseigne: 'Boulangerie Dupain', nom: 'DUPAIN SARL', activite: 'Boulangerie', adresse: '19 RUE DE L EXEMPLE' });
Records.create('CommerceSimple', { ville_id: ville.id, ville: 'Cannes', enseigne: 'Tabac du Port', nom: 'TABAC DU PORT', activite: 'Tabac', adresse: '4 QUAI SAINT PIERRE' });
Records.create('CommerceSimple', { ville_id: ville.id, ville: 'Cannes', enseigne: 'Fleurs Riviera', nom: 'RIVIERA SAS', activite: 'Fleuriste', adresse: '7 RUE MEYNADIER' });
Records.create('CommerceSimple', { ville_id: ville.id, ville: 'Cannes', enseigne: 'Opticien Meynadier', nom: 'OPTIC SARL', activite: 'Opticien', adresse: '7 RUE MEYNADIER' });

const outil = (input) => M.executerOutilMandataire({ name: 'nouveau_contact', input }, MOI);

test("l'adresse dite à voix haute retrouve le commerce que Klocka connaît", () => {
  assert.equal(retrouverCommerce({ commerce: 'la boulangerie', adresse: '19 rue de l\'Exemple', ville: 'Cannes' }).commerce?.id, boulangerie.id);
  assert.equal(retrouverCommerce({ adresse: '19 rue de l Exemple', ville: 'cannes' }).commerce?.id, boulangerie.id, "sans le nom, l'adresse suffit");
  assert.equal(retrouverCommerce({ commerce: 'Boulangerie Dupain', ville: 'Cannes' }).commerce?.id, boulangerie.id, 'sans adresse, le nom dans la ville');
  assert.deepEqual(retrouverCommerce({ adresse: '3 rue Inconnue', ville: 'Cannes' }), {});
  assert.deepEqual(retrouverCommerce({ commerce: 'Boulangerie Dupain' }), {}, 'sans ville, rien ne se devine');
});

test("deux commerces au même numéro : le nom les départage, sinon l'assistante demande", () => {
  assert.equal(retrouverCommerce({ commerce: 'le fleuriste', adresse: '7 rue Meynadier', ville: 'Cannes' }).commerce?.enseigne, 'Fleurs Riviera');
  const flou = retrouverCommerce({ adresse: '7 rue Meynadier', ville: 'Cannes' });
  assert.equal(flou.commerce, undefined);
  assert.equal(flou.candidats.length, 2);
});

test("« je suis passé à la boulangerie du 19 rue de l'Exemple » : la fiche naît du commerce connu, hors liste, avec ce qui s'est dit", async () => {
  Records.create('ListeMandataire', { mandataire_email: MOI.email, nom: 'Boulangeries Lyon', cree_le: '2026-10-20T10:00:00.000Z' });
  const r = await outil({ commerce: 'la boulangerie', adresse: "19 rue de l'Exemple", ville: 'Cannes', nom: 'M. Bernard', telephone: '06 12 34 56 78', statut: 'contacte', remarque: 'Vend dans deux ans' });
  assert.equal(r.ok, true);
  assert.equal(r.commerce_klocka_retrouve, true);
  assert.equal(r.liste, null, 'pas encore rangée : c\'est la question qui suit');
  assert.equal(r.derniere_liste, 'Boulangeries Lyon');
  assert.match(r.fait, /Boulangeries Lyon/);
  const p = Records.get('ProprietaireMandataire', r.proprietaire_id);
  assert.equal(p.commerce_simple_id, boulangerie.id);
  assert.equal(p.statut, 'contacte');
  assert.equal(p.nom, 'M. Bernard');
  assert.equal(p.telephone, '06 12 34 56 78');
  assert.match(p.remarque, /deux ans/);
  assert.ok(!p.liste_id, 'hors liste');
  // Le même commerce redit : pas de doublon.
  const encore = await outil({ commerce: 'la boulangerie', adresse: "19 rue de l'Exemple", ville: 'Cannes' });
  assert.equal(encore.deja_suivi, true);
  assert.equal(Records.list('ProprietaireMandataire').filter((x) => x.commerce_simple_id === boulangerie.id).length, 1);
});

test("un commerce que Klocka ne connaît pas : la fiche naît de ce qui a été dit, sans numéro ni nom réclamés", async () => {
  const r = await outil({ commerce: 'Chez Mario, pizzeria', ville: 'Cannes', remarque: "A l'air bien, je repasse jeudi" });
  assert.equal(r.ok, true);
  assert.equal(r.commerce_klocka_retrouve, false);
  const p = Records.get('ProprietaireMandataire', r.proprietaire_id);
  assert.equal(p.statut, 'a_appeler');
  assert.equal(p.source, 'Terrain');
  assert.match(p.remarque, /jeudi/);
});

test("il faut le commerce ou l'adresse, et la ville : rien d'autre ne se réclame", async () => {
  const sansVille = await outil({ commerce: 'Boulangerie', nom: 'M. Durand', telephone: '06 00 00 00 00' });
  assert.equal(sansVille.ok, false);
  assert.deepEqual(sansVille.a_demander, ['la ville']);
  const sansCommerce = await outil({ ville: 'Cannes', nom: 'M. Durand' });
  assert.equal(sansCommerce.ok, false);
  assert.deepEqual(sansCommerce.a_demander, ["le commerce ou l'adresse"]);
});

test("deux commerces possibles à l'adresse : rien n'est créé avant la réponse", async () => {
  const avant = Records.list('ProprietaireMandataire').length;
  const r = await outil({ adresse: '7 rue Meynadier', ville: 'Cannes' });
  assert.equal(r.ok, false);
  assert.equal(r.ambigu, true);
  assert.equal(r.choix.length, 2);
  assert.equal(Records.list('ProprietaireMandataire').length, avant);
});

test("la fiche sans liste se range ensuite par modifier_fiche, la liste se crée par son nom", async () => {
  const r = await outil({ commerce: 'Chez Lucie, crêperie', ville: 'Cannes' });
  const rangee = await M.executerOutilMandataire({ name: 'modifier_fiche', input: { proprietaire_id: r.proprietaire_id, liste: 'Crêperies Cannes' } }, MOI);
  assert.equal(rangee.ok, true);
  const p = Records.get('ProprietaireMandataire', r.proprietaire_id);
  assert.ok(p.liste_id);
  assert.equal(Records.get('ListeMandataire', p.liste_id).nom, 'Crêperies Cannes');
});
