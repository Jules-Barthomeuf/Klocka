// Haka : sourcing@ comme boîte de commandes. Le tri garde la demande d'un
// collègue, Haka répond (moteur remplacé ici), dépose dans la file et répond
// par mail (simulé) ; un extérieur va dans le Commun sans réponse.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-demande-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@test.local';
process.env.HAKA_FILE = '1';
process.env.HAKA_SIMULER = '1';
process.env.MAIL_DOMAINES_INTERNES = 'klocka.immo';
const { Records, Meta } = await import('../db.js');
const T = await import('./taches.js');
const F = await import('./file.js');
const D = await import('./competences/demande-equipe.js');
const { surReleve } = await import('./declencheurs.js');
const { trierMail, referentielTri } = await import('../deal/tri-mails.js');
// Les drapeaux se chargent en différé dans le tri : on laisse passer un tour.
await new Promise((r) => setTimeout(r, 30));

Records.create('User', { email: 'jules@test.local', role: 'admin', full_name: 'Jules' });
const nora = Records.create('User', { email: 'nora@klocka.immo', role: 'admin', full_name: 'Nora' });
Meta.set('mail.preanalyse_auto.depuis', '2026-01-01T00:00:00.000Z');

test('le tri : sur sourcing@, un mail de l\'équipe sans pièce est une demande à l\'Assistant KPartners ; ailleurs il reste dehors', () => {
  const ref = referentielTri();
  assert.ok(ref.commandes?.has('sourcing@klocka.immo'));
  const demande = trierMail({ compte: 'sourcing@klocka.immo', de_email: 'nora@klocka.immo', objet: 'Prépare la LOI pour Carnot', pieces_jointes: [] }, ref);
  assert.deepEqual([demande.garder, demande.commande, demande.interne], [true, true, true]);
  const ailleurs = trierMail({ compte: 'nora@klocka.immo', de_email: 'jules@klocka.immo', objet: 'On déjeune ?', pieces_jointes: [] }, ref);
  assert.equal(ailleurs.garder, false);
});

test('une demande de Nora : Assistant KPartners répond, dépose dans la file pour elle, et lui répond par mail depuis sourcing@', async () => {
  const recu = [];
  D._brancherRepondeur(async ({ texte, user }) => { recu.push({ texte, user: user.email }); return { texte: 'Voici la LOI pour Carnot, à 215 000 €.', actions: [{ libelle: 'LOI rédigée' }], sources: [] }; });
  const mail = Records.create('MailRecu', { compte: 'sourcing@klocka.immo', de: 'Nora <nora@klocka.immo>', de_email: 'nora@klocka.immo', objet: 'Prépare la LOI pour Carnot à 215 000 €', texte: 'Merci !', date: new Date().toISOString(), interne: true, commande: true, pieces_jointes: [] });
  const b = await surReleve({});
  assert.equal(b.demandes, 1);
  await T.tourner();
  const t = T.tache(Records.get('MailRecu', mail.id).haka_tache_id);
  assert.equal(t.etat, 'faite', t.erreur || '');
  assert.match(recu[0].texte, /Prépare la LOI pour Carnot/);
  assert.equal(recu[0].user, 'nora@klocka.immo');
  const p = Records.list('HakaProposition').find((x) => x.type === 'reponse_equipe');
  assert.ok(p);
  assert.equal(p.pour, 'nora@klocka.immo');
  assert.match(p.charge.reponse, /LOI pour Carnot/);
  assert.deepEqual(p.actions, ['vu']);
  assert.ok(F.lister(nora, 'moi').some((x) => x.id === p.id));
  const envoi = Records.list('EmailLog').find((e) => e.template_id === `haka-reponse:${mail.id}`);
  assert.ok(envoi, 'un mail de réponse');
  assert.equal(envoi.statut, 'simule');
  assert.equal(envoi.destinataire, 'nora@klocka.immo');
  assert.match(envoi.contenu, /AValider\?id=/);
  // Le même relevé ne refait rien.
  const b2 = await surReleve({});
  assert.equal(b2.demandes || 0, 0);
});

test('un extérieur qui écrit à sourcing@ : dans le Commun, sans réponse automatique', async () => {
  const mail = Records.create('MailRecu', { compte: 'sourcing@klocka.immo', de: 'Inconnu <qqn@ailleurs.fr>', de_email: 'qqn@ailleurs.fr', objet: 'Bonjour, je vends mes murs', texte: 'Pouvez-vous me rappeler ?', date: new Date().toISOString(), pieces_jointes: [] });
  const b = await surReleve({});
  assert.equal(b.exterieurs, 1);
  const p = Records.list('HakaProposition').find((x) => x.type === 'mail_exterieur');
  assert.ok(p);
  assert.equal(p.pour, null);
  assert.equal(Records.get('MailRecu', mail.id).haka_vu, p.id);
  assert.ok(!Records.list('EmailLog').some((e) => e.destinataire === 'qqn@ailleurs.fr'), 'rien n\'est parti');
  assert.equal((await surReleve({})).exterieurs || 0, 0);
});
