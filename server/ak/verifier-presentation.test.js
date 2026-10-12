// La relecture d'une préz contre le projet (12 oct. 2026).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-prez-'));
process.env.ANTHROPIC_API_KEY = '';
const V = await import('./verifier-presentation.js');
const { Records } = await import('../db.js');

test('les champs du projet : sans zéros, sans vides, sans identifiants', () => {
  const c = V.champsRenseignes({ id: 'x', sim_prix_bien_negocie: 335000, sim_apport: 0, nom_locataire: 'Chocolaterie', photos: ['a'], client_email: 'a@b.fr', ges_note: 'null', echeance_bail: '2030-05-17' });
  assert.deepEqual(c, { echeance_bail: '2030-05-17', nom_locataire: 'Chocolaterie', sim_prix_bien_negocie: 335000 });
});

test('la préz est relue contre le projet, le texte des pages et les chiffres partent au modèle', async () => {
  const p = Records.create('Project', { titre: 'Chocolaterie Libourne', sim_prix_bien_negocie: 335000, sim_loyer_initial_ht: 30693 });
  const chemin = path.join(process.env.KLOCKA_DATA_DIR, 'prez.txt');
  fs.writeFileSync(chemin, 'Prix d’acquisition droits inclus : 335 000 €\nLoyer annuel : 30 693 €');
  let vu = '';
  const r = await V.verifierPresentation({ chemin, projet_id: p.id }, {
    invoquer: async ({ prompt }) => { vu = prompt; return { synthese: 'Un écart.', ecarts: [{ page: 'page 1', element: 'prix', dans_la_prez: '335 000 €', attendu: '361 800 €', gravite: 'bloquant' }], a_remplir: [{ page: 'page 1', champ: 'XXX' }], conformes: ['Loyer conforme'] }; },
  });
  assert.equal(r.ok, true);
  assert.match(vu, /"sim_prix_bien_negocie": 335000/);
  assert.match(vu, /droits inclus : 335 000/);
  assert.equal(r.ecarts[0].gravite, 'bloquant');
  assert.deepEqual(r.a_remplir, ['page 1 : XXX']);
});

test('sans projet ni dossier, rien ne part au modèle', async () => {
  const chemin = path.join(process.env.KLOCKA_DATA_DIR, 'prez2.txt');
  fs.writeFileSync(chemin, 'texte');
  const r = await V.verifierPresentation({ chemin }, { invoquer: async () => { throw new Error('ne doit pas partir'); } });
  assert.equal(r.ok, false);
});
