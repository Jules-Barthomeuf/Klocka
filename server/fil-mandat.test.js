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
  assert.match(F.filDuMandat(id)[0].texte, /Mandat envoyé : il est saisi sur MyNotary au plus vite/);
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

  // L'équipe coche les étapes (2 nov. 2026, Jules) : un PDF joint n'avance plus rien de lui-même.
  assert.equal(P.deposerMandatPret(id, { document: { nom: 'mandat.pdf', url: '/uploads/m.pdf' } }, mandataire).ok, false, 'réservé à Klocka');
  assert.equal(P.passerALaSuite(id, mandataire).ok, false, 'pas d’étape suivante avant le mandat');
  assert.equal(P.validerMandat(id, mandataire).ok, false, 'rien à valider avant le mandat rempli');
  const r0 = await F.ecrireKlocka(Records.get('MandatMandataire', id), klocka, { pieces: [{ nom: 'Mandat à relire.pdf', url: '/uploads/r.pdf' }] });
  assert.equal(r0.ok, true);
  assert.equal(Records.get('MandatMandataire', id).a_relire, undefined, 'le PDF seul ne coche rien');
  assert.equal(F.tempsDuMandat(Records.get('MandatMandataire', id)), 'envoye');
  assert.equal((await P.cocherEtapeMandat(id, 1, mandataire)).ok, false, 'réservé à Klocka');
  const c1 = await P.cocherEtapeMandat(id, 1, klocka);
  assert.equal(c1.ok, true);
  assert.equal(c1.mandat.a_relire.url, '/uploads/r.pdf', 'le dernier PDF joint est le mandat rempli');
  assert.equal(F.tempsDuMandat(c1.mandat), 'en_signature');
  await attendre();
  assert.ok(notif(mandataire.email, /Votre mandat est validé · Boulangerie/));
  assert.ok(notif(klocka.email, /Mandat validé · Boulangerie/));
  assert.equal(F.mandatsPourKlocka(klocka.email)[0].a_faire, true, 'validé : à envoyer en signature');

  await F.ecrireKlocka(Records.get('MandatMandataire', id), klocka, { pieces: [{ nom: 'Mandat Masséna.pdf', url: '/uploads/m.pdf' }] });
  assert.equal(Records.get('MandatMandataire', id).statut, 'demande_envoyee');
  const c2 = await P.cocherEtapeMandat(id, 2, klocka);
  assert.equal(c2.mandat.statut, 'pret');
  assert.equal(c2.mandat.document.url, '/uploads/m.pdf', 'le dernier PDF joint est le mandat signé');
  await attendre();
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
  assert.deepEqual(F.filDuMandat(id).map((m) => m.cote), ['systeme', 'mandataire', 'analyste', 'analyste', 'systeme', 'analyste', 'analyste', 'systeme', 'systeme']);
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

test('la conversation avec l’équipe commence avant le mandat, et le mandat la reprend (2 nov. 2026, Jules)', async () => {
  const lea = { email: 'lea2@kpartners.fr', role: 'mandataire' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: lea.email, commerce: 'Fleuriste', ville: 'Lyon' });
  const avant = F.mandatDuBien(p.id);
  assert.equal(avant.id, `bien-${p.id}`);
  await F.ecrireMandataire(avant, lea, { texte: 'Quel taux pour Lyon 6e ?' });
  await F.ecrireKlocka(avant, klocka, { texte: '5,5 % pour ce type de murs.' });
  assert.ok(F.mandatsPourKlocka(klocka.email).some((x) => x.id === avant.id && x.avant_mandat), 'l’équipe la voit avant le mandat');
  // Le mandat du bien part : la conversation d'avant est en tête de la sienne, et la ligne « avant mandat » s'efface.
  const e = Records.create('EstimationMandataire', { mandataire_email: lea.email, proprietaire_id: p.id, bien: 'Fleuriste' });
  const d = P.demanderMandat({ vendeur: 'M. Roux', bien: 'Fleuriste Lyon', prix: 300000, honoraires: 5, type: 'simple', duree_mois: 6 }, lea);
  Records.update('MandatMandataire', d.mandat.id, { estimation_id: e.id });
  await attendre();
  const fil = F.filDuMandat(d.mandat.id).map((x) => x.texte);
  assert.deepEqual(fil.slice(0, 2), ['Quel taux pour Lyon 6e ?', '5,5 % pour ce type de murs.']);
  assert.ok(!F.mandatsPourKlocka(klocka.email).some((x) => x.id === avant.id));
});

test('cocher la dernière étape coche celles d’avant (2 nov. 2026, Jules)', async () => {
  const nina = { email: 'nina@kpartners.fr', role: 'mandataire' };
  const d = P.demanderMandat({ vendeur: 'M. Roux', bien: 'Primeur Garibaldi', prix: 200000, honoraires: 5, type: 'simple', duree_mois: 12 }, nina);
  const r = await P.cocherEtapeMandat(d.mandat.id, 3, klocka);
  assert.equal(r.ok, true);
  assert.equal(r.mandat.statut, 'signe');
  assert.ok(r.mandat.valide_le);
  assert.equal((await P.cocherEtapeMandat(d.mandat.id, 4, klocka)).ok, false, 'étape inconnue');
});
