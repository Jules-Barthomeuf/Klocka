import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-visites-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('./db.js');
const V = await import('./visites-acquereur.js');

const moi = { email: 'm@kpartners.fr', role: 'mandataire' };
const autre = { email: 'x@kpartners.fr', role: 'mandataire' };
const SIGNATURE = `data:image/png;base64,${Buffer.from('png').toString('base64')}`;
const bien = { ids: ['proprietaire:p1'], cle: 'proprietaire:p1', titre: 'Boulangerie Masséna · Nice', adresse: '12 rue Masséna, Nice' };
// Ce que Haka répondrait au récit, tel quel (le nom et le budget glissés exprès dans le compte rendu).
const lecture = {
  compris: 'Intérêt fort, il attend son banquier.', interet: 'fort', reaction: 'Séduit par l’emplacement',
  points_positifs: ['emplacement'], objections: ['loyer un peu bas', 'travaux de façade'],
  budget: '450 k€', financement: 'prêt en cours chez sa banque', delai: 'trois mois', autres_biens: 'une pharmacie à Cimiez',
  prochaine_etape: 'Il revient avec son architecte', relance: { quoi: 'Rappeler M. Durand', le: '2026-11-03' },
  compte_rendu: { profil: 'investisseur particulier', impression: 'Pierre Durand a beaucoup aimé l’emplacement. Son budget de 450 k€ est serré.', points_positifs: ['L’emplacement, en plein passage'], reserves: ['La façade à reprendre', 'Il attend l’accord de sa banque.'] },
};
const llm = async () => lecture;

test('le compte rendu au propriétaire ne garde rien de l’acquéreur : ni nom, ni budget, ni financement', () => {
  const cr = V.anonymiser(lecture.compte_rendu, { nom: 'Pierre Durand' });
  const tout = JSON.stringify(cr);
  assert.doesNotMatch(tout, /Durand|Pierre|budget|banque|450/i);
  assert.equal(cr.impression, "L'acquéreur a beaucoup aimé l’emplacement.");
  assert.deepEqual(cr.reserves, ['La façade à reprendre']);
  assert.equal(cr.profil, 'investisseur particulier');
  // Le prix du bien, lui, se dit : une réserve sur le prix intéresse le propriétaire.
  assert.deepEqual(V.anonymiser({ reserves: ['Le prix de 480 000 € lui semble haut'] }, {}).reserves, ['Le prix de 480 000 € lui semble haut']);
});

test('le bon : à signer avant l’heure, manquant après, signé une fois le nom et la signature posés', () => {
  const t = Date.parse('2026-10-30T14:00:00Z');
  assert.equal(V.etatDuBon({ quand: '2026-10-30T15:00:00Z' }, t), 'a_signer');
  assert.equal(V.etatDuBon({ quand: '2026-10-30T13:00:00Z' }, t), 'manquant');
  assert.equal(V.etatDuBon({ quand: '2026-10-30T13:00:00Z', bon: { signe_le: 'x' } }, t), 'signe');
  const b = V.texteDuBon({ quand: '2026-10-30T14:00:00Z', bien, bon: { nom: 'Pierre Durand' } }, { nom: 'Léa Martin', qualite: 'agent commercial' });
  assert.match(b.lignes[0], /Pierre Durand.*Léa Martin, agent commercial du réseau K Partners/);
  assert.match(b.lignes[1], /Boulangerie Masséna.*12 rue Masséna/);
  assert.match(b.lignes[2], /douze mois/);
});

test('une visite, de la création au compte rendu envoyé : bon signé, récit, validation, relance, fiche de l’acquéreur', async () => {
  Records.create('ProprietaireMandataire', { id: 'p1', mandataire_email: moi.email, nom: 'M. Bernard', email: 'bernard@exemple.fr', statut: 'rdv_pris', historique: [] });
  assert.equal((await V.creerVisite({ bien, acquereur: { nom: 'Pierre Durand' } }, moi)).ok, false, 'sans heure');
  const c = await V.creerVisite({ bien, acquereur: { nom: 'Pierre Durand', telephone: '0600000000' }, quand: '2026-10-30T14:00:00Z' }, moi);
  assert.equal(c.ok, true);
  const id = c.visite.id;
  assert.equal(c.visite.bien.proprietaire_id, 'p1');
  assert.equal(c.visite.acquereur_nom, 'Pierre Durand');
  assert.equal(V.lireVisite(id, autre).ok, false, 'un autre mandataire ne la voit pas');

  assert.equal(V.signerBon(id, { nom: 'Pierre Durand', signature: 'pas une image' }, moi).ok, false);
  const s = V.signerBon(id, { nom: 'Pierre Durand', signature: SIGNATURE }, moi);
  assert.equal(s.visite.etat_bon, 'signe');
  assert.equal((await V.mesVisites(moi))[0].bon.signature, undefined, 'la liste ne porte pas la signature');

  assert.equal(V.validerVisite(id, {}, moi).ok, false, 'rien à valider avant le récit');
  assert.equal((await V.preparerMail(id, moi)).ok, false, 'pas de mail avant validation');
  const r = await V.lireRecit(id, { texte: 'Visite avec M. Durand, très intéressé…' }, moi, { llm });
  assert.equal(r.ok, true);
  assert.equal(r.visite.proposition.note_interne.interet, 'fort');
  assert.equal(r.visite.proposition.note_interne.budget, '450 k€', 'la note interne garde le budget');
  assert.doesNotMatch(JSON.stringify(r.visite.proposition.compte_rendu), /Durand|450|banque/);
  assert.equal(r.visite.valide_le, null, 'rien de validé tant que le mandataire ne l’a pas fait');

  const ok = V.validerVisite(id, { compte_rendu: { impression: 'M. Durand a aimé.' } }, moi);
  assert.equal(ok.ok, true);
  assert.equal(ok.visite.compte_rendu.impression, "L'acquéreur a aimé.", 'même corrigé à la main, le nom ne passe pas');
  const rappel = Records.get('Rappel', ok.visite.rappel_id);
  assert.equal(rappel.echeance.slice(0, 10), '2026-11-03');
  assert.match(rappel.quoi, /Rappeler M\. Durand/);
  const a = Records.get('AcquereurMandataire', ok.visite.acquereur.acquereur_id);
  assert.equal(a.historique.length, 1);
  assert.equal(a.historique[0].interet, 'fort');
  assert.match(Records.get('ProprietaireMandataire', 'p1').historique.at(-1).quoi, /visite de Pierre Durand : intérêt fort/);

  // Revalider ne double ni la relance ni la ligne de l'acquéreur.
  const re = V.validerVisite(id, {}, moi);
  assert.equal(Records.list('Rappel').filter((x) => x.visite_id === id && !x.fait_le).length, 1);
  assert.equal(Records.get('AcquereurMandataire', re.visite.acquereur.acquereur_id).historique.length, 1);

  const m = await V.preparerMail(id, moi);
  assert.equal(m.mail.a, 'bernard@exemple.fr');
  assert.match(m.mail.texte, /Bonjour M\. Bernard/);
  assert.doesNotMatch(m.mail.texte, /Durand|450|banque/);
  assert.equal(V.marquerEnvoye(id, { a: m.mail.a }, moi).visite.statut, 'envoyee');
});

test('L\'Assistant KPartners retrouve le bien nommé et la visite racontée, et crée une visite depuis une phrase', async () => {
  const biens = [{ titre: 'Boulangerie Masséna · Nice', ids: ['a'] }, { titre: 'Pharmacie Cimiez · Nice', ids: ['b'] }];
  assert.equal(V.trouverBien(biens, 'la boulangerie').ids[0], 'a');
  assert.equal(V.trouverBien(biens, 'Nice'), 'ambigu');
  assert.equal(V.trouverBien(biens, 'garage'), null);
  const t = Date.parse('2026-10-30T16:00:00Z');
  const vs = [
    { id: '1', quand: '2026-10-30T14:00:00Z', bien: { titre: 'Boulangerie Masséna' }, acquereur: { nom: 'Pierre Durand' } },
    { id: '2', quand: '2026-10-28T10:00:00Z', bien: { titre: 'Boulangerie Masséna' }, acquereur: { nom: 'Anne Roux' } },
    { id: '3', quand: '2026-11-05T10:00:00Z', bien: { titre: 'Boulangerie Masséna' }, acquereur: { nom: 'Luc' } },
  ];
  assert.equal(V.visiteRacontee(vs, { qui: 'boulangerie' }, t).id, '1', 'la plus proche de maintenant, pas une visite à venir');
  assert.equal(V.visiteRacontee(vs, { acquereur: 'Anne Roux' }, t).id, '2');

  Records.create('ProprietaireMandataire', { id: 'p2', mandataire_email: moi.email, commerce: 'Fleuriste Garibaldi', ville: 'Nice', nom: 'Mme Blanc', statut: 'rdv_pris', historique: [] });
  const n = await V.executerOutilVisite('noter_visite_acquereur', { bien: 'fleuriste', acquereur: 'Marc Petit', quand: '2026-10-31T10:00' }, moi);
  assert.equal(n.ok, true, n.error);
  assert.equal(n.cree, true);
  assert.match(n.lien, /etape=marche&visite=/);
  const v = Records.get('VisiteAcquereur', n.visite_id);
  assert.deepEqual(v.bien.cles, ['proprietaire:p2']);
  assert.equal(v.acquereur.nom, 'Marc Petit');
  // Un acquéreur déjà connu n'est pas recréé.
  await V.executerOutilVisite('noter_visite_acquereur', { bien: 'fleuriste', acquereur: 'marc petit', quand: '2026-11-02T10:00' }, moi);
  assert.equal(Records.list('AcquereurMandataire').filter((x) => x.nom === 'Marc Petit').length, 1);
});

test('le bon pas signé à l’approche : une notification par visite, une seule fois', async () => {
  const t = new Date('2026-12-01T09:30:00Z');
  const c = await V.creerVisite({ bien, acquereur: { nom: 'Zoé' }, quand: '2026-12-01T10:00:00Z' }, moi);
  const avant = Records.list('Notification').length;
  assert.equal(await V.tourDesBons(t), 1);
  assert.equal(await V.tourDesBons(t), 0);
  const n = Records.list('Notification').slice(avant)[0];
  assert.equal(n.pour, moi.email);
  assert.match(n.titre, /bon de visite n'est pas signé/);
  assert.match(n.lien, new RegExp(c.visite.id));
});
