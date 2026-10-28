// Branche la synchronisation Monday ↔ Twenty (28 oct. 2026, Jules ; server/crm/synchro.js, CRM=double).
//   1. le jeton du webhook Monday, CRM_MONDAY_JETON, tiré au premier passage et écrit dans .env (à mettre sur Render) ;
//   2. les webhooks Monday des tableaux migrés (fiche créée, colonne, nom, groupe, commentaire, archivage, suppression,
//      restauration) vers <Klocka>/api/crm/monday. La route doit être en ligne : Monday la vérifie à la création.
// Le sens Twenty → Monday passe par le webhook Twenty de scripts/crm/deplacer-twenty.mjs (créations, modifications,
// suppressions).
//   node scripts/crm/synchro-monday.mjs [https://klocka-unus.onrender.com]
// Rejouable : un webhook déjà posé n'est pas reposé.
import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';

process.env.CRM = 'monday';
const M = await import('../../server/monday.js');
const S = await import('../../server/crm/synchro.js');
if (!M.mondayConfigure()) {
  console.error('MONDAY_TOKEN manquant');
  process.exit(1);
}
const KLOCKA = (process.argv[2] || 'https://klocka-unus.onrender.com').replace(/\/+$/, '');
let jeton = String(process.env.CRM_MONDAY_JETON || '');
if (jeton.length < 24) {
  jeton = crypto.randomBytes(24).toString('hex');
  fs.appendFileSync('.env', `\n# Monday → Klocka : jeton des webhooks de synchronisation (scripts/crm/synchro-monday.mjs)\nCRM_MONDAY_JETON=${jeton}\n`);
  console.log('CRM_MONDAY_JETON tiré et écrit dans .env (à mettre aussi sur Render avant de relancer)');
  process.exit(0);
}
const sonde = await fetch(`${KLOCKA}/api/crm/monday?jeton=${jeton}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: 'essai' }) });
if (!sonde.ok) {
  console.error(`La route ${KLOCKA}/api/crm/monday ne répond pas (${sonde.status}) : déployer Klocka et mettre CRM_MONDAY_JETON sur Render d'abord.`);
  process.exit(1);
}
for (const b of await S.brancherWebhooksMonday(`${KLOCKA}/api/crm/monday?jeton=${jeton}`)) console.log(`${b.tableau.padEnd(32)} ${b.poses} webhook(s) posé(s)`);
