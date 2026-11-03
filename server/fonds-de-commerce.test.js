// Le fonds de commerce dans la Prospection (3 nov. 2026, Jules : « soit on cherche des murs, soit on cherche des fonds »).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_TEST_CONTEXT ||= '1';
const { fondsDe, echeancesDuBail } = await import('./off-market/simple.js');
const { fondsDeLaFiche } = await import('./fiche-mandataire.js');
const { FILTRES_SIMPLE, comprendre, passeSimple } = await import('../src/lib/off-market-simple.js');

const MAINTENANT = Date.parse('2026-11-03T12:00:00Z');
const cles = (c) => fondsDe(c, { maintenantMs: MAINTENANT }).map((x) => x.cle);
const gerant = (g) => ({ exploitant: { gerants: [g], comptes_deposes: false } });

test('les raisons de céder un fonds : dirigeant de plus de 60 ans, ancienneté, résultat en plus', () => {
  assert.deepEqual(cles(gerant({ nom: 'A', tranche_age: '70+' })), ['dirigeant_70']);
  assert.deepEqual(cles(gerant({ nom: 'A', tranche_age: '50-70', plus_de_60: true })), ['dirigeant_60'], 'relu dans l’annuaire');
  assert.deepEqual(cles(gerant({ nom: 'A', tranche_age: '50-70' })), [], '50-70 ans, pas encore relu, n’est pas « plus de 60 ans »');
  assert.deepEqual(cles({ ...gerant({ nom: 'A', tranche_age: '50-70' }), depuis: '2009-01-01' }), [], 'l’ancienneté seule ne fait pas un fonds');
  // SIRENE ramène les vieux établissements à 2008 : la création de la société exploitante fait foi si elle est plus ancienne.
  assert.deepEqual(cles({ depuis: '2008-01-01', exploitant: { creation: '1995-03-01', gerants: [{ tranche_age: '70+' }] } }), ['dirigeant_70', 'ancien_20']);
  const ideal = { depuis: '2001-01-01', exploitant: { gerants: [{ nom: 'A', tranche_age: '70+' }], comptes_deposes: true, derniers_comptes: { ca: 300000, resultat_net: 40000 } } };
  assert.deepEqual(cles(ideal), ['dirigeant_70', 'ancien_20', 'ideal']);
  assert.deepEqual(cles({ depuis: '2024-01-01', exploitant: { comptes_deposes: true, derniers_comptes: { resultat_net: 40000 } } }), [], 'un résultat seul ne fait pas vendre');
});

test('procédure collective, et le bail 3-6-9 estimé depuis l’ouverture de l’établissement', () => {
  assert.deepEqual(cles({ evenements: [{ type: 'procédure collective', date: '2026-02-01' }] }), ['procedure']);
  assert.deepEqual(cles({ evenements: [{ type: 'procédure collective', date: '2020-02-01' }] }), [], 'trop ancienne');
  assert.deepEqual(echeancesDuBail('2018-06-01', MAINTENANT), { triennale: '2027-06-01', fin: '2027-06-01', periode: 1, fin_dans_l_annee: true });
  assert.deepEqual(echeancesDuBail('2016-03-10', MAINTENANT), { triennale: '2028-03-10', fin: '2034-03-10', periode: 2, fin_dans_l_annee: false }, 'renouvelé : 2e période');
  assert.equal(echeancesDuBail('1900-01-01x', MAINTENANT), null);
  assert.deepEqual(cles({ ouvert_le: '2018-06-01' }), [], 'la fin de bail seule ne fait pas un fonds');
  assert.deepEqual(cles({ ...gerant({ tranche_age: '70+' }), ouvert_le: '2018-06-01' }), ['dirigeant_70', 'bail_echeance']);
  // L'ouverture fait foi pour l'ancienneté : une société de 1990 arrivée ici en 2018 n'est pas installée depuis 35 ans.
  assert.deepEqual(cles({ ...gerant({ tranche_age: '70+' }), ouvert_le: '2018-06-01', exploitant: { creation: '1990-01-01', gerants: [{ tranche_age: '70+' }] } }), ['dirigeant_70', 'bail_echeance']);
});

test('pas de fonds à céder : chaîne, fermé, fonds cédé depuis moins de deux ans', () => {
  const vieux = { depuis: '1990-01-01', exploitant: { gerants: [{ tranche_age: '70+' }] } };
  assert.deepEqual(cles({ ...vieux, chaine: true }), []);
  assert.deepEqual(cles({ ...vieux, actif: false }), []);
  assert.deepEqual(cles({ ...vieux, evenements: [{ type: 'cession', date: '2026-01-10' }] }), []);
  assert.ok(cles({ ...vieux, evenements: [{ type: 'cession', date: '2020-01-10' }] }).length, 'une cession ancienne ne compte plus');
});

test('Murs ou Fonds : chacun a ses filtres', () => {
  const murs = { lien: 'tiers', drapeaux: [], fonds: [] };
  const fonds = { lien: 'inconnu', drapeaux: [], fonds: ['dirigeant_70'], ville: 'Lyon', ca: 400000, resultat: 30000 };
  const f = { ...FILTRES_SIMPLE, emplacement: 'partout', liens: ['exploitant', 'tiers'] };
  assert.equal(passeSimple(murs, f), true);
  assert.equal(passeSimple(fonds, f), false, 'un propriétaire inconnu, pas montré pour les murs');
  assert.equal(passeSimple(fonds, { ...f, types: ['fonds'] }), true, 'le lien ne compte pas pour un fonds');
  assert.equal(passeSimple(murs, { ...f, types: ['fonds'] }), false);
  const F = { ...f, types: ['fonds'] };
  assert.equal(passeSimple(fonds, { ...F, fonds: ['ancien'] }), false, 'le signal coché');
  assert.equal(passeSimple(fonds, { ...F, fonds: ['ancien', 'dirigeant'] }), true);
  assert.equal(passeSimple(fonds, { ...F, ville: 'Mâcon' }), false, 'la zone');
  assert.equal(passeSimple(fonds, { ...F, ca: '1000000' }), false, 'le chiffre d’affaires');
  assert.equal(passeSimple(fonds, { ...F, ca: '300000', resultat: 'positif' }), true);
});

test('la phrase du chat : « fonds de commerce » coche le type, « fonds cédé » reste un signal des murs', () => {
  assert.deepEqual(comprendre('des fonds de commerce de boulangerie').filtres.types, ['fonds']);
  assert.deepEqual(comprendre('fonds à céder').filtres.types, ['fonds']);
  assert.deepEqual(comprendre('fonds à céder').filtres.drapeaux, []);
  assert.deepEqual(comprendre('fonds cédé').filtres.types, ['murs']);
  assert.deepEqual(comprendre('fonds de commerce, dirigeant à la retraite').filtres.fonds, ['dirigeant']);
});

test('la fiche du fonds : dirigeant, chiffres, bail, et ses murs s’il les possède', () => {
  const cs = { lien: 'exploitant_certain', depuis: '1998-01-01', telephone: '04 78 00 00 00', exploitant: { gerants: [{ nom: 'Jean Martin', tranche_age: '70+' }], comptes_deposes: true, derniers_comptes: { ca: 420000, resultat_net: 35000 } } };
  const f = fondsDeLaFiche(cs);
  assert.equal(f.dirigeant.nom, 'Jean Martin');
  assert.equal(f.dirigeant.age, '70 ans et plus');
  assert.equal(f.chiffres, 'CA 420 k€ · résultat 35 k€');
  assert.equal(f.murs_aussi, true);
  assert.match(f.bail, /il possède ses murs/);
  assert.equal(f.telephone, '04 78 00 00 00');
  assert.ok(f.raisons.includes('Dirigeant âgé et résultat positif'));
  assert.equal(fondsDeLaFiche({ ...cs, lien: 'tiers', proprietaire: { nom: 'SCI Bellecour' } }).bail, null, 'sans date d’ouverture, rien d’estimé');
  assert.match(fondsDeLaFiche({ ...cs, lien: 'tiers', ouvert_le: '2014-03-01' }).bail, /^Ouvert en 2014 · échéance triennale \d\d\/20\d\d · fin du bail \d\d\/20\d\d.*estimées$/);
  assert.equal(fondsDeLaFiche({ ...cs, exploitant: { ...cs.exploitant, comptes: { 2023: {}, 2024: {} } } }).chiffres, 'CA 420 k€ · résultat 35 k€ · exercice 2024');
});

test('les bureaux : leurs signaux, un point par immeuble, la page Bureaux', async () => {
  const { bureauDe } = await import('./off-market/simple.js');
  const { parImmeuble } = await import('./mandataire-prospecter.js');
  const { passeBureau } = await import('../src/lib/off-market-simple.js');
  const b = (x) => bureauDe({ classe: 'bureau', adresse: '12 RUE DE LA REPUBLIQUE', ...x }, { maintenantMs: MAINTENANT }).map((s) => s.cle);
  assert.deepEqual(b({}), []);
  assert.deepEqual(b({ evenements: [{ type: 'radiation ou dissolution', date: '2026-03-01' }] }), ['occupant_parti']);
  assert.deepEqual(b({ evenements: [{ type: 'procédure collective', date: '2026-03-01' }] }), ['procedure']);
  assert.deepEqual(b({ evenements: [{ type: 'transfert de siège', date: '2026-06-01' }], exploitant: { siege: { adresse: '4 AVENUE FOCH 69006 LYON' } } }), ['demenage'], 'le siège est parti ailleurs');
  assert.deepEqual(b({ evenements: [{ type: 'transfert de siège', date: '2026-06-01' }], exploitant: { siege: { adresse: '12 RUE DE LA REPUBLIQUE 69002 LYON' } } }), [], 'le siège est arrivé ici');
  assert.deepEqual(b({ proprietaire: { gerants: [{ tranche_age: '70+' }] } }), ['sci_agee']);
  assert.deepEqual(bureauDe({ classe: 'commerce', evenements: [{ type: 'procédure collective', date: '2026-03-01' }] }), [], 'un commerce n’a pas de signal de bureau');
  const pts = parImmeuble([
    { id: 'a', lat: 45.1, lon: 4.8, titre: 'Cabinet A', adresse: '12 rue X', bureaux: [] },
    { id: 'b', lat: 45.1, lon: 4.8, titre: 'Conseil B', adresse: '12 rue X', bureaux: ['demenage'], proprietaire: 'SCI X' },
    { id: 'c', lat: 45.2, lon: 4.8, titre: 'Agence C', bureaux: [] },
  ]);
  assert.equal(pts.length, 2);
  assert.equal(pts[0].id, 'b', 'l’occupant au signal porte la fiche');
  assert.equal(pts[0].occupants, 2);
  assert.deepEqual(pts[0].bureaux, ['demenage']);
  assert.equal(pts[0].titre, '12 rue X');
  const f = { ...FILTRES_SIMPLE, emplacement: 'partout', types: ['bureaux'] };
  assert.equal(passeSimple({ classe: 'bureau', bureaux: ['demenage'], occupants: 2 }, f), true);
  assert.equal(passeSimple({ classe: 'bureau', bureaux: [], occupants: 12 }, f), false, 'sans signal, pas sur la carte');
  assert.equal(passeSimple({ classe: 'commerce', lien: 'tiers', drapeaux: [], fonds: [] }, f), false, 'un commerce n’est pas un bureau');
  assert.equal(passeSimple({ classe: 'bureau', lien: 'tiers', drapeaux: [], bureaux: [] }, { ...FILTRES_SIMPLE, emplacement: 'partout', classes: ['bureau'] }), true, 'l’Off-market de l’équipe garde ses bureaux');
  assert.equal(passeBureau({ classe: 'bureau', bureaux: ['demenage'], occupants: 2 }, { ...f, occupants: '3' }), false);
  assert.equal(passeSimple({ classe: 'bureau', bureaux: ['sci_agee'] }, { ...f, types: ['murs', 'bureaux'] }), true, 'murs et bureaux ensemble');
});
