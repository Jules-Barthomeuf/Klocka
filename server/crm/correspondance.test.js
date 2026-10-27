import test from 'node:test';
import assert from 'node:assert/strict';
import { camel, valeurOption, libellesDe, objetDe, champsDe, valeurTwenty, enregistrementDe, libellesManquants, telephone } from './correspondance.js';

test('noms : camelCase sans accents, valeur d\'option en majuscules', () => {
  assert.equal(camel('Prochaine relance'), 'prochaineRelance');
  assert.equal(camel('SPOC/Analyste'), 'spocAnalyste');
  assert.equal(camel('E-mail'), 'eMail');
  assert.equal(camel('2e contact'), 'c2eContact');
  assert.equal(valeurOption('Sous offre'), 'SOUS_OFFRE');
  assert.equal(valeurOption('Archivé'), 'ARCHIVE');
  assert.equal(valeurOption('1er appel'), 'V_1ER_APPEL');
});

test('libellés : statut (objet indexé) et liste (tableau), sans doublon', () => {
  assert.deepEqual(libellesDe({ settings_str: '{"labels":{"1":"Vendu","0":"Analyse en cours","5":"vendu"}}' }), ['Analyse en cours', 'Vendu']);
  assert.deepEqual(libellesDe({ settings_str: '{"labels":[{"id":1,"name":"Nice"},{"id":2,"name":"Antibes"}]}' }), ['Nice', 'Antibes']);
  assert.deepEqual(libellesDe({ settings_str: 'pas du json' }), []);
});

test('objet : préfixe KP pour KPARTNERS, suffixe quand le nom est déjà pris', () => {
  const pris = new Set();
  assert.equal(objetDe({ id: '2110793610', name: 'Agent immobilier', workspace: { name: 'KLOCKA PRINCIPAL' } }, pris).nameSingular, 'agentImmobilier');
  const kp = objetDe({ id: '5091573479', name: 'Prospects', workspace: { name: 'KPARTNERS' } }, pris);
  assert.equal(kp.nameSingular, 'kpProspects');
  assert.equal(kp.labelPlural, 'KP · Prospects');
  assert.equal(objetDe({ id: '9990001234', name: 'Agent immobilier' }, pris).nameSingular, 'agentImmobilier1234');
});

test('champs : colonnes calculées écartées, noms réservés évités, champs Monday ajoutés', () => {
  const champs = champsDe([
    { id: 'name', title: 'Nom', type: 'name' },
    { id: 'status', title: 'Statut', type: 'status', settings_str: '{"labels":{"0":"Vendu"}}' },
    { id: 'f', title: 'Calcul', type: 'formula' },
    { id: 'text0', title: 'Name', type: 'text' },
    { id: 'text1', title: 'Ville', type: 'text' },
    { id: 'text2', title: 'Ville', type: 'text' },
  ]);
  const noms = champs.map((c) => c.name);
  assert.ok(!noms.includes('calcul'));
  assert.ok(noms.includes('statut') && noms.includes('ville') && noms.includes('mondayId'));
  assert.equal(new Set(noms).size, noms.length, 'pas deux champs du même nom');
  assert.ok(!noms.includes('name'), 'name est le champ titre de Twenty');
  assert.deepEqual(champs.find((c) => c.name === 'statut').options.map((o) => o.value), ['VENDU']);
});

test('valeurs : chaque type dans la forme de Twenty', () => {
  assert.equal(valeurTwenty({ type: 'NUMBER' }, { text: '1 250,5' }), 1250.5);
  assert.equal(valeurTwenty({ type: 'NUMBER' }, { text: '' }), null);
  assert.equal(valeurTwenty({ type: 'DATE' }, { text: '2026-10-27', value: '{"date":"2026-10-27"}' }), '2026-10-27');
  assert.equal(valeurTwenty({ type: 'SELECT' }, { text: 'Sous offre' }), 'SOUS_OFFRE');
  assert.deepEqual(valeurTwenty({ type: 'MULTI_SELECT' }, { text: 'Nice, Antibes' }), ['NICE', 'ANTIBES']);
  assert.deepEqual(valeurTwenty({ type: 'EMAILS' }, { text: 'A@B.fr' }), { primaryEmail: 'a@b.fr', additionalEmails: null });
  assert.equal(valeurTwenty({ type: 'BOOLEAN' }, { value: '{"checked":"true"}' }), true);
  assert.equal(valeurTwenty({ type: 'LINKS' }, { text: 'Drive - https://drive.google.com/x', value: '{"url":"https://drive.google.com/x","text":"Drive"}' }).primaryLinkUrl, 'https://drive.google.com/x');
  assert.equal(valeurTwenty({ type: 'ADDRESS' }, { text: '1 rue X, Nice', value: '{"address":"1 rue X, Nice","lat":"43.7","lng":"7.26"}' }).addressLat, 43.7);
});

test('téléphone : numéro français ramené au format national sans le 0', () => {
  assert.deepEqual(telephone('06 12 34 56 78'), { primaryPhoneNumber: '612345678', primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33' });
  assert.equal(telephone('+33612345678').primaryPhoneNumber, '612345678');
  assert.equal(telephone(''), null);
});

test('enregistrement : nom, mondayId, groupe, et rien pour une colonne vide', () => {
  const champs = champsDe([{ id: 'text1', title: 'Ville', type: 'text' }, { id: 'n', title: 'Prix', type: 'numbers' }]);
  const r = enregistrementDe({ id: 42, name: 'Agence du Port', group: { title: 'À rappeler' }, created_at: '2026-01-01T00:00:00Z', column_values: [{ id: 'text1', text: 'Nice' }, { id: 'n', text: '' }] }, champs);
  assert.deepEqual(r, { name: 'Agence du Port', mondayId: '42', mondayGroupe: 'À rappeler', mondayCreeLe: '2026-01-01T00:00:00Z', ville: 'Nice' });
});

test('libellés manquants : un ancien statut présent dans les données devient une option', () => {
  const [champ] = champsDe([{ id: 's', title: 'Statut', type: 'status', settings_str: '{"labels":{"0":"Vendu"}}' }]);
  assert.deepEqual(libellesManquants([{ column_values: [{ id: 's', text: 'Ancien' }] }, { column_values: [{ id: 's', text: 'Vendu' }] }], champ), ['Ancien']);
});

test('une liste de plus de 50 choix devient du texte', () => {
  const labels = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [i, `Agence ${i}`]));
  const [champ] = champsDe([{ id: 'd', title: 'Entreprise', type: 'dropdown', settings_str: JSON.stringify({ labels: Object.values(labels).map((name, id) => ({ id, name })) }) }]);
  assert.equal(champ.type, 'TEXT');
  assert.equal(champ.options, undefined);
});
