// La mesure DVF : les signaux d'ALX confrontés à ce qui s'est vraiment vendu.
//
// DVF est la liste exhaustive et datée de tous ceux qui ont vendu depuis
// 2014. Chaque mutation d'un local commercial est une étiquette positive, et
// chaque local connu qui n'a pas remué est un « pas encore vendu ». C'est la
// seule base qui n'ait pas le biais de canal de l'étude des vendeurs (des
// dossiers arrivés par des agents) : ici, on mesure qui vend, pas qui vend
// par un intermédiaire.
//
// La règle qui fait tout : les variables sont calculées À LA DATE DE
// RÉFÉRENCE T, avec les seules mutations antérieures à T. Un local vendu en
// 2023 est lu tel qu'il était le 1er janvier 2021 ; sa vente de 2023 n'est que
// le résultat. Sans ce gel, le modèle prédirait la vente à partir de la vente.
//
// Ce que DVF seul permet de tester, et rien de plus :
//   - le taux de base : quelle part des locaux connus se vend dans les
//     vingt-quatre mois qui suivent T ;
//   - la fenêtre depuis la dernière mutation (0-18, 18-48, 48-84, 84+ mois) :
//     c'est le squelette du signal « marchand de biens dans sa fenêtre »,
//     sans le code APE que DVF ne connaît pas ;
//   - un autre lot de la même parcelle vendu dans les vingt-quatre mois avant
//     T : le signal « voisin_mute » ;
//   - un dernier achat en bloc (plusieurs lots, ou un acte mixte) ;
//   - la bande de prix du dernier achat, pour voir si le périmètre 200 000 –
//     1 000 000 est celui où l'on vend.
// DVF ne donne ni le propriétaire, ni son âge, ni sa société : l'annuaire et
// Data Foncier ne se remontent pas dans le temps. Ces signaux-là se jugent
// par le journal des prédictions (predictions.js), pas ici.
//
//   node server/alx/mesure-dvf.js 06004 06029 06088    (Antibes, Cannes, Nice)
//
// Les fichiers sont gardés dans KLOCKA_DATA_DIR/dvf (un par commune et par
// an, quelques mégaoctets) ; le rapport s'écrit dans data/mesure-dvf.json et
// le Bilan le lit.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DATA_DIR } from '../db.js';
import { departementDe, lireCsv } from '../dvf.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
export const RAPPORT = path.join(ici, 'data', 'mesure-dvf.json');
const RACINE = process.env.DVF_RACINE || 'https://files.data.gouv.fr/geo-dvf/latest/csv';
const CACHE = path.join(DATA_DIR, 'dvf');

/** DVF en accès libre commence en 2014 : aucune détention plus longue n'est observable. */
export const PREMIERE_ANNEE = 2014;
/**
 * Sous ce nombre de VENTES observées, une case ne se lit pas.
 *
 * Ce n'est pas le nombre de locaux qui fait la précision, c'est le nombre
 * d'événements : une fenêtre à six cents locaux et dix-huit ventes a la même
 * fragilité qu'un sondage sur dix-huit personnes. Un cas de plus ou de moins
 * y déplace le rapport de moitié. La case est calculée, comptée, et marquée
 * comme non fiable ; l'écran l'affiche en « pas encore mesurable » plutôt que
 * de laisser lire un chiffre auquel personne ne devrait croire.
 */
export const EVENEMENTS_MINIMUM = 30;
const TYPE_COMMERCIAL = 'Local industriel. commercial ou assimilé';
// En dessous, ce n'est pas un prix de marché : euro symbolique, apport, cession intragroupe.
const PRIX_PLANCHER = 1000;
const MOIS_MS = 30.44 * 24 * 3600 * 1000;
const ABSENT_MS = 30 * 86400000;

/** Les fenêtres depuis la dernière mutation, en mois. La deuxième est celle du marchand de biens. */
export const FENETRES = [
  { cle: '0-18', min: 0, max: 18 },
  { cle: '18-48', min: 18, max: 48 },
  { cle: '48-84', min: 48, max: 84 },
  { cle: '84+', min: 84, max: Infinity },
];
export const BANDES_PRIX = [
  { cle: '< 200 k€', max: 200000 },
  { cle: '200 k€ – 1 M€', max: 1000000 },
  { cle: '> 1 M€', max: Infinity },
];

// --- Les fichiers ------------------------------------------------------------

async function fichierAnnee(dep, insee, annee, journal) {
  const dossier = path.join(CACHE, String(annee));
  fs.mkdirSync(dossier, { recursive: true });
  const chemin = path.join(dossier, `${insee}.csv`);
  const absent = `${chemin}.absent`;
  if (fs.existsSync(chemin)) return fs.readFileSync(chemin, 'utf-8');
  // Un millésime absent (l'année en cours, souvent la précédente) : on le
  // note, et on ne redemande pas avant un mois.
  if (fs.existsSync(absent) && Date.now() - fs.statSync(absent).mtimeMs < ABSENT_MS) return null;
  const r = await fetch(`${RACINE}/${annee}/communes/${dep}/${insee}.csv`, { signal: AbortSignal.timeout(180000) });
  if (r.status === 404) { fs.writeFileSync(absent, ''); journal(`${insee} · ${annee} : pas de fichier.`); return null; }
  if (!r.ok) throw new Error(`DVF a répondu ${r.status} pour ${insee}, ${annee}.`);
  const texte = await r.text();
  fs.writeFileSync(chemin, texte);
  try { fs.unlinkSync(absent); } catch { /* n'existait pas */ }
  journal(`${insee} · ${annee} : ${Math.max(0, texte.split('\n').length - 1)} lignes.`);
  return texte;
}

/**
 * Toutes les lignes DVF d'une commune, tous millésimes disponibles.
 * @param {string} insee
 * @param {{journal?: Function, jusqua?: number}} [opts]
 */
export async function lireCommune(insee, { journal = () => {}, jusqua = new Date().getFullYear() } = {}) {
  const dep = departementDe(insee);
  if (!dep) throw new Error(`Code INSEE inexploitable : ${insee}.`);
  const lignes = [];
  const annees = [];
  for (let a = PREMIERE_ANNEE; a <= jusqua; a++) {
    const texte = await fichierAnnee(dep, insee, a, journal);
    if (texte == null) continue;
    annees.push(a);
    lignes.push(...lireCsv(texte));
  }
  return { insee, dep, annees, lignes };
}

// --- L'inventaire ------------------------------------------------------------

const nombre = (v) => { const n = Number(String(v || '').trim()); return Number.isFinite(n) && n !== 0 ? n : null; };

/**
 * L'identité d'un local dans DVF, qui n'en a pas : la parcelle et le numéro
 * de lot quand l'acte le donne ; sinon la parcelle, le numéro dans la rue et
 * la surface. Deux ventes du même commerce à cinq ans d'écart tombent sur la
 * même clé ; deux commerces au même numéro, non.
 */
export const cleLocal = (l) =>
  `${l.id_parcelle}|${l.lot1_numero ? `lot ${String(l.lot1_numero).replace(/^0+/, '')}` : `${l.adresse_numero || ''}${String(l.adresse_suffixe || '').toLowerCase()}|${l.surface_reelle_bati || ''}`}`;

/**
 * Les locaux commerciaux et les parcelles, depuis les lignes DVF.
 *
 * Un acte fait une ligne par local et par parcelle ; on le reconstitue.
 * Une « vente » est un acte de nature Vente à un prix de marché ; un acte est
 * « commercial pur » quand tous ses locaux sont commerciaux, « en bloc » quand
 * il porte plusieurs lots ou d'autres types de locaux.
 *
 * @returns {{locaux: Map<string, {cle: string, parcelle: string, mutations: object[]}>, parcelles: Map<string, object[]>}}
 */
export function inventorier(lignes) {
  const parMutation = new Map();
  for (const l of lignes) {
    if (!l.id_mutation) continue;
    if (!parMutation.has(l.id_mutation)) parMutation.set(l.id_mutation, []);
    parMutation.get(l.id_mutation).push(l);
  }
  const locaux = new Map();
  const parcelles = new Map();
  for (const [id, lot] of parMutation) {
    const nature = lot[0].nature_mutation;
    const date = String(lot[0].date_mutation || '').slice(0, 10);
    if (!date) continue;
    const types = [...new Set(lot.map((l) => l.type_local).filter(Boolean))];
    const prix = nombre(lot[0].valeur_fonciere);
    const commercialPur = types.length === 1 && types[0] === TYPE_COMMERCIAL;
    const lots = Math.max(nombre(lot[0].nombre_lots) || 0, lot.filter((l) => l.type_local).length);
    const vente = nature === 'Vente' && (prix == null || prix >= PRIX_PLANCHER);
    const clesCommerciales = new Set();
    for (const l of lot) {
      if (l.type_local !== TYPE_COMMERCIAL || !l.id_parcelle) continue;
      const cle = cleLocal(l);
      clesCommerciales.add(cle);
      const loc = locaux.get(cle) || { cle, parcelle: l.id_parcelle, mutations: [] };
      if (!loc.mutations.some((m) => m.id === id)) loc.mutations.push({ id, date, prix, lots, commercial_pur: commercialPur, en_bloc: lots > 1 || !commercialPur, vente });
      locaux.set(cle, loc);
    }
    for (const parcelle of new Set(lot.map((l) => l.id_parcelle).filter(Boolean))) {
      const liste = parcelles.get(parcelle) || [];
      liste.push({ id, date, cles: clesCommerciales, types, vente });
      parcelles.set(parcelle, liste);
    }
  }
  for (const loc of locaux.values()) loc.mutations.sort((a, b) => a.date.localeCompare(b.date));
  for (const liste of parcelles.values()) liste.sort((a, b) => a.date.localeCompare(b.date));
  return { locaux, parcelles };
}

// --- La mesure ---------------------------------------------------------------

const plusMois = (iso, mois) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + mois); return d.toISOString().slice(0, 10); };
const moisEntre = (avant, apres) => (new Date(`${apres}T00:00:00Z`) - new Date(`${avant}T00:00:00Z`)) / MOIS_MS;
const cellule = () => ({ n: 0, ventes: 0 });
const compter = (c, vendu) => { c.n += 1; if (vendu) c.ventes += 1; };
const fenetreDe = (mois) => FENETRES.find((f) => mois >= f.min && mois < f.max)?.cle || '84+';
const bandeDe = (prix) => (prix == null ? 'inconnu' : BANDES_PRIX.find((b) => prix < b.max)?.cle || '> 1 M€');

/**
 * Les dates de référence : chaque 1er janvier assez tard pour avoir une année
 * d'histoire derrière, assez tôt pour que l'horizon tienne dans les fichiers.
 */
export function referencesPour(annees, horizonMois, derniereDate = null) {
  if (!annees.length) return [];
  const premiere = Math.min(...annees);
  const derniere = Math.max(...annees);
  const refs = [];
  for (let a = premiere + 1; a + horizonMois / 12 <= derniere + 1; a++) {
    const T = `${a}-01-01`;
    // L'horizon doit tenir dans les actes réellement publiés : un dernier
    // millésime à moitié plein tronquerait les résultats de la dernière date.
    if (derniereDate && plusMois(T, horizonMois) > derniereDate) break;
    refs.push(T);
  }
  return refs;
}

/**
 * La mesure : pour chaque commune, chaque date de référence et chaque local
 * connu à cette date, ce qu'on savait (la fenêtre, le voisin, le bloc, le
 * prix) et ce qui est arrivé (une vente dans l'horizon).
 *
 * @param {{insee: string, nom?: string, annees: number[], lignes: object[]}[]} communes
 * @param {{horizon_mois?: number, references?: string[]}} [opts]
 */
/** Les tailles de portefeuille comparées : un lot isolé, une poignée, un patrimoine. */
export const PORTEFEUILLES = [
  { cle: '1 parcelle', max: 1 },
  { cle: '2 à 5', max: 5 },
  { cle: '6 et plus', max: Infinity },
];
const portefeuilleDe = (n) => PORTEFEUILLES.find((p) => n <= p.max)?.cle || '6 et plus';

/**
 * Ce que le fichier des personnes morales ajoute à un local, à la date T :
 * son propriétaire, la taille de son portefeuille dans le département, et
 * s'il a vendu une autre de ses parcelles dans les mois qui précèdent.
 *
 * `proprietaires` : millésime → index par parcelle (server/alx/personnes-morales.js).
 * `ventesParParcelle` : parcelle → dates de vente, tous types de locaux.
 */
function proprietaireA(proprietaires, ventesParParcelle, { annee, parcelle, T, debut }) {
  const index = proprietaires?.get(annee);
  if (!index) return null;
  // Le propriétaire du local : celui qui détient le plus de locaux sur la
  // parcelle, faute de savoir lequel tient le rez-de-chaussée.
  const sur = (index.get(parcelle) || []).filter((g) => !g.droit || g.droit === 'P');
  if (!sur.length) return null;
  const choisi = [...sur].sort((a, b) => (b.rez_de_chaussee ? 1 : 0) - (a.rez_de_chaussee ? 1 : 0) || b.locaux - a.locaux)[0];
  const portefeuille = proprietaires.get(`siren:${annee}`)?.get(choisi.siren) || [];
  // A-t-il vendu ailleurs, avant T ? Une vente sur une AUTRE de ses parcelles.
  const aVenduAilleurs = portefeuille.some((p) => p.parcelle !== parcelle && (ventesParParcelle.get(p.parcelle) || []).some((d) => d >= debut && d < T));
  return { siren: choisi.siren, nom: choisi.nom, parcelles: portefeuille.length || 1, a_vendu_ailleurs: aVenduAilleurs };
}

export function mesurer(communes, { horizon_mois = 24, references = null, proprietaires = null } = {}) {
  const annees = [...new Set(communes.flatMap((c) => c.annees))];
  let derniereDate = null;
  for (const c of communes) for (const l of c.lignes) if (l.date_mutation && (!derniereDate || l.date_mutation > derniereDate)) derniereDate = String(l.date_mutation).slice(0, 10);
  const refs = references || referencesPour(annees, horizon_mois, derniereDate);
  const base = cellule();
  const parFenetre = Object.fromEntries(FENETRES.map((f) => [f.cle, cellule()]));
  const voisin = { avec: cellule(), sans: cellule() };
  const bloc = { avec: cellule(), sans: cellule() };
  const prix = Object.fromEntries([...BANDES_PRIX.map((b) => b.cle), 'inconnu'].map((k) => [k, cellule()]));
  const parReference = Object.fromEntries(refs.map((r) => [r, cellule()]));
  const parCommune = [];
  // Ce que le fichier des personnes morales permet, quand il est fourni.
  const rotation = { avec: cellule(), sans: cellule() };
  const portefeuille = Object.fromEntries(PORTEFEUILLES.map((p) => [p.cle, cellule()]));
  const personneMorale = { connue: cellule(), inconnue: cellule() };

  for (const commune of communes) {
    const { locaux, parcelles } = inventorier(commune.lignes);
    // Les dates de vente par parcelle : c'est par elles qu'on sait si un
    // propriétaire a vendu ailleurs avant la date de référence.
    const ventesParParcelle = new Map();
    for (const [parcelle, liste] of parcelles) ventesParParcelle.set(parcelle, liste.filter((m) => m.vente).map((m) => m.date));
    const cc = { insee: commune.insee, nom: commune.nom || commune.insee, annees: commune.annees, locaux: locaux.size, ventes: 0, ...cellule() };
    for (const loc of locaux.values()) cc.ventes += loc.mutations.filter((m) => m.vente && m.commercial_pur).length;
    for (const T of refs) {
      const fin = plusMois(T, horizon_mois);
      for (const loc of locaux.values()) {
        // Ce qu'on savait à T : rien d'autre.
        const avant = loc.mutations.filter((m) => m.vente && m.date < T);
        if (!avant.length) continue;
        const derniere = avant[avant.length - 1];
        // Ce qui est arrivé : une vente du local, à un prix de marché, dans
        // l'horizon. La même définition qu'à l'entrée (un acte de vente, pur
        // ou en bloc) : sinon un local acheté en bloc pourrait entrer sans
        // jamais pouvoir « sortir », et le bloc paraîtrait protéger de la vente.
        const vendu = loc.mutations.some((m) => m.vente && m.date > T && m.date <= fin);
        const mois = moisEntre(derniere.date, T);
        const debutVoisin = plusMois(T, -horizon_mois);
        const voisinMute = (parcelles.get(loc.parcelle) || []).some((m) => m.vente && m.date >= debutVoisin && m.date < T && !m.cles.has(loc.cle));

        compter(base, vendu);
        compter(cc, vendu);
        compter(parReference[T], vendu);
        compter(parFenetre[fenetreDe(mois)], vendu);
        compter(voisinMute ? voisin.avec : voisin.sans, vendu);
        compter(derniere.en_bloc ? bloc.avec : bloc.sans, vendu);
        compter(prix[bandeDe(derniere.prix)], vendu);

        if (proprietaires) {
          const p = proprietaireA(proprietaires, ventesParParcelle, { annee: Number(T.slice(0, 4)), parcelle: loc.parcelle, T, debut: debutVoisin });
          compter(p ? personneMorale.connue : personneMorale.inconnue, vendu);
          if (p) {
            compter(p.a_vendu_ailleurs ? rotation.avec : rotation.sans, vendu);
            compter(portefeuille[portefeuilleDe(p.parcelles)], vendu);
          }
        }
      }
    }
    parCommune.push(cc);
  }

  const tauxBase = base.n ? base.ventes / base.n : 0;
  const finir = (c) => ({
    ...c,
    taux: c.n ? Math.round((c.ventes / c.n) * 1000) / 10 : null,
    lift: c.n && tauxBase ? Math.round((c.ventes / c.n / tauxBase) * 100) / 100 : null,
    // Assez de ventes pour que le rapport veuille dire quelque chose ?
    fiable: c.ventes >= EVENEMENTS_MINIMUM,
  });
  return {
    le: new Date().toISOString(),
    horizon_mois,
    references: refs,
    annees,
    derniere_date: derniereDate,
    communes: parCommune.map((c) => ({ insee: c.insee, nom: c.nom, annees: c.annees, locaux: c.locaux, ventes: c.ventes, ...finir({ n: c.n, ventes: c.ventes }) })),
    base: { ...finir(base), taux_annuel_approx: base.n ? Math.round((tauxBase * 12 / horizon_mois) * 1000) / 10 : null },
    par_fenetre: FENETRES.map((f) => ({ cle: f.cle, ...finir(parFenetre[f.cle]) })),
    voisin: { avec: finir(voisin.avec), sans: finir(voisin.sans) },
    bloc: { avec: finir(bloc.avec), sans: finir(bloc.sans) },
    // Ce que le fichier des personnes morales ajoute. Vide sans lui.
    proprietaires: proprietaires
      ? {
        rotation: { avec: finir(rotation.avec), sans: finir(rotation.sans) },
        portefeuille: PORTEFEUILLES.map((p) => ({ cle: p.cle, ...finir(portefeuille[p.cle]) })),
        personne_morale: { connue: finir(personneMorale.connue), inconnue: finir(personneMorale.inconnue) },
      }
      : null,
    prix: [...BANDES_PRIX.map((b) => b.cle), 'inconnu'].map((k) => ({ cle: k, ...finir(prix[k]) })),
    par_reference: refs.map((r) => ({ cle: r, ...finir(parReference[r]) })),
    limites: [
      `Les fichiers publiés (« latest ») ne couvrent que ${annees.length} millésime${annees.length > 1 ? 's' : ''} (${Math.min(...annees)}–${Math.max(...annees)}) : les fenêtres au-delà de ${Math.max(...annees) - Math.min(...annees)} ans ne peuvent pas s'observer, et les années antérieures demanderaient les archives DVF.`,
      "Un local n'entre dans la mesure qu'après sa première vente vue par DVF : la population, ce sont les locaux qui ont déjà changé de mains une fois dans la fenêtre publiée. Un commerce détenu depuis 1990 n'y est pas, et ceux qui viennent d'être achetés y sont surreprésentés.",
      'Un local est compté à chaque date de référence où il est connu : la même adresse pèse plusieurs fois, comme dans toute mesure à origine glissante.',
      "Les « non vendus » sont des « pas encore vendus » : les lifts sont plutôt sous-estimés que l'inverse.",
      "DVF ne connaît ni le propriétaire, ni son âge, ni sa société : les signaux qui les lisent se jugent par le journal des prédictions, pas ici.",
      "L'identité d'un local est reconstituée (parcelle et lot, sinon numéro et surface) : quelques ventes du même commerce peuvent se lire comme deux locaux.",
    ],
  };
}

// --- Lancer et écrire ---------------------------------------------------------

let enCours = null;

/** La mesure sur plusieurs communes, écrite dans data/mesure-dvf.json. */
/**
 * Les propriétaires connus, pour les millésimes utiles : millésime → index
 * par parcelle, et `siren:millésime` → index par société. Rend null si rien
 * n'a été extrait — la mesure tourne alors sans eux, comme avant.
 */
async function proprietairesConnus(insees, journal) {
  const { dejaLa, lire, parParcelle, parSiren } = await import('./personnes-morales.js');
  const depts = [...new Set(insees.map((i) => String(i).slice(0, 2)))];
  const index = new Map();
  for (let a = new Date().getFullYear(); a >= 2019; a -= 1) {
    for (const dept of depts) {
      if (!dejaLa(a, dept)) continue;
      const groupes = lire(a, dept) || [];
      if (!groupes.length) continue;
      // Plusieurs départements au même millésime se cumulent dans le même index.
      const parcelles = index.get(a) || new Map();
      for (const [k, v] of parParcelle(groupes)) parcelles.set(k, [...(parcelles.get(k) || []), ...v]);
      index.set(a, parcelles);
      const sirens = index.get(`siren:${a}`) || new Map();
      for (const [k, v] of parSiren(groupes)) sirens.set(k, [...(sirens.get(k) || []), ...v]);
      index.set(`siren:${a}`, sirens);
    }
  }
  const annees = [...index.keys()].filter((k) => typeof k === 'number').sort();
  if (!annees.length) {
    journal("Fichier des personnes morales absent : la mesure se limite à ce que DVF sait seul. Pour l'ajouter : node server/alx/personnes-morales.js 2022 2023");
    return null;
  }
  journal(`Propriétaires : millésimes ${annees.join(', ')} (${annees.map((a) => `${a} : ${index.get(a).size} parcelles`).join(', ')}).`);
  return index;
}

export async function lancerMesure({ insees, noms = {}, horizon_mois = 24, journal = console.log } = {}) {
  if (enCours) throw new Error('Une mesure est déjà en cours.');
  enCours = { depuis: new Date().toISOString(), insees };
  try {
    const communes = [];
    for (const insee of insees) {
      const c = await lireCommune(insee, { journal });
      communes.push({ ...c, nom: noms[insee] || insee });
      journal(`${noms[insee] || insee} : ${c.lignes.length} lignes DVF sur ${c.annees.length} millésimes (${c.annees[0]}–${c.annees[c.annees.length - 1]}).`);
    }
    const proprietaires = await proprietairesConnus(insees, journal).catch((e) => { journal(`Propriétaires non lus : ${e.message}`); return null; });
    const resultat = mesurer(communes, { horizon_mois, proprietaires });
    fs.writeFileSync(RAPPORT, JSON.stringify(resultat, null, 2));
    journal(enTable(resultat));
    journal(`Rapport écrit : ${RAPPORT}`);
    return resultat;
  } finally {
    enCours = null;
  }
}

export const mesureEnCours = () => enCours;

/** Le rapport écrit, s'il existe. */
export function lireRapport() {
  try { return JSON.parse(fs.readFileSync(RAPPORT, 'utf-8')); } catch { return null; }
}

const pct = (x) => (x == null ? '—' : `${String(x).replace('.', ',')} %`);
const lift = (x) => (x == null ? '—' : `×${String(x).replace('.', ',')}`);
const ligne = (nom, c) => `${nom.padEnd(22)}${String(c.n).padStart(8)}${String(c.ventes).padStart(8)}${pct(c.taux).padStart(9)}${(c.fiable ? lift(c.lift) : `(${lift(c.lift)})`).padStart(9)}`;

/** La table, lisible dans un terminal. */
export function enTable(r) {
  const l = [];
  l.push(`Horizon ${r.horizon_mois} mois · références ${r.references[0]} → ${r.references[r.references.length - 1]} · millésimes ${Math.min(...r.annees)}–${Math.max(...r.annees)}, dernier acte le ${r.derniere_date} · ${r.communes.map((c) => `${c.nom} (${c.locaux} locaux, ${c.ventes} ventes)`).join(', ')}`);
  l.push(`${'signal'.padEnd(22)}${'n'.padStart(8)}${'ventes'.padStart(8)}${'taux'.padStart(9)}${'lift'.padStart(9)}   (un lift entre parenthèses tient sur moins de ${EVENEMENTS_MINIMUM} ventes : à ne pas lire)`);
  l.push(ligne('taux de base', r.base) + `   (≈ ${pct(r.base.taux_annuel_approx)} par an)`);
  for (const f of r.par_fenetre) l.push(ligne(`fenêtre ${f.cle} mois`, f));
  l.push(ligne('voisin muté', r.voisin.avec));
  l.push(ligne('sans voisin', r.voisin.sans));
  l.push(ligne('acheté en bloc', r.bloc.avec));
  l.push(ligne('acheté seul', r.bloc.sans));
  for (const p of r.prix) l.push(ligne(`prix ${p.cle}`, p));
  if (r.proprietaires) {
    l.push('');
    l.push('— avec le fichier des personnes morales —');
    l.push(ligne('propriétaire connu', r.proprietaires.personne_morale.connue));
    l.push(ligne('propriétaire inconnu', r.proprietaires.personne_morale.inconnue));
    l.push(ligne('a vendu ailleurs', r.proprietaires.rotation.avec));
    l.push(ligne("n'a pas vendu ailleurs", r.proprietaires.rotation.sans));
    for (const p of r.proprietaires.portefeuille) l.push(ligne(`portefeuille ${p.cle}`, p));
  }
  return l.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const insees = process.argv.slice(2).filter((a) => /^\d{5}$/.test(a));
  if (!insees.length) {
    console.log('Usage : node server/alx/mesure-dvf.js <INSEE> [<INSEE> ...]   ex. 06004 06029 06088');
    process.exit(1);
  }
  await lancerMesure({ insees });
}
