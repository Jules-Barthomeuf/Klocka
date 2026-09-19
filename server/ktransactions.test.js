// K-Transactions : le prix lu dans une annonce, et le marché qu'on en tire.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-ktr-'));
const { prixDuFonds, lireCession, marcheDesFonds } = await import('./ktransactions.js');

test('le prix se lit dans la phrase, quelle que soit la tournure du greffe', () => {
  // Les deux formes relevées en vrai au BODACC.
  assert.equal(prixDuFonds('siège et établissement principal acquis par achat au prix stipulé de 80000.00 euros'), 80000);
  assert.equal(prixDuFonds('Fonds artisanal acquis par achat au prix stipulé de 30000.00 euros'), 30000);
  assert.equal(prixDuFonds('cédé moyennant le prix de 145 000,00 euros'), 145000);
  assert.equal(prixDuFonds('au prix de 62500 euros'), 62500);
  // Sans prix, on ne devine pas : une fusion ou un apport n'en porte pas.
  assert.equal(prixDuFonds("apport d'un fonds de commerce"), null);
  assert.equal(prixDuFonds(''), null);
  assert.equal(prixDuFonds(null), null);
});

test('une annonce devient une cession lisible, adresse et vendeur compris', () => {
  const c = lireCession({
    id: 'A1', dateparution: '2026-09-18', commercant: "MON PANIER D'ARMOR", ville: 'Yffiniac', cp: '22120',
    acte: { vente: { categorieVente: "Achat d'un fonds par une personne morale" } },
    listeetablissements: { etablissement: {
      origineFonds: 'siège et établissement principal acquis par achat au prix stipulé de 80000.00 euros',
      qualiteEtablissement: 'siège et établissement principal',
      activite: 'la vente de fruits et légumes',
      adresse: { numeroVoie: '22', typeVoie: 'Rue', nomVoie: 'François Jaffrain', codePostal: '22120', ville: 'Yffiniac' },
    } },
    listeprecedentproprietaire: { personne: { denomination: 'TESSIER' } },
  });

  assert.equal(c.prix, 80000);
  assert.equal(c.acquereur, "MON PANIER D'ARMOR");
  assert.equal(c.vendeur, 'TESSIER');
  assert.equal(c.adresse, '22 Rue François Jaffrain');
  assert.equal(c.rue, 'francois jaffrain', 'le type de voie sort de la clé de rapprochement');
  assert.equal(c.ville, 'Yffiniac');
  // Une annonce sans établissement ne casse rien.
  assert.equal(lireCession({ id: 'A2' }).prix, null);
});

test('le BODACC rend ses champs composés en chaîne JSON, et le prix s\'y lit quand même', () => {
  // La forme réellement servie par l'API : une chaîne, pas un objet. Lue comme
  // un objet, elle ne rendait aucun prix.
  const c = lireCession({
    id: 'B1', dateparution: '2026-09-13', commercant: 'Polygone NCE OpCo 3',
    listeetablissements: JSON.stringify({ etablissement: {
      origineFonds: 'établissement secondaire acquis par achat au prix stipulé de 297000.00 euros',
      activite: 'la restauration rapide',
      adresse: { numeroVoie: '2', typeVoie: 'Avenue', nomVoie: 'Jean Médecin', codePostal: '06000', ville: 'Nice' },
    } }),
    acte: JSON.stringify({ vente: { categorieVente: "Achat d'un fonds" } }),
    listeprecedentproprietaire: JSON.stringify({ personne: { denomination: 'PILAT' } }),
  });
  assert.equal(c.prix, 297000);
  assert.equal(c.vendeur, 'PILAT');
  assert.equal(c.categorie, "Achat d'un fonds");
  assert.equal(c.adresse, '2 Avenue Jean Médecin');
  assert.equal(c.rue, 'jean medecin');
  // Une chaîne illisible ne fait pas tomber la lecture.
  assert.equal(lireCession({ id: 'B2', listeetablissements: '{ceci n est pas du json' }).prix, null);
});

test('le marché ne compte que les annonces qui portent un prix, et le dit', () => {
  const cession = (prix, rue, nom = 'X') => lireCession({
    id: nom, commercant: nom,
    listeetablissements: { etablissement: {
      origineFonds: prix ? `acquis par achat au prix stipulé de ${prix}.00 euros` : 'apport en société',
      adresse: { typeVoie: 'Rue', nomVoie: rue, ville: 'Nice' },
    } },
  });
  const m = marcheDesFonds([
    cession(60000, 'Dabray', 'A'), cession(90000, 'Dabray', 'B'), cession(120000, 'Dabray', 'C'),
    cession(300000, 'Gutenberg', 'D'), cession(null, 'Dabray', 'E'),
  ], 'Rue Dabray');

  assert.equal(m.n, 5);
  assert.equal(m.n_avec_prix, 4, "l'annonce sans prix compte dans le total, pas dans la médiane");
  assert.equal(m.prix.median, 105000);
  assert.equal(m.prix.min, 60000);
  assert.equal(m.prix.max, 300000);
  // Les comparables de la rue visée, et leur médiane à eux.
  assert.equal(m.comparables_rue.length, 3);
  assert.ok(m.comparables_rue.every((c) => c.rue === 'dabray'));
  assert.equal(m.prix_rue, 90000);
  // Sans rue visée, pas de comparables inventés.
  assert.deepEqual(marcheDesFonds([cession(60000, 'Dabray')]).comparables_rue, []);
  assert.equal(marcheDesFonds([]).prix, null);
});
