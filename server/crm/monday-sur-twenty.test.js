import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from './monday-sur-twenty.js';

const OBJET = {
  mondayTableau: '2110793610', nameSingular: 'agentImmobilier', namePlural: 'agentImmobilierListe', labelPlural: 'Agent immobilier',
  champs: [
    { name: 'statut', label: 'Statut', type: 'SELECT', mondayColonne: 'status', mondayType: 'status', options: [{ value: 'INTERESSE', label: 'Intéressé' }] },
    { name: 'eMail', label: 'E-mail', type: 'EMAILS', mondayColonne: 'email', mondayType: 'email' },
    { name: 'telephone', label: 'Téléphone', type: 'PHONES', mondayColonne: 'phone', mondayType: 'phone' },
    { name: 'prochaineRelance', label: 'Prochaine relance', type: 'DATE', mondayColonne: 'date', mondayType: 'date' },
    { name: 'remarques', label: 'Remarques', type: 'TEXT', mondayColonne: 'text4', mondayType: 'text' },
    { name: 'adresse', label: 'Adresse', type: 'ADDRESS', mondayColonne: 'location', mondayType: 'location' },
    { name: 'mondayId', label: 'Id Monday', type: 'TEXT', systeme: true },
  ],
};
const META = [{ nameSingular: 'agentImmobilier', fields: [
  { id: 'f1', name: 'statut', type: 'SELECT', options: [{ value: 'INTERESSE', label: 'Intéressé', color: 'green', position: 0 }] },
  { id: 'f2', name: 'eMail', type: 'EMAILS' }, { id: 'f3', name: 'telephone', type: 'PHONES' },
  { id: 'f4', name: 'prochaineRelance', type: 'DATE' }, { id: 'f5', name: 'remarques', type: 'TEXT' }, { id: 'f6', name: 'adresse', type: 'ADDRESS' },
] }];
const ID = '11111111-2222-3333-4444-555555555555';

function fausseApi() {
  const journal = [];
  const base = new Map([[ID, { id: ID, name: 'Agence du Port', statut: 'INTERESSE', mondayId: '42', telephone: { primaryPhoneNumber: '612345678', primaryPhoneCallingCode: '+33' }, adresse: { addressStreet1: '1 rue X, Nice', addressLat: 43.7, addressLng: 7.26 } }]]);
  return {
    journal,
    objetsTwenty: async () => META,
    lister: async () => [...base.values()],
    trouver: async (_p, { mondayId }) => [...base.values()].find((r) => r.mondayId === mondayId) || null,
    lire: async (_p, id) => base.get(id) || Promise.reject(Object.assign(new Error('404'), { status: 404 })),
    creer: async (p, v) => { journal.push(['creer', p, v]); const r = { id: '99999999-2222-3333-4444-555555555555', ...v }; base.set(r.id, r); return r; },
    modifier: async (p, id, v) => { journal.push(['modifier', p, id, v]); return { id }; },
    modifierChamp: async (id, v) => { journal.push(['option', id, v.options.map((o) => o.value)]); META[0].fields[0].options = v.options; },
    supprimer: async (p, id) => { journal.push(['supprimer', p, id]); },
    noter: async (cible, id, titre) => { journal.push(['noter', cible, id, titre]); return { id: 'n1' }; },
  };
}

test('texte lisible : liste, téléphone, adresse, date', () => {
  assert.equal(A.texteDe('SELECT', 'INTERESSE', [{ value: 'INTERESSE', label: 'Intéressé' }]), 'Intéressé');
  assert.equal(A.texteDe('PHONES', { primaryPhoneNumber: '612345678', primaryPhoneCallingCode: '+33' }), '+33612345678');
  assert.equal(A.texteDe('DATE', '2026-10-27'), '2026-10-27');
  assert.equal(A.texteDe('EMAILS', { primaryEmail: 'a@b.fr', additionalEmails: [] }), 'a@b.fr');
  assert.equal(A.texteDe('TEXT', null), '');
});

test('valeurs Monday → Twenty : statut, date vide, téléphone, e-mail, texte long', () => {
  assert.equal(A.versTwenty('SELECT', { label: 'Sous offre' }), 'SOUS_OFFRE');
  assert.equal(A.versTwenty('SELECT', ''), null);
  assert.equal(A.versTwenty('DATE', { date: '2026-11-03' }), '2026-11-03');
  assert.equal(A.versTwenty('DATE', ''), null, 'vider la relance');
  assert.equal(A.versTwenty('PHONES', { phone: '+33612345678', countryShortName: 'FR' }).primaryPhoneNumber, '612345678');
  assert.equal(A.versTwenty('EMAILS', { email: 'X@Y.fr', text: 'X@Y.fr' }).primaryEmail, 'x@y.fr');
  assert.equal(A.versTwenty('TEXT', { text: 'ligne 1\nligne 2' }), 'ligne 1\nligne 2');
  assert.deepEqual(A.versTwenty('MULTI_SELECT', { labels: ['Nice', 'Antibes'] }), ['NICE', 'ANTIBES']);
  assert.equal(A.versTwenty('TEXT', { personsAndTeams: [{ id: 1, kind: 'person' }] }), undefined);
  assert.equal(A.versTwenty('TEXT', { item_ids: [12] }), undefined, 'un lien entre tableaux ne vide pas le texte importé');
  assert.equal(A.versTwenty('TEXT', { url: 'https://drive.google.com/x', text: 'Drive' }), 'Drive');
});

test('lireTableau rend les lignes comme Monday, colonnes par leur id Monday', async () => {
  A.brancherPourTests({ objets: [OBJET], twenty: fausseApi() });
  const [l] = await A.lireTableau('2110793610');
  assert.equal(l.id, ID);
  assert.equal(l.nom, 'Agence du Port');
  assert.equal(l.colonnes.status, 'Intéressé');
  assert.equal(l.colonnes.phone, '+33612345678');
  assert.deepEqual(l.valeurs.location, { lat: 43.7, lng: 7.26, address: '1 rue X, Nice' });
  assert.deepEqual((await A.colonnesDuTableau('2110793610')).map((c) => c.id), ['status', 'email', 'phone', 'date', 'text4', 'location']);
});

test('un ancien id Monday se retrouve par mondayId ; un tableau non migré le dit', async () => {
  A.brancherPourTests({ objets: [OBJET], ids: { 42: 'agentImmobilier' }, twenty: fausseApi() });
  const e = await A.lireElement('42');
  assert.equal(e.id, ID);
  assert.equal(e.tableau, '2110793610');
  assert.equal(await A.lireElement('777'), null);
  await assert.rejects(() => A.lireTableau('123'), /non migré|pas été migré/);
});

test('créer, modifier, noter, supprimer : les verbes Monday écrivent dans Twenty', async () => {
  const api = fausseApi();
  A.brancherPourTests({ objets: [OBJET], twenty: api });
  const c = await A.creerElement('2110793610', 'Nora', { status: { label: 'Intéressé' }, date: { date: '2026-11-03' }, text4: 'Premier appel' });
  assert.deepEqual(api.journal[0], ['creer', 'agentImmobilierListe', { name: 'Nora', statut: 'INTERESSE', prochaineRelance: '2026-11-03', remarques: 'Premier appel' }]);
  await A.majElement('2110793610', c.id, { date: '' });
  assert.deepEqual(api.journal.at(-1), ['modifier', 'agentImmobilierListe', c.id, { prochaineRelance: null }]);
  await A.commenter(ID, 'Appel du jour<br>rien de neuf');
  assert.deepEqual(api.journal.at(-1), ['noter', 'targetAgentImmobilierId', ID, 'Appel du jour']);
  await A.supprimerElement(c.id);
  assert.deepEqual(api.journal.at(-1), ['supprimer', 'agentImmobilierListe', c.id]);
});

test('un statut nouveau ajoute son option, comme labels: true dans Monday', async () => {
  const api = fausseApi();
  A.brancherPourTests({ objets: [OBJET], twenty: api });
  await A.majElement('2110793610', ID, { status: { label: 'Rappeler' } });
  assert.deepEqual(api.journal[0], ['option', 'f1', ['INTERESSE', 'RAPPELER']]);
  assert.deepEqual(api.journal[1][3], { statut: 'RAPPELER' });
});

test('poserElement : met à jour par id connu, sinon crée', async () => {
  const api = fausseApi();
  A.brancherPourTests({ objets: [OBJET], twenty: api });
  assert.deepEqual(await A.poserElement('2110793610', { nom: 'X', colonnes: { text4: 'a' }, itemId: ID }), { id: ID, cree: false });
  const r = await A.poserElement('2110793610', { nom: 'Y', colonnes: {} });
  assert.equal(r.cree, true);
});

test("l'id de colonne Monday passe avant un nom de champ identique (« date » = Prochaine relance)", async () => {
  const api = fausseApi();
  const objet = { ...OBJET, champs: [{ name: 'date', label: 'Date', type: 'DATE', mondayColonne: 'date_mm5034ht', mondayType: 'date' }, ...OBJET.champs] };
  A.brancherPourTests({ objets: [objet], twenty: api });
  META[0].fields.push({ id: 'f7', name: 'date', type: 'DATE' });
  await A.majElement('2110793610', ID, { date: { date: '2026-11-03' } });
  assert.deepEqual(api.journal.at(-1)[3], { prochaineRelance: '2026-11-03' });
  META[0].fields.pop();
});

test('mandataireDuTexte : l\'adresse du mandataire dans les critères d\'un prospect', async () => {
  const { mandataireDuTexte } = await import('./monday-sur-twenty.js');
  assert.equal(mandataireDuTexte('Statut Klocka : À appeler\nAjouté par le mandataire Test.Mandataire@kpartners.fr depuis Klocka.'), 'test.mandataire@kpartners.fr');
  assert.equal(mandataireDuTexte('rien'), null);
});
