// La suppression d'un dossier : le dossier part, sa fiche ne compte plus
// comme importée, et rien ne la repropose ni ne la ré-analyse tout seul.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-suppr-'));
const { Records, CHEMIN_UPLOADS } = await import('../db.js');
const { supprimerDossier, detacherMails, fichiersDuDossier } = await import('./supprimer.js');
const { listerFiches } = await import('./fiches-stats.js');
const { estUneNouvelleFiche } = await import('./fiches-auto.js');

test('supprimer : le dossier, ses traces, ses fichiers, et la fiche décomptée', async () => {
  fs.mkdirSync(CHEMIN_UPLOADS, { recursive: true });
  const fichier = path.join(CHEMIN_UPLOADS, 'fiche-macon.pdf');
  fs.writeFileSync(fichier, 'pdf');
  const deal = Records.create('Deal', {
    deal_id: 'd-suppr', nom: 'Doublon Mâcon', lots: [{ synthese: { titre: 'Doublon Mâcon' } }],
    source: { url: '/uploads/fiche-macon.pdf' },
  });
  const mail = Records.create('MailRecu', {
    deal_id: 'd-suppr', objet: 'Fiche Mâcon', de_email: 'theo@quorner.com', date: new Date().toISOString(),
    pieces_jointes: [{ nom: 'fiche.pdf', piece_id: 'p1' }],
  });
  Records.update('Deal', deal.id, { source_mail: { mail_recu_id: mail.id, objet: 'Fiche Mâcon' } });
  Records.create('Engagement', { deal_id: 'd-suppr', statut: 'ouvert' });
  const cible = Records.create('Cible', { deal_id: 'd-suppr', nom: 'Cible' });

  const avant = listerFiches({ deals: Records.list('Deal'), mails: Records.list('MailRecu'), projets: [] }, {}).length;
  const r = await supprimerDossier('d-suppr', { user: { email: 'jules.b@klocka.immo' } });
  assert.equal(r.ok, true);
  assert.equal(r.titre, 'Doublon Mâcon');
  assert.ok(!Records.findBy('Deal', 'deal_id', 'd-suppr'));
  assert.ok(!fs.existsSync(fichier), 'la pièce du disque est effacée');
  assert.equal(Records.filter('Engagement', { deal_id: 'd-suppr' }).length, 0);
  assert.equal(Records.get('Cible', cible.id).deal_id, null);

  const m = Records.get('MailRecu', mail.id);
  assert.equal(m.deal_id, null);
  assert.ok(m.dossier_supprime_le, 'le mail porte la marque du dossier supprimé');
  const apres = listerFiches({ deals: Records.list('Deal'), mails: Records.list('MailRecu'), projets: [] }, {}).length;
  assert.equal(apres, avant - 1, 'le compteur de fiches redescend de un');
  assert.equal(estUneNouvelleFiche(m, {}), false, 'l\'auto-préanalyse ne la reprend pas');
});

test('un projet né du dossier bloque la suppression', async () => {
  const projet = Records.create('Project', { titre: 'Projet vivant' });
  Records.create('Deal', { deal_id: 'd-avec-projet', nom: 'X', projet_id: projet.id, lots: [{}] });
  const r = await supprimerDossier('d-avec-projet');
  assert.equal(r.ok, false);
  assert.match(r.error, /projet/i);
  assert.ok(Records.findBy('Deal', 'deal_id', 'd-avec-projet'));
});

test('un mail à plusieurs fiches garde les autres dossiers', () => {
  Records.create('Deal', { deal_id: 'd-a', lots: [{}] });
  Records.create('Deal', { deal_id: 'd-b', lots: [{}] });
  const m = Records.create('MailRecu', { deal_id: 'd-a', deal_ids: ['d-a', 'd-b'], objet: 'Deux fiches' });
  detacherMails('d-a');
  const apres = Records.get('MailRecu', m.id);
  assert.equal(apres.deal_id, 'd-b');
  assert.deepEqual(apres.deal_ids, ['d-b']);
  assert.ok(!apres.dossier_supprime_le, 'il reste un dossier : la fiche compte encore');
});

test('fichiersDuDossier ne sort jamais du dossier uploads', () => {
  const chemins = fichiersDuDossier({ deal_id: 'x', source: { url: '/uploads/../../etc/passwd' }, lots: [] }, []);
  assert.deepEqual(chemins, []);
});
