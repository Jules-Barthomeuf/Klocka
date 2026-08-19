// Vidéo de présentation client (~30 s) rendue avec Remotion.
//
// Le rendu (bundle webpack + Chrome headless) prend une à quelques minutes :
// il tourne en arrière-plan. Un registre en mémoire suit la progression ; le
// MP4 fini est posé dans server/uploads/videos/ (servi par /uploads) — il
// survit donc à un redémarrage, seul l'état "en cours" est volatil.
//
// Même invariant que les rédacteurs LLM : la vidéo est construite depuis la
// vue consolidée (vueRedacteur), et n'expose QUE des faits (bien, chiffres,
// bail, ville) — jamais le verdict ni les réserves, internes à l'analyse.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { vueRedacteur } from '../deal/redact.js';
import { Meta } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPERTOIRE_VIDEOS = path.join(__dirname, '..', 'uploads', 'videos');
const ENTREE_REMOTION = path.join(__dirname, 'remotion', 'racine.jsx');

// Même critère que le serveur : APP_URL en https = déploiement (petite
// instance) — on y économise la RAM plutôt que la vitesse.
const EN_PRODUCTION = (process.env.APP_URL || '').startsWith('https://');

const travaux = new Map(); // "dealId:lot" -> { etat, progression, url, erreur }

const cle = (dealId, lotIndex) => `${dealId}:${lotIndex}`;

// L'état terminal du rendu vit aussi en base : si le processus meurt en plein
// rendu (OOM sur petite instance), le prochain statutVideo() peut le dire au
// lieu de retomber silencieusement sur « aucune ».
const cleMeta = (dealId, lotIndex) => `video:${cle(dealId, lotIndex)}`;
const ecrireEtatPersiste = (dealId, lotIndex, etat) => {
  try { Meta.set(cleMeta(dealId, lotIndex), JSON.stringify(etat)); } catch { /* jamais bloquant */ }
};
const lireEtatPersiste = (dealId, lotIndex) => {
  try {
    const v = Meta.get(cleMeta(dealId, lotIndex));
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};
const nomFichier = (dealId, lotIndex) =>
  `${String(dealId).replace(/[^a-zA-Z0-9_-]/g, '_')}-lot${lotIndex}.mp4`;

// Le bundle webpack de la composition est identique pour toutes les vidéos :
// on ne le construit qu'une fois par vie du processus.
let bundlePromise = null;
function obtenirBundle() {
  if (!bundlePromise) {
    bundlePromise = import('@remotion/bundler').then(({ bundle }) =>
      bundle({ entryPoint: ENTREE_REMOTION })
    );
    // Un échec de bundle ne doit pas empoisonner les tentatives suivantes.
    bundlePromise.catch(() => { bundlePromise = null; });
  }
  return bundlePromise;
}

/** Réduit un lot aux faits présentables au client. */
export function proprietesVideo(lot) {
  const vue = vueRedacteur({ lot: lot.lot, enrichissement: lot.enrichissement, evaluation: lot.evaluation });
  return {
    type_actif: vue.bien.type_actif,
    commune: vue.marche.commune,
    adresse: vue.bien.adresse?.rue || (typeof vue.bien.adresse === 'string' ? vue.bien.adresse : null),
    surface_m2: vue.bien.surface_m2,
    locataire: vue.bien.locataire,
    activite: vue.bien.activite,
    bail_type: vue.bien.bail_type,
    bail_echeance: vue.bien.bail_echeance,
    annees_bail_restantes: vue.bien.annees_bail_restantes,
    prix_fai: vue.finances.prix_fai,
    loyer_annuel: vue.finances.loyer_annuel_ht_hc,
    rendement: vue.finances.rendement_fai ?? vue.finances.rendement_annonce,
    population: vue.marche.population,
    typologie_ville: vue.marche.typologie_ville,
  };
}

/**
 * Géolocalise le bien pour la scène d'ouverture cartographique (plongée
 * France → adresse). API Adresse data.gouv (BAN) : gratuite, sans clé,
 * couvre la France. Meilleur effort : null en cas d'échec, la vidéo se rend
 * alors sans la scène carte — jamais d'échec de rendu pour une carte.
 */
async function geocoderPourCarte({ adresse, commune }) {
  const q = [adresse, commune].filter(Boolean).join(', ');
  if (!q) return null;
  try {
    const url =
      'https://api-adresse.data.gouv.fr/search/?limit=1&q=' +
      encodeURIComponent(q) +
      (adresse ? '' : '&type=municipality');
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const f = (await r.json()).features?.[0];
    if (!f || (f.properties?.score ?? 0) < 0.35) return null;
    const [lon, lat] = f.geometry.coordinates;
    // Adresse au numéro/à la rue : plongée jusqu'au sol ; commune seule : on
    // s'arrête à la vue de la ville.
    const precis = adresse && ['housenumber', 'street', 'locality'].includes(f.properties?.type);
    return { lat, lon, zoom: precis ? 17 : 14, libelle: f.properties?.label || q };
  } catch (e) {
    console.warn('[video] géocodage impossible :', e?.message || e);
    return null;
  }
}

/**
 * Lance (ou rejoint) le rendu de la vidéo d'un lot. Retourne l'état courant
 * immédiatement ; la progression se suit via statutVideo().
 */
export function lancerVideoLot(dossier, lotIndex) {
  const lot = dossier.lots?.[lotIndex];
  if (!lot) return { error: 'Lot introuvable' };

  const k = cle(dossier.deal_id, lotIndex);
  const enCours = travaux.get(k);
  if (enCours?.etat === 'en_cours') return { ...enCours };

  const travail = { etat: 'en_cours', progression: 0, url: null, erreur: null };
  travaux.set(k, travail);
  ecrireEtatPersiste(dossier.deal_id, lotIndex, { etat: 'en_cours', demarre_le: new Date().toISOString() });

  (async () => {
    const [{ renderMedia, selectComposition }, serveUrl] = await Promise.all([
      import('@remotion/renderer'),
      obtenirBundle(),
    ]);
    const base = proprietesVideo(lot);
    const carte = await geocoderPourCarte(base);
    const inputProps = carte ? { ...base, carte } : base;
    const composition = await selectComposition({ serveUrl, id: 'presentation-deal', inputProps });
    fs.mkdirSync(REPERTOIRE_VIDEOS, { recursive: true });
    const fichier = nomFichier(dossier.deal_id, lotIndex);
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      inputProps,
      outputLocation: path.join(REPERTOIRE_VIDEOS, fichier),
      // La composition reste dessinée en 1920×1080 (timings et mise en page
      // intacts) mais le MP4 sort en 1280×720 : ~2,25× moins de pixels à
      // peindre et encoder — décisif sur une petite instance.
      scale: 2 / 3,
      // En production, un seul onglet Chrome : la vitesse y est bornée par le
      // CPU de toute façon, autant limiter la RAM (première cause d'OOM).
      concurrency: EN_PRODUCTION ? 1 : null,
      onProgress: ({ progress }) => { travail.progression = progress; },
    });
    travail.etat = 'pret';
    travail.progression = 1;
    travail.url = `/uploads/videos/${fichier}`;
    ecrireEtatPersiste(dossier.deal_id, lotIndex, { etat: 'pret' });
  })().catch((e) => {
    console.error('[video] rendu échoué :', e);
    travail.etat = 'erreur';
    travail.erreur = e?.message || 'Rendu impossible';
    ecrireEtatPersiste(dossier.deal_id, lotIndex, { etat: 'erreur', erreur: travail.erreur });
  });

  return { ...travail };
}

/** État du rendu : en_cours / pret / erreur / aucune. */
export function statutVideo(dealId, lotIndex) {
  const travail = travaux.get(cle(dealId, lotIndex));
  if (travail) return { ...travail };
  // Pas de travail en mémoire (redémarrage ?) mais un MP4 déjà rendu compte.
  const fichier = nomFichier(dealId, lotIndex);
  if (fs.existsSync(path.join(REPERTOIRE_VIDEOS, fichier))) {
    return { etat: 'pret', progression: 1, url: `/uploads/videos/${fichier}`, erreur: null };
  }
  // Ni en mémoire ni sur disque : l'état persistant dit si un rendu a été
  // interrompu (processus tué en cours de route) ou avait échoué.
  const persiste = lireEtatPersiste(dealId, lotIndex);
  if (persiste?.etat === 'en_cours') {
    const erreur = 'interrompu par un redémarrage du serveur — relancez la génération';
    ecrireEtatPersiste(dealId, lotIndex, { etat: 'erreur', erreur });
    return { etat: 'erreur', progression: 0, url: null, erreur };
  }
  if (persiste?.etat === 'erreur') {
    return { etat: 'erreur', progression: 0, url: null, erreur: persiste.erreur || 'Rendu impossible' };
  }
  return { etat: 'aucune', progression: 0, url: null, erreur: null };
}

/**
 * Préchauffage : télécharge le Chrome headless de Remotion et construit le
 * bundle webpack sans attendre le premier clic. En production (disque
 * éphémère), ces deux étapes sont repayées à chaque redémarrage d'instance —
 * autant les faire pendant que personne n'attend.
 */
export function prechaufferVideo() {
  (async () => {
    const { ensureBrowser } = await import('@remotion/renderer');
    await ensureBrowser();
    await obtenirBundle();
    console.log('[video] préchauffage terminé (navigateur + bundle)');
  })().catch((e) => console.warn('[video] préchauffage impossible :', e?.message || e));
}
