// Les champs Personnes en membres de Sunday CRM (28 oct. 2026). Twenty simulé.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Mb from './membres.js';

const EQUIPE = { JulesB: 'jules.b@klocka.immo', 'Maxime Pama': 'maxime.p@klocka.immo', 'Nora LORINQUER': 'nora.l@klocka.immo' };
const MEMBRES = [
  { id: 'm1', userEmail: 'jules.b@klocka.immo', name: { firstName: 'Jules', lastName: 'Barthomeuf' } },
  { id: 'm2', userEmail: 'maxime.p@klocka.immo', name: { firstName: 'Maxime', lastName: 'Pama' } },
];
const OBJET = { nameSingular: 'agentImmobilier', namePlural: 'agentImmobilierListe', champs: [{ name: 'spoc', label: 'SPOC', mondayColonne: 'multiple_person_x', mondayType: 'people' }] };

test('les noms Monday deviennent des membres ; un nom sans compte attend dans le texte', () => {
  assert.deepEqual(Mb.idsDesNoms('JulesB, Nora LORINQUER, Maxime Pama', MEMBRES, EQUIPE), { ids: ['m1', 'm2'], sans: ['Nora LORINQUER'] });
  assert.deepEqual(Mb.idsDesNoms('Jules Barthomeuf', MEMBRES, {}).ids, ['m1'], 'par le nom complet du membre aussi');
  assert.equal(Mb.texteDesIds(['m2', 'm1'], MEMBRES, EQUIPE), 'Maxime Pama, JulesB', 'le nom Monday, que Klocka relit');
});

test('la table de jonction de chaque champ Personnes', () => {
  const [p] = Mb.champsPersonnes(OBJET);
  assert.deepEqual(p.jonction, { nameSingular: 'agentImmobilierSpocMembre', namePlural: 'agentImmobilierSpocMembreListe' });
  assert.equal(p.inverse, 'spocMembres');
});

function twenty(liens) {
  const journal = [];
  return {
    journal,
    lister: async (pluriel) => (pluriel === 'workspaceMembers' ? MEMBRES : liens),
    creer: async (p, v) => { journal.push(['creer', v.membreId]); return { id: 'l' }; },
    supprimer: async (p, id) => { journal.push(['supprimer', id]); },
    lire: async () => ({ id: 'f1', spoc: 'JulesB, Nora LORINQUER' }),
    modifier: async (p, id, v) => { journal.push(['modifier', v]); },
  };
}

test('accorder : les membres suivent le texte, sans doublon', async () => {
  const t = twenty([{ id: 'l1', membreId: 'm1' }, { id: 'l9', membreId: 'm9' }]);
  Mb.brancherPourTests({ twenty: t, objets: [OBJET], equipe: EQUIPE });
  const [p] = Mb.champsPersonnes(OBJET);
  await Mb.accorder(OBJET, p, 'f1', 'JulesB, Maxime Pama');
  assert.deepEqual(t.journal, [['creer', 'm2'], ['supprimer', 'l9']]);
});

test('un membre retiré dans Sunday CRM : le texte suit et garde les noms sans compte', async () => {
  const t = twenty([{ id: 'l2', membreId: 'm2' }]);
  Mb.brancherPourTests({ twenty: t, objets: [OBJET], equipe: EQUIPE });
  const [p] = Mb.champsPersonnes(OBJET);
  const r = await Mb.texteDesMembres(OBJET, p, 'f1');
  assert.equal(r.texte, 'Maxime Pama, Nora LORINQUER');
  assert.deepEqual(r.emails, ['maxime.p@klocka.immo']);
  assert.deepEqual(t.journal, [['modifier', { spoc: 'Maxime Pama, Nora LORINQUER' }]]);
});
