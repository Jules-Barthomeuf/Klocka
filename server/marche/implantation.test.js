// La lecture d'une étude d'implantation Data-B, sur une page réelle relevée le
// 11 septembre 2026 (93 avenue Marceau, Courbevoie). Si Data-B change sa page,
// c'est ce test qui le dit — pas un dossier client avec une case vide.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { parseImplantation } from '../data-b-implantation.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
// La page réelle pèse 1,4 Mo : gardée compressée, elle en pèse 188 Ko dans le
// dépôt, pour un test identique. Une page relevée est un document, pas du code :
// elle ne se relit pas, elle se rejoue.
const fixture = (nom) =>
  zlib.gunzipSync(fs.readFileSync(path.join(ici, 'fixtures', `${nom}.gz`))).toString('utf-8');

const html = fixture('data-b-implantation.html');
const lignes = fixture('data-b-implantation.txt').split('\n').map((l) => l.trim()).filter(Boolean);

const lecture = parseImplantation(html, lignes);

test('la page est reconnue', () => {
  assert.ok(lecture, 'une étude d\'implantation doit être lue');
});

test('le flux piéton : la note, les sous-notes, les fourchettes', () => {
  const f = lecture.flux_pieton;
  assert.deepEqual(f.note, { note: 3, sur: 5 });
  assert.deepEqual(f.sous_notes.shopping, { note: 5, sur: 5 });
  assert.deepEqual(f.sous_notes['résidentiel'], { note: 4, sur: 5 });
  assert.deepEqual(f.par_heure.basse, { min: 150, max: 200 });
  assert.deepEqual(f.par_heure.haute, { min: 400, max: 450 });
  assert.deepEqual(f.par_jour.basse, { min: 4000, max: 5000 });
  assert.deepEqual(f.par_jour.haute, { min: 10000, max: 15000 });
});

test('le flux voiture : la note sur cinq, et son indisponibilité', () => {
  assert.equal(lecture.flux_voiture.note.sur, 5);
  assert.ok(lecture.flux_voiture.note.note >= 0 && lecture.flux_voiture.note.note <= 5);
  // La mesure sur cinq, et rien d'autre du trafic — plus le drapeau qui dit
  // si Data-B a refusé de la calculer à cette adresse.
  assert.deepEqual(Object.keys(lecture.flux_voiture).sort(), ['indisponible', 'note']);
  assert.equal(lecture.flux_voiture.indisponible, false);
});

test('un flux que Data-B calcule à la demande rend une note vide, pas zéro', () => {
  // La page d'une étude fraîche : les marqueurs sont là, les étoiles non.
  const fraiche = '<div class="dbSommaireRow flowpedestrian_page"></div><div class="dbSommaireRow flowmotorized_page"></div>'
    + '<div>Activité commerciale du tronçon de rue</div>';
  const r = parseImplantation(fraiche, ['Activité commerciale du tronçon de rue', 'CÔTÉ PAIR', 'N°1']);
  assert.equal(r.flux_pieton, null, 'pas de carte notée : pas de flux, et surtout pas 0/5');
  assert.equal(r.flux_voiture, null);
});

test('la rue : le compte des commerces et leurs familles', () => {
  assert.equal(lecture.rue.commerces, 119);
  assert.equal(lecture.rue.longueur_m, 583);
  assert.deepEqual(lecture.rue.familles[0], { n: 41, famille: 'Service' });
});

test('le tronçon : premium, 19 commerces', () => {
  assert.match(lecture.troncon.libelle, /19 commerces - tronçon premium/);
  assert.deepEqual(lecture.troncon.note, { note: 5, sur: 5 });
});

test('les commerces du tronçon, numéro par numéro, côté pair puis impair', () => {
  const t = lecture.commerces_troncon;
  const n87 = t.numeros.find((x) => x.numero === '87');
  assert.equal(n87.cote, 'pair');
  assert.equal(n87.commerces.length, 4);
  assert.deepEqual(n87.commerces[1], { activite: 'Boucherie, charcuterie', enseigne: 'DE-COURBEVOIE BOUCHERIE' });
  const n89bis = t.numeros.find((x) => x.numero === '89bis');
  assert.equal(n89bis.habitation, true);
  const n112 = t.numeros.find((x) => x.numero === '112');
  assert.equal(n112.cote, 'impair');
  assert.equal(n112.commerces.length, 2);
  // Les deux pages du tronçon assemblées : le total rejoint ce que la page
  // annonce elle-même dans « Commercialité du tronçon ».
  assert.equal(t.total, 19);
  assert.equal(t.total, Number(lecture.troncon.libelle.match(/^(\d+) commerces/)[1]));
});

test('la démographie et le revenu, avec leurs évolutions', () => {
  assert.equal(lecture.demographie.habitants, 63878);
  assert.equal(lecture.demographie.evolution.a_3_ans, 0.8);
  assert.equal(lecture.revenu.revenu_moyen_annuel, 30246);
  assert.equal(lecture.revenu.revenu_evolution.a_3_ans, 6.8);
  assert.equal(lecture.revenu.csp_plus, 40298);
  assert.equal(lecture.revenu.taux_chomage, 8.77);
});

test('la zone primaire : logements et propriétaires', () => {
  assert.equal(lecture.zone_primaire.logements, 4395);
  assert.equal(lecture.zone_primaire.proprietaires, 3917);
  assert.equal(lecture.zone_primaire.commerces, 206);
});

test('l\'en-tête : revenu du quartier et CSP majoritaire', () => {
  assert.equal(lecture.en_tete.revenu_annuel_quartier, 32010);
  assert.equal(lecture.en_tete.revenu_vs_france, -27.65);
  assert.equal(lecture.en_tete.csp_majoritaire, 'Cadres Prof intell');
});

test('une page qui n\'est pas une étude rend null', () => {
  assert.equal(parseImplantation('<html><body>Chargement en cours…</body></html>'), null);
});
