// 26 nov. 2026, Jules : « un bail et son avenant ; l'analyse a pris la clause du bail alors qu'elle avait été modifiée
// dans l'avenant ». Sur le bail, l'avenant passe devant, le plus récent d'abord ; ce qu'il ne dit pas reste lu dans le bail.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-bail-avenant-'));
const { Records } = await import('../db.js');
const { lireAnalyse, ordreBail } = await import('./analyse-pieces.js');

const lu = (valeur) => ({ valeur, page: 1, citation: valeur });
const fini = { statut: 'fait' };

test("l'avenant l'emporte sur le bail pour la clause qu'il modifie, le plus récent d'abord", () => {
  Records.create('Deal', {
    deal_id: 'BA1', nom: 'Bail et avenants',
    documents_espace: [
      { id: 'bail', nom: 'Bail.pdf', url: '/uploads/bail.pdf', ajoute_le: '2026-11-26T10:00:00Z' },
      { id: 'av1', nom: 'Avenant 1.pdf', url: '/uploads/av1.pdf', ajoute_le: '2026-11-26T10:05:00Z' },
      { id: 'av2', nom: 'Avenant 2.pdf', url: '/uploads/av2.pdf', ajoute_le: '2026-11-26T10:01:00Z' },
    ],
    analyse_pieces: { docs: {
      bail: { type: 'bail', extraction: fini, valeurs: { loyer_signature: lu('90 000 € / an HT HC'), indexation: lu('ILC, révision annuelle') } },
      av1: { type: 'avenants', extraction: fini, valeurs: { loyer_signature: lu('96 000 € / an HT HC'), date_avenant: lu('12/03/2025') } },
      av2: { type: 'avenants', extraction: fini, valeurs: { loyer_signature: lu('99 000 € / an HT HC'), date_avenant: lu('01/09/2025') } },
    } },
  });
  const bail = lireAnalyse('BA1').grilles.find((g) => g.id === 'bail');
  const ligne = (id) => bail.lignes.find((l) => l.id === id);
  assert.equal(ligne('loyer_signature').valeur, '99 000 € / an HT HC', "l'avenant le plus récent par sa date, même déposé avant l'autre");
  assert.equal(ligne('loyer_signature').retenue, 'av2');
  assert.equal(ligne('indexation').valeur, 'ILC, révision annuelle', "ce que l'avenant ne dit pas reste lu dans le bail");
});

test("sans date lue, l'avenant déposé le plus tard passe devant", () => {
  const ordre = [{ id: 'b', type: 'bail' }, { id: 'x', type: 'avenants', ajoute_le: '2026-01-01' }, { id: 'y', type: 'avenants', ajoute_le: '2026-02-01' }].sort((a, b) => ordreBail(a, b, {}));
  assert.deepEqual(ordre.map((d) => d.id), ['y', 'x', 'b']);
});
