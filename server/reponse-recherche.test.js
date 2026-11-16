// La réponse de la recherche du locataire, sans ce que le modèle dit de lui-même.

import test from 'node:test';
import assert from 'node:assert/strict';
import { nettoyerReponse } from '../src/lib/reponse-recherche.js';

test('les phrases où le modèle parle de lui ou de sa recherche s\'en vont, les faits restent', () => {
  const t = "Je pense que « forme financière » désigne la forme juridique et la situation financière. Voici ce que j'ai trouvé.\n\n## Identité\n- **SIREN :** 775 665 631\n- Je n'ai pas pu ouvrir la fiche.\n\n## Situation financière\nRésultat net de 98,3 M€ en 2024.\n\nJe n'ai pas pu lire le détail des bilans sur la page Pappers. Pour les consulter, ouvrez la fiche Pappers.";
  const r = nettoyerReponse(t);
  assert.ok(!/Je pense|Voici|n'ai pas pu|Pour les consulter/.test(r), r);
  assert.match(r, /SIREN :\*\* 775 665 631/);
  assert.match(r, /98,3 M€ en 2024/);
  assert.ok(r.startsWith('## Identité'));
});
