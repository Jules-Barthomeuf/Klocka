import test from 'node:test';
import assert from 'node:assert/strict';
import { lignesDeFeuille, tauxDeLaZone } from './insee.js';

// La forme du fichier « chomage-zone » de l'INSEE (feuille txcho_ze), réduite à deux zones.
const chaines = '<sst><si><t>Code de la zone d&apos;emploi 2020</t></si><si><t>Libellé</t></si><si><t>1er trimestre 2026</t></si><si><t>2e trimestre 2026</t></si><si><t>Libourne</t></si><si><t>Paris</t></si></sst>';
const feuille = '<sheetData>'
  + '<row r="5"><c r="A5" t="s"><v>0</v></c><c r="B5" t="s"><v>1</v></c><c r="CS5" t="s"><v>2</v></c><c r="CT5" t="s"><v>3</v></c></row>'
  + '<row r="6"><c r="A6" t="str"><v>7516</v></c><c r="B6" t="s"><v>4</v></c><c r="CS6"><v>8</v></c><c r="CT6"><v>8.1</v></c></row>'
  + '<row r="7"><c r="A7" t="str"><v>1109</v></c><c r="B7" t="s"><v>5</v></c><c r="CS7"><v>7.8</v></c><c r="CT7"/></row>'
  + '</sheetData>';

test('le taux d\'une zone est celui de la dernière colonne remplie, avec sa période', () => {
  const lignes = lignesDeFeuille(feuille, chaines);
  assert.deepEqual(tauxDeLaZone(lignes, '7516'), { taux_pct: 8.1, periode: '2e trimestre 2026' });
  assert.deepEqual(tauxDeLaZone(lignes, '1109'), { taux_pct: 7.8, periode: '1er trimestre 2026' });
  assert.equal(tauxDeLaZone(lignes, '9999'), null);
});
