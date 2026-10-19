// La vérification de K-Vacance (19 oct. 2026). Trois commandes :
//   npm run vacance:verifier -- retro                     le rétro-test des signaux, sur les communes chargées
//   npm run vacance:verifier -- echantillon "<adresse>"   écrit la feuille de terrain (docs/validation/…csv)
//   npm run vacance:verifier -- evaluer <feuille.csv>     lit la feuille remplie : précision, faux occupés, taux corrigé
// Lecture seule pour `retro` et `evaluer`. `echantillon` appelle K-Vacance (comme la page) et écrit un fichier.
import fs from 'node:fs';
import path from 'node:path';
const [commande, argument] = process.argv.slice(2);
process.env.BOITE_OUTILS = process.env.BOITE_OUTILS || '1';
const V = await import('../server/outils-kd/vacance-verif.js');

if (commande === 'retro') {
  const { default: db } = await import('../server/db.js');
  const signaux = db.prepare("SELECT type_signal AS type, date_signal AS date, siret FROM vacance_signal WHERE source = 'bodacc' AND siret IS NOT NULL").all();
  const etat = new Map();
  const lignes = db.prepare('SELECT siret, etat, date_debut FROM entrepot_sirene WHERE siret IN (' + '(SELECT DISTINCT siret FROM vacance_signal WHERE siret IS NOT NULL)' + ')').all();
  for (const l of lignes) etat.set(l.siret, { etat: l.etat, date_fin: l.etat === 'F' ? l.date_debut : null });
  for (const delai of [180, 365]) {
    const r = V.retroTest(signaux, etat, { delaiJours: delai });
    console.log(`\nSignaux d'au moins ${delai} jours, ${signaux.length} signaux BODACC en base, ${r.sans_etablissement} sans établissement connu au stock`);
    for (const [type, x] of Object.entries(r.par_type)) console.log(`  ${type.padEnd(13)} ${String(x.n).padStart(4)} signaux, ${String(x.fermes).padStart(4)} suivis d'une fermeture : ${x.pct} % [${x.bas} à ${x.haut}]${x.delai_median_mois != null ? `, délai médian ${x.delai_median_mois} mois` : ''}`);
  }
} else if (commande === 'echantillon') {
  const { vacanceDeLAdresse } = await import('../server/outils-kd/vacance.js');
  const { tauxDeVacance } = await import('../server/outils/vacance-taux.js');
  const { resoudreLocal } = await import('../server/socle/local.js');
  const rayon = Number(process.argv[4]) || 400;
  const l = await resoudreLocal(argument);
  if (!l.ok) { console.error(l.error); process.exit(1); }
  const r = await vacanceDeLAdresse(argument, { rayon });
  if (!r.ok) { console.error(r.error); process.exit(1); }
  const t = await tauxDeVacance({ commune: l.local.adresse.code_insee, lat: l.local.point.lat, lon: l.local.point.lon, rayon_m: rayon });
  if (!t.ok) { console.error(`Le taux ne s'est pas calculé : ${t.error || 'erreur inconnue'}`); process.exit(1); }
  const ech = V.echantillonner(t.locaux);
  const nom = `k-vacance-${(l.local.adresse.ville || 'zone').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}`;
  fs.mkdirSync('docs/validation', { recursive: true });
  fs.writeFileSync(path.join('docs/validation', `${nom}.csv`), V.feuilleCsv(ech, { commune: l.local.adresse.ville, date: new Date().toISOString().slice(0, 10) }));
  fs.writeFileSync(path.join('docs/validation', `${nom}.zone.json`), JSON.stringify({ adresse: l.local.adresse.label, rayon_m: rayon, vacants: t.taux.vacants, occupes: t.taux.occupes, incertains: t.taux.incertains, taux: t.taux.taux, le: new Date().toISOString() }, null, 1));
  console.log(`Zone : ${l.local.adresse.label}, ${rayon} m : ${t.taux.locaux} locaux, ${t.taux.vacants} vacants (${t.taux.taux} %), ${t.taux.incertains} incertains.`);
  console.log(`Feuille : docs/validation/${nom}.csv (${ech.length} lignes : ${ech.filter((x) => x.etat === 'vacant').length} vacants, ${ech.filter((x) => x.etat === 'occupe').length} occupés, ${ech.filter((x) => x.etat === 'incertain').length} incertains)`);
} else if (commande === 'evaluer') {
  const lignes = V.lireFeuille(fs.readFileSync(argument, 'utf8'));
  let zone = null;
  try { const z = JSON.parse(fs.readFileSync(argument.replace(/\.csv$/, '.zone.json'), 'utf8')); zone = { vacants: z.vacants, occupes: z.occupes, incertains: z.incertains }; } catch { /* sans les effectifs de la zone, pas de taux corrigé */ }
  const e = V.evaluerFeuille(lignes, zone);
  const p = (w) => (w.n ? `${w.pct} % [${w.bas} à ${w.haut}] sur ${w.n}` : 'pas de constat');
  console.log(`Constats lus : ${e.constats} sur ${e.lignes} lignes`);
  console.log(`Précision des « vacants »  : ${p(e.precision_vacants)}`);
  console.log(`« Occupés » en réalité vides : ${p(e.faux_occupes)}`);
  console.log(`« Incertains » en réalité vides : ${p(e.incertains_vides)}`);
  if (e.taux_corrige) console.log(`Taux de vacance : outil ${e.taux_corrige.taux_outil} %, corrigé ${e.taux_corrige.taux_corrige} % [${e.taux_corrige.bas} à ${e.taux_corrige.haut}]`);
} else {
  console.log('Usage : retro | echantillon "<adresse>" [rayon] | evaluer <feuille.csv>');
}
process.exit(0);
