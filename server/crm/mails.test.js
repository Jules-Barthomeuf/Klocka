// Envoyer un mail depuis Sunday CRM (29 oct. 2026). Twenty, l'envoi et le fil simulés.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Mails from './mails.js';
import * as Mb from './membres.js';

const MEMBRES = [{ id: 'm1', userEmail: 'Nora.L@klocka.immo', name: { firstName: 'Nora', lastName: 'L' } }];

function banc(envoi, resultat = { success: true, expediteur: 'nora.l@klocka.immo' }) {
  const journal = [];
  const twenty = {
    lister: async () => MEMBRES,
    lire: async () => envoi,
    modifier: async (p, id, v) => { journal.push(['modifier', v]); },
  };
  Mb.brancherPourTests({ twenty, objets: [], equipe: {} });
  Mails.brancherPourTests({
    twenty,
    envoi: async (x) => { journal.push(['envoi', x]); return resultat; },
    fil: async (id, texte) => { journal.push(['fil', id, texte.split('\n')[0]]); },
  });
  return journal;
}

test('un mail écrit par une personne part de sa boîte, puis s’inscrit dans le fil de la fiche', async () => {
  const j = banc({ id: 'e1', statut: 'A_ENVOYER', a: 'agent@exemple.fr', objet: 'Bonjour', corps: 'Texte', ficheId: 'f1' });
  await Mails.envoyerDepuisTwenty('e1', 'm1');
  assert.equal(j[0][0], 'envoi');
  assert.equal(j[0][1].owner, 'nora.l@klocka.immo', 'la boîte de la personne qui a écrit, pas une autre');
  assert.equal(j[0][1].to, 'agent@exemple.fr');
  assert.deepEqual(j[1], ['modifier', { statut: 'ENVOYE', expediteur: 'nora.l@klocka.immo' }]);
  assert.deepEqual(j[2], ['fil', 'f1', 'Mail envoyé à agent@exemple.fr par nora.l@klocka.immo : Bonjour']);
});

test('un refus de Gmail reste visible sur l’envoi', async () => {
  const j = banc({ id: 'e2', statut: 'A_ENVOYER', a: 'x@y.fr', objet: 'O' }, { success: false, error: 'Aucun compte expéditeur' });
  await Mails.envoyerDepuisTwenty('e2', 'm1');
  assert.deepEqual(j.at(-1), ['modifier', { statut: 'ERREUR', erreur: 'Aucun compte expéditeur', expediteur: 'nora.l@klocka.immo' }]);
});

test('rien ne part pour un inconnu, un envoi déjà traité, ou une écriture de Klocka', async () => {
  let j = banc({ id: 'e3', statut: 'A_ENVOYER', a: 'x@y.fr', objet: 'O' });
  await Mails.envoyerDepuisTwenty('e3', 'inconnu');
  assert.deepEqual(j, [['modifier', { statut: 'ERREUR', erreur: 'Expéditeur inconnu dans Sunday CRM' }]]);
  j = banc({ id: 'e4', statut: 'ENVOYE', a: 'x@y.fr', objet: 'O' });
  await Mails.envoyerDepuisTwenty('e4', 'm1');
  assert.deepEqual(j, []);
  assert.deepEqual(Mails.depuisTwenty({ eventName: 'envoiMail.created', record: { id: 'e5' }, workspaceMemberId: null }), { ignore: 'écrit par Klocka' });
  assert.equal(Mails.depuisTwenty({ eventName: 'agentImmobilier.created', record: { id: 'x' } }), null);
});
