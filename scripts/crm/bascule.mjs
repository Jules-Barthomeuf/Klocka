// La bascule vers Twenty CRM (prévue le lundi 2 novembre 2026, Jules) : Klocka n'écrit plus que dans Twenty CRM.
//   1. dernier export complet de Monday (scripts/crm/export-monday.mjs), gardé comme archive ;
//   2. les webhooks Monday retirés : ceux de la synchronisation (crm/webhooks-monday.json) et ceux du Layer
//      (statut et commentaires sur Agent immobilier et Propriétés), le Layer suivant Twenty CRM depuis le 28 oct. ;
//   3. CRM=twenty sur le service Klocka de Render, déploiement, attente de « live ».
// Monday garde tout (rien n'y est supprimé) ; Jules le passe en lecture seule à la main. Retour possible : CRM=double
// et `node scripts/crm/synchro-monday.mjs` pour reposer les webhooks.
//   node scripts/crm/bascule.mjs        (montre ce qui serait fait)
//   node scripts/crm/bascule.mjs --go   (le fait)
import 'dotenv/config';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

process.env.CRM = 'monday';
const M = await import('../../server/monday.js');
const go = process.argv.includes('--go');
const SERVICE = 'srv-da1d45ojo6nc738dmc0g';
const RENDER = (process.env.RENDER_API_KEY || '').trim();
if (!M.mondayConfigure() || !RENDER) {
  console.error('MONDAY_TOKEN / RENDER_API_KEY manquants');
  process.exit(1);
}
const render = async (methode, chemin, corps) => {
  const r = await fetch(`https://api.render.com/v1${chemin}`, { method: methode, headers: { Authorization: `Bearer ${RENDER}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
  if (!r.ok) throw new Error(`Render ${chemin} : ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};
const dire = (x) => console.log(`${go ? '' : '(à faire) '}${x}`);

// 1. L'archive.
dire('dernier export de Monday dans exports-prives/');
if (go) execSync('node scripts/crm/export-monday.mjs', { stdio: 'inherit' });

// 2. Les webhooks Monday.
const notes = JSON.parse(fs.readFileSync('crm/webhooks-monday.json', 'utf8'));
const LAYER = { agents: (process.env.MONDAY_BOARD_AGENTS || '').trim(), proprietes: (process.env.MONDAY_BOARD_PROPRIETES || process.env.MONDAY_BOARD_ECARTES || '').trim() };
const aRetirer = [];
for (const [tableau, parEvenement] of Object.entries(notes)) for (const id of Object.values(parEvenement)) aRetirer.push({ tableau, id });
for (const tableau of Object.values(LAYER).filter(Boolean)) {
  const nos = new Set(Object.values(notes[tableau] || {}));
  for (const w of await M.webhooksDuTableau(tableau)) if (!nos.has(String(w.id)) && ['change_status_column_value', 'create_update'].includes(w.event)) aRetirer.push({ tableau, id: String(w.id), layer: true });
}
dire(`${aRetirer.length} webhook(s) Monday retirés (dont ${aRetirer.filter((x) => x.layer).length} du Layer)`);
if (go) {
  for (const w of aRetirer) {
    try { await M.requeteMonday('mutation ($id: ID!) { delete_webhook(id: $id) { id } }', { id: w.id }); } catch (e) { console.warn(`  webhook ${w.id} : ${e.message}`); }
  }
}

// 3. CRM=twenty, déploiement, « live ».
dire('CRM=twenty sur Render, puis déploiement de Klocka');
if (go) {
  await render('PUT', `/services/${SERVICE}/env-vars/CRM`, { value: 'twenty' });
  const d = await render('POST', `/services/${SERVICE}/deploys`, { clearCache: 'do_not_clear' });
  for (let i = 0; i < 90; i++) {
    const s = (await render('GET', `/services/${SERVICE}/deploys/${d.id}`)).status;
    if (s === 'live') { console.log('Klocka est en ligne en CRM=twenty : la bascule est faite.'); break; }
    if (/fail|canceled/.test(s)) throw new Error(`déploiement ${s} : remettre CRM=double`);
    await new Promise((ok) => setTimeout(ok, 10000));
  }
}
if (!go) console.log('Rien n’a été fait. Relancer avec --go le jour de la bascule.');
