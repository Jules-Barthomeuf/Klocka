// Orchestration du pipeline de préanalyse.
//
//   [1] ingestion  -> texte source (LLM toléré uniquement pour transcrire un scan)
//   [2] extraction -> schéma imposé + garde-fou de citation littérale
//   [3] enrichissement + calculs + règles -> code déterministe, VERDICT
//   [4] rédaction  -> LLM, sans accès aux sources
//
// Le verdict est arrêté à l'étape 3. Les étapes 2 et 4 ne peuvent ni le
// produire ni le modifier.

import { randomUUID } from 'crypto';
import { Records } from '../db.js';
import { ingerer, archiverSource } from './ingest.js';
import { extraire, lotVide } from './extract.js';
import { enrichir } from './enrich.js';
import { evaluer, profilsConfigures, grilleCriteres } from './rules.js';
import { calculerAEM, parametresSimulateur } from './aem.js';
import { redigerSynthese, redigerMailAgent } from './redact.js';
import { statutDe, aRelancer } from './lifecycle.js';
import { etapeMax } from './etapes.js';
import { contexteMarcheLocal } from './contexte-marche.js';

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);

/**
 * Analyse une fiche commerciale de bout en bout.
 * @param {object} entree - { buffer, filename, mimetype, texte }
 * @param {object} ctx    - { user, uploadDir }
 */
export async function analyserFiche(entree, ctx = {}) {
  const debut = Date.now();
  const dealId = randomUUID();

  // --- [1] Ingestion -------------------------------------------------------
  const ingestion = await ingerer(entree);
  // Le document source est conservé : soit déjà écrit par la couche d'upload,
  // soit archivé ici si l'appel vient d'ailleurs (tests, import).
  const sourceUrl =
    entree.sourceUrl ||
    (entree.buffer && ctx.uploadDir ? archiverSource(entree.buffer, entree.filename, ctx.uploadDir) : null);

  if (!ingestion.texte) {
    throw new Error(
      "Le document n'a produit aucun texte exploitable. Vérifiez qu'il s'agit bien d'une fiche commerciale lisible."
    );
  }

  // --- [2] Extraction ------------------------------------------------------
  const { lots: lotsExtraits, incidents, ia: extractionIA } = await extraire(ingestion.texte);

  // --- [3] + [4] par lot, en parallèle -------------------------------------
  // Les lots sont indépendants entre eux, et dans un lot la synthèse et le
  // mail agent le sont aussi : tout part de front. Les 429 du palier gratuit
  // sont absorbés par les retries de llm.js. Le contexte marché web, purement
  // informatif et souvent lent, est sorti du chemin critique : il se calcule
  // en arrière-plan après la sauvegarde (voir completerContexteMarche).
  const lots = await Promise.all(
    lotsExtraits.map(async (lot, i) => {
      const enrichissement = await enrichir(lot);
      const evaluation = evaluer(lot, enrichissement);

      const dossierLot = { lot, enrichissement, evaluation };
      const [synthese, mailAgent] = await Promise.all([
        redigerSynthese(dossierLot),
        evaluation.verdict === 'INSUFFISANT'
          ? redigerMailAgent(dossierLot, { signature: ctx.user?.full_name })
          : null,
      ]);

      return {
        index: i,
        intitule: lot.intitule_lot || (lotsExtraits.length > 1 ? `Lot ${i + 1}` : ''),
        lot,
        enrichissement,
        evaluation,
        synthese,
        mail_agent: mailAgent,
        // Complété en arrière-plan une fois le deal sauvegardé.
        contexte_marche: null,
        simulateur: parametresSimulateur({
          prixFai: val(lot.prix_fai),
          loyerAnnuel: val(lot.loyer_annuel_ht_hc),
          surface: val(lot.surface_m2),
        }),
        incidents_garde_fou: incidents.filter((x) => x.lot === i),
      };
    })
  );

  const dossier = {
    deal_id: dealId,
    cree_le: new Date().toISOString(),
    cree_par: ctx.user?.email || null,
    // Cycle de vie (géré par lifecycle.js) — à plat, merge shallow oblige.
    statut: 'analyse',
    archived: false,
    relance_prevue_le: null,
    contact_agent_email: entree.contactEmail || null,
    dossier_doc_id: null,
    projet_id: null,
    suivi: [
      {
        le: new Date().toISOString(),
        par: ctx.user?.email || null,
        type: 'analyse',
        detail: lots.map((l) => l.evaluation?.verdict).filter(Boolean).join(', ') || 'Analyse effectuée',
      },
    ],
    source: {
      nom_fichier: entree.filename || null,
      type: ingestion.source,
      transcrit: ingestion.transcrit,
      pages: ingestion.pages,
      url: sourceUrl,
      avertissements: ingestion.avertissements,
      // Conservé pour l'audit du garde-fou, jamais transmis au rédacteur.
      texte_source: ingestion.texte,
    },
    extraction: { ia: extractionIA, incidents },
    multi_lots: lots.length > 1,
    lots,
    duree_ms: Date.now() - debut,
    profils_configures: profilsConfigures(),
  };

  // Un dossier créé nommé (coquille) peut être rempli par l'analyse : on
  // conserve son identité — nom, responsables, étapes, journal, création.
  const coquille = ctx.dealId ? Records.filter('Deal', { deal_id: ctx.dealId })[0] : null;
  if (coquille) {
    dossier.deal_id = coquille.deal_id;
    dossier.nom = coquille.nom || null;
    dossier.responsables = coquille.responsables || [];
    dossier.cree_le = coquille.cree_le || dossier.cree_le;
    dossier.etape_max = Math.max(Number(coquille.etape_max) || 0, 2);
    dossier.suivi = [...(coquille.suivi || []), ...dossier.suivi];
    Records.update('Deal', coquille.id, dossier);
  } else {
    Records.create('Deal', dossier, ctx.user?.email);
  }
  // Jamais attendu : l'analyse répond tout de suite, le contexte marché
  // apparaît au prochain rafraîchissement du dossier.
  completerContexteMarche(dossier);
  return dossier;
}

/**
 * Complète le contexte marché web de chaque lot en arrière-plan. L'étape est
 * purement informative (jamais dans le verdict) et son échec reste silencieux ;
 * une seule exécution par deal, comme avant. Le merge relit le deal au moment
 * d'écrire et ne pose QUE le champ contexte_marche, pour ne pas écraser une
 * réévaluation faite entre-temps.
 */
async function completerContexteMarche(dossier) {
  try {
    const contextes = await Promise.all(
      (dossier.lots || []).map((l) =>
        contexteMarcheLocal({
          ville: l.enrichissement?.commune?.nom || val(l.lot.adresse)?.ville,
          code_postal: val(l.lot.adresse)?.code_postal,
          type_actif: val(l.lot.type_actif),
        })
      )
    );
    if (!contextes.some(Boolean)) return;

    const actuel = Records.filter('Deal', { deal_id: dossier.deal_id })[0];
    if (!actuel) return;
    const lots = (actuel.lots || []).map((l, i) =>
      l.contexte_marche ? l : { ...l, contexte_marche: contextes[i] || null }
    );
    Records.update('Deal', actuel.id, { lots });
  } catch (e) {
    console.error('[preanalyse] contexte marché en arrière-plan impossible :', e?.message || e);
  }
}

/**
 * Rejoue les blocs déterministes après une saisie humaine (emplacement,
 * négociation). L'extraction n'est PAS relancée : le texte source et les
 * citations restent ceux du dépôt initial, seule la décision est recalculée.
 */
export async function reevaluerLot(dealId, indexLot, saisie = {}) {
  const dossier = Records.filter('Deal', { deal_id: dealId })[0];
  if (!dossier) return { error: 'Dossier introuvable' };
  // Deal de test : réévaluation hors ligne (enrichissement stocké réutilisé).
  if (dossier.test) {
    const { reevaluerLotTest } = await import('./test.js');
    return reevaluerLotTest(dossier, indexLot, saisie);
  }
  const entree = dossier.lots?.[indexLot];
  if (!entree) return { error: 'Lot introuvable' };

  const enrichissement = await enrichir(entree.lot, { emplacement: saisie.emplacement });
  const evaluation = evaluer(entree.lot, enrichissement);

  // Le prix négocié ne change pas le verdict (les règles portent sur le prix
  // FAI), mais il alimente le simulateur.
  if (saisie.prix_negocie) {
    evaluation.aem = calculerAEM({
      prixFai: val(entree.lot.prix_fai),
      prixNegocie: saisie.prix_negocie,
      loyerAnnuel: val(entree.lot.loyer_annuel_ht_hc),
    });
  }

  const dossierLot = { lot: entree.lot, enrichissement, evaluation };
  const [synthese, mailAgent] = await Promise.all([
    redigerSynthese(dossierLot),
    evaluation.verdict === 'INSUFFISANT' ? redigerMailAgent(dossierLot, {}) : null,
  ]);

  const lots = [...dossier.lots];
  lots[indexLot] = { ...entree, enrichissement, evaluation, synthese, mail_agent: mailAgent };
  Records.update('Deal', dossier.id, { lots });

  return { deal_id: dealId, lot: lots[indexLot] };
}

// Les anciens titres générés embarquaient le verdict (« … : GO SOUS RÉSERVE »).
// On l'ôte de l'affichage : le verdict a son badge, le nom reste un nom.
function nettoyerTitre(titre) {
  return String(titre || '')
    .replace(/\s*[:—-]\s*(GO SOUS R[ÉE]SERVE|NO-?GO|GO|Verdict?[^,]*)\s*$/i, '')
    .trim();
}

export function listerDossiers(limit = 50) {
  return Records.list('Deal', { sort: '-created_date', limit }).map((d) => ({
    id: d.id,
    deal_id: d.deal_id,
    cree_le: d.cree_le,
    nom_fichier: d.source?.nom_fichier,
    multi_lots: d.multi_lots,
    // Les deals antérieurs au cycle de vie n'ont pas de statut : ils sont
    // considérés « analyse » (migration paresseuse, aucun script).
    statut: statutDe(d),
    archived: !!d.archived,
    test: !!d.test,
    relance_prevue_le: d.relance_prevue_le || null,
    a_relancer: aRelancer(d),
    contact_agent_email: d.contact_agent_email || null,
    projet_id: d.projet_id || null,
    // Pour les cartes de la liste : qui s'en occupe, quand a-t-il bougé, où en est-il.
    responsable: d.cree_par || d.created_by || null,
    maj_le: d.updated_date || d.cree_le || d.created_date || null,
    etape_max: etapeMax(d),
    titre: nettoyerTitre(d.nom || d.lots?.[0]?.synthese?.titre || d.source?.nom_fichier || d.deal_id),
    responsables: d.responsables || [],
    dernier_suivi: (d.suivi || [])[d.suivi?.length - 1] || null,
    lots: (d.lots || []).map((l) => ({
      index: l.index,
      intitule: l.intitule,
      verdict: l.evaluation?.verdict,
      titre: l.synthese?.titre,
      ville: l.enrichissement?.commune?.nom || l.lot?.adresse?.valeur?.ville || null,
      adresse: l.lot?.adresse?.valeur?.rue || null,
      prix_fai: l.lot?.prix_fai?.absent === false ? l.lot.prix_fai.valeur : null,
    })),
  }));
}

export function obtenirDossier(dealId) {
  const deal = Records.filter('Deal', { deal_id: dealId })[0] || null;
  // L'étape atteinte accompagne toujours le dossier : le front ne la recalcule pas.
  // Le titre est calculé ici comme dans la liste : une seule façon de nommer
  // un dossier, quelle que soit la page qui l'affiche.
  return deal
    ? {
        ...deal,
        etape_max: etapeMax(deal),
        titre: nettoyerTitre(deal.nom || deal.lots?.[0]?.synthese?.titre || deal.source?.nom_fichier || deal.deal_id),
        // La grille de critères se calcule à la lecture, jamais stockée : elle
        // suit rules.json, et un dossier analysé hier la reçoit comme un neuf.
        lots: (deal.lots || []).map((lot) =>
          lot?.evaluation ? { ...lot, evaluation: { ...lot.evaluation, grille: grilleCriteres(lot.evaluation) } } : lot
        ),
      }
    : null;
}

/**
 * Crée un dossier avant toute fiche : une coquille qui porte un nom, un agent,
 * et ce qu'on sait déjà du bien. C'est ce qu'on ouvre en raccrochant.
 * @param {{nom, responsables?, user?, contact_agent_email?, apercu?}} p -
 *   `apercu` : { ville, rue, prix, surface, loyer, activite } tels qu'entendus.
 */
/**
 * Le lot d'un dossier, ou une fiche vide à son nom quand la pré-analyse n'a
 * pas eu lieu : une coquille nommée doit quand même pouvoir devenir un
 * projet, une présentation ou un mail — à compléter ensuite.
 */
export function lotOuVide(dossier, index = 0) {
  const existant = dossier?.lots?.[Number(index)] || dossier?.lots?.[0];
  if (existant) return existant;
  const nom = dossier?.nom || 'Dossier sans fiche';
  return {
    lot: { ...lotVide(), intitule_lot: nom },
    intitule: nom,
    enrichissement: {},
    evaluation: { verdict: null, profil: null, motifs: [], reserves: [], libelles_manquants: ['Pré-analyse non faite'] },
    synthese: { titre: nom },
    simulateur: null,
    vide: true,
  };
}

export function creerCoquille({ nom, responsables = [], user = null, contact_agent_email = null, apercu = null }) {
  const dossier = {
    deal_id: randomUUID(),
    nom: String(nom || '').trim(),
    responsables: (responsables || []).map((r) => String(r).trim()).filter(Boolean).slice(0, 8),
    cree_le: new Date().toISOString(),
    cree_par: user?.email || null,
    statut: 'analyse',
    etape_max: 1,
    archived: false,
    relance_prevue_le: null,
    contact_agent_email: contact_agent_email ? String(contact_agent_email).toLowerCase() : null,
    apercu: apercu || null,
    dossier_doc_id: null,
    projet_id: null,
    lots: [],
    multi_lots: false,
    suivi: [{ le: new Date().toISOString(), par: user?.email || null, type: 'creation', detail: `Dossier créé : ${nom}` }],
  };
  Records.create('Deal', dossier, user?.email);
  return dossier;
}
