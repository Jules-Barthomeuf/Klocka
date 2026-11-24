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

test("un rappel raconté retrouve l'agent dans Twenty CRM à l'orthographe près (« Durançon » pour « Duranson »)", async () => {
  const { trouverDansMonday } = await import('./rappels.js');
  const lignes = [
    { id: 'a', nom: 'Arthur Duranson', entreprise: 'HAPI IMMOBILIER', ville: 'Grenoble', telephone: '+33609760920', emails: [] },
    { id: 'b', nom: 'Arthur Martin', entreprise: 'Autre', ville: 'Lyon', telephone: '', emails: [] },
  ];
  assert.equal(trouverDansMonday({ nom: 'Arthur Durançon' }, lignes).ligne?.id, 'a');
  assert.equal(trouverDansMonday({ nom: 'arthur duranson' }, lignes).ligne?.id, 'a');
  assert.equal(trouverDansMonday({ telephone: '06 09 76 09 20' }, lignes).ligne?.id, 'a');
});

// Une précision dans le chat (24 nov. 2026, Jules : « je te dis qu'il vient de me rappeler, j'ai déjà envoyé un mail »,
// dicté avec « contact@gence tiret du 6 ») : la note refaite, l'adresse lue comme la connue, le mail parti décoché.
test("une adresse dictée incomplète prend l'adresse connue qui lui ressemble, sinon aucune", async () => {
  const R = await import('./regles.js');
  assert.equal(R.adresseEntendue('contact@gence-du-6', ['contact@agence-du-6.fr', 'autre@x.fr']), 'contact@agence-du-6.fr');
  assert.equal(R.adresseEntendue('contact@gence tiret du 6', ['contact@agence-du-6.fr']), 'contact@agence-du-6.fr');
  assert.equal(R.adresseEntendue('contact@gence-du-6', ['jean@foncia.fr']), null);
  assert.equal(R.adresseEntendue('Paul@Agence.fr', []), 'paul@agence.fr');
  assert.equal(R.adresseEntendue('info@locopro-immo.entreprise', ['info@locopro-immo-entreprise.com']), 'info@locopro-immo-entreprise.com');
  assert.equal(R.adresseEntendue('paul@agence.fr', ['paule@agence.fr']), 'paul@agence.fr');
});

test("un mail déjà parti se reconnaît dans le récit ; un mail demandé non", async () => {
  const { mailEnvoyeDans } = await import('./mode-appel.js');
  assert.equal(mailEnvoyeDans("il vient de me rappeler donc j'ai déjà envoyé un mail"), true);
  assert.equal(mailEnvoyeDans("j'ai laissé un mail à l'adresse contact@agence.fr"), true);
  assert.equal(mailEnvoyeDans('mail envoyé ce matin'), true);
  assert.equal(mailEnvoyeDans('il veut un mail, voici son adresse'), false);
});

test("une précision sur l'échange noté juste avant refait sa note : l'ancienne est retirée", async () => {
  const RP = await import('./rappels.js');
  const { Records } = await import('../db.js');
  const user = { email: 'analyste@klocka.immo', role: 'admin' };
  assert.equal(RP.recitPrecise('Il va me rappeler.', "Il vient de me rappeler, j'ai déjà envoyé un mail."), "Il va me rappeler.\n\nPrécision donnée ensuite, qui l'emporte sur ce qui la contredit : Il vient de me rappeler, j'ai déjà envoyé un mail.");
  assert.equal(RP.recitPrecise('Il va me rappeler.', 'Il va me rappeler. Et il a deux fiches.'), 'Il va me rappeler. Et il a deux fiches.');
  const agent = Records.create('AgentImmo', { nom: 'Agent Rouge', agence: 'Le Rouge et le Noir', telephones: [], emails: [] });
  const appel = Records.create('AppelAgent', { agent_id: agent.id, etat: 'a_valider', par: user.email });
  const vieux = Records.create('RappelEntrant', { par: user.email, sens: 'raconte', etat: 'identifie', agent_id: agent.id, appel_id: appel.id, debut: new Date(Date.now() - 3600000).toISOString(), notes: 'x' });
  const ancien = Records.create('RappelEntrant', { par: user.email, sens: 'raconte', etat: 'identifie', agent_id: agent.id, appel_id: appel.id, debut: new Date().toISOString(), notes: 'Il va me rappeler.' });
  assert.equal(RP.recitRecent(user)?.id, ancien.id);
  assert.equal(RP.recitRecent({ email: 'autre@klocka.immo' }), null);
  const nouveau = Records.create('RappelEntrant', { par: user.email, sens: 'raconte', etat: 'identifie', agent_id: agent.id, debut: new Date().toISOString(), notes: '' });
  assert.equal(RP.remplacerRecit(ancien.id, nouveau.id, user).ok, true);
  assert.equal(RP.lire(ancien.id, user).rappel.etat, 'remplace');
  assert.equal(RP.lire(ancien.id, user).rappel.remplace_par, nouveau.id);
  assert.equal(Records.get('AppelAgent', appel.id).etat, 'remplace');
  assert.equal(Records.get('RappelEntrant', vieux.id).etat, 'identifie');
});
