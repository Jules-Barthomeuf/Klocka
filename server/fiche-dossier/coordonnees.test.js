// La même fiche pour toutes les agences et tous les agents (28 nov. 2026) : coordonnées, collaborateurs, une fiche par
// collaborateur.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-coordonnees-'));
const { Records } = await import('../db.js');
const C = await import('./coordonnees.js');
const M = await import('./modele.js');

const agence = Records.create('AgenceProspect', {
  nom: 'Century 21 Indarra', ville: 'Anglet', telephone: '05 59 00 00 00', site: 'century21-indarra-anglet.com', adresse: '33 avenue de Bayonne', code_postal: '64600',
  twenty_agence_id: 'tw-agence-1',
  agents: [{ nom: 'Paul Champagne', fonction: 'Conseiller Transaction', telephone: '06 12 34 56 78', email: 'paul.champagne@c21.fr', page: 'https://c21.fr/paul', note: 4.8, biens_page: [{ type: 'Maison' }] }],
  apollo_equipe: { gens: [{ nom: 'Karim B.', nom_complet: 'Karim Barigou', poste: 'Conseiller Transaction' }] },
});
const mandataire = Records.create('AgenceProspect', { nom: 'Loic Borges', genre: 'mandataire', reseau_nom: 'efficity', ville: 'Bayonne', telephone: '06 27 57 37 99', twenty_agence_id: 'tw-mand-1' });

test('une ligne du tableau Agences : une agence, ou un mandataire (un agent) ; un collaborateur a sa clé', () => {
  assert.equal(M.objetDe('twenty:agence:tw-agence-1').genre, 'agence');
  assert.equal(M.objetDe('twenty:agence:tw-agence-1').nom, 'Century 21 Indarra');
  assert.equal(M.objetDe('twenty:agence:tw-mand-1').genre, 'agent');
  assert.equal(M.objetDe('twenty:agence:inconnue').genre, 'agence');
  const p = M.objetDe(`personne:${agence.id}:karim-barigou`);
  assert.equal(p.genre, 'agent');
  assert.equal(p.nom, 'Karim Barigou');
  assert.match(p.detail, /Century 21 Indarra/);
  assert.equal(M.lienPropre({ cle: `personne:${agence.id}:karim-barigou`, nom: 'Karim' }).genre, 'agent');
});

test('les coordonnées : celles de l\'agence, du mandataire, du collaborateur (et le lien de sa page à coller)', async () => {
  const sans = async () => null;
  const a = await C.coordonnees('twenty:agence:tw-agence-1', { twenty: sans });
  assert.equal(a.telephone, '05 59 00 00 00');
  assert.equal(a.adresse, '33 avenue de Bayonne 64600');
  assert.deepEqual(a.page_equipe, { agence_id: agence.id });
  const m = await C.coordonnees('twenty:agence:tw-mand-1', { twenty: async () => ({ contact: 'EN_CONTACT', eMail: { primaryEmail: 'L.Borges@efficity.com' } }) });
  assert.equal(m.telephone, '06 27 57 37 99');
  assert.equal(m.email, 'l.borges@efficity.com');
  assert.equal(m.statut, 'En contact');
  assert.equal(m.lien_page.agence_id, mandataire.id);
  const p = await C.coordonnees(`personne:${agence.id}:paul-champagne`);
  assert.equal(p.telephone, '06 12 34 56 78');
  assert.equal(p.page, 'https://c21.fr/paul');
  assert.deepEqual(p.agence, { nom: 'Century 21 Indarra', cle: 'twenty:agence:tw-agence-1' });
  assert.deepEqual(p.lien_page, { agence_id: agence.id, nom: 'Paul Champagne' });
});

test('les collaborateurs d\'une agence, chacun avec la clé de sa fiche ; un mandataire n\'en a pas', async () => {
  const gens = await C.collaborateurs('twenty:agence:tw-agence-1');
  const paul = gens.find((x) => x.nom === 'Paul Champagne');
  assert.equal(paul.cle, `personne:${agence.id}:paul-champagne`);
  assert.equal(paul.biens, 1);
  assert.ok(gens.some((x) => x.nom === 'Karim Barigou'));
  assert.equal(await C.collaborateurs('twenty:agence:tw-mand-1'), null);
  // Déjà appelé : sa fiche est celle de l'agent de la Prospection.
  const g = Records.create('AgentImmo', { nom: 'Paul Champagne', telephones: ['06 12 34 56 78'] });
  Records.update('AgenceProspect', agence.id, { carnet_id: g.id });
  assert.equal((await C.collaborateurs('twenty:agence:tw-agence-1')).find((x) => x.nom === 'Paul Champagne').cle, `agent:${g.id}`);
  const ca = await C.coordonnees(`agent:${g.id}`);
  assert.equal(ca.telephone, '06 12 34 56 78');
  assert.equal(ca.agence, undefined);
});

test('le numéro et le mail d\'une ligne de Twenty, quels que soient ses champs', () => {
  assert.deepEqual(C.contactsTwenty({ tel: { primaryPhoneNumber: '612345678', primaryPhoneCallingCode: '+33' }, eMail: { primaryEmail: 'A@B.FR' } }), { telephone: '06 12 34 56 78', email: 'a@b.fr', site: null });
  assert.equal(C.slugNom('Loïc  Borges'), 'loic-borges');
});
