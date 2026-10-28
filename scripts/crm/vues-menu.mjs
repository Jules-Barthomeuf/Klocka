// Les vues d'un tableau visibles dans la barre de gauche de Twenty, juste sous le tableau (28 oct. 2026, Jules : « au
// lieu de devoir cliquer sur All… je veux voir les autres vues »). Twenty 2.51 ne sait pas mettre les vues en onglets
// à côté de « All … » (seulement un menu déroulant) ; sa barre de gauche, elle, accepte une vue comme entrée. Pour chaque
// tableau rangé dans un dossier de la barre (Klocka, KPartners, Autres), chaque vue tableau autre que la vue principale
// et sa copie « All … » devient une entrée sous lui, dans l'ordre des vues.
//   node scripts/crm/vues-menu.mjs
// Rejouable : une vue déjà dans la barre n'est pas ajoutée deux fois. À relancer après avoir créé des vues.
import 'dotenv/config';
import crypto from 'node:crypto';
import { twentyConfigure, requeteTwenty } from '../../server/twenty.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants dans .env');
  process.exit(1);
}

async function gql(query, variables) {
  await new Promise((r) => setTimeout(r, 700));
  const r = await fetch(`${String(process.env.TWENTY_URL).replace(/\/+$/, '')}/metadata`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const d = await r.json();
  if (d.errors?.length) throw new Error(JSON.stringify(d.errors[0]).slice(0, 300));
  return d.data;
}

const vues = [];
let apres = null;
for (let i = 0; i < 50; i++) {
  const r = await requeteTwenty('GET', `/metadata/views?limit=200${apres ? `&starting_after=${apres}` : ''}`);
  vues.push(...(Array.isArray(r?.data) ? r.data : r?.data?.views || []));
  if (!r?.pageInfo?.hasNextPage) break;
  apres = r.pageInfo.endCursor;
}
const { navigationMenuItems: entrees } = await gql('{ navigationMenuItems { id type viewId folderId targetObjectMetadataId position userWorkspaceId } }');
const dejaLa = new Set(entrees.filter((e) => e.viewId).map((e) => e.viewId));

const nouvelles = [];
for (const objet of entrees.filter((e) => e.type === 'OBJECT' && e.folderId && !e.userWorkspaceId)) {
  const siennes = vues
    .filter((v) => v.objectMetadataId === objet.targetObjectMetadataId && v.type !== 'FIELDS_WIDGET' && v.key !== 'INDEX' && !/^All /.test(v.name) && v.isActive !== false)
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
  // Entre le tableau (position n) et le suivant (n + 1).
  siennes.forEach((v, k) => {
    if (!dejaLa.has(v.id)) nouvelles.push({ id: crypto.randomUUID(), type: 'VIEW', viewId: v.id, folderId: objet.folderId, position: objet.position + (k + 1) / (siennes.length + 1), nom: v.name });
  });
}

if (nouvelles.length) await gql('mutation($i: [CreateNavigationMenuItemInput!]!) { createManyNavigationMenuItems(inputs: $i) { id } }', { i: nouvelles.map(({ nom: _nom, ...e }) => e) });
for (const e of nouvelles) console.log(`+ ${e.nom}`);
console.log(`${nouvelles.length} vue(s) ajoutée(s) à la barre de gauche`);
