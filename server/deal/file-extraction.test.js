// La file d'extraction : une pièce déposée sur un dossier déjà pré-analysé
// entre aussi dans la matrice, qui alimente la fiche du bien et les étapes.
// Avant la pré-analyse, la file se contente des tables : la pré-analyse lira
// toutes les pièces d'un coup.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-file-extraction-'));
// Sans clé : le modèle répond par ses valeurs de remplissage, rien n'est facturé.
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
const { Records } = await import('../db.js');
const { enfiler } = await import('./file-extraction.js');

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-uploads-'));
const USER = { email: 'jules.b@klocka.immo', role: 'admin' };

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

function deposer(dealId, docId, deal = {}) {
  fs.writeFileSync(path.join(uploadDir, `${docId}.txt`), 'Bail commercial. Loyer annuel 24 000 € HT HC.');
  Records.create('Deal', {
    deal_id: dealId,
    nom: 'Tabac - Nice',
    statut: 'analyse',
    documents_espace: [{ id: docId, nom: 'bail.txt', url: `/uploads/${docId}.txt`, mime: 'text/plain', taille: 40, categorie: 'Bail commercial' }],
    ...deal,
  });
}

async function finDeLecture(dealId, docId) {
  const debut = Date.now();
  while (Date.now() - debut < 20000) {
    const d = Records.findBy('Deal', 'deal_id', dealId);
    const statut = (d.documents_espace || []).find((x) => x.id === docId)?.extraction?.statut;
    if (statut && !['en_attente', 'en_cours'].includes(statut)) return d;
    await attendre(50);
  }
  throw new Error('La file n\'a pas fini.');
}

test('sur un dossier pré-analysé, la pièce déposée entre dans la matrice', async () => {
  deposer('d-fiche', 'doc-bail', { lots: [{ lot: { surface_m2: { valeur: 80, absent: false } } }] });
  assert.equal(enfiler('d-fiche', ['doc-bail'], { uploadDir, user: USER }), 1);
  const d = await finDeLecture('d-fiche', 'doc-bail');
  const ligne = (d.matrice?.lignes || []).find((l) => l.document_id === 'doc-bail');
  assert.ok(ligne, 'la matrice a une ligne pour la pièce');
  assert.equal(ligne.categorie, 'Bail commercial');
  // Les tables sont là aussi, comme avant.
  assert.ok((d.extractions || []).some((e) => e.document_id === 'doc-bail'));
});

test('avant la pré-analyse, la file ne touche pas à la matrice', async () => {
  deposer('d-brut', 'doc-brut');
  enfiler('d-brut', ['doc-brut'], { uploadDir, user: USER });
  const d = await finDeLecture('d-brut', 'doc-brut');
  assert.equal((d.matrice?.lignes || []).length, 0);
  assert.ok((d.extractions || []).some((e) => e.document_id === 'doc-brut'));
});
