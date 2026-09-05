// Teaser client (~20 s) rendu avec Remotion.
//
// Le rendu (bundle webpack + Chrome headless) prend une à quelques minutes :
// il tourne en arrière-plan. Un registre en mémoire suit la progression ; le
// MP4 fini est posé dans server/uploads/videos/ (servi par /uploads) — il
// survit donc à un redémarrage, seul l'état "en cours" est volatil.
//
// Même invariant que les rédacteurs LLM : la vidéo est construite depuis la
// vue consolidée (vueRedacteur) et les chiffres du moteur du simulateur. Elle
// n'expose QUE des faits — jamais le verdict ni les réserves, internes à
// l'analyse.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { vueRedacteur } from '../deal/redact.js';
import { indicateursCles } from './indicateurs.js';
import { geocoder } from '../deal/geocodage.js';
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

// Photo de devanture : Street View sur l'adresse du bien. La vue est cadrée
// depuis la rue, c'est bien la façade que voit un passant. Sans clé ou sans
// couverture, la scène s'efface — jamais de rendu en échec pour une image.
const CLE_MAPS = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

async function devantureStreetView({ lat, lon }) {
  if (!CLE_MAPS) return { url: null, raison: 'aucune clé Google Maps (VITE_GOOGLE_MAPS_API_KEY) : pas de façade Street View' };
  if (lat == null || lon == null) return { url: null, raison: null };
  const position = `${lat},${lon}`;
  try {
    // Les métadonnées disent si une prise de vue existe, sans consommer de quota.
    const meta = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${position}&key=${CLE_MAPS}`
    ).then((r) => r.json());
    if (meta?.status !== 'OK') {
      // REQUEST_DENIED = l'API Street View Static n'est pas activée sur la clé.
      // Le teaser se rend sans façade, mais l'exploitant doit pouvoir le savoir.
      if (meta?.status === 'ZERO_RESULTS') return { url: null, raison: 'pas de prise de vue Street View à cette adresse' };
      const raison =
        meta?.status === 'REQUEST_DENIED'
          ? "l'API « Street View Static » n'est pas activée sur le projet Google Cloud de la clé : la façade en 3D attend cette activation"
          : `Street View indisponible (${meta?.status || 'sans réponse'})`;
      console.warn(`[video] devanture indisponible (${meta?.status})${meta?.error_message ? ` : ${meta.error_message}` : ''}`);
      return { url: null, raison };
    }
    return {
      url:
        `https://maps.googleapis.com/maps/api/streetview?size=1280x720&location=${position}` +
        `&fov=75&pitch=8&source=outdoor&key=${CLE_MAPS}`,
      raison: null,
    };
  } catch (e) {
    return { url: null, raison: `Street View injoignable : ${e?.message || e}` };
  }
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
    // Les quatre chiffres du teaser, issus du moteur du simulateur.
    cles: indicateursCles(lot),
  };
}

/**
 * Géolocalise le bien pour la scène d'ouverture cartographique (plongée
 * France → adresse). Le zoom d'arrivée dépend de la précision obtenue :
 * jusqu'au sol sur une adresse, vue de ville sur une commune seule.
 */
async function geocoderPourCarte({ adresse, commune }) {
  const r = await geocoder({ adresse, commune });
  return r ? { lat: r.lat, lon: r.lon, zoom: r.precis ? 17 : 14, libelle: r.libelle } : null;
}

/**
 * Lance (ou rejoint) le rendu de la vidéo d'un lot. Retourne l'état courant
 * immédiatement ; la progression se suit via statutVideo().
 */
export function lancerVideoLot(dossier, lotIndex) {
  const lot = dossier.lots?.[lotIndex];
  if (!lot) return { error: "Ce dossier n'a pas encore de bien analysé : la vidéo a besoin d'une adresse. Passez par la pré-analyse d'abord." };

  const k = cle(dossier.deal_id, lotIndex);
  const enCours = travaux.get(k);
  if (enCours?.etat === 'en_cours') return { ...enCours };

  const travail = { etat: 'en_cours', progression: 0, url: null, erreur: null, avertissements: [] };
  travaux.set(k, travail);
  ecrireEtatPersiste(dossier.deal_id, lotIndex, { etat: 'en_cours', demarre_le: new Date().toISOString() });

  (async () => {
    const [{ renderMedia, selectComposition }, serveUrl] = await Promise.all([
      import('@remotion/renderer'),
      obtenirBundle(),
    ]);
    const base = proprietesVideo(lot);
    const carte = await geocoderPourCarte(base);
    // La devanture se cadre sur les coordonnées du géocodage : sans adresse
    // précise, pas de façade — on ne montre pas la rue d'à côté.
    const facade = carte?.zoom >= 17 ? await devantureStreetView(carte) : { url: null, raison: carte ? "adresse trop imprécise pour une façade : la plongée s'arrête sur la ville" : 'bien non géolocalisé' };
    const devanture = facade.url;
    // Ce qui manque à la vidéo se dit : sinon on croit la 3D en panne.
    if (facade.raison) {
      travail.avertissements = [
        `Façade Street View absente — ${facade.raison}.${carte?.zoom >= 17 ? ' La vidéo montre la vue aérienne IGN en 3D à la place.' : ''}`,
      ];
    }
    const inputProps = { ...base, ...(carte ? { carte } : {}), ...(devanture ? { devanture } : {}) };
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
    ecrireEtatPersiste(dossier.deal_id, lotIndex, { etat: 'pret', avertissements: travail.avertissements || [] });
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
    const persiste = lireEtatPersiste(dealId, lotIndex);
    return { etat: 'pret', progression: 1, url: `/uploads/videos/${fichier}`, erreur: null, avertissements: persiste?.avertissements || [] };
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
