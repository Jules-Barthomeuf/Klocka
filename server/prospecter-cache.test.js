// La signature des fiches pour les caches de la Prospection (1er nov. 2026) : seul compte qui tient quel commerce.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-prospecter-cache-'));
const { signatureDesTenues } = await import('./mandataire-prospecter.js');

const f = { id: 'a', commerce_simple_id: 'c1', mandataire_email: 'lea@kpartners.fr', statut: 'a_appeler', historique: [] };

test('une parole, un historique ou un champ ne changent pas la signature', () => {
  const s = signatureDesTenues([f]);
  assert.equal(signatureDesTenues([{ ...f, historique: [{ texte: 'appelé' }], derniere_parole: 'x', telephone: '06' }]), s);
});

test('un statut, un commerce pris ou rendu la changent', () => {
  const s = signatureDesTenues([f]);
  assert.notEqual(signatureDesTenues([{ ...f, statut: 'rdv_pris' }]), s);
  assert.notEqual(signatureDesTenues([f, { id: 'b', commerce_simple_id: 'c2', mandataire_email: 'paul@kpartners.fr' }]), s);
  assert.notEqual(signatureDesTenues([]), s);
  assert.equal(signatureDesTenues([{ id: 'z', statut: 'contacte' }]), signatureDesTenues([]), 'une fiche sans commerce ne compte pas');
});

test('le dernier résultat gardé sur disque sert tout de suite, puis le calcul frais le remplace', async () => {
  const { Meta } = await import('./db.js');
  const { prospecterVite, prospecterEnCache } = await import('./mandataire-prospecter.js');
  const lea = { email: 'lea@kpartners.fr', role: 'mandataire' };
  Meta.set('mandataire.prospecter:lea@kpartners.fr', JSON.stringify({ secteur: { id: 's', nom: 'Ancien' }, villes: [], clients: [] }));
  const vite = await prospecterVite(lea);
  assert.equal(vite.a_jour, false);
  assert.equal(vite.secteur.nom, 'Ancien');
  await prospecterEnCache(lea); // le calcul lancé en fond
  const frais = await prospecterVite(lea);
  assert.equal(frais.a_jour, true);
  assert.equal(frais.secteur, null, 'sans secteur, le calcul frais le dit');
  assert.equal(JSON.parse(Meta.get('mandataire.prospecter:lea@kpartners.fr')).secteur, null, 'et le disque le garde');
});
