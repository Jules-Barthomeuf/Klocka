// Le module Emailing de bout en bout : un fait fait entrer un contact, les conditions choisissent la branche, la
// prospection attend d'être validée, l'opposition l'emporte au dernier moment, les plafonds tiennent, les scores montent.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-module-'));
process.env.RESEND_API_KEY = 'test';
process.env.APP_URL = 'https://klocka.test';
process.env.EMAILING_REEL = 'true';
process.env.EMAILING_TEST_TO = '';

const { Records } = await import('../db.js');
const J = await import('./journal.js');
const A = await import('./automatisations.js');
const M = await import('./moteur.js');
const S = await import('./scores.js');
const C = await import('./capture.js');
const R = await import('./reponses.js');
const { poserPlafond } = await import('./expediteurs.js');

// Un mardi à 10 h à Paris.
const MARDI = new Date('2026-11-10T09:00:00Z');
const plus = (d, min) => new Date(d.getTime() + min * 60000);
const resend = () => { const m = []; const f = async (x) => { m.push(x); return { ok: true, id: `r${m.length}` }; }; f.partis = m; return f; };
const gmail = () => { const m = []; const f = async (x) => { m.push(x); return { success: true, messageId: `g${m.length}`, threadId: 'fil1' }; }; f.partis = m; return f; };
const actif = (x) => { const { automatisation: a } = A.creer(x); assert.equal(A.changerStatut(a.id, 'active').ok, true); return a; };
let n = 0;
const contact = (extra = {}) => J.contactPour(`c${n += 1}@exemple.fr`, { prenom: 'Alex', ...extra });

test('les heures d\'envoi : hors fenêtre on attend, un délai saute le week-end', () => {
  const samedi = new Date('2026-11-14T09:00:00Z');
  assert.equal(M.prochaineOuverture(samedi).toISOString(), '2026-11-16T08:00:00.000Z');
  assert.equal(M.dansLaFenetre(MARDI), true);
  const vendredi = new Date('2026-11-13T09:00:00Z');
  assert.equal(M.ajouterJours(vendredi, 1).toISOString().slice(0, 10), '2026-11-16');
});

test('un texte devient des blocs, une ligne [[…|…]] un bouton', () => {
  const d = M.designDepuisTexte('Bonjour.\n\n[[Ouvrir|https://x.fr]]');
  assert.deepEqual(d.blocs.map((b) => b.type), ['texte', 'bouton', 'signature']);
});

test('diffusion : le fait fait entrer, le mail part seul, la clé empêche un second envoi', async () => {
  const a = actif({ nom: 'LM', nature: 'diffusion', declencheurs: [{ evenement: 'lead_magnet_pris', filtre: { formulaire: 'x' } }], etapes: [{ type: 'mail', objet: 'Bonjour {{prenom}}', texte: 'Texte', immediat: true }] });
  const c = contact();
  J.emettre('lead_magnet_pris', { email: c.email, contact_id: c.id, charge: { formulaire: 'autre' } });
  J.emettre('lead_magnet_pris', { email: c.email, contact_id: c.id, charge: { formulaire: 'x' } });
  M.traiterEvenements({ quand: MARDI });
  await M.avancerParcours({ quand: MARDI });
  const e = resend();
  assert.equal(await M.tourFile({ quand: MARDI, envoyerParResend: e, envoyerParGmail: gmail() }), 1);
  assert.equal(e.partis[0].objet, 'Bonjour Alex');
  assert.match(e.partis[0].entetes['List-Unsubscribe'], /desinscription/);
  assert.equal(await M.tourFile({ quand: plus(MARDI, 1), envoyerParResend: e, envoyerParGmail: gmail() }), 0);
  assert.equal(J.parcoursDe(c.id)[0].statut, 'terminee');
  A.changerStatut(a.id, 'pause');
});

test('condition : la branche suit ce que le contact a fait depuis son entrée', async () => {
  const a = actif({ nom: 'Branche', declencheurs: [{ evenement: 'webinaire_present' }], etapes: [
    { id: 'c', type: 'condition', regle: { genre: 'evenement', evenement: 'simulateur' }, oui: [{ id: 'o', type: 'mail', objet: 'Oui', texte: 't', immediat: true }], non: [{ id: 'n', type: 'mail', objet: 'Non', texte: 't', immediat: true }] },
  ] });
  const c1 = contact();
  const c2 = contact();
  J.emettre('webinaire_present', { email: c1.email, contact_id: c1.id });
  J.emettre('webinaire_present', { email: c2.email, contact_id: c2.id });
  M.traiterEvenements({ quand: MARDI });
  J.emettre('simulateur', { email: c1.email, contact_id: c1.id, le: plus(new Date(), 1).toISOString() });
  await M.avancerParcours({ quand: MARDI });
  const e = resend();
  await M.tourFile({ quand: MARDI, envoyerParResend: e, envoyerParGmail: gmail() });
  assert.deepEqual(e.partis.map((x) => x.objet).sort(), ['Non', 'Oui']);
  assert.equal(e.partis.find((x) => x.objet === 'Oui').a, c1.email);
  M.traiterEvenements({ quand: MARDI });
  A.changerStatut(a.id, 'pause');
});

const sequence = () => actif({ nom: 'Agents', nature: 'prospection', expediteur: 'jules@klocka.immo', declencheurs: [{ evenement: 'appel_abouti', filtre: { issue: 'pas_de_murs' } }], sorties: A.SORTIES_PROSPECTION, etapes: [
  { id: 'p1', type: 'mail', objet: 'Suite', texte: '{{salutation}} Relance.' }, { id: 'p2', type: 'attendre', jours: 3 }, { id: 'p3', type: 'mail', objet: '', meme_fil: true, texte: 'Encore.' },
] });

test('prospection : rien ne part sans validation, le second mail reprend le fil', async () => {
  const a = sequence();
  const c = contact();
  J.emettre('appel_abouti', { email: c.email, contact_id: c.id, charge: { issue: 'pas_de_murs', par: 'nora@klocka.immo' } });
  M.traiterEvenements({ quand: MARDI });
  await M.avancerParcours({ quand: MARDI });
  const g = gmail();
  assert.equal(await M.tourFile({ quand: MARDI, envoyerParResend: resend(), envoyerParGmail: g }), 0);
  const [l] = J.aValider().filter((x) => x.email === c.email);
  assert.equal(l.boite, 'nora@klocka.immo', 'la boîte de celui qui a appelé');
  assert.match(l.texte, /^Bonjour Alex, Relance\.[\s\S]*desinscription/);
  M.valider([l.id], { email: 'jules@klocka.immo' });
  await M.tourFile({ quand: MARDI, envoyerParResend: resend(), envoyerParGmail: g });
  assert.equal(g.partis.length, 1);
  await M.avancerParcours({ quand: MARDI });
  const apres = plus(MARDI, 60 * 24 * 3 + 5);
  await M.avancerParcours({ quand: apres });
  const [l2] = J.aValider().filter((x) => x.email === c.email);
  assert.equal(l2.objet, 'Re: Suite');
  M.valider([l2.id], { email: 'jules@klocka.immo' });
  await M.tourFile({ quand: apres, envoyerParResend: resend(), envoyerParGmail: g });
  assert.equal(g.partis[1].threadId, 'fil1');
  A.changerStatut(a.id, 'pause');
});

test('une réponse ou une fiche fait sortir, et annule ce qui attendait', async () => {
  const a = sequence();
  const c = contact();
  J.emettre('appel_abouti', { email: c.email, contact_id: c.id, charge: { issue: 'pas_de_murs', par: 'nora@klocka.immo' } });
  M.traiterEvenements({ quand: MARDI });
  await M.avancerParcours({ quand: MARDI });
  assert.equal(J.aValider().filter((x) => x.email === c.email).length, 1);
  J.emettre('fiche_recue', { email: c.email, contact_id: c.id });
  M.traiterEvenements({ quand: MARDI });
  assert.equal(J.aValider().filter((x) => x.email === c.email).length, 0);
  assert.equal(J.parcoursDe(c.id)[0].raison, 'fiche_recue');
  A.changerStatut(a.id, 'pause');
});

test('une opposition arrivée après la validation l\'emporte', async () => {
  const a = sequence();
  const c = contact();
  J.emettre('appel_abouti', { email: c.email, contact_id: c.id, charge: { issue: 'pas_de_murs', par: 'nora@klocka.immo' } });
  M.traiterEvenements({ quand: MARDI });
  await M.avancerParcours({ quand: MARDI });
  const [l] = J.aValider().filter((x) => x.email === c.email);
  M.valider([l.id], { email: 'x@y.fr' });
  J.poserOpposition(c.email, { motif: 'desinscription' });
  const g = gmail();
  await M.tourFile({ quand: MARDI, envoyerParResend: resend(), envoyerParGmail: g });
  assert.equal(g.partis.length, 0);
  assert.equal(Records.get('EmailingContact', c.id).statut, 'desinscrit');
  assert.equal(J.peutEcrire(c.email, { nature: 'individuel' }).ok, true, 'un humain peut encore lui répondre');
  J.poserOpposition(c.email, { motif: 'plainte' });
  assert.equal(J.peutEcrire(c.email, { nature: 'individuel' }).ok, false);
  J.poserOpposition(c.email, { motif: 'desinscription' });
  assert.equal(J.opposition(c.email).motif, 'plainte', 'une plainte n\'est jamais affaiblie');
  A.changerStatut(a.id, 'pause');
});

test('une boîte : un mail par tour, son plafond sur 24 h, et rien la nuit', async () => {
  const a = sequence();
  poserPlafond('nora@klocka.immo', 2);
  const c = [contact(), contact(), contact()];
  for (const x of c) J.emettre('appel_abouti', { email: x.email, contact_id: x.id, charge: { issue: 'pas_de_murs', par: 'nora@klocka.immo' } });
  M.traiterEvenements({ quand: MARDI });
  await M.avancerParcours({ quand: MARDI });
  M.valider(J.aValider().map((x) => x.id), { email: 'x@y.fr' });
  const g = gmail();
  const envoyer = (q) => M.tourFile({ quand: q, envoyerParResend: resend(), envoyerParGmail: g });
  const nuit = new Date('2026-11-10T22:00:00Z');
  assert.equal(await envoyer(nuit), 0);
  // Le plafond compte aussi ce que les tests d'avant ont envoyé depuis cette boîte : on regarde le tour d'après.
  const un = await envoyer(plus(nuit, 60 * 11));
  assert.ok(un <= 1, 'un seul mail par boîte et par tour');
  poserPlafond('nora@klocka.immo', 40);
  A.changerStatut(a.id, 'pause');
});

test('scores : le MQL monte avec l\'intérêt, le SQL avec le passage à l\'acte, et les points vieillissent', () => {
  const c = contact();
  const q = Date.parse('2026-11-10T09:00:00Z');
  const ev = (type, jours = 0) => ({ type, le: new Date(q - jours * 86400000).toISOString() });
  const b = S.BAREME_DEFAUT;
  assert.equal(S.calculer([ev('ouvert')], c, b, q).stade, 'lead');
  const mql = S.calculer([ev('lead_magnet_pris'), ev('webinaire_present'), ev('clique')], c, b, q);
  assert.equal(mql.stade, 'mql');
  assert.ok(mql.raisons_mql.length >= 2);
  assert.equal(S.calculer([ev('call_pris')], c, b, q).stade, 'sql');
  const vieux = S.calculer([ev('lead_magnet_pris', 90)], c, b, q);
  assert.equal(vieux.mql, 5, 'deux demi-vies : le quart');
  assert.equal(S.calculer([ev('ouvert'), ev('ouvert'), ev('ouvert'), ...Array(40).fill(ev('ouvert'))], c, b, q).mql, 8, 'le plafond d\'une règle');
  assert.equal(S.calculer([ev('call_pris'), ev('desinteret')], c, b, q).sql, 20);
  assert.equal(S.calculer([], { champs: { budget: '500 k€' } }, b, q).sql, 15, 'le profil compte');
});

test('un passage SQL lance un fait, une seule fois par mois', () => {
  const c = contact();
  J.emettre('call_pris', { email: c.email, contact_id: c.id });
  const maj = S.recalculer(c.id);
  assert.equal(maj.stade, 'sql');
  assert.equal(J.evenementsDe(c.email).filter((e) => e.type === 'devenu_sql').length, 1);
  Records.update('EmailingContact', c.id, { stade: 'lead', score_sql: 0 });
  S.recalculer(c.id);
  assert.equal(J.evenementsDe(c.email).filter((e) => e.type === 'devenu_sql').length, 1);
});

test('formulaire : sans case cochée rien, avec elle le consentement est gardé et le lead magnet a son jeton', () => {
  const { formulaire: f } = C.creerFormulaire({ nom: 'Mon guide', page: '/Guide' });
  assert.equal(C.soumettre(f.slug, { email: 'lead@exemple.fr' }).ok, false);
  assert.equal(C.soumettre(f.slug, { email: 'pasbon', consentement: true }).ok, false);
  const robot = C.soumettre(f.slug, { email: 'robot@exemple.fr', consentement: true, site: 'x' });
  assert.equal(robot.ok, true);
  assert.equal(J.contactParEmail('robot@exemple.fr'), null);
  const r = C.soumettre(f.slug, { email: 'lead@exemple.fr', prenom: 'Sam', consentement: true });
  const c = J.contactParEmail('lead@exemple.fr');
  assert.equal(r.redirection, `/Guide?k=${c.jeton}`);
  assert.equal(c.base_legale, 'consentement');
  assert.equal(c.consentement.texte, f.consentement);
  assert.equal(J.evenementsDe(c.email)[0].type, 'lead_magnet_pris');
  J.poserOpposition('plainte@exemple.fr', { motif: 'plainte' });
  C.soumettre(f.slug, { email: 'plainte@exemple.fr', consentement: true });
  assert.ok(J.opposition('plainte@exemple.fr'), 'un formulaire ne lève jamais une plainte');
});

test('webinaire : les présents et les absents se séparent', () => {
  const { webinaire: w } = C.creerWebinaire({ nom: 'Murs décembre', date: '2026-12-01T18:00:00Z', lien: 'https://z.fr' });
  assert.equal(C.importerInscrits(w.id, 'a@exemple.fr, b@exemple.fr\nc@exemple.fr').importes, 3);
  const r = C.noterPresence(w.id, 'a@exemple.fr');
  assert.deepEqual([r.presents, r.absents], [1, 2]);
  assert.equal(J.evenementsDe('b@exemple.fr').some((e) => e.type === 'webinaire_absent'), true);
});

test('réponses : lues sans IA, et « ne plus écrire » reste une décision humaine', () => {
  assert.equal(R.lireReponse({ texte: 'Merci de me retirer de votre liste, je ne veux plus recevoir' }), 'ne_plus_ecrire');
  assert.equal(R.lireReponse({ objet: 'Réponse automatique', texte: 'Je suis absent jusqu\'au 12' }), 'absence');
  assert.equal(R.lireReponse({ texte: 'Je vous envoie la fiche du local ci-joint' }), 'a_un_bien');
  assert.equal(R.lireReponse({ texte: 'Vous pouvez m\'appeler demain ?' }), 'veut_call');
});

test('une fiche CRM : l\'adresse de la fiche, jamais celle du mandataire', () => {
  assert.deepEqual(C.contactDeFiche({ id: '1', mandataireEmail: { primaryEmail: 'm@k.fr' }, emails: { primaryEmail: 'Client@Ex.fr' }, name: { firstName: 'A', lastName: 'B' } }), { email: 'client@ex.fr', nom: 'A B', twenty_id: '1' });
});

test('activer exige un mail, un déclencheur, et l\'arrêt à la réponse en prospection', () => {
  const { automatisation: a } = A.creer({ nature: 'prospection', sorties: [] });
  const r = A.changerStatut(a.id, 'active');
  assert.equal(r.ok, false);
  assert.match(r.error, /déclencheur/);
  assert.match(r.error, /réponse/);
});
