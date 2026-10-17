import test from 'node:test';
import assert from 'node:assert/strict';
import { classer, etapeFrise, phaseDe, estEcarte, aTraiter, estAMoi, FRISE } from '../src/lib/dossiers-architecture.js';

const d = (o) => ({ deal_id: o.id || 'x', etape_max: 2, statut: 'analyse', responsables: [], lots: [], ...o });

test('la frise a huit étapes, numérotées', () => {
  assert.deepEqual(FRISE.map((e) => e.n), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("l'étape de la frise suit les cinq portes du serveur", () => {
  assert.equal(etapeFrise(d({ etape_max: 1 })), 1);
  assert.equal(etapeFrise(d({ etape_max: 2 })), 2);
  assert.equal(etapeFrise(d({ etape_max: 3, statut: 'documents_demandes' })), 3);
  assert.equal(etapeFrise(d({ etape_max: 3, statut: 'depouille' })), 4);
  assert.equal(etapeFrise(d({ etape_max: 4 })), 5);
  assert.equal(etapeFrise(d({ etape_max: 4, nb_demandes_clients: 2 })), 6);
  assert.equal(etapeFrise(d({ etape_max: 4, nb_demandes_clients: 2, nb_offres: 1 })), 7);
  assert.equal(etapeFrise(d({ etape_max: 5 })), 8);
});

test('la phase du pipeline découle de l\'étape', () => {
  assert.equal(phaseDe(d({ etape_max: 2 })), 'tri');
  assert.equal(phaseDe(d({ etape_max: 3 })), 'qualification');
  assert.equal(phaseDe(d({ etape_max: 4 })), 'commercialisation');
  assert.equal(phaseDe(d({ etape_max: 5 })), 'transaction');
});

test('écarté : abandonné ou NO-GO', () => {
  assert.equal(estEcarte(d({ statut: 'abandonne' })), true);
  assert.equal(estEcarte(d({ lots: [{ verdict: 'NO-GO' }] })), true);
  assert.equal(estEcarte(d({ lots: [{ verdict: 'GO' }] })), false);
});

test('à moi : par responsable, ou sans responsable', () => {
  assert.equal(estAMoi(d({ responsables: ['Nora'] }), 'nora.l@klocka.immo'), true);
  assert.equal(estAMoi(d({ responsables: ['Nora'] }), 'jules.b@klocka.immo'), false);
  assert.equal(estAMoi(d({ responsables: [], responsable: null }), 'jules.b@klocka.immo'), true);
  assert.equal(estAMoi(d({ responsable: 'jules.b@klocka.immo' }), 'jules.b@klocka.immo'), true);
});

test('à traiter : toi ou un tiers', () => {
  assert.deepEqual(aTraiter(d({ a_relancer: true, statut: 'documents_demandes' })).de, 'toi');
  assert.equal(aTraiter(d({ statut: 'documents_demandes' })).de, 'tiers');
  assert.equal(aTraiter(d({ statut: 'documents_recus', etape_max: 3 })).de, 'toi');
  assert.equal(aTraiter(d({ fil_non_lus: 2, statut: 'projet_cree', etape_max: 5 })).de, 'toi');
  assert.equal(aTraiter(d({ etape_max: 4, statut: 'projet_cree' })), null);
});

test('classer : un dossier dans un seul bloc, les autres au pipeline', () => {
  const liste = [
    d({ id: 'a', statut: 'documents_recus', etape_max: 3, responsables: ['Jules'] }),
    d({ id: 'b', statut: 'documents_demandes', etape_max: 3, responsables: ['Jules'] }),
    d({ id: 'c', statut: 'documents_recus', etape_max: 3, responsables: ['Nora'] }),
    d({ id: 'e', statut: 'abandonne' }),
    d({ id: 'f', etape_max: 4, statut: 'projet_cree' }),
    d({ id: 'g', archived: true }),
  ];
  const r = classer(liste, 'jules.b@klocka.immo');
  assert.deepEqual(r.toi.map((x) => x.deal_id), ['a']);
  assert.deepEqual(r.tiers.map((x) => x.deal_id), ['b']);
  assert.deepEqual(r.ecartes.map((x) => x.deal_id), ['e']);
  assert.deepEqual(r.pipeline.qualification.map((x) => x.deal_id), ['c']);
  assert.deepEqual(r.pipeline.commercialisation.map((x) => x.deal_id), ['f']);
  assert.equal(Object.values(r.pipeline).flat().length + r.toi.length + r.tiers.length + r.ecartes.length, 5);
});
