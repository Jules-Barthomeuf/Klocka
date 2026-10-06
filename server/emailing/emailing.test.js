// L'emailing : des contacts collés, des variables remplies, une séquence qui
// part étape par étape et s'arrête à la désinscription, le mail
// d'invitation rendu depuis son modèle. Resend est remplacé par un faux.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-emailing-'));
process.env.RESEND_API_KEY = '';
process.env.APP_URL = 'https://klocka.test';
// Les tests d'envoi parlent du vrai chemin ; le garde-fou local a son propre test.
process.env.EMAILING_REEL = 'true';
process.env.EMAILING_TEST_TO = '';
const { Records } = await import('../db.js');
const E = await import('./index.js');
const D = await import('../../src/lib/email-design.js');
const S = await import('./schema.js');
const G = await import('./envoi.js');
const { Meta } = await import('../db.js');

const faux = () => {
  const partis = [];
  const envoyer = async (m) => { partis.push(m); return { ok: true, id: `re_${partis.length}` }; };
  return { partis, envoyer };
};

test('des contacts collés : avec ou sans en-tête, sans doublon ni adresse fausse', () => {
  const csv = E.lireContacts('Email;Prénom;Nom\nmarie@exemple.fr;Marie;Durand\nMARIE@exemple.fr;Marie;Durand\npas-une-adresse;X;Y');
  assert.deepEqual(csv, [{ email: 'marie@exemple.fr', prenom: 'Marie', nom: 'Durand' }]);
  const brut = E.lireContacts('Paul Martin <paul@exemple.fr>\nlea@exemple.fr');
  assert.deepEqual(brut.map((c) => [c.email, c.prenom, c.nom]), [['paul@exemple.fr', 'Paul', 'Martin'], ['lea@exemple.fr', '', '']]);
});

test('les variables : remplies, et une variable vide ne laisse pas d\'espace avant la virgule', () => {
  assert.equal(D.remplir('Bonjour {{prenom}},', { prenom: 'Marie' }), 'Bonjour Marie,');
  assert.equal(D.remplir('Bonjour {{prenom}},', {}), 'Bonjour,');
  const { html, texte } = D.rendreEmail({ theme: 'clair', blocs: [{ type: 'texte', texte: 'Un **mot** <b>' }, { type: 'bouton', texte: 'Go', lien: '{{lien}}' }] }, { lien: 'https://x.fr/a' }, { desinscription: 'https://x.fr/stop' });
  assert.match(html, /<strong>mot<\/strong> &lt;b&gt;/, 'gras permis, HTML échappé');
  assert.match(html, /href="https:\/\/x.fr\/a"/);
  assert.match(html, /Se désinscrire/);
  assert.match(texte, /Go : https:\/\/x.fr\/a/);
});

test('une séquence : J0 tout de suite, la suite au délai, rien après la désinscription', async () => {
  const r = E.importerContacts('marie@exemple.fr;Marie\npaul@exemple.fr;Paul', { liste: 'Webinaire 12 oct.' });
  assert.deepEqual([r.ok, r.nouveaux], [true, 2]);
  const s = E.creerSequence({ nom: 'Webinaire', liste: 'Webinaire 12 oct.' }, { email: 'jules.b@klocka.immo' });
  assert.equal(s.etapes.length, 3, 'la séquence proposée');
  assert.equal(E.changerStatut(s.id, 'active').inscrits, 2);
  const { partis, envoyer } = faux();
  const t0 = new Date('2026-10-06T10:00:00Z');
  assert.equal((await E.tourEmailing({ quand: t0, envoyer })).envoyes, 2);
  assert.match(partis[0].objet, /^Merci pour votre inscription, (Marie|Paul)$/);
  assert.equal(partis[0].repondreA, 'jules.b@klocka.immo');
  assert.match(partis[0].entetes['List-Unsubscribe'], /desinscription/);
  // Le lendemain, rien : le 2e email part trois jours après.
  assert.equal((await E.tourEmailing({ quand: new Date('2026-10-07T10:00:00Z'), envoyer })).envoyes, 0);
  // Paul se désinscrit par le lien de son mail.
  const paul = Records.list('EmailingContact').find((c) => c.email === 'paul@exemple.fr');
  assert.equal(E.desinscrire(paul.jeton).ok, true);
  assert.equal((await E.tourEmailing({ quand: new Date('2026-10-09T10:00:00Z'), envoyer })).envoyes, 1, 'Marie seule');
  assert.equal(partis.at(-1).a, 'marie@exemple.fr');
  await E.tourEmailing({ quand: new Date('2026-10-14T10:00:00Z'), envoyer });
  const suivi = E.sequence(s.id);
  assert.equal(suivi.terminees, 1);
  assert.equal(suivi.envoyes, 4);
});

test('l\'invitation d\'un client : le modèle retouché, ses variables remplies', async () => {
  E.modifierModele('invitation_client', { objet: 'Bienvenue {{prenom}}' }, { email: 'jules.b@klocka.immo' });
  const m = E.mailPlateforme('invitation_client', { prenom: 'Marie', lien: 'https://klocka.test/Bienvenue?jeton=abc', expediteur: 'Jules' });
  assert.equal(m.objet, 'Bienvenue Marie');
  assert.match(m.html, /Bienvenue\?jeton=abc/);
  assert.doesNotMatch(m.html, /désinscrire/, 'un mail de la plateforme n\'a pas de désinscription');
  const { partis, envoyer } = faux();
  const r = await E.envoyerPlateforme('invitation_client', { a: 'marie@exemple.fr', vars: { prenom: 'Marie', lien: 'x' }, repondreA: 'jules.b@klocka.immo' }, { envoyer });
  assert.equal(r.ok, true);
  assert.equal(partis[0].repondreA, 'jules.b@klocka.immo');
  E.retablirModele('invitation_client');
  assert.equal(E.mailPlateforme('invitation_client', {}).objet, 'Klocka · Créez votre profil');
});

// Un .xlsx minimal, fait à la main : une archive zip avec les chaînes partagées et une feuille.
function xlsx(lignes) {
  const chaines = [...new Set(lignes.flat())];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&apos;');
  const partagees = `<sst>${chaines.map((c) => `<si><t>${esc(c)}</t></si>`).join('')}</sst>`;
  const lettre = (i) => String.fromCharCode(65 + i);
  const feuille = `<worksheet><sheetData>${lignes.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => `<c r="${lettre(c)}${r + 1}" t="s"><v>${chaines.indexOf(v)}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const fichiers = [['xl/sharedStrings.xml', partagees], ['xl/worksheets/sheet1.xml', feuille]];
  const locaux = []; const central = []; let decalage = 0;
  for (const [nom, contenu] of fichiers) {
    const donnees = zlib.deflateRawSync(Buffer.from(contenu));
    const n = Buffer.from(nom);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(donnees.length, 18); l.writeUInt32LE(contenu.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(donnees.length, 20); c.writeUInt32LE(contenu.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(decalage, 42);
    locaux.push(l, n, donnees); central.push(c, n);
    decalage += 30 + n.length + donnees.length;
  }
  const taille = central.reduce((t, b) => t + b.length, 0);
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(fichiers.length, 8); fin.writeUInt16LE(fichiers.length, 10); fin.writeUInt32LE(taille, 12); fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, ...central, fin]);
}

test('05/10 · un fichier Excel d\'inscrits devient du CSV, puis des contacts', async () => {
  const buffer = xlsx([['Prénom', 'Nom', 'E-mail'], ['Léa', 'Martin; fils', 'lea@exemple.fr'], ['Hugo', 'Petit', 'hugo@exemple.fr']]);
  const { csv, lignes } = await E.excelEnCsv(buffer, 'inscrits.xlsx');
  assert.equal(lignes, 2);
  assert.equal(csv.split('\n')[0], 'Prénom;Nom;E-mail');
  assert.match(csv, /"Martin; fils"/, 'un point-virgule dans une cellule reste dans sa cellule');
  assert.deepEqual(E.lireContacts(csv).map((c) => [c.email, c.prenom, c.nom]), [['lea@exemple.fr', 'Léa', 'Martin; fils'], ['hugo@exemple.fr', 'Hugo', 'Petit']]);
  await assert.rejects(E.excelEnCsv(buffer, 'vieux.xls'), /\.xlsx/);
});

test('06/10 · migration v1 → v2 : listes, statuts, déclencheur, clés d\'envoi, template, sans perte et rejouable', () => {
  // Des données au format v1, comme le module d'avant les écrivait.
  const c = Records.create('EmailingContact', { email: 'v1@exemple.fr', prenom: 'Ancien', listes: ['Webinaire 5 oct.'], statut: 'actif', jeton: 'j-v1' });
  const d = Records.create('EmailingContact', { email: 'v1b@exemple.fr', listes: ['Webinaire 5 oct.'], statut: 'desinscrit', jeton: 'j-v1b' });
  const seq = Records.create('EmailingSequence', { nom: 'Ancienne', liste: 'Webinaire 5 oct.', statut: 'active', etapes: [{ id: 'x1', delai_jours: 0, objet: 'Bonjour', design: { theme: 'clair', blocs: [] } }] });
  const envoi = Records.create('EmailingEnvoi', { type: 'sequence', sequence_id: seq.id, etape_id: 'x1', contact_id: c.id, email: c.email, statut: 'envoye', le: '2026-10-05T08:00:00Z' });
  Records.create('EmailingModele', { cle: 'invitation_client', objet: 'Objet retouché', apercu: '', design: { theme: 'menthe', blocs: [] } });
  Meta.set('emailing:schema', '1');
  const b = S.migrer();
  assert.equal(b.deja, undefined);
  const l = Records.list('EmailingListe').find((x) => x.nom === 'Webinaire 5 oct.');
  assert.ok(l, 'la liste existe');
  assert.deepEqual(Records.get('EmailingContact', c.id).listes, [l.id]);
  assert.equal(Records.get('EmailingContact', c.id).statut, 'abonne');
  assert.equal(Records.get('EmailingContact', d.id).statut, 'desinscrit', 'un désinscrit le reste');
  assert.deepEqual(Records.get('EmailingSequence', seq.id).declencheur, { type: 'liste', ref: l.id });
  assert.equal(Records.get('EmailingSequence', seq.id).statut, 'active', 'une séquence active le reste');
  assert.equal(Records.get('EmailingEnvoi', envoi.id).cle_envoi, S.cleEnvoi.sequence(seq.id, 'x1', c.id));
  assert.equal(E.mailPlateforme('invitation_client', {}).objet, 'Objet retouché', 'le modèle retouché devient le template plateforme');
  assert.equal(E.sequence(seq.id).liste, 'Webinaire 5 oct.', 'l\'écran lit toujours le nom de la liste');
  // Rejouable : rien ne bouge au second passage.
  assert.deepEqual(S.migrer(), { deja: true });
  const avant = Records.list('EmailingListe').length;
  S.migrer({ forcer: true });
  assert.equal(Records.list('EmailingListe').length, avant, 'pas de liste en double');
  E.retablirModele('invitation_client');
});

test('06/10 · garde-fou : hors Render, rien ne part chez un vrai contact', async () => {
  const partis = [];
  const envoyer = async (m) => { partis.push(m); return { ok: true, id: 're_x' }; };
  process.env.EMAILING_REEL = '';
  try {
    const r = await G.expedier({ a: 'client@exemple.fr', objet: 'Bonjour' }, { testeur: 'jules.b@klocka.immo', envoyer });
    assert.equal(r.redirige, 'jules.b@klocka.immo');
    assert.equal(partis[0].a, 'jules.b@klocka.immo');
    assert.match(partis[0].objet, /^\[Local · pour client@exemple.fr\] Bonjour$/);
    const sans = await G.expedier({ a: 'client@exemple.fr', objet: 'Bonjour' }, { envoyer });
    assert.equal(sans.simule, true, 'sans adresse de test : noté, pas envoyé');
    assert.equal(partis.length, 1);
    assert.deepEqual(G.destinataireGarde('client@exemple.fr', 'jules.b@klocka.immo'), { a: 'jules.b@klocka.immo', objetPrefixe: '[Local · pour client@exemple.fr] ' });
    // L'invitation d'un client, en local : chez l'admin qui invite.
    const inv = await E.envoyerPlateforme('invitation_client', { a: 'client@exemple.fr', vars: { prenom: 'Marie', lien: 'x' }, testeur: 'jules.b@klocka.immo' }, { envoyer });
    assert.equal(inv.redirige, 'jules.b@klocka.immo');
  } finally {
    process.env.EMAILING_REEL = 'true';
  }
});

test('06/10 · l\'heure d\'envoi : 9 h à Paris, été comme hiver ; le jour 0 part à 9 h ou tout de suite', () => {
  assert.equal(E.prochainEnvoi('2026-10-06T15:00:00Z', 7), '2026-10-13T07:00:00.000Z', 'heure d\'été : 9 h = 7 h UTC');
  assert.equal(E.prochainEnvoi('2026-11-02T15:00:00Z', 7), '2026-11-09T08:00:00.000Z', 'heure d\'hiver : 9 h = 8 h UTC');
  assert.equal(E.prochainEnvoi('2026-10-06T05:00:00Z', 0), '2026-10-06T07:00:00.000Z', 'inscrit à 7 h : part à 9 h');
  assert.equal(E.prochainEnvoi('2026-10-06T13:00:00Z', 0), '2026-10-06T13:00:00.000Z', 'inscrit à 15 h : part tout de suite');
  assert.equal(E.prochainEnvoi('2026-10-06T15:00:00Z', 1, 18), '2026-10-07T16:00:00.000Z', 'heure réglée à 18 h');
});

test('06/10 · un même email ne part jamais deux fois, même si l\'inscription est rejouée', async () => {
  E.importerContacts('zoe@exemple.fr;Zoé', { liste: 'Doublon' });
  const s = E.creerSequence({ nom: 'Doublon', liste: 'Doublon' }, { email: 'jules.b@klocka.immo' });
  E.changerStatut(s.id, 'active');
  const partis = [];
  const envoyer = async (m) => { partis.push(m); return { ok: true, id: `re_${partis.length}` }; };
  await E.tourEmailing({ quand: new Date('2026-10-06T10:00:00Z'), envoyer });
  assert.equal(partis.length, 1);
  assert.equal(partis[0].idempotence, S.cleEnvoi.sequence(s.id, s.etapes[0].id, Records.list('EmailingContact').find((c) => c.email === 'zoe@exemple.fr').id));
  // L'inscription revient en arrière (une erreur, une reprise) : l'email déjà parti ne repart pas.
  const i = Records.list('EmailingInscription').find((x) => x.sequence_id === s.id);
  Records.update('EmailingInscription', i.id, { etape: 0, prochain_envoi: '2026-10-06T09:00:00Z' });
  await E.tourEmailing({ quand: new Date('2026-10-06T11:00:00Z'), envoyer });
  assert.equal(partis.length, 1, 'pas de second envoi');
  assert.equal(Records.get('EmailingInscription', i.id).etape, 1, 'l\'inscription avance quand même');
});

test('06/10 · segments : règles ET / OU sur les champs, les tags et les listes ; bounce jamais servi', async () => {
  const lyon = { email: 'a@x.fr', ville: 'Lyon', tags: ['webinaire-oct'], listes: [], champs: { budget: '300k' }, statut: 'abonne' };
  const seg = { regles: { combinaison: 'et', conditions: [{ operateur: 'a_tag', valeur: 'webinaire-oct' }, { champ: 'ville', operateur: 'egal', valeur: 'lyon' }] } };
  assert.equal(S.dansSegment(lyon, seg), true);
  assert.equal(S.dansSegment({ ...lyon, ville: 'Nice' }, seg), false);
  assert.equal(S.dansSegment({ ...lyon, ville: 'Nice' }, { regles: { ...seg.regles, combinaison: 'ou' } }), true);
  assert.equal(S.remplit(lyon, { champ: 'champs.budget', operateur: 'contient', valeur: '300' }), true);
  assert.equal(S.envoyable({ ...lyon, statut: 'bounce' }), false);
  Records.create('EmailingContact', { email: 'rebond@exemple.fr', statut: 'bounce', listes: [], tags: [], champs: {} });
  const r = await E.envoyerPlateforme('invitation_client', { a: 'rebond@exemple.fr', vars: {} }, { envoyer: async () => ({ ok: true }) });
  assert.equal(r.bloque, true, 'une adresse en bounce n\'est servie par aucune voie, même la plateforme');
});
