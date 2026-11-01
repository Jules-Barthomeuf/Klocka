import test from 'node:test';
import assert from 'node:assert/strict';
import { composerAcces, niveauDe, champCache } from './acces.js';

const roles = [
  { id: 'admin', label: 'Admin', canReadAllObjectRecords: true, canUpdateAllObjectRecords: true, workspaceMembers: [{ userEmail: 'jules.b@klocka.immo' }] },
  { id: 'kp', label: 'Mandataire K Partners', canReadAllObjectRecords: true, canUpdateAllObjectRecords: true, workspaceMembers: [],
    objectPermissions: [{ objectMetadataId: 'clients', canReadObjectRecords: false }, { objectMetadataId: 'pk', canReadObjectRecords: true, canUpdateObjectRecords: false }],
    fieldPermissions: [{ objectMetadataId: 'pk', fieldMetadataId: 'acheteurs', canReadFieldValue: false }] },
];
const objets = [
  { id: 'clients', labelPlural: 'Clients', nameSingular: 'clients', fields: [] },
  { id: 'pk', labelPlural: 'Propriétés Klocka', nameSingular: 'proprietesKlocka', fields: [{ id: 'acheteurs', label: 'Acheteurs potentiels', type: 'TEXT' }, { id: 'mid', name: 'mondayId', label: 'Monday', type: 'TEXT' }] },
  { id: 'kpc', labelPlural: 'KP · Clients', nameSingular: 'kpClients', fields: [] },
];
const menu = [
  { id: 'dk', type: 'FOLDER', name: 'Klocka', position: 0 }, { id: 'dkp', type: 'FOLDER', name: 'KPartners', position: 1 },
  { id: 'a', type: 'OBJECT', folderId: 'dk', position: 0, targetObjectMetadataId: 'clients' },
  { id: 'b', type: 'OBJECT', folderId: 'dk', position: 1, targetObjectMetadataId: 'pk' },
  { id: 'c', type: 'OBJECT', folderId: 'dkp', position: 0, targetObjectMetadataId: 'kpc' },
  { id: 'd', type: 'OBJECT', folderId: 'dkp', position: 1, targetObjectMetadataId: 'pk' },
];

test("qui voit quoi : le niveau de chaque rôle par tableau, les champs cachés, un même tableau dans deux dossiers (1er nov. 2026)", () => {
  assert.equal(niveauDe(roles[1], 'clients'), 'ferme');
  assert.equal(niveauDe(roles[1], 'pk'), 'lecture');
  assert.equal(niveauDe(roles[1], 'kpc'), 'plein', 'sans réglage propre, le réglage général du rôle');
  assert.equal(champCache(roles[1], 'acheteurs'), true);
  const v = composerAcces({ roles, objets, menu });
  assert.deepEqual(v.roles.map((r) => [r.nom, r.reglable]), [['Admin', false], ['Mandataire K Partners', true]]);
  assert.deepEqual(v.dossiers.map((d) => [d.nom, d.objets.map((o) => o.nom)]), [['Klocka', ['Clients', 'Propriétés Klocka']], ['KPartners', ['KP · Clients', 'Propriétés Klocka']]]);
  const pk = v.dossiers[1].objets[1];
  assert.equal(pk.acces.kp, 'lecture');
  assert.deepEqual(pk.champs.map((c) => [c.nom, c.caches.kp]), [['Acheteurs potentiels', true]], 'les champs techniques (Monday) ne se montrent pas');
});
