// Deal de démonstration pour le mode aperçu de la page Analyse.
//
// Il reproduit fidèlement la forme d'un vrai dossier (entité Deal + son
// DossierDoc lié) pour que les cinq étapes du workflow s'affichent avec du
// contenu réaliste, sans toucher à la base ni appeler l'API. Aucun bouton
// n'agit en aperçu : voir la prop `apercu` de WorkflowDeal.

const champ = (valeur, citation, confiance = "haute") => ({
  valeur,
  citation,
  confiance,
  absent: false,
});

const absent = { valeur: null, citation: null, confiance: null, absent: true };

export const DEAL_APERCU_ID = "apercu-demo";

export const dossierDemo = {
  deal_id: DEAL_APERCU_ID,
  cree_le: "2026-08-12T09:24:00.000Z",
  cree_par: "vous@klocka.immo",
  statut: "depouille",
  archived: false,
  relance_prevue_le: null,
  contact_agent_email: "marie.legrand@agence-rhone.fr",
  dossier_doc_id: "apercu-docs",
  projet_id: null,
  source: {
    nom_fichier: "fiche-victor-hugo-lyon.pdf",
    type: "pdf",
    transcrit: false,
    pages: 2,
    url: null,
    avertissements: [],
  },
  source_mail: {
    de: "Marie Legrand <marie.legrand@agence-rhone.fr>",
    objet: "Opportunité murs commerciaux — 45 rue Victor Hugo, Lyon 2e",
    date: "2026-08-12T09:18:00.000Z",
  },
  multi_lots: false,
  profils_configures: 2,
  suivi: [
    { le: "2026-08-12T09:20:00.000Z", par: "vous@klocka.immo", type: "mail_envoye", detail: "Demande de fiche complète", destinataire: "marie.legrand@agence-rhone.fr" },
    { le: "2026-08-12T09:24:00.000Z", par: "vous@klocka.immo", type: "analyse", detail: "GO SOUS RÉSERVE" },
    { le: "2026-08-12T09:31:00.000Z", par: "vous@klocka.immo", type: "mail_envoye", intention: "demande_documents", detail: "Suite de l'étude — documents du dossier", destinataire: "marie.legrand@agence-rhone.fr" },
    { le: "2026-08-12T09:31:00.000Z", par: "vous@klocka.immo", type: "statut", detail: "Demande de documents envoyée", de: "analyse", vers: "documents_demandes" },
    { le: "2026-08-14T10:02:00.000Z", par: "vous@klocka.immo", type: "statut", detail: "Document reçu : bail-commercial.pdf", de: "documents_demandes", vers: "documents_recus" },
    { le: "2026-08-14T10:03:00.000Z", par: "vous@klocka.immo", type: "statut", detail: "Extraction effectuée", de: "documents_recus", vers: "depouille" },
  ],
  synthese_documents: {
    resume:
      "Trois documents extraits : bail commercial, PV d'assemblée générale 2025 et diagnostics. Les données du bail concordent avec l'annonce sur le loyer et la surface. Deux points méritent une vérification avant d'aller plus loin.",
    points_a_verifier: [
      {
        titre: "Bail — échéance et durée résiduelle",
        detail:
          "Le bail court jusqu'au 30 juin 2030, soit 3 ans et 10 mois de durée résiduelle. L'annonce mentionne « bail 3/6/9 récent » : à confirmer auprès de l'agent (bail-commercial.pdf, p.2).",
        gravite: "attention",
      },
      {
        titre: "PV d'AG — ravalement voté",
        detail:
          "Un ravalement de façade a été voté en AG du 14 mars 2025 pour 82 000 € sur la copropriété, non provisionné dans l'annonce. Quote-part à chiffrer avant l'offre (pv-ag-2025.pdf, p.3).",
        gravite: "bloquant",
      },
      {
        titre: "Diagnostics — DPE en catégorie D",
        detail:
          "DPE classé D (241 kWh/m²/an). Sans obligation de travaux à court terme pour un local commercial, mais à intégrer à la stratégie de revente (diagnostics.pdf, p.1).",
        gravite: "info",
      },
    ],
    ia: true,
    genere_le: "2026-08-14T10:03:00.000Z",
  },
  lots: [
    {
      index: 0,
      intitule: "",
      lot: {
        adresse: champ(
          { rue: "45 rue Victor Hugo", code_postal: "69002", ville: "Lyon" },
          "Local commercial situé 45 rue Victor Hugo, 69002 Lyon"
        ),
        type_actif: champ("Local commercial", "Local commercial en rez-de-chaussée"),
        surface_m2: champ(60, "surface de 60 m² pondérés"),
        prix_fai: champ(400000, "Prix de vente : 400 000 € FAI"),
        honoraires_inclus: champ(true, "honoraires inclus (5 %)"),
        montant_honoraires: champ(20000, "honoraires inclus (5 %)"),
        loyer_annuel_ht_hc: champ(28000, "loyer annuel de 28 000 € HT HC"),
        rendement_annonce: champ(7, "rendement de 7 %"),
        locataire_nom: champ("Optique Presqu'île", "loué à Optique Presqu'île"),
        locataire_activite: champ("Opticien", "activité d'opticien"),
        bail_type: champ("Bail commercial 3/6/9", "bail commercial 3/6/9"),
        bail_echeance: champ("2030-06-30", "échéance juin 2030"),
        occupe: champ(true, "actuellement loué"),
        intitule_lot: absent,
      },
      enrichissement: {
        commune: { code_insee: "69123", nom: "Lyon", population: 519127, centre: { lon: 4.8351, lat: 45.758 }, ambigu: false },
        typologie_ville: "métropole",
        revenu_median: 24310,
        ville_riche: false,
        paris: false,
        signature: { niveau: "indépendant", confiance: "moyenne", source: "ia", enseigne: "Optique Presqu'île", a_valider: true, justification: "Enseigne locale indépendante, absente du référentiel national." },
        activite: { code: "optique", libelle: "Optique / lunetterie", exclue: false },
        emplacement: "n1_bis",
        emplacement_qualifie_par: "vous@klocka.immo",
      },
      evaluation: {
        verdict: "GO SOUS RÉSERVE",
        profil: { code: "02", libelle: "Investisseur rendement — métropole" },
        motifs: ["Rendement AEM dans la cible 5–7 %.", "Emplacement N°1 bis qualifié par un humain."],
        reserves: [
          { id: "RES-SIGNATURE-INCONNUE", motif: "Enseigne indépendante : solidité du preneur à vérifier (bilans)." },
          { id: "RES-BAIL-COURT", motif: "Durée résiduelle du bail inférieure à 5 ans." },
        ],
        manquants: [],
        libelles_manquants: [],
        aem: {
          prix_fai: 400000,
          honoraires_agence: 20000,
          prix_hors_droits: 380000,
          droits_enregistrement: 30400,
          fees_klocka: 32000,
          frais_divers: 2000,
          prix_aem: 464400,
          surcout_vs_fai: 64400,
          rendement_fai: 7,
          rendement_aem: 6.03,
          taux: { commission_agent: 5, droits_enregistrement: 8, fees_klocka: 8 },
        },
        contexte: { annees_bail_restantes: 3.9 },
      },
      synthese: {
        titre: "Optique Presqu'île — 45 rue Victor Hugo, Lyon 2e — GO SOUS RÉSERVE",
        synthese:
          "Ce local commercial de 60 m² en rez-de-chaussée est loué à un opticien indépendant pour 28 000 € HT HC par an. Le prix affiché de 400 000 € FAI donne un rendement annoncé de 7 %, mais le rendement AEM — celui qui fait foi chez nous — ressort à 6,03 % pour un prix de revient de 464 400 €, droits et honoraires inclus. L'emplacement a été qualifié N°1 bis, sur un axe commerçant dense du 2e arrondissement. Deux réserves subsistent : la signature du preneur, enseigne indépendante dont la solidité reste à établir, et la durée résiduelle du bail, inférieure à cinq ans.",
        points_forts: ["Rendement AEM dans la cible", "Emplacement N°1 bis en hypercentre", "Activité non exclue"],
        points_vigilance: ["Preneur indépendant", "Bail à échéance 2030"],
        ia: true,
      },
      mail_agent: null,
      contexte_marche: {
        resume:
          "Le marché des murs commerciaux lyonnais reste porté par la Presqu'île et le 6e arrondissement, où les emplacements N°1 se négocient entre 4 000 et 6 500 €/m². Le 2e arrondissement, autour de la rue Victor Hugo et de la rue de la République, concentre les flux piétons les plus élevés de la ville. Les rendements constatés y oscillent entre 4,5 % et 6 % pour les meilleures signatures, davantage pour les preneurs indépendants. Les 3e et 7e arrondissements offrent des rendements supérieurs mais avec une vacance plus marquée. La tendance sur douze mois est stable, après deux années de correction sur les commerces périphériques.",
        sources: [
          { titre: "Observatoire des commerces — Métropole de Lyon", url: "https://example.org/observatoire-commerces-lyon" },
          { titre: "Marché des murs commerciaux 2026 — étude régionale", url: "https://example.org/etude-murs-commerciaux-2026" },
        ],
        genere_le: "2026-08-12T09:24:00.000Z",
      },
      simulateur: {
        prixBienFAI: 400000,
        prixBienNegocie: 400000,
        loyerInitialHTHC: 28000,
        surface: 60,
        tauxDroitsEnregistrement: 8,
        tauxFeesKlocka: 8,
        feesKlockaType: "pourcentage",
        tauxIncentiveKlocka: 20,
        tauxCommissionAgent: 5,
        commissionAgentInclusFAI: true,
        fraisDossierBancaire: 1000,
        coutCreationSociete: 1000,
        fraisCourtage: 0,
      },
      incidents_garde_fou: [],
    },
  ],
};

// Documents extraits du deal de démonstration (forme d'un DossierDoc).
// Les identifiants de champs suivent la grille réelle
// (server/assistant/data/documents.json) pour que les libellés s'affichent.
const val = (valeur, citation, page, confiance = "haute") => ({
  valeur,
  citation,
  page,
  confiance,
  absent: false,
});

const vide = { valeur: null, citation: null, page: null, confiance: null, absent: true };

export const documentsDemo = [
  {
    doc_id: "apercu-bail",
    nom_fichier: "bail-commercial.pdf",
    url: null,
    nb_pages: 14,
    transcrit: false,
    classement: { code: "bail", libelle: "Bail commercial", confiance: "haute", source: "indices", candidats: [] },
    champs: {
      type_bail: val("Bail commercial 3/6/9", "bail commercial de neuf années entières", 1),
      echeance_bail: val("30/06/2030", "pour se terminer le 30 juin 2030", 2),
      parties: val(
        "SCI Victor Hugo Invest (bailleur) / SARL Optique Presqu'île (preneur)",
        "entre la SCI Victor Hugo Invest, bailleur, et la SARL Optique Presqu'île, preneur",
        1
      ),
      loyer_signature: val("28 000 € HT HC par an", "loyer annuel de vingt-huit mille euros hors taxes hors charges", 3),
      indexation: val("ILC, révision annuelle", "indexation annuelle sur l'Indice des Loyers Commerciaux", 5),
      depot_garantie: val("7 000 €", "dépôt de garantie correspondant à un trimestre de loyer", 4),
      charges: val("Charges de copropriété récupérables au preneur", "le preneur rembourse les charges récupérables", 6, "moyenne"),
      taxes: val("Taxe foncière refacturée au preneur", "la taxe foncière est remboursée par le preneur", 6),
      destination: val("Optique, lunetterie et activités connexes", "destination : optique, lunetterie et activités connexes", 2),
      mode_reglement: val("Trimestriel d'avance", "payable trimestriellement d'avance", 3),
      loyer_tva: val("Non assujetti", "le loyer n'est pas soumis à la TVA", 3, "moyenne"),
      conditions_cession: val(
        "Cession autorisée au seul successeur du fonds, solidarité du cédant maintenue",
        "la cession n'est autorisée qu'au successeur du fonds de commerce",
        9
      ),
      conditions_exceptionnelles: vide,
      pas_de_porte: vide,
    },
    incidents: [],
    analyse_le: "2026-08-14T10:02:00.000Z",
  },
  {
    doc_id: "apercu-pv",
    nom_fichier: "pv-ag-2025.pdf",
    url: null,
    nb_pages: 6,
    transcrit: false,
    classement: { code: "pv_ag", libelle: "PV d'assemblée générale", confiance: "haute", source: "indices", candidats: [] },
    champs: {
      travaux_votes: val(
        "Ravalement de façade voté — 82 000 € pour la copropriété (AG du 14 mars 2025)",
        "vote du ravalement de façade pour un montant de 82 000 €",
        3
      ),
      travaux_discussion: val(
        "Réfection de la toiture évoquée, devis attendus pour l'AG 2026",
        "la réfection de la toiture sera étudiée lors de la prochaine assemblée",
        4,
        "moyenne"
      ),
      resolutions_non_votees: vide,
    },
    incidents: [],
    analyse_le: "2026-08-14T10:03:00.000Z",
  },
  {
    doc_id: "apercu-diag",
    nom_fichier: "diagnostics.pdf",
    url: null,
    nb_pages: 9,
    transcrit: true,
    classement: { code: "diagnostics", libelle: "Diagnostics techniques", confiance: "moyenne", source: "ia", candidats: [] },
    champs: {
      dpe: val("Classe D — 241 kWh/m²/an", "classe énergétique : D, consommation 241 kWh/m²/an", 1, "moyenne"),
      amiante: val("Absence de matériaux amiantés repérés", "aucun matériau amianté repéré", 4),
      erp: val("Zone de sismicité 2, aucun risque majeur", "commune classée en zone de sismicité 2", 6),
      dtg: vide,
      termites: vide,
      plomb: vide,
      electricite: vide,
    },
    incidents: [{ champ: "electricite", libelle: "Installation électrique", motif: "citation_introuvable" }],
    analyse_le: "2026-08-14T10:03:00.000Z",
  },
];
