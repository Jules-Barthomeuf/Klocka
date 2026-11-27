// L'activité d'un client, ses projets présentés et ses transactions, dans sa fiche (27 nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-activite-client-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('../db.js');
const A = await import('./activite-client.js');
const T = await import('./transactions-client.js');
const M = await import('./modele.js');

const maintenant = new Date('2026-11-27T12:00:00Z');

test("l'activité : connexions dans l'historique une fois chacune, dossiers et simulateur avec leur temps, projets présentés", async () => {
  Records.create('User', { email: 'loic.grange@exemple.fr', full_name: 'Loïc Grange', role: 'user' });
  const kfc = Records.create('Project', { titre: 'KFC Lyon', deal_id: 'd-kfc', client_email: 'loic.grange@exemple.fr' });
  Records.create('Project', { titre: 'Boulangerie Nîmes', client_emails: ['loic.grange@exemple.fr'], client_email: 'autre@exemple.fr' });
  const v = (page, url, le) => Records.create('VisitePage', { page, url, par: 'loic.grange@exemple.fr', role: 'user', le });
  v('Dashboard', 'https://app/Dashboard', '2026-11-25T09:00:00Z');
  v('ProjetDetail', `https://app/ProjetDetail?id=${kfc.id}`, '2026-11-25T09:01:00Z');
  v('SimulateurRentabilite', 'https://app/SimulateurRentabilite', '2026-11-25T09:09:00Z');
  v('Dashboard', 'https://app/Dashboard', '2026-11-25T09:12:00Z');
  const f = M.fiche('twenty:clients:t-loic', { genre: 'client', nom: 'Loïc Grange' });
  const deJules = Records.create('EntreeDossier', { fiche_cle: f.cle, genre: 'ressenti', texte: 'Pressé, veut signer avant Noël.', le: '2026-11-20T10:00:00Z' });

  const a = await A.activiteDuClient(Records.get('FicheDossier', f.id), { maintenant });
  assert.equal(a.compte, 'loic.grange@exemple.fr');
  assert.equal(a.lie_par, 'nom');
  assert.equal(a.statut, 'actif');
  assert.match(a.phrase, /^Actif : Dernière connexion il y a 2 jours ; 1 connexion en 30 jours/);
  assert.deepEqual(a.regardes.map((x) => [x.nom, x.temps]), [['KFC Lyon', '8 min'], ['le simulateur', '3 min']]);
  const lignes = Records.filter('EntreeDossier', { fiche_cle: f.cle }).filter((e) => e.session_cle);
  assert.equal(lignes.length, 1);
  assert.match(lignes[0].texte, /^Connecté \d+ min sur la plateforme : le dossier « KFC Lyon » \(8 min\), le simulateur \(3 min\)$/);
  await A.activiteDuClient(Records.get('FicheDossier', f.id), { maintenant });
  assert.equal(Records.filter('EntreeDossier', { fiche_cle: f.cle }).filter((e) => e.session_cle).length, 1, 'relue, la fiche ne double rien');
  assert.equal(Records.get('EntreeDossier', deJules.id).texte, 'Pressé, veut signer avant Noël.');

  assert.deepEqual(a.presentes.map((p) => [p.nom, p.ouvert]), [['KFC Lyon', true], ['Boulangerie Nîmes', false]]);
  const p = A.presenteA('deal:d-kfc');
  assert.equal(p.length, 1);
  assert.equal(p[0].nom, 'Loïc Grange');
  assert.equal(p[0].fiche, f.cle);
  assert.equal(p[0].temps, '8 min');
});

test("les transactions : par la fiche de Twenty ou par le nom, en cours d'abord, jalons datés écrits une fois", async () => {
  assert.equal(T.memeNom('Loïc GRANGE', 'Grange Loïc'), true);
  assert.equal(T.memeNom('Loïc', 'Loïc Grange'), false);
  const o = { singulier: 'transactions2026', genre: 'vente' };
  const lignes = [
    T.transactionLisible({ id: 'x1', name: 'GRANGE - LYON - 26', clientsFicheId: 't-loic', proprietes: '12 rue de la République, Lyon', prixNegocie: 1900000, statut: 'COMPROMIS', dateLoiAcceptee: '2026-10-02', dateCompromis: '2026-11-10' }, o),
    T.transactionLisible({ id: 'x2', name: 'GRANGE - NIMES - 25', clients: 'Loïc GRANGE', prixNegocie: 300000, statut: 'AVORTEE', groupe: 'TRANSACTION_AVORTEE_2026' }, o),
    T.transactionLisible({ id: 'x3', name: 'AUTRE', clientsFicheId: 't-autre', statut: 'LOI_EN_COURS' }, o),
  ];
  const f = M.fiche('twenty:clients:t-loic', { genre: 'client', nom: 'Loïc Grange' });
  const r = await T.transactionsDuClient(Records.get('FicheDossier', f.id), { lignes });
  assert.deepEqual(r.lignes.map((t) => [t.id, t.statut, t.en_cours]), [['x1', 'Compromis', true], ['x2', 'Avortée', false]]);
  assert.equal(r.lignes[0].prix, '1,9 M€');
  const jalons = Records.filter('EntreeDossier', { fiche_cle: f.cle }).filter((e) => e.jalon_cle).sort((a, b) => a.le.localeCompare(b.le));
  assert.deepEqual(jalons.map((e) => e.texte), ['LOI acceptée : 12 rue de la République, Lyon, 1,9 M€', 'Compromis signé : 12 rue de la République, Lyon, 1,9 M€']);
  await T.transactionsDuClient(Records.get('FicheDossier', f.id), { lignes });
  assert.equal(Records.filter('EntreeDossier', { fiche_cle: f.cle }).filter((e) => e.jalon_cle).length, 2);
});
