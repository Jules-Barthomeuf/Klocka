// Le test K-Data contre Data-B, valeur locative à la rue (9 nov. 2026, Jules : « un tableau de résultats complet
// avec valeur Data-B et valeur K-Data »).
//
// LECTURE SEULE sur la base. Pour chaque lecture Data-B gardée (DataBRecherche) : on retrouve la rue dans le stock
// SIRENE, on calcule ses caractéristiques, on apprend le coefficient de rue sur une part des rues (80 % par défaut)
// et on le vérifie sur le reste. La valeur du quartier est celle de Data-B : on isole ainsi ce que ce module fait,
// la modulation de rue. Sortie : le résumé par ville à l'écran, le tableau complet en CSV.
//
//   node scripts/kdata-valeur-locative-test.mjs [--part=0.8] [--lambda=1] [--graine=7] [--csv=chemin] [--villes=Nice,Cannes]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const PART = Math.min(0.95, Math.max(0.5, Number(args.part) || 0.8));
const LAMBDA = Number(args.lambda) || 1;
const GRAINE = Number(args.graine) || 7;
const CSV = args.csv || path.join(ici, '..', 'docs', 'plans', 'kdata-valeur-locative-resultats.csv');
const VILLES = args.villes ? new Set(String(args.villes).split(',').map((v) => v.trim().toLowerCase())) : null;
// `--cible=ville` : le coefficient se mesure par rapport à la ville (ce que Data-B fait, analyse du 9 nov. 2026) ; `quartier` : l'ancienne lecture.
const CIBLE = args.cible === 'quartier' ? 'quartier' : 'ville';
// `--modele=voisins` (k plus proches voisins sur les six mesures retenues, défaut ; `--toutes=1` : les 27), `arbres` (boostés), `mixte` ou `lineaire`.
const MODELE = ['lineaire', 'arbres', 'mixte'].includes(args.modele) ? args.modele : 'voisins';
const ARBRES = { arbres: Number(args.arbres) || 300, profondeur: Number(args.profondeur) || 4, pas: Number(args.pas) || 0.05, minFeuille: Number(args.minFeuille) || 8 };
const KV = Number(args.k) || 15;
const PONDERER = args.ponderer !== '0';
const MEME_COMMUNE = args.memeCommune === '1';
// `--plis=5` : validation croisée, chaque rue prédite par un modèle qui ne l'a pas vue ; `--plis=0` : un seul partage.
const PLIS = args.plis === undefined ? 5 : Number(args.plis) || 0;

const { Records } = await import('../server/db.js');
const K = await import('../server/outils-kd/valeur-locative-kdata.js');
const V = await import('../server/outils-kd/voirie-bdtopo.js');
// `--voirie=0` : sans la voirie BD TOPO ; sinon chaque commune est téléchargée une fois puis lue sur disque.
const VOIRIE = args.voirie !== '0';

const centre = (n) => (n && n.basse && n.haute ? (n.basse + n.haute) / 2 : null);
const cp = (a) => String(a || '').match(/\b(\d{5})\b/)?.[1] || null;
const pct = (a, b) => (a && b ? ((a - b) / b) * 100 : null);
const f1 = (x) => (x == null ? '' : (Math.round(x * 10) / 10).toLocaleString('fr-FR'));

// Un tirage reproductible (xorshift) : la même graine redonne le même partage.
let g = GRAINE >>> 0 || 7;
const alea = () => { g ^= g << 13; g >>>= 0; g ^= g >>> 17; g ^= g << 5; g >>>= 0; return g / 4294967296; };

// 1. Les lectures Data-B, une par rue (toutes les adresses d'une rue portent la même valeur).
// `--lectures=fichier.json` : les lectures de production (GET /api/kdata/lectures-datab), ajoutées à celles d'ici.
const brutes = [...Records.list('DataBRecherche')];
if (args.lectures) {
  const vues = new Set(brutes.map((r) => String(r.adresse).toLowerCase()));
  for (const r of JSON.parse(fs.readFileSync(args.lectures, 'utf8')).lectures || []) if (!vues.has(String(r.adresse).toLowerCase())) { vues.add(String(r.adresse).toLowerCase()); brutes.push(r); }
}
const lectures = brutes.map((r) => ({ adresse: r.adresse, cp: cp(r.adresse), ...(r.resultat || {}) }))
  .filter((r) => r.rue && r.quartier && r.ville && centre(r.rue) && centre(r.quartier) && centre(r.ville));
const parRue = new Map();
for (const r of lectures) {
  if (VILLES && !VILLES.has(String(r.ville.nom).toLowerCase())) continue;
  const commune = K.communeDuCodePostal(r.cp);
  if (!commune) continue;
  const cle = `${commune}|${r.rue.nom}`.toLowerCase();
  if (!parRue.has(cle)) parRue.set(cle, { ...r, commune, adresses: [] });
  parRue.get(cle).adresses.push(r.adresse);
}

// 2. La voirie des communes (BD TOPO), puis les caractéristiques de chaque rue.
if (VOIRIE) {
  const communes = [...new Set([...parRue.values()].map((r) => r.commune))];
  for (const c of communes) {
    try { const v = await V.chargerVoirie(c); process.stderr.write(`voirie ${c} : ${v.length} voies\n`); } catch (e) { process.stderr.write(`voirie ${c} : ${e.message}\n`); }
  }
}
const rues = [];
let sansSirene = 0;
for (const r of parRue.values()) {
  const c = K.caracteristiquesRue(r.commune, r.rue.nom);
  if (!c) { sansSirene += 1; continue; }
  rues.push({ ...r, carac: c, base: centre(CIBLE === 'ville' ? r.ville : r.quartier), cible: Math.log(centre(r.rue) / centre(CIBLE === 'ville' ? r.ville : r.quartier)) });
}

// 3. Partage apprentissage / test, apprentissage, prédiction.
const melange = [...rues];
for (let i = melange.length - 1; i > 0; i -= 1) { const j = Math.floor(alea() * (i + 1)); [melange[i], melange[j]] = [melange[j], melange[i]]; }
const exemplesDe = (liste) => liste.map((r) => ({ valeurs: r.carac.valeurs, cible: r.cible, commune: r.commune }));
const apprendreSur = (liste) => (MODELE === 'mixte' ? K.apprendreMixte(exemplesDe(liste), { arbres: ARBRES, voisins: { k: KV, ponderer: PONDERER } })
  : MODELE === 'arbres' ? K.apprendreArbres(exemplesDe(liste), ARBRES)
  : MODELE === 'voisins' ? K.apprendreVoisins(exemplesDe(liste), { k: KV, ponderer: PONDERER, memeCommune: MEME_COMMUNE, poidsFixes: args.toutes === '1' ? null : K.POIDS_VOISINS }) : K.apprendre(exemplesDe(liste), { lambda: LAMBDA }));
// Les jeux : en validation croisée, chaque pli est le test d'un modèle appris sur les autres ; sinon un partage 80/20.
const jeux = [];
if (PLIS >= 2) {
  for (let f = 0; f < PLIS; f += 1) {
    const test = melange.filter((_, i) => i % PLIS === f);
    const app = melange.filter((_, i) => i % PLIS !== f);
    jeux.push({ nom: 'test', liste: test, modele: apprendreSur(app) });
  }
} else {
  const nApp = Math.round(melange.length * PART);
  const app = melange.slice(0, nApp);
  const m = apprendreSur(app);
  jeux.push({ nom: 'apprentissage', liste: app, modele: m }, { nom: 'test', liste: melange.slice(nApp), modele: m });
}
const modele = jeux[jeux.length - 1].modele;
const app = PLIS >= 2 ? melange : jeux[0].liste;
const test = PLIS >= 2 ? melange : jeux[1].liste;

// `--classes=1` : la prédiction ramenée à la classe de Data-B la plus proche (les coefficients vus en apprentissage).
const CLASSES = args.classes === '1';
const classesDe = (liste) => { const n = new Map(); for (const r of liste) { const c = Math.round(Math.exp(r.cible) * 100) / 100; n.set(c, (n.get(c) || 0) + 1); } return [...n].filter(([, x]) => x >= liste.length * 0.02).map(([c]) => c); };
const lignes = [];
for (const { nom: jeu, liste, modele: mod } of jeux) {
  const cl = CLASSES ? classesDe(melange.filter((x) => !liste.includes(x) || jeu === 'apprentissage')) : null;
  for (const r of liste) {
    let k = K.coefficient(mod, r.carac.valeurs, { commune: r.commune });
    if (cl?.length) k = cl.reduce((b, c) => (Math.abs(Math.log(c / k)) < Math.abs(Math.log(b / k)) ? c : b), cl[0]);
    const dataB = centre(r.rue);
    const kdata = Math.round(r.base * k);
    const sansModele = Math.round(r.base);
    lignes.push({
      jeu, ville: r.ville.nom, quartier: r.quartier.nom, rue: r.rue.nom, voie_sirene: r.carac.brut.voie, adresses: r.adresses.length,
      ville_centre: Math.round(centre(r.ville)), quartier_centre: Math.round(centre(r.quartier)), base: CIBLE, datab_basse: r.rue.basse, datab_haute: r.rue.haute, datab_centre: Math.round(dataB),
      kdata_centre: kdata, kdata_basse: K.fourchette(kdata).basse, kdata_haute: K.fourchette(kdata).haute,
      ecart_pct: pct(kdata, dataB), ecart_sans_modele_pct: pct(sansModele, dataB), coefficient: k, coefficient_datab: dataB / r.base,
      vitrines: r.carac.brut.vitrines, actifs: r.carac.brut.actifs, fermees_3_ans: r.carac.brut.fermees_3_ans, numeros: r.carac.brut.numeros, vitrines_250m: r.carac.brut.vitrines_250m, vitrines_600m: r.carac.brut.vitrines_600m, distance_coeur_m: r.carac.brut.distance_coeur_m,
      voie_bdtopo: r.carac.brut.voirie || '', importance: r.carac.brut.importance, longueur_m: r.carac.brut.longueur_m, part_pieton: r.carac.brut.part_pieton,
    });
  }
}

// 4. Le résumé : écart médian absolu, part à 15 % près, par jeu puis par ville (jeu de test).
const mediane = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const resume = (liste) => {
  const e = liste.map((l) => Math.abs(l.ecart_pct));
  const e0 = liste.map((l) => Math.abs(l.ecart_sans_modele_pct));
  return { n: liste.length, mediane: mediane(e), a15: liste.length ? Math.round((100 * e.filter((x) => x <= 15).length) / liste.length) : null, a25: liste.length ? Math.round((100 * e.filter((x) => x <= 25).length) / liste.length) : null, mediane_sans_modele: mediane(e0), a15_sans_modele: liste.length ? Math.round((100 * e0.filter((x) => x <= 15).length) / liste.length) : null };
};

console.log(`Lectures Data-B : ${lectures.length} · rues distinctes : ${parRue.size} · retrouvées dans SIRENE : ${rues.length} · sans SIRENE : ${sansSirene}`);
console.log(PLIS >= 2 ? `Validation croisée en ${PLIS} plis : les ${test.length} rues prédites hors apprentissage · graine ${GRAINE} · coefficient rapporté à la ${CIBLE} · modèle ${MODELE}${MODELE === 'arbres' ? ` (${ARBRES.arbres} arbres, profondeur ${ARBRES.profondeur})` : ''}${MODELE === 'voisins' ? ` (k=${KV}${PONDERER ? ', pondéré' : ''}${MEME_COMMUNE ? ', même ville' : ''})` : ''}\n` : `Apprentissage : ${app.length} rues · test : ${test.length} rues · λ = ${LAMBDA} · graine ${GRAINE} · coefficient rapporté à la ${CIBLE} · modèle ${MODELE}\n`);
if (modele.type === 'mixte') console.log(`Mixte : moyenne géométrique des arbres boostés et des voisins, appris sur ${modele.n} rues`);
else if (modele.type === 'arbres') console.log(`Arbres boostés : ${modele.arbres} arbres de profondeur ${modele.profondeur}, pas ${modele.pas}, appris sur ${modele.n} rues`);
else if (modele.type === 'voisins') console.log(`Modèle par voisins : k = ${modele.k}, ${modele.n} rues gardées · poids des mesures dans la distance : ` + modele.noms.map((n, i) => `${n}=${(Math.round(modele.poids[i] * 100) / 100).toLocaleString('fr-FR')}`).join(' '));
else {
  console.log('Poids appris (caractéristiques centrées-réduites) :');
  console.log('  ' + modele.noms.map((n, i) => `${n}=${(Math.round(modele.poids[i + 1] * 1000) / 1000).toLocaleString('fr-FR')}`).join('  '));
}
console.log('');
const entete = ['Jeu / ville', 'Rues', 'Écart médian', '≤ 15 %', '≤ 25 %', `Sans modèle (rue = ${CIBLE}) médian`, 'Sans modèle ≤ 15 %'];
const tableau = [];
for (const jeu of PLIS >= 2 ? ['test'] : ['apprentissage', 'test']) { const s = resume(lignes.filter((l) => l.jeu === jeu)); tableau.push([jeu, s.n, `${f1(s.mediane)} %`, `${s.a15} %`, `${s.a25} %`, `${f1(s.mediane_sans_modele)} %`, `${s.a15_sans_modele} %`]); }
const villes = [...new Set(lignes.filter((l) => l.jeu === 'test').map((l) => l.ville))];
for (const v of villes.sort()) {
  const s = resume(lignes.filter((l) => l.jeu === 'test' && l.ville === v));
  if (s.n >= 10) tableau.push([`  test · ${v}`, s.n, `${f1(s.mediane)} %`, `${s.a15} %`, `${s.a25} %`, `${f1(s.mediane_sans_modele)} %`, `${s.a15_sans_modele} %`]);
}
const largeurs = entete.map((h, i) => Math.max(h.length, ...tableau.map((t) => String(t[i]).length)));
const ligne = (t) => t.map((c, i) => String(c).padEnd(largeurs[i])).join('  ');
console.log(ligne(entete)); console.log(largeurs.map((w) => '-'.repeat(w)).join('  ')); tableau.forEach((t) => console.log(ligne(t)));

// 5. Le CSV complet.
const colonnes = Object.keys(lignes[0] || {});
const csv = [colonnes.join(';'), ...lignes.map((l) => colonnes.map((c) => { const v = l[c]; return typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : `"${String(v ?? '').replace(/"/g, '""')}"`; }).join(';'))].join('\n');
fs.mkdirSync(path.dirname(CSV), { recursive: true });
fs.writeFileSync(CSV, csv, 'utf8');
console.log(`\nTableau complet : ${CSV} (${lignes.length} rues)`);
process.exit(0);
