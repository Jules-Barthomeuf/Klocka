// La Mémoire Klocka : ce qu'un dossier y laisse, et comment on y retrouve un bien.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-memoire-'));
const { Records, CHEMIN_UPLOADS } = await import('../db.js');
const { bienDepuisLot, bienDepuisDeal, memoriser, chercherDansMemoire, phraseHistorique, listerMemoire } = await import('./memoire.js');

const lot = {
  lot: {
    adresse: { valeur: { rue: '12 av. Jean Médecin', code_postal: '06000', ville: 'Nice' }, confiance: 0.9 },
    prix_fai: { valeur: 450000 }, loyer_annuel_ht_hc: { valeur: 27000 }, surface_m2: { valeur: 85 },
    locataire_nom: { valeur: 'Boulangerie Paul' }, bail_type: { valeur: '3/6/9' }, rendement_annonce: { absent: true },
  },
};

test('bienDepuisLot : les champs à plat, la clé d\'adresse, l\'agent de la fiche', () => {
  const b = bienDepuisLot(lot, { nom: 'Théo', email: 'Theo@Quorner.com', agence: 'Quorner' }, { recu_le: '2026-03-02T10:00:00.000Z', compte: 'sourcing@klocka.immo' });
  assert.equal(b.prix, 450000);
  assert.equal(b.loyer_annuel, 27000);
  assert.equal(b.surface_m2, 85);
  assert.equal(b.rendement_annonce, null);
  assert.equal(b.ville, 'Nice');
  assert.equal(b.agent_email, 'theo@quorner.com');
  assert.equal(b.agent.agence, 'Quorner');
  assert.match(b.cle_adresse, /12\|avenue jean medecin\|06000/);
  assert.equal(b.statut, 'memoire');
});

test('memoriser : la fiche est copiée, la ligne retrouvée par deal_id, un test n\'entre pas', () => {
  fs.mkdirSync(CHEMIN_UPLOADS, { recursive: true });
  fs.writeFileSync(path.join(CHEMIN_UPLOADS, 'fiche-nice.pdf'), 'pdf');
  const deal = { deal_id: 'd-nice', lots: [lot], source: { url: '/uploads/fiche-nice.pdf', nom_fichier: 'Fiche Nice.pdf', type: 'application/pdf' }, contact_agent_email: 'theo@quorner.com', apercu: { agent_nom: 'Théo', agence: 'Quorner' }, cree_le: '2026-03-02T10:00:00.000Z' };
  const r1 = memoriser(deal, { origine: 'dossier' });
  assert.equal(r1.cree, true);
  assert.equal(r1.bien.statut, 'dossier');
  assert.ok(fs.existsSync(path.join(CHEMIN_UPLOADS, 'memoire', path.basename(r1.bien.fiche.url))));
  const r2 = memoriser(deal, { origine: 'suppression', par: { email: 'jules.b@klocka.immo' } });
  assert.equal(r2.cree, false);
  assert.equal(r2.bien.id, r1.bien.id);
  assert.equal(r2.bien.statut, 'memoire');
  assert.equal(r2.bien.origine, 'suppression');
  assert.equal(Records.list('BienMemoire').length, 1);
  assert.equal(memoriser({ ...deal, deal_id: 'd-test', test: true }).ok, false);
});

test('bienDepuisDeal : l\'agent corrigé à la main prime sur l\'aperçu', () => {
  const b = bienDepuisDeal({ deal_id: 'x', lots: [lot], apercu: { agent_nom: 'Aperçu' }, fiche_agent: { nom: 'Corrigé', email: 'c@agence.fr' } });
  assert.equal(b.agent.nom, 'Corrigé');
  assert.equal(b.agent_email, 'c@agence.fr');
});

test('chercherDansMemoire et phraseHistorique : même adresse, prix d\'aujourd\'hui', () => {
  const biens = listerMemoire();
  const arrive = { adresse: { rue: '12 avenue Jean Medecin', code_postal: '06000', ville: 'Nice' }, prix: 420000, agent: { agence: 'Century' } };
  const hits = chercherDansMemoire(arrive, biens);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].niveau, 'meme_adresse');
  const phrase = phraseHistorique(arrive, hits);
  assert.match(phrase, /vu en mars 2026 chez Quorner à 450 k€/);
  assert.match(phrase, /aujourd'hui 420 k€ chez Century/);
  assert.equal(phraseHistorique(arrive, []), null);
  assert.equal(chercherDansMemoire({ adresse: { rue: '3 rue de Paris', code_postal: '75001', ville: 'Paris' } }, biens).length, 0);
});

test('listerMemoire : filtre par mot (ville, agence)', () => {
  assert.equal(listerMemoire({ q: 'quorner' }).length, 1);
  assert.equal(listerMemoire({ q: 'lyon' }).length, 0);
});
