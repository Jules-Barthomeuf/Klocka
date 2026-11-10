// Le test du loyer de marché par les loyers réels (10 nov. 2026), ville par ville, sur les grandes villes.
//
// Le fichier de chaque ville est celui que la prospection télécharge chaque nuit (exporterAnnoncesVente) ; il est
// gardé dans --dossier pour ne pas le redemander. Pour chaque mur vendu loué, on le retire, on prédit son loyer avec
// les autres (server/loyers-reels.js, même local republié exclu), et on mesure l'écart. Puis le verdict : un loyer
// gonflé ou baissé de 30 % ou de 50 % est-il vu ? Rien n'est écrit en base.
//
//   node --env-file=.env scripts/loyers-reels-test.mjs [--villes=Paris,Lyon] [--dossier=chemin] [--csv=chemin]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const VILLES = (args.villes || 'Paris,Marseille,Lyon,Toulouse,Nice,Nantes,Montpellier,Strasbourg,Bordeaux,Lille').split(',').map((v) => v.trim()).filter(Boolean);
const DOSSIER = args.dossier || path.join(ici, '..', 'server', 'data', 'loyers-reels-test');
const CSV = args.csv || path.join(ici, '..', 'docs', 'plans', 'loyers-reels-resultats.csv');

const { lireXlsx } = await import('../server/xlsx.js');
const L = await import('../server/loyers-reels.js');
const { distanceM } = await import('../server/valeur-locative-comparables.js');

const mediane = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
fs.mkdirSync(DOSSIER, { recursive: true });

async function fichierDe(ville) {
  const f = path.join(DOSSIER, `${ville}.xlsx`);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const { exporterAnnoncesVente, fermerNavigateurEquimmox } = await import('../server/equimmox.js');
  const r = await exporterAnnoncesVente(ville);
  await fermerNavigateurEquimmox();
  if (!r.ok || !r.buffer) throw new Error(r.error || 'aucune annonce');
  fs.writeFileSync(f, r.buffer);
  return r.buffer;
}

const lignes = [];
for (const ville of VILLES) {
  try {
    const export_ = lireXlsx(await fichierDe(ville));
    const commerces = export_.filter((l) => String(l['asset class'] || '').toLowerCase() === 'commercial');
    const refs = L.sansDoublons(L.referencesDeLExport(export_, { ville }));
    const recentes = refs.filter((r) => !r.publie_le || Date.parse(r.publie_le) >= Date.now() - L.AGE_MAX_ANS * 365.25 * 86400000);
    const ecarts = []; const vus = { h30: 0, b30: 0, h50: 0, b50: 0, juste: 0 };
    for (const r of recentes) {
      const autres = recentes.filter((o) => o !== r && !(distanceM(o.point, r.point) <= 60 && Math.abs(o.surface - r.surface) <= 3));
      const p = L.loyerDeMarche({ ...r.point, surface: r.surface }, autres);
      if (!p.valeur) continue;
      ecarts.push(Math.abs(p.valeur / r.loyer_m2 - 1) * 100);
      const v = (f) => L.verdict(r.loyer_m2 * f, p.valeur).verdict;
      if (v(1) === 'dans la moyenne') vus.juste++;
      if (v(1.3) === 'au-dessus') vus.h30++;
      if (v(0.7) === 'en dessous') vus.b30++;
      if (v(1.5) === 'au-dessus') vus.h50++;
      if (v(0.5) === 'en dessous') vus.b50++;
    }
    const n = ecarts.length;
    lignes.push({
      ville, annonces: export_.length, commerces: commerces.length, avec_loyer: refs.length, recentes: recentes.length, couverts: n, couverts_pct: pct(n, recentes.length),
      ecart_median: n ? Math.round(mediane(ecarts) * 10) / 10 : null, a15: pct(ecarts.filter((e) => e <= 15).length, n), a25: pct(ecarts.filter((e) => e <= 25).length, n),
      dans_la_moyenne: pct(vus.juste, n), vu_plus30: pct(vus.h30, n), vu_moins30: pct(vus.b30, n), vu_plus50: pct(vus.h50, n), vu_moins50: pct(vus.b50, n),
      plafond_export: export_.length >= 1000,
    });
    console.log(`${ville} : ${refs.length} loyers réels, ${n} prédits`);
  } catch (e) { console.log(`${ville} : ${e.message}`); }
}

console.log('\nVille          annonces  murs loués récents  prédits   écart médian  à 15 %  à 25 %   juste « moyenne »  +30 % vu  -30 % vu  +50 % vu  -50 % vu');
for (const l of lignes) {
  console.log(`${l.ville.padEnd(14)} ${String(l.annonces).padStart(8)}${l.plafond_export ? '*' : ' '} ${String(l.recentes).padStart(18)}  ${String(l.couverts).padStart(7)}   ${String(l.ecart_median ?? '-').padStart(10)} %  ${String(l.a15).padStart(4)} %  ${String(l.a25).padStart(4)} %   ${String(l.dans_la_moyenne).padStart(14)} %  ${String(l.vu_plus30).padStart(6)} %  ${String(l.vu_moins30).padStart(6)} %  ${String(l.vu_plus50).padStart(6)} %  ${String(l.vu_moins50).padStart(6)} %`);
}
console.log('* export plafonné à 1 000 annonces par Equimmox : la ville n\'est pas lue en entier.');

const colonnes = Object.keys(lignes[0] || {});
fs.mkdirSync(path.dirname(CSV), { recursive: true });
fs.writeFileSync(CSV, [colonnes.join(';'), ...lignes.map((l) => colonnes.map((c) => String(l[c] ?? '').replace('.', ',')).join(';'))].join('\n'), 'utf8');
console.log(`\nTableau : ${CSV}`);
process.exit(0);
