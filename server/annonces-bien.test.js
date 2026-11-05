// Les annonces d'un bien en vente (4 nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-annonces-'));
const A = await import('./annonces-bien.js');

const teaser = {
  classe: 'murs_loues', ref: 'KP-0042', titre: 'Murs commerciaux loués, centre-ville', sous_titre: 'Centre-ville Lyon',
  tuiles: [{ cle: 'prix', libelle: 'Prix FAI', valeur: '450 000 €' }, { cle: 'rendement', libelle: 'Rendement', valeur: '[à compléter]' }],
  lignes: [{ cle: 'surface', intitule: 'Surface', detail: '85 m²' }, { cle: 'bail', intitule: 'Bail', detail: '[à compléter]' }],
  points: ['Emplacement de centre-ville', '[à compléter]'],
};

test('les faits du teaser, sans ce qui reste à compléter', () => {
  const f = A.faitsDuTeaser(teaser);
  assert.deepEqual(f.chiffres, { 'Prix FAI': '450 000 €' });
  assert.deepEqual(f.caracteristiques, { Surface: '85 m²' });
  assert.deepEqual(f.points_forts, ['Emplacement de centre-ville']);
  assert.equal(f.ref, 'KP-0042');
});

test('les mentions : référence, honoraires du mandat, qui publie ; ce qui manque se voit', () => {
  const m = A.mentionsDe({ ref: 'KP-0042', s: { nom: 'Marie Durand', rsac: '912 345 678', ville_rsac: 'Lyon', telephone: '06 12 34 56 78' }, mandat: { honoraires: 5, honoraires_charge: 'acquereur' } });
  assert.match(m, /Réf\. KP-0042/);
  assert.match(m, /Honoraires : 5 % à la charge de l'acquéreur/);
  assert.match(m, /Marie Durand, agent commercial \(RSAC de Lyon n° 912 345 678\), mandataire de K Partners/);
  const vide = A.mentionsDe({ s: {} });
  assert.match(vide, /Honoraires : \[à compléter\]/);
  assert.match(vide, /RSAC \[à compléter\]/);
});

test('la consigne : les faits seuls, ni adresse ni enseigne, un fonds tait ses chiffres', () => {
  const c = A.consigneAnnonces(A.faitsDuTeaser(teaser));
  assert.match(c, /Jamais d'adresse précise/);
  assert.match(c, /leboncoin/);
  assert.doesNotMatch(c, /fonds de commerce : pas d'activité/);
  assert.match(A.consigneAnnonces({ classe: 'fonds' }), /CA et EBE communiqués sur demande/);
  assert.equal(A.CANAUX.length, 5);
});
