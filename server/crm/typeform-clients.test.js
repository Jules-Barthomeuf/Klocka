// Un client qui remplit un Typeform reste un client (25 nov. 2026 : la reprise de l'historique avait fait 72 prospects
// de clients déjà signés). Twenty est simulé : rien n'est écrit pour de vrai.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TWENTY_URL = 'https://twenty.test';
process.env.TWENTY_API_KEY = 'cle-de-test';
const ecrits = [];
globalThis.fetch = async (url, { method = 'GET', body } = {}) => {
  const u = new URL(url);
  const rep = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data });
  if (u.pathname.endsWith('/metadata/objects')) return rep({ data: [{ nameSingular: 'prospects', fields: [{ id: 'f', name: 'source9', options: [{ value: 'SITE_WEB' }, { value: 'VSL' }, { value: 'WEBI' }] }] }] });
  if (method === 'GET' && u.pathname.endsWith('/prospectsListe')) return rep({ data: { prospectsListe: [] }, pageInfo: { hasNextPage: false } });
  if (method === 'GET' && u.pathname.endsWith('/clientsListe')) {
    const f = u.searchParams.get('filter') || '';
    return rep({ data: { clientsListe: /rachel/.test(f) ? [{ id: 'client-1', name: 'Rachel PEYRABOUT' }] : [] }, pageInfo: { hasNextPage: false } });
  }
  ecrits.push({ method, chemin: u.pathname, corps: body ? JSON.parse(body) : null });
  return rep({ data: { x: { id: `cree-${ecrits.length}` } } });
};
const Tf = await import('./typeform.js');

test('un client déjà signé : sa réponse en note sur sa fiche client, aucun prospect créé', async () => {
  const r = await Tf.ecrireEnvoi({ email: 'rachel@exemple.fr', prenom: 'Rachel', nom: 'Peyrabout', reponses: [{ question: 'Objectif', reponse: 'Murs loués' }] }, 'site');
  assert.equal(r.client, true);
  assert.equal(r.id, 'client-1');
  assert.ok(!ecrits.some((x) => x.chemin.endsWith('/prospectsListe')), 'pas de ligne dans Prospects');
  assert.ok(ecrits.some((x) => x.chemin.endsWith('/noteTargets') && x.corps.targetClientsId === 'client-1'), 'la note est sur la fiche client');
});

test('une personne inconnue devient un prospect, comme avant', async () => {
  ecrits.length = 0;
  const r = await Tf.ecrireEnvoi({ email: 'nouveau@exemple.fr', prenom: 'Paul', nom: 'Neuf', reponses: [] }, 'vsl', { note: false });
  assert.equal(r.cree, true);
  assert.ok(ecrits.some((x) => x.method === 'POST' && x.chemin.endsWith('/prospectsListe')));
});
