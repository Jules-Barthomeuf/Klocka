// Le groupe « Mémoire » de Propriétés Klocka (8 nov. 2026, Jules) : les fiches reçues, à part des annonces.
// Rejouable : rien n'est créé deux fois.
//   node scripts/crm/memoire-klocka-twenty.mjs
import 'dotenv/config';
import { twentyConfigure, objetsTwenty, modifierChamp } from '../../server/twenty.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants');
  process.exit(1);
}
const o = (await objetsTwenty()).find((x) => x.nameSingular === 'proprietesKlocka');
const groupe = (o?.fields || []).find((f) => f.name === 'groupe');
if (!groupe) throw new Error('Propriétés Klocka sans champ groupe');
if ((groupe.options || []).some((x) => x.value === 'MEMOIRE')) console.log('= groupe « Mémoire » déjà là');
else {
  await modifierChamp(groupe.id, { options: [...groupe.options, { value: 'MEMOIRE', label: 'Mémoire', color: 'gray', position: groupe.options.length }] });
  console.log('+ groupe « Mémoire »');
}
