// Le mail d'un agent dans le fil de son contact Twenty CRM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ligneDuMail } from './mail-vers-crm.js';

test('la ligne écrite sur le contact : date, expéditeur, objet, extrait, pièces, et qui l\'a transféré', () => {
  const t = ligneDuMail({ de: 'Martin Durand', de_email: 'martin@foncia.fr', objet: 'Fiche murs Antibes', texte: 'Bonjour, voici la fiche du local.', pieces: [{ nom: 'fiche.pdf' }], date: '2026-11-16T09:00:00Z' }, { transfere_par: 'coralie.g@klocka.immo' });
  assert.match(t, /^Mail reçu le 16 novembre 2026 de Martin Durand \(transféré par coralie\.g@klocka\.immo\) : « Fiche murs Antibes »/);
  assert.match(t, /voici la fiche du local/);
  assert.match(t, /1 pièce jointe : fiche\.pdf/);
});
