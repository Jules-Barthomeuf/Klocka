import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-avis-commerces-'));
const { Records } = await import('./db.js');
const { activitesEcarteesDe, filtreDesAvis, monAvis, noterAvisCommerce, SEUIL_ACTIVITE } = await import('./avis-commerces.js');

const A = { email: 'a@kpartners.fr' };
const B = { email: 'b@kpartners.fr' };
const C = { email: 'c@kpartners.fr' };
const commerce = (nom, activite) => Records.create('CommerceSimple', { nom, activite, classe: 'commerce', exploitant: { nom } });

test("activitesEcarteesDe : assez de pouces en bas, et plus de deux pour un en haut", () => {
  const non = (activite) => ({ activite, avis: 'non' });
  assert.deepEqual([...activitesEcarteesDe([non('Hébergement'), non('Hebergement'), non('hébergement')])], ['hebergement'], 'accents et casse confondus');
  assert.equal(activitesEcarteesDe([non('Boulangerie'), non('Boulangerie')]).size, 0, `moins de ${SEUIL_ACTIVITE} : rien n'est écarté`);
  assert.equal(activitesEcarteesDe([non('Tabac'), non('Tabac'), non('Tabac'), { activite: 'Tabac', avis: 'oui' }, { activite: 'Tabac', avis: 'oui' }]).size, 0, 'deux pouces en haut retiennent l\'activité');
});

test("un pouce en bas écarte le commerce pour soi, puis l'activité pour tous", () => {
  const residence = commerce('Résidence Les Étudiants', 'Hébergement étudiant');
  const boulangerie = commerce('Boulangerie du Pont', 'Boulangerie');
  assert.equal(noterAvisCommerce(residence.id, 'non', A).ok, true);
  assert.equal(monAvis(residence.id, A), 'non');
  assert.equal(filtreDesAvis(A)(residence), false, 'écarté pour celui qui l\'a jugé');
  assert.equal(filtreDesAvis(B)(residence), true, 'pas encore pour les autres');
  assert.equal(filtreDesAvis(A)(boulangerie), true);
  // Deux autres résidences écartées par d'autres : l'activité sort pour tous.
  const r2 = commerce('Résidence du Campus', 'Hébergement étudiant');
  const r3 = commerce('Studéa Gare', 'Hébergement étudiant');
  noterAvisCommerce(r2.id, 'non', B);
  const r = noterAvisCommerce(r3.id, 'non', C);
  assert.equal(r.activite_ecartee, true);
  const r4 = commerce('Résidence Nouvelle', 'Hébergement étudiant');
  assert.equal(filtreDesAvis({ email: 'nouveau@kpartners.fr' })(r4), false, "l'activité écartée ne se propose plus à personne");
  // Un pouce en haut garde le commerce pour soi malgré l'activité écartée.
  noterAvisCommerce(r4.id, 'oui', A);
  assert.equal(filtreDesAvis(A)(r4), true);
  // Reprendre son avis l'efface.
  noterAvisCommerce(residence.id, null, A);
  assert.equal(monAvis(residence.id, A), null);
  assert.equal(noterAvisCommerce(residence.id, 'peut-être', A).ok, false);
  assert.equal(noterAvisCommerce('inconnu', 'non', A).ok, false);
});
