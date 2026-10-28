// Les colonnes des vues Twenty, dans l'ordre des tableaux Monday (27 oct. 2026, Jules : « le bon ordre de colonnes »).
// Un champ créé par l'API n'entre pas dans les vues de son objet, et Twenty y met ses colonnes système en tête : les
// fiches importées semblaient vides, puis en désordre. Pour chaque objet de crm/schema.json, dans toutes ses vues
// tableau et dans sa fiche :
//   1. le nom, puis le Groupe (scripts/crm/groupes-twenty.mjs) ;
//   2. les colonnes dans l'ordre du tableau Monday ; une relation (« … (fiche) ») juste après le texte de son lien ;
//      miroirs et formules à leur place ;
//   3. les autres champs ajoutés ensuite (les liens qui arrivent d'autres objets) ;
//   4. masqués en fin : création, modification, id et groupe Monday.
//   node scripts/crm/vues-twenty.mjs [nomDObjet]
// Rejouable : seules les colonnes mal placées ou masquées à tort sont touchées.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
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

const dernier = fs.readdirSync('exports-prives').filter((d) => /^monday-\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const exportSchema = JSON.parse(fs.readFileSync(path.join('exports-prives', dernier, 'schema.json'), 'utf8'));
const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
const twenty = await objetsTwenty();
const vues = await tout('/metadata/views', 'views');
const colonnes = await tout('/metadata/viewFields', 'viewFields');

const MASQUES = ['createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'mondayId', 'mondayGroupe', 'mondayCreeLe'];
const JAMAIS = new Set(['id', 'position', 'searchVector', 'deletedAt', 'timelineActivities', 'favorites', 'attachments', 'noteTargets', 'taskTargets']);

/** Pure : l'ordre voulu des champs d'un objet, [{ nom, visible }]. */
function ordreVoulu(o, meta) {
  const parNom = new Map((meta.fields || []).map((f) => [f.name, f]));
  const parLabel = new Map((meta.fields || []).filter((f) => f.isCustom).map((f) => [f.label, f]));
  const ordre = [];
  const place = new Set();
  const poser = (f, visible = true) => {
    if (!f || place.has(f.name) || JAMAIS.has(f.name) || f.type === 'TS_VECTOR') return;
    place.add(f.name);
    ordre.push({ f, visible });
  };
  poser(parNom.get('name'));
  poser(parNom.get('groupe'));
  const champParColonne = new Map(o.champs.filter((c) => c.mondayColonne).map((c) => [c.mondayColonne, c.name]));
  const colonnesMonday = exportSchema.tableaux.find((t) => String(t.id) === o.mondayTableau)?.columns || [];
  for (const c of colonnesMonday) {
    const nom = champParColonne.get(c.id);
    if (nom) poser(parNom.get(nom));
    // Miroir ou formule : le champ texte qui porte son titre ; un lien : sa relation « … (fiche) » juste après.
    if (c.type === 'mirror' || c.type === 'formula') poser(parLabel.get(c.title));
    if (c.type === 'board_relation') poser(parLabel.get(`${c.title} (fiche)`));
  }
  for (const c of o.champs) if (!c.systeme) poser(parNom.get(c.name));
  for (const f of (meta.fields || []).filter((x) => x.isCustom && x.isActive !== false && !MASQUES.includes(x.name))) poser(f);
  for (const nom of MASQUES) poser(parNom.get(nom), false);
  return ordre;
}

let touchees = 0;
for (const o of objets.filter((x) => !seul || x.nameSingular === seul)) {
  const meta = twenty.find((x) => x.nameSingular === o.nameSingular);
  const voulu = ordreVoulu(o, meta);
  // Les vues tableau (Twenty en crée parfois une seconde « All … ») et la fiche (FIELDS_WIDGET).
  for (const vue of vues.filter((v) => v.objectMetadataId === meta?.id && (v.type === 'TABLE' || v.type === 'FIELDS_WIDGET'))) {
    const dans = new Map(colonnes.filter((c) => c.viewId === vue.id).map((c) => [c.fieldMetadataId, c]));
    let n = 0;
    for (const [i, { f, visible }] of voulu.entries()) {
      const vf = dans.get(f.id);
      // Dans une fiche, le nom est déjà le titre : Twenty ne le liste pas, on n'y touche pas.
      if (vue.type === 'FIELDS_WIDGET' && f.name === 'name') continue;
      if (!vf) {
        await requeteTwenty('POST', '/metadata/viewFields', { viewId: vue.id, fieldMetadataId: f.id, position: i, isVisible: visible, size: f.type === 'TEXT' && /remarque|note|commentaire|description/i.test(f.label) ? 280 : 160 });
        n++;
      } else if (vf.position !== i || vf.isVisible !== visible) {
        await requeteTwenty('PATCH', `/metadata/viewFields/${vf.id}`, { position: i, isVisible: visible });
        n++;
      }
    }
    // Ce qui reste dans la vue sans être dans l'ordre voulu (champs système de Twenty) : en fin, masqué.
    const voulus = new Set(voulu.map((x) => x.f.id));
    let fin = voulu.length;
    for (const vf of [...dans.values()].filter((x) => !voulus.has(x.fieldMetadataId))) {
      if (vf.isVisible || vf.position < voulu.length) {
        await requeteTwenty('PATCH', `/metadata/viewFields/${vf.id}`, { position: fin++, isVisible: false });
        n++;
      }
    }
    touchees += n;
    console.log(`${o.labelPlural.padEnd(32)} ${vue.type === 'FIELDS_WIDGET' ? 'fiche ' : 'tableau'} « ${vue.name} » : ${n} colonne(s) replacée(s)`);
  }
}
console.log(`\n${touchees} colonne(s) replacée(s) en tout`);
