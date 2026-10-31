import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Une base jetable, jamais celle du poste.
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-biens-import-'));
const { bienLu, chezKPartners, marquerDoublons, relanceAvant, lireBiens, importerBiens } = await import('./biens-import.js');
const { bienDuProprietaire } = await import('../src/lib/biens-mandataire.js');

test('chezKPartners : sans enseigne, on le suppose ; une autre enseigne, non', () => {
  assert.equal(chezKPartners(''), true);
  assert.equal(chezKPartners('K Partners Antibes'), true);
  assert.equal(chezKPartners('KPARTNERS'), true);
  assert.equal(chezKPartners('Century 21'), false);
});

test('bienLu : prix, dates, exclusivité ; une ligne vide est écartée', () => {
  const b = bienLu({ adresse: '12 rue Masséna', ville: 'Nice', prix: '450 k€', signe_le: '03/09/2026', echeance: '2026-12-03', exclusif: 'oui' });
  assert.equal(b.prix, 450000);
  assert.equal(b.signe_le, '2026-09-03');
  assert.equal(b.echeance, '2026-12-03');
  assert.equal(b.exclusif, true);
  assert.equal(b.k_partners, true);
  assert.equal(bienLu({ prix: 100000 }), null);
  assert.equal(bienLu({ adresse: 'x', enseigne: 'Foncia', k_partners: true }).k_partners, true, 'la case de la relecture fait foi');
});

test('marquerDoublons : même numéro, ou même adresse et ville', () => {
  const fiches = [{ adresse: '12 Rue Masséna', ville: 'Nice', mandat_importe: { numero: '2026-0007' } }];
  const r = marquerDoublons([{ adresse: '12 rue Massena', ville: 'nice' }, { numero: '2026-0007', adresse: 'ailleurs' }, { adresse: '3 rue Neuve', ville: 'Nice' }], fiches);
  assert.deepEqual(r.map((b) => b.deja), [true, true, false]);
});

test('relanceAvant : un mois avant l’échéance, jamais dans le passé', () => {
  assert.match(relanceAvant('2027-03-15', '2026-10-31T00:00:00.000Z'), /^2027-02-15/);
  assert.equal(relanceAvant('2026-11-10', '2026-10-31T00:00:00.000Z'), '2026-10-31T00:00:00.000Z');
  assert.equal(relanceAvant(null, '2026-10-31T00:00:00.000Z'), '2026-10-31T00:00:00.000Z');
});

test('lireBiens puis importerBiens : K Partners à l’étape Mandat faite, une autre enseigne à re-signer, pas de doublon', async () => {
  const { Records } = await import('./db.js');
  const marc = { email: 'marc.import@kpartners.fr', role: 'mandataire' };
  const llm = async () => ({ biens: [
    { proprietaire: 'SCI Dupont', commerce: 'Boulangerie', adresse: '12 rue Masséna', ville: 'Nice', prix: 450000, numero: '2026-0007', enseigne: 'K Partners' },
    { proprietaire: 'M. Martin', commerce: 'Pharmacie', adresse: '3 rue Neuve', ville: 'Nice', prix: 800000, echeance: '2027-03-15', enseigne: 'Century 21' },
  ] });
  const lu = await lireBiens({ texte: 'deux mandats' }, marc, { llm });
  assert.equal(lu.ok, true);
  assert.equal(lu.biens.length, 2);
  assert.equal(Records.list('ProprietaireMandataire').filter((p) => p.mandataire_email === marc.email).length, 0, 'lire n’écrit rien');

  const r = importerBiens(lu.biens, marc);
  assert.equal(r.ajoutes, 2);
  const [k, autre] = r.biens;
  const etapeDe = (p) => bienDuProprietaire([p], `proprietaire:${p.id}`).etape;
  assert.equal(k.statut, 'mandat_signe');
  assert.equal(etapeDe(k), 4, 'la suite : Commercialisation');
  assert.equal(autre.statut, 'rdv_pris');
  assert.equal(etapeDe(autre), 3, 'le mandat est à re-signer');
  assert.equal(autre.prochaine_action, 'Re-signer le mandat chez K Partners');
  assert.match(autre.prochaine_action_le, /^2027-02-15/);
  assert.equal(autre.biens.prix_accord, 800000);

  const encore = importerBiens(lu.biens, marc);
  assert.deepEqual([encore.ajoutes, encore.doublons], [0, 2]);
  const relu = await lireBiens({ texte: 'deux mandats' }, marc, { llm });
  assert.ok(relu.biens.every((b) => b.deja), 'la relecture montre ce qui est déjà là');
  for (const p of r.biens) Records.delete('ProprietaireMandataire', p.id);
});

test('lireBiens : rien de reconnu, une erreur lisible', async () => {
  const r = await lireBiens({ texte: 'bonjour' }, { email: 'x@kpartners.fr' }, { llm: async () => ({ biens: [{ prix: 1 }] }) });
  assert.equal(r.ok, false);
  assert.match(r.error, /Aucun mandat/);
});
