// L'emailing v2 : une campagne de bout en bout (préparée, envoyée par lots,
// reprise après une limite de débit, jamais deux fois), le garde-fou local,
// le webhook de Resend (signature, bounce, plainte), l'import avec
// correspondance des colonnes, la sortie d'une séquence sur réponse. Resend
// est remplacé par des faux.

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// Ces tests rejouent une journée fixe (le 6 oct. 2026, tours à 10 h UTC et
// après) alors que le code date ce qu'il crée avec l'heure réelle : sans
// horloge figée au matin de ce jour, une campagne « programmée maintenant »
// tombait après le tour de 10 h dès l'après-midi, et rien ne partait.
mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-06T08:00:00Z') });
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-campagnes-'));
process.env.RESEND_API_KEY = '';
process.env.APP_URL = 'https://klocka.test';
process.env.EMAILING_REEL = 'true';
process.env.EMAILING_TEST_TO = '';
const { Records, Meta } = await import('../db.js');
const C = await import('./campagnes.js');
const K = await import('./contacts.js');
const W = await import('./webhook.js');
const M = await import('./index.js');
const S = await import('./stats.js');

const JULES = { email: 'jules.b@klocka.immo' };
const fauxLot = () => {
  const lots = [];
  let refus = 0;
  const lot = async (messages, { idempotence }) => {
    if (refus > 0) { refus -= 1; return { ok: false, error: 'Too many requests', reessayer: true }; }
    lots.push({ messages, idempotence });
    return { ok: true, ids: messages.map((_, i) => `re_${lots.length}_${i}`) };
  };
  return { lots, lot, refuser: (n) => { refus = n; } };
};

test('import avec correspondance : colonnes choisies, champ personnalisé, tags, mise à jour sans doublon', () => {
  K.creerChamp({ libelle: 'Budget' });
  const texte = 'Adresse mail;Prénom;Ville;Budget;Divers\nanne@exemple.fr;Anne;Lyon;300k;x\nbob@exemple.fr;Bob;Nice;;y\npasunmail;C;D;E;F';
  const a = K.analyserImport(texte);
  assert.deepEqual(a.correspondance, ['email', 'prenom', 'ville', 'champs.budget', 'ignorer']);
  const r = K.importer(texte, { correspondance: a.correspondance, liste: 'Webinaire oct.', tags: ['webinaire-oct'] });
  assert.deepEqual([r.nouveaux, r.invalides], [2, 1]);
  const anne = Records.list('EmailingContact').find((c) => c.email === 'anne@exemple.fr');
  assert.equal(anne.champs.budget, '300k');
  assert.deepEqual(anne.tags, ['webinaire-oct']);
  // Réimport : Anne est complétée, pas dupliquée.
  K.importer('email;entreprise\nanne@exemple.fr;SCI Anne', {});
  assert.equal(Records.list('EmailingContact').filter((c) => c.email === 'anne@exemple.fr').length, 1);
  assert.equal(Records.list('EmailingContact').find((c) => c.email === 'anne@exemple.fr').entreprise, 'SCI Anne');
});

test('une campagne : audience comptée, checklist, lots, reprise après 429, désinscrit sauté, jamais deux fois', async () => {
  for (let i = 0; i < 150; i += 1) K.creerContact({ email: `lead${i}@exemple.fr`, prenom: i % 2 ? `Lead${i}` : '', tags: ['newsletter'] });
  const c = C.creerCampagne({ nom: 'Octobre' }, JULES);
  C.modifierCampagne(c.id, { audience: { tags: ['newsletter'] }, objet: 'Bonjour {{prenom}}' });
  assert.equal(K.compterAudience({ tags: ['newsletter'] }).eligibles, 150);
  const v = C.verification(c.id);
  assert.equal(v.bloquant, false);
  assert.match(v.items.find((i) => i.cle === 'variables').texte, /\{\{prenom\}\} sans valeur de repli : 75 contacts/, 'la variable sans repli est signalée');
  assert.equal(v.items.find((i) => i.cle === 'test').ok, false);
  assert.equal(C.programmer(c.id).ok, true);
  const f = fauxLot();
  f.refuser(1);
  // Premier tour : préparation, puis un 429 : le lot attend.
  await C.tourCampagnes({ quand: new Date('2026-10-06T10:00:00Z'), lot: f.lot });
  assert.equal(Records.get('EmailingCampagne', c.id).statut, 'en_cours');
  assert.equal(Records.list('EmailingEnvoi').filter((e) => e.campagne_id === c.id && e.statut === 'en_attente').length, 150);
  // Un contact se désinscrit entre-temps.
  const lead3 = Records.list('EmailingContact').find((x) => x.email === 'lead3@exemple.fr');
  M.desinscrire(lead3.jeton, `campagne:${c.id}`);
  await C.tourCampagnes({ quand: new Date('2026-10-06T10:02:00Z'), lot: f.lot });
  assert.equal(f.lots.length, 2, 'deux lots de 100 au plus');
  assert.equal(f.lots.reduce((n, l) => n + l.messages.length, 0), 149, 'le désinscrit sauté');
  assert.ok(f.lots.every((l) => l.messages.length <= 100));
  assert.match(f.lots[0].messages[0].entetes['List-Unsubscribe'], /desinscription\/.+\?s=campagne/);
  assert.equal(Records.get('EmailingCampagne', c.id).statut, 'envoyee');
  // Un tour de plus ne renvoie rien.
  await C.tourCampagnes({ quand: new Date('2026-10-06T10:05:00Z'), lot: f.lot });
  assert.equal(f.lots.length, 2);
  // Rejouer la programmation est refusé ; la dupliquer donne un brouillon.
  assert.equal(C.programmer(c.id).ok, false);
  const d = C.dupliquer(c.id, JULES);
  assert.equal(d.campagne.statut, 'brouillon');
  assert.equal(C.campagne(c.id).desinscrits, 1);
});

test('garde-fou : hors Render, trois emails d\'une campagne chez son auteur, le reste noté', async () => {
  process.env.EMAILING_REEL = '';
  try {
    const c = C.creerCampagne({ nom: 'Locale' }, JULES);
    C.modifierCampagne(c.id, { audience: { tags: ['newsletter'] }, objet: 'Test local' });
    C.programmer(c.id);
    const partis = [];
    const unitaire = async (m) => { partis.push(m); return { ok: true, id: `re_u${partis.length}` }; };
    const f = fauxLot();
    process.env.RESEND_API_KEY = 'x';
    await C.tourCampagnes({ quand: new Date('2026-10-06T11:00:00Z'), lot: f.lot, unitaire });
    assert.equal(f.lots.length, 0, 'aucun lot vers les vrais contacts');
    assert.equal(partis.length, 3);
    assert.ok(partis.every((m) => m.a === 'jules.b@klocka.immo' && m.objet.startsWith('[Local · pour ')));
    assert.equal(Records.list('EmailingEnvoi').filter((e) => e.campagne_id === c.id && e.statut === 'simule').length, 146);
  } finally {
    process.env.EMAILING_REEL = 'true';
    process.env.RESEND_API_KEY = '';
  }
});

test('webhook : signature Svix vérifiée, ouverture et clic rangés, bounce et plainte rendent non envoyable', () => {
  const secret = `whsec_${Buffer.from('secret-de-test-1234567890').toString('base64')}`;
  const corps = JSON.stringify({ type: 'email.opened', data: { email_id: 're_1_0' } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', Buffer.from('secret-de-test-1234567890')).update(`msg_1.${ts}.${corps}`).digest('base64');
  assert.equal(W.signatureValable({ corps, id: 'msg_1', timestamp: ts, signature: `v1,${sig}`, secret }), true);
  assert.equal(W.signatureValable({ corps: `${corps} `, id: 'msg_1', timestamp: ts, signature: `v1,${sig}`, secret }), false, 'un octet de plus : refusé');
  assert.equal(W.signatureValable({ corps, id: 'msg_1', timestamp: String(Number(ts) - 3600), signature: `v1,${sig}`, secret }), false, 'trop vieux');

  const envoi = Records.list('EmailingEnvoi').find((e) => e.resend_id === 're_1_0');
  W.traiter({ type: 'email.opened', data: { email_id: 're_1_0', to: [envoi.email] } }, { svixId: 'msg_1' });
  W.traiter({ type: 'email.opened', data: { email_id: 're_1_0', to: [envoi.email] } }, { svixId: 'msg_1' });
  W.traiter({ type: 'email.clicked', data: { email_id: 're_1_0', to: [envoi.email], click: { link: 'https://klocka.immo' } } }, { svixId: 'msg_2' });
  const apres = Records.get('EmailingEnvoi', envoi.id);
  assert.equal(apres.ouvertures, 1, 'le même événement deux fois ne compte qu\'une fois');
  assert.ok(apres.clique_le);
  W.traiter({ type: 'email.bounced', data: { email_id: 're_1_1', to: ['lead1@exemple.fr'], bounce: { type: 'Permanent' } } }, { svixId: 'msg_3' });
  assert.equal(Records.list('EmailingContact').find((c) => c.email === 'lead1@exemple.fr').statut, 'bounce');
  W.traiter({ type: 'email.complained', data: { email_id: 're_1_2', to: ['lead2@exemple.fr'] } }, { svixId: 'msg_4' });
  assert.equal(Records.list('EmailingContact').find((c) => c.email === 'lead2@exemple.fr').statut, 'plainte');
  const st = S.globales({ quand: new Date('2026-10-07T00:00:00Z') });
  assert.equal(st.ouverts, 1);
  assert.equal(st.liens[0].lien, 'https://klocka.immo');
});

test('séquence : un contact qui répond en sort si la règle est cochée', async () => {
  const s = M.creerSequence({ nom: 'Réponse', declencheur: { type: 'tag', ref: 'newsletter' } }, JULES);
  M.modifierSequence(s.id, { sortie: { si_reponse: true } });
  M.changerStatut(s.id, 'active');
  const lead5 = Records.list('EmailingContact').find((c) => c.email === 'lead5@exemple.fr');
  const i = Records.list('EmailingInscription').find((x) => x.sequence_id === s.id && x.contact_id === lead5.id);
  assert.equal(i.statut, 'en_cours');
  Meta.set('emailing:reponses_le', '2026-01-01T00:00:00Z');
  Records.create('MailRecu', { de_email: 'LEAD5@exemple.fr', date: new Date(Date.now() + 1000).toISOString(), compte: 'jules.b@klocka.immo' });
  assert.equal(await M.reponsesRecues(), 1);
  assert.deepEqual([Records.get('EmailingInscription', i.id).statut, Records.get('EmailingInscription', i.id).raison], ['sortie', 'reponse']);
});
