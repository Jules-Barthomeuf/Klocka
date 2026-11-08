import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-crm-acquereurs-'));
const { Records } = await import('./db.js');
const { synchroniserPiste, aSynchroniser, tableauDeLaPiste } = await import('./crm-acquereurs.js');
const { TABLEAUX_KP } = await import('./crm-bien.js');

/** Un CRM de test : il garde les fiches par tableau et note les suppressions. */
function fauxCrm() {
  const fiches = new Map();
  let n = 100;
  return {
    fiches,
    supprimees: [],
    mondayConfigure: () => true,
    async creerElement(tableau, nom, colonnes) { const id = String(++n); fiches.set(id, { tableau, nom, colonnes }); return { id }; },
    async majElement(tableau, id, colonnes) { if (!fiches.has(String(id))) throw new Error('not found'); fiches.set(String(id), { tableau, nom: fiches.get(String(id)).nom, colonnes }); },
    async supprimerElement(id) { this.supprimees.push(String(id)); fiches.delete(String(id)); },
  };
}

test("un acquéreur va dans Prospects, passe en Clients à la signature, et revient si le compromis capote (8 nov. 2026)", async () => {
  const m = Records.create('MiseEnMarche', { mandataire_email: 'm@kpartners.fr', bien: 'Pressing du Port, Antibes' });
  const x = Records.create('PisteAcquereur', { marche_id: m.id, mandataire_email: 'm@kpartners.fr', nom: 'Sophie Martin', email: 'sophie@exemple.fr', statut: 'visite', budget: 300000, cree_le: '2026-11-01T08:00:00Z', maj_le: '2026-11-01T08:00:00Z' });
  const crm = fauxCrm();
  assert.equal(aSynchroniser(Records.list('PisteAcquereur')).length, 1, 'jamais partie : à reporter');
  const r1 = await synchroniserPiste(x.id, { crm });
  assert.equal(r1.tableau, 'prospects');
  assert.equal(crm.fiches.get(r1.id).tableau, TABLEAUX_KP.prospects());
  assert.equal(aSynchroniser(Records.list('PisteAcquereur')).length, 0, 'à jour : rien à reporter');
  // Signé : la fiche passe dans Clients, celle des Prospects sort.
  Records.update('PisteAcquereur', x.id, { statut: 'signe', maj_le: new Date().toISOString() });
  const r2 = await synchroniserPiste(x.id, { crm });
  assert.equal(r2.tableau, 'clients');
  assert.equal(r2.deplace, true);
  assert.equal(crm.fiches.get(r2.id).tableau, TABLEAUX_KP.clients());
  assert.deepEqual(crm.supprimees, [r1.id]);
  // Le compromis capote : retour dans les Prospects, au statut dit.
  Records.update('PisteAcquereur', x.id, { statut: 'offre', maj_le: new Date().toISOString() });
  const r3 = await synchroniserPiste(x.id, { crm });
  assert.equal(r3.tableau, 'prospects');
  assert.deepEqual(crm.supprimees, [r1.id, r2.id]);
  assert.equal(tableauDeLaPiste({ statut: 'signe' }), 'clients');
});

test("une ligne de test ne part jamais dans le CRM", async () => {
  const m = Records.create('MiseEnMarche', { mandataire_email: 'm@kpartners.fr', bien: 'Bien' });
  const x = Records.create('PisteAcquereur', { marche_id: m.id, mandataire_email: 'm@kpartners.fr', nom: '(test) Karim Benali', statut: 'contact', maj_le: new Date().toISOString() });
  assert.equal(aSynchroniser([Records.get('PisteAcquereur', x.id)]).length, 0);
  assert.equal((await synchroniserPiste(x.id, { crm: fauxCrm() })).ok, false);
});
