// Fabrique index.html : la page d'accueil de Twenty (modele.html) avec klocka.js dedans, à la place de <!-- KLOCKA -->.
// Un seul fichier servi : Twenty relit la page à chaque chargement, et le script part avec elle.
//   node crm/twenty-front/assembler.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const modele = fs.readFileSync(path.join(ici, 'modele.html'), 'utf8');
const script = fs.readFileSync(path.join(ici, 'klocka.js'), 'utf8');
if (modele.split('<!-- KLOCKA -->').length !== 2) throw new Error('modele.html doit contenir une seule fois <!-- KLOCKA -->');
if (script.includes('</script')) throw new Error('klocka.js ne doit pas contenir </script');
const page = modele.replace('<!-- KLOCKA -->', () => `<!-- Klocka : crm/twenty-front/klocka.js -->\n    <script>\n${script}</script>\n`);
fs.writeFileSync(path.join(ici, 'index.html'), page);
console.log(`index.html : ${page.length} caractères`);
