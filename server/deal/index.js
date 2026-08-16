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
import { extraire } from './extract.js';
import { enrichir } from './enrich.js';
import { evaluer, profilsConfigures } from './rules.js';
import { calculerAEM, parametresSimulateur } from './aem.js';
import { redigerSynthese, redigerMailAgent } from './redact.js';
import { statutDe, aRelancer } from './lifecycle.js';
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

  // --- [3] Déterministe : enrichissement, calculs, règles -------------------
  const lots = [];
  for (let i = 0; i < lotsExtraits.length; i++) {
    const lot = lotsExtraits[i];
    const enrichissement = await enrichir(lot);
    const evaluation = evaluer(lot, enrichissement);

    // --- [4] Rédaction ----------------------------------------------------
    const dossierLot = { lot, enrichissement, evaluation };
    const synthese = await redigerSynthese(dossierLot);
    const mailAgent =
      evaluation.verdict === 'INSUFFISANT'
        ? await redigerMailAgent(dossierLot, { signature: ctx.user?.full_name })
        : null;

    // Contexte marché web sourcé — informatif seulement, jamais dans le
    // verdict ni la synthèse. Une seule exécution : reevaluerLot ne le rejoue
    // pas.
    const contexteMarche = await contexteMarcheLocal({
      ville: enrichissement?.commune?.nom || val(lot.adresse)?.ville,
      code_postal: val(lot.adresse)?.code_postal,
      type_actif: val(lot.type_actif),
    });

    lots.push({
      index: i,
      intitule: lot.intitule_lot || (lotsExtraits.length > 1 ? `Lot ${i + 1}` : ''),
      lot,
      enrichissement,
      evaluation,
      synthese,
      mail_agent: mailAgent,
      contexte_marche: contexteMarche,
      simulateur: parametresSimulateur({
        prixFai: val(lot.prix_fai),
        loyerAnnuel: val(lot.loyer_annuel_ht_hc),
        surface: val(lot.surface_m2),
      }),
      incidents_garde_fou: incidents.filter((x) => x.lot === i),
    });
  }

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

  Records.create('Deal', dossier, ctx.user?.email);
  return dossier;
}

/**
 * Rejoue les blocs déterministes après une saisie humaine (emplacement,
 * négociation). L'extraction n'est PAS relancée : le texte source et les
 * citations restent ceux du dépôt initial, seule la décision est recalculée.
 */
export async function reevaluerLot(dealId, indexLot, saisie = {}) {
  const dossier = Records.filter('Deal', { deal_id: dealId })[0];
  if (!dossier) return { error: 'Dossier introuvable' };
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
  const synthese = await redigerSynthese(dossierLot);
  const mailAgent =
    evaluation.verdict === 'INSUFFISANT' ? await redigerMailAgent(dossierLot, {}) : null;

  const lots = [...dossier.lots];
  lots[indexLot] = { ...entree, enrichissement, evaluation, synthese, mail_agent: mailAgent };
  Records.update('Deal', dossier.id, { lots });

  return { deal_id: dealId, lot: lots[indexLot] };
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
    relance_prevue_le: d.relance_prevue_le || null,
    a_relancer: aRelancer(d),
    contact_agent_email: d.contact_agent_email || null,
    projet_id: d.projet_id || null,
    dernier_suivi: (d.suivi || [])[d.suivi?.length - 1] || null,
    lots: (d.lots || []).map((l) => ({
      index: l.index,
      intitule: l.intitule,
      verdict: l.evaluation?.verdict,
      titre: l.synthese?.titre,
      ville: l.enrichissement?.commune?.nom || l.lot?.adresse?.valeur?.ville || null,
    })),
  }));
}

export function obtenirDossier(dealId) {
  return Records.filter('Deal', { deal_id: dealId })[0] || null;
}
