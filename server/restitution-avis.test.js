import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-restitution-'));
const { Records } = await import('./db.js');
const R = await import('./restitution-avis.js');
const { statutDuBien, enAttenteDuProprietaire } = await import('../src/lib/biens-mandataire.js');

const JOUR = 86400000;
const AUJ = new Date('2026-10-27T10:00:00Z');
const chiffres = { valeur: 680000, bas: 620000, haut: 740000 };
const jours = (iso) => Math.round((new Date(iso) - AUJ) / JOUR);

test("plus de séquence fixe après l'envoi : la relance dite par Haka passe avant celle du cas", () => {
  assert.equal(R.relanceApresEnvoi, undefined);
  const r = R.planDeRestitution('reflechit', { aujourdhui: AUJ, relance_le: '2026-11-02T10:30', relance_quoi: 'Rendez-vous de présentation', canal: 'rdv' });
  assert.equal(r.statut, 'envoyee');
  assert.equal(r.relance.canal, 'rdv');
  assert.equal(r.relance.le, '2026-11-02T09:30:00.000Z');
  assert.equal(R.dateDeRelance('2026-11-02'), '2026-11-02T08:00:00.000Z');
  assert.equal(R.dateDeRelance('lundi'), null);
});

test('chaque cas a un statut et une prochaine action datée', () => {
  for (const cas of Object.keys(R.CAS_RESTITUTION)) {
    const p = R.planDeRestitution(cas, { aujourdhui: AUJ, envoye_le: AUJ.toISOString(), prix: '700 k€', chiffres });
    assert.equal(p.ok, true, cas);
    assert.ok(p.relance?.le && p.relance.quoi, `${cas} sans relance`);
    assert.ok(['prix_accord', 'envoyee', 'pause', 'perdu'].includes(p.statut), cas);
  }
});

test('un accord se range selon son prix ; au-dessus de la fourchette, l’alerte et la révision', () => {
  const conseille = R.planDeRestitution('accord_conseille', { aujourdhui: AUJ, chiffres });
  assert.equal(conseille.prix, 680000);
  assert.equal(R.planDeRestitution('accord_fourchette', { aujourdhui: AUJ, chiffres }).ok, false, 'un autre prix demande le prix');
  const haut = R.planDeRestitution('accord_fourchette', { aujourdhui: AUJ, chiffres, prix: 800000, compatibles: [{ budget: '900 k€' }, { budget: '700 000 €' }, { budget: null }] });
  assert.equal(haut.cas, 'accord_au_dessus');
  assert.equal(haut.revision_jours, 30);
  assert.match(haut.alerte, /À ce prix, 1 client compatible/);
  assert.equal(R.planDeRestitution('accord_au_dessus', { aujourdhui: AUJ, chiffres, prix: 700000 }).cas, 'accord_fourchette');
});

test('En pause et Perdu : les délais du tableau, la date donnée, le motif', () => {
  assert.equal(jours(R.planDeRestitution('trop_bas', { aujourdhui: AUJ }).relance.le), 90);
  assert.equal(jours(R.planDeRestitution('plus_vendeur', { aujourdhui: AUJ }).relance.le), 180);
  assert.equal(R.planDeRestitution('attend', { aujourdhui: AUJ, date: '2027-03-31' }).relance.le.slice(0, 10), '2027-03-31');
  const c = R.planDeRestitution('concurrent', { aujourdhui: AUJ });
  assert.equal(c.statut, 'perdu');
  assert.equal(c.motif, 'concurrent');
  // Plus de passage En pause d'office après dix jours : il reste Estimation envoyée, relancé dans une semaine.
  const muet = R.planDeRestitution('sans_reponse', { aujourdhui: AUJ, envoye_le: new Date(AUJ.getTime() - 12 * JOUR).toISOString() });
  assert.equal(muet.statut, 'envoyee');
  assert.equal(jours(muet.relance.le), 7);
  assert.equal(R.planDeRestitution('bail_change', { aujourdhui: AUJ }).a_revoir, true);
  assert.equal(R.planDeRestitution('inconnu').ok, false);
});

test('de bout en bout : envoyé, puis la restitution écrit le statut, la relance et l’historique', () => {
  const user = { email: 'lucie@kpartners.fr', role: 'mandataire' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: user.email, statut: 'rdv_pris', nom: 'M. Dupont', email: 'dupont@exemple.fr', commerce: 'Boulangerie', biens: { validee: 'previsite' }, historique: [] });
  const e = Records.create('EstimationMandataire', { mandataire_email: user.email, proprietaire_id: p.id, statut: 'prete', bien: 'Boulangerie', avis: { chiffres, bien: { rue: '12 rue Exemple', ville: 'Lyon' }, type_libelle: 'Murs de commerce' } });
  const defaut = R.mailParDefaut({ avis: e.avis, proprietaire: p, signataire: { nom: 'Lucie Martin' } });
  assert.match(defaut.texte, /680.000 €/);
  assert.match(defaut.texte, /Bonjour M\. Dupont/);
  const env = R.marquerEnvoye(e.id, { a: 'dupont@exemple.fr' }, user);
  assert.equal(env.ok, true);
  assert.equal(env.estimation.statut, 'envoye');
  const apres = Records.get('ProprietaireMandataire', p.id);
  assert.equal(apres.biens.prochaine, null, "l'envoi ne programme rien");
  assert.equal(Records.list('Rappel').filter((x) => x.proprietaire_id === p.id).length, 0);

  // Le fil : un appel, un rendez-vous fixé ; la nouvelle relance remplace l'ancienne.
  assert.equal(R.noterEchange(p.id, { resume: 'Appelé, il veut une présentation.', relance_le: '2026-11-01', relance_quoi: 'Le rappeler' }, user).ok, true);
  const rdv = R.noterEchange(p.id, { resume: 'Rendez-vous fixé lundi à 10 h pour la présentation.', relance_le: '2026-11-02T10:00', relance_quoi: 'Présenter l’avis', canal: 'rdv' }, user);
  assert.equal(rdv.ok, true);
  const ouvertes = Records.list('Rappel').filter((x) => x.proprietaire_id === p.id && !x.fait_le);
  assert.equal(ouvertes.length, 1);
  assert.equal(ouvertes[0].canal, 'rdv');
  assert.equal(Records.list('Rappel').filter((x) => x.proprietaire_id === p.id).length, 2, 'l’ancienne est close, pas effacée');
  assert.equal(R.noterEchange(p.id, { resume: 'x', relance_le: 'lundi', relance_quoi: 'y' }, user).ok, false);
  assert.match(R.filDeLaRelation(Records.get('ProprietaireMandataire', p.id)), /Rendez-vous fixé lundi[\s\S]*Prochaine action : Présenter/);
  const suivi = R.suiviDuBien(p.id, user);
  assert.equal(suivi.bien.statut, 'Estimation envoyée');
  assert.equal(suivi.bien.valeur, 680000);
  assert.equal(suivi.a_faire.length, 1);
  assert.equal(suivi.a_faire[0].quoi, 'Présenter l’avis');
  assert.equal(suivi.faites.length, 0, 'une relance remplacée n’est pas « faite »');
  assert.match(suivi.historique[0].texte, /Rendez-vous fixé/);
  assert.equal(R.suiviDuBien(p.id, { email: 'autre@kpartners.fr' }).ok, false);
  const b = { proprietaire: Records.get('ProprietaireMandataire', p.id), estimation: env.estimation };
  assert.equal(statutDuBien(b), 'Estimation envoyée');
  assert.equal(enAttenteDuProprietaire(b), true);

  assert.equal(R.proposerRestitution(p.id, { cas: 'concurrent' }, user).carte.type, 'confirmer_restitution');
  assert.equal(Records.get('ProprietaireMandataire', p.id).biens.perdu, null, 'proposer n’écrit rien');
  const r = R.appliquerRestitution(p.id, { cas: 'concurrent' }, user);
  assert.equal(r.ok, true);
  const q = Records.get('ProprietaireMandataire', p.id);
  assert.equal(statutDuBien({ proprietaire: q, estimation: env.estimation }), 'Perdu · concurrent');
  assert.equal(enAttenteDuProprietaire({ proprietaire: q, estimation: env.estimation }), false);
  assert.ok(Records.get('Rappel', r.rappel_id).echeance);
  assert.match(q.historique.at(-1).texte, /Perdu \(concurrent\)/);

  const accord = R.appliquerRestitution(p.id, { cas: 'accord_fourchette', prix: '650 k€' }, user);
  const z = Records.get('ProprietaireMandataire', p.id);
  assert.equal(accord.ok, true);
  assert.equal(z.biens.prix_accord, 650000);
  assert.equal(z.biens.perdu, null);
  assert.equal(statutDuBien({ proprietaire: z, estimation: env.estimation }), "Prix d'accord");
  assert.equal(R.suiviDuBien(p.id, user).bien.prix_accord, 650000);
});
