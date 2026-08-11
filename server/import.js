// Import real Base44 data exports into the local SQLite database.
//
// Usage:
//   node server/import.js <path>
//
// <path> can be:
//   - a directory containing one JSON file per entity, named "<Entity>.json"
//     (e.g. Project.json, ClientCRM.json), each holding an array of records;
//   - a single JSON file that is either an array (with --entity <Name>) or an
//     object mapping { "Project": [...], "ClientCRM": [...], ... }.
//
// Records keep their original id/created_date/updated_date when present.
// Existing records with the same id are updated; new ones are inserted.

import fs from 'fs';
import path from 'path';
import { Records } from './db.js';

function importArray(entity, arr) {
  let created = 0;
  let updated = 0;
  for (const rec of arr) {
    if (rec && rec.id && Records.get(entity, rec.id)) {
      Records.update(entity, rec.id, rec);
      updated++;
    } else {
      Records.create(entity, rec);
      created++;
    }
  }
  console.log(`  ${entity}: +${created} créés, ${updated} mis à jour`);
}

function main() {
  const target = process.argv[2];
  const entityFlagIdx = process.argv.indexOf('--entity');
  const entityFlag = entityFlagIdx !== -1 ? process.argv[entityFlagIdx + 1] : null;

  if (!target) {
    console.error('Usage: node server/import.js <dossier|fichier.json> [--entity <Nom>]');
    process.exit(1);
  }

  const stat = fs.statSync(target);

  if (stat.isDirectory()) {
    const files = fs.readdirSync(target).filter((f) => f.endsWith('.json'));
    if (!files.length) {
      console.error('Aucun fichier .json trouvé dans le dossier.');
      process.exit(1);
    }
    console.log(`Import depuis le dossier ${target}:`);
    for (const f of files) {
      const entity = path.basename(f, '.json');
      const data = JSON.parse(fs.readFileSync(path.join(target, f), 'utf-8'));
      const arr = Array.isArray(data) ? data : data.records || data.items || [];
      importArray(entity, arr);
    }
  } else {
    const data = JSON.parse(fs.readFileSync(target, 'utf-8'));
    if (Array.isArray(data)) {
      if (!entityFlag) {
        console.error('Un tableau JSON nécessite --entity <Nom>.');
        process.exit(1);
      }
      console.log(`Import ${entityFlag} depuis ${target}:`);
      importArray(entityFlag, data);
    } else {
      console.log(`Import multi-entités depuis ${target}:`);
      for (const [entity, arr] of Object.entries(data)) {
        if (Array.isArray(arr)) importArray(entity, arr);
      }
    }
  }
  console.log('Import terminé.');
}

main();
