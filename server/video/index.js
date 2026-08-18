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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPERTOIRE_VIDEOS = path.join(__dirname, '..', 'uploads', 'videos');
const ENTREE_REMOTION = path.join(__dirname, 'remotion', 'racine.jsx');

const travaux = new Map(); // "dealId:lot" -> { etat, progression, url, erreur }

const cle = (dealId, lotIndex) => `${dealId}:${lotIndex}`;
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

  (async () => {
    const [{ renderMedia, selectComposition }, serveUrl] = await Promise.all([
      import('@remotion/renderer'),
      obtenirBundle(),
    ]);
    const inputProps = proprietesVideo(lot);
    const composition = await selectComposition({ serveUrl, id: 'presentation-deal', inputProps });
    fs.mkdirSync(REPERTOIRE_VIDEOS, { recursive: true });
    const fichier = nomFichier(dossier.deal_id, lotIndex);
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      inputProps,
      outputLocation: path.join(REPERTOIRE_VIDEOS, fichier),
      onProgress: ({ progress }) => { travail.progression = progress; },
    });
    travail.etat = 'pret';
    travail.progression = 1;
    travail.url = `/uploads/videos/${fichier}`;
  })().catch((e) => {
    console.error('[video] rendu échoué :', e);
    travail.etat = 'erreur';
    travail.erreur = e?.message || 'Rendu impossible';
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
  return { etat: 'aucune', progression: 0, url: null, erreur: null };
}
