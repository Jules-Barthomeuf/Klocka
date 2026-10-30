// Les villes d'un secteur se lisent d'elles-mêmes (24 oct. 2026, Jules :
// « construis ça »). Un secteur tracé ou réattribué, une Ville Klocka ajoutée,
// une commune cochée par le mandataire : les villes où il prospecte (les Villes
// Klocka de son secteur, puis les communes qu'il a cochées ; décision du 5 oct.,
// jamais un tri par population) sont créées si Klocka ne les connaît pas, avec
// leur centre, puis lues en fond : les commerces du registre, leurs
// propriétaires, leurs prix. Elles entrent alors dans son secteur, l'Off-market
// et « Pour mes clients ».
//
// Une ville à la fois : chaque lecture lance ses recherches de propriétaires
// et Google Maps (un passage tous les 90 jours) ; plusieurs villes en même
// temps chargeraient les registres et la mémoire du serveur.

import { Records } from './db.js';

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const maintenant = () => new Date().toISOString();

// Une ville lue a ses commerces, lus il y a moins de trente jours (au-delà, lireVilleSimple les relit).
const TRENTE_JOURS = 30 * 86400000;
// Une ville lue a au moins un commerce : on le demande à la base sans charger ses fiches (30 oct. 2026 : 4 s pour 11 villes).
export const estLue = (v) => !!v?.simple?.lu_le && Date.now() - Date.parse(v.simple.lu_le) < TRENTE_JOURS && Records.existe('CommerceSimple', 'ville_id', v.id);

const file = [];
const enFile = new Set();
// Une lecture qui échoue (l'annuaire répond 503, le réseau tombe) revient en file plus tard : 10, 20 puis 40 minutes.
const tentatives = new Map();
export const REPRISES = 3;
export const delaiDeReprise = (n) => 10 * 60_000 * 2 ** Math.max(0, n - 1);
let enCours = null;
let boucle = null;

/** L'état de lecture d'une ville, pour l'écran : lue, en lecture, en attente, à lire. */
export function etatVille(v) {
  if (!v) return 'a_lire';
  if (enCours === v.id) return 'en_lecture';
  if (enFile.has(v.id)) return 'en_attente';
  return estLue(v) ? 'lue' : 'a_lire';
}

/**
 * Les villes choisies par Klocka pour un secteur (24 oct. 2026, Jules : « quand on crée un secteur, on doit avoir
 * toutes les villes et sélectionner celles qui nous intéressent ») : là, et seulement là, que le mandataire prospecte
 * « pour mes clients ». Rien de choisi : aucune.
 */
export const villesChoisies = (secteur) => (Array.isArray(secteur?.villes_choisies) ? secteur.villes_choisies : []);

/** Toutes les communes d'un secteur, pour le choix de l'équipe : population, Ville Klocka ou non, choisie ou non. */
export async function communesDuChoix(secteur) {
  const { communesDuSecteur } = await import('./mandataire-agent.js');
  const { villesKlocka } = await import('./villes-klocka.js');
  const klocka = new Set(villesKlocka().map((v) => v.code));
  const choisies = new Set(villesChoisies(secteur).map((v) => v.code || norm(v.nom)));
  return (await communesDuSecteur(secteur)).map((c) => ({ nom: c.nom, code: c.code || null, population: c.population || null, klocka: klocka.has(c.code), choisie: choisies.has(c.code || norm(c.nom)) }));
}

/** L'équipe choisit les villes d'un secteur : seulement des communes de son contour. */
export async function choisirVilles(secteurId, codes = [], user = null) {
  const s = Records.get('SecteurMandataire', secteurId);
  if (!s) return { ok: false, error: 'Secteur introuvable.' };
  const voulues = new Set((Array.isArray(codes) ? codes : []).map(String));
  const communes = await communesDuChoix(s);
  const gardees = communes.filter((c) => voulues.has(c.code || '') || voulues.has(norm(c.nom))).map((c) => ({ nom: c.nom, code: c.code }));
  const maj = Records.update('SecteurMandataire', s.id, {
    villes_choisies: gardees,
    historique: [...(s.historique || []), { le: maintenant(), par: user?.email || null, action: `villes : ${gardees.map((v) => v.nom).join(', ') || 'aucune'}` }],
  });
  return { ok: true, secteur: maj, villes: gardees };
}

/**
 * Les communes à lire pour un secteur : les villes choisies par Klocka ; avant tout choix, les Villes Klocka de son
 * contour et les communes cochées par le mandataire (le réglage de l'agent, 5 oct. 2026).
 */
export async function communesALire(secteur) {
  if (villesChoisies(secteur).length) return villesChoisies(secteur).map((v) => ({ nom: v.nom, code: v.code || null }));
  const { communesDuSecteur } = await import('./mandataire-agent.js');
  const { villesKlocka, rangerCommunes } = await import('./villes-klocka.js');
  const r = rangerCommunes(await communesDuSecteur(secteur), villesKlocka(), secteur.communes_activite || []);
  return [...r.klocka, ...r.autres.filter((c) => c.choisie)].map((c) => ({ nom: c.nom, code: c.code || null }));
}

/** La fiche Ville d'une commune : retrouvée par son code ou son nom, sinon créée ; son centre posé s'il manque. */
export async function assurerVille({ nom, code = null }, { lire = fetch } = {}) {
  let v = Records.list('Ville').find((x) => (code && x.code_insee === code) || norm(x.nom) === norm(nom)) || null;
  if (!v) {
    const { creerVille } = await import('./alx/index.js');
    const r = creerVille({ nom, user: { email: 'secteur' } });
    if (!r.ok) return null;
    v = r.ville;
  }
  if (v.centre?.lat != null && v.code_insee) return v;
  try {
    const url = code
      ? `https://geo.api.gouv.fr/communes/${encodeURIComponent(code)}?fields=nom,code,centre,codesPostaux`
      : `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(nom)}&fields=nom,code,centre,codesPostaux&boost=population&limit=1`;
    const rep = await lire(url, { signal: AbortSignal.timeout(8000) });
    const j = rep.ok ? await rep.json() : null;
    const c = Array.isArray(j) ? j[0] : j;
    const [lon, lat] = c?.centre?.coordinates || [];
    if (lat == null) return v.centre?.lat != null ? v : null;
    v = Records.update('Ville', v.id, {
      ...(v.centre?.lat != null ? {} : { centre: { lat, lon } }),
      code_insee: v.code_insee || c.code || null,
      code_postal: v.code_postal || c.codesPostaux?.[0] || null,
    });
    return v;
  } catch {
    return v.centre?.lat != null ? v : null;
  }
}

/** Met une ville dans la file de lecture (une seule fois). `neuf` : un geste de l'équipe ou du mandataire, les essais repartent de zéro. */
export function enfiler(villeId, { neuf = false } = {}) {
  if (neuf) tentatives.delete(villeId);
  if (!villeId || enFile.has(villeId) || enCours === villeId || process.env.NODE_TEST_CONTEXT) return false;
  file.push(villeId);
  enFile.add(villeId);
  if (!boucle) boucle = tourner().finally(() => { boucle = null; });
  return true;
}

const attendre = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });

/** La file : une ville lue, ses propriétaires cherchés jusqu'au bout (trois heures au plus), puis ses prix ; puis la suivante. */
async function tourner() {
  const S = await import('./off-market/simple.js');
  while (file.length) {
    const id = file.shift();
    enFile.delete(id);
    enCours = id;
    const nom = Records.get('Ville', id)?.nom || id;
    let echec = null;
    try {
      const r = await S.lireVilleSimple(id);
      console.log(`[villes du secteur] ${nom} : ${r.ok ? `${r.n} commerces` : r.error}`);
      // La ville suivante n'attend plus que les propriétaires de celle-ci soient tous cherchés (24 oct. 2026) : la
      // recherche des propriétaires partage ses créneaux entre les villes, les prix démarrent tout de suite.
      if (r.ok) {
        tentatives.delete(id);
        S.demarrerPrix(id);
      } else echec = r.error;
    } catch (e) {
      echec = e?.message || String(e);
    }
    enCours = null;
    if (echec) {
      const n = (tentatives.get(id) || 0) + 1;
      tentatives.set(id, n);
      if (n <= REPRISES) {
        console.warn(`[villes du secteur] ${nom} : ${echec} ; nouvel essai dans ${Math.round(delaiDeReprise(n) / 60_000)} min (${n}/${REPRISES})`);
        setTimeout(() => enfiler(id), delaiDeReprise(n)).unref?.();
      } else console.warn(`[villes du secteur] ${nom} : ${echec} ; abandonné après ${REPRISES} essais (relancé au prochain démarrage ou geste sur le secteur)`);
    }
    // Les villes s'espacent : l'annuaire n'aime pas les rafales.
    if (file.length) await attendre(5_000);
  }
}

/**
 * Les villes d'un secteur : créées si besoin, celles qui ne sont pas lues mises en file. Renvoie chaque ville avec son
 * état, et les noms de celles qui viennent d'être lancées.
 */
export async function lireLeSecteur(secteur) {
  if (!secteur) return { villes: [], lancees: [] };
  const communes = await communesALire(secteur);
  const villes = [];
  const lancees = [];
  for (const c of communes) {
    const v = await assurerVille(c);
    if (!v) { villes.push({ nom: c.nom, etat: 'introuvable' }); continue; }
    if (!estLue(v) && enfiler(v.id, { neuf: true })) lancees.push(v.nom);
    villes.push({ id: v.id, nom: v.nom, etat: etatVille(v) });
  }
  return { villes, lancees };
}

/** Après un geste de l'équipe ou du mandataire : lire en fond, et dire à qui l'a fait ce qui part en lecture. */
export function lireEnFond(secteur, { pour = null } = {}) {
  if (!secteur || process.env.NODE_TEST_CONTEXT) return;
  lireLeSecteur(secteur)
    .then(async ({ lancees }) => {
      if (!lancees.length || !pour) return;
      const { notifier } = await import('./notifications.js');
      notifier({ pour, titre: `Secteur ${secteur.nom} : ${lancees.length} ville${lancees.length > 1 ? 's' : ''} en lecture`, texte: `${lancees.join(', ')}. Les commerces, leurs propriétaires puis leurs prix arrivent en fond, une ville après l'autre.`, genre: 'info', cle: `secteur-lecture:${secteur.id}:${lancees.join('|')}:${maintenant().slice(0, 13)}` });
    })
    .catch((e) => console.warn(`[villes du secteur] ${secteur.nom} : ${e?.message || e}`));
}

/** Tous les secteurs qui ont des villes choisies, ou un mandataire (au démarrage, et quand une Ville Klocka change). */
export function lireTousLesSecteurs({ pour = null } = {}) {
  for (const s of Records.list('SecteurMandataire').filter((x) => x.mandataire_email || villesChoisies(x).length)) lireEnFond(s, { pour });
}

/**
 * L'entretien (24 oct. 2026, Jules : « on fait le setup pour lui, ça lance tout ce qu'il faut ; le mandataire n'a pas
 * à attendre ») : pour chaque ville des secteurs, une lecture si elle manque ou date de plus de trente jours, la
 * recherche des propriétaires qui en reste, et l'estimation des prix (les cibles d'abord), relancée chaque jour
 * puisqu'elle s'arrête au plafond de rues neuves du jour. Rien de ce qui tourne déjà n'est lancé deux fois.
 */
export async function entretenir() {
  const S = await import('./off-market/simple.js');
  lireTousLesSecteurs();
  for (const s of Records.list('SecteurMandataire').filter((x) => x.mandataire_email || villesChoisies(x).length)) {
    for (const c of await communesALire(s).catch(() => [])) {
      const v = Records.list('Ville').find((x) => (c.code && x.code_insee === c.code) || norm(x.nom) === norm(c.nom));
      if (!v || !estLue(v) || enCours === v.id || enFile.has(v.id)) continue;
      const e = S.etatDe(v.id);
      if (e.a_faire > 0 && !e.en_fond) S.demarrerFond(v.id);
      if (!e.prix_en_cours) S.demarrerPrix(v.id);
    }
  }
}

/** L'entretien toutes les trente minutes, une minute après le démarrage. VILLES_SECTEUR=0 l'arrête. */
export function planifier() {
  if (process.env.VILLES_SECTEUR === '0' || process.env.NODE_TEST_CONTEXT) return null;
  const tour = () => entretenir().catch((e) => console.warn(`[villes du secteur] entretien : ${e?.message || e}`));
  setTimeout(tour, 60_000).unref?.();
  const t = setInterval(tour, 30 * 60_000);
  t.unref?.();
  return t;
}

/** Où en est la préparation d'une ville, pour l'écran : lecture, propriétaires, prix. */
export async function preparation(v) {
  if (!v) return null;
  const S = await import('./off-market/simple.js');
  const e = S.etatDe(v.id);
  return { etat: etatVille(v), commerces: e.total, proprietaires_faits: e.faits, proprietaires_a_faire: e.a_faire + e.en_cours, avec_prix: e.avec_prix, en_cours: etatVille(v) !== 'lue' || e.en_fond || e.prix_en_cours };
}
