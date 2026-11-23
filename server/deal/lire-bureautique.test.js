// Les documents de bureau qu'une fiche peut prendre (22 nov. 2026) : Excel, PowerPoint, OpenDocument, Word 97.
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { lireXlsx, lirePptx, lireOdf, lireDoc, estTableur } from './lire-bureautique.js';
import { ingerer } from './ingest.js';
import { estUneFiche } from './fiches-auto.js';

const zipDe = async (fichiers) => { const z = new JSZip(); for (const [n, c] of Object.entries(fichiers)) z.file(n, c); return z.generateAsync({ type: 'nodebuffer' }); };

test('Excel : chaque ligne du classeur, cellules partagées et nombres, colonnes vides gardées', async () => {
  const buf = await zipDe({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Biens" sheetId="1"/></sheets></workbook>',
    'xl/sharedStrings.xml': '<sst><si><t>Adresse</t></si><si><t>Prix</t></si><si><t>12 rue Foch &amp; angle</t></si><si><r><t>Montpel</t></r><r><t>lier</t></r></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>380000</v></c></row></sheetData></worksheet>',
  });
  const { texte, lignes } = await lireXlsx(buf);
  assert.equal(texte, '# Biens\nAdresse\t\tPrix\n12 rue Foch & angle\tMontpellier\t380000');
  assert.equal(lignes, 1);
  const ing = await ingerer({ buffer: buf, filename: 'stock.xlsx' });
  assert.equal(ing.source, 'tableur');
  assert.ok(estTableur('stock.xlsx') && estTableur('liste.csv') && !estTableur('fiche.pdf'));
});

test('PowerPoint et OpenDocument : le texte, diapositive par diapositive ; un tableau ODS en lignes', async () => {
  const pptx = await zipDe({
    'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Loyer : 44 892 €</a:t></a:r></a:p></p:sld>',
    'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Carrefour </a:t></a:r><a:r><a:t>Pont Juvénal</a:t></a:r></a:p></p:sld>',
  });
  assert.equal((await lirePptx(pptx)).texte, '# Diapositive 1\nCarrefour Pont Juvénal\n\n# Diapositive 2\nLoyer : 44 892 €');
  const ods = await zipDe({ 'content.xml': '<office:document-content><table:table><table:table-row><table:table-cell><text:p>3 rue Foch</text:p></table:table-cell><table:table-cell><text:p>250000</text:p></table:table-cell></table:table-row></table:table></office:document-content>' });
  assert.equal((await lireOdf(ods)).texte, '3 rue Foch\t250000');
});

test('Word 97 : les suites de texte du binaire, en UTF-16', () => {
  const texte = 'Murs commerciaux à vendre, 12 rue Foch à Montpellier, prix 380 000 € net vendeur.';
  const binaire = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0x7f, 0x80]), Buffer.from(texte, 'utf16le'), Buffer.from([0, 0, 0xff, 0xfe, 0x12])]);
  assert.match(lireDoc(binaire).texte, /12 rue Foch à Montpellier, prix 380 000 € net vendeur/);
});

test('une fiche en Excel, PowerPoint ou OpenDocument est reconnue comme fiche dans un mail', () => {
  for (const nom of ['Fiche murs Lyon.pptx', 'Liste biens à vendre.xlsx', 'Teaser.odt', 'Présentation.odp']) assert.ok(estUneFiche(nom), nom);
  assert.ok(!estUneFiche('Facture octobre.xlsx'));
});
