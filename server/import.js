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

// Les exports Base44 sortent parfois en UTF-8 relu comme du Latin-1 :
// « Théo » devient « ThÃ©o ». On répare quand la réinterprétation produit un
// texte valide, sinon on laisse la chaîne intacte.
function reparerEncodage(str) {
  if (typeof str !== 'string' || !/[ÃÂ]/.test(str)) return str;
  try {
    const repare = Buffer.from(str, 'latin1').toString('utf8');
    // Le caractère de remplacement signale une réinterprétation ratée.
    return repare.includes('�') ? str : repare;
  } catch {
    return str;
  }
}

function nettoyerRecord(rec) {
  const out = {};
  for (const [k, v] of Object.entries(rec || {})) out[k] = reparerEncodage(v);
  return out;
}

function importArray(entity, arr) {
  let created = 0;
  let updated = 0;
  let fusionnes = 0;

  // Pour les comptes, l'email est la vraie clé d'identité : deux enregistrements
  // partageant une adresse rendraient la connexion imprévisible.
  const parEmail = new Map();
  if (entity === 'User') {
    for (const u of Records.list('User')) {
      if (u.email) parEmail.set(String(u.email).toLowerCase(), u);
    }
  }

  for (const brut of arr) {
    const rec = nettoyerRecord(brut);
    if (entity === 'User' && rec.email) {
      rec.email = String(rec.email).trim().toLowerCase();
      const existant = parEmail.get(rec.email);
      if (existant) {
        // On conserve l'enregistrement en place (et donc son mot de passe déjà
        // défini), on ne fait qu'actualiser ses informations.
        const { id, mot_de_passe, ...champs } = rec;
        Records.update('User', existant.id, champs);
        fusionnes++;
        continue;
      }
    }

    if (rec.id && Records.get(entity, rec.id)) {
      Records.update(entity, rec.id, rec);
      updated++;
    } else {
      Records.create(entity, rec);
      created++;
      if (entity === 'User' && rec.email) parEmail.set(rec.email, rec);
    }
  }

  const detail = [`+${created} créés`, `${updated} mis à jour`];
  if (fusionnes) detail.push(`${fusionnes} fusionnés sur l'email`);
  console.log(`  ${entity}: ${detail.join(', ')}`);
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
