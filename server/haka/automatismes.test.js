// Haka : la vue Automatismes (spec du 17 oct. 2026, § 11) et ses critères d'acceptation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-auto-'));
process.env.HAKA_EXPORT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-auto-export-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@test.local';
process.env.HAKA_FILE = '1';
const { Records } = await import('../db.js');
const C = await import('./competences.js');
const A = await import('./automatismes.js');
const T = await import('./taches.js');
const D = await import('./declencheurs.js');
const { estSuperAdmin } = await import('../acces-pages.js');
const jules = { email: 'jules@test.local', role: 'admin' };
C.amorcer();

test('la pré-analyse apparaît dès sa publication, sans autre configuration ; une compétence de chat n\'y est pas', async () => {
  const v = await A.vue();
  const pre = v.automatismes.find((a) => a.cle === 'pre-analyse-fiche');
  assert.ok(pre);
  assert.equal(pre.quand, "Quand une fiche arrive dans une boîte d'analyste ; Quand une fiche est déposée dans l'application");
  assert.equal(pre.etat, 'actif');
  assert.ok(v.automatismes.some((a) => a.cle === 'mails-agents' && a.planifie && a.prochaine), 'les relances du matin sont planifiées');
  assert.ok(!v.automatismes.some((a) => a.cle === 'loi'));
  assert.ok(!v.automatismes.some((a) => a.cle === 'data-room'), 'la data room ne tourne pas encore seule');
  assert.equal(v.plafond.max, 50);
});

test('une exécution apparaît dans le détail avec son dossier', async () => {
  Records.create('Deal', { deal_id: 'd-hoche', nom: '5 rue Hoche', lots: [{ evaluation: { verdict: 'GO SOUS RÉSERVE' } }] });
  T.enregistrer('essai_auto', { competence: 'pre-analyse-fiche', etapes: [{ nom: 'a', async run() { return { dossier: 'd-hoche' }; } }] });
  const t = T.enfiler('essai_auto', {}, { lancer: false });
  await T.tourner();
  const d = A.detail('pre-analyse-fiche');
  const e = d.find((x) => x.dossier === 'd-hoche');
  assert.ok(e);
  assert.equal(e.resultat, 'À vérifier');
  assert.equal(e.evenement, '5 rue Hoche');
  assert.equal((await A.vue()).automatismes.find((a) => a.cle === 'pre-analyse-fiche').derniere.resultat, 'À vérifier');
  assert.ok(t.id);
});

test('pendant une pause, une fiche reçue est « ignorée (en pause) » ; « Traiter les ignorés » la lance après la reprise', async () => {
  assert.equal(A.pause('pre-analyse-fiche', jules).ok, true);
  assert.equal((await A.vue()).automatismes.find((a) => a.cle === 'pre-analyse-fiche').etat, 'en_pause');
  const mail = Records.create('MailRecu', { compte: 'nora@klocka.immo', de: 'Claire Martin <claire@agence.fr>', de_email: 'claire@agence.fr', objet: 'Fiche Hoche', date: new Date().toISOString(), pieces_jointes: [] });
  const r = D.surFicheRecue(mail, { lancer: false });
  assert.ok(r.ignore);
  assert.equal(Records.get('MailRecu', mail.id).haka_ignore, r.ignore);
  const ign = A.detail('pre-analyse-fiche').find((x) => x.statut === 'ignoree');
  assert.equal(ign.resultat, 'Ignoré (en pause)');
  assert.match(ign.evenement, /Fiche de Claire Martin/);
  assert.equal((await A.traiterIgnores('pre-analyse-fiche', jules)).statut, 400, 'reprendre d\'abord');
  assert.equal(A.reprendre('pre-analyse-fiche', jules).ignorees, 1);
  const tr = await A.traiterIgnores('pre-analyse-fiche', jules);
  assert.equal(tr.lancees, 1);
  const tache = T.tache(Records.get('MailRecu', mail.id).haka_tache_id);
  assert.equal(tache.type, 'fiche_recue');
  assert.equal(tache.charge.mail_id, mail.id);
  assert.ok(C.lire('pre-analyse-fiche').automatisme_journal.some((j) => j.action === 'pause'));
});

test('trois échecs d\'affilée : En erreur, et Jules prévenu dans la cloche ; une réussite le remet Actif', async () => {
  T.enregistrer('essai_panne', { competence: 'pre-analyse-fiche', etapes: [{ nom: 'b', async run() { throw new Error('fetch failed: equimmox'); } }] });
  const ids = [];
  for (let i = 0; i < 3; i += 1) {
    const t = T.enfiler('essai_panne', {}, { cle: `panne-${i}`, lancer: false });
    ids.push(t.id);
    for (let k = 0; k < 3; k += 1) { Records; await T.avancer(T.tache(t.id), { declencheur: 'file' }); }
  }
  assert.equal(T.tache(ids[0]).etat, 'echec');
  const v = await A.vue();
  assert.equal(v.automatismes.find((a) => a.cle === 'pre-analyse-fiche').etat, 'en_erreur');
  const al = await A.alertes();
  assert.ok(al.some((a) => a.cle === 'erreur:pre-analyse-fiche'));
  const e = A.detail('pre-analyse-fiche').find((x) => x.statut === 'echec');
  assert.equal(e.erreur.lisible, 'Equimmox ne répond pas');
  assert.match(e.erreur.technique, /fetch failed/);
  // Relancer : reprend au pas qui a échoué.
  T.enregistrer('essai_panne', { competence: 'pre-analyse-fiche', etapes: [{ nom: 'b', async run() { return {}; } }] });
  const rel = await A.relancer(e.id, jules);
  assert.equal(rel.ok, true);
  await T.tourner();
  assert.equal(T.tache(ids[2]).etat, 'faite');
  assert.equal((await A.vue()).automatismes.find((a) => a.cle === 'pre-analyse-fiche').etat, 'actif');
});

test('un pas vers l\'extérieur ne se relance pas ; « Lancer maintenant » lance le tour du matin', async () => {
  T.enregistrer('essai_ext', { competence: 'mails-agents', etapes: [{ nom: 'envoyer', externe: true, async run() { throw new Error('x'); } }] });
  const t = T.enfiler('essai_ext', {}, { lancer: false });
  const { default: db } = await import('../db.js');
  db.prepare("UPDATE haka_taches SET etat = 'echec' WHERE id = ?").run(t.id);
  db.prepare("UPDATE haka_etapes SET etat = 'echec' WHERE tache_id = ?").run(t.id);
  assert.match(T.relancer(t.id).error, /extérieur/);
  const l = await A.lancer('mails-agents', jules);
  assert.equal(l.ok, true);
  assert.equal(T.tache(l.tache_id).type, 'relances_matin');
  T.annuler(l.tache_id, 'test');
  assert.equal((await A.lancer('pre-analyse-fiche', jules)).statut, 400);
});

test('un analyste voit la vue mais n\'agit pas (les POST vérifient Jules)', () => {
  assert.equal(estSuperAdmin({ email: 'nora@klocka.immo', role: 'admin' }), false);
  assert.equal(estSuperAdmin(jules), true);
});

test('erreurLisible et prochaine : purs', () => {
  assert.equal(A.erreurLisible('Your credit balance is too low'), "Plus de crédits sur l'API Anthropic");
  assert.equal(A.erreurLisible('ETIMEDOUT'), 'Un service extérieur ne répond pas');
  assert.equal(A.prochaine(new Date('2026-10-17T10:00:00Z')), '2026-10-19T08:00:00+02:00', 'samedi : lundi 8 h');
  assert.equal(A.prochaine(new Date('2026-10-19T05:00:00Z'), null), '2026-10-19T08:00:00+02:00');
  assert.equal(A.prochaine(new Date('2026-10-19T09:00:00Z'), '2026-10-19'), '2026-10-20T08:00:00+02:00');
});
