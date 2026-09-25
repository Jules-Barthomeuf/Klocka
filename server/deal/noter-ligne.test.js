// La note d'une ligne de la fiche du bien, réécrite à la main puis rendue au calcul.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-notes-'));
const { Records } = await import('../db.js');
const { noterLigne } = await import('./index.js');

test('une note écrite à la main remplace la calculée, et se vide pour y revenir', () => {
  Records.create('Deal', { deal_id: 'n1', lots: [{ lot: { prix_fai: { valeur: 520000, citation: 'Net vendeur' }, honoraires_inclus: { valeur: false } }, evaluation: { grille: [] } }] });
  const r = noterLigne('n1', 0, 'prix', '  Honoraires 5 % confirmés par l\'agent au téléphone.  ', { email: 'jules.b@klocka.immo' });
  assert.equal(r.lot.notes_manuelles.prix.texte, 'Honoraires 5 % confirmés par l\'agent au téléphone.');
  assert.equal(r.lot.notes_manuelles.prix.par, 'jules.b@klocka.immo');
  assert.ok(r.lot.notes.prix.textes.length, 'la note calculée reste calculée à côté');
  const vide = noterLigne('n1', 0, 'prix', '', null);
  assert.equal(vide.lot.notes_manuelles.prix, undefined);
  assert.equal(noterLigne('n1', 0, 'nimporte', 'x', null).error, 'Ligne inconnue');
});

test('une adresse corrigée périme les lectures faites à l\'ancienne, et relance le marché s\'il y en avait un', async () => {
  const { lecturesPerimees } = await import('./index.js');
  const adr = (rue, cp, ville) => ({ adresse: { valeur: { rue, code_postal: cp, ville } } });
  const entree = { lot: adr(null, null, 'Réaumur'), valeur_locative: { rue: {} }, comparaison_marche: {}, lieu: {} };
  const r = lecturesPerimees(entree, adr('12 rue Réaumur', '75003', 'Paris'), { adresse: '12 rue Réaumur, 75003 Paris' });
  assert.equal(r.adresse_changee, true);
  assert.deepEqual(r.retirer.sort(), ['comparaison_marche', 'lieu', 'valeur_locative']);
  assert.equal(r.relancer, true);
  // Seulement le cache et le lieu : on les retire, sans relancer une recherche complète.
  assert.equal(lecturesPerimees({ lot: adr(null, null, 'Réaumur'), comparaison_marche: {} }, adr('12 rue Réaumur', '75003', 'Paris'), { adresse: 'x' }).relancer, false);
  // La même adresse retapée, ou une autre saisie : rien ne se périme.
  assert.equal(lecturesPerimees(entree, entree.lot, { adresse: 'Réaumur' }).adresse_changee, false);
  assert.equal(lecturesPerimees(entree, { ...entree.lot, loyer_annuel_ht_hc: { valeur: 1 } }, { loyer_annuel_ht_hc: 1 }).retirer.length, 0);
});
