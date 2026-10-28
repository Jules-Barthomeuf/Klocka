// Synchronisation Monday ↔ Twenty (CRM=double, 28 oct. 2026). Ni Monday ni Twenty réels.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRM = 'double';
const S = await import('./synchro.js');

const OBJET = {
  mondayTableau: '2110793610', nameSingular: 'agentImmobilier', namePlural: 'agentImmobilierListe', labelPlural: 'Agent immobilier',
  champs: [
    { name: 'statut', label: 'Statut', type: 'SELECT', mondayColonne: 'status', mondayType: 'status' },
    { name: 'remarques', label: 'Remarques', type: 'TEXT', mondayColonne: 'text4', mondayType: 'text' },
    { name: 'prochaineRelance', label: 'Prochaine relance', type: 'DATE', mondayColonne: 'date', mondayType: 'date' },
  ],
};
const FIELDS = [
  { id: 'f1', name: 'statut', type: 'SELECT', options: [{ value: 'A_RAPPELER', label: 'À rappeler', position: 0 }] },
  { id: 'f2', name: 'remarques', type: 'TEXT' }, { id: 'f3', name: 'prochaineRelance', type: 'DATE' },
  { id: 'f4', name: 'groupe', type: 'SELECT', options: [{ value: 'EN_COURS', label: 'En cours', position: 0 }, { value: 'SIGNES', label: 'Signés', position: 1 }] },
  { id: 'f5', name: 'mondayId', type: 'TEXT' }, { id: 'f6', name: 'mondayGroupe', type: 'TEXT' }, { id: 'f7', name: 'name', type: 'TEXT' },
];

function monde({ element = null, twenty = null } = {}) {
  const journal = [];
  const monday = {
    crmDouble: () => true,
    ecrituresRecentes: new Map(),
    commentairesKlocka: new Set(),
    enFileCrm: async (_q, faire) => faire(),
    elementBrut: async () => element,
    groupesDuTableau: async () => [{ id: 'g1', title: 'En cours' }, { id: 'g2', title: 'Signés' }],
    creerElement: async (b, nom, cols, opts) => { journal.push(['monday:creer', nom, cols, opts.sansCopie]); return { id: '900' }; },
    majElement: async (b, id, cols, opts) => { journal.push(['monday:maj', id, cols, opts.sansCopie]); },
    deplacerDansGroupe: async (id, g) => { journal.push(['monday:groupe', id, g]); },
    archiverElement: async (id) => { journal.push(['monday:archiver', id]); },
  };
  const tw = {
    objetsTwenty: async () => [{ nameSingular: 'agentImmobilier', fields: FIELDS.map((f) => ({ ...f, options: f.options && [...f.options] })) }],
    trouver: async () => twenty,
    creer: async (p, v) => { journal.push(['twenty:creer', v]); return { id: 'nouveau' }; },
    modifier: async (p, id, v) => { journal.push(['twenty:modifier', id, v]); },
    supprimer: async (p, id) => { journal.push(['twenty:supprimer', id]); },
    modifierChamp: async (id, v) => { journal.push(['twenty:options', id, v.options.map((o) => o.value)]); },
  };
  S.brancherPourTests({ objets: [OBJET], monday, twenty: tw });
  return journal;
}

const ELEMENT = {
  id: '42', name: 'Agence du Port', state: 'active', group: { id: 'g2', title: 'Signés' },
  column_values: [
    { id: 'status', text: 'À rappeler', value: '{"index":1}' },
    { id: 'text4', text: 'rappeler lundi', value: '"rappeler lundi"' },
    { id: 'date', text: '2026-11-03', value: '{"date":"2026-11-03"}' },
  ],
};

test('Monday → Twenty : seules les valeurs qui diffèrent sont écrites, groupe compris', async () => {
  const j = monde({ element: ELEMENT, twenty: { id: 't42', name: 'Agence du Port', statut: 'A_RAPPELER', remarques: 'ancien', prochaineRelance: '2026-11-03', groupe: 'EN_COURS', mondayId: '42', mondayGroupe: 'Signés' } });
  const r = await S.ficheDepuisMonday(OBJET, '42');
  assert.deepEqual(r.modifie.sort(), ['groupe', 'remarques']);
  assert.deepEqual(j, [['twenty:modifier', 't42', { remarques: 'rappeler lundi', groupe: 'SIGNES' }]]);
});

test('Monday → Twenty : rien n’est écrit quand Twenty est déjà à jour (fin d’un aller-retour)', async () => {
  const j = monde({ element: ELEMENT, twenty: { id: 't42', name: 'Agence du Port', statut: 'A_RAPPELER', remarques: 'rappeler lundi', prochaineRelance: '2026-11-03T00:00:00Z', groupe: 'SIGNES', mondayId: '42', mondayGroupe: 'Signés' } });
  await S.ficheDepuisMonday(OBJET, '42');
  assert.deepEqual(j, []);
});

test('Monday → Twenty : un statut nouveau devient une option avant d’être écrit ; une fiche absente naît', async () => {
  const el = { ...ELEMENT, column_values: [{ id: 'status', text: 'Sous offre', value: '{}' }] };
  const j = monde({ element: el, twenty: null });
  await S.ficheDepuisMonday(OBJET, '42');
  assert.deepEqual(j[0], ['twenty:options', 'f1', ['A_RAPPELER', 'SOUS_OFFRE']]);
  assert.equal(j[1][0], 'twenty:creer');
  assert.equal(j[1][1].mondayId, '42');
  assert.equal(j[1][1].statut, 'SOUS_OFFRE');
});

test('Monday → Twenty : un élément archivé ou supprimé est supprimé de Twenty (récupérable)', async () => {
  const j = monde({ element: { ...ELEMENT, state: 'archived' }, twenty: { id: 't42' } });
  await S.ficheDepuisMonday(OBJET, '42');
  assert.deepEqual(j, [['twenty:supprimer', 't42']]);
});

test('Twenty → Monday : seuls les gestes d’une personne repartent, jamais ce que Klocka a écrit', () => {
  monde();
  assert.equal(S.depuisTwenty({ eventName: 'agentImmobilier.updated', record: { id: 'x' }, updatedFields: ['remarques'] }).ignore, 'écrit par Klocka');
  assert.equal(S.depuisTwenty({ eventName: 'agentImmobilier.updated', workspaceMemberId: 'w', record: { id: 'x' }, updatedFields: ['deplacerVers'] }).ignore, '« Déplacer vers » seul');
  assert.equal(S.depuisTwenty({ eventName: 'deplacement.created', workspaceMemberId: 'w', record: {} }).ignore, 'objet non synchronisé');
});

test('Twenty → Monday : une modification écrit les seules colonnes changées, sans recopie, et suit le groupe', async () => {
  const j = monde();
  await S.ficheVersMonday(OBJET, 'updated', { id: 't42', mondayId: '42', name: 'Agence du Port', remarques: 'vu ce matin', groupe: 'SIGNES' }, ['remarques', 'groupe']);
  assert.deepEqual(j, [['monday:maj', '42', { text4: 'vu ce matin' }, true], ['monday:groupe', '42', 'g2']]);
});

test('Twenty → Monday : une fiche créée à la main naît dans Monday et reçoit son id ; une suppression archive', async () => {
  const j = monde();
  await S.ficheVersMonday(OBJET, 'created', { id: 't9', name: 'Nouvelle', statut: 'A_RAPPELER', prochaineRelance: '2026-12-01' }, []);
  assert.deepEqual(j[0], ['monday:creer', 'Nouvelle', { status: { label: 'À rappeler' }, text4: '', date: { date: '2026-12-01' } }, true]);
  assert.deepEqual(j[1], ['twenty:modifier', 't9', { mondayId: '900' }]);
  const k = monde();
  await S.ficheVersMonday(OBJET, 'deleted', { id: 't42', mondayId: '42' });
  assert.deepEqual(k, [['monday:archiver', '42']]);
});

test('valeurs Twenty → colonnes Monday', () => {
  assert.deepEqual(S.versMonday('status', { type: 'SELECT', options: [{ value: 'X', label: 'Oui' }] }, 'X'), { label: 'Oui' });
  assert.deepEqual(S.versMonday('date', { type: 'DATE' }, null), {});
  assert.equal(S.versMonday('board_relation', { type: 'TEXT' }, 'a'), undefined);
  assert.deepEqual(S.versMonday('phone', { type: 'PHONES' }, { primaryPhoneNumber: '612345678', primaryPhoneCallingCode: '+33', primaryPhoneCountryCode: 'FR' }), { phone: '+33612345678', countryShortName: 'FR' });
});
