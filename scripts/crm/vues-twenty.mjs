// Les colonnes des vues Twenty (27 oct. 2026) : un champ créé par l'API n'entre pas dans la vue tableau de son objet,
// les fiches importées semblaient vides. Ajoute à la vue par défaut de chaque objet de crm/schema.json tous ses
// champs, dans l'ordre des colonnes Monday, visibles ; les champs techniques (mondayId…) en fin de vue, masqués.
//   node scripts/crm/vues-twenty.mjs [nomDObjet]
// Rejouable : une colonne déjà dans la vue est laissée telle qu'elle est (taille, ordre choisis à la main).
import 'dotenv/config';
import fs from 'node:fs';
import { twentyConfigure, objetsTwenty, requeteTwenty } from '../../server/twenty.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants dans .env');
  process.exit(1);
}
const seul = process.argv[2] || null;
const liste = (r, cle) => (Array.isArray(r?.data) ? r.data : r?.data?.[cle] || []);
// L'API metadata rend 200 éléments par page au plus et ignore le filtre : on lit toutes les pages.
async function tout(chemin, cle) {
  const out = [];
  let apres = null;
  for (let i = 0; i < 200; i++) {
    const r = await requeteTwenty('GET', `${chemin}?limit=200${apres ? `&starting_after=${apres}` : ''}`);
    out.push(...liste(r, cle));
    if (!r?.pageInfo?.hasNextPage) break;
    apres = r.pageInfo.endCursor;
  }
  return out;
}
const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
const twenty = await objetsTwenty();
const vues = await tout('/metadata/views', 'views');
const colonnes = await tout('/metadata/viewFields', 'viewFields');

for (const o of objets.filter((x) => !seul || x.nameSingular === seul)) {
  const meta = twenty.find((x) => x.nameSingular === o.nameSingular);
  // Toutes les vues tableau : Twenty en crée parfois une seconde « All … » avec les seules colonnes système.
  for (const vue of vues.filter((v) => v.objectMetadataId === meta?.id && v.type === 'TABLE')) {
  const dans = new Map(colonnes.filter((c) => c.viewId === vue.id).map((c) => [c.fieldMetadataId, c]));
  let position = Math.max(0, ...colonnes.filter((c) => c.viewId === vue.id).map((c) => c.position ?? 0)) + 1;
  let ajoutees = 0;
  for (const c of o.champs) {
    const f = (meta.fields || []).find((x) => x.name === c.name);
    if (!f) continue;
    const deja = dans.get(f.id);
    if (deja) {
      // Déjà dans la vue mais masquée (Twenty y met les champs créés après coup) : on l'affiche.
      if (!deja.isVisible && !c.systeme) {
        await requeteTwenty('PATCH', `/metadata/viewFields/${deja.id}`, { isVisible: true, position: position++ });
        ajoutees++;
      }
      continue;
    }
    await requeteTwenty('POST', '/metadata/viewFields', { viewId: vue.id, fieldMetadataId: f.id, position: position++, isVisible: !c.systeme, size: f.type === 'TEXT' && c.mondayType === 'long_text' ? 280 : 160 });
    ajoutees++;
  }
  console.log(`${o.labelPlural.padEnd(32)} ${ajoutees} colonne(s) affichée(s) dans « ${vue.name} »${vue.key === 'INDEX' ? ' (principale)' : ''}`);
  }
}
