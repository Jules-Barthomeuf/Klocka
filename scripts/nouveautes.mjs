// Écrit server/nouveautes.json au build : les commits des 120 derniers jours
// (date et sujet), que la page Semaine résume en « ce qui a changé dans la
// plateforme ». Sans git (ou un clone sans historique), le fichier reste tel
// quel, et le serveur relit git s'il le peut.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const sortie = execFileSync('git', ['log', '--since=120 days ago', '--format=%cI%x09%s', '--no-merges'], { cwd: racine, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
  const liste = sortie.split('\n').filter(Boolean).map((l) => { const [le, ...s] = l.split('\t'); return { le, sujet: s.join('\t').slice(0, 1500) }; });
  if (liste.length) fs.writeFileSync(path.join(racine, 'server', 'nouveautes.json'), JSON.stringify(liste));
  console.log(`[nouveautes] ${liste.length} commit(s)`);
} catch (e) {
  console.log(`[nouveautes] git indisponible : ${String(e?.message || e).split('\n')[0]}`);
}
