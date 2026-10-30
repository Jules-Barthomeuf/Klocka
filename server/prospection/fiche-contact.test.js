// La fiche d'un agent ou d'une agence, en un coup d'œil (16 oct. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fiche-contact-'));
process.env.MISTRAL_API_KEY = '';
const { Records } = await import('../db.js');
const F = await import('./fiche-contact.js');

const agence = Records.create('AgenceProspect', { nom: 'Agence Durand', ville: 'Antibes', agents: [{ email: 'marc@durand.fr' }] });
const paul = Records.create('AgentImmo', { prenom: 'Paul', nom_famille: 'Durand', agence: 'Agence Durand', ville: 'Antibes', emails: ['paul@durand.fr'], referent: 'nora@klocka.immo', cree_le: '2026-09-01T08:00:00Z', source: 'Equimmox',
  journal: [{ type: 'source', texte: 'Twenty CRM : Doit envoyer un dossier', le: '2026-09-02T08:00:00Z' }, { type: 'note', texte: 'Fiche modifiée : poste', le: '2026-09-03T08:00:00Z' }] });
const marc = Records.create('AgentImmo', { nom: 'Marc', emails: ['marc@durand.fr'], cree_le: '2026-09-05T08:00:00Z' });
const appel = (o) => Records.create('AppelAgent', { agent_id: paul.id, etat: 'valide', ...o });
appel({ le: '2026-09-10T09:00:00Z', par: 'nora@klocka.immo', issue: 'repondeur', duree_s: 20 });
appel({ le: '2026-09-11T09:00:00Z', par: 'nora@klocka.immo', issue: 'a_des_murs', duree_s: 300, resume: 'Il a deux murs à Antibes ; il en a marre qu\'on refuse ses fiches.' });
appel({ le: '2026-09-12T09:00:00Z', par: 'jules.b@klocka.immo', issue: 'interesse', duree_s: 240, essai: true });
appel({ le: '2026-09-13T09:00:00Z', par: 'jules.b@klocka.immo', issue: 'interesse', duree_s: 240, faux: 'démo' });
Records.create('AppelAgent', { agent_id: marc.id, agence_id: agence.id, etat: 'valide', le: '2026-09-14T09:00:00Z', par: 'jules.b@klocka.immo', issue: 'pas_de_murs', duree_s: 60 });
Records.create('EmailLog', { statut: 'envoye', to: 'Paul <paul@durand.fr>', expediteur: 'nora@klocka.immo', subject: 'Nos critères', body: 'Bonjour', sent_at: '2026-09-15T09:00:00Z' });
Records.create('EmailLog', { statut: 'erreur', to: 'paul@durand.fr', subject: 'raté', sent_at: '2026-09-15T10:00:00Z' });
Records.create('MailRecu', { de_email: 'paul@durand.fr', compte: 'nora@klocka.immo', objet: 'Encore un non ?', texte: 'Vous refusez tout.', date: '2026-09-20T09:00:00Z' });

const equipe = [{ email: 'nora@klocka.immo', nom: 'Nora' }, { email: 'jules.b@klocka.immo', nom: 'Jules' }];

test('les échanges : appels réels, mails partis et reçus, fiches, remarques Twenty CRM ; pas les essais ni « Fiche modifiée »', () => {
  const fiches = [{ deal_id: 'd1', agent_email: 'paul@durand.fr', titre: 'Murs Antibes', etape: 'non', le: '2026-09-18T09:00:00Z', boite: 'nora@klocka.immo' }, { deal_id: 'd2', agent_email: 'paul@durand.fr', titre: 'Murs Juan', etape: 'oui', le: '2026-09-25T09:00:00Z' }, { deal_id: 'd3', agent_email: 'autre@x.fr', titre: 'Autre', etape: 'non' }];
  const e = F.echangesDe([paul], { appels: Records.list('AppelAgent'), emails: Records.list('EmailLog'), recus: Records.list('MailRecu'), fiches });
  assert.deepEqual(e.map((x) => x.genre), ['fiche', 'mail_recu', 'fiche', 'mail_envoye', 'appel', 'appel', 'monday']);
  const c = F.chiffresDe(e);
  assert.deepEqual({ ...c, dernier: undefined }, { conversations: 1, appels: 2, minutes: 5, mails_envoyes: 1, mails_recus: 1, fiches: 2, oui: 1, non: 1, dernier: undefined });
  const p = F.parcoursDe([paul], e).map((x) => x.quoi);
  assert.deepEqual(p, ['Entré au carnet', 'Premier appel', 'Première conversation', 'Premier mail', 'Première fiche reçue', 'Premier Oui', 'Dernier échange']);
  // Un mail écrit avant l'entrée au carnet passe devant.
  const avant = F.parcoursDe([{ ...paul, cree_le: '2026-09-16T00:00:00Z' }], e).map((x) => x.quoi);
  assert.deepEqual(avant.slice(0, 4), ['Premier appel', 'Première conversation', 'Premier mail', 'Entré au carnet']);
  const eq = F.equipeDe(e, { referent: 'nora@klocka.immo', equipe });
  assert.equal(eq[0].nom, 'Nora');
  assert.equal(eq[0].referent, true);
  assert.equal(eq[0].appels, 2);
  assert.equal(eq[0].mails, 2);
});

test('les agents d\'une agence : par le nom, par l\'adresse trouvée sur son site, par l\'agence d\'un appel', () => {
  assert.deepEqual(F.agentsDeLAgence(agence).map((a) => a.id).sort(), [paul.id, marc.id].sort());
});

test('la fiche d\'un agent : son agence, ses collègues, son équipe', async () => {
  const f = await F.ficheAgent(paul.id);
  assert.equal(f.nom, 'Paul Durand');
  assert.equal(f.agence.id, agence.id);
  assert.deepEqual(f.collegues.map((c) => c.id), [marc.id]);
  assert.equal(f.chiffres.appels, 2);
  assert.equal(f.lecture, null);
});

test('la fiche d\'une agence : la somme de ses agents, qui de nos agents a le plus échangé', async () => {
  const f = await F.ficheAgence(agence.id);
  assert.equal(f.chiffres.appels, 3);
  assert.equal(f.collegues[0].id, paul.id);
  assert.ok(f.echanges.some((x) => x.avec === 'Marc'));
});

test('la lecture par l\'IA : gardée tant que rien de nouveau, refaite après un échange nouveau', async () => {
  let n = 0;
  const invoke = async (prompt) => { n += 1; assert.match(prompt, /Paul Durand/); return { themes: [{ theme: 'Il en a assez qu\'on refuse ses fiches', fois: 2, citation: 'Vous refusez tout.', quand: '2026-09-20' }, { theme: 'Déduit, sans citation', fois: 3 }], actions: [{ action: 'Lui redire nos critères', pourquoi: 'Deux refus et un mail agacé' }] }; };
  const t0 = new Date('2026-10-16T09:00:00Z');
  const r = await F.lire('agent', paul.id, { invoke, maintenant: t0 });
  assert.equal(r.themes[0].fois, 2);
  assert.equal(r.themes.length, 1);
  assert.equal(r.actions.length, 1);
  await F.lire('agent', paul.id, { invoke, maintenant: new Date('2026-10-16T12:00:00Z') });
  assert.equal(n, 1);
  Records.create('MailRecu', { de_email: 'paul@durand.fr', objet: 'Nouveau', texte: 'Re', date: '2026-10-16T13:00:00Z' });
  assert.equal((await F.ficheAgent(paul.id)).lecture.a_jour, false);
  await F.lire('agent', paul.id, { invoke, maintenant: new Date('2026-10-16T13:30:00Z') });
  assert.equal(n, 2);
  await F.lire('agent', paul.id, { invoke, maintenant: new Date('2026-10-16T13:31:00Z'), forcer: true });
  assert.equal(n, 3);
});
