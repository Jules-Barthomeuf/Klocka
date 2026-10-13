// Régénère server/marques-fr.json : les marques présentes en France, tirées du
// name-suggestion-index d'OpenStreetMap (la liste tenue à jour des marques et
// de leurs pays, https://nsi.guide). Sert à la diapositive Enseignes des
// présentations bancaires (server/enseignes-autour.js) : un commerce ouvert
// autour du local, lu sur Google Maps, n'est retenu que si son nom est celui
// d'une marque de cette liste.
//
//   node scripts/marques-fr.mjs [version]
//
// Une marque est gardée si sa zone comprend la France, l'Europe ou le monde
// (et ne l'exclut pas), dans les catégories de commerces et de services ; les
// distributeurs, bornes, cabines photo, consignes et parkings sont écartés.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const version = process.argv[2] || 'latest';
const url = `https://cdn.jsdelivr.net/npm/name-suggestion-index@${version}/dist/json/nsi.min.json`;
const ZONES = new Set(['fr', 'fx', '001', '150', '155', 'eu']);
const ECARTEES = /\/(atm|vending_machine|charging_station|parcel_locker|post_box|bicycle_rental|car_sharing|parking|telephone|recycling|bureau_de_change|payment_terminal|money_transfer|photo_booth)$/;

const r = await fetch(url);
if (!r.ok) throw new Error(`name-suggestion-index : ${r.status}`);
const { nsi, _meta } = await r.json();
const marques = [];
const vues = new Set();
for (const [categorie, { items = [] }] of Object.entries(nsi)) {
  if (!categorie.startsWith('brands/') || ECARTEES.test(categorie)) continue;
  for (const it of items) {
    const inc = (it.locationSet?.include || []).map((x) => String(x).toLowerCase());
    const exc = (it.locationSet?.exclude || []).map((x) => String(x).toLowerCase());
    if (!inc.some((z) => ZONES.has(z)) || exc.includes('fr')) continue;
    const nom = it.tags?.brand || it.displayName;
    const cle = `${nom}|${it.tags?.['brand:wikidata'] || ''}`;
    if (!nom || vues.has(cle)) continue;
    vues.add(cle);
    marques.push({
      n: nom,
      w: it.tags?.['brand:wikidata'] || null,
      c: categorie.replace(/^brands\//, ''),
      ...(it.matchNames?.length ? { m: it.matchNames } : {}),
      ...(inc.includes('fr') ? { fr: 1 } : {}),
    });
  }
}
const sortie = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'marques-fr.json');
fs.writeFileSync(sortie, JSON.stringify({ source: 'name-suggestion-index (OpenStreetMap)', version: _meta?.version || version, le: new Date().toISOString().slice(0, 10), marques }));
console.log(`${marques.length} marques écrites dans ${sortie}`);
