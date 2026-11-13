// Le banc du Marché (12 nov. 2026, Jules : « le plus de tests possibles sur la partie Marché, chaque bloc »).
//   npm run marche:banc              les dossiers qui ont une adresse (10 au plus), les cinq outils chacun
//   npm run marche:banc -- 4         quatre dossiers
// Les outils tournent comme lancements libres (sans dossier) : rien ne change dans les dossiers. Chaque résultat passe
// par le contrôle de server/outils/controle.js ; le banc dit les défauts, et le temps de chaque outil.
import 'dotenv/config';

const n = Number(process.argv[2]) || 10;
const { Records } = await import('../server/db.js');
const { lancerOutils, entreesDuLot, ENTITE, OUTILS } = await import('../server/outils/lancements.js');
const { controlerLancement } = await import('../server/outils/controle.js');

const deals = Records.list('Deal').filter((d) => d.lots?.length).sort((a, b) => String(b.updated_date || '').localeCompare(String(a.updated_date || '')));
const choisis = [];
const vues = new Set();
for (const d of deals) {
  const e = await entreesDuLot(d, 0);
  if (!e.adresse || !/\d/.test(e.adresse) || vues.has(e.adresse)) continue;
  vues.add(e.adresse);
  choisis.push({ deal: d, e });
  if (choisis.length >= n) break;
}

const attendre = async (ids, max = 240) => {
  for (let k = 0; k < max; k += 1) {
    await new Promise((ok) => setTimeout(ok, 1000));
    const ls = ids.map((id) => Records.get(ENTITE, id));
    if (ls.every((l) => l.statut !== 'en_cours')) return ls;
  }
  return ids.map((id) => Records.get(ENTITE, id));
};

const total = { outils: 0, defauts: 0, echecs: 0 };
const parOutil = Object.fromEntries(OUTILS.map((o) => [o.cle, { n: 0, defauts: 0, s: [] }]));
for (const { deal, e } of choisis) {
  console.log(`\n${deal.nom || deal.titre || deal.deal_id} · ${e.adresse}${e.locataire ? ` · ${e.locataire}` : ''}${e.loyer ? ` · loyer ${e.loyer}` : ''}${e.prix ? ` · prix ${e.prix}` : ''}`);
  const t0 = Date.now();
  const ids = lancerOutils(e, {}).map((l) => l.id);
  const ls = await attendre(ids);
  for (const l of ls) {
    // Une copie partagée (Ville, même commune) porte la date de fin de l'original : pas de durée à mesurer.
    const s = l.partage_de ? 0 : Math.round((Date.parse(l.fini_le || new Date().toISOString()) - Date.parse(l.lance_le)) / 1000);
    const d = controlerLancement(l);
    total.outils += 1; total.defauts += d.length; if (l.statut !== 'fini') total.echecs += 1;
    parOutil[l.outil].n += 1; parOutil[l.outil].defauts += d.length; parOutil[l.outil].s.push(s);
    const pts = (l.resultat?.points || []).map((p) => `${p.cle}=${p.statut}`).join(' ');
    console.log(`  ${d.length ? 'KO' : 'ok'} ${l.partage_de ? 'partagé' : `${String(s).padStart(3)} s  `} ${l.outil.padEnd(12)} ${(l.resultat?.statut || l.statut).padEnd(7)} ${pts}`);
    for (const x of d) console.log(`        - ${x}`);
  }
  console.log(`  ${Math.round((Date.now() - t0) / 1000)} s pour les cinq`);
}

console.log(`\n${choisis.length} dossiers · ${total.outils} lancements · ${total.echecs} échecs · ${total.defauts} défauts`);
for (const [k, v] of Object.entries(parOutil)) {
  const s = v.s.sort((a, b) => a - b);
  console.log(`  ${k.padEnd(12)} ${v.n} lancements · ${v.defauts} défauts · médiane ${s[Math.floor(s.length / 2)] ?? '—'} s, max ${s[s.length - 1] ?? '—'} s`);
}
process.exit(0);
