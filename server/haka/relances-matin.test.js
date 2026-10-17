// Haka : les relances du matin. Le propriétaire d'un agent (le premier qui l'a
// appelé), le tour une fois par jour ouvré, une proposition par relance pour la
// bonne personne, le rejet qui écarte le mail.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-matin-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@test.local';
process.env.HAKA_FILE = '1';
process.env.HAKA_SIMULER = '1';
const { Records, Meta } = await import('../db.js');
const T = await import('./taches.js');
const F = await import('./file.js');
const M = await import('./competences/relances-matin.js');

Records.create('User', { email: 'jules@test.local', role: 'admin', full_name: 'Jules' });
const nora = Records.create('User', { email: 'nora@test.local', role: 'admin', full_name: 'Nora' });
Records.create('User', { email: 'client@test.local', role: 'user' });

test('le propriétaire d\'un agent : le premier appel validé, s\'il vient de l\'équipe', () => {
  const appels = [
    { agent_id: 'a1', par: 'paul@test.local', etat: 'valide', le: '2026-10-10T10:00:00Z' },
    { agent_id: 'a1', par: 'nora@test.local', etat: 'valide', le: '2026-10-01T10:00:00Z' },
    { agent_id: 'a1', par: 'maxime@test.local', etat: 'valide', essai: true, le: '2026-09-01T10:00:00Z' },
    { agent_id: 'a2', par: 'client@test.local', etat: 'valide', le: '2026-10-01T10:00:00Z' },
    { agent_id: 'a3', par: 'nora@test.local', etat: 'a_valider', le: '2026-10-01T10:00:00Z' },
  ];
  const users = Records.list('User');
  assert.equal(M.proprietaireDeLAgent('a1', { appels, users }), 'nora@test.local');
  assert.equal(M.proprietaireDeLAgent('a2', { appels, users }), null, 'pas un admin');
  assert.equal(M.proprietaireDeLAgent('a3', { appels, users }), null, 'pas d\'appel validé');
  assert.equal(M.proprietaireDeLAgent('inconnu', { appels, users }), null);
});

test('le tour du matin : lundi à vendredi, dès 8 h, une fois par jour', () => {
  const lundi9h = new Date('2026-10-19T07:30:00Z'); // 9 h 30 à Paris
  const lundi7h = new Date('2026-10-19T05:30:00Z');
  const samedi = new Date('2026-10-17T09:00:00Z');
  assert.equal(M.aLancer({ maintenant: lundi9h, dernier: null }), true);
  assert.equal(M.aLancer({ maintenant: lundi9h, dernier: '2026-10-19' }), false);
  assert.equal(M.aLancer({ maintenant: lundi7h, dernier: null }), false);
  assert.equal(M.aLancer({ maintenant: samedi, dernier: null }), false);
  const t = M.tourDuMatin({ maintenant: lundi9h });
  assert.ok(t && t.type === 'relances_matin');
  assert.equal(Meta.get('haka.matin.dernier'), '2026-10-19');
  assert.equal(M.tourDuMatin({ maintenant: lundi9h }), null, 'pas deux fois le même jour');
  T.annuler(t.id, 'test');
});

test('une relance préparée devient une proposition pour le propriétaire de l\'agent ; rejeter écarte le mail', async () => {
  const agent = Records.create('AgentImmo', { nom: 'Marc Agent', emails: ['marc@agence.fr'], agence: 'Agence Test' });
  Records.create('AppelAgent', { agent_id: agent.id, par: 'nora@test.local', etat: 'valide', le: '2026-10-01T10:00:00Z', issue: 'aboutie' });
  // Un mail déjà préparé (comme depuis la page Relances) : le tour du matin le prend tel quel.
  const m = Records.create('ProspectionMail', { etat: 'pret', genre: 'relance', sous_genre: 'relance_mail', cle: 'relance_mail:x', agent_id: agent.id, nom: 'Marc Agent', agence: 'Agence Test', ville: 'Nice', a: 'marc@agence.fr', objet: 'Point du mois', corps: 'Bonjour Marc,', motif: 'Point mensuel', ligne_le: '2026-10-19', cree_le: new Date().toISOString() });
  const sansProprio = Records.create('ProspectionMail', { etat: 'pret', genre: 'relance', sous_genre: 'relance_mail', cle: 'relance_mail:y', agent_id: 'inconnu', nom: 'Sans Maître', a: 'x@y.fr', objet: 'Suite', corps: 'Bonjour,', cree_le: new Date().toISOString() });
  // `rediger` injecté : aucun modèle ; `candidats` ne trouve rien (pas de relance due en base), la préparation rend 0.
  const t = T.enfiler('relances_matin', { jour: '2026-10-19', rediger: async () => ({ mails: [] }), lancer: false }, { cle: 'relances_matin:test', lancer: false });
  await T.tourner();
  assert.equal(T.tache(t.id).etat, 'faite', T.tache(t.id).erreur || '');
  const r = JSON.parse(T.etapesDe(t.id)[0].resultat);
  assert.equal(r.en_file, 2);
  await T.tourner();
  const pNora = Records.list('HakaProposition').find((p) => p.charge?.mail_id === m.id);
  assert.ok(pNora, 'une proposition pour le mail de Marc');
  assert.equal(pNora.type, 'relance_mail');
  assert.equal(pNora.pour, 'nora@test.local');
  assert.equal(pNora.charge.a, 'marc@agence.fr');
  assert.equal(pNora.source.entite, 'ProspectionMail');
  assert.equal(Records.get('ProspectionMail', m.id).haka_proposition_id, pNora.id);
  const pCommun = Records.list('HakaProposition').find((p) => p.charge?.mail_id === sansProprio.id);
  assert.equal(pCommun.pour, null, 'sans propriétaire : le Commun');
  assert.ok(F.lister(nora, 'commun').some((x) => x.id === pCommun.id));
  // Rejeter : le mail est écarté, la relance reste due.
  const rej = await F.rejeter(pNora.id, nora, 'Je l\'appelle plutôt');
  assert.equal(rej.ok, true);
  assert.equal(Records.get('ProspectionMail', m.id).etat, 'ecarte');
  // Relancer le tour : le mail écarté n'est pas repris, celui du Commun non plus (déjà en tâche).
  const t2 = T.enfiler('relances_matin', { jour: '2026-10-20', rediger: async () => ({ mails: [] }), lancer: false }, { cle: 'relances_matin:test2', lancer: false });
  await T.tourner();
  assert.equal(JSON.parse(T.etapesDe(t2.id)[0].resultat).en_file, 0);
});
