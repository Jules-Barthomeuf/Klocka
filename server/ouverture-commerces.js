// La date d'ouverture de chaque commerce à son adresse (3 nov. 2026, Jules : « savoir depuis combien de temps un
// commerce est en place, en déduire son bail 3-6-9 et les fonds qui arrivent à échéance »).
//
// Un établissement reçoit un SIRET, et sa date de création, quand il ouvre à une adresse ; un déménagement en crée un
// autre. Cette date (`dateCreationEtablissement`) approche donc le début du bail. Jusqu'ici la Prospection lisait la date
// de début de la période d'activité en cours, que l'INSEE ramène à 2008 pour les établissements plus anciens.
//
// - Les départements dont le stock est déjà en base (entrepot_sirene, le 06) : posée tout de suite, en une requête.
// - Les autres : le stock national de l'INSEE (data.gouv.fr, sans clé), lu une fois en flux, sans rien poser sur le
//   disque ; seuls nos SIRET sont gardés. Refait au plus une fois par mois.
// La date se pose sans changer la date de modification des commerces : les caches de la Prospection la prennent à leur
// recalcul de l'heure. Les commerces lus ensuite la reçoivent à la lecture (alx/commerces.js).

import db, { Records, Meta } from './db.js';

const COMMERCE = 'CommerceSimple';
const ETAT = 'ouvertures-commerces';
const UN_MOIS = 30 * 86400000;
const siretPropre = (s) => String(s || '').replace(/\s/g, '');

/** Pure : une date de création utilisable (jamais le 1900-01-01 des dates inconnues). */
export const dateValable = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !String(d).startsWith('1900') ? String(d) : null);

/** Pure : le SIRET d'une ligne du stock, sans la découper (le troisième champ, quatorze chiffres) ; null sinon. */
export const siretDeLigne = (ligne) => String(ligne || '').slice(0, 40).match(/(?:^|,)(\d{14})(?:,|$)/)?.[1] || null;

/** Pose les dates d'ouverture que le stock en base connaît déjà (le 06). Rend le nombre de commerces datés. */
export function depuisLEntrepot() {
  let n = 0;
  try {
    const lignes = db.prepare(`SELECT r.id AS id, e.date_creation AS d FROM records r JOIN entrepot_sirene e ON e.siret = replace(json_extract(r.data, '$.siret'), ' ', '')
      WHERE r.entity = ? AND json_extract(r.data, '$.ouvert_le') IS NULL`).all(COMMERCE);
    n = poser(lignes.map((l) => [l.id, dateValable(l.d)]).filter(([, d]) => d));
  } catch { /* pas d'entrepôt : rien à poser */ }
  return n;
}

function poser(paires) {
  const maj = db.prepare("UPDATE records SET data = json_set(data, '$.ouvert_le', ?) WHERE entity = ? AND id = ?");
  db.transaction(() => { for (const [id, d] of paires) maj.run(d, COMMERCE, id); })();
  return paires.length;
}

/**
 * Lit le stock national une fois et pose la date d'ouverture de nos commerces qui n'en ont pas. `url` pour les essais.
 * Le SIRET est le troisième champ de chaque ligne ; on ne découpe la ligne entière que pour les nôtres.
 */
export async function depuisLeStock({ url = null, surProgres = null } = {}) {
  const { dernierStock, lireLigneCsv, sansEnteteZip } = await import('./socle/imports/sirene-stock.js');
  const nos = new Map(Records.champs(COMMERCE, ['siret', 'ouvert_le']).filter((c) => !c.ouvert_le && /^\d{14}$/.test(siretPropre(c.siret))).map((c) => [siretPropre(c.siret), c.id]));
  if (!nos.size) return { poses: 0, lues: 0 };
  const stock = url ? { url, millesime: new Date().toISOString().slice(0, 10) } : await dernierStock();
  const { Readable } = await import('stream');
  const zlib = (await import('zlib')).default;
  const readline = (await import('readline')).default;
  const inflate = zlib.createInflateRaw();
  Readable.from(morceauxReprenables(stock.url, { surProgres })).on('error', (e) => inflate.destroy(e))
    .pipe(sansEnteteZip()).on('error', (e) => inflate.destroy(e)).pipe(inflate);
  const lignes = readline.createInterface({ input: inflate, crlfDelay: Infinity });
  let erreur = null;
  inflate.on('error', (e) => { erreur = e; });
  let entetes = null, iSiret = -1, iDate = -1, lues = 0, poses = 0;
  let lot = [];
  const vider = () => { if (lot.length) { poses += poser(lot); lot = []; } };
  try {
    for await (const ligne of lignes) {
      if (!entetes) { entetes = lireLigneCsv(ligne); iSiret = entetes.indexOf('siret'); iDate = entetes.indexOf('dateCreationEtablissement'); continue; }
      lues += 1;
      if (lues % 5_000_000 === 0) surProgres?.(`${(lues / 1e6).toFixed(0)} millions de lignes lues, ${poses + lot.length} commerces datés`);
      const siret = siretDeLigne(ligne);
      const id = siret && nos.get(siret);
      if (!id) continue;
      const c = lireLigneCsv(ligne);
      if (c[iSiret] !== siret) continue;
      const d = dateValable(c[iDate]);
      if (d) lot.push([id, d]);
      if (lot.length >= 2000) vider();
    }
    // Un flux coupé se ferme parfois sans erreur : ce n'est pas une lecture finie.
    if (erreur) throw erreur;
  } finally {
    // Ce qui a été trouvé avant une coupure reste posé.
    vider();
  }
  if (iSiret < 0 || iDate < 0) throw new Error("Le stock n'a plus les colonnes siret et dateCreationEtablissement.");
  return { poses, lues, millesime: stock.millesime };
}

/**
 * Les octets du stock, repris là où ils se sont arrêtés (3 nov. 2026 : data.gouv.fr cesse d'envoyer au milieu des
 * 2,9 Go). Trois minutes sans un octet, ou une erreur : on redemande la suite exacte (en-tête Range), dix fois au plus.
 */
async function* morceauxReprenables(url, { surProgres = null, essais = 10, silenceMs = 3 * 60_000 } = {}) {
  let recus = 0;
  for (let essai = 0; ; essai += 1) {
    const arret = new AbortController();
    let garde = null;
    const veiller = () => { clearTimeout(garde); garde = setTimeout(() => arret.abort(new Error('plus rien reçu depuis trois minutes')), silenceMs); garde.unref?.(); };
    try {
      veiller();
      const r = await fetch(url, { headers: { 'user-agent': 'Klocka/1.0 (sourcing@klocka.immo)', ...(recus ? { range: `bytes=${recus}-` } : {}) }, signal: arret.signal });
      if (recus ? r.status !== 206 : !r.ok) throw new Error(`Téléchargement du stock : ${r.status}`);
      for await (const morceau of r.body) {
        veiller();
        recus += morceau.length;
        yield Buffer.from(morceau.buffer, morceau.byteOffset, morceau.byteLength);
      }
      clearTimeout(garde);
      return;
    } catch (e) {
      clearTimeout(garde);
      if (essai >= essais) throw e;
      surProgres?.(`téléchargement coupé à ${(recus / 1e9).toFixed(2)} Go (${e?.message || e}), reprise au même endroit`);
      await new Promise((ok) => setTimeout(ok, 5000));
    }
  }
}

let enCours = false;
/** Les deux, dans l'ordre ; le stock national au plus une fois par mois, et seulement s'il reste des commerces sans date. */
export async function dater({ force = false } = {}) {
  if (enCours || process.env.OUVERTURES_COMMERCES === '0') return { ok: true, deja: enCours };
  enCours = true;
  try {
    const entrepot = depuisLEntrepot();
    let etat = null;
    try { etat = JSON.parse(Meta.get(ETAT) || 'null'); } catch { /* jamais fait */ }
    let stock = null;
    if (force || !etat?.le || Date.now() - Date.parse(etat.le) > UN_MOIS) {
      // Un téléchargement de 3 Go peut être coupé (« terminated », le 3 nov. 2026 après vingt millions de lignes) : on
      // retente deux fois, une minute après. Ce qui a été daté reste ; l'essai suivant ne cherche que les autres.
      for (let essai = 1; ; essai += 1) {
        try { stock = await depuisLeStock({ surProgres: (m) => console.log(`[ouvertures] ${m}`) }); break; } catch (e) {
          if (essai >= 3) throw e;
          console.warn(`[ouvertures] lecture coupée (${e?.message || e}), nouvel essai dans une minute`);
          await new Promise((r) => setTimeout(r, 60_000));
        }
      }
      Meta.set(ETAT, JSON.stringify({ le: new Date().toISOString(), ...stock }));
    }
    return { ok: true, entrepot, stock };
  } finally { enCours = false; }
}

// Lancé seul (`node server/ouverture-commerces.js`) : la lecture du stock tourne dans son propre processus, jamais dans
// celui du serveur (3 nov. 2026 : pendant la lecture, une fiche répondait en 9,6 s au lieu de 40 ms).
const { pathToFileURL } = await import('url');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dater({ force: process.argv.includes('--force') })
    .then((r) => { console.log(`[ouvertures] ${r.entrepot || 0} datés par l'entrepôt, ${r.stock?.poses || 0} par le stock national`); process.exit(0); })
    .catch((e) => { console.warn('[ouvertures]', e?.message || e); process.exit(1); });
}
