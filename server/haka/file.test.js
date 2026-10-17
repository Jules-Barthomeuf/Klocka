// Haka : la file « À valider ». Les droits, le motif obligatoire, la version
// modifiée, la dédup, la notification, le Commun qu'on prend.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-file-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@test.local';
const { Records } = await import('../db.js');
const T = await import('./taches.js');
const F = await import('./file.js');

const jules = Records.create('User', { email: 'jules@test.local', role: 'admin', full_name: 'Jules' });
const nora = Records.create('User', { email: 'nora@test.local', role: 'admin', full_name: 'Nora' });
const paul = Records.create('User', { email: 'paul@test.local', role: 'admin', full_name: 'Paul' });
const client = Records.create('User', { email: 'client@test.local', role: 'user' });

const envois = [];
T.enregistrer('mail', {
  etapes: [
    { nom: 'preparer', run: async () => ({ attendre: 'validation' }) },
    { nom: 'envoyer', externe: true, run: async ({ charge, user }) => { if (charge.a === 'casse@x.fr') throw new Error('SMTP en panne'); envois.push({ ...charge, par: user.email }); return { envoye: true }; } },
  ],
});

async function proposition({ pour = 'nora@test.local', cle = null, a = 'agent@x.fr' } = {}) {
  const t = T.enfiler('mail', { a }, { lancer: false, pour });
  await T.tourner();
  return F.proposer({ type: 'demande_documents', titre: 'Demander les documents', charge: { a, objet: 'Docs', corps: 'Bonjour' }, pour, dossier: 'deal-1', tache_id: t.id, etape: 'envoyer', cle, competence: 'mail', version: '1' });
}

test('peutDecider : le responsable, Jules partout, le Commun à tout admin, jamais un client', async () => {
  const p = await proposition();
  assert.equal(F.peutDecider(nora, p), true);
  assert.equal(F.peutDecider(jules, p), true);
  assert.equal(F.peutDecider(paul, p), false);
  assert.equal(F.peutDecider(client, p), false);
  const c = await proposition({ pour: null });
  assert.equal(F.peutDecider(paul, c), true);
  assert.equal(F.peutDecider(client, c), false);
  // La notification est posée pour la personne, une seule fois.
  assert.equal(Records.list('Notification').filter((n) => n.cle === `haka:${p.id}`).length, 1);
  assert.equal(Records.list('Notification').find((n) => n.cle === `haka:${p.id}`).pour, 'nora@test.local');
});

test('lister et compter : moi, commun, tout', async () => {
  const n = F.compter(nora);
  assert.ok(n.moi >= 1);
  assert.equal(n.peut_tout, false);
  assert.equal(n.tout, null);
  const j = F.compter(jules);
  assert.equal(j.peut_tout, true);
  assert.equal(j.tout, F.lister(jules, 'tout').length);
  assert.equal(F.lister(paul, 'tout').length, 0, 'Tout est réservé à Jules');
  assert.ok(F.lister(paul, 'commun').length >= 1);
  assert.equal(F.pourDossier('deal-1').length >= 2, true);
});

test('valider : un autre admin est refusé ; Jules valide, le mail part depuis la charge, la tâche finit', async () => {
  const p = await proposition({ cle: 'dd:1' });
  const refus = await F.valider(p.id, paul);
  assert.equal(refus.ok, false); assert.equal(refus.statut, 403);
  const r = await F.valider(p.id, jules);
  assert.equal(r.ok, true);
  assert.equal(r.proposition.etat, 'validee');
  assert.equal(r.proposition.decidee_par, 'jules@test.local');
  assert.equal(envois.at(-1).par, 'jules@test.local');
  assert.equal(T.tache(p.tache_id).etat, 'faite');
  // Déjà décidée : on ne revalide pas.
  const encore = await F.valider(p.id, jules);
  assert.equal(encore.statut, 409);
});

test('modifier : la version retouchée part, l\'état dit « modifiée »', async () => {
  const p = await proposition();
  const r = await F.valider(p.id, nora, { charge: { a: 'autre@x.fr', objet: 'Docs retouchés', corps: 'Bonjour, …' } });
  assert.equal(r.ok, true);
  assert.equal(r.proposition.etat, 'modifiee');
  assert.equal(r.proposition.charge_finale.a, 'autre@x.fr');
  assert.equal(envois.at(-1).a, 'autre@x.fr');
});

test('rejeter : le motif est obligatoire ; la tâche s\'annule', async () => {
  const p = await proposition();
  const sans = await F.rejeter(p.id, nora, '   ');
  assert.equal(sans.ok, false); assert.equal(sans.statut, 400);
  const r = await F.rejeter(p.id, nora, 'Pas le bon agent');
  assert.equal(r.ok, true);
  assert.equal(r.proposition.etat, 'rejetee');
  assert.equal(r.proposition.motif_rejet, 'Pas le bon agent');
  assert.equal(T.tache(p.tache_id).etat, 'annulee');
});

test('une action qui échoue revient en attente, avec l\'erreur, rien n\'est perdu', async () => {
  const p = await proposition({ a: 'casse@x.fr' });
  const r = await F.valider(p.id, nora);
  assert.equal(r.ok, false); assert.equal(r.statut, 502);
  const apres = F.proposition(p.id);
  assert.equal(apres.etat, 'proposee');
  assert.match(apres.erreur, /SMTP/);
  assert.equal(T.tache(p.tache_id).etat, 'en_attente_validation');
});

test('dédup par clé ; prendre une proposition du Commun', async () => {
  const a = await proposition({ cle: 'unique:1' });
  const b = await proposition({ cle: 'unique:1' });
  assert.equal(a.id, b.id);
  const c = await proposition({ pour: null });
  const r = F.prendre(c.id, paul);
  assert.equal(r.ok, true);
  assert.equal(r.proposition.pour, 'paul@test.local');
  assert.equal(F.peutDecider(nora, r.proposition), false);
  assert.equal(F.prendre(c.id, client).statut, 403);
  const b2 = F.bilan({ jours: 1 });
  assert.ok(b2.propositions >= 6);
  assert.ok(b2.par_etat.rejetee >= 1);
});
