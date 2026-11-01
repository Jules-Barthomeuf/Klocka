import test from 'node:test';
import assert from 'node:assert/strict';
import { ajusterTaux, valeurParRendement, estimerParRendement, lectureDuTaux, echeanceDuBail, rangDeLaRue } from './taux-rendement.js';
import { manquants } from './mandataire-avis.js';

const LE = new Date(2026, 9, 31);

test("l'exemple d'Antibes : 25 200 € à 6,5 %, rue n°1, indépendant installé, bail renouvelé en 2021 : 6 %, 420 k€", () => {
  const q = { occupe: true, loyer_annuel_hc: 25200, taux_base: 6.5, rang_rue: 'n1', profil_locataire: 'solide', date_effet: '2021-03-01', echeance: '2030-02-28', charges_refacturees: 'oui', taxe_fonciere_refacturee: 'oui' };
  const e = estimerParRendement(q, { loyer: 25200, aujourdhui: LE });
  assert.equal(e.taux, 6);
  assert.deepEqual(e.ajustements, [{ delta: -0.5, motif: 'emplacement n°1' }]);
  assert.equal(e.moyenne, 420000);
  assert.equal(e.basse, 403000, '6,25 %');
  assert.equal(e.haute, 438000, '5,75 %');
  assert.equal(lectureDuTaux(e), 'taux de base 6,5 % ; emplacement n°1 −0,5 ; retenu 6 %');
});

test('chaque critère de la grille bouge le taux dans le bon sens', () => {
  const base = { occupe: true, loyer_annuel_hc: 30000 };
  const t = (q, o = {}) => ajusterTaux(6.5, { ...base, ...q }, { aujourdhui: LE, ...o }).taux;
  assert.equal(t({ rang_rue: 'n2' }), 7);
  assert.equal(t({ rang_rue: 'n1bis' }), 6.5);
  assert.equal(t({ profil_locataire: 'enseigne' }), 6);
  assert.equal(t({ franchise: 'oui' }), 6, "l'enseigne dite par le critère Data-B compte aussi");
  assert.equal(t({ profil_locataire: 'fragile' }), 7.25);
  assert.equal(t({ date_effet: '2025-01-01', echeance: '2034-01-01' }), 6.25, 'bail récent');
  assert.equal(t({ date_effet: '2018-01-01', echeance: '2027-06-30' }), 7, 'fin de bail dans moins de 2 ans');
  assert.equal(t({}, { loyerMarche: 40000 }), 6.25, 'loyer bas : potentiel de hausse');
  assert.equal(t({}, { loyerMarche: 30000 }), 6.5, 'loyer au marché : neutre');
  assert.equal(t({}, { loyerMarche: 25000 }), 7, 'loyer haut');
  assert.equal(t({}, { loyerMarche: 20000 }), 7.5, 'loyer nettement trop haut');
  assert.equal(t({ charges_refacturees: 'non' }), 6.75);
  assert.equal(t({ charges_refacturees: 'non', taxe_fonciere_refacturee: 'non' }), 7);
  assert.equal(t({ vacance_rue_pct: 18 }), 7);
  assert.equal(t({ rang_rue: 'nc', profil_locataire: 'nc', charges_refacturees: 'nc' }), 6.5, '« nc » ne bouge rien');
});

test('le taux reste entre 4 et 10 % ; un bien libre ne lit ni le bail ni le locataire', () => {
  const haut = ajusterTaux(9.5, { occupe: true, rang_rue: 'n2', profil_locataire: 'fragile' }, { aujourdhui: LE });
  assert.equal(haut.taux, 10);
  assert.equal(haut.borne, true);
  assert.equal(ajusterTaux(4.2, { rang_rue: 'n1' }).taux, 4);
  assert.equal(ajusterTaux(6.5, { occupe: false, profil_locataire: 'fragile', charges_refacturees: 'non' }).taux, 6.5);
});

test('sans taux de base validé ou sans loyer, pas de valeur', () => {
  assert.equal(estimerParRendement({ occupe: true }, { loyer: 25200 }), null);
  assert.equal(valeurParRendement({ loyer: null, taux: 6 }), null);
});

test('les murs de commerce demandent le rang de la rue et le taux de base ; occupés, le locataire et qui paie', () => {
  const q = { type_bien: 'murs_commerce', occupe: true, adresse: '1 rue X, Antibes', demandeur: 'SCI', surface_utile: 60, etat: 'bon', date_visite: '30 octobre 2026', facade: '6 m' };
  const m = manquants(q);
  for (const k of ['rang_rue', 'taux_base', 'profil_locataire', 'charges_refacturees', 'taxe_fonciere_refacturee']) assert.ok(m.includes(k), k);
  for (const k of ['etat_immeuble', 'extraction', 'licence_4']) assert.ok(!m.includes(k), `${k} n'est plus obligatoire`);
  assert.ok(!manquants({ ...q, occupe: false }).includes('profil_locataire'), 'libre : pas de locataire');
});

test("les corrections s'apprennent : la médiane validée dans la ville, l'écart moyen des propositions, sans les essais", async () => {
  const { reperesAppris, villeDuTexte } = await import('./taux-rendement.js');
  const lignes = [
    { ville: 'Antibes', propose: 5.5, valide: 6.4, le: '2026-10-20' },
    { ville: 'ANTIBES', propose: 6, valide: 6.3, le: '2026-10-25' },
    { ville: 'Antibes', propose: 5, valide: 6.5, le: '2026-10-26', test: true },
    { ville: 'Nice', propose: 5.5, valide: 5.5, le: '2026-10-22' },
  ];
  const a = reperesAppris(lignes, 'Antibes');
  assert.equal(a.taux_valides_ville.nombre, 2);
  assert.equal(a.taux_valides_ville.mediane, 6.35);
  assert.equal(a.taux_valides_ville.derniers[0].valide, 6.3, 'le plus récent en premier');
  assert.equal(a.ecart_moyen_ville, 0.6, 'il proposait trop bas de 0,6 pt');
  assert.equal(a.ecart_moyen_partout, 0.4);
  assert.equal(reperesAppris(lignes, 'Cannes').taux_valides_ville, null);
  assert.equal(villeDuTexte('12 rue de la République, 06600 Antibes'), 'Antibes');
});

test("le loyer de marché retenu est le milieu de la fourchette, jamais une « moyenne » qui en sort (1er nov. 2026)", async () => {
  const { loyerDeMarcheM2 } = await import('./mandataire-avis.js');
  assert.equal(loyerDeMarcheM2({ basse: 244, haute: 365 }), 305, 'Data-B, Lorient');
  assert.equal(loyerDeMarcheM2({ basse: 309, haute: 446, moyenne: 561 }), 378, 'la moyenne hors fourchette est ignorée');
  assert.equal(loyerDeMarcheM2({ haute: 300 }), 300);
  assert.equal(loyerDeMarcheM2(null), null);
});

test("l'échéance d'un 3-6-9 se calcule depuis la date d'effet (1er nov. 2026, Jules : « j'ai pas besoin de lui dire »)", () => {
  const le = new Date(2026, 10, 1);
  assert.deepEqual(echeanceDuBail({ date_effet: '1er mars 2019', bail_type: '3-6-9' }, le), { echeance: '01/03/2028', duree: 9, suppose: false, tacite: false });
  assert.equal(echeanceDuBail({ date_effet: '2020-09-01', bail_type: 'bail commercial' }, le).echeance, '01/09/2029');
  assert.equal(echeanceDuBail({ date_effet: '01/01/2021', bail_type: 'professionnel' }, le).echeance, '01/01/2027');
  // Des murs de commerce sans type dit : un 3-6-9, dit supposé ; échu, il court en tacite prolongation.
  assert.deepEqual(echeanceDuBail({ date_effet: '15/06/2014', type_bien: 'murs_commerce' }, le), { echeance: '15/06/2023', duree: 9, suppose: true, tacite: true });
  assert.equal(echeanceDuBail({ date_effet: '01/01/2025', bail_type: 'dérogatoire' }, le), null);
  assert.equal(echeanceDuBail({ bail_type: '3-6-9' }, le), null);
});

test("le rang de la rue se propose d'après le loyer de la rue comparé à la ville (1er nov. 2026, Jules)", () => {
  const ville = { nom: 'Lyon 2e Arrondissement', basse: 323, haute: 484 };
  const r = rangDeLaRue({ rue: { nom: 'Rue de la République', basse: 547, haute: 820 }, ville });
  assert.equal(r.rang, 'n1');
  assert.match(r.raison, /Rue de la République se loue 547–820 €\/m²\/an, 1,7 fois Lyon 2e/);
  assert.equal(rangDeLaRue({ rue: { basse: 420, haute: 560 }, ville }).rang, 'n1bis');
  assert.equal(rangDeLaRue({ rue: { basse: 300, haute: 420 }, ville }).rang, 'n2');
  assert.equal(rangDeLaRue({ rue: { basse: 300, haute: 420 } }), null);
});
