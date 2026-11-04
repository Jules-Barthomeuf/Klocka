// Les bureaux vides (3 nov. 2026, Jules : « montre juste les bureaux où l'entreprise occupante a bougé dans un autre
// local, c'est un bon indicateur pour savoir quels bureaux sont vides ; simplifie »).
//
// Un seul signal : un établissement de bureau fermé à son adresse depuis moins d'un an, alors que la même société a
// ouvert un autre établissement ailleurs dans les six mois avant (ou après) : elle a déménagé, ses anciens bureaux sont
// libres. La source est le stock SIRENE de l'INSEE (fermetures datées, SIREN, adresse, coordonnées), chargé dans
// `entrepot_sirene` pour les départements des secteurs des mandataires, une fois par mois.
//
// Un bureau, c'est un local où travaillent des salariés, en étage (4 nov. 2026, Jules : « Shibuko, c'est de la
// restauration : s'ils partent, ce ne sont pas des bureaux » ; « fais le maximum »). Écartés :
// - les établissements de moins de trois salariés (tranche d'effectif SIRENE) : le consultant chez lui, le siège d'une
//   société sans bureaux (un restaurant domicilié chez son fondateur) ;
// - les entrepreneurs individuels et les holdings (64.20Z : une adresse de gestion) ;
// - les vitrines : agence immobilière, banque, courtier en assurance, agence d'intérim, ou un complément d'adresse
//   « RDC » : un local de pied d'immeuble qui se vide est un mur libre, pas un bureau ;
// - les adresses de domiciliation (plus de DOMICILIATION établissements à la même adresse : une boîte aux lettres).
//
// Chaque bureau trouvé devient (ou complète) un CommerceSimple de classe `bureau`, fermé, avec `demenagement` : la carte,
// le tableau et la fiche de la Prospection le lisent comme les autres. Lancé seul dans un processus à part, comme la
// date d'ouverture des commerces (le stock fait 3 Go). BUREAUX_VIDES=0 le coupe.

import db, { Records, Meta } from './db.js';
import { NAF_BUREAU, NAF_COMMERCE, activiteHorsCommerce } from './off-market/simple.js';

const COMMERCE = 'CommerceSimple';
const ETAT = 'bureaux-vides';
const UN_MOIS = 30 * 86400000;
const DOMICILIATION = 40;
// Les tranches d'effectif de l'INSEE à partir de trois salariés, et leur mot.
export const EFFECTIFS = { '02': '3 à 5 salariés', '03': '6 à 9 salariés', 11: '10 à 19 salariés', 12: '20 à 49 salariés', 21: '50 à 99 salariés', 22: '100 à 199 salariés', 31: '200 à 249 salariés', 32: '250 à 499 salariés', 41: '500 à 999 salariés', 42: '1 000 à 1 999 salariés', 51: '2 000 à 4 999 salariés', 52: '5 000 à 9 999 salariés', 53: '10 000 salariés et plus' };
// Les bureaux de vitrine : ceux que la Prospection range déjà en commerce de pied d'immeuble, et l'intérim.
const VITRINES = new Set([...NAF_COMMERCE, '78.20Z']);
export const CODES_BUREAU = NAF_BUREAU.filter((c) => !VITRINES.has(c) && c !== '64.20Z');
/** Pure : un complément d'adresse qui dit le rez-de-chaussée. */
export const auRezDeChaussee = (complement) => /\b(RDC|R\.D\.C|REZ[\s-]*DE[\s-]*CHAUSS)/i.test(String(complement || ''));
// Les communes à arrondissements : SIRENE les donne par arrondissement, Klocka par ville.
const COMMUNES_DE_VILLE = (code) => (code === '69123' ? Array.from({ length: 9 }, (_, i) => `6938${i + 1}`)
  : code === '13055' ? Array.from({ length: 16 }, (_, i) => `132${String(i + 1).padStart(2, '0')}`)
  : code === '75056' ? Array.from({ length: 20 }, (_, i) => `751${String(i + 1).padStart(2, '0')}`) : [code]);
const departementDe = (code) => (/^97/.test(code) ? code.slice(0, 3) : code.slice(0, 2));

/** Les villes Klocka des secteurs des mandataires, avec leur code INSEE. */
async function villesDesSecteurs() {
  const { villesDuMandataire } = await import('./mandataire-prospecter.js');
  const parId = new Map();
  for (const s of Records.list('SecteurMandataire').filter((x) => x.mandataire_email)) {
    const { fiches } = await villesDuMandataire(s, { etats: false });
    for (const v of fiches) if (v.code_insee) parId.set(v.id, v);
  }
  return [...parId.values()];
}

/** Pure : l'adresse lisible d'une ligne de l'entrepôt. */
export const adresseDe = (r) => [[r.numero, r.indice, r.type_voie, r.voie].filter(Boolean).join(' '), [r.code_postal, r.libelle_commune].filter(Boolean).join(' ')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/**
 * Les déménagements d'une liste de communes, lus dans l'entrepôt : le bureau fermé et le nouvel établissement.
 * `maintenant` pour les tests.
 */
export function demenagements(communes, { maintenant = new Date() } = {}) {
  if (!communes.length) return [];
  const depuis = new Date(maintenant.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const codes = CODES_BUREAU;
  const tranches = Object.keys(EFFECTIFS);
  const q = (n) => Array(n).fill('?').join(',');
  return db.prepare(`
    SELECT f.*, n.siret AS n_siret, n.numero AS n_numero, n.indice AS n_indice, n.type_voie AS n_type_voie, n.voie AS n_voie,
      n.code_postal AS n_code_postal, n.libelle_commune AS n_libelle_commune, n.date_creation AS n_date_creation
    FROM entrepot_sirene f
    JOIN entrepot_sirene n ON n.siren = f.siren AND n.etat = 'A' AND n.siret <> f.siret
      AND n.date_creation >= date(f.date_debut, '-6 months') AND n.date_creation <= date(f.date_debut, '+6 months')
      AND NOT (n.commune = f.commune AND IFNULL(n.voie, '') = IFNULL(f.voie, '') AND IFNULL(n.numero, '') = IFNULL(f.numero, ''))
    WHERE f.etat = 'F' AND f.date_debut >= ? AND f.commune IN (${q(communes.length)}) AND f.naf IN (${q(codes.length)})
      AND IFNULL(f.categorie_juridique, '') NOT LIKE '1%' AND f.x IS NOT NULL AND f.tranche_effectifs IN (${q(tranches.length)})
      AND (SELECT COUNT(*) FROM entrepot_sirene a WHERE a.commune = f.commune AND IFNULL(a.voie, '') = IFNULL(f.voie, '') AND IFNULL(a.numero, '') = IFNULL(f.numero, '')) <= ?
    ORDER BY f.siret, n.date_creation DESC`).all(depuis, ...communes, ...codes, ...tranches, DOMICILIATION)
    .filter((r, i, t) => (i === 0 || t[i - 1].siret !== r.siret) && !auRezDeChaussee(r.complement_adresse));
}

/** Pose les déménagements trouvés sur les bureaux de la Prospection. Rend le nombre posé. */
export async function poser({ maintenant = new Date() } = {}) {
  const { lambert93VersWgs84 } = await import('./insee-sirene.js');
  let n = 0;
  const gardes = new Set();
  for (const v of await villesDesSecteurs()) {
    for (const r of demenagements(COMMUNES_DE_VILLE(v.code_insee), { maintenant })) {
      const point = lambert93VersWgs84(r.x, r.y);
      if (!point) continue;
      gardes.add(r.siret);
      const demenagement = {
        ferme_le: r.date_debut, source: 'SIRENE (INSEE)', effectif: EFFECTIFS[r.tranche_effectifs] || null, etage: r.complement_adresse || null,
        vers: { siret: r.n_siret, adresse: adresseDe({ numero: r.n_numero, indice: r.n_indice, type_voie: r.n_type_voie, voie: r.n_voie, code_postal: r.n_code_postal, libelle_commune: r.n_libelle_commune }), ouvert_le: r.n_date_creation },
      };
      const ancien = Records.findBy(COMMERCE, 'siret', r.siret);
      if (ancien) { Records.update(COMMERCE, ancien.id, { actif: false, demenagement }, { garderDate: !!ancien.demenagement }); n += 1; continue; }
      const nom = r.denomination || r.denomination_usuelle || r.enseigne || 'Société';
      Records.create(COMMERCE, {
        ville_id: v.id, source: 'SIRENE (INSEE)', siret: r.siret, siren: r.siren, nom, enseigne: r.enseigne || null, ape: r.naf,
        activite: activiteHorsCommerce(r.naf), adresse: adresseDe(r), numero: r.numero || null, code_postal: r.code_postal || null,
        ville: v.nom, lat: point.lat, lon: point.lon, depuis: r.date_creation || null, ouvert_le: r.date_creation || null, actif: false, chaine: false,
        classe: 'bureau', demenagement, etat_recherche: 'a_faire', cree_le: new Date().toISOString(),
      });
      n += 1;
    }
  }
  // Ceux posés avant et qui ne passent plus (une règle resserrée le 4 nov. 2026, un départ de plus d'un an) perdent leur
  // signal ; la fiche reste, comme toute donnée.
  for (const c of Records.champs(COMMERCE, ['siret', 'demenagement.ferme_le']).filter((x) => x['demenagement.ferme_le'] && !gardes.has(x.siret))) {
    Records.update(COMMERCE, c.id, { demenagement: null }, { garderDate: false });
  }
  return n;
}

/**
 * L'effectif et le complément d'adresse des bureaux fermés chargés avant le 4 nov. 2026 (l'entrepôt ne les gardait pas) :
 * une lecture du stock national, seulement pour eux. Un vide se note '' : lu, rien à dire.
 */
export async function completerEffectifs({ surProgres = null } = {}) {
  const q = (n) => Array(n).fill('?').join(',');
  const aLire = new Set(db.prepare(`SELECT siret FROM entrepot_sirene WHERE etat = 'F' AND tranche_effectifs IS NULL AND date_debut >= date('now', '-13 months') AND naf IN (${q(CODES_BUREAU.length)})`).all(...CODES_BUREAU).map((r) => r.siret));
  if (!aLire.size) return { lus: 0 };
  const { dernierStock, lireLigneCsv, sansEnteteZip } = await import('./socle/imports/sirene-stock.js');
  const { morceauxReprenables, siretDeLigne } = await import('./ouverture-commerces.js');
  const stock = await dernierStock();
  const { Readable } = await import('stream');
  const zlib = (await import('zlib')).default;
  const readline = (await import('readline')).default;
  const inflate = zlib.createInflateRaw();
  Readable.from(morceauxReprenables(stock.url, { surProgres })).on('error', (e) => inflate.destroy(e))
    .pipe(sansEnteteZip()).on('error', (e) => inflate.destroy(e)).pipe(inflate);
  const lignes = readline.createInterface({ input: inflate, crlfDelay: Infinity });
  let erreur = null;
  inflate.on('error', (e) => { erreur = e; });
  const maj = db.prepare('UPDATE entrepot_sirene SET tranche_effectifs = ?, complement_adresse = ? WHERE siret = ?');
  let entetes = null, iT = -1, iC = -1, lues = 0, poses = 0, lot = [];
  const vider = () => { if (!lot.length) return; const l = lot; lot = []; db.transaction(() => { for (const v of l) maj.run(...v); })(); poses += l.length; };
  try {
    for await (const ligne of lignes) {
      if (!entetes) { entetes = lireLigneCsv(ligne); iT = entetes.indexOf('trancheEffectifsEtablissement'); iC = entetes.indexOf('complementAdresseEtablissement'); continue; }
      lues += 1;
      if (lues % 5_000_000 === 0) surProgres?.(`${(lues / 1e6).toFixed(0)} millions de lignes lues, ${poses + lot.length} bureaux complétés`);
      const siret = siretDeLigne(ligne);
      if (!siret || !aLire.has(siret)) continue;
      const c = lireLigneCsv(ligne);
      lot.push([c[iT] || '', c[iC] || '', siret]);
      if (lot.length >= 500) vider();
    }
    if (erreur) throw erreur;
  } finally { vider(); }
  if (iT < 0 || iC < 0) throw new Error("Le stock n'a plus les colonnes d'effectif et de complément d'adresse.");
  return { lus: poses, sur: aLire.size };
}

/** Charge le stock des départements des secteurs (une fois par mois chacun), puis pose les déménagements. */
export async function mettreAJour({ force = false } = {}) {
  const { importerSireneStock } = await import('./socle/imports/sirene-stock.js');
  const deps = [...new Set((await villesDesSecteurs()).map((v) => departementDe(v.code_insee)))].sort();
  const charges = [];
  for (const dep of deps) {
    const m = db.prepare('SELECT MAX(millesime) AS m FROM entrepot_sirene WHERE departement = ?').get(dep)?.m;
    const aJour = m && Date.now() - Date.parse(m) < UN_MOIS
      && db.prepare("SELECT 1 FROM entrepot_sirene WHERE departement = ? AND categorie_juridique IS NOT NULL LIMIT 1").get(dep);
    if (aJour && !force) continue;
    console.log(`[bureaux-vides] stock SIRENE du ${dep}`);
    const r = await importerSireneStock({ departement: dep, surProgres: (t) => console.log(`[bureaux-vides] ${dep} : ${t}`) });
    charges.push(`${dep} (${r.lignes})`);
  }
  const effectifs = await completerEffectifs({ surProgres: (t) => console.log(`[bureaux-vides] effectifs : ${t}`) });
  const poses = await poser();
  Meta.set(ETAT, JSON.stringify({ le: new Date().toISOString(), departements: deps, charges, effectifs, poses }));
  return { departements: deps, charges, poses };
}

// Lancé seul (`node server/bureaux-vides.js`) : dans son propre processus, jamais dans celui du serveur.
const { pathToFileURL } = await import('url');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mettreAJour({ force: process.argv.includes('--force') })
    .then((r) => { console.log(`[bureaux-vides] ${r.poses} bureaux vides · départements ${r.departements.join(', ')}${r.charges.length ? ` · chargés ${r.charges.join(', ')}` : ''}`); process.exit(0); })
    .catch((e) => { console.warn('[bureaux-vides]', e?.message || e); process.exit(1); });
}
