// La sauvegarde de Monday dans la plateforme (25 nov. 2026) : server/crm/sauvegarde-monday.js.
//   node scripts/crm/sauvegarde-monday.mjs                                    relit Monday, garde tout, fichiers compris
//   node scripts/crm/sauvegarde-monday.mjs --export exports-prives/monday-2026-11-25 [--fichiers]
//        garde un export déjà fait, sans relire Monday ; --fichiers télécharge aussi ses pièces jointes
import 'dotenv/config';
import path from 'node:path';
import { sauvegarderMonday, chargerExport } from '../../server/crm/sauvegarde-monday.js';

const args = process.argv.slice(2);
const dossier = args.includes('--export') ? args[args.indexOf('--export') + 1] : null;
const etat = dossier
  ? await chargerExport(path.resolve(dossier), { fichiers: args.includes('--fichiers') })
  : await sauvegarderMonday();
console.log(JSON.stringify(etat, null, 2));
