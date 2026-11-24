// « Qui a décroché ? » après l'appel (24 nov. 2026, Jules) : la personne cochée d'office et les cases de Twenty qu'elle remplit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-decroche-'));
import { champsDecroche, quiADecroche } from '../../src/lib/interlocuteurs.js';

const contacts = [
  { id: 'a', nom: 'Sophie Lemaire', telephone: '06 12 48 77 03', email: 's.lemaire@giboire.com' },
  { id: 'b', nom: 'Thomas Berthelot', email_deduit: 't.berthelot@giboire.com' },
  { id: 'c', nom: 'Thomas Hamon' },
  { id: 's', nom: 'Standard', standard: true, telephone: '02 99 79 41 20' },
];

test("le nom entendu pendant l'appel coche sa personne, accents et casse passés", () => {
  assert.deepEqual(quiADecroche({ contacts, entendu: 'sophie LEMAIRE', avant: 'b' }), { id: 'a', nom: 'Sophie Lemaire', par: 'entendu' });
  assert.equal(quiADecroche({ contacts, entendu: 'Sophie', avant: 'b' }).id, 'a');
});

test("un prénom que deux personnes portent, ou un nom hors de la liste : « quelqu'un d'autre », avec le nom entendu", () => {
  assert.deepEqual(quiADecroche({ contacts, entendu: 'Thomas', avant: 'a' }), { id: 'autre', nom: 'Thomas', par: 'entendu' });
  assert.deepEqual(quiADecroche({ contacts, entendu: 'Marc Durand' }), { id: 'autre', nom: 'Marc Durand', par: 'entendu' });
});

test("sans nom entendu, la personne choisie avant l'appel ; jamais le standard ; sinon personne", () => {
  assert.deepEqual(quiADecroche({ contacts, avant: 'b' }), { id: 'b', nom: 'Thomas Berthelot', par: 'avant' });
  assert.equal(quiADecroche({ contacts, avant: 's' }).id, null);
  assert.equal(quiADecroche({ contacts: [] }).id, null);
});

test('les cases de Twenty : le nom, le numéro direct et le mail connus ; jamais un mail déduit ; le standard vide le contact', () => {
  assert.deepEqual(champsDecroche(contacts[0]), { interlocuteur: 'Sophie Lemaire', telephone: '06 12 48 77 03', email: 's.lemaire@giboire.com' });
  assert.deepEqual(champsDecroche(contacts[1]), { interlocuteur: 'Thomas Berthelot' });
  assert.deepEqual(champsDecroche(contacts[3]), { interlocuteur: '' });
  assert.deepEqual(champsDecroche(null), {});
});

test("Twenty : la personne choisie n'écrit pas sur la ligne d'un collègue trouvée par le standard", async () => {
  const { trouverLigne, memePersonne } = await import('./monday-agents.js');
  const l = (id, nom, telephone, entreprise = 'Giboire') => ({ id, nom, telephone, entreprise, ville: 'Rennes', emails: [] });
  const lignes = [l('1', 'Marc Démo', '0299794120'), l('2', 'Sophie L.', '0612487703'), l('3', 'À préciser · Autre', '0388000000', 'Autre')];
  const cible = { telephones: ['0299794120'], emails: [], agence: 'Giboire', ville: 'Rennes' };
  // Sans choix à l'écran : la ligne du standard, comme avant.
  assert.equal(trouverLigne(lignes, { ...cible, contact: 'Sophie Lemaire' }).ligne.id, '1');
  // Choisie : sa ligne à elle (« Sophie L. » est Sophie Lemaire).
  assert.deepEqual([trouverLigne(lignes, { ...cible, contact: 'Sophie Lemaire', contact_choisi: true }).ligne.id], ['2']);
  // Le contact de la ligne lui-même : sa ligne.
  assert.equal(trouverLigne(lignes, { ...cible, contact: 'Marc Démo', contact_choisi: true }).ligne.id, '1');
  // Personne de ce nom dans l'agence : une nouvelle ligne.
  assert.equal(trouverLigne(lignes, { ...cible, contact: 'Paul Martin', contact_choisi: true }).etat, 'nouvelle');
  // Une ligne au nom provisoire se complète.
  assert.equal(trouverLigne(lignes, { telephones: ['0388000000'], agence: 'Autre', contact: 'Paul Martin', contact_choisi: true }).ligne.id, '3');
  assert.equal(memePersonne('Sophie', 'Sophie Lemaire'), true);
  assert.equal(memePersonne('Sophie Martin', 'Sophie Lemaire'), false);
});

test("l'assistant, sur un rappel raconté : sans nom ou pour un agent inconnu, une question et rien de noté", async () => {
  const { executerOutil } = await import('../ak/agent.js');
  const { Records } = await import('../db.js');
  const user = { email: 'jules@klocka.immo', role: 'admin' };
  const avant = Records.list('RappelEntrant').length;
  const sansNom = await executerOutil({ name: 'noter_appel', input: { recit: "Il m'a rappelé, il a deux fiches à m'envoyer." } }, user);
  assert.equal(sansNom.a_preciser, true);
  const inconnu = await executerOutil({ name: 'noter_appel', input: { agent: 'Zébulon Introuvable', agence: 'Agence Qui Nexiste Pas', recit: "Il m'a rappelé, il a deux fiches à m'envoyer." } }, user);
  assert.equal(inconnu.inconnu, true);
  assert.match(inconnu.note, /ajouter au carnet/);
  assert.equal(Records.list('RappelEntrant').length, avant);
});
