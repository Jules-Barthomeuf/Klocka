// Les newsletters (9 oct. 2026) : dates de calendrier, mails prêts qui partent
// à leur heure par le moteur des campagnes, alerte trois jours avant, sortie au
// call pris, simulateur personnel, webhook Calendly, entonnoir.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-newsletters-'));
delete process.env.RENDER;
delete process.env.EMAILING_REEL;
const N = await import('./newsletters.js');
const C = await import('./campagnes.js');
const { Records } = await import('../db.js');
const { E, listeDuNom } = await import('./schema.js');

const liste = listeDuNom('Webinaire 12 oct.');
const contact = (email, extra = {}) => Records.create(E.CONTACT, { email, prenom: email.split('@')[0], listes: [liste.id], tags: [], champs: {}, statut: 'abonne', jeton: crypto.randomBytes(8).toString('hex'), ...extra });
const marc = contact('marc@test.invalid');
const sophie = contact('sophie@test.invalid');
contact('parti@test.invalid', { statut: 'desinscrit' });
const design = { theme: 'clair', blocs: [{ id: 't', type: 'texte', texte: 'Bonjour {{prenom}}, voici le simulateur : {{lien_simulateur}}' }] };

test('les dates : départ + rang × rythme, à l\'heure de Paris ; une date fixée ne touche que son mail', () => {
  const n = { depart: '2026-10-13', rythme_jours: 14, heure: '08:30', mails: [{}, { date: '2026-10-29' }, {}] };
  assert.equal(N.dateDuMail(n, 0), '2026-10-13');
  assert.equal(N.dateDuMail(n, 1), '2026-10-29');
  assert.equal(N.dateDuMail(n, 2), '2026-11-10', 'le suivant garde son rythme');
  assert.equal(N.instantDuMail(n, 0).toISOString(), '2026-10-13T06:30:00.000Z', '8 h 30 à Paris, heure d\'été');
  assert.equal(N.instantDuMail(n, 2).toISOString(), '2026-11-10T07:30:00.000Z', 'heure d\'hiver');
  assert.equal(N.prochainMardi(new Date('2026-10-13T10:00:00Z')), '2026-10-20', 'un mardi donne le suivant');
});

test('un mail ne passe en Prêt qu\'avec un objet et un contenu ; un mail envoyé ne revient pas', () => {
  const n = N.creerNewsletter({ nom: 'Essai', listes: [liste.id] }, { email: 'jules.b@klocka.immo' });
  const m = n.mails[0];
  assert.equal(N.statutDuMail(n.id, m.id, 'pret').ok, false, 'sans objet');
  N.modifierNewsletter(n.id, { mails: [{ id: m.id, objet: 'Le point du mois', design }] });
  assert.equal(N.statutDuMail(n.id, m.id, 'pret').ok, true);
  Records.delete(N.NEWSLETTER, n.id);
});

test('à son heure, un mail prêt devient une campagne cachée, sans les désinscrits ni les calls pris', async () => {
  const n = N.creerNewsletter({ nom: 'Webinaire', listes: [liste.id] }, { email: 'jules.b@klocka.immo' });
  const m = n.mails[0];
  N.modifierNewsletter(n.id, { depart: '2026-10-13', mails: [{ id: m.id, objet: 'Bonjour {{prenom}}', design }] });
  N.statutDuMail(n.id, m.id, 'pret');
  N.changerStatut(n.id, 'active');
  Records.update(E.CONTACT, sophie.id, { call_pris_le: '2026-10-10T10:00:00Z' });
  const alertes = [];
  const avant = await N.tourNewsletters({ quand: new Date('2026-10-13T06:00:00Z'), alerter: async (...x) => alertes.push(x) });
  assert.equal(avant.lances, 0, 'pas avant 8 h 30');
  const r = await N.tourNewsletters({ quand: new Date('2026-10-13T06:31:00Z'), alerter: async (...x) => alertes.push(x) });
  assert.equal(r.lances, 1);
  const camp = Records.list(E.CAMPAGNE).find((c) => c.origine?.newsletter_id === n.id);
  assert.ok(camp, 'la campagne existe');
  assert.equal(C.campagnes().some((c) => c.id === camp.id), false, 'cachée de la liste des campagnes');
  assert.equal(N.newsletter(n.id).mails[0].statut, 'envoye');
  await C.tourCampagnes({ quand: new Date('2026-10-13T06:32:00Z'), lot: async () => ({ ok: true, ids: [] }), unitaire: async () => ({ ok: true, id: 'x' }) });
  const envois = Records.list(E.ENVOI).filter((e) => e.campagne_id === camp.id);
  assert.deepEqual(envois.map((e) => e.email), ['marc@test.invalid'], 'ni le désinscrit ni le call pris');
  const rendu = C.rendrePour(camp, marc);
  assert.match(rendu.html, /SimulateurPublic\?k=[0-9a-f]+&amp;s=newsletter%3A/, 'le lien personnel du simulateur');
  assert.equal(rendu.objet, 'Bonjour marc');
  Records.update(E.CONTACT, sophie.id, { call_pris_le: null });
});

test('trois jours avant, un mail pas prêt ou absent donne une alerte, une seule fois ; un retard de plus de 48 h ne part pas seul', async () => {
  const n = N.creerNewsletter({ nom: 'Alerte', listes: [liste.id] }, { email: 'jules.b@klocka.immo' });
  N.modifierNewsletter(n.id, { depart: '2026-11-03' });
  N.changerStatut(n.id, 'active');
  const vues = [];
  const alerter = async (nl, x) => vues.push(x);
  await N.tourNewsletters({ quand: new Date('2026-10-30T09:00:00Z'), alerter });
  assert.equal(vues.length, 0, 'quatre jours avant : rien');
  await N.tourNewsletters({ quand: new Date('2026-10-31T09:00:00Z'), alerter });
  await N.tourNewsletters({ quand: new Date('2026-11-01T09:00:00Z'), alerter });
  assert.equal(vues.length, 1, 'une seule alerte');
  assert.equal(vues[0].absent, false);
  const m = N.newsletter(n.id).mails[0];
  N.modifierNewsletter(n.id, { mails: [{ id: m.id, objet: 'En retard', design }] });
  N.statutDuMail(n.id, m.id, 'pret');
  const r = await N.tourNewsletters({ quand: new Date('2026-11-06T09:00:00Z'), alerter });
  assert.equal(r.lances, 0, 'plus de 48 h après : il attend une nouvelle date');
  assert.equal(N.newsletter(n.id).mails[0].statut, 'pret', 'toujours prêt, pas parti');
});

test('le simulateur : une session par demi-heure, ses valeurs gardées ; le call pris sort le contact', async () => {
  assert.equal((await N.noterActivite({ k: 'inconnu', type: 'simulateur' })).ok, false);
  await N.noterActivite({ k: marc.jeton, type: 'simulateur', valeurs: { prixBienFAI: 300000, apport: 50000, pirate: 'x' }, source: 'newsletter:abc:m1', quand: new Date('2026-10-13T08:00:00Z') });
  await N.noterActivite({ k: marc.jeton, type: 'simulateur', valeurs: { prixBienFAI: 320000 }, quand: new Date('2026-10-13T08:10:00Z') });
  const a = N.activitesDe(marc.id).filter((x) => x.type === 'simulateur');
  assert.equal(a.length, 1, 'la même session');
  assert.equal(a[0].valeurs.prixBienFAI, 320000);
  assert.equal(a[0].changements, 1);
  assert.equal((await N.noterActivite({ k: marc.jeton, type: 'call_pris' })).ok, true);
  const c = Records.get(E.CONTACT, marc.id);
  assert.ok(c.call_pris_le);
  assert.ok(c.tags.includes('Call pris'));
  assert.equal(N.actif(c), false, 'il ne reçoit plus les newsletters');
  assert.equal((await N.noterActivite({ k: marc.jeton, type: 'call_pris' })).deja, true);
});

test('le webhook Calendly : signature vérifiée, le rendez-vous d\'un contact connu le marque', async () => {
  const cle = 'cle-de-test';
  const corps = JSON.stringify({ event: 'invitee.created', payload: { email: 'Sophie@test.invalid' } });
  const t = '1760000000';
  const v1 = crypto.createHmac('sha256', cle).update(`${t}.${corps}`).digest('hex');
  assert.equal(N.signatureCalendly({ entete: `t=${t},v1=${v1}`, corps, cle }), true);
  assert.equal(N.signatureCalendly({ entete: `t=${t},v1=${v1}`, corps: `${corps} `, cle }), false);
  assert.equal(N.signatureCalendly({ entete: `t=${t},v1=${v1}`, corps, cle: '' }), false, 'sans clé, refusé');
  await N.rendezVousCalendly(JSON.parse(corps));
  assert.ok(Records.get(E.CONTACT, sophie.id).call_pris_le);
  assert.equal((await N.rendezVousCalendly({ event: 'invitee.canceled', payload: {} })).ignore, 'type');
});

test('le score et la santé du domaine', () => {
  assert.equal(N.score({ ouverts: 2, cliques: 1, simulateur: 1, call: true }), 30);
  const s = N.sante({ quand: new Date('2026-10-14T00:00:00Z') });
  assert.deepEqual(s.alertes, [], 'sous 50 envois, pas d\'alerte');
});

test('les assets : le simulateur posé d\'office garde son lien personnel ; un asset se crée, se renomme, se supprime', async () => {
  const A = await import('./assets.js');
  const liste = A.assets();
  const sim = liste.find((a) => a.genre === 'simulateur');
  assert.ok(sim, 'le simulateur est là');
  assert.ok(sim.blocs.some((b) => b.lien === '{{lien_simulateur}}'));
  assert.equal(A.assets().filter((a) => a.genre === 'simulateur').length, 1, 'posé une seule fois');
  assert.equal(A.modifierAsset(sim.id, { blocs: [{ type: 'bouton', texte: 'x', lien: 'https://klocka.immo' }] }).ok, false, 'sans son lien personnel, refusé');
  const r = A.creerAsset({ nom: 'Replay', blocs: [{ type: 'texte', texte: 'Le replay' }, { type: 'inconnu' }] });
  assert.equal(r.asset.blocs.length, 1, 'les blocs inconnus tombent');
  assert.equal(A.modifierAsset(r.asset.id, { nom: 'Replay du 12 oct.' }).asset.nom, 'Replay du 12 oct.');
  assert.equal(A.supprimerAsset(r.asset.id).ok, true);
  A.supprimerAsset(sim.id);
  assert.equal(A.assets().some((a) => a.genre === 'simulateur'), false, 'supprimé, il ne revient pas');
});

test('AK rédige une newsletter : mails en brouillon, datés, listes par leur nom ; une réécriture garde les mails partis', async () => {
  const { executerOutil } = await import('../ak/agent.js');
  const user = { email: 'jules.b@klocka.immo', role: 'admin', full_name: 'Jules' };
  const mails = [1, 2, 3].map((i) => ({ objet: `Mail ${i}`, blocs: [{ type: 'texte', texte: `Bonjour {{prenom}}, idée ${i}` }, { type: 'bouton', texte: 'Ouvrir le simulateur', lien: '{{lien_simulateur}}' }] }));
  const r = await executerOutil({ name: 'rediger_newsletter', input: { nom: 'Lettre des murs', listes: ['Webinaire 12 oct.'], depart: '2026-10-20', mails } }, user, {});
  assert.equal(r.ok, true);
  const n = N.newsletter(r.newsletter_id);
  assert.equal(n.mails.length, 3);
  assert.ok(n.mails.every((m) => m.statut === 'brouillon'));
  assert.deepEqual(n.mails.map((m) => m.jour), ['2026-10-20', '2026-11-03', '2026-11-17']);
  assert.deepEqual(n.listes, [liste.id]);
  Records.update(N.NEWSLETTER, n.id, { mails: n.mails.map((m, i) => (i === 0 ? { ...m, statut: 'envoye' } : m)) });
  const r2 = await executerOutil({ name: 'rediger_newsletter', input: { newsletter_id: n.id, mails: mails.slice(0, 1).map((m) => ({ ...m, objet: 'Réécrit' })) } }, user, {});
  assert.equal(r2.ok, true);
  const n2 = N.newsletter(n.id);
  assert.deepEqual(n2.mails.map((m) => [m.objet, m.statut]), [['Mail 1', 'envoye'], ['Réécrit', 'brouillon']]);
});
