// L'avis écrit sans étiquette ni « à confirmer », ses lignes lues à l'adresse, sa valeur locative et sa page juridique
// (3 nov. 2026, Jules : « gagner la confiance, qu'on n'ait pas à tout relire »).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-avis-ecriture-'));
const { sansEtiquettes, juridiqueSignale, phraseValeurLocative, completerAvecLectures, avisProvisoire, lectureFraiche } = await import('./mandataire-avis.js');
const { lignesDeLEmplacement, lireEmplacement } = await import('./emplacement-auto.js');
const espace = (t) => String(t).replace(/[\u202f\u00a0]/g, ' ');

test("plus d'étiquette de source entre parenthèses, ni « à confirmer »", () => {
  assert.equal(sansEtiquettes('Emplacement n°1 bis (mandataire).'), 'Emplacement n°1 bis.');
  assert.equal(sansEtiquettes("Fin de bail 2027 (dit par l'exploitante, à confirmer)"), 'Fin de bail 2027');
  assert.equal(sansEtiquettes('Locataire présent depuis 2018, à confirmer.'), 'Locataire présent depuis 2018.');
  assert.equal(sansEtiquettes('12 commerces à 150 m (OpenStreetMap) ; métro Cordeliers (Google Maps).'), '12 commerces à 150 m ; métro Cordeliers.');
  // Ce qui n'est pas une provenance reste.
  assert.equal(sansEtiquettes('15,3 % (taux estimé)'), '15,3 % (taux estimé)');
  assert.equal(sansEtiquettes('Taxe foncière : 2 000 € (locataire)'), 'Taxe foncière : 2 000 € (locataire)');
  assert.equal(sansEtiquettes('Boutique (RDC) avec réserve'), 'Boutique (RDC) avec réserve');
});

test('les lignes Commerces voisins, Accès et Vacance, écrites depuis les lectures', () => {
  const l = lignesDeLEmplacement({
    commerces_150m: { nombre: 12, restauration: 3, enseignes: ['Carrefour City', 'Paul'] },
    transports_300m: { métro: ['Cordeliers'], 'arrêt de bus': ['Opéra'], parking: ['Grolée'] },
    vacance: { taux_estime: 9.4 },
  });
  assert.equal(l.commerces_voisins, '12 commerces à moins de 150 m, dont 3 cafés ou restaurants ; enseignes voisines : Carrefour City, Paul.');
  assert.equal(l.acces, 'Métro Cordeliers ; Bus Opéra ; Parking Grolée, à moins de 300 m.');
  assert.equal(espace(l.vacance), '9,4 % (taux estimé)');
  // Les commerces que Klocka connaît prennent le relais d'OpenStreetMap.
  assert.match(lignesDeLEmplacement({ commerces_klocka: { commerces: 5, activites: [{ activite: 'Coiffure', n: 2 }], enseignes_nationales: [{ marque: 'Quick' }] } }).commerces_voisins, /^5 commerces .*coiffure 2.*Quick\.$/);
  assert.deepEqual(lignesDeLEmplacement({}), {});
});

test("l'emplacement rend ce qui est lu à temps, la suite arrive après", async () => {
  let suite = 'rien';
  const lent = () => new Promise((ok) => setTimeout(() => ok({ taux_estime: 12 }), 80));
  const r = await lireEmplacement('x', { lieu: { lat: 45.76, lon: 4.83 }, delai: 20, surComplet: (tout) => { suite = tout; }, outils: {
    transportsGoogle: async () => [{ nom: 'Cordeliers', type: 'subway_station' }], vacance: lent,
  } });
  assert.deepEqual(r.transports_300m.métro, ['Cordeliers']);
  assert.equal(r.vacance, undefined);
  await new Promise((ok) => setTimeout(ok, 120));
  assert.equal(suite.vacance.taux_estime, 12);
});

test('la valeur locative de marché, de Data-B, sans modèle', () => {
  const p = espace(phraseValeurLocative({ rue: { basse: 180, haute: 240 }, source: 'Data-B · Valeurs locatives' }, { surface: 110, loyer: 18000 }));
  assert.equal(p, 'Selon Data-B, la valeur locative de marché se situe entre 180 et 240 € HT HC par m² et par an dans la rue, soit environ 23 100 € par an pour 110 m². Le loyer en place, 164 € par m², se situe sous la fourchette.');
  assert.match(phraseValeurLocative({ ville: { basse: 150, haute: 150 }, source: 'Equimmox · baux existants (Data-B indisponible)' }), /^Selon Equimmox, .* autour de 150 € .* dans la ville\.$/);
  assert.equal(phraseValeurLocative(null), null);
});

test('une lecture arrivée après la rédaction remplit les cases vides, jamais une retouche', () => {
  const avis = { locatif: { valeur_locative: '' }, marche: { loyers: null }, emplacement: { lignes: [{ mot: 'Accès', texte: 'Métro à deux pas, dit à la main' }, { mot: 'Vacance', texte: '[à compléter]' }] } };
  const { avis: a, change } = completerAvecLectures(avis, {
    marche: { rue: { basse: 200, haute: 260 }, source: 'Data-B' },
    emplacement: { vacance: { taux_estime: 8 }, transports_300m: { métro: ['Opéra'] }, commerces_150m: { nombre: 4, restauration: 0, enseignes: [] } },
    q: { surface_utile: 50 },
  });
  assert.equal(change, true);
  assert.match(a.locatif.valeur_locative, /^Selon Data-B/);
  assert.deepEqual(a.marche.loyers, { basse: 200, haute: 260, source: 'Data-B' });
  assert.equal(a.emplacement.lignes[0].texte, 'Métro à deux pas, dit à la main');
  assert.equal(espace(a.emplacement.lignes[1].texte), '8 % (taux estimé)');
  assert.equal(a.emplacement.lignes[2].mot, 'Commerces voisins');
  assert.equal(completerAvecLectures(a, { marche: { rue: { basse: 1, haute: 2 } } }).change, false);
});

test('la page juridique : rien de signalé, rien ; sinon ce qui a été dit', () => {
  for (const non of ['non', 'Non, rien.', 'rien à signaler', 'RAS', 'je ne sais pas']) assert.equal(juridiqueSignale({ juridique: non }), null, non);
  assert.equal(juridiqueSignale({}), null);
  const j = juridiqueSignale({ juridique: 'Ravalement voté en AG de mars 2026 (mandataire)', copropriete: 'Copropriété de 12 lots' });
  assert.equal(j.libre, 'Ravalement voté en AG de mars 2026');
  assert.deepEqual(j.lignes, [{ mot: 'Copropriété', texte: 'Copropriété de 12 lots' }]);
  const a = avisProvisoire({ questionnaire: { type_bien: 'murs_commerce', adresse: '1 rue X', juridique: 'non' } });
  assert.deepEqual(a.juridique, { synthese: '', lignes: [] });
});

test("l'emplacement lu en fond paraît dans l'avis avant la rédaction", () => {
  const le = new Date().toISOString();
  const a = avisProvisoire({ questionnaire: { adresse: '1 rue X' }, emplacement_lu: { adresse: '1 rue X', le, lu: { transports_300m: { gare: ['Nice-Ville'] } } } });
  assert.deepEqual(a.emplacement.lignes, [{ mot: 'Accès', texte: 'Gare Nice-Ville, à moins de 300 m.' }]);
  assert.equal(lectureFraiche({ adresse: '1 rue X', le }, '2 rue Y'), false);
});
