// Les jeux immobiliers (26 nov. 2026, Jules : « une Street View, et on devine le prix au mètre carré de la rue, pour
// une boutique ; deux actifs qu'on peut vraiment analyser, avec leurs défauts, et on choisit ; pas des jeux chronométrés,
// des jeux immobiliers, des choses vraies »). Planche d'abord (PlancheJeux), pour l'écran d'attente et, plus tard,
// peut-être l'espace client.
//
// Rien n'est inventé : les loyers sont les lectures Equimmox déjà en base (EquimmoxRecherche : Analyse de loyer, baux de
// la classe Commerces autour de l'adresse, € / m² / an ; Jules, 26 nov. : « pas Data-B, mets Equimmox »), les actifs sont
// les vrais dossiers (Project) qui ont un prix, un loyer et une adresse. Les défauts et le « choix de Klocka » sont des
// règles écrites ici, lisibles, jamais un modèle.

import { Records } from './db.js';
import { norm } from './prospection/regles.js';

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const MOIS_AFFICHES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const nombre = (x) => { const v = Number(String(x ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
const melange = (t, alea = Math.random) => { const r = t.slice(); for (let i = r.length - 1; i > 0; i -= 1) { const j = Math.floor(alea() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const RAYONS = { '200m': 1, '500m': 2, '1000m': 3 };

// --- Les rues ----------------------------------------------------------------------------------------------------

/** Pure : « 12 Rue de la République 69002 Lyon » → la rue et la ville. */
export function decouperAdresse(adresse) {
  const m = String(adresse || '').trim().match(/^\d+\s*(?:bis|ter)?\s*,?\s*(.+?),?\s*(\d{5})\s*-?\s*(.+)$/i);
  if (!m) return null;
  return { rue: m[1].replace(/,$/, '').trim(), ville: m[3].trim() };
}

/** Pure : une lecture Equimmox jouable (adresse avec numéro, loyers lus), ou null. */
export function rueDeLecture(e) {
  const r = e?.resultat;
  if (!r || r.error || !(r.moyenne > 0) || !(r.bas > 0) || !(r.haut > 0)) return null;
  const adresse = String(r.adresse || e.adresse || '').trim();
  const morceaux = decouperAdresse(adresse);
  if (!morceaux) return null;
  return {
    adresse,
    rue: morceaux.rue,
    ville: morceaux.ville,
    loyer: { basse: r.bas, haute: r.haut, milieu: r.moyenne },
    rayon: r.rayon || null,
    base: r.base || 'baux',
    surface: r.surface_min && r.surface_max ? { min: r.surface_min, max: r.surface_max } : null,
    lu_le: e.le || r.le || null,
  };
}

/** Les adresses jouables, une par adresse : la lecture au plus petit rayon (la plus proche de la rue). */
export function ruesJouables(lectures = Records.list('EquimmoxRecherche')) {
  const par = new Map();
  for (const e of lectures) {
    const r = rueDeLecture(e);
    if (!r) continue;
    const cle = norm(r.adresse);
    const avant = par.get(cle);
    if (!avant || (RAYONS[r.rayon] || 9) < (RAYONS[avant.rayon] || 9) || ((RAYONS[r.rayon] || 9) === (RAYONS[avant.rayon] || 9) && String(r.lu_le) > String(avant.lu_le))) par.set(cle, r);
  }
  return [...par.values()];
}

/** Pure : les points d'une estimation de loyer, sur 100 : 100 à 10 % près, 0 au-delà de 60 % d'écart. */
export function pointsEstimation(estime, vrai) {
  if (!(estime > 0) || !(vrai > 0)) return 0;
  const ecart = Math.abs(Math.log(estime / vrai));
  const e10 = Math.log(1.1);
  const e60 = Math.log(1.6);
  if (ecart <= e10) return 100;
  if (ecart >= e60) return 0;
  return Math.round(100 * (1 - (ecart - e10) / (e60 - e10)));
}

/** Pure : quatre rues d'une même ville, assez différentes pour être classées (10 % d'écart au moins entre voisines). */
export function quatreRues(rues, alea = Math.random) {
  const parVille = new Map();
  for (const r of rues) {
    const v = norm(r.ville);
    if (!v) continue;
    if (!parVille.has(v)) parVille.set(v, []);
    parVille.get(v).push(r);
  }
  for (const [, liste] of melange([...parVille.entries()], alea)) {
    const tri = melange(liste, alea).sort((a, b) => a.loyer.milieu - b.loyer.milieu);
    const pris = [];
    for (const r of tri) if (!pris.length || r.loyer.milieu >= pris[pris.length - 1].loyer.milieu * 1.1) pris.push(r);
    if (pris.length >= 4) {
      // Quatre réparties sur l'échelle de la ville, pas les quatre moins chères.
      const idx = [0, Math.floor(pris.length / 3), Math.floor((2 * pris.length) / 3), pris.length - 1];
      return melange([...new Set(idx)].map((i) => pris[i]), alea).slice(0, 4);
    }
  }
  return [];
}

// --- Les actifs ---------------------------------------------------------------------------------------------------

/** Pure : la fin du bail écrite comme on la trouve dans les dossiers (« 2033-04-22 », « 31 janvier 2028 », « 2031 »,
 *  « Bail 10 ans ferme à compter de 2021 »), en AAAA-MM-JJ, ou null. */
export function finDeBail(texte) {
  const t = norm(texte);
  if (!t) return null;
  let m = String(texte).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/(\d{1,2}) (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre) (\d{4})/);
  if (m) return `${m[3]}-${String(MOIS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/(\d{1,2}) ans .*compter (?:de |du )?(?:.* )?(\d{4})/);
  if (m) return `${Number(m[2]) + Number(m[1])}-12-31`;
  m = t.match(/^(\d{4})$/);
  if (m) return `${m[1]}-12-31`;
  return null;
}

/** Pure : la rue et la ville d'une adresse de dossier (« 12 rue de la République, 69002 Lyon »). */
export function rueEtVille(adresse) {
  const [tete, ...reste] = String(adresse || '').split(',');
  const rue = norm(tete.replace(/^\s*\d+\s*(bis|ter)?\s*/i, ''));
  const ville = norm(reste.join(' ').replace(/\d{5}/g, ''));
  return { rue, ville };
}

const DANGER = /danger|anomalie|defaut|amiante.*(contenant|present)|plomb.*classe 3|pprn|pprm|pprt|pollution|termite/;

/** Pure : un dossier en actif jouable, avec ses défauts et ses atouts, ou null s'il manque prix, loyer ou adresse. */
export function actifDeProjet(p, { rues = [], aujourdhui = new Date().toISOString().slice(0, 10) } = {}) {
  const prix = nombre(p.prix_acquisition);
  const loyer = nombre(p.loyer_annuel_ht);
  const adresse = String(p.adresse_complete || '').trim();
  if (!(prix > 0) || !(loyer > 0) || !/\d/.test(adresse) || !adresse.includes(',')) return null;
  const surface = nombre(p.surface_m2) || null;
  const rendement = Math.round((loyer / prix) * 1000) / 10;
  const fin = finDeBail(p.echeance_bail);
  const ansRestants = fin ? Math.round(((Date.parse(fin) - Date.parse(aujourdhui)) / (365.25 * 864e5)) * 10) / 10 : null;
  const { rue, ville } = rueEtVille(adresse);
  const lecture = rues.find((r) => norm(r.adresse) === norm(adresse.replace(/,/g, ' '))) || rues.find((r) => norm(r.rue) === rue && ville && norm(r.ville).includes(ville.split(' ')[0])) || null;
  const loyerM2 = surface ? Math.round(loyer / surface) : null;
  const defauts = [];
  const atouts = [];
  let malus = 0;
  if (ansRestants != null && ansRestants < 0) { defauts.push(`Bail échu ${ansRestants > -1 ? `en ${MOIS_AFFICHES[Number(fin.slice(5, 7)) - 1]} ${fin.slice(0, 4)}` : `depuis ${Math.round(-ansRestants)} an${Math.round(-ansRestants) > 1 ? 's' : ''}`} : il se prolonge tacitement, le locataire peut partir avec six mois de préavis.`); malus += 1.5; }
  else if (ansRestants != null && ansRestants < 3) { defauts.push(`Fin de bail dans ${String(ansRestants).replace('.', ',')} an${ansRestants >= 2 ? 's' : ''} : le loyer et le départ du locataire se rediscutent bientôt.`); malus += 1; }
  else if (ansRestants != null && ansRestants >= 6) { atouts.push(`Bail jusqu'en ${fin.slice(0, 4)} : ${Math.round(ansRestants)} ans de loyers visibles.`); malus -= 0.5; }
  if (ansRestants == null) { defauts.push('Fin de bail non renseignée dans le dossier : à vérifier dans le bail.'); malus += 0.5; }
  if (lecture && loyerM2) {
    if (loyerM2 > lecture.loyer.haute) { defauts.push(`Loyer de ${loyerM2} €/m²/an, au-dessus des baux autour (${lecture.loyer.basse} à ${lecture.loyer.haute} €, Equimmox) : il peut baisser au renouvellement.`); malus += 1; }
    else if (loyerM2 < lecture.loyer.basse) { atouts.push(`Loyer de ${loyerM2} €/m²/an, sous les baux autour (${lecture.loyer.basse} à ${lecture.loyer.haute} €, Equimmox) : marge de hausse au renouvellement.`); malus -= 0.5; }
    else atouts.push(`Loyer de ${loyerM2} €/m²/an, dans la fourchette des baux autour (${lecture.loyer.basse} à ${lecture.loyer.haute} €, Equimmox).`);
  }
  const notes = [];
  const vus = new Set();
  // Un défaut par diagnostic (les dossiers répètent souvent la même pièce lue plusieurs fois).
  for (const n of Array.isArray(p.notes_diagnostique) ? p.notes_diagnostique : []) {
    if (!n?.contenu || vus.has(n.titre)) continue;
    if (DANGER.test(norm(n.contenu)) && !/n a pas ete repere|neant|non soumis/.test(norm(n.contenu))) { vus.add(n.titre); notes.push(`${n.titre} : ${String(n.contenu).slice(0, 180)}`); }
  }
  if (notes.length) { defauts.push(...notes.slice(0, 3)); malus += Math.min(1, notes.length * 0.4); }
  const depuis = nombre(String(p.locataire_depuis || '').slice(0, 4));
  if (depuis > 1900 && Number(aujourdhui.slice(0, 4)) - depuis >= 15) atouts.push(`Locataire en place depuis ${depuis} : il est attaché à l'emplacement.`);
  return {
    id: p.id,
    titre: p.nom_locataire || p.titre,
    activite: p.activite_locataire && !/a qualifier|non renseign/i.test(p.activite_locataire) ? p.activite_locataire : null,
    adresse,
    surface,
    prix,
    loyer,
    rendement,
    prix_m2: surface ? Math.round(prix / surface) : null,
    loyer_m2: loyerM2,
    fin_bail: fin,
    ans_restants: ansRestants,
    loyer_autour: lecture ? { ...lecture.loyer, rayon: lecture.rayon } : null,
    defauts,
    atouts,
    // Le rendement corrigé du risque, la règle du choix de Klocka : un point de rendement vaut un point de malus.
    note: Math.round((rendement - malus) * 10) / 10,
  };
}

export function actifsJouables({ projets = Records.list('Project'), rues = ruesJouables(), aujourdhui } = {}) {
  return projets.map((p) => actifDeProjet(p, { rues, aujourdhui })).filter(Boolean);
}

/** Pure : deux actifs dont le choix n'est pas évident (notes à moins de 3 points l'une de l'autre si possible). */
export function deuxActifs(actifs, alea = Math.random) {
  if (actifs.length < 2) return [];
  const paires = [];
  for (let i = 0; i < actifs.length; i += 1) for (let j = i + 1; j < actifs.length; j += 1) paires.push([actifs[i], actifs[j]]);
  const serrees = paires.filter(([a, b]) => Math.abs(a.note - b.note) <= 3 && a.note !== b.note);
  const [a, b] = melange(serrees.length ? serrees : paires, alea)[0];
  return alea() < 0.5 ? [a, b] : [b, a];
}

// --- Les duels vérifiés par l'équipe ------------------------------------------------------------------------------
// Jules (26 nov. 2026) : « deux actifs oui, mais il faut que l'on vérifie avant, pour que tu mettes bien ce qu'on
// choisirait ». Une paire ne se joue qu'une fois tranchée par l'équipe : son choix et son pourquoi sont la réponse ;
// la règle de la note ne sert plus qu'à proposer, à la vérification.

export const VERDICT = 'JeuActifs';

/** Pure : la clé d'une paire, quel que soit l'ordre. */
export const clePaire = (a, b) => [String(a), String(b)].sort().join('|');

/** Pure : les paires d'actifs pas encore tranchées ni écartées, les plus serrées d'abord. */
export function pairesAVerifier(actifs, verdicts) {
  const faites = new Set(verdicts.map((v) => v.paire));
  const out = [];
  for (let i = 0; i < actifs.length; i += 1) {
    for (let j = i + 1; j < actifs.length; j += 1) {
      if (!faites.has(clePaire(actifs[i].id, actifs[j].id))) out.push([actifs[i], actifs[j]]);
    }
  }
  return out.sort((x, y) => Math.abs(x[0].note - x[1].note) - Math.abs(y[0].note - y[1].note));
}

/** Pure : une paire tranchée et encore jouable (les deux dossiers ont toujours prix, loyer et adresse), au hasard. */
export function pairePourJouer(actifs, verdicts, alea = Math.random) {
  const par = new Map(actifs.map((a) => [String(a.id), a]));
  const jouables = verdicts.filter((v) => v.etat === 'valide' && par.has(String(v.a_id)) && par.has(String(v.b_id)));
  if (!jouables.length) return null;
  const v = melange(jouables, alea)[0];
  const deux = alea() < 0.5 ? [par.get(String(v.a_id)), par.get(String(v.b_id))] : [par.get(String(v.b_id)), par.get(String(v.a_id))];
  return { actifs: deux, verdict: { choix: v.choix, pourquoi: v.pourquoi || '', par: v.par || null, le: v.le || null } };
}

/** Enregistre le verdict de l'équipe sur une paire (ou l'écarte), en remplaçant celui d'avant. */
export function trancherPaire({ a_id, b_id, choix = null, pourquoi = '', ecarter = false }, par) {
  if (!a_id || !b_id || String(a_id) === String(b_id)) return { ok: false, error: 'Deux actifs différents sont attendus.' };
  if (!ecarter && ![String(a_id), String(b_id)].includes(String(choix))) return { ok: false, error: 'Le choix doit être l\'un des deux actifs.' };
  const paire = clePaire(a_id, b_id);
  const donnees = { paire, a_id: String(a_id), b_id: String(b_id), choix: ecarter ? null : String(choix), pourquoi: String(pourquoi || '').trim().slice(0, 1200), etat: ecarter ? 'ecartee' : 'valide', par: par || null, le: new Date().toISOString() };
  const avant = Records.filter(VERDICT, { paire })[0];
  const v = avant ? Records.update(VERDICT, avant.id, donnees) : Records.create(VERDICT, donnees);
  return { ok: true, verdict: v };
}

// --- Quel rendement à cet emplacement ? ----------------------------------------------------------------------------
// Jules (26 nov. 2026) : « quel rendement à cet emplacement ; vous achetez à combien ; pareil que le loyer, on met une
// renta et ça attribue un score ». Les annonces sont celles de l'export Equimmox des murs en vente (le même que lit
// loyers-reels.js) : des commerces vendus loués, avec leur prix demandé et leur loyer. La réponse est le rendement de
// l'annonce (loyer ÷ prix demandé), le score se compte sur le prix, comme pour le loyer.

/** Pure : les annonces jouables d'un export (commerce, prix, loyer, position, rendement plausible), sans doublon. */
export function annoncesDeLExport(lignes, { pointExcel, dateExcel }) {
  const vues = new Set();
  const out = [];
  for (const l of lignes || []) {
    if (String(l['asset class'] || '').toLowerCase() !== 'commercial' || !l.ID || vues.has(String(l.ID))) continue;
    const prix = nombre(l.price);
    const loyer = nombre(l.rent);
    const point = pointExcel(l.coordinates);
    if (!(prix > 0) || !(loyer > 0) || !point) continue;
    const rendement = Math.round((loyer / prix) * 1000) / 10;
    if (rendement < 3 || rendement > 15) continue;
    vues.add(String(l.ID));
    const surface = nombre(l.surface) || null;
    const adresse = String(l.address || '').split(',')[0].trim() || null;
    out.push({
      id: String(l.ID), point, adresse, ville: l.city || null, prix, loyer, surface, rendement,
      loyer_m2: surface ? Math.round(loyer / surface) : null, prix_m2: surface ? Math.round(prix / surface) : null,
      publie_le: dateExcel(l['publication date']), retire_le: dateExcel(l.deleted_date), url: l.url || null,
    });
  }
  return out;
}

/** Pure : les annonces de murs de commerce en vente avec leur prix au m² (louées ou non), pour « le prix des murs ». */
export function prixM2DeLExport(lignes, { pointExcel, dateExcel }) {
  const vues = new Set();
  const out = [];
  for (const l of lignes || []) {
    if (String(l['asset class'] || '').toLowerCase() !== 'commercial' || !l.ID || vues.has(String(l.ID))) continue;
    const prix = nombre(l.price);
    const surface = nombre(l.surface);
    const point = pointExcel(l.coordinates);
    if (!(prix > 0) || !(surface > 0) || !point) continue;
    const prixM2 = Math.round(prix / surface);
    if (prixM2 < 800 || prixM2 > 30000) continue;
    vues.add(String(l.ID));
    out.push({ id: String(l.ID), point, adresse: String(l.address || '').split(',')[0].trim() || null, ville: l.city || null, prix, surface, prix_m2: prixM2, loue: nombre(l.rent) > 0, publie_le: dateExcel(l['publication date']), retire_le: dateExcel(l.deleted_date) });
  }
  return out;
}

/** Les lignes des exports Equimmox des murs en vente déposés dans server/data/exports-equimmox, le plus récent d'abord. */
async function lignesDesExports() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { DATA_DIR } = await import('./db.js');
  const { lireXlsx } = await import('./xlsx.js');
  const dossier = path.join(DATA_DIR, 'exports-equimmox');
  let fichiers = [];
  try { fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith('.xlsx')).sort().reverse(); } catch { return []; }
  const lignes = [];
  for (const f of fichiers.slice(0, 6)) {
    try { lignes.push(...lireXlsx(fs.readFileSync(path.join(dossier, f)))); } catch (e) { console.warn(`[jeux] export illisible ${f} : ${e?.message || e}`); }
  }
  return lignes;
}

export async function annoncesRendement() {
  const { pointExcel, dateExcel } = await import('./loyers-reels.js');
  return annoncesDeLExport(await lignesDesExports(), { pointExcel, dateExcel });
}

export async function annoncesPrixM2() {
  const { pointExcel, dateExcel } = await import('./loyers-reels.js');
  return prixM2DeLExport(await lignesDesExports(), { pointExcel, dateExcel });
}

// --- La rue : loyer et prix des murs, en alternance ----------------------------------------------------------------
// Jules (26 nov. 2026) : « rajoute un jeu pour le prix des murs au m², tu le mets dans le même jeu, juste ça alterne ».

/** Pure : des manches qui alternent le loyer d'une boutique (lecture Equimmox) et le prix des murs au m² (annonce). */
export function manchesAlternees(rues, annonces, n = 10, alea = Math.random) {
  const r = melange(rues, alea);
  const a = melange(annonces, alea);
  const out = [];
  for (let k = 0; out.length < n && (r.length || a.length); k += 1) {
    const loyer = k % 2 === 0;
    const x = loyer ? (r.shift() || a.shift()) : (a.shift() || r.shift());
    if (!x) break;
    out.push('prix_m2' in x ? { type: 'prix', ...x } : { type: 'loyer', ...x });
  }
  return out;
}

// --- L'écran d'attente (à la place du 502) -------------------------------------------------------------------------
// Jules (26 nov. 2026) : « pour remplacer 502 Bad Gateway, mets le jeu des loyers de la rue ». Quand l'écran s'affiche,
// Klocka ne répond plus : le service worker garde de côté, pendant que tout marche, une partie toute prête (les
// manches et leur panorama Street View déjà trouvé). Le panorama d'une adresse se garde en base (PanoramaJeu) : on ne
// redemande pas Google à chaque fois.

export const PANORAMA = 'PanoramaJeu';

async function panoramaGarde(adresse) {
  const cle = norm(adresse);
  const avant = Records.filter(PANORAMA, { cle })[0];
  if (avant) return avant.vide ? null : { pano: avant.pano || null, cap: avant.cap ?? null, lat: avant.lat ?? null, lon: avant.lon ?? null };
  const { panoramaDeAdresse } = await import('./alx/streetview.js');
  const r = await panoramaDeAdresse(adresse).catch(() => null);
  const p = r?.panorama;
  const point = p?.lat ? { lat: p.lat, lon: p.lon } : r?.point ? { lat: r.point.lat, lon: r.point.lon } : null;
  const v = p?.pano || point ? { pano: p?.pano || null, cap: p?.cap ?? null, lat: point?.lat ?? null, lon: point?.lon ?? null } : null;
  Records.create(PANORAMA, { cle, adresse, ...(v || { vide: true }), le: new Date().toISOString() });
  return v;
}

/** Une partie pour l'écran d'attente : des manches alternées dont chacune a de quoi ouvrir Street View sans Klocka. */
export async function partiePourAttente(n = 12) {
  const manches = manchesAlternees(ruesJouables(), await annoncesPrixM2(), n * 2);
  const out = [];
  for (const m of manches) {
    if (out.length >= n) break;
    const vue = m.type === 'loyer' ? await panoramaGarde(m.adresse) : { pano: null, cap: null, lat: m.point.lat, lon: m.point.lon };
    if (!vue) continue;
    out.push({
      type: m.type, adresse: m.adresse, rue: m.rue || null, ville: m.ville || null, vue,
      ...(m.type === 'loyer' ? { loyer: m.loyer, rayon: m.rayon } : { prix_m2: m.prix_m2, surface: m.surface, loue: m.loue, publie_le: m.publie_le }),
    });
  }
  return out;
}
