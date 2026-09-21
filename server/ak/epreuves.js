// Rejoue les épreuves d'AK contre le modèle : `npm run ak:epreuves`.
//
// Chaque épreuve est une demande réelle et ce qu'on attend (outils appelés,
// motifs dans la réponse, longueur). Hors de `npm test` : ça parle au modèle,
// donc ça coûte et ça prend une minute. À lancer avant de toucher la
// consigne, le cadre ou le modèle, et après, pour voir ce qui a bougé.
//
// Les épreuves tournent dans un espace fictif : ce qu'elles créent sur la
// plateforme (un dossier « Essai Épreuve AK ») est retiré à la fin.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

await import('dotenv/config');
const ici = path.dirname(fileURLToPath(import.meta.url));
const { Records } = await import('../db.js');
const { repondre } = await import('./agent.js');
const { epreuves } = JSON.parse(fs.readFileSync(path.join(ici, 'epreuves.json'), 'utf8'));

const seulement = process.argv[2] ? epreuves.filter((e) => e.nom.includes(process.argv[2])) : epreuves;
let rates = 0; let coutTotal = 0;
const debut = Date.now();
const { mesurer } = await import('../llm-couts.js');

for (const e of seulement) {
  const espace = `spaces/EPREUVE-${Date.now()}`;
  const { resultat: r, consommation } = await mesurer({ operation: 'ak-epreuve', par: 'épreuves' }, () => repondre({ texte: e.demande, auteur: { nom: 'users/epreuve', affiche: e.auteur }, espace, fil: null, mentions: [], pieces: [] }));
  coutTotal += consommation?.cout || 0;
  const manques = [];
  for (const o of e.outils || []) if (!r.outils.includes(o)) manques.push(`outil ${o} non appelé`);
  for (const o of e.pas_outils || []) if (r.outils.includes(o)) manques.push(`outil ${o} appelé à tort`);
  for (const m of e.reponse || []) if (!new RegExp(m, 'i').test(r.texte)) manques.push(`réponse sans « ${m} »`);
  for (const m of e.pas_reponse || []) if (new RegExp(m, 'i').test(r.texte)) manques.push(`réponse avec « ${m} »`);
  const lignes = r.texte.split('\n').filter((l) => l.trim()).length;
  if (e.max_lignes && lignes > e.max_lignes) manques.push(`${lignes} lignes, ${e.max_lignes} max`);
  const ok = !manques.length;
  if (!ok) rates += 1;
  console.log(`${ok ? 'ok   ' : 'RATÉ '} ${e.nom}`);
  if (!ok) { for (const m of manques) console.log(`       - ${m}`); console.log(`       outils : ${r.outils.join(', ') || 'aucun'}`); console.log(`       réponse : ${r.texte.replace(/\n/g, ' / ').slice(0, 300)}`); }
}

// Le ménage : ce que les épreuves ont créé.
for (const d of Records.list('Deal').filter((x) => /Essai Épreuve AK/i.test(x.nom || ''))) Records.delete('Deal', d.id);

console.log(`\n${seulement.length - rates} / ${seulement.length} épreuves passées, ${coutTotal.toFixed(2)} €, ${Math.round((Date.now() - debut) / 1000)} s`);
process.exit(rates ? 1 : 0);
