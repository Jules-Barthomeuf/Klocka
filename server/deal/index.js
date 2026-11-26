// Orchestration du pipeline de préanalyse.
//
//   [1] ingestion  -> texte source (LLM toléré uniquement pour transcrire un scan)
//   [2] extraction -> schéma imposé + garde-fou de citation littérale
//   [3] enrichissement + calculs + règles -> code déterministe, VERDICT
//   [4] rédaction  -> LLM, sans accès aux sources
//
// Le verdict est arrêté à l'étape 3. Les étapes 2 et 4 ne peuvent ni le
// produire ni le modifier.

import { notesDuLot } from './notes-bien.js';
import { titreDuLot } from './titre-dossier.js';
import { rendementNetMoyen } from '../video/indicateurs.js';
import { prixFai as prixFaiDuLot } from './prix.js';
import { randomUUID } from 'crypto';
import { Records, CHEMIN_UPLOADS } from '../db.js';
import fs from 'fs';
import path from 'path';
import { ingerer, archiverSource } from './ingest.js';
import { extraire, lotVide } from './extract.js';
import { enrichir } from './enrich.js';
import { evaluer, profilsConfigures, grilleCriteres } from './rules.js';
import { parametresSimulateur } from './aem.js';
import { redigerSynthese, redigerMailAgent } from './redact.js';
import { statutDe, aRelancer } from './lifecycle.js';
import { etapeMax } from './etapes.js';
import { contexteMarcheLocal } from './contexte-marche.js';
import { trouverVille } from '../../src/data/villes.js';

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
  // `ctx.cible` : une cellule d'un portefeuille lue seule (24 nov. 2026, un dossier par commerce).
  const { lots: lotsExtraits, incidents, ia: extractionIA, agent: agentExtrait = null, biens_annonces: biensAnnonces = null } = await extraire(ingestion.texte, ctx.cible ? { cible: ctx.cible } : {});

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

      // L'origine du loyer (18 oct. 2026, valeur locative par comparables) : lu sur la fiche, il est annoncé.
      if (lot && val(lot.loyer_annuel_ht_hc) && !lot.origine_loyer) lot.origine_loyer = 'annonce';
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
          prixFai: prixFaiDuLot(lot),
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
    extraction: { ia: extractionIA, incidents, biens_annonces: biensAnnonces },
    ...(ctx.cible ? { portefeuille: { commerce: ctx.cible.locataire || null, ...(ctx.cible.n ? { sur: ctx.cible.n } : {}) } } : {}),
    multi_lots: lots.length > 1,
    lots,
    duree_ms: Date.now() - debut,
    profils_configures: profilsConfigures(),
  };

  // Un dossier créé nommé (coquille) peut être rempli par l'analyse : on
  // conserve son identité — nom, responsables, étapes, journal, création.
  const coquille = ctx.dealId ? Records.findBy('Deal', 'deal_id', ctx.dealId) : null;
  if (coquille) {
    dossier.deal_id = coquille.deal_id;
    dossier.nom = coquille.nom || titreDuLot(lots[0]?.lot, lots[0]?.enrichissement);
    dossier.responsables = coquille.responsables || [];
    dossier.cree_le = coquille.cree_le || dossier.cree_le;
    dossier.etape_max = Math.max(Number(coquille.etape_max) || 0, 2);
    dossier.suivi = [...(coquille.suivi || []), ...dossier.suivi];
    Records.update('Deal', coquille.id, dossier);
  } else {
    // Un dossier neuf porte un titre court, pas la phrase de la synthèse.
    dossier.nom = titreDuLot(lots[0]?.lot, lots[0]?.enrichissement);
    Records.create('Deal', dossier, ctx.user?.email);
  }
  // Jamais attendu : l'analyse répond tout de suite, le contexte marché
  // apparaît au prochain rafraîchissement du dossier.
  // Sans clic (veille des boîtes, Haka), pas de recherche web : le point de marché attend un geste (18 oct. 2026).
  if (!ctx.automatique) completerContexteMarche(dossier);
  // Les cinq outils de l'onglet Marché (11 nov. 2026, Jules : « lancement automatique à la création du dossier, en
  // arrière-plan ») : locataire, loyer, prix, emplacement, ville, chacun seul. Pas pendant les tests (NODE_TEST_CONTEXT).
  if (!process.env.NODE_TEST_CONTEXT && lots.length) {
    import('../outils/lancements.js')
      .then(async (O) => {
        const deal = Records.findBy('Deal', 'deal_id', dossier.deal_id);
        const e = await O.entreesDuLot(deal, 0);
        if (e.adresse || e.locataire) O.lancerOutils(e, { dealId: dossier.deal_id, index: 0, user: ctx.user || null });
      })
      .catch((e) => console.warn('[outils] lancement à la création :', e?.message || e));
  }
  // La Mémoire Klocka (30 oct. 2026) : chaque fiche entrée y a sa ligne « dossier » (le taux de biens retenus, et le
  // lecteur de nuit sait qu'elle est déjà connue). Sans attente, jamais bloquant.
  import('../memoire/drapeaux.js')
    .then(async (M) => { if (M.MEMOIRE) (await import('../memoire/memoire.js')).memoriser(dossier, { origine: 'dossier', par: ctx.user }); })
    .catch((e) => console.warn('[mémoire] dossier :', e?.message || e));
  // L'agent, lui, est attendu : c'est à lui qu'on écrit ensuite, et celui
  // qui a déposé la fiche doit savoir s'il est au dossier et dans Monday.
  // Un dossier venu d'un mandataire K Partners n'a pas d'agent immobilier :
  // rien à rattacher, et surtout rien à écrire dans Monday.
  if (ctx.sansAgent) return dossier;
  try {
    const { rattacherAgent } = await import('./agent-fiche.js');
    dossier.agent_fiche = await rattacherAgent(dossier.deal_id, {
      contact: entree.contactEmail || coquille?.contact_agent_email || null,
      extrait: agentExtrait,
      texte: ingestion.texte,
      user: ctx.user,
    });
    dossier.contact_agent_email = dossier.contact_agent_email || dossier.agent_fiche.agent?.email || null;
  } catch (e) {
    console.warn(`[preanalyse] agent non rattaché : ${e?.message || e}`);
  }
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

    const actuel = Records.findBy('Deal', 'deal_id', dossier.deal_id);
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
// Ce qui se lit à l'adresse du bien et se garde sur le lot.
export const LECTURES_A_L_ADRESSE = ['valeur_locative', 'analyse_loyer', 'analyse_prix', 'transactions_fonds', 'prix_residentiel', 'ventes_dvf', 'vitalite_rue', 'implantation', 'contexte_marche', 'comparaison_marche', 'lieu'];

const ligneAdresse = (l) => {
  const v = l?.adresse?.valeur;
  return v && typeof v === 'object' ? [v.rue, v.code_postal, v.ville].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim() : '';
};

/**
 * Pure : ce qu'une saisie périme sur le lot. Une adresse qui change retire
 * toutes les lectures faites à l'ancienne ; la recherche de marché se relance
 * si le dossier avait une vraie lecture de marché (pas seulement le cache de
 * comparaison ou le lieu) et que la nouvelle adresse existe.
 */
export function lecturesPerimees(entree, lotApres, saisie = {}) {
  const change = Object.prototype.hasOwnProperty.call(saisie, 'adresse') && ligneAdresse(lotApres) !== ligneAdresse(entree?.lot);
  if (!change) return { adresse_changee: false, retirer: [], relancer: false };
  const presentes = LECTURES_A_L_ADRESSE.filter((k) => entree?.[k] != null);
  return {
    adresse_changee: true,
    retirer: presentes,
    relancer: presentes.some((k) => k !== 'comparaison_marche' && k !== 'lieu') && !!ligneAdresse(lotApres),
  };
}

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
  // La qualité de l'enseigne s'écrit à la main (10 nov. 2026, Jules) ; sans elle, la signature calculée s'affiche.
  qualite_enseigne: { libelle: "Qualité de l'enseigne", type: 'texte' },
  bail_type: { libelle: 'Type de bail', type: 'texte' },
  bail_echeance: { libelle: 'Échéance du bail', type: 'texte' },
  // Le bail en texte libre (11 nov. 2026, Jules) : « 12 ans ferme », « 3/6/9 signé en 2019 »… lu par l'IA (bail-libre.js).
  bail_texte: { libelle: 'Bail', type: 'long' },
  // Les équipements du local (extraction, terrasse, cave…), lus sur la fiche ou écrits à la main (25 nov. 2026, Jules).
  equipements: { libelle: 'Équipements', type: 'long' },
  adresse: { libelle: 'Adresse', type: 'adresse' },
};

// « 45 rue Victor Hugo, 69002 Lyon » → { rue, code_postal, ville }.
export function lireAdresse(v) {
  if (v && typeof v === 'object') return { rue: v.rue || null, code_postal: v.code_postal || null, ville: v.ville || null };
  const t = String(v || '').trim();
  const m = t.match(/^(.*?)[,\s]*\b(\d{5})\s+(.+)$/);
  if (m) return { rue: m[1].trim().replace(/,$/, '') || null, code_postal: m[2], ville: m[3].trim() };
  const parties = t.split(',').map((x) => x.trim()).filter(Boolean);
  if (parties.length >= 2) return { rue: parties.slice(0, -1).join(', '), code_postal: null, ville: parties.at(-1) };
  return { rue: null, code_postal: null, ville: t || null };
}

/**
 * Une adresse tapée à la main, découpée (14 nov. 2026 : le dossier « Essai » à Lorient, « 5 Place de la Libération
 * Lorient » rangé tout entier dans la ville ; les outils du Marché n'y trouvaient pas de rue et la Ville cherchait une
 * commune de ce nom). Sans code postal ni virgule, `lireAdresse` ne sait pas où finit la rue : la Base Adresse Nationale
 * le dit. Une ville seule, rien de trouvé ou la BAN en panne : la lecture d'avant.
 */
export async function adresseSaisie(texte, { resoudre = null } = {}) {
  const a = lireAdresse(texte);
  if (typeof texte !== 'string' || a.rue || a.code_postal) return a;
  const ban = await import('../adresse-ban.js');
  if (!ban.adresseAvecRue(texte)) return a;
  try {
    const r = await (resoudre || ban.resoudreAdresse)(texte);
    if (!r?.rue || !r.ville) return a;
    return { rue: [r.numero, r.rue].filter(Boolean).join(' '), code_postal: r.code_postal || null, ville: r.ville };
  } catch {
    return a;
  }
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
    case 'long': return { valeur: String(brut).replace(/\s+/g, ' ').trim().slice(0, 1000) };
    default: return { valeur: String(brut).trim().slice(0, 300) };
  }
}

export async function reevaluerLot(dealId, indexLot, saisie = {}) {
  const dossier = Records.findBy('Deal', 'deal_id', dealId);
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
    if (!lu.vide && CHAMPS_SAISISSABLES[champ].type === 'adresse') lu.valeur = await adresseSaisie(saisie[champ]);
    // Une valeur vidée : le champ redevient absent, comme si la fiche ne le disait pas.
    lot = {
      ...lot,
      [champ]: lu.vide
        ? { valeur: null, absent: true, confiance: null, citation: null, saisi_a_la_main: true }
        : { valeur: lu.valeur, absent: false, confiance: 1, citation: 'Saisi à la main.', saisi_a_la_main: true },
    };
    // Un loyer posé à la main garde son origine ; un bail lu (matrice) la passe à « reel ».
    if (champ === 'loyer_annuel_ht_hc') lot = { ...lot, origine_loyer: lu.vide ? null : 'saisi' };
  }

  // Le bail écrit librement : l'IA le lit, et le type et l'échéance du lot suivent ce qu'elle en tire ; une date que le
  // texte ne donne pas reste vide (11 nov. 2026, Jules). Vidé, le bail redevient celui de la fiche.
  if (Object.prototype.hasOwnProperty.call(saisie, 'bail_texte')) {
    const { lireBailLibre } = await import('./bail-libre.js');
    const lu = await lireBailLibre(saisie.bail_texte);
    const main = (valeur) => (valeur ? { valeur, absent: false, confiance: 1, citation: 'Lu dans le bail saisi à la main.', saisi_a_la_main: true } : { valeur: null, absent: true, confiance: null, citation: null, saisi_a_la_main: true });
    if (lu) {
      const [a, m, j] = lu.date_echeance ? lu.date_echeance.split('-') : [];
      lot = { ...lot, bail_lu: lu, bail_type: main(lu.type_bail), bail_echeance: main(lu.date_echeance ? `${j}/${m}/${a}` : null) };
    } else {
      const { bail_lu: _ancien, ...reste } = lot;
      lot = reste;
    }
  }

  // Une adresse corrigée périme tout ce qui a été lu à l'ancienne : on le
  // retire, et la recherche de marché se relance si le dossier en avait une.
  const perime = lecturesPerimees(entree, lot, saisie);

  const enrichissement = await enrichir(lot, { emplacement: saisie.emplacement });
  // Ce que l'analyste a posé dans le simulateur compte dans le prix de revient :
  // le prix négocié et les travaux bailleur de la première année. Le verdict,
  // lui, reste jugé sur le prix FAI — ce sont les règles qui le disent.
  const sim = entree.simulateur || {};
  // Un prix négocié n'est une décision que s'il s'écarte du prix FAI d'alors :
  // à la création, le simulateur pose le négocié égal au FAI, et ce reflet
  // était repris comme une négociation. Corriger le prix de la fiche mettait
  // donc à jour le prix FAI en laissant le négocié sur l'ancien montant — or
  // c'est lui qui porte le prix de revient, le cash-flow et le rendement. Le
  // simulateur d'en dessous ne bougeait pas d'un euro.
  const ancienFai = Number(sim.prixBienFAI) || 0;
  const ancienNegocie = Number(sim.prixBienNegocie) || 0;
  const vraimentNegocie = ancienNegocie > 0 && (ancienFai === 0 || Math.round(ancienNegocie) !== Math.round(ancienFai));
  const negocie = Number(saisie.prix_negocie) > 0
    ? Number(saisie.prix_negocie)
    : vraimentNegocie
    ? ancienNegocie
    : null;
  const travauxAn0 = Array.isArray(sim.travauxBailleur) ? Number(sim.travauxBailleur[0]) || 0 : 0;
  const evaluation = evaluer(lot, enrichissement, { prixNegocie: negocie, travaux: travauxAn0, simulateur: sim });

  const dossierLot = { lot, enrichissement, evaluation };
  const [synthese, mailAgent] = await Promise.all([
    redigerSynthese(dossierLot),
    evaluation.verdict === 'INSUFFISANT' ? redigerMailAgent(dossierLot, {}) : null,
  ]);

  const lots = [...dossier.lots];
  const sansAnciennes = { ...entree };
  for (const k of perime.retirer) delete sansAnciennes[k];
  const { relancer } = perime;
  // Une adresse changée (17 oct. 2026, Jules) : l'emplacement est à revoir. Un statut posé à la main
  // sur la ligne Emplacement tombe, et la ligne repasse « à vérifier » le temps qu'on regarde la rue.
  if (Object.prototype.hasOwnProperty.call(saisie, 'adresse') && sansAnciennes.verifications) {
    sansAnciennes.verifications = Object.fromEntries(Object.entries(sansAnciennes.verifications).filter(([cle]) => !/\|emplacement$/.test(cle)));
  }
  lots[indexLot] = {
    ...sansAnciennes,
    ...(relancer ? { marche_relance: { le: new Date().toISOString(), raison: 'adresse corrigée', cle: `${dealId}|${indexLot}` } } : {}),
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
          prixFai: prixFaiDuLot(lot),
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
  // Le nom qu'on n'a pas choisi suit la fiche : une adresse corrigée donne
  // « Glacier - Paris 3e » au lieu de « Glacier ». Un nom donné à la main reste.
  const { titreDuLot } = await import('./titre-dossier.js');
  const nomAuto = indexLot === 0 && dossier.nom && dossier.nom === titreDuLot(entree.lot, entree.enrichissement);
  const nouveauNom = nomAuto ? titreDuLot(lot, enrichissement) : null;
  Records.update('Deal', dossier.id, { lots, ...(nouveauNom && nouveauNom !== dossier.nom ? { nom: nouveauNom } : {}) });
  if (relancer) {
    const { lancerRechercheMarche } = await import('../alex.js');
    lancerRechercheMarche(dealId, indexLot, { forcer: true, automatique: true });
  }
  // Une case de la Pré-analyse corrigée passe aussi dans le projet (10 nov. 2026, Jules : « synchronisé avec le projet ») ;
  // une case modifiée à la main dans le projet n'en bouge pas.
  // Les champs corrigés ici passent dans le projet avec cette valeur, même là où une pièce ou le projet disait autre chose (10 nov. 2026, Jules).
  if (indexLot === 0 && dossier.projet_id) await (await import('./projet.js')).projetSuitLeDossier(dealId, null, { forcer: Object.keys(saisie) });

  return { deal_id: dealId, lot: { ...lotPourLecture(lots[indexLot]), index: indexLot }, ...(nouveauNom ? { nom: nouveauNom } : {}) };
}

// Les anciens titres générés embarquaient le verdict (« … : GO SOUS RÉSERVE »).
// On l'ôte de l'affichage : le verdict a son badge, le nom reste un nom.
function nettoyerTitre(titre) {
  return String(titre || '')
    .replace(/\s*[:—-]\s*(GO SOUS R[ÉE]SERVE|NO-?GO|GO|Verdict?[^,]*)\s*$/i, '')
    .trim();
}

// La liste gardée tant que rien n'a bougé (15 nov. 2026, Jules : « ça prend trop de temps pour charger les Dossiers ») :
// elle décodait chaque dossier en entier (matrice, extractions : jusqu'à 300 Ko chacun) à chaque ouverture de la page,
// à chaque retour sur l'onglet et à chaque dossier ouvert (onglets K-Data). Elle se refait dès qu'un dossier, une lettre
// d'intention, un projet ou un dossier de mandataire change, et au plus tard après une minute (« à relancer » suit l'heure).
const SOURCES_LISTE = ['Deal', 'LettreIntention', 'Project', 'DossierMandataire'];
let listeGardee = null;
export function listerDossiers(limit = 50) {
  const signature = SOURCES_LISTE.map((e) => Records.signature(e)).join('#');
  if (!listeGardee || listeGardee.signature !== signature || Date.now() - listeGardee.le > 60_000) {
    listeGardee = { signature, le: Date.now(), lignes: lireListeDossiers() };
  }
  // Un dossier de vente de mandataire pas encore mis en vente (`cache_equipe`) reste hors de la liste de l'équipe.
  const lignes = listeGardee.lignes.slice(0, limit).filter((x) => !x.cache).map((x) => x.d);
  chercherPhotosVille(lignes);
  return lignes;
}

// La photo de la ville des dossiers qui n'en ont pas : quelques-uns à chaque ouverture de la liste, l'un après l'autre,
// une seule tentative par dossier ; jamais pendant les tests.
let photosEnCours = false;
// Version 4 : une photo par dossier, choisie parmi celles de la ville (bâtiments et lieux, pas d objets), 26 nov. 2026.
const VERSION_PHOTO_VILLE = 4;
const photosParVille = new Map();
/** La ville d'un dossier : celle de sa fiche, sinon celle que nomme le dossier (« Chimni - Toulouse »). */
function villeDe(d) {
  const lot = d?.lots?.[0] || {};
  const commune = lot.enrichissement?.commune || {};
  return { nom: commune.nom || lot.lot?.adresse?.valeur?.ville || trouverVille(`${d?.nom || ''} ${d?.titre || ''}`)?.nom || '', departement: commune.departement || null };
}
// « Paris 8e », « Marseille 6e », « Quimper (29) » : la ville seule, sans arrondissement ni département.
const cleVille = (nom) => String(nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*\(?\d.*$/, '').replace(/[^a-z]+/g, ' ').trim();

/**
 * Pure : la ville d'un projet. Le nom après le code postal (« 56100 Lorient »), sinon le dernier morceau de l'adresse
 * (« 1 rue d'Orléans, Rennes »), sinon le champ « ville » s'il nomme une ville (pas « Centre-Ville » ni « Bon secteur »),
 * sinon la liste des villes connues.
 */
export function villeDuProjet(p) {
  const adresse = String(p?.adresse_complete || '').replace(/,?\s*france\s*$/i, '').trim();
  const apresCp = adresse.match(/\b\d{5}\s+([^,\d]+)$/);
  if (apresCp) return apresCp[1].trim();
  const morceaux = adresse.split(',').map((x) => x.trim()).filter(Boolean);
  if (morceaux.length > 1 && !/\d/.test(morceaux[morceaux.length - 1])) return morceaux[morceaux.length - 1];
  const champ = String(p?.ville_secteur_champ1 || '').trim();
  if (champ && champ.length <= 30 && !/centre|ville|secteur|quartier|densit|proximit|commune|agglom|\bbon\b|hyper|ultra|touristique|plage|lisi[eè]re|aisance|basilic|huriya|boucle|disponible|^null$/i.test(champ)) return champ;
  return trouverVille(adresse)?.nom || '';
}

/**
 * Les photos de nos projets, par ville (26 nov. 2026, Jules : « prends les photos qu'on a choisies ; pour un dossier à
 * Paris, une photo d'un projet qu'on a mis à Paris ; une ville où on n'a rien, celle que tu veux ») : la couverture de
 * chaque projet (sa première photo), rangée sous la ville du projet. Relue avec la liste des dossiers.
 */
// Le fichier est bien sur le disque (un projet peut citer une image restée sur un autre serveur).
const fichierPresent = (url) => {
  try { return fs.existsSync(path.join(CHEMIN_UPLOADS, decodeURIComponent(url.replace(/^\/uploads\//, '').split('?')[0]))); } catch { return false; }
};

function photosDesProjets() {
  const parVille = new Map();
  for (const p of Records.list('Project')) {
    // Une photo gardée chez nous (/uploads) : celles du Drive ou de l'ancien hébergement ne se chargent plus toujours.
    const photo = (p.photos || []).map((x) => (typeof x === 'string' ? x : x?.url))
      .find((u) => u && u.startsWith('/uploads/') && fichierPresent(u));
    const cle = cleVille(villeDuProjet(p));
    if (!photo || !cle) continue;
    if (!parVille.has(cle)) parVille.set(cle, []);
    if (!parVille.get(cle).includes(photo)) parVille.get(cle).push(photo);
  }
  return parVille;
}

function chercherPhotosVille(lignes) {
  if (photosEnCours || process.env.NODE_TEST_CONTEXT || process.env.KLOCKA_SANS_RESEAU) return;
  // Version 2 (26 nov. 2026, Jules : « des collages, c'est trop bizarre ») : la photo de Wikidata, jamais un montage ;
  // les photos de ville d'avant sont cherchées de nouveau. Une même ville reprend la photo déjà trouvée.
  // Pour tous les dossiers sans projet : la photo de ville sert aussi de recours quand les photos de nos projets de la
  // ville sont déjà prises par les cartes voisines.
  const sans = lignes.filter((x) => x && !x.projet_id).map((x) => Records.findBy('Deal', 'deal_id', x.deal_id))
    .filter((d) => d && d.photo_ville_v !== VERSION_PHOTO_VILLE).slice(0, 6);
  if (!sans.length) return;
  photosEnCours = true;
  (async () => {
    const { photosDeLaVille, telechargerDeCommons } = await import('./photos-auto.js');
    const { CHEMIN_UPLOADS } = await import('../db.js');
    const tous = Records.list('Deal').filter((x) => !x.projet_id);
    const ordre = (x) => String(x.cree_le || x.created_date || x.id || '');
    for (const d of sans) {
      const v = villeDe(d);
      const cle = v.nom.toLowerCase();
      let url = null;
      if (v.nom) {
        if (!photosParVille.has(cle)) photosParVille.set(cle, photosDeLaVille(v.nom, { departement: v.departement }).catch(() => []));
        const fichiers = await photosParVille.get(cle);
        if (!fichiers.length) photosParVille.delete(cle);
        // Chaque dossier d'une même ville a sa photo (26 nov. 2026, Jules : « tout le temps la même photo pour une même
        // ville ») : celle de son rang parmi les dossiers de la ville, la même à chaque fois.
        const rang = Math.max(0, tous.filter((x) => villeDe(x).nom.toLowerCase() === cle).sort((a, b) => ordre(a).localeCompare(ordre(b))).findIndex((x) => x.id === d.id));
        for (let k = 0; k < Math.min(3, fichiers.length) && !url; k += 1) url = await telechargerDeCommons(fichiers[(rang + k) % fichiers.length], CHEMIN_UPLOADS).catch(() => null);
        await new Promise((ok) => setTimeout(ok, 600));
      }
      // Une ville connue sans photo trouvée (réseau, limite d'appels) : réessayée aux ouvertures suivantes, trois fois au plus.
      const essais = (Number(d.photo_ville_essais) || 0) + 1;
      const fini = !!url || !v.nom || essais >= 3;
      Records.update('Deal', d.id, { ...(url || fini ? { photo_ville: url || null } : {}), ...(fini ? { photo_ville_v: VERSION_PHOTO_VILLE, photo_ville_essais: 0 } : { photo_ville_essais: essais }), photo_ville_essai: new Date().toISOString() });
    }
  })().catch(() => {}).finally(() => { photosEnCours = false; });
}

function lireListeDossiers() {
  // La photo de chaque carte (26 nov. 2026, Jules : « deux dossiers de Lyon collés ne doivent pas avoir la même photo ») :
  // un dossier qui a son projet, la photo du projet ; sinon la couverture la moins prise de nos projets de sa ville, sinon
  // sa photo de ville ; jamais une photo des quatre cartes d'avant (sa voisine, celle du dessus), dans l'ordre de la liste.
  // Les photos des projets d'abord, à leur place ; puis chaque autre carte évite celles des quatre cartes d'avant et
  // d'après.
  const nosVilles = photosDesProjets();
  const ordre = Records.list('Deal', { sort: '-created_date' }).filter((d) => !d.cache_equipe);
  // Une photo choisie à la main (26 nov. 2026, Jules) passe devant tout et ne cède jamais sa place à une voisine.
  const choisies = ordre.map((d) => d.photo_choisie || photoDuProjet(d));
  const prises = new Map();
  for (const p of choisies) if (p) prises.set(p, (prises.get(p) || 0) + 1);
  ordre.forEach((d, i) => {
    if (choisies[i]) return;
    const candidates = [...new Set([...(nosVilles.get(cleVille(villeDe(d).nom)) || []), d.photo_ville].filter(Boolean))];
    const voisines = new Set(choisies.slice(Math.max(0, i - 4), i + 5).filter(Boolean));
    const libres = candidates.filter((c) => !voisines.has(c));
    const photo = (libres.length ? libres : candidates).sort((x, y) => (prises.get(x) || 0) - (prises.get(y) || 0))[0] || null;
    choisies[i] = photo;
    if (photo) prises.set(photo, (prises.get(photo) || 0) + 1);
  });
  const photos = new Map(ordre.map((d, i) => [d.id, choisies[i]]));
  // Les lettres d'intention par dossier : l'étape « Offre » de la frise (17 oct. 2026).
  const offresParDeal = {};
  for (const l of Records.list('LettreIntention')) if (l.deal_id) offresParDeal[l.deal_id] = (offresParDeal[l.deal_id] || 0) + 1;
  return Records.list('Deal', { sort: '-created_date' }).map((d) => ({ cache: !!d.cache_equipe, d: d.cache_equipe ? null : {
    nb_offres: offresParDeal[d.deal_id] || 0,
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
    // Les étapes validées à la main : la carte de la liste dit celle qui suit (16 nov. 2026, Jules).
    frise_validee: Number(d.frise_validee) || 0,
    titre: nettoyerTitre(d.nom || d.lots?.[0]?.synthese?.titre || d.source?.nom_fichier || d.deal_id),
    responsables: d.responsables || [],
    // Un dossier venu d'un mandataire K Partners : sa pastille dans la liste.
    origine: d.origine || null,
    mandataire_email: d.mandataire_email || null,
    dossier_mandataire_id: d.dossier_mandataire_id || null,
    dernier_suivi: (d.suivi || [])[d.suivi?.length - 1] || null,
    // L'image de la carte : celle du projet né du dossier, sinon une photo du mandataire.
    photo: photos.get(d.id) || null,
    // La photo de ville, en recours quand la liste se range autrement (par ouverture) et qu'une voisine a la même.
    photo_secours: d.projet_id || d.photo_choisie ? null : d.photo_ville || null,
    photo_choisie: !!d.photo_choisie,
    // Les aperçus de la page Dossiers (14 nov. 2026, Jules) : la fiche commerciale reçue, et deux pièces de la
    // Data Room à poser derrière. Des adresses seulement : la vignette se dessine dans le navigateur (MiniaturePiece).
    ...apercusDe(d),
    // Le verdict choisi par l'équipe, seul montré sur la carte (10 nov. 2026, Jules : plus le verdict calculé).
    verdict_choisi: d.verdict_choisi?.valeur || null,
    lots: (d.lots || []).map((l) => ({
      index: l.index,
      intitule: l.intitule,
      verdict: l.evaluation?.verdict,
      titre: l.synthese?.titre,
      ville: l.enrichissement?.commune?.nom || l.lot?.adresse?.valeur?.ville || null,
      adresse: l.lot?.adresse?.valeur?.rue || null,
      prix_fai: l.lot?.prix_fai?.absent === false ? l.lot.prix_fai.valeur : null,
      loyer_annuel: l.lot?.loyer_annuel_ht_hc?.absent === false ? l.lot.loyer_annuel_ht_hc.valeur : null,
      surface_m2: l.lot?.surface_m2?.absent === false ? l.lot.surface_m2.valeur : null,
    })),
  } }));
}

const LISIBLE = /\.(pdf|png|jpe?g|webp|gif)$/i;
/** Pure : la fiche (PDF ou image reçus, sinon le début d'un texte collé) et les deux premières pièces lisibles de la Data Room. */
export function apercusDe(d) {
  const s = d?.source || {};
  // `apercu_fiche` : une fiche posée pour l'aperçu seul, sans toucher à la source (les dossiers d'essai en local).
  const fiche = s.url && ['pdf', 'image'].includes(s.type) ? { url: s.url, nom: s.nom_fichier || null }
    : d?.apercu_fiche?.url ? { url: d.apercu_fiche.url, nom: d.apercu_fiche.nom || null } : null;
  const docs = Array.isArray(d?.documents_espace) ? d.documents_espace : [];
  const pieces = docs.filter((x) => x?.url && (LISIBLE.test(x.url) || /^(application\/pdf|image\/)/.test(x.mime || ''))).slice(0, 2).map((x) => ({ url: x.url, nom: x.nom || null }));
  // Un dossier reçu en texte collé : le début du texte, pour dessiner sa fiche en page de texte.
  const texte = !fiche && s.type === 'texte' && typeof s.texte === 'string' ? s.texte.trim().slice(0, 700) : '';
  return { fiche, fiche_texte: texte || null, pieces, nb_pieces: docs.length };
}

/** La photo du projet d'un dossier : sa première, celle de sa carte et de sa page ; null sans projet. */
function photoDuProjet(d) {
  const projet = d?.projet_id ? Records.get('Project', d.projet_id) : null;
  return (projet?.photos || []).map((x) => (typeof x === 'string' ? x : x?.url || null)).find(Boolean) || null;
}

/**
 * Un lot tel que la page le lit : sa grille de critères calculée, et le
 * rendement net moyen s'il a été évalué avant qu'on le calcule. Toute réponse
 * qui renvoie un lot passe par ici — sans quoi, après un recalcul, le lot
 * revenait sans grille et le tableau du bien perdait tous ses statuts.
 */
export function lotPourLecture(lot) {
  if (!lot?.evaluation) return lot;
  let contexte = lot.evaluation.contexte;
  if (contexte && contexte.rendement_net_moyen == null && lot.simulateur) {
    let net = null;
    try { net = rendementNetMoyen(lot.simulateur); } catch { net = null; }
    contexte = { ...contexte, rendement_net_moyen: net };
  }
  const evaluation = { ...lot.evaluation, contexte };
  const lu = { ...lot, evaluation: { ...evaluation, grille: grilleCriteres(evaluation) } };
  // Les notes se calculent comme la grille, à la lecture : un dossier d'hier les reçoit aussi.
  return { ...lu, notes: notesDuLot(lu) };
}

export function obtenirDossier(dealId) {
  const deal = Records.findBy('Deal', 'deal_id', dealId) || null;
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
        lots: (deal.lots || []).map(lotPourLecture),
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
  const dossier = Records.findBy('Deal', 'deal_id', dealId);
  if (!dossier) return { error: 'Dossier introuvable' };
  // Un dossier sans pré-analyse n'a pas encore de lot : le simulateur reste ouvert et ses chiffres se gardent
  // sur un lot neuf, sans rejouer de fiche (29 oct. 2026, Jules).
  if (!dossier.lots?.[indexLot] && indexLot === 0) {
    const propres = Object.fromEntries(Object.entries(parametres || {}).filter(([, v]) => v !== undefined && typeof v !== 'function' && !(Array.isArray(v) && v.length > 30)));
    const lots = [{ lot: {}, simulateur: { ...propres, enregistre_le: new Date().toISOString(), enregistre_par: user?.email || null } }];
    Records.update('Deal', dossier.id, { lots });
    return { deal_id: dealId, lot: { simulateur: lots[0].simulateur, index: 0 } };
  }
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
  return { deal_id: dealId, lot: { ...lotPourLecture(lots[indexLot]), index: indexLot } };
}

/**
 * La vérification d'un critère, à la main : « vérifié » quand on l'a contrôlé,
 * « incertain » quand on doute, rien pour revenir au calcul. Elle ne change pas
 * le verdict, elle dit où en est la relecture humaine.
 */
// Les lignes de la fiche du bien qui portent une note.
export const LIGNES_NOTEES = ['prix', 'prix_marche', 'rendement', 'loyer', 'loyer_marche', 'occupe', 'activite', 'enseigne', 'emplacement'];

/**
 * La note d'une ligne, réécrite à la main : elle remplace la note calculée
 * jusqu'à ce qu'on la vide. Qui l'a écrite et quand restent dessus.
 */
export function noterLigne(dealId, indexLot, ligne, texte, user) {
  const dossier = Records.findBy('Deal', 'deal_id', dealId);
  if (!dossier) return { error: 'Dossier introuvable' };
  const entree = dossier.lots?.[indexLot];
  if (!entree) return { error: 'Lot introuvable' };
  if (!LIGNES_NOTEES.includes(ligne)) return { error: 'Ligne inconnue' };
  const propre = String(texte || '').trim().slice(0, 2000);
  const notes = { ...(entree.notes_manuelles || {}) };
  if (propre) notes[ligne] = { texte: propre, par: user?.email || null, le: new Date().toISOString() };
  else delete notes[ligne];
  const lots = [...dossier.lots];
  lots[indexLot] = { ...entree, notes_manuelles: notes };
  Records.update('Deal', dossier.id, { lots });
  return { deal_id: dealId, lot: { ...lotPourLecture(lots[indexLot]), index: indexLot } };
}

export function verifierCritere(dealId, indexLot, cle, statut, user) {
  const dossier = Records.findBy('Deal', 'deal_id', dealId);
  if (!dossier) return { error: 'Dossier introuvable' };
  const entree = dossier.lots?.[indexLot];
  if (!entree) return { error: 'Lot introuvable' };
  // Les trois statuts des grilles du bail. « verifie » et « incertain »,
  // d'avant, se lisent encore comme OK et à vérifier.
  if (statut && !['ok', 'a_verifier', 'no_go', 'verifie', 'incertain'].includes(statut)) return { error: 'Statut inconnu' };
  const verifications = { ...(entree.verifications || {}) };
  if (statut) verifications[cle] = { statut, par: user?.email || null, le: new Date().toISOString() };
  else delete verifications[cle];
  const lots = [...dossier.lots];
  lots[indexLot] = { ...entree, verifications };
  Records.update('Deal', dossier.id, { lots });
  return { deal_id: dealId, lot: { ...lotPourLecture(lots[indexLot]), index: indexLot } };
}
