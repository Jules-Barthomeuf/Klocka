// Les murs libres de la Prospection (3 nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Une base jetable avant tout import de db.js : un test n'écrit jamais dans la base locale.
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-murs-libres-'));
process.env.NODE_TEST_CONTEXT ||= '1';
const M = await import('./murs-libres.js');
const V = await import('./outils/vacance-taux.js');
const { reponsesDeLaVisite } = await import('./mandataire-avis.js');
const { passeLibre, FILTRES_LIBRES, duree } = await import('../src/lib/murs-libres.js');

const MAINTENANT = Date.parse('2026-11-03T12:00:00Z');
const etab = (siret, adresse, etat, ferme = null, x = {}) => ({ siret, siren: siret.slice(0, 9), denomination: x.nom || `SOCIETE ${siret}`, enseigne: 'enseigne' in x ? x.enseigne : 'ENSEIGNE', adresse, code_naf: x.naf || '47.11B', etat, date_fermeture: ferme, date_creation: '2010-01-01', lat: 43.58, lon: 7.12, categorie_juridique: x.cj || '5499' });

test('un local vide : le dernier commerce a fermé, aucun ouvert depuis, pas repris dans notre base', () => {
  const etabs = [
    etab('11111111100011', '12 RUE SADI CARNOT 06600 ANTIBES', 'ferme', '2026-03-01'),
    etab('22222222200011', '14 RUE SADI CARNOT 06600 ANTIBES', 'ferme', '2026-01-01'),
    etab('33333333300011', '14 RUE SADI CARNOT 06600 ANTIBES', 'actif'),
    etab('44444444400011', '16 RUE SADI CARNOT 06600 ANTIBES', 'ferme', '2026-05-01'),
    etab('55555555500011', '18 RUE SADI CARNOT 06600 ANTIBES', 'ferme', '2020-01-01'),
    etab('66666666600011', '20 RUE SADI CARNOT 06600 ANTIBES', 'ferme', '2026-06-01', { cj: '1000', enseigne: null, nom: 'DUPONT MARIE' }),
  ];
  const occupees = new Set([V.cleLocal('16 rue Sadi-Carnot')]);
  const pts = M.locauxLibres(etabs, { code: '06004', etats: V.etatsDesLocaux, occupees, voiesCentre: new Set(['RUE SADI CARNOT']), maintenantMs: MAINTENANT });
  // 14 : un commerce ouvert ; 16 : repris (notre base) ; 18 : fermé il y a plus de trois ans ; 20 : un entrepreneur à domicile.
  assert.deepEqual(pts.map((p) => p.cle), ['12 RUE SADI CARNOT']);
  const p = pts[0];
  assert.equal(p.mois_vide, 8);
  assert.equal(p.centre, true);
  assert.equal(p.id, M.idLibre('06004', '12 RUE SADI CARNOT'), 'un identifiant stable');
  assert.equal(M.accroche({ ...p, adresse: '12 Rue Sadi Carnot' }), 'Votre local du 12 Rue Sadi Carnot est vide depuis 8 mois. Je peux vous trouver un locataire, ou un acheteur.');
});

test('Google Maps tranche : un repreneur fait disparaître le local', () => {
  const opts = { typesEtage: V.TYPES_ETAGE, memeCommerce: V.memeCommerce };
  assert.equal(M.verdictGoogle([{ nom: 'Boulangerie Paul', statut: 'OPERATIONAL', type: 'bakery' }], 'Vival', opts).etat, 'occupe');
  assert.equal(M.verdictGoogle([{ nom: 'Vival', statut: 'OPERATIONAL', type: 'grocery_store' }], 'Vival', opts).etat, 'incertain');
  assert.equal(M.verdictGoogle([{ nom: 'Cabinet', statut: 'OPERATIONAL', type: 'lawyer' }], 'Vival', opts).etat, 'vacant', 'un cabinet à l’étage ne reprend pas la vitrine');
  assert.equal(M.verdictGoogle([], 'Vival', opts).etat, 'vacant');
});

test('Paris, Lyon, Marseille se lisent par arrondissement', () => {
  assert.equal(M.communesDe('69123').length, 9);
  assert.equal(M.communesDe('69123')[0], '69381');
  assert.deepEqual(M.communesDe('06004'), ['06004']);
  assert.deepEqual(M.communesDe(null), []);
  assert.equal(M.depuisQuand(0), "depuis moins d'un mois");
  assert.equal(M.depuisQuand(30), 'depuis 2 ans');
});

test("l'avis d'un local libre s'ouvre libre, sans locataire", () => {
  const r = reponsesDeLaVisite({ libre: true, commerce: 'Local vide, 12 rue Sadi Carnot', nom: 'SCI DU PORT', adresse: '12 rue Sadi Carnot', ville: 'Antibes' });
  assert.equal(r.occupe, false);
  assert.ok(!r.locataire);
  assert.equal(r.demandeur, 'SCI DU PORT');
});

test('les filtres des murs libres', () => {
  const p = { titre: '12 rue Sadi Carnot', mois_vide: 8, centre: true, activite: 'Boulangerie', proprietaire: null };
  assert.ok(passeLibre(p, FILTRES_LIBRES));
  assert.ok(passeLibre(p, { ...FILTRES_LIBRES, depuis: '6' }));
  assert.ok(!passeLibre(p, { ...FILTRES_LIBRES, depuis: '12' }));
  assert.ok(!passeLibre(p, { ...FILTRES_LIBRES, proprietaire: 'connu' }));
  assert.ok(!passeLibre({ ...p, centre: false }, { ...FILTRES_LIBRES, emplacement: 'centre' }));
  assert.equal(duree(30), '2 ans');
});
