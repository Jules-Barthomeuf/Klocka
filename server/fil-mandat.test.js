import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fil-mandat-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('./db.js');
const P = await import('./mandataire-portes.js');
const F = await import('./fil-mandat.js');

const mandataire = { email: 'lea@kpartners.fr', role: 'mandataire' };
const klocka = { email: 'nora.l@klocka.immo', role: 'admin' };
const attendre = () => new Promise((r) => setTimeout(r, 30));
const notif = (pour, titre) => Records.list('Notification').find((n) => n.pour === pour && titre.test(n.titre));

test('un mandat, de la demande au registre : chaque étape dans le fil, celui qui doit agir prévenu', async () => {
  Records.create('FicheMandataire', { email: mandataire.email, analyste_email: klocka.email });
  const d = P.demanderMandat({ vendeur: 'M. Bernard', bien: 'Boulangerie Masséna', prix: '450 000 €', honoraires: '5', type: 'exclusif', duree_mois: '12' }, mandataire);
  assert.equal(d.ok, true);
  const id = d.mandat.id;
  await attendre();
  assert.match(F.filDuMandat(id)[0].texte, /Mandat envoyé : il est saisi sur MyNotary/);
  assert.doesNotMatch(F.filDuMandat(id)[0].texte, /Klocka/, 'le mandataire ne lit pas « Klocka »');
  assert.equal(notif(klocka.email, /Mandat à saisir sur MyNotary · Boulangerie Masséna/)?.lien, `/Mandats?mandat=${id}`);

  // Le mandataire écrit ; Klocka répond ; chacun est prévenu, et voit ses non-lus.
  assert.equal((await F.ecrireMandataire(d.mandat, mandataire, { texte: '' })).ok, false, 'un message vide ne part pas');
  await F.ecrireMandataire(d.mandat, mandataire, { texte: 'Le vendeur préfère 6 % d’honoraires.' });
  assert.equal(F.nonLus(id, klocka.email), 1);
  assert.equal(F.mandatsPourKlocka(klocka.email)[0].non_lus, 1);
  F.marquerLu(id, klocka.email);
  assert.equal(F.nonLus(id, klocka.email), 0);
  await F.ecrireKlocka(d.mandat, klocka, { texte: 'Noté, je le corrige dans MyNotary.' });
  assert.equal(notif(mandataire.email, /Nora vous a écrit · Boulangerie Masséna/)?.lien, `/Biens?bien=mandat:${id}&etape=mandat&vue=conversation`);

  // Klocka joint le PDF rédigé dans la conversation : c'est le mandat prêt, et une seule notification part.
  assert.equal(P.deposerMandatPret(id, { document: { nom: 'mandat.pdf', url: '/uploads/m.pdf' } }, mandataire).ok, false, 'réservé à Klocka');
  assert.equal(P.passerALaSuite(id, mandataire).ok, false, 'pas d’étape suivante avant le mandat');
  const avant = Records.list('Notification').filter((n) => n.pour === mandataire.email).length;
  const r1 = await F.ecrireKlocka(Records.get('MandatMandataire', id), klocka, { pieces: [{ nom: 'Mandat Masséna.pdf', url: '/uploads/m.pdf' }] });
  assert.equal(r1.mandat.statut, 'pret');
  assert.equal(r1.mandat.document.url, '/uploads/m.pdf');
  assert.equal(F.filDuMandat(id).at(-1).texte, 'Voici le mandat signé.');
  assert.equal(r1.mandat.document_signe.url, '/uploads/m.pdf');
  await attendre();
  assert.equal(Records.list('Notification').filter((n) => n.pour === mandataire.email).length, avant + 1);
  assert.ok(notif(mandataire.email, /Votre mandat signé est arrivé/));
  assert.equal(F.mandatsPourKlocka(klocka.email)[0].a_faire, false, 'prêt : la balle est chez le mandataire');
  // Un autre PDF, une fois prêt, n'est qu'une pièce jointe.
  await F.ecrireKlocka(Records.get('MandatMandataire', id), klocka, { texte: 'L’annexe', pieces: [{ nom: 'annexe.pdf', url: '/uploads/a.pdf' }] });
  assert.equal(Records.get('MandatMandataire', id).document.url, '/uploads/m.pdf');

  // Le mandataire passe à l'étape suivante, sans redéposer de document.
  assert.equal(P.passerALaSuite(id, mandataire).mandat.statut, 'signe');
  await attendre();
  assert.ok(notif(klocka.email, /Mandat signé · Boulangerie/));
  assert.equal(F.mandatsPourKlocka(klocka.email)[0].a_faire, true);

  const r = P.enregistrerMandat(id, klocka);
  await attendre();
  assert.match(F.filDuMandat(id).at(-1).texte, new RegExp(`n° ${r.mandat.numero_registre}`));
  assert.deepEqual(F.filDuMandat(id).map((m) => m.cote), ['systeme', 'mandataire', 'analyste', 'analyste', 'analyste', 'systeme', 'systeme']);
});

test('sans analyste attitré, le mandat va à Jules ; un mandat d’exemple ne part pas', async () => {
  const autre = { email: 'marc@kpartners.fr', role: 'mandataire' };
  const d = P.demanderMandat({ vendeur: 'Mme Blanc', bien: 'Fleuriste Garibaldi', prix: 300000, honoraires: 5, type: 'simple', duree_mois: 12 }, autre);
  assert.equal(F.responsable(d.mandat), null);
  await attendre();
  assert.ok(Records.list('Notification').some((n) => n.pour === null && /Fleuriste Garibaldi/.test(n.titre)));
  const ex = Records.create('MandatMandataire', { mandataire_email: autre.email, bien: 'Exemple', statut: 'demande_envoyee', exemple: true });
  assert.equal((await F.ecrireMandataire(ex, autre, { texte: 'Bonjour' })).ok, false);
  assert.ok(!F.mandatsPourKlocka(klocka.email).some((m) => m.id === ex.id));
});
