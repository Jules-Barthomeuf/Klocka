// Haka : le même bien reçu deux fois (pur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliserAdresse, comparerBiens, chercherDoublons, bienDuDossier } from './doublons.js';

const bien = (rue, ville, prix, code_postal = null) => ({ adresse: { rue, ville, code_postal }, prix });

test('une adresse se normalise : casse, accents, abréviations, numéro', () => {
  const a = normaliserAdresse({ rue: '12 Av. Mirabeau', code_postal: '06000', ville: 'Nice' });
  const b = normaliserAdresse({ rue: '12 avenue mirabeau', ville: 'NICE' });
  assert.equal(a.cle, '12|avenue mirabeau|06000');
  assert.equal(b.cle, '12|avenue mirabeau|nice');
  assert.equal(normaliserAdresse({ rue: '3 bis Bd Saint-Michel', code_postal: '75005' }).cle, '3bis|boulevard saint michel|75005');
  assert.equal(normaliserAdresse({ rue: '', ville: 'Nice' }).cle, null);
});

test('identique, même adresse, proche, différent', () => {
  assert.equal(comparerBiens(bien('12 Av. Mirabeau', 'Nice', 450000), bien('12 avenue mirabeau', 'nice', 450000)), 'identique');
  // Un demi pour cent d'écart, c'est le même prix.
  assert.equal(comparerBiens(bien('12 Av. Mirabeau', 'Nice', 450000), bien('12 avenue mirabeau', 'nice', 451000)), 'identique');
  assert.equal(comparerBiens(bien('12 Av. Mirabeau', 'Nice', 450000), bien('12 avenue mirabeau', 'nice', 420000)), 'meme_adresse');
  assert.equal(comparerBiens(bien('12 Av. Mirabeau', 'Nice', 450000), bien('12 avenue mirabeau', 'nice', null)), 'meme_adresse');
  assert.equal(comparerBiens(bien('12 Av. Mirabeau', 'Nice', 450000), bien('14 avenue Mirabeau', 'Nice', 450000)), 'proche');
  assert.equal(comparerBiens(bien('12 Av. Mirabeau', 'Nice', 450000), bien('12 avenue Mirabau', 'Nice', 450000)), 'proche');
  assert.equal(comparerBiens(bien('12 Av. Mirabeau', 'Nice', 450000), bien('12 avenue Mirabeau', 'Cannes', 450000)), 'different');
  assert.equal(comparerBiens(bien('12 Av. Mirabeau', 'Nice', 450000), bien('8 rue de France', 'Nice', 450000)), 'different');
  // Le code postal prime sur le nom de ville quand les deux l'ont.
  assert.equal(comparerBiens(bien('12 Av. Mirabeau', 'Nice', 450000, '06000'), bien('12 avenue mirabeau', 'Nice Centre', 450000, '06000')), 'identique');
});

test('une adresse absente ne compare rien', () => {
  assert.equal(comparerBiens({ adresse: null, prix: 1 }, bien('12 rue X', 'Nice', 1)), 'different');
  assert.deepEqual(chercherDoublons({ adresse: null, prix: 100 }, [{ deal_id: 'd', lots: [{ lot: { adresse: { valeur: { rue: '1 rue X', ville: 'Nice' } }, prix_fai: { valeur: 100 } } }] }]), []);
});

test('chercherDoublons : du plus sûr au moins sûr, les archivés exclus', () => {
  const deals = [
    { deal_id: 'proche', nom: 'Proche', lots: [{ lot: { adresse: { valeur: { rue: '14 avenue Mirabeau', ville: 'Nice' } }, prix_fai: { valeur: 450000 } } }] },
    { deal_id: 'exact', nom: 'Exact', lots: [{ lot: { adresse: { valeur: { rue: '12 av mirabeau', ville: 'Nice' } }, prix_fai: { valeur: 450000 } } }] },
    { deal_id: 'prix', nom: 'Prix', lots: [{ lot: { adresse: { valeur: { rue: '12 avenue Mirabeau', ville: 'Nice' } }, prix_fai: { valeur: 400000 } } }] },
    { deal_id: 'archive', archived: true, lots: [{ lot: { adresse: { valeur: { rue: '12 avenue Mirabeau', ville: 'Nice' } }, prix_fai: { valeur: 450000 } } }] },
    { deal_id: 'absent', lots: [{ lot: { adresse: { absent: true, valeur: null }, prix_fai: { valeur: 450000 } } }] },
  ];
  const r = chercherDoublons(bien('12 Avenue Mirabeau', 'Nice', 450000), deals);
  assert.deepEqual(r.map((x) => [x.deal_id, x.niveau]), [['exact', 'identique'], ['prix', 'meme_adresse'], ['proche', 'proche']]);
  assert.deepEqual(bienDuDossier(deals[1]), { adresse: { rue: '12 av mirabeau', ville: 'Nice' }, prix: 450000 });
});
