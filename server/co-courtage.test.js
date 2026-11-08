// La fiche confrère (6 nov. 2026, Jules : « les fiches anonymes de co »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-co-'));
const C = await import('./co-courtage.js');

test('le mandat lu pour un confrère : honoraires en euros, en %, ou dans le texte d’un mandat importé', () => {
  const a = C.mandatPourConfrere({ mandat: { prix: 560000, honoraires: 22400, honoraires_charge: 'acquereur', type: 'exclusif', numero_registre: 'KP-2026-0131' } });
  assert.equal(a.fai, 582400);
  assert.equal(a.exclusif, true);
  assert.equal(C.mandatPourConfrere({ mandat: { prix: 400000, honoraires: 5, honoraires_charge: 'acquereur' } }).honoraires, 20000);
  const b = C.mandatPourConfrere({ importe: { prix: 720000, honoraires: "36 000 € à la charge de l'acquéreur (756 000 € FAI)", exclusif: true, numero: 'KP-2026-0147', echeance: '2027-01-28' } });
  assert.equal(b.honoraires, 36000);
  assert.equal(b.fai, 756000);
  assert.equal(b.echeance, '2027-01-28');
  assert.equal(C.mandatPourConfrere({ importe: { prix: 300000, honoraires: '5 % charge vendeur' } }).fai, 300000, 'à la charge du vendeur, le prix ne bouge pas');
});

test('la fiche : le partage, sans adresse ni nom, et le message aux confrères', () => {
  const teaser = { titre: 'Murs loués à une brasserie', sous_titre: 'Montpellier, Occitanie', tuiles: [{ libelle: 'Rendement', valeur: '6,8 %' }, { libelle: 'Loyer', valeur: '[à compléter]' }] };
  const m = C.mandatPourConfrere({ importe: { prix: 560000, honoraires: '22 400 €', exclusif: true, numero: 'KP-2026-0131', echeance: '2026-12-15' } });
  const co = C.composerCo({ teaser, m, partage: 40, signataire: { nom: 'Sébastien Roche', telephone: '06 09 10 11 12' }, ville: 'Montpellier' });
  assert.equal(co.partage, 40);
  assert.match(co.lignes.find((l) => l.cle === 'partage').detail, /40 % au confrère, soit 8 960 €/);
  assert.match(co.lignes.find((l) => l.cle === 'mandat').detail, /Exclusif, n° KP-2026-0131, jusqu'au 15\/12\/2026/);
  assert.match(co.message, /co-courtage : murs loués à une brasserie\.\nMontpellier, Occitanie\./);
  assert.equal(co.lignes.length, 3, 'mandat, honoraires, partage : le prix est déjà dans les tuiles');
  assert.match(co.message, /Rendement : 6,8 %/);
  assert.doesNotMatch(co.message, /à compléter/, 'un chiffre manquant ne part pas aux confrères');
  assert.equal(C.composerCo({ teaser, m, partage: 45 }).partage, 50, 'un partage inconnu revient à 50 %');
});

test('la diffusion dite à l’assistant', () => {
  assert.equal(C.cadreDeLaDiffusion({}), '');
  const t = C.cadreDeLaDiffusion({ annonces: { canaux: { leboncoin: {}, linkedin: {} }, diffusion: { leboncoin: '2026-11-06T10:00:00Z' } }, co: { partage: 50 } });
  assert.match(t, /En ligne : Leboncoin \(le 2026-11-06\)/);
  assert.match(t, /Reste : LinkedIn/);
  assert.doesNotMatch(t, /confrère.*(prête|envoyée)/, 'plus de fiche confrère à l’écran (7 nov. 2026)');
});
