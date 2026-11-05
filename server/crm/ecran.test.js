import test from 'node:test';
import assert from 'node:assert/strict';
import { avecAlias, barrePour, choixSpoc, champMontre, depuisFiltreDeVue, filtreTwenty, ligneHistorique, membresDe, nomDe, rechercheTwenty, roleDe, sansCaches, structurePour, texteCase, valeurPourTwenty, versFiltreDeVue } from './ecran.js';

const objets = [
  { id: 'o1', nameSingular: 'agentImmobilier', namePlural: 'agentImmobilierListe', labelSingular: 'Agent immobilier', labelPlural: 'Agents', fields: [
    { id: 'f1', name: 'name', label: 'Nom', type: 'TEXT' },
    { id: 'f2', name: 'ville', label: 'Ville', type: 'TEXT' },
    { id: 'f3', name: 'remarques', label: 'Remarques', type: 'TEXT' },
    { id: 'f4', name: 'mondayId', label: 'Monday', type: 'TEXT' },
    { id: 'f5', name: 'statut', label: 'Statut', type: 'SELECT', options: [{ value: 'B', label: 'Bis', position: 1 }, { value: 'A', label: 'A', position: 0 }] },
    { id: 'f6', name: 'noteTargets', label: 'Notes', type: 'RELATION' },
  ] },
  { id: 'o2', nameSingular: 'deplacement', namePlural: 'deplacements', labelSingular: 'Déplacement', labelPlural: 'Déplacements', fields: [{ id: 'g1', name: 'name', label: 'Nom', type: 'TEXT' }] },
];
const menu = [
  { id: 'd1', type: 'FOLDER', name: 'Klocka', position: 0 },
  { id: 'm1', type: 'OBJECT', folderId: 'd1', targetObjectMetadataId: 'o1', position: 0 },
  { id: 'm2', type: 'OBJECT', folderId: null, targetObjectMetadataId: 'o2', position: 1 },
  { id: 'm3', type: 'OBJECT', folderId: 'd1', targetObjectMetadataId: 'o2', position: 1, userWorkspaceId: 'perso' },
];
const vues = [{ id: 'v1', objectMetadataId: 'o1', type: 'TABLE', key: 'INDEX', position: 0 }];
const champsDeVue = [{ viewId: 'v1', fieldMetadataId: 'f2', isVisible: true, position: 2 }, { viewId: 'v1', fieldMetadataId: 'f5', isVisible: true, position: 1 }, { viewId: 'v1', fieldMetadataId: 'f3', isVisible: false, position: 3 }];
const trisDeVue = [{ viewId: 'v1', fieldMetadataId: 'f2', direction: 'DESC' }];
const schema = { objets, menu, vues, champsDeVue, trisDeVue };

test('la barre suit le rôle : un tableau fermé disparaît, la vue « All » donne colonnes et tri', () => {
  const role = { canReadAllObjectRecords: true, canUpdateAllObjectRecords: true, objectPermissions: [{ objectMetadataId: 'o2', canReadObjectRecords: false }], fieldPermissions: [] };
  const d = structurePour(role, schema);
  assert.deepEqual(d.map((x) => x.nom), ['Klocka']);
  const o = d[0].objets[0];
  assert.equal(o.niveau, 'plein');
  // Les champs de la machine (Monday) et les relations ne sont pas montrés ; le nom d'abord, puis l'ordre de la vue.
  assert.deepEqual(o.champs.map((c) => c.nom), ['name', 'statut', 'ville', 'remarques']);
  assert.deepEqual(o.champs.filter((c) => c.colonne).map((c) => c.nom), ['name', 'statut', 'ville']);
  assert.deepEqual(o.champs.find((c) => c.nom === 'statut').options.map((x) => x.valeur), ['A', 'B']);
  assert.deepEqual(o.tri, { champ: 'ville', sens: 'desc' });
});

test('en lecture rien ne se modifie, un champ caché au rôle ne sort pas', () => {
  const role = { canReadAllObjectRecords: true, canUpdateAllObjectRecords: false, objectPermissions: [], fieldPermissions: [{ fieldMetadataId: 'f3', canReadFieldValue: false }] };
  const o = structurePour(role, schema)[0].objets[0];
  assert.equal(o.niveau, 'lecture');
  assert.ok(o.champs.every((c) => !c.modifiable));
  assert.ok(!o.champs.some((c) => c.nom === 'remarques'));
  assert.deepEqual(sansCaches({ id: 'x', name: 'A', remarques: 'secret', mondayId: '1' }, o.champs), { id: 'x', name: 'A', statut: null, ville: null });
});

test('le rôle d’une personne se trouve par son adresse, sans casse ; sans rôle, rien', () => {
  const roles = [{ label: 'Admin', workspaceMembers: [{ userEmail: 'Jules.B@klocka.immo' }] }, { label: 'Équipe Klocka', workspaceMembers: [{ userEmail: 'nora.l@klocka.immo' }] }];
  assert.equal(roleDe(roles, 'jules.b@klocka.immo').label, 'Admin');
  assert.equal(roleDe(roles, 'nora.l@klocka.immo').label, 'Équipe Klocka');
  assert.equal(roleDe(roles, 'inconnu@x.fr'), null);
  assert.equal(roleDe(roles, ''), null);
});

test('ce qui est saisi devient la valeur de Twenty', () => {
  assert.equal(valeurPourTwenty('NUMBER', '1 234,5'), 1234.5);
  assert.equal(valeurPourTwenty('NUMBER', ''), null);
  assert.throws(() => valeurPourTwenty('NUMBER', 'abc'));
  assert.deepEqual(valeurPourTwenty('PHONES', '06 12 34 56 78'), { primaryPhoneNumber: '612345678', primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33', additionalPhones: [] });
  assert.deepEqual(valeurPourTwenty('EMAILS', ' a@b.fr ', { additionalEmails: ['c@d.fr'] }), { primaryEmail: 'a@b.fr', additionalEmails: ['c@d.fr'] });
  assert.deepEqual(valeurPourTwenty('CURRENCY', '150000', { currencyCode: 'EUR' }), { amountMicros: 150000000000, currencyCode: 'EUR' });
  assert.deepEqual(valeurPourTwenty('FULL_NAME', 'Jean Pierre Martin'), { firstName: 'Jean', lastName: 'Pierre Martin' });
  assert.equal(valeurPourTwenty('DATE', '2026-11-05'), '2026-11-05');
  assert.equal(valeurPourTwenty('BOOLEAN', true), true);
  assert.equal(valeurPourTwenty('SELECT', ''), null);
});

test('les champs de la machine restent cachés', () => {
  assert.equal(champMontre({ name: 'mondayId', type: 'TEXT' }), false);
  assert.equal(champMontre({ name: 'deplacerVers', type: 'SELECT' }), false);
  assert.equal(champMontre({ name: 'linkToProprietes', type: 'TEXT' }), false);
  assert.equal(champMontre({ name: 'createdAt', type: 'DATE_TIME', isSystem: true }), true);
  assert.equal(champMontre({ name: 'ville', type: 'TEXT', isActive: false }), false);
});

test('les filtres de l’écran deviennent ceux de Twenty', () => {
  const texte = { nom: 'ville', type: 'TEXT' };
  const choix = { nom: 'statut', type: 'SELECT' };
  const mail = { nom: 'eMail', type: 'EMAILS' };
  const lien = { nom: 'agent', type: 'RELATION', cle: 'agentId' };
  const prix = { nom: 'prix', type: 'CURRENCY' };
  assert.equal(filtreTwenty(texte, { op: 'contient', valeur: 'Lyon' }), 'ville[ilike]:"%Lyon%"');
  assert.equal(filtreTwenty(texte, { op: 'contient', valeur: '  ' }), null);
  assert.equal(filtreTwenty(texte, { op: 'vide' }), 'or(ville[is]:NULL,ville[eq]:"")');
  assert.equal(filtreTwenty(choix, { op: 'parmi', valeur: ['A', 'B'] }), 'statut[in]:["A","B"]');
  assert.equal(filtreTwenty(choix, { op: 'hors', valeur: ['A'] }), 'not(statut[in]:["A"])');
  assert.equal(filtreTwenty(mail, { op: 'contient', valeur: 'orpi' }), 'eMail.primaryEmail[ilike]:"%orpi%"');
  assert.equal(filtreTwenty(lien, { op: 'non_vide' }), 'agentId[is]:NOT_NULL');
  assert.equal(filtreTwenty(lien, { op: 'moi' }, { membreId: 'm1' }), 'agentId[eq]:"m1"');
  assert.equal(filtreTwenty(prix, { op: 'sup', valeur: '150000' }), 'prix.amountMicros[gte]:150000000000');
  assert.equal(filtreTwenty({ nom: 'd', type: 'DATE' }, { op: 'avant', valeur: '2026-11-05' }), 'd[lt]:"2026-11-05"');
});

test('les filtres d’une vue de Twenty se lisent, les autres sont laissés', () => {
  const choix = { nom: 'groupe', type: 'SELECT' };
  assert.deepEqual(depuisFiltreDeVue(choix, { operand: 'IS', value: '["CLIENTS_SIGNES"]' }), { champ: 'groupe', op: 'parmi', valeur: ['CLIENTS_SIGNES'] });
  assert.deepEqual(depuisFiltreDeVue({ nom: 'assignee', type: 'RELATION' }, { operand: 'IS', value: '{"isCurrentWorkspaceMemberSelected":true,"selectedRecordIds":[]}' }), { champ: 'assignee', op: 'moi' });
  assert.deepEqual(depuisFiltreDeVue({ nom: 'ville', type: 'TEXT' }, { operand: 'CONTAINS', value: 'Lyon' }), { champ: 'ville', op: 'contient', valeur: 'Lyon' });
  assert.equal(depuisFiltreDeVue({ nom: 'x', type: 'TEXT' }, { operand: 'BIZARRE', value: '' }), null);
  assert.equal(depuisFiltreDeVue(null, { operand: 'IS', value: '[]' }), null);
});

test('la recherche porte sur les champs texte, un téléphone sans son 0', () => {
  const champs = [{ nom: 'name', type: 'TEXT' }, { nom: 'telephone', type: 'PHONES' }, { nom: 'prix', type: 'NUMBER' }];
  assert.equal(rechercheTwenty(champs, 'lille'), 'or(name[ilike]:"%lille%",telephone.primaryPhoneNumber[ilike]:"%lille%")');
  assert.equal(rechercheTwenty(champs, '06 12'), 'or(name[ilike]:"%06 12%",telephone.primaryPhoneNumber[ilike]:"%612%")');
  assert.equal(rechercheTwenty(champs, ''), null);
});

test('le nom d’une fiche, et les membres de l’espace', () => {
  assert.equal(nomDe({ name: 'Agence' }), 'Agence');
  assert.equal(nomDe({ name: { firstName: 'Jean', lastName: 'Martin' } }), 'Jean Martin');
  assert.equal(nomDe({ title: 'Rappeler' }), 'Rappeler');
  assert.deepEqual(membresDe([{ workspaceMembers: [{ id: 'm1', name: { firstName: 'Nora', lastName: 'L' } }] }, { workspaceMembers: [{ id: 'm1', name: { firstName: 'Nora', lastName: 'L' } }, { id: 'm2', userEmail: 'x@y.fr' }] }]), [{ id: 'm1', nom: 'Nora L' }, { id: 'm2', nom: 'x@y.fr' }]);
});

test('un filtre enregistré dans une vue se relit tel quel', () => {
  const choix = { id: 'f5', nom: 'statut', type: 'SELECT' };
  const texte = { id: 'f2', nom: 'ville', type: 'TEXT' };
  for (const [c, f] of [[choix, { champ: 'statut', op: 'parmi', valeur: ['A'] }], [choix, { champ: 'statut', op: 'hors', valeur: ['B'] }], [texte, { champ: 'ville', op: 'contient', valeur: 'Lyon' }], [texte, { champ: 'ville', op: 'vide' }], [{ id: 'r', nom: 'agent', type: 'RELATION' }, { champ: 'agent', op: 'moi' }]]) {
    const vf = versFiltreDeVue(c, f);
    const relu = depuisFiltreDeVue(c, vf);
    assert.equal(relu.op, f.op);
    if (f.valeur !== undefined) assert.deepEqual(relu.valeur, f.valeur);
  }
  assert.equal(versFiltreDeVue(null, { op: 'contient' }), null);
});

test('l’historique dit qui a fait quoi, avec l’avant et l’après', () => {
  const champs = [{ nom: 'ville', libelle: 'Ville', type: 'TEXT' }, { nom: 'agent', cle: 'agentId', libelle: 'Agent', type: 'RELATION' }];
  const maj = ligneHistorique({ id: '1', happensAt: 'x', workspaceMemberId: 'm1', timelineActivityTypeSnapshot: { action: 'updated', name: 'recordUpdated' }, properties: { diff: { ville: { before: 'Nice', after: 'Lyon' }, agentId: { before: null, after: 'a1' }, inconnu: {} } } }, champs, [{ id: 'm1', nom: 'Nora L' }]);
  assert.equal(maj.qui, 'Nora L');
  assert.equal(maj.quoi, 'a modifié Ville, Agent');
  assert.deepEqual(maj.changes[0], { champ: 'ville', libelle: 'Ville', avant: 'Nice', apres: 'Lyon' });
  const note = ligneHistorique({ id: '2', createdBy: { source: 'API', name: 'TWENTY_API_KEY' }, timelineActivityTypeSnapshot: { action: 'linked', name: 'noteLinked' }, linkedRecordCachedName: 'Rappel' }, champs);
  assert.equal(note.qui, 'Klocka');
  assert.equal(note.quoi, 'a ajouté une note');
  assert.equal(note.lie, 'Rappel');
  assert.equal(ligneHistorique({ id: '3', timelineActivityTypeSnapshot: { action: 'updated' }, properties: { diff: {} } }, champs), null);
});

test('une case d’export se lit comme à l’écran, sans mise en forme', () => {
  assert.equal(texteCase({ type: 'SELECT', options: [{ valeur: 'A', libelle: 'Actif' }] }, 'A'), 'Actif');
  assert.equal(texteCase({ type: 'CURRENCY' }, { amountMicros: 150000000000 }), '150000');
  assert.equal(texteCase({ type: 'PHONES' }, { primaryPhoneNumber: '612345678', primaryPhoneCallingCode: '+33' }), '+33612345678');
  assert.equal(texteCase({ type: 'RELATION', nom: 'agent' }, 'a1', { agent: { a1: 'Bruno' } }), 'Bruno');
  assert.equal(texteCase({ type: 'TEXT' }, null), '');
});

test('l’espace mandataire : KPartners d’abord et ouvert, le reste fermé avec sa raison', () => {
  const tous = [{ nom: 'Klocka', objets: [{ singulier: 'agent', nom: 'Agent' }, { singulier: 'pk', nom: 'Propriétés Klocka' }] }, { nom: 'KPartners', objets: [{ singulier: 'kp', nom: 'KP · Prospects' }, { singulier: 'pk', nom: 'Propriétés Klocka' }] }, { nom: 'Autres', objets: [{ singulier: 'x', nom: 'X' }] }];
  const ouverts = [{ nom: 'Klocka', objets: [{ singulier: 'pk', nom: 'Propriétés Klocka', niveau: 'lecture' }] }, { nom: 'KPartners', objets: [{ singulier: 'kp', nom: 'KP · Prospects', niveau: 'plein' }, { singulier: 'pk', nom: 'Propriétés Klocka', niveau: 'lecture' }] }];
  const b = barrePour(ouverts, tous, { mandataire: true });
  assert.deepEqual(b.map((d) => [d.nom, d.ferme]), [['KPartners', false], ['Klocka', true], ['Autres', true]]);
  assert.equal(b[1].raison, 'Cet espace est réservé aux administrateurs Klocka.');
  assert.equal(b[0].objets[1].niveau, 'lecture');
  // L'équipe : ses espaces ouverts, une page fermée garde son cadenas et la raison de l'espace.
  const e = barrePour([{ nom: 'Klocka', objets: tous[0].objets.map((o) => ({ ...o, niveau: 'plein' })) }, { nom: 'KPartners', objets: [{ singulier: 'pk', nom: 'Propriétés Klocka', niveau: 'plein' }] }], tous);
  assert.equal(e[1].ferme, false);
  assert.deepEqual(e[1].objets.map((o) => !!o.ferme), [true, false]);
  assert.equal(e[1].objets[0].raison, 'Cet espace est réservé aux mandataires K Partners.');
  assert.equal(e[2].ferme, true);
});

test('un administrateur dans l’espace mandataire peut aller voir l’espace Klocka', () => {
  const tous = [{ nom: 'Klocka', objets: [{ singulier: 'agent', nom: 'Agent' }] }, { nom: 'KPartners', objets: [{ singulier: 'kp', nom: 'KP · Prospects' }] }];
  const ouverts = tous.map((d) => ({ nom: d.nom, objets: d.objets.map((o) => ({ ...o, niveau: 'plein' })) }));
  const b = barrePour(ouverts, tous, { mandataire: true, admin: true });
  assert.deepEqual(b.map((d) => [d.nom, d.ferme]), [['KPartners', false], ['Klocka', false]]);
});

test('le SPOC : les noms Monday retrouvent le membre, la liste de Jules écrit le nom Monday', () => {
  const roles = [{ workspaceMembers: [{ id: 'm1', userEmail: 'jules.b@klocka.immo', name: { firstName: 'Jules', lastName: 'Barthomeuf' } }] }];
  const equipe = { JulesB: 'jules.b@klocka.immo', 'Coralie GUILLAUD': 'coralie.g@klocka.immo' };
  assert.deepEqual(avecAlias(membresDe(roles), roles, equipe)[0].alias, ['Jules Barthomeuf', 'JulesB']);
  const choix = choixSpoc([{ nom: 'Jules Barthomeuf', email: 'jules.b@klocka.immo' }, { nom: 'Coralie Guillaud', email: 'coralie.g@klocka.immo' }], equipe, roles);
  assert.deepEqual(choix, [{ nom: 'Jules Barthomeuf', valeur: 'JulesB', membre: 'm1' }, { nom: 'Coralie Guillaud', valeur: 'Coralie GUILLAUD', membre: null }]);
});
