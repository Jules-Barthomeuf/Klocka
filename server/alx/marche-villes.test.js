// Le marché par ville : ce qu'un budget et un rendement désignent.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-marche-'));
const { Records } = await import('../db.js');
const {
  reference, familleDe, familles, chevauchement, memeCommune, loyerPour,
  chercherVilles, chercherCibles, loyerAnnuelDe, rendementDe, classesPourTaux,
} = await import('./marche-villes.js');

const dijon = reference().villes.find((v) => v.ville === 'Dijon');

test('le tableau de référence est complet : un code INSEE et une fourchette partout', () => {
  const villes = reference().villes;
  assert.ok(villes.length > 80, `${villes.length} villes`);
  for (const v of villes) {
    assert.match(v.insee, /^(\d{5}|2[AB]\d{3})$/, `${v.ville} sans code INSEE`);
    assert.equal(v.rendement.length, 2, `${v.ville} sans fourchette`);
    assert.ok(v.rendement[0] < v.rendement[1], `${v.ville} : fourchette à l'envers`);
  }
  // Le tableau dit la règle du métier : Paris se traite sous le rendement
  // d'une sous-préfecture, et très loin d'un retail park de périphérie.
  const haut = (nom) => villes.find((v) => v.ville === nom).rendement[1];
  assert.ok(haut('Paris 6e') < haut('Dijon'));
  assert.ok(haut('Dijon') < haut('Nazelles-Négron'));
});

test('les familles rangent les typologies', () => {
  assert.equal(familleDe('Paris Intra-muros (Marais / Prime)'), 'Paris intra-muros');
  assert.equal(familleDe('1ère Couronne IDF (Hauts-de-Seine Prime)'), 'Couronne parisienne');
  assert.equal(familleDe('Grande Métropole (Rhône / Presqu\'île)'), 'Grande métropole');
  assert.equal(familleDe('Périphérie Amboise (Indre-et-Loire)'), 'Périphérie et retail');
  assert.equal(familleDe('Sous-préfecture Var'), 'Ville moyenne');
  assert.ok(familles().includes('Grande métropole'));
});

test('deux fourchettes se touchent ou non', () => {
  assert.deepEqual(chevauchement([5, 7], [6, 9]), [6, 7]);
  assert.equal(chevauchement([5, 7], [8, 9]), null);
  assert.equal(chevauchement(null, [8, 9]), null);
});

test('un arrondissement est sa ville', () => {
  assert.equal(memeCommune('75056', '75103'), true);
  assert.equal(memeCommune('75103', '75056'), true);
  assert.equal(memeCommune('69123', '69384'), true);
  assert.equal(memeCommune('13055', '13208'), true);
  assert.equal(memeCommune('06029', '06088'), false);
  assert.equal(memeCommune(null, '06088'), false);
});

test('le loyer à chercher, c\'est le prix fois le taux', () => {
  assert.equal(loyerPour(250000, 8), 20000);
  assert.equal(rendementDe(20000, 250000), 8);
  assert.equal(rendementDe(0, 250000), null);
});

test('8 % écarte Paris et retient les villes moyennes, avec le loyer à chercher', () => {
  const r = chercherVilles({ prix_min: 200000, prix_max: 300000, rendement_min: 8, rendement_max: 8.5 });
  // Un seul arrondissement parisien touche les 8 % par le haut (le 18e, qui
  // monte à 8,5 %) : les autres sont hors jeu, et il arrive loin derrière.
  const paris = r.filter((v) => v.ville.startsWith('Paris'));
  assert.deepEqual(paris.map((v) => v.ville), ['Paris 18e']);
  assert.ok(r.indexOf(paris[0]) > 10, 'Paris 18e ne remonte pas en tête');
  const d = r.find((v) => v.ville === 'Dijon');
  assert.ok(d, 'Dijon sort à 8 %');
  // Le taux retenu est l'intersection, pas le taux rêvé : Dijon va de 8 à
  // 10,5 %, on n'y achètera donc pas sous 8 %.
  assert.deepEqual(d.taux, [8, 8.5]);
  assert.deepEqual(d.loyer, [16000, 25500]);
  assert.equal(d.emplacement, dijon.emplacement);
  // La plus centrée sur le rendement demandé arrive en tête.
  assert.ok(r[0].ecart <= r[r.length - 1].ecart);
});

test('un rendement visé est un point : la ville doit le traiter', () => {
  const a8 = chercherVilles({ rendement: 8 }).map((v) => v.ville);
  assert.ok(a8.includes('Dijon'), 'Dijon va de 8 à 10,5 %');
  assert.ok(!a8.includes('Autun'), 'Autun commence à 9,8 %');
  // Le 18e monte à 8,5 % : c'est le seul arrondissement que 8 % laisse en jeu.
  assert.deepEqual(a8.filter((v) => v.startsWith('Paris')), ['Paris 18e']);
  // Le taux retenu est le taux visé, pas une fourchette.
  assert.deepEqual(chercherVilles({ rendement: 8 }).find((v) => v.ville === 'Dijon').taux, [8, 8]);
});

test('un rendement haut descend la gamme, un rendement bas la remonte', () => {
  const haut = chercherVilles({ rendement_min: 10, rendement_max: 12 }).map((v) => v.ville);
  assert.ok(haut.includes('Nazelles-Négron'));
  assert.ok(!haut.includes('Cannes'));
  const bas = chercherVilles({ rendement_min: 5, rendement_max: 5.5 }).map((v) => v.ville);
  assert.ok(bas.includes('Paris 6e'));
  assert.ok(!bas.includes('Autun'));
  // Sans critère de rendement, tout le tableau est là.
  assert.equal(chercherVilles({}).length, reference().villes.length);
  assert.equal(chercherVilles({ texte: 'dijon' }).length, 1);
  assert.ok(chercherVilles({ famille: 'Paris intra-muros' }).every((v) => v.ville.startsWith('Paris')));
});

test('une ville déjà prospectée rend son loyer au mètre, donc la surface à chercher', () => {
  const ville = Records.create('Ville', { nom: 'Dijon', code_insee: dijon.insee, rues: [] });
  for (const loyer of [380, 400, 420]) {
    Records.create('Cible', { ville_id: ville.id, valorisation: { loyer_m2_marche: loyer } });
  }
  const d = chercherVilles({ prix_min: 200000, prix_max: 300000, rendement_min: 8, rendement_max: 8.5 }).find((v) => v.ville === 'Dijon');
  assert.equal(d.ville_id, ville.id);
  assert.equal(d.loyer_m2, 400);
  assert.deepEqual(d.surface, [40, 64], 'un local de 40 à 64 m² porte ce loyer');
  assert.equal(d.cibles, 3);
});

test('le loyer annuel : celui qu\'on a calculé, sinon celui que la surface donne', () => {
  assert.deepEqual(loyerAnnuelDe({ valorisation: { loyer_annuel: 20000.4 } }), { montant: 20000, estime: false });
  assert.deepEqual(loyerAnnuelDe({ valorisation: { loyer_m2_marche: 400, surface_estimee: 50 } }), { montant: 20000, estime: true });
  assert.equal(loyerAnnuelDe({ valorisation: { loyer_m2_marche: 400 } }), null);
  assert.equal(loyerAnnuelDe(null), null);
});

test('les cibles retenues sont celles dont le prix à ce rendement tient dans le budget', () => {
  const ville = Records.list('Ville')[0];
  Records.create('Cible', { ville_id: ville.id, enseigne: 'Pizzeria Chez Truc', rue: 'Rue de la Liberté', pile: 'appeler', valorisation: { loyer_annuel: 20000, surface: 50 } });
  Records.create('Cible', { ville_id: ville.id, enseigne: 'Boutique de luxe', pile: 'ecrire', valorisation: { loyer_annuel: 90000 } });
  Records.create('Cible', { ville_id: ville.id, enseigne: 'Kiosque', pile: 'ecrire', valorisation: { loyer_annuel: 4000 } });
  const r = chercherCibles({ prix_min: 200000, prix_max: 300000, rendement_min: 8, rendement_max: 8.5 });
  assert.deepEqual(r.map((c) => c.nom), ['Pizzeria Chez Truc']);
  const p = r[0];
  // 20 000 € de loyer : de 235 000 € (8,5 %) à 250 000 € (8 %).
  assert.deepEqual(p.prix, [235294, 250000]);
  assert.equal(p.prix_propose, 243000);
  assert.equal(p.rendement, 8.2);
  assert.equal(p.loyer_estime, false);
  assert.equal(p.ville, 'Dijon');
  // Sans budget, on ne propose rien : le prix est ce qui fait la cible.
  assert.deepEqual(chercherCibles({ rendement_min: 8 }), []);
  assert.deepEqual(chercherCibles({ prix_min: 200000, prix_max: 300000, rendement_min: 8, rendement_max: 8.5, villes: ['autre'] }), []);
});

test('le taux visé dit quels emplacements lire', () => {
  // Un rendement bas se paie sur la rue qui ne se discute pas ; un rendement
  // haut se trouve en retrait. Sans taux, on lit tout.
  assert.deepEqual(classesPourTaux(6.5), [1, 1.5]);
  assert.deepEqual(classesPourTaux(8), [1.5, 2]);
  assert.deepEqual(classesPourTaux(10.5), [2]);
  assert.equal(classesPourTaux(null), null);
});
