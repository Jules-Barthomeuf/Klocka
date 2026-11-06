// Les murs libres de la Prospection (3 nov. 2026, Jules : « on ajoute les murs libres, le mode Murs devient Murs
// occupés »). Un local vide n'a plus d'exploitant : il n'est pas dans les commerces du secteur. Il se trouve autrement.
//
// 1. Le recensement des vitrines de la commune (SIRENE, outil Vacance, server/outils/vacance-taux.js) et la même règle
//    que le taux de vacance : un local où plus aucun établissement à vitrine n'est ouvert, le dernier fermé depuis
//    moins de trois ans. Une seule méthode, jamais deux.
// 2. Écarté si un commerce de notre base (Google Maps et registre) est ouvert à la même adresse : le local a été repris.
// 3. Vérifié sur Google Maps à l'ouverture de la fiche (un appel, gardé un mois) : un repreneur, et le point disparaît.
// 4. Le propriétaire des murs, par l'adresse (fichier des locaux des personnes morales), cherché en fond.
// 5. Le terrain : une vitrine vide, un panneau « à louer », signalés au chat par le mandataire (source « terrain »).
//
// Pas de surface ni de rang de rue (n°1, n°1 bis) : rien d'ouvert ne les donne pour un local vide. L'emplacement se
// lit comme pour les murs occupés : la rue est-elle dans la zone commerçante du centre ?
// Ni BureauxLocaux ni Leboncoin : leurs annonces ne se lisent pas sans robot, et un local à louer a déjà son agent.

import crypto from 'crypto';
import { Records } from './db.js';
import { rueLisible, nomLisible } from './off-market/casse.js';

export const ENTITE = 'MurLibre';
export const MOIS_MAX = 36;
const DIX_MINUTES = 10 * 60_000;
const UN_MOIS = 30.44 * 86400000;

// Les boutiques seules (3 nov. 2026) : le recensement compte aussi l'automobile, les services personnels, la photo,
// l'immobilier et l'assurance, souvent des sociétés domiciliées sans vitrine (à Lyon, le premier essai sortait d'abord
// des négociants de voitures). Restent le commerce de détail, la restauration, la boulangerie, la coiffure et la beauté,
// la réparation en boutique.
export const VITRINES_LIBRES = ['47', '56', '10.71', '10.13B', '10.52', '96.02', '96.04', '95.2'];
const enBoutique = (naf) => { const c = String(naf || '').replace(/\./g, ''); return VITRINES_LIBRES.some((p) => c.startsWith(p.replace(/\./g, ''))); };

const suite = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
// Paris, Lyon, Marseille : SIRENE range les établissements par arrondissement, pas sous le code de la ville.
const ARRONDISSEMENTS = { 75056: suite(75101, 75120), 69123: suite(69381, 69389), 13055: suite(13201, 13216) };
/** Pure : les communes du registre pour un code INSEE de ville. */
export const communesDe = (code) => (code ? ARRONDISSEMENTS[code] || [String(code)] : []);

/** Pure : l'identifiant stable d'un local vide (sa commune et sa clé d'adresse). */
export const idLibre = (code, cle) => `libre-${crypto.createHash('sha1').update(`${code}|${cle}`).digest('hex').slice(0, 16)}`;

/** Pure : les mois écoulés depuis une date, arrondis vers le bas. */
export const moisDepuis = (date, maintenantMs = Date.now()) => {
  const t = Date.parse(date);
  return Number.isFinite(t) ? Math.max(0, Math.floor((maintenantMs - t) / UN_MOIS)) : null;
};

/** Pure : « vide depuis 8 mois », « depuis 2 ans ». */
export function depuisQuand(mois) {
  if (mois == null) return null;
  if (mois < 1) return "depuis moins d'un mois";
  if (mois < 24) return `depuis ${mois} mois`;
  return `depuis ${Math.floor(mois / 12)} ans`;
}

/**
 * Pure : les locaux vides d'une commune, depuis son recensement. `occupees` : les clés d'adresse où un commerce de
 * notre base est ouvert ; `voiesCentre` : les voies de la zone commerçante. `etats` : etatsDesLocaux, passé pour que
 * le test se passe de la base.
 */
export function locauxLibres(etablissements, { code, etats, occupees = new Set(), voiesCentre = null, maintenantMs = Date.now(), moisMax = MOIS_MAX, libelle = (x) => x } = {}) {
  const { locaux } = etats(etablissements, [], { lat: 0, lon: 0, rayon_m: Infinity }, { maintenantD: new Date(maintenantMs) });
  const out = [];
  for (const l of locaux) {
    if (l.etat !== 'vacant' || !l.dernier?.ferme_le || !Number.isFinite(l.lat) || occupees.has(l.cle)) continue;
    // Un entrepreneur individuel sans enseigne déclarait souvent son domicile : pas une vitrine.
    if (l.dernier.ei && !l.dernier.enseigne) continue;
    if (!enBoutique(l.dernier.naf)) continue;
    const mois = moisDepuis(l.dernier.ferme_le, maintenantMs);
    if (mois == null || mois > moisMax) continue;
    out.push({
      id: idLibre(code, l.cle), code_commune: code, cle: l.cle, lat: l.lat, lon: l.lon,
      adresse: rueLisible(l.adresse), voie: l.voie,
      dernier: nomLisible(l.dernier.nom), activite: libelle(l.dernier.naf) || null, naf: l.dernier.naf || null,
      ferme_le: l.dernier.ferme_le, mois_vide: mois, confiance: l.confiance || null, raison: l.raison || null,
      centre: voiesCentre ? voiesCentre.has(l.voie) : null, source: 'registre',
    });
  }
  return out;
}

/** Pure : ce que Google Maps dit d'un local que le registre dit vide (la règle du taux de vacance, v1.2). */
export function verdictGoogle(places, dernier, { typesEtage = new Set(), memeCommerce = () => false } = {}) {
  const ouverts = (places || []).filter((x) => x.statut === 'OPERATIONAL' && !typesEtage.has(x.type));
  const repreneurs = ouverts.filter((x) => !memeCommerce(dernier, x.nom));
  if (repreneurs.length) return { etat: 'occupe', texte: `${repreneurs.map((x) => x.nom).join(', ')} y est ouvert sur Google Maps : le local a été repris.` };
  if (ouverts.length) return { etat: 'incertain', texte: `${dernier} est fermé au registre, mais Google Maps l'affiche encore ouvert.` };
  const ferme = (places || []).some((x) => x.statut === 'CLOSED_PERMANENTLY');
  return { etat: 'vacant', texte: ferme ? 'Google Maps le dit fermé définitivement, aucun commerce ouvert à cette adresse.' : 'Aucun commerce ouvert à cette adresse sur Google Maps.' };
}

/** Pure : la phrase d'accroche du premier appel. */
export function accroche(p) {
  const d = depuisQuand(p?.mois_vide);
  return `Votre local${p?.adresse ? ` du ${p.adresse}` : ''} est vide ${d || 'depuis quelques mois'}. Je peux vous trouver un locataire, ou un acheteur.`;
}

// --- Le secteur du mandataire ------------------------------------------------------------------------------

const caches = new Map(); // email → { le, valeur }
const emailDe = (u) => String(u?.email || '').toLowerCase();
export const oublierMursLibres = () => caches.clear();

const enCalcul = new Map(); // email → promesse : deux demandes en même temps partagent un seul calcul
/**
 * Les murs libres du secteur d'un mandataire : gardés dix minutes, recalculés au-delà. `vieuxPermis` : un résultat
 * plus ancien sert tel quel (la fiche d'un local ne relance jamais le calcul du secteur, 3 nov. 2026 : 114 s).
 */
export async function mursLibresDuSecteur(user, { forcer = false, vieuxPermis = false } = {}) {
  const moi = emailDe(user);
  const garde = caches.get(moi);
  if (!forcer && garde && (vieuxPermis || Date.now() - garde.le < DIX_MINUTES)) return habiller(garde.valeur, moi);
  if (!enCalcul.has(moi)) enCalcul.set(moi, calculer(user, moi).finally(() => enCalcul.delete(moi)));
  return enCalcul.get(moi);
}

async function calculer(user, moi) {
  const E = await import('./mandataire-espace.js');
  const secteur = E.secteurDe(user);
  if (!secteur) return { ok: false, error: 'Aucune ville encore : tapez-en une pour commencer.' };
  const P = await import('./mandataire-prospecter.js');
  const V = await import('./outils/vacance-taux.js');
  const { libelleActivite } = await import('./naf.js');
  const { fiches } = await P.villesDuMandataire(secteur, { etats: false });
  const points = [];
  const enPreparation = new Set();
  for (const v of fiches) {
    await new Promise((r) => setImmediate(r));
    const { liste, centreDe } = await P.lireCommerces(v);
    const occupees = new Set(); const voiesCentre = new Set();
    // Les commerces ouverts par leur position aussi (3 nov. 2026, Jules : « marqués libres, mais ouverts sur Maps ») :
    // un numéro bis, une voie écrite autrement ou une adresse sans numéro passaient au travers de la clé d'adresse.
    const grille = new Map();
    for (const c of liste) {
      if (Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
        const g = `${Math.round(c.lat * 5000)}|${Math.round(c.lon * 5000)}`;
        if (!grille.has(g)) grille.set(g, []);
        grille.get(g).push(c);
      }
      const k = V.cleLocal(c.adresse);
      if (!k) continue;
      occupees.add(k);
      if (centreDe(c)) voiesCentre.add(V.voieDe(k));
    }
    for (const code of communesDe(v.code_insee)) {
      await new Promise((r) => setImmediate(r));
      // Une commune pas encore recensée se lit en fond (une à deux minutes) ; la page le dit et se relit.
      const rec = V.recensement(code);
      if (rec.etat !== 'pret') { enPreparation.add(v.nom); continue; }
      const ici = locauxLibres(rec.etablissements, { code, etats: V.etatsDesLocaux, occupees, voiesCentre: voiesCentre.size ? voiesCentre : null, libelle: libelleActivite });
      points.push(...ici.filter((p) => !commerceA(grille, p.lat, p.lon)).map((p) => ({ ...p, ville: v.nom })));
    }
  }
  const villes = new Set(fiches.map((v) => v.nom));
  // Les locaux signalés du terrain, dans les villes du secteur.
  for (const t of Records.filter(ENTITE, { source: 'terrain' })) {
    if (!villes.has(t.ville) || !Number.isFinite(t.lat)) continue;
    points.push({ id: t.id, lat: t.lat, lon: t.lon, adresse: t.adresse, ville: t.ville, activite: null, dernier: null, ferme_le: null, mois_vide: moisDepuis(t.signale_le), source: 'terrain', note: t.note || null, signale_par: t.par || null, centre: null });
  }
  const valeur = { ok: true, villes: [...villes], points, en_preparation: [...enPreparation] };
  caches.set(moi, { le: Date.now(), valeur });
  chercherProprietairesEnFond(points);
  return habiller(valeur, moi);
}

const RAYON_OUVERT_M = 8;
/** Un commerce ouvert de notre base à moins de huit mètres du local : il est occupé. */
function commerceA(grille, lat, lon) {
  const gy = Math.round(lat * 5000); const gx = Math.round(lon * 5000);
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    for (const c of grille.get(`${gy + dy}|${gx + dx}`) || []) {
      const m = Math.hypot((c.lat - lat) * 111320, (c.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180));
      if (m <= RAYON_OUVERT_M) return true;
    }
  }
  return false;
}

const googleConfigure = () => !!(process.env.GOOGLE_MAPS_SERVEUR || '').trim();

/** Ce qui bouge sans recalcul : le propriétaire lu, la vérification Google, les fiches des mandataires. */
function habiller(valeur, moi) {
  if (!valeur.ok) return valeur;
  const lus = new Map(Records.list(ENTITE).map((x) => [x.id, x]));
  const fiches = new Map();
  for (const p of Records.list('ProprietaireMandataire')) if (p.mur_libre_id) fiches.set(p.mur_libre_id, p);
  const points = [];
  let enVerification = 0;
  // Seuls les locaux vérifiés vides sur Google Maps paraissent (3 nov. 2026, Jules) ; les autres se vérifient en fond.
  const verifier = googleConfigure();
  for (const p of valeur.points) {
    const lu = lus.get(p.id) || {};
    if (p.source === 'registre' && verifier && !lu.google) { enVerification += 1; continue; }
    if (lu.google && lu.google.etat !== 'vacant') continue;
    const f = fiches.get(p.id);
    if (f && f.mandataire_email !== moi) continue;
    const pr = lu.proprietaire || null;
    points.push({
      ...p,
      titre: p.adresse || 'Local vide',
      proprietaire: pr?.nom || null, proprietaire_type: pr?.forme || null,
      lien: pr?.nom ? 'connu' : lu.prive ? 'prive' : lu.proprietaire_lu_le ? 'inconnu' : 'en_cours',
      verifie: lu.google ? { etat: lu.google.etat, le: lu.google.le } : null,
      fiche: f ? { id: f.id, statut: f.statut, dans_biens: !['a_appeler', 'contacte', 'en_discussion', 'pas_vendeur'].includes(f.statut) } : null,
      liste: f?.liste_id ? { id: f.liste_id, nom: Records.get('ListeMandataire', f.liste_id)?.nom || 'Ma liste' } : null,
    });
  }
  points.sort((a, b) => (a.mois_vide ?? 99) - (b.mois_vide ?? 99) || String(a.titre).localeCompare(String(b.titre), 'fr'));
  return { ...valeur, points, total: points.length, en_verification: enVerification };
}

/** Google Maps au local (un appel, gardé un mois) : vide, repris, ou encore affiché ouvert. */
export async function verifierGoogle(p) {
  const V = await import('./outils/vacance-taux.js');
  const g = await V.googleAuLocal(p.cle, p.lat, p.lon);
  const v = verdictGoogle(g.places, p.dernier || '', { typesEtage: V.TYPES_ETAGE, memeCommerce: V.memeCommerce });
  return poser(p.id, { google: { ...v, le: new Date().toISOString(), lieux: g.places.map((x) => x.nom).filter(Boolean) } });
}

const fileGoogle = new Map(); // id → point
const fileProprietaires = new Map();
let enMarche = false;
/**
 * En fond, jamais pendant les tests : chaque local d'abord vérifié sur Google Maps (cinq à la fois), puis le
 * propriétaire des murs de ceux qui restent vides, un à la fois.
 */
function chercherProprietairesEnFond(points) {
  if (process.env.NODE_TEST_CONTEXT) return;
  for (const p of points) {
    if (p.source !== 'registre') continue;
    const lu = Records.get(ENTITE, p.id);
    if (googleConfigure() && !lu?.google) fileGoogle.set(p.id, p);
    else if (!lu?.proprietaire_lu_le && (!lu?.google || lu.google.etat === 'vacant')) fileProprietaires.set(p.id, p);
  }
  if (enMarche) return;
  enMarche = true;
  (async () => {
    while (fileGoogle.size) {
      const lot = [...fileGoogle.values()].slice(0, 5);
      await Promise.all(lot.map(async (p) => {
        try { const r = await verifierGoogle(p); if (r?.google?.etat === 'vacant') fileProprietaires.set(p.id, p); }
        catch (err) { console.warn(`[murs-libres] Google Maps ${p.adresse} : ${err?.message || err}`); }
        fileGoogle.delete(p.id);
      }));
    }
    for (const [id, p] of fileProprietaires) {
      try { await lireProprietaire(p); } catch (err) { console.warn(`[murs-libres] propriétaire ${p.adresse} : ${err?.message || err}`); }
      fileProprietaires.delete(id);
      await new Promise((r) => setTimeout(r, 300));
    }
  })().finally(() => { enMarche = false; });
}

function poser(id, champs) {
  if (Records.get(ENTITE, id)) return Records.update(ENTITE, id, champs);
  return Records.create(ENTITE, { id, ...champs });
}

/** Le propriétaire des murs d'un local vide, par l'adresse ; gardé sur le local. */
export async function lireProprietaire(p) {
  const { proprietairesDe } = await import('./alx/foncier-ouvert.js');
  const r = await proprietairesDe(`${p.adresse}, ${p.ville || ''}`, { point: { lat: p.lat, lon: p.lon, code_insee: p.code_commune } });
  const c = r?.choix || null;
  const proprietaire = c ? { nom: nomLisible(c.nom, { forme: c.forme }), forme: c.forme || null, siren: c.siren || null, gerants: c.gerants || [], creation: c.creation || null } : null;
  return poser(p.id, { adresse: p.adresse, ville: p.ville || null, code_commune: p.code_commune, proprietaire, prive: !!r?.prive, parcelle: r?.parcelle || null, proprietaire_lu_le: new Date().toISOString() });
}

/** Le point d'un local vide du secteur du mandataire, ou null. */
async function pointDe(user, id) {
  const r = await mursLibresDuSecteur(user, { vieuxPermis: true });
  return r.ok ? r.points.find((x) => x.id === id) || null : null;
}

/**
 * La fiche d'un local vide : depuis quand et selon quoi, la dernière activité, le propriétaire (sa société, ses
 * gérants et leur âge), la valeur locative du secteur, l'accroche. Google Maps est consulté une fois, à l'ouverture.
 */
export async function ficheMurLibre(user, id) {
  const p = await pointDe(user, id);
  if (!p) return { ok: false, statut: 404, error: 'Ce local n\'est plus dans votre secteur, ou il a été repris.' };
  let lu = Records.get(ENTITE, id) || {};
  if (p.source === 'registre' && !lu.google && googleConfigure()) {
    try { lu = await verifierGoogle(p); } catch (err) { console.warn(`[murs-libres] Google Maps : ${err?.message || err}`); }
  }
  if (p.source === 'registre' && !lu.proprietaire_lu_le) {
    try { lu = await Promise.race([lireProprietaire(p), new Promise((ok) => { setTimeout(() => ok(lu), 15000).unref?.(); })]) || lu; } catch { /* la fiche s'affiche sans */ }
  }
  // La société propriétaire : sa forme, ses gérants et leur âge (annuaire des entreprises).
  let societe = null;
  if (lu.proprietaire?.siren) {
    try {
      const { societe: lire } = await import('./alx/annuaire.js');
      const s = await lire({ siren: lu.proprietaire.siren });
      if (s) societe = { nom: s.nom, forme: s.forme, creation: s.creation || null, gerants: (s.gerants || []).slice(0, 3).map((g) => ({ nom: g.nom, qualite: g.qualite || null, tranche_age: g.tranche_age || null })) };
    } catch { /* l'annuaire indisponible n'empêche pas la fiche */ }
  }
  // La valeur locative du secteur : Data-B, Equimmox en repli, gardée une semaine sur le local.
  let marche = lu.valeur_locative?.le && Date.now() - Date.parse(lu.valeur_locative.le) < 7 * 86400000 ? lu.valeur_locative.resultat : null;
  if (!marche) {
    try {
      const { lireValeurLocative } = await import('./mandataire-avis.js');
      marche = await Promise.race([lireValeurLocative(`${p.adresse}, ${p.ville}`, user, { bavard: false }), new Promise((ok) => { setTimeout(() => ok(null), 12000).unref?.(); })]);
      if (marche) poser(id, { valeur_locative: { le: new Date().toISOString(), resultat: marche } });
    } catch { /* sans valeur locative, la ligne le dit */ }
  }
  const niveau = marche?.rue || marche?.quartier || marche?.ville || null;
  // Repris d'après Google Maps : le local quitte la carte, la fiche le dit au lieu de le présenter vide.
  const repris = lu.google?.etat === 'occupe';
  const point = (repris ? null : await pointDe(user, id)) || p;
  const ferme = point.ferme_le ? new Date(point.ferme_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const registre = point.dernier && ferme ? `Le dernier commerce, ${point.dernier}, a fermé le ${ferme} ; aucun n'a ouvert depuis au registre des entreprises.` : point.raison;
  return {
    ok: true,
    local: {
      ...point,
      depuis: depuisQuand(point.mois_vide),
      repris,
      pourquoi: point.source === 'terrain' ? `Signalé sur le terrain${point.note ? ` : ${point.note}` : ''}.` : [registre, lu.google?.texte].filter(Boolean).join(' '),
      source_texte: point.source === 'terrain' ? 'Terrain' : lu.google ? 'Registre des entreprises, vérifié sur Google Maps' : 'Registre des entreprises',
      proprietaire: lu.proprietaire || null, prive: !!lu.prive, proprietaire_lu: !!lu.proprietaire_lu_le,
      societe,
      valeur_locative: niveau ? { basse: niveau.basse ?? null, haute: niveau.haute ?? null, ou: marche.rue ? 'rue' : marche.quartier ? 'quartier' : 'ville', source: /equimmox/i.test(marche.source || '') ? 'Equimmox' : 'Data-B' } : null,
      accroche: accroche(point),
    },
  };
}

/** « Ajouter à ma liste » : la fiche du propriétaire des murs naît, un local libre à faire estimer. */
export async function ajouterALaListe(user, id, { liste_id = null, nom = null } = {}) {
  const p = await pointDe(user, id);
  if (!p) return { ok: false, error: 'Ce local n\'est plus dans votre secteur.' };
  const deja = Records.list('ProprietaireMandataire').find((x) => x.mur_libre_id === id);
  if (deja && deja.mandataire_email !== emailDe(user)) return { ok: false, error: 'Ce local est déjà suivi par un autre mandataire.' };
  const lu = Records.get(ENTITE, id) || {};
  let fiche = deja;
  if (!fiche) {
    const { creerProprietaire } = await import('./mandataire-espace.js');
    const r = creerProprietaire({ nom: lu.proprietaire?.nom || null, commerce: `Local vide, ${p.adresse}`, activite: p.activite ? `Ancien : ${p.activite}` : null, ville: p.ville, adresse: p.adresse }, user);
    if (!r.ok) return r;
    fiche = Records.update('ProprietaireMandataire', r.proprietaire.id, { mur_libre_id: id, type_bien: 'murs_commerce', libre: true, source: 'Murs libres', vide_depuis: p.ferme_le || null });
  }
  const { changerDeListe } = await import('./off-market/simple.js');
  const l = changerDeListe(fiche.id, { liste_id, nom, user });
  if (!l.ok) return l;
  return { ok: true, fiche: { id: fiche.id }, liste: l.liste || null };
}

/** Un local vide vu sur le terrain (vitrine vide, panneau « à louer ») : il entre sur la carte des murs libres. */
export async function signalerLocalVide(user, { adresse, note = null } = {}) {
  const texte = String(adresse || '').trim();
  if (texte.length < 5) return { ok: false, error: 'Il faut l\'adresse du local : numéro, rue, ville.' };
  const { resoudreAdresse } = await import('./adresse-ban.js');
  const a = await resoudreAdresse(texte);
  if (!a) return { ok: false, error: `Adresse introuvable : « ${texte.slice(0, 80)} ».` };
  const id = `libre-terrain-${crypto.createHash('sha1').update(`${a.code_insee}|${a.label}`).digest('hex').slice(0, 12)}`;
  const r = poser(id, { source: 'terrain', adresse: rueLisible([a.numero, a.rue].filter(Boolean).join(' ')), ville: a.ville, code_commune: a.code_insee, lat: a.lat, lon: a.lon, note: note ? String(note).slice(0, 300) : null, par: emailDe(user), signale_le: new Date().toISOString() });
  caches.delete(emailDe(user));
  return { ok: true, local: { id: r.id, adresse: r.adresse, ville: r.ville } };
}
