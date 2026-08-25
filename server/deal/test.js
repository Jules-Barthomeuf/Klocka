// Mode test du pipeline deal.
//
// Crée un deal fictif complet mais RÉEL (enregistré en base, statut 'analyse')
// pour parcourir les cinq étapes de bout en bout sans aucun appel API :
//   - pas de LLM (synthèse et mails de secours, extraction pré-écrite) ;
//   - pas de géo (commune pré-enrichie) ;
//   - pas de Gmail (envois toujours simulés) ni de Drive (classement simulé) ;
//   - la base de données marché n'est jamais alimentée par un deal de test.
// Le verdict, lui, vient du vrai moteur (rules.js) : le mode test vérifie
// aussi les profils de rules.json.

import { randomUUID } from 'crypto';
import { Records } from '../db.js';
import { evaluer, profilsConfigures } from './rules.js';
import { calculerAEM, parametresSimulateur } from './aem.js';
import { changerStatut, statutDe } from './lifecycle.js';

const champ = (valeur, citation, confiance = 'haute') => ({ valeur, citation, confiance, absent: false });
const absent = { valeur: null, citation: null, confiance: null, absent: true };
const val = (c) => (c && c.absent === false ? c.valeur : null);

// Chambéry (ville moyenne) à 300 K€ / 27 K€ de loyer : AEM ≈ 7,7 %, dans la
// cible du Profil 02. L'emplacement démarre 'a_qualifier' pour que le test
// couvre aussi la qualification humaine (n°1 → GO ; secondaire → NO-GO).
function lotTest() {
  return {
    adresse: champ(
      { rue: '8 place Saint-Léger', code_postal: '73000', ville: 'Chambéry' },
      'Local commercial situé 8 place Saint-Léger, 73000 Chambéry'
    ),
    type_actif: champ('Local commercial', 'Local commercial en pied d’immeuble'),
    surface_m2: champ(85, 'surface de vente de 85 m²'),
    prix_fai: champ(300000, 'Prix : 300 000 € FAI'),
    honoraires_inclus: champ(true, 'frais d’agence inclus'),
    montant_honoraires: absent,
    loyer_annuel_ht_hc: champ(27000, 'loyer annuel de 27 000 € HT HC'),
    rendement_annonce: champ(9, 'rendement affiché de 9 %'),
    locataire_nom: champ('Boulangerie Feuillette', 'exploité par la Boulangerie Feuillette'),
    locataire_activite: champ('Boulangerie', 'activité de boulangerie-pâtisserie'),
    bail_type: champ('3-6-9', 'bail commercial 3/6/9 signé en 2023'),
    bail_echeance: champ('2032-09-30', 'échéance au 30 septembre 2032'),
    occupe: champ(true, 'local actuellement exploité'),
    intitule_lot: absent,
  };
}

function enrichissementTest() {
  return {
    commune: {
      code_insee: '73065',
      nom: 'Chambéry',
      population: 60119,
      centre: { lon: 5.9214, lat: 45.5646 },
      ambigu: false,
    },
    typologie_ville: 'ville_moyenne',
    revenu_median: 23480,
    ville_riche: false,
    paris: false,
    signature: {
      niveau: 'nationale_standard',
      confiance: 'haute',
      source: 'referentiel',
      enseigne: 'Boulangerie Feuillette',
      a_valider: false,
      justification: null,
    },
    activite: { code: 'boulangerie', libelle: 'Boulangerie / pâtisserie', exclue: false },
    emplacement: 'a_qualifier',
  };
}

const CONTEXTE_MARCHE_TEST = {
  resume:
    "Le centre ancien de Chambéry concentre l'activité commerçante autour de la place Saint-Léger et de la rue de Boigne, axes piétons les plus fréquentés de la ville. Les loyers des boutiques de centre-ville s'y établissent entre 250 et 400 €/m²/an selon l'exposition, pour des valeurs vénales de 3 000 à 4 500 €/m². (Contenu fictif — mode test, aucune recherche web effectuée.)",
  sources: [
    { titre: 'Source fictive — Observatoire du commerce savoyard', url: 'https://exemple.invalid/observatoire-test' },
    { titre: 'Source fictive — Étude marché murs commerciaux', url: 'https://exemple.invalid/etude-test' },
  ],
  genere_le: null,
  test: true,
};

const SYNTHESE_DOCUMENTS_TEST = {
  resume:
    'Trois documents simulés : bail commercial, PV d’assemblée générale et diagnostics. Les données du bail concordent avec la fiche sur le loyer et la surface. Deux points appellent une vérification. (Contenu fictif — mode test.)',
  points_a_verifier: [
    {
      titre: 'PV d’AG — ravalement en discussion',
      detail:
        'Un ravalement de façade a été évoqué en AG sans vote ni chiffrage. Demander les devis avant l’offre. (Document simulé.)',
      gravite: 'attention',
    },
    {
      titre: 'Bail — indexation à vérifier',
      detail: 'La clause d’indexation ILC mentionne un plafonnement dont la rédaction est ambiguë. (Document simulé.)',
      gravite: 'info',
    },
  ],
  ia: false,
  test: true,
};

/** Crée le deal de test et l'enregistre. Le verdict vient du vrai moteur. */
export function creerDealTest(user) {
  const lot = lotTest();
  const enrichissement = enrichissementTest();
  const evaluation = evaluer(lot, enrichissement);

  const dealId = randomUUID();
  const maintenant = new Date().toISOString();

  const dossier = {
    deal_id: dealId,
    cree_le: maintenant,
    cree_par: user?.email || null,
    test: true,
    statut: 'analyse',
    archived: false,
    relance_prevue_le: null,
    contact_agent_email: 'agent.test@exemple.invalid',
    dossier_doc_id: null,
    documents_simules: false,
    projet_id: null,
    suivi: [
      {
        le: maintenant,
        par: user?.email || null,
        type: 'analyse',
        detail: `${evaluation.verdict} — deal de test (aucun appel API)`,
      },
    ],
    source: {
      nom_fichier: 'fiche-test-chambery.pdf',
      type: 'test',
      transcrit: false,
      pages: 2,
      url: null,
      avertissements: [],
      texte_source: 'Fiche fictive générée par le mode test. Aucun document réel.',
    },
    extraction: { ia: false, incidents: [] },
    multi_lots: false,
    lots: [
      {
        index: 0,
        intitule: '',
        lot,
        enrichissement,
        evaluation,
        synthese: {
          titre: `Boulangerie Feuillette — 8 place Saint-Léger, Chambéry — ${evaluation.verdict}`,
          synthese:
            `Local commercial de 85 m² en pied d'immeuble, loué à une boulangerie d'enseigne nationale pour 27 000 € HT HC par an. ` +
            `Au prix affiché de 300 000 € FAI, le rendement AEM ressort à ${evaluation.aem?.rendement_aem ?? '—'} % pour un prix de revient de ${evaluation.aem?.prix_aem?.toLocaleString('fr-FR') ?? '—'} €. ` +
            `L'emplacement reste à qualifier visuellement. (Synthèse fixe — mode test, rédigée sans IA.)`,
          points_forts: ['Rendement AEM au-dessus du seuil du profil', 'Enseigne nationale en place', 'Bail courant jusqu’en 2032'],
          points_vigilance: ['Emplacement à qualifier', 'Charges de copropriété à vérifier'],
          ia: false,
        },
        mail_agent: null,
        contexte_marche: CONTEXTE_MARCHE_TEST,
        simulateur: parametresSimulateur({
          prixFai: val(lot.prix_fai),
          loyerAnnuel: val(lot.loyer_annuel_ht_hc),
          surface: val(lot.surface_m2),
        }),
        incidents_garde_fou: [],
      },
    ],
    duree_ms: 0,
    profils_configures: profilsConfigures(),
  };

  Records.create('Deal', dossier, user?.email);
  return dossier;
}

/**
 * Simule la réception + l'extraction des documents d'un deal de test :
 * pose la synthèse fictive et avance le statut jusqu'à 'depouille'.
 * Les documents affichés côté client sont la fixture de démonstration.
 */
export function simulerDocumentsTest(dossier, user) {
  if (!dossier.test) return { error: 'Réservé aux deals de test.' };

  Records.update('Deal', dossier.id, {
    documents_simules: true,
    synthese_documents: SYNTHESE_DOCUMENTS_TEST,
  });

  let deal = Records.get('Deal', dossier.id);
  if (statutDe(deal) === 'analyse' || statutDe(deal) === 'documents_demandes') {
    changerStatut(deal, 'documents_recus', { user, note: 'Documents reçus (simulation — mode test)' });
    deal = Records.get('Deal', dossier.id);
  }
  if (statutDe(deal) === 'documents_recus') {
    changerStatut(deal, 'depouille', { user, note: 'Extraction simulé (mode test)' });
    deal = Records.get('Deal', dossier.id);
  }
  return { deal_id: deal.deal_id, statut: statutDe(deal), synthese_documents: deal.synthese_documents };
}

/**
 * Rejoue le verdict d'un deal de test après saisie humaine, sans réseau :
 * l'enrichissement stocké est réutilisé tel quel, seul l'emplacement change.
 */
export function reevaluerLotTest(dossier, indexLot, saisie = {}) {
  const entree = dossier.lots?.[indexLot];
  if (!entree) return { error: 'Lot introuvable' };

  const emplacementsValides = ['n1', 'n1_bis', 'intermediaire', 'secondaire'];
  const enrichissement = {
    ...entree.enrichissement,
    ...(emplacementsValides.includes(saisie.emplacement)
      ? { emplacement: saisie.emplacement, emplacement_qualifie_par: saisie.par || null }
      : {}),
  };
  const evaluation = evaluer(entree.lot, enrichissement);

  if (saisie.prix_negocie) {
    evaluation.aem = calculerAEM({
      prixFai: val(entree.lot.prix_fai),
      prixNegocie: saisie.prix_negocie,
      loyerAnnuel: val(entree.lot.loyer_annuel_ht_hc),
    });
  }

  const synthese = {
    ...entree.synthese,
    titre: entree.synthese?.titre?.replace(/— [^—]+$/, `— ${evaluation.verdict}`) || entree.synthese?.titre,
  };

  const lots = [...dossier.lots];
  lots[indexLot] = { ...entree, enrichissement, evaluation, synthese };
  Records.update('Deal', dossier.id, { lots });

  return { deal_id: dossier.deal_id, lot: lots[indexLot] };
}

/** Supprime le deal de test, et le projet [TEST] qu'il aurait créé. */
export function supprimerDealTest(dossier) {
  if (!dossier.test) return { error: 'Seul un deal de test peut être supprimé ici.' };

  if (dossier.projet_id) {
    const projet = Records.get('Project', dossier.projet_id);
    if (projet && String(projet.titre || '').startsWith('[TEST]')) {
      Records.delete('Project', projet.id);
    }
  }
  Records.delete('Deal', dossier.id);
  return { success: true };
}
