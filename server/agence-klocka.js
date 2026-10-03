// L'agence KLOCKA, titulaire de la carte professionnelle : ses mentions
// légales, communes à tous les mandataires. Une seule source, lue aussi par
// l'écran : src/lib/agence-klocka.json.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ici = path.dirname(fileURLToPath(import.meta.url));
export const AGENCE = JSON.parse(fs.readFileSync(path.join(ici, '..', 'src', 'lib', 'agence-klocka.json'), 'utf8'));

/** Pure : la ligne d'identité de l'agence, telle qu'elle s'écrit sur un acte. */
export const identiteAgence = (a = AGENCE) =>
  `${a.denomination}, ${a.forme} au capital de ${a.capital}, ${a.siege}, ${a.rcs}, représentée par ${a.representant}`;
