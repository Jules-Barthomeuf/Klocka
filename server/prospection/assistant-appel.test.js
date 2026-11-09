// L'assistant d'après l'appel : ce que le modèle propose ne passe que si l'appel le permet.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-assistant-appel-'));
const A = await import('./assistant-appel.js');

const JOUR = '2026-11-09';
const appel = {
  transcription_gardee: 'Mon mail c\'est sophie point martin arobase agence.fr et mon portable 06 11 22 33 44.',
  propositions: [
    { id: 'monday', type: 'monday', titre: 'Contact' },
    { id: 'mail', type: 'mail', titre: 'Email', a: '', objet: 'O', corps: 'C', variantes: [{ slug: 'demande-fiche', objet: 'Dossier', corps: 'Fiche' }] },
    { id: 'diffusion', type: 'diffusion', titre: 'Liste' },
    { id: 'relance', type: 'relance', titre: 'Relance', prochaine: { le: '2026-11-12' } },
    { id: 'fiche', type: 'fiche', titre: 'Fiche', toujours: true, cache: true },
  ],
};
const lu = (brut, message = 'x', etat = {}) => A.nettoyerDecision(brut, { appel, etat, message, jour: JOUR });

test('seules les actions réglables de cet appel changent', () => {
  const d = lu({ reponse: 'ok', decocher: ['diffusion', 'fiche', 'inconnue', 'monday'], cocher: ['relance'] });
  assert.deepEqual(d.decocher, ['diffusion']);
  assert.deepEqual(d.cocher, ['relance']);
});

test('une date passée ou mal écrite ne se pose pas, et il le dit', () => {
  const d = lu({ reponse: 'ok', relance_le: '2026-11-01' });
  assert.equal(d.relance_le, undefined);
  assert.match(d.reponse, /jour à venir/);
  const e = lu({ reponse: 'ok', relance_le: '2026-11-16' });
  assert.equal(e.relance_le, '2026-11-16');
  assert.deepEqual(e.cocher, ['relance']);
});

test('une adresse que personne n\'a dite est refusée ; une adresse dictée passe et rejoint le mail', () => {
  const d = lu({ reponse: 'ok', email: 'invente@nulle-part.fr' });
  assert.equal(d.email, undefined);
  assert.match(d.reponse, /dictez/);
  const e = lu({ reponse: 'ok', email: 'sophie.martin@agence.fr' });
  assert.equal(e.email, 'sophie.martin@agence.fr');
  assert.equal(e.mail.a, 'sophie.martin@agence.fr');
});

test('lancer : la phrase doit le demander', () => {
  assert.equal(A.demandeDeLancer('vas-y'), true);
  assert.equal(A.demandeDeLancer("C'est bon, valide"), true);
  assert.equal(A.demandeDeLancer("n'envoie pas le mail"), false);
  assert.equal(A.demandeDeLancer('envoie pas'), false);
  assert.equal(A.demandeDeLancer('attends'), false);
  assert.equal(A.demandeDeLancer('quel est le loyer'), false);
  const etat = { coches: ['relance'], mail: { a: 'a@b.fr' } };
  assert.equal(lu({ reponse: 'ok', valider: true }, 'quel est le loyer', etat).valider, undefined);
  assert.equal(lu({ reponse: 'ok', valider: true }, 'vas-y', etat).valider, true);
});

test('un mail réécrit se relit avant de partir, même si on a dit de lancer', () => {
  const d = lu({ reponse: 'ok', valider: true, mail: { corps: 'Plus court' } }, 'raccourcis et envoie', { coches: ['mail'], mail: { a: 'a@b.fr' } });
  assert.equal(d.valider, undefined);
  assert.equal(d.mail.corps, 'Plus court');
  assert.match(d.reponse, /Relisez/);
});

test('sans adresse, un mail coché ne part pas', () => {
  const d = lu({ reponse: 'ok', valider: true }, 'vas-y', { coches: ['mail'], mail: { a: '' } });
  assert.equal(d.valider, undefined);
  assert.match(d.reponse, /adresse/);
});

test('une autre issue refait les actions et ne lance rien ; la même issue ne refait rien', () => {
  const d = lu({ reponse: 'ok', issue: 'pas_de_murs', valider: true }, 'ok', { issue: 'a_des_murs', coches: [] });
  assert.deepEqual(d.refaire, { issue: 'pas_de_murs', precision: null });
  assert.equal(d.valider, undefined);
  assert.equal(lu({ reponse: 'ok', issue: 'a_des_murs' }, 'x', { issue: 'a_des_murs' }).refaire, undefined);
  assert.equal(lu({ reponse: 'ok', issue: 'inventee' }).refaire, undefined);
});

test('une variante du mail se reprend par son slug', () => {
  const d = lu({ reponse: 'ok', modele_mail: 'demande-fiche' });
  assert.equal(d.mail.corps, 'Fiche');
  assert.equal(d.mail.modele, 'demande-fiche');
});

test('si rien ne part, la réponse ne l\'annonce pas ; une adresse reprise de l\'appel se vérifie', () => {
  const d = lu({ reponse: 'Le mail est raccourci. Je lance tout.', valider: true, mail: { corps: 'Court' } }, 'raccourcis et envoie', { coches: ['mail'], mail: { a: 'a@b.fr' } });
  assert.doesNotMatch(d.reponse, /lance/);
  assert.match(d.reponse, /raccourci/);
  const e = lu({ reponse: 'ok', valider: true, email: 'sophie.martin@agence.fr' }, 'vas-y', { coches: ['mail'], mail: { a: '' } });
  assert.equal(e.valider, undefined);
  assert.match(e.reponse, /vérifiez/);
});

test('Twenty se retire et se remet ; ce qui sort de l\'écran part à l\'autre assistant', async () => {
  assert.equal(lu({ reponse: 'ok', sans_twenty: true }).sans_twenty, true);
  assert.equal(lu({ reponse: 'ok', decocher: ['monday'] }).sans_twenty, true);
  assert.equal(lu({ reponse: 'ok', sans_twenty: false }).sans_twenty, false);
  assert.equal(lu({ reponse: 'ok' }).sans_twenty, undefined);
  const { Records } = await import('../db.js');
  const a = Records.create('AppelAgent', { ...appel, passe: 'Elle a un bien.' });
  let recu = null;
  const r = await A.repondreAssistant({ appel_id: a.id, message: 'Préviens Paul', etat: {}, user: { email: 'j@k.fr' }, lire: async () => ({ reponse: 'Je le transmets.', autre: 'Prévenir Paul du bien.' }), autre: async (x) => { recu = x; return { texte: 'Paul est prévenu.' }; } });
  assert.match(recu.texte, /Prévenir Paul/);
  assert.match(recu.texte, /Elle a un bien/);
  assert.equal(r.decision.reponse, 'Paul est prévenu.');
});

test('prévenir un collègue : seulement quelqu\'un de l\'équipe, sans ambiguïté', async () => {
  const { Records } = await import('../db.js');
  Records.create('User', { email: 'paul.d@klocka.immo', full_name: 'Paul Dupont', role: 'admin' });
  const a = Records.create('AppelAgent', { ...appel });
  const dit = (prenom) => A.repondreAssistant({ appel_id: a.id, message: 'Préviens-le', etat: {}, user: { email: 'j@k.fr' }, lire: async () => ({ reponse: 'Je le préviens.', prevenir: { prenom, message: 'Un bien à Antibes.' } }) });
  assert.equal((await dit('Paul')).decision.reponse, 'Je le préviens.');
  assert.equal(Records.list('Notification').filter((n) => n.pour === 'paul.d@klocka.immo').length, 1);
  assert.match((await dit('Gaston')).decision.reponse, /ne trouve pas Gaston/);
});
