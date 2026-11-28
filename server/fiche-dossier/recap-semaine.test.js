// Le récap de la semaine (27 nov. 2026) : visible le lundi d'après, à plusieurs personnes, lu une fois.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-recap-semaine-'));
const R = await import('./recap-semaine.js');
const { equipe } = await import('./modele.js');

const [a, b, c] = equipe();
const auteur = { email: a.email, role: 'admin' };

test('récap : le lundi de la semaine d\'après, à Paris', () => {
  assert.equal(R.lundiSuivant(new Date('2026-11-27T18:00:00+01:00')), '2026-11-30'); // vendredi
  assert.equal(R.lundiSuivant(new Date('2026-11-30T09:00:00+01:00')), '2026-12-07'); // un lundi : celui d'après
  assert.equal(R.lundiSuivant(new Date('2026-11-29T23:30:00+01:00')), '2026-11-30'); // dimanche soir
});

test('récap : la mise en forme, propre, et refusée vide', async () => {
  const r = await R.structurer({ texte: 'Cette semaine j\'ai relancé Bilel pour la cave à vin.' }, auteur, { lire: async () => ({
    titre: 'Semaine du 23 novembre', parties: [{ titre: 'Ce qui a avancé', points: ['J\'ai relancé Bilel pour la cave à vin.', ''] }, { titre: 'Vide', points: [] }],
  }) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.recap.parties, [{ titre: 'Ce qui a avancé', points: ['J\'ai relancé Bilel pour la cave à vin.'] }]);
  assert.equal((await R.structurer({ texte: '  ' }, auteur)).ok, false);
  assert.match(R.consigneRecap('x', { avant: { titre: 't', parties: [] } }), /Ce que la personne veut changer/);
});

test('récap : envoyé à plusieurs, visible à partir du lundi, lu une fois par chacun', () => {
  const recap = { titre: 'Semaine du 23 novembre', parties: [{ titre: 'Ce qui a avancé', points: ['Cave à vin relancée.'] }] };
  assert.equal(R.envoyer({ recap, destinataires: [] }, auteur).ok, false);
  const e = R.envoyer({ recap, destinataires: [b.email, c.email, 'inconnu@x.fr', a.email] }, auteur, { maintenant: new Date('2026-11-27T18:00:00+01:00') });
  assert.equal(e.ok, true);
  assert.equal(e.visible_des, '2026-11-30');
  assert.deepEqual(e.destinataires.map((x) => x.email), [b.email, c.email]);
  const pourB = { email: b.email };
  assert.equal(R.recus(pourB, { maintenant: new Date('2026-11-29T12:00:00+01:00') }).length, 0, 'pas avant lundi');
  const lundi = new Date('2026-11-30T08:00:00+01:00');
  const vus = R.recus(pourB, { maintenant: lundi });
  assert.equal(vus.length, 1);
  assert.equal(vus[0].recap.titre, 'Semaine du 23 novembre');
  assert.deepEqual(vus[0].avec, [c.prenom]);
  assert.equal(R.marquerLu(vus[0].id, pourB).ok, true);
  assert.equal(R.recus(pourB, { maintenant: lundi }).length, 0);
  assert.equal(R.recus({ email: c.email }, { maintenant: lundi }).length, 1, 'l\'autre destinataire le voit encore');
  assert.equal(R.recus(auteur, { maintenant: lundi }).length, 0, 'pas à son auteur');
});
