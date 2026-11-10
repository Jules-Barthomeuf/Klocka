// Le test K-Data contre Data-B, valeur de ville (9 nov. 2026, Jules : remplacer Data-B sur la valeur locative).
//
// LECTURE SEULE sur la base, rien n'est demandé à Data-B ni à Equimmox : on compare ce qu'ils ont déjà répondu.
// K-Data = le tarif MAG1 du meilleur secteur de la commune (server/outils-kd/rvllp.js), brut : aucun réglage appris
// sur Data-B. Trois mesures : la ville contre Data-B ; la rue de bout en bout, avec le coefficient de rue du tableau
// `kdata-valeur-locative-resultats.csv` s'il est là ; et l'arbitrage contre les baux Equimmox aux mêmes adresses.
// Réseau : géocodage et fichiers publics, gardés sur disque pour les fichiers.
//
//   node scripts/kdata-valeur-ville-test.mjs [--categorie=MAG1] [--csv=chemin] [--lectures=fichier.json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const CATEGORIE = args.categorie || 'MAG1';
const CSV = args.csv || path.join(ici, '..', 'docs', 'plans', 'kdata-valeur-ville-resultats.csv');
const CSV_RUES = path.join(ici, '..', 'docs', 'plans', 'kdata-valeur-locative-resultats.csv');

const { Records } = await import('../server/db.js');
const R = await import('../server/outils-kd/rvllp.js');

const centre = (n) => (n && n.basse && n.haute ? (n.basse + n.haute) / 2 : null);
const cp = (a) => String(a || '').match(/\b(\d{5})\b/)?.[1] || null;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ecart = (a, b) => ((a - b) / b) * 100;
const mediane = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const f1 = (x) => (x == null ? '' : (Math.round(x * 10) / 10).toLocaleString('fr-FR'));
const resume = (es) => { const a = es.map(Math.abs); return { n: a.length, mediane: mediane(a), a15: Math.round((100 * a.filter((x) => x <= 15).length) / (a.length || 1)), a25: Math.round((100 * a.filter((x) => x <= 25).length) / (a.length || 1)) }; };
const dire = (nom, s) => console.log(`${nom.padEnd(52)} ${String(s.n).padStart(5)}  écart médian ${f1(s.mediane).padStart(6)} %   à 15 % : ${String(s.a15).padStart(3)} %   à 25 % : ${String(s.a25).padStart(3)} %`);
const json = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };

// 1. Les lectures Data-B, une ligne par ville (Data-B donne une seule valeur par ville).
const brutes = [...Records.list('DataBRecherche')];
if (args.lectures) {
  const vues = new Set(brutes.map((r) => norm(r.adresse)));
  for (const r of JSON.parse(fs.readFileSync(args.lectures, 'utf8')).lectures || []) if (!vues.has(norm(r.adresse))) { vues.add(norm(r.adresse)); brutes.push(r); }
}
const villes = new Map();
for (const r of brutes) {
  const x = r.resultat;
  const c = centre(x?.ville);
  if (!c || !cp(r.adresse)) continue;
  if (!villes.has(x.ville.nom)) villes.set(x.ville.nom, { nom: x.ville.nom, datab: c, lectures: 0, cps: {} });
  const v = villes.get(x.ville.nom);
  v.lectures += 1;
  v.cps[cp(r.adresse)] = (v.cps[cp(r.adresse)] || 0) + 1;
}

// 2. Le code INSEE de chaque ville ; Paris, Lyon et Marseille par arrondissement, comme Data-B.
const BASE_ARRONDISSEMENT = { Paris: 75100, Lyon: 69380, Marseille: 13200 };
async function codeInsee(v) {
  const m = v.nom.match(/^(Paris|Lyon|Marseille) (\d+)/);
  if (m) return String(BASE_ARRONDISSEMENT[m[1]] + Number(m[2]));
  const postal = Object.entries(v.cps).sort((a, b) => b[1] - a[1])[0][0];
  const l = await json(`https://geo.api.gouv.fr/communes?codePostal=${postal}&fields=code,nom,population`);
  return (l.find((x) => norm(x.nom) === norm(v.nom)) || l.sort((a, b) => (b.population || 0) - (a.population || 0))[0])?.code || null;
}

const lignes = [];
for (const v of villes.values()) {
  try {
    const code = await codeInsee(v);
    const k = code ? await R.valeurDeVille(code, { categorie: CATEGORIE }) : null;
    if (!k) { process.stderr.write(`${v.nom} : pas de tarif\n`); continue; }
    lignes.push({ ville: v.nom, code, lectures: v.lectures, datab_centre: v.datab, kdata_centre: k.centre, kdata_basse: k.basse, kdata_haute: k.haute, secteur_max: k.secteur_max, tarif_median: k.tarif_median, sections: k.sections, ecart_pct: ecart(k.centre, v.datab) });
  } catch (e) { process.stderr.write(`${v.nom} : ${e.message}\n`); }
}
lignes.sort((a, b) => b.datab_centre - a.datab_centre);

console.log(`Villes lues par Data-B : ${villes.size} · avec tarif DGFiP : ${lignes.length} · catégorie ${CATEGORIE} · aucun réglage sur Data-B\n`);
console.log('La ville contre Data-B');
dire('Toutes les villes', resume(lignes.map((l) => l.ecart_pct)));
dire('Villes lues au moins 5 fois', resume(lignes.filter((l) => l.lectures >= 5).map((l) => l.ecart_pct)));
console.log('');
for (const l of lignes) console.log(`${l.ville.padEnd(34)} Data-B ${String(Math.round(l.datab_centre)).padStart(5)}   K-Data ${String(l.kdata_centre).padStart(5)}   ${f1(l.ecart_pct).padStart(7)} %   (${l.lectures} lect.)`);

// 3. La rue de bout en bout : la ville K-Data × le coefficient de rue déjà calculé hors apprentissage.
if (fs.existsSync(CSV_RUES)) {
  const brut = fs.readFileSync(CSV_RUES, 'utf8').split('\n');
  const tete = brut[0].split(';').map((x) => x.replace(/"/g, ''));
  const n = (x) => Number(String(x).replace(/\s/g, '').replace(',', '.'));
  const parVille = new Map(lignes.map((l) => [l.ville, l.kdata_centre]));
  const avecDataB = []; const avecKData = [];
  for (const l of brut.slice(1)) {
    const a = l.split(';').map((x) => x.replace(/^"|"$/g, ''));
    const r = Object.fromEntries(tete.map((k, i) => [k, a[i]]));
    const k = parVille.get(r.ville);
    if (!k || !n(r.coefficient)) continue;
    avecDataB.push(ecart(n(r.ville_centre) * n(r.coefficient), n(r.datab_centre)));
    avecKData.push(ecart(k * n(r.coefficient), n(r.datab_centre)));
  }
  console.log('\nLa rue contre Data-B');
  dire('Ville de Data-B × coefficient de rue', resume(avecDataB));
  dire('Ville K-Data × coefficient de rue', resume(avecKData));
}

// 4. L'arbitre : les baux Equimmox déjà lus (classe Commerces) aux adresses que Data-B a aussi lues.
const parAdresse = new Map();
for (const r of brutes) { const c = centre(r.resultat?.rue); if (c) parAdresse.set(norm(r.adresse), c); }
const baux = Records.list('EquimmoxRecherche').filter((r) => r.resultat?.base === 'baux' && r.resultat?.moyenne);
const vuesBaux = new Set();
const arbitre = [];
for (const r of baux) {
  const cle = `${norm(r.adresse)}|${r.resultat.rayon}`;
  if (vuesBaux.has(cle)) continue;
  vuesBaux.add(cle);
  try {
    const g = await json(`https://data.geopf.fr/geocodage/search/?limit=1&q=${encodeURIComponent(r.adresse)}`);
    const f = g.features?.[0];
    if (!f || f.properties.score < 0.6) continue;
    const t = await R.tarifAuPoint(f.properties.citycode, { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], categorie: CATEGORIE });
    if (!t) continue;
    arbitre.push({ adresse: r.adresse, rayon: r.resultat.rayon, baux: r.resultat.moyenne, dgfip: t.tarif, secteur: t.secteur, datab_rue: parAdresse.get(norm(r.adresse)) || null });
  } catch (e) { process.stderr.write(`${r.adresse} : ${e.message}\n`); }
}
console.log('\nContre les baux Equimmox (loyers signés, même adresse)');
dire('Tarif DGFiP au point, toutes les lectures', resume(arbitre.map((a) => ecart(a.dgfip, a.baux))));
const communes = arbitre.filter((a) => a.datab_rue);
dire('Tarif DGFiP, adresses lues aussi par Data-B', resume(communes.map((a) => ecart(a.dgfip, a.baux))));
dire('Rue Data-B, mêmes adresses', resume(communes.map((a) => ecart(a.datab_rue, a.baux))));
console.log(`Rapport médian aux baux : DGFiP ${f1(mediane(communes.map((a) => a.dgfip / a.baux)))} · Data-B ${f1(mediane(communes.map((a) => a.datab_rue / a.baux)))}`);

// 5. Le CSV complet.
const colonnes = Object.keys(lignes[0] || {});
const csv = [colonnes.join(';'), ...lignes.map((l) => colonnes.map((c) => { const v = l[c]; return typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : `"${String(v ?? '').replace(/"/g, '""')}"`; }).join(';'))].join('\n');
fs.mkdirSync(path.dirname(CSV), { recursive: true });
fs.writeFileSync(CSV, csv, 'utf8');
console.log(`\nTableau complet : ${CSV} (${lignes.length} villes)`);
process.exit(0);
