// Le démarchage : les gérants, les sociétés et leurs murs, la réponse d'Apollo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { gerantsPersonnes, societesDe, contactApollo, depuisDe, estDemarchable } from './demarchage.js';
import { afficher } from './chat.js';

const sci = { siren: '418219648', nom: 'SCI 230 RUE DU COMBAT', forme: 'SCI', creation: '1998-04-02', siege: { adresse: '230 RUE DU COMBAT 83300 DRAGUIGNAN' },
  gerants: [
    { nom: 'MICHEL PHILIPPE DAUTUN', nom_famille: 'DAUTUN', qualite: 'Associé', tranche_age: '70+', personne_morale: false },
    { nom: 'ISABELLE MADELEINE DAUTUN (REYNAUD)', nom_famille: 'DAUTUN', qualite: 'Gérant', tranche_age: '50-70', personne_morale: false },
    { nom: 'HOLDING X', personne_morale: true },
  ] };

test('les gérants personnes physiques, en prénom et nom', () => {
  assert.deepEqual(gerantsPersonnes(sci).map((g) => `${g.prenom} ${g.nom}`), ['Michel Dautun', 'Isabelle Dautun']);
});

test('une société par propriétaire, avec tous ses murs ; les murs publics ne se démarchent pas', () => {
  const cibles = [
    { id: 'c1', adresse: '230 Rue du Combat', enseigne: 'At Coiffeur', pile: 'ecrire', societe: sci, mutation: { date: '2023-04-03', du_local: false } },
    { id: 'c2', adresse: '232 Rue du Combat', enseigne: 'Boulangerie', pile: 'appeler', societe: sci, mutation: { date: '2019-02-01', du_local: true } },
    { id: 'c3', adresse: '1 Place de la Mairie', pile: 'surveiller', societe: { siren: '2', nom: 'COMMUNE DE DRAGUIGNAN', forme: 'Commune' } },
    { id: 'c4', adresse: '5 Rue Sans Nom', pile: 'surveiller' },
  ];
  const s = societesDe(cibles, { 418219648: { contacts: [{ gerant: 'Isabelle Dautun', email: 'i@x.fr' }], etat: 'pret', message: { objet: 'Vos murs', corps: 'Bonjour' } } });
  assert.equal(s.length, 2, 'le mur sans propriétaire publié n\'a pas de société');
  assert.equal(s[0].nom, 'SCI 230 RUE DU COMBAT');
  assert.equal(s[0].murs.length, 2);
  assert.equal(s[0].pile, 'appeler', 'la meilleure pile de ses murs');
  assert.equal(s[0].etat, 'pret');
  assert.equal(s[1].demarchable, false);
  assert.equal(s[1].etat, 'non_demarchable');
  assert.deepEqual(depuisDe(cibles[1]), { date: '2019-02-01', source: 'dernière vente DVF du local' });
  assert.deepEqual(depuisDe(cibles[0]), { date: '1998-04-02', source: 'création de la société (au plus tôt)' });
  assert.equal(estDemarchable({ nom: 'OFFICE PUBLIC HLM', forme: 'SA' }), false);
  const texte = afficher(s[0]);
  assert.match(texte, /^SCI 230 RUE DU COMBAT \(2 murs : 230 Rue du Combat, At Coiffeur ; 232 Rue du Combat, Boulangerie\)\nà : i@x\.fr\nobjet : Vos murs/);
  assert.match(texte, /dis « envoie » et il part$/);
});

test('la réponse d\'Apollo : le mail, le téléphone, LinkedIn ; rien si Apollo ne connaît pas la personne', () => {
  const g = { prenom: 'Isabelle', nom: 'Dautun' };
  assert.deepEqual(contactApollo({ person: { email: 'i.dautun@x.fr', email_status: 'verified', linkedin_url: 'https://linkedin.com/in/x', title: 'Gérante', organization: { name: 'SCI 230' }, phone_numbers: [{ sanitized_number: '+33600000000' }] } }, g),
    { gerant: 'Isabelle Dautun', email: 'i.dautun@x.fr', email_statut: 'verified', telephone: '+33600000000', linkedin: 'https://linkedin.com/in/x', poste: 'Gérante', entreprise: 'SCI 230', source: 'Apollo' });
  assert.equal(contactApollo({ person: null }, g), null);
  assert.equal(contactApollo({ person: { name: 'x' } }, g), null);
  assert.equal(contactApollo({ person: { personal_emails: ['perso@gmail.com'] } }, g).email, 'perso@gmail.com');
});
