// Le comptage des loyers Klocka et des appels à Data-B (18 oct. 2026, plan de la boîte à outils de Haka).
//
// LECTURE SEULE : la base s'ouvre en `readonly`, rien n'est écrit, aucune table n'est créée. À lancer
// sur Render, dans le shell du service : `npm run comptage-loyers` (ou `node scripts/comptage-loyers.mjs`).
// Options : `--ban` vérifie chaque adresse auprès de la Base Adresse Nationale (lent, une requête par lot) ;
// `--json` rend le résultat en JSON.
//
// Ce qu'il compte :
//   - les lots avec loyer > 0, surface > 0 et adresse géocodable ;
//   - leur répartition par département et par commune (Alpes-Maritimes d'abord), et par année ;
//   - l'origine du loyer : lu dans un bail (réel), saisi à la main, ou annoncé par la fiche de l'agent ;
//   - les appels à Data-B sur 180 jours : les recherches gardées (chaque appel réel en crée une) par
//     produit et par personne, et les routes de l'application qui l'appellent, dans le journal d'audit.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { referencesKlocka, adresseGeocodable } from '../server/loyers-klocka.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = (process.env.KLOCKA_DATA_DIR || '').trim() || path.join(ici, '..', 'server', 'data');
const args = new Set(process.argv.slice(2));
const db = new Database(path.join(DATA_DIR, 'klocka.db'), { readonly: true, fileMustExist: true });

const lire = (entite) => db.prepare('SELECT data, created_date FROM records WHERE entity = ?').all(entite)
  .map((r) => { try { return { ...JSON.parse(r.data), created_date: r.created_date }; } catch { return null; } })
  .filter(Boolean);

const compter = (liste, cle) => {
  const m = new Map();
  for (const x of liste) { const k = cle(x) ?? '—'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]);
};

// --- Les loyers -------------------------------------------------------------
const deals = lire('Deal');
const lots = deals.filter((d) => !d.test).reduce((n, d) => n + (d.lots?.length || 0), 0);
const refs = referencesKlocka(deals);
let avecAdresse = refs.filter((r) => adresseGeocodable(r.adresse));
let banVerifiee = null;
if (args.has('--ban')) {
  const ok = [];
  for (const r of avecAdresse) {
    try {
      const u = `https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(r.adresse.ligne)}`;
      const f = (await (await fetch(u, { signal: AbortSignal.timeout(6000) })).json()).features?.[0];
      if (f && (f.properties?.score ?? 0) >= 0.5 && ['housenumber', 'street'].includes(f.properties?.type)) ok.push(r);
    } catch { /* une adresse non vérifiée ne compte pas */ }
  }
  banVerifiee = ok.length;
  avecAdresse = ok;
}

const parDepartement = compter(avecAdresse, (r) => r.departement);
const amFirst = [...parDepartement.filter(([k]) => k === '06'), ...parDepartement.filter(([k]) => k !== '06')];
const communes06 = compter(avecAdresse.filter((r) => r.departement === '06'), (r) => r.commune);
const autresCommunes = compter(avecAdresse.filter((r) => r.departement !== '06'), (r) => r.commune).slice(0, 15);
const parAnnee = compter(avecAdresse, (r) => (r.le ? String(r.le).slice(0, 4) : null)).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
const parOrigine = compter(avecAdresse, (r) => r.origine);
const origine06 = compter(avecAdresse.filter((r) => r.departement === '06'), (r) => r.origine);

// --- Data-B ------------------------------------------------------------------
const depuis = new Date(Date.now() - 180 * 86400000).toISOString();
const PRODUITS = { DataBRecherche: 'Valeurs locatives', DataBImplantation: 'Implantation (K-Expertise)', DataBTransactions: 'Transactions', DataBMurs: 'Murs (avis de valeur)', ProspectiveDataB: 'Prospective (mandataires)' };
const appels = [];
for (const [entite, produit] of Object.entries(PRODUITS)) {
  for (const x of lire(entite)) {
    const le = x.le || x.created_date;
    if (le && le >= depuis) appels.push({ produit, par: x.par || '(automatique)' });
  }
}
const appelsParProduit = compter(appels, (a) => a.produit);
const appelsParPersonne = compter(appels, (a) => `${a.produit} · ${a.par}`);

// Les routes de l'application qui appellent Data-B (au moins dans un de leurs chemins).
const ROUTES = ['/api/kvaleurlocative', '/api/kexpertise', '/api/ktransactions', '/api/mandataire', '/api/off-market', '/api/alx', '/api/assistant', '/api/projets'];
let audit = [];
try {
  audit = db.prepare(`SELECT email, chemin, count(*) AS n FROM audit WHERE le >= ? AND methode != 'GET' AND (${ROUTES.map(() => 'chemin LIKE ?').join(' OR ')}) GROUP BY email, chemin ORDER BY n DESC LIMIT 60`)
    .all(depuis, ...ROUTES.map((r) => `${r}%`));
} catch (e) { audit = [{ email: '—', chemin: `journal illisible : ${e.message}`, n: 0 }]; }
db.close();

const resultat = {
  base: path.join(DATA_DIR, 'klocka.db'),
  le: new Date().toISOString(),
  loyers: {
    dossiers: deals.filter((d) => !d.test).length,
    lots,
    lots_avec_loyer_et_surface: refs.length,
    lots_avec_loyer_surface_et_adresse: avecAdresse.length,
    verifie_ban: banVerifiee,
    par_departement: amFirst,
    communes_alpes_maritimes: communes06,
    autres_communes: autresCommunes,
    par_annee: parAnnee,
    par_origine: parOrigine,
    origine_alpes_maritimes: origine06,
  },
  data_b_180_jours: { appels_gardes: appels.length, par_produit: appelsParProduit, par_produit_et_personne: appelsParPersonne, routes_audit: audit },
};

if (args.has('--json')) {
  console.log(JSON.stringify(resultat, null, 2));
} else {
  const l = resultat.loyers;
  const t = (paires) => paires.map(([k, n]) => `  ${k} : ${n}`).join('\n') || '  (aucun)';
  console.log(`Comptage en lecture seule — ${resultat.base}\n`);
  console.log(`LOYERS KLOCKA\n  ${l.dossiers} dossiers, ${l.lots} lots ; ${l.lots_avec_loyer_et_surface} avec loyer et surface ; ${l.lots_avec_loyer_surface_et_adresse} avec en plus une adresse géocodable${banVerifiee != null ? ' (vérifiée auprès de la BAN)' : ''}.`);
  console.log(`\nPar département (Alpes-Maritimes d'abord)\n${t(l.par_departement)}`);
  console.log(`\nCommunes des Alpes-Maritimes\n${t(l.communes_alpes_maritimes)}`);
  console.log(`\nAutres communes (15 premières)\n${t(l.autres_communes)}`);
  console.log(`\nPar année de dossier\n${t(l.par_annee)}`);
  console.log(`\nOrigine du loyer (reel = bail lu, saisi = à la main, annonce = fiche de l'agent)\n${t(l.par_origine)}`);
  console.log(`\nOrigine, Alpes-Maritimes\n${t(l.origine_alpes_maritimes)}`);
  const d = resultat.data_b_180_jours;
  console.log(`\nDATA-B, 180 JOURS\n  ${d.appels_gardes} appels réels gardés (un résultat servi du cache ne compte pas).`);
  console.log(`\nPar produit\n${t(d.par_produit)}`);
  console.log(`\nPar produit et par personne\n${t(d.par_produit_et_personne)}`);
  console.log(`\nRoutes de l'application qui peuvent l'appeler (journal d'audit, hors lectures)\n${d.routes_audit.map((a) => `  ${a.email || '—'} ${a.chemin} : ${a.n}`).join('\n') || '  (aucune)'}`);
}
