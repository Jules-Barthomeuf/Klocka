// CRM=double : Monday écrit comme avant, Twenty reçoit la copie (28 oct. 2026). Ni Monday ni Twenty réels : fetch et
// l'API Twenty sont simulés.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CRM = 'double';
process.env.MONDAY_TOKEN = 'jeton-de-test';
const M = await import('../monday.js');
const A = await import('./monday-sur-twenty.js');

const OBJET = {
  mondayTableau: '2110793610', nameSingular: 'agentImmobilier', namePlural: 'agentImmobilierListe', labelPlural: 'Agent immobilier',
  champs: [
    { name: 'remarques', label: 'Remarques', type: 'TEXT', mondayColonne: 'text4', mondayType: 'text' },
    { name: 'mondayId', label: 'Id Monday', type: 'TEXT', systeme: true },
  ],
};
const META = [{ nameSingular: 'agentImmobilier', fields: [{ id: 'f5', name: 'remarques', type: 'TEXT' }] }];
const NE_DANS_TWENTY = '99999999-2222-3333-4444-555555555555';

function monde() {
  const monday = [];
  const twenty = [];
  const base = new Map([
    ['t-42', { id: 't-42', name: 'Agence du Port', mondayId: '42' }],
    [NE_DANS_TWENTY, { id: NE_DANS_TWENTY, name: 'Léa', mondayId: null }],
  ]);
  globalThis.fetch = async (url, { body }) => {
    const { query, variables } = JSON.parse(body);
    monday.push([query.match(/(create_item|change_multiple_column_values|create_update|delete_item|items_page_by_column_values|items)\b/)?.[1], variables]);
    const data = /create_item/.test(query) ? { create_item: { id: '777', name: variables.nom } }
      : /change_multiple/.test(query) ? { change_multiple_column_values: { id: variables.item } }
        : /items_page_by_column_values/.test(query) ? { items_page_by_column_values: { items: [] } }
          : /items\(ids/.test(query) ? { items: [{ id: variables.ids[0], name: 'Agence vue dans Monday', state: 'active', board: { id: '2110793610' }, column_values: [] }] }
            : {};
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
  A.brancherPourTests({
    objets: [OBJET],
    ids: { 42: 'agentImmobilier' },
    twenty: {
      objetsTwenty: async () => META,
      trouver: async (_p, { mondayId }) => [...base.values()].find((r) => r.mondayId === mondayId) || null,
      lire: async (_p, id) => base.get(id) || Promise.reject(Object.assign(new Error('404'), { status: 404 })),
      creer: async (p, v) => { twenty.push(['creer', v]); const r = { id: 'nouveau', ...v }; base.set(r.id, r); return r; },
      modifier: async (p, id, v) => { twenty.push(['modifier', id, v]); Object.assign(base.get(id) || {}, v); return { id }; },
      noter: async (cible, id) => { twenty.push(['noter', id]); return { id: 'n1' }; },
      supprimer: async (p, id) => { twenty.push(['supprimer', id]); },
    },
  });
  M.copieTwentyPourTests(true);
  return { monday, twenty };
}

test('une mise à jour part dans Monday, puis la même dans la fiche Twenty retrouvée par son id Monday', async () => {
  const { monday, twenty } = monde();
  await M.majElement('2110793610', '42', { text4: '28/10 · rappeler' });
  await M.copiesTwenty();
  assert.deepEqual(monday.map((x) => x[0]), ['change_multiple_column_values']);
  assert.equal(monday[0][1].item, '42');
  assert.deepEqual(twenty, [['modifier', 't-42', { remarques: '28/10 · rappeler' }]]);
});

test('une création Monday naît aussi dans Twenty, avec son id Monday', async () => {
  const { twenty } = monde();
  const cree = await M.creerElement('2110793610', 'Nouvelle agence', { text4: 'premier appel' });
  await M.copiesTwenty();
  assert.equal(cree.id, '777', 'Klocka garde l’id Monday');
  assert.deepEqual(twenty, [['creer', { name: 'Nouvelle agence', remarques: 'premier appel', mondayId: '777' }]]);
});

test('une fiche née dans Twenty pendant la bascule : créée dans Monday puis reliée, sans doublon dans Twenty', async () => {
  const { monday, twenty } = monde();
  const r = await M.poserElement('2110793610', { nom: 'Léa', colonnes: { text4: 'suite' }, itemId: NE_DANS_TWENTY });
  await M.copiesTwenty();
  assert.equal(r.id, '777');
  assert.ok(monday.some((x) => x[0] === 'create_item'));
  assert.deepEqual(twenty, [['modifier', NE_DANS_TWENTY, { name: 'Léa', remarques: 'suite', mondayId: '777' }]]);
});

test('une fiche Monday absente de Twenty y naît à sa première mise à jour, avec son nom Monday', async () => {
  const { twenty } = monde();
  await M.majElement('2110793610', '555', { text4: 'x' });
  await M.copiesTwenty();
  assert.deepEqual(twenty, [['creer', { name: 'Agence vue dans Monday', remarques: 'x', mondayId: '555' }]]);
});

test('un tableau non migré (tableaux « plateforme ») n’est pas recopié', async () => {
  const { twenty } = monde();
  await M.majElement('123456', '42', { text4: 'x' });
  await M.copiesTwenty();
  assert.deepEqual(twenty, []);
});

test('un échec de copie ne fait pas échouer l’écriture Monday', async () => {
  const { monday } = monde();
  A.brancherPourTests({ objets: [OBJET], twenty: { objetsTwenty: async () => { throw new Error('Twenty en panne'); }, trouver: async () => { throw new Error('Twenty en panne'); } } });
  const err = console.error;
  console.error = () => {};
  const r = await M.majElement('2110793610', '42', { text4: 'x' });
  await M.copiesTwenty();
  console.error = err;
  assert.equal(r.id, '42');
  assert.equal(monday.length, 1);
});
