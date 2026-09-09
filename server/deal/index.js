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
      texte: String(ingestion.texte || '').slice(0, 80000),
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
// Les champs de la fiche qu'on peut corriger à la main, et comment les lire.
const CHAMPS_SAISISSABLES = {
  prix_fai: { libelle: 'Prix', type: 'nombre' },
  loyer_annuel_ht_hc: { libelle: 'Loyer', type: 'nombre' },
  surface_m2: { libelle: 'Surface', type: 'decimal' },
  montant_honoraires: { libelle: 'Honoraires', type: 'nombre' },
  rendement_annonce: { libelle: 'Rendement', type: 'decimal' },
  honoraires_inclus: { libelle: 'Honoraires inclus', type: 'booleen' },
  occupe: { libelle: 'Occupé', type: 'booleen' },
  type_actif: { libelle: "Type d'actif", type: 'texte' },
  locataire_nom: { libelle: 'Locataire', type: 'texte' },
  locataire_activite: { libelle: 'Activité', type: 'texte' },
  bail_type: { libelle: 'Type de bail', type: 'texte' },
  bail_echeance: { libelle: 'Échéance du bail', type: 'texte' },
  adresse: { libelle: 'Adresse', type: 'adresse' },
};

// « 45 rue Victor Hugo, 69002 Lyon » → { rue, code_postal, ville }.
function lireAdresse(v) {
  if (v && typeof v === 'object') return { rue: v.rue || null, code_postal: v.code_postal || null, ville: v.ville || null };
  const t = String(v || '').trim();
  const m = t.match(/^(.*?)[,\s]*\b(\d{5})\s+(.+)$/);
  if (m) return { rue: m[1].trim().replace(/,$/, '') || null, code_postal: m[2], ville: m[3].trim() };
  const parties = t.split(',').map((x) => x.trim()).filter(Boolean);
  if (parties.length >= 2) return { rue: parties.slice(0, -1).join(', '), code_postal: null, ville: parties.at(-1) };
  return { rue: null, code_postal: null, ville: t || null };
}

function lireValeur(champ, brut) {
  const def = CHAMPS_SAISISSABLES[champ];
  if (!def) return { erreur: 'Champ inconnu' };
  if (brut === '' || brut == null) return { vide: true };
  switch (def.type) {
    // « abc » ne vaut pas 0 : sans chiffre, ou à zéro, la valeur est refusée.
    case 'nombre': { const t = String(brut).replace(/[^\d.,-]/g, '').replace(',', '.'); const n = Number(t); if (!/\d/.test(t) || !isFinite(n) || n <= 0) return { erreur: `${def.libelle} invalide` }; return { valeur: Math.round(n) }; }
    case 'decimal': { const t = String(brut).replace(/[^\d.,-]/g, '').replace(',', '.'); const n = Number(t); if (!/\d/.test(t) || !isFinite(n) || n <= 0) return { erreur: `${def.libelle} invalide` }; return { valeur: Math.round(n * 100) / 100 }; }
    case 'booleen': return { valeur: brut === true || /^(oui|true|1|yes)$/i.test(String(brut)) };
    case 'adresse': return { valeur: lireAdresse(brut) };
    default: return { valeur: String(brut).trim().slice(0, 300) };
  }
}

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

  // Les faits saisis à la main — prix affiché, loyer, surface — deviennent des
  // données du lot, avec leur provenance. Tout en dépend : le verdict, l'AEM,
  // le simulateur. D'où l'écriture sur le lot lui-même.
  let lot = entree.lot;
  for (const champ of Object.keys(CHAMPS_SAISISSABLES)) {
    if (!Object.prototype.hasOwnProperty.call(saisie, champ)) continue;
    const lu = lireValeur(champ, saisie[champ]);
    if (lu.erreur) return { error: lu.erreur };
    // Une valeur vidée : le champ redevient absent, comme si la fiche ne le disait pas.
    lot = {
      ...lot,
      [champ]: lu.vide
        ? { valeur: null, absent: true, confiance: null, citation: null, saisi_a_la_main: true }
        : { valeur: lu.valeur, absent: false, confiance: 1, citation: 'Saisi à la main.', saisi_a_la_main: true },
    };
  }

  const enrichissement = await enrichir(lot, { emplacement: saisie.emplacement });
  // Ce que l'analyste a posé dans le simulateur compte dans le prix de revient :
  // le prix négocié et les travaux bailleur de la première année. Le verdict,
  // lui, reste jugé sur le prix FAI — ce sont les règles qui le disent.
  const sim = entree.simulateur || {};
  const negocie = Number(saisie.prix_negocie) > 0
    ? Number(saisie.prix_negocie)
    : Number(sim.prixBienNegocie) > 0
    ? Number(sim.prixBienNegocie)
    : null;
  const travauxAn0 = Array.isArray(sim.travauxBailleur) ? Number(sim.travauxBailleur[0]) || 0 : 0;
  const evaluation = evaluer(lot, enrichissement, { prixNegocie: negocie, travaux: travauxAn0 });

  const dossierLot = { lot, enrichissement, evaluation };
  const [synthese, mailAgent] = await Promise.all([
    redigerSynthese(dossierLot),
    evaluation.verdict === 'INSUFFISANT' ? redigerMailAgent(dossierLot, {}) : null,
  ]);

  const lots = [...dossier.lots];
  lots[indexLot] = {
    ...entree,
    lot,
    enrichissement,
    evaluation,
    synthese,
    mail_agent: mailAgent,
    // Le simulateur part du prix : ses faits se refont dès que celui-ci bouge,
    // les hypothèses enregistrées à la main (taux, durée, apport…) restent.
    simulateur: (() => {
      const refait = {
        ...(entree.simulateur || {}),
        ...parametresSimulateur({
          prixFai: val(lot.prix_fai),
          loyerAnnuel: val(lot.loyer_annuel_ht_hc),
          surface: val(lot.surface_m2),
        }),
      };
      // Le prix négocié est une décision, pas un fait de la fiche : le refaire
      // à partir du prix FAI l'effaçait à chaque réévaluation, et le rendement
      // AEM repartait comme si rien n'avait été négocié.
      if (negocie) refait.prixBienNegocie = negocie;
      return refait;
    })(),
  };
  Records.update('Deal', dossier.id, { lots });

  return { deal_id: dealId, lot: { ...lots[indexLot], index: indexLot } };
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

/**
 * Enregistre les chiffres du simulateur sur le lot : on y revient plus tard,
 * et le projet créé depuis le deal en hérite. Les faits du dossier (prix,
 * loyer, surface) restent ceux du lot ; ici on garde les hypothèses jouées.
 */
export async function enregistrerSimulateur(dealId, indexLot, parametres = {}, user) {
  const dossier = Records.filter('Deal', { deal_id: dealId })[0];
  if (!dossier) return { error: 'Dossier introuvable' };
  const entree = dossier.lots?.[indexLot];
  if (!entree) return { error: 'Lot introuvable' };

  // Les faits du dossier joués dans le simulateur (prix, loyer, surface) : s'ils
  // ont bougé, ils entrent dans la fiche et tout se recalcule — mais seulement
  // à l'enregistrement, jamais au fil des curseurs.
  const faits = {};
  const paires = [['prixBienFAI', 'prix_fai'], ['loyerInitialHTHC', 'loyer_annuel_ht_hc'], ['surface', 'surface_m2']];
  for (const [cleSim, champ] of paires) {
    const v = Number(parametres?.[cleSim]);
    if (!isFinite(v) || v <= 0) continue;
    if (Math.round(v) !== Math.round(Number(val(entree.lot?.[champ])) || 0)) faits[champ] = v;
  }
  const propres = {};
  for (const [cle, v] of Object.entries(parametres || {})) {
    if (v === undefined || typeof v === 'function') continue;
    if (Array.isArray(v) && v.length > 30) continue;
    propres[cle] = v;
  }
  const simulateur = {
    ...(entree.simulateur || {}),
    ...propres,
    enregistre_le: new Date().toISOString(),
    enregistre_par: user?.email || null,
  };
  const lots = [...dossier.lots];
  lots[indexLot] = { ...entree, simulateur };
  Records.update('Deal', dossier.id, { lots });
  // Des faits ont changé : le lot est rejoué avec, les hypothèses restant.
  if (Object.keys(faits).length) return reevaluerLot(dealId, indexLot, faits);
  // Le prix négocié et les travaux bailleur entrent dans le prix de revient :
  // s'ils bougent, le rendement AEM du dossier bouge aussi. Sans ce rejeu, la
  // grille de critères gardait l'ancien rendement pendant que le simulateur,
  // juste en dessous, en affichait un autre.
  const avant = entree.simulateur || {};
  const chiffre = (o, cle) => Number(o?.[cle]) || 0;
  const travauxDe = (o) => (Array.isArray(o?.travauxBailleur) ? Number(o.travauxBailleur[0]) || 0 : 0);
  if (chiffre(avant, 'prixBienNegocie') !== chiffre(simulateur, 'prixBienNegocie') || travauxDe(avant) !== travauxDe(simulateur)) {
    return reevaluerLot(dealId, indexLot, {});
  }
  return { deal_id: dealId, lot: { ...lots[indexLot], index: indexLot } };
}

/**
 * La vérification d'un critère, à la main : « vérifié » quand on l'a contrôlé,
 * « incertain » quand on doute, rien pour revenir au calcul. Elle ne change pas
 * le verdict, elle dit où en est la relecture humaine.
 */
export function verifierCritere(dealId, indexLot, cle, statut, user) {
  const dossier = Records.filter('Deal', { deal_id: dealId })[0];
  if (!dossier) return { error: 'Dossier introuvable' };
  const entree = dossier.lots?.[indexLot];
  if (!entree) return { error: 'Lot introuvable' };
  if (statut && !['verifie', 'incertain'].includes(statut)) return { error: 'Statut inconnu' };
  const verifications = { ...(entree.verifications || {}) };
  if (statut) verifications[cle] = { statut, par: user?.email || null, le: new Date().toISOString() };
  else delete verifications[cle];
  const lots = [...dossier.lots];
  lots[indexLot] = { ...entree, verifications };
  Records.update('Deal', dossier.id, { lots });
  return { deal_id: dealId, lot: { ...lots[indexLot], index: indexLot } };
}
