// Ressources « Aller plus loin ? » proposées au bas de chaque onglet.
//
// Chaque entrée pointe vers une source publique ou officielle. `points` reçoit
// le projet : les puces affichées dans la fiche sont donc contextualisées
// (échéance du bail réelle, classe DPE du lot, charges saisies…).
// `url` accepte soit une chaîne, soit une fonction du projet — utile pour les
// outils qui acceptent une recherche par adresse ou par entreprise.

const enc = encodeURIComponent;
const fmt = (v) => (v || v === 0 ? Number(v).toLocaleString("fr-FR") : null);

export const RESSOURCES = {
  secteur: [
    {
      titre: "Dossier complet de la commune",
      source: "INSEE",
      duree: "15 min",
      url: "https://www.insee.fr/fr/statistiques/zones/2011101",
      resume:
        "Le dossier statistique de référence d'une commune : population et son évolution, logement, emploi, revenus, établissements par secteur d'activité. C'est la source derrière la plupart des chiffres cités dans les analyses de marché.",
      points: (p) => [
        "Regarder d'abord la variation annuelle de population : une commune qui perd des habitants perd sa chalandise, quel que soit l'emplacement.",
        "La part des ménages d'une personne et la structure par âge expliquent le type de commerce qui tient dans la durée.",
        p.adresse_complete && `Chercher la commune de « ${p.adresse_complete} » et comparer les données au département.`,
      ],
    },
    {
      titre: "Consulter le plan local d'urbanisme",
      source: "Géoportail de l'urbanisme",
      duree: "10 min",
      url: "https://www.geoportail-urbanisme.gouv.fr/",
      resume:
        "Le PLU donne le zonage de la parcelle, les servitudes et les règles applicables aux commerces : destinations autorisées, protection des linéaires commerciaux, obligations de stationnement.",
      points: (p) => [
        "Certaines communes protègent des linéaires commerciaux : un local en linéaire protégé ne peut pas être transformé en logement ou en bureau.",
        "Le zonage conditionne un éventuel changement de destination — c'est ce qui détermine la valeur de reconversion du lot.",
        p.adresse_complete && `Localiser la parcelle de « ${p.adresse_complete} » et lire le règlement de la zone.`,
      ],
    },
    {
      titre: "État des risques à l'adresse",
      source: "Géorisques (ministère de la Transition écologique)",
      duree: "5 min",
      url: (p) => (p.adresse_complete ? `https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi?adresse=${enc(p.adresse_complete)}` : "https://www.georisques.gouv.fr/"),
      resume:
        "Inondation, retrait-gonflement des argiles, sismicité, sites pollués, radon : le service officiel qui alimente l'état des risques annexé à l'acte de vente.",
      points: (p) => [
        "Un aléa argiles moyen ou fort explique une bonne partie des sinistres de fissuration — et pèse sur le coût d'assurance de l'immeuble.",
        "Un site pollué à proximité peut bloquer certaines destinations, en particulier l'alimentaire.",
        "Le document est obligatoire à la vente : vérifier qu'il figure bien dans les pièces du dossier.",
      ],
    },
  ],

  marche: [
    {
      titre: "Prix des ventes réellement enregistrées",
      source: "DVF — Etalab / DGFiP",
      duree: "10 min",
      url: "https://app.dvf.etalab.gouv.fr/",
      resume:
        "La base des demandes de valeurs foncières recense les mutations enregistrées chez le notaire, adresse par adresse. C'est le seul comparable public fondé sur des prix effectivement payés, et non sur des annonces.",
      points: (p) => [
        "Comparer le prix au m² du projet aux ventes des trois dernières années dans le même îlot, pas seulement dans la commune.",
        "Les locaux commerciaux y sont moins nombreux que les logements : élargir la période plutôt que le périmètre.",
        p.sim_prix_bien_negocie > 0 && p.surface_m2 > 0 &&
          `Ici, le prix négocié ressort à environ ${fmt(Math.round(p.sim_prix_bien_negocie / p.surface_m2))} €/m² : c'est ce chiffre qu'il faut confronter aux mutations voisines.`,
      ],
    },
    {
      titre: "Indice des loyers commerciaux (ILC)",
      source: "INSEE",
      duree: "5 min",
      url: "https://www.insee.fr/fr/statistiques/serie/001532540",
      resume:
        "L'ILC sert à indexer la plupart des baux commerciaux. Sa série trimestrielle permet de vérifier une révision passée et d'estimer la progression future du loyer.",
      points: (p) => [
        "Une indexation ILC protège partiellement de l'inflation, mais reste plus modérée que l'ancien ICC.",
        "Vérifier que l'indice de base inscrit au bail correspond bien au trimestre de la prise d'effet : c'est une erreur fréquente.",
        (p.sim_indexation_loyers || p.sim_indexation_loyers === 0) &&
          `La projection financière de ce dossier retient ${String(p.sim_indexation_loyers).replace(".", ",")} % d'indexation annuelle — à comparer à la moyenne réelle de l'ILC sur dix ans.`,
      ],
    },
    {
      titre: "Fixer et réviser le loyer d'un bail commercial",
      source: "entreprendre.service-public.gouv.fr",
      duree: "20 min",
      url: "https://entreprendre.service-public.gouv.fr/vosdroits/F31925",
      resume:
        "Les articles L. 145-33 et suivants fixent les critères de la valeur locative : caractéristiques du local, destination, obligations des parties, facteurs locaux de commercialité et prix couramment pratiqués dans le voisinage.",
      points: () => [
        "La valeur locative n'est pas le loyer de marché : elle intègre les charges transférées au preneur et les travaux qu'il a financés.",
        "Les « facteurs locaux de commercialité » sont l'argument central en cas de déplafonnement : évolution des flux, du stationnement, de l'attractivité de la rue.",
        "Un écart durable entre loyer en place et valeur locative constitue la réserve de réversion de l'actif.",
      ],
    },
  ],

  bien: [
    {
      titre: "Accessibilité des établissements recevant du public",
      source: "entreprendre.service-public.gouv.fr",
      duree: "15 min",
      url: "https://entreprendre.service-public.gouv.fr/vosdroits/F32873",
      resume:
        "Obligations d'accessibilité applicables aux commerces, cas de dérogation (impossibilité technique, contraintes liées à la conservation du patrimoine, disproportion économique) et procédure d'autorisation de travaux.",
      points: (p) => [
        "Une dérogation accordée est un document à récupérer : sans elle, la mise en conformité peut retomber sur le bailleur.",
        "La rampe amovible est admise dans certains cas, mais suppose une sonnette d'appel et une signalétique conformes.",
        p.surface_m2 > 0 && `Pour ${p.surface_m2} m², l'établissement relève très probablement de la 5ᵉ catégorie : les obligations portent surtout sur l'entrée et le cheminement.`,
      ],
    },
    {
      titre: "Plan cadastral et surfaces",
      source: "cadastre.data.gouv.fr",
      duree: "5 min",
      url: "https://cadastre.data.gouv.fr/",
      resume:
        "Consultation libre du plan cadastral : emprise de la parcelle, bâti, numéros de section. Utile pour recouper la surface annoncée et comprendre la configuration du lot dans l'immeuble.",
      points: (p) => [
        "Recouper l'emprise cadastrale avec la surface Carrez ou la surface utile annoncée : un écart important mérite une explication.",
        "La configuration de la parcelle explique souvent la largeur de vitrine, principal facteur de valeur d'un local commercial.",
        p.surface_m2 > 0 && `Surface retenue au dossier : ${p.surface_m2} m².`,
      ],
    },
  ],

  locataire: [
    {
      titre: "Fiche officielle de l'entreprise locataire",
      source: "Annuaire des entreprises — data.gouv.fr",
      duree: "5 min",
      url: (p) => (p.nom_locataire ? `https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${enc(p.nom_locataire)}` : "https://annuaire-entreprises.data.gouv.fr/"),
      resume:
        "Identité légale, dirigeants, effectif, date de création, établissements et procédures collectives éventuelles. La source publique de référence pour vérifier qui signe réellement le bail.",
      points: (p) => [
        p.nom_locataire ? `Vérifier que « ${p.nom_locataire} » est bien la personne morale signataire du bail, et non l'enseigne commerciale.` : "Vérifier que le signataire du bail est bien la personne morale, et non l'enseigne.",
        "L'ancienneté de l'établissement à l'adresse est un meilleur indicateur de stabilité que l'ancienneté de la société.",
        "Une procédure collective en cours apparaît ici avant d'apparaître dans les comptes.",
      ],
    },
    {
      titre: "Comptes annuels déposés au greffe",
      source: "Annuaire des entreprises",
      duree: "20 min",
      url: (p) => (p.nom_locataire ? `https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${enc(p.nom_locataire)}` : "https://annuaire-entreprises.data.gouv.fr/"),
      resume:
        "Bilans et comptes de résultat déposés, quand ils ne sont pas sous option de confidentialité. Permet de calculer le taux d'effort locatif et de juger la capacité du preneur à absorber une hausse de loyer.",
      points: (p) => {
        const loyer = p.sim_loyer_initial_ht || p.loyer_annuel_ht;
        return [
          "Le ratio loyer / chiffre d'affaires est le meilleur indicateur de soutenabilité : au-delà de 10 % en commerce de détail, la marge de manœuvre disparaît.",
          "Des capitaux propres négatifs sur deux exercices consécutifs sont un signal d'alerte, même avec un chiffre d'affaires en hausse.",
          loyer > 0 && `Loyer annuel du bail : ${fmt(loyer)} € HT/HC — à rapporter au chiffre d'affaires du dernier exercice déposé.`,
        ];
      },
    },
    {
      titre: "Annonces légales et procédures collectives",
      source: "BODACC",
      duree: "5 min",
      url: (p) => (p.nom_locataire ? `https://www.bodacc.fr/pages/annonces-commerciales/?q=${enc(p.nom_locataire)}` : "https://www.bodacc.fr/"),
      resume:
        "Bulletin officiel des annonces civiles et commerciales : ventes de fonds, changements de dirigeant, sauvegardes, redressements et liquidations. Publication obligatoire, donc exhaustive.",
      points: () => [
        "Une vente de fonds de commerce annoncée signifie un changement de preneur à venir : vérifier la clause de cession du bail.",
        "Un privilège du Trésor ou de la Sécurité sociale inscrit précède souvent des difficultés de trésorerie.",
        "Absence d'inscription défavorable ne vaut pas solvabilité : croiser avec les comptes déposés.",
      ],
    },
  ],

  bail: [
    {
      titre: "Le bail commercial de A à Z",
      source: "entreprendre.service-public.gouv.fr",
      duree: "25 min",
      url: "https://entreprendre.service-public.gouv.fr/vosdroits/F23927",
      resume:
        "Durée, congé, renouvellement, indemnité d'éviction, révision et déplafonnement : la synthèse officielle du régime des baux commerciaux, à jour des réformes.",
      points: (p) => [
        "La faculté de résiliation triennale du preneur est la principale incertitude d'un bail 3/6/9 : une clause de renonciation valable change la nature de l'actif.",
        "Le refus de renouvellement ouvre droit à indemnité d'éviction, souvent supérieure à deux années de loyer : c'est un coût de sortie à intégrer.",
        p.echeance_bail && `Échéance renseignée au dossier : ${new Date(p.echeance_bail).toLocaleDateString("fr-FR")} — vérifier la date d'envoi du congé ou de la demande de renouvellement.`,
      ],
    },
    {
      titre: "Répartition des charges — inventaire loi Pinel",
      source: "entreprendre.service-public.gouv.fr",
      duree: "15 min",
      url: "https://entreprendre.service-public.gouv.fr/vosdroits/F31925",
      resume:
        "Depuis 2014, le bail doit comporter un inventaire précis des charges, impôts et travaux, avec répartition entre bailleur et preneur. Certaines dépenses ne peuvent plus être refacturées au locataire.",
      points: (p) => [
        "Les grosses réparations de l'article 606 du Code civil restent à la charge du bailleur : une clause contraire est réputée non écrite.",
        "Les honoraires de gestion des loyers ne sont pas refacturables au preneur.",
        p.sim_taxe_fonciere > 0 && `Taxe foncière au dossier : ${fmt(p.sim_taxe_fonciere)} € — vérifier que sa refacturation est bien prévue à l'inventaire.`,
      ],
    },
  ],

  copropriete: [
    {
      titre: "Règles de vote en assemblée générale de copropriété",
      source: "service-public.gouv.fr",
      duree: "30 min",
      url: "https://www.service-public.gouv.fr/particuliers/vosdroits/F2137",
      resume:
        "Le texte fondateur : parties communes, tantièmes, majorités d'assemblée, travaux, fonds de travaux obligatoire et recouvrement des charges impayées.",
      points: (p) => [
        "Les appels de fonds votés avant la vente restent en principe dus par le vendeur : la répartition se règle dans l'acte, pas après.",
        "Le fonds de travaux (loi ALUR) reste acquis à la copropriété : il n'est pas remboursé au vendeur.",
        p.quote_part_lot > 0 && `Quote-part du lot : ${p.quote_part_lot} ‰ — c'est elle qui détermine la part de tout appel de fonds futur.`,
      ],
    },
    {
      titre: "Charges et impayés : ce que dit le règlement",
      source: "ANIL — Agence nationale pour l'information sur le logement",
      duree: "15 min",
      url: "https://www.anil.org/",
      resume:
        "Fiches pratiques sur la copropriété : lecture du règlement, destination de l'immeuble, contestation d'une décision d'assemblée, gestion des impayés et rôle du syndic.",
      points: (p) => [
        "La destination de l'immeuble inscrite au règlement prime sur le bail : une activité autorisée au bail mais interdite au règlement est inexploitable.",
        "Un taux d'impayés élevé dans l'immeuble se répercute sur les copropriétaires à jour, via des appels complémentaires.",
        p.charges_copropriete > 0 && `Charges annuelles au dossier : ${fmt(p.charges_copropriete)} € — comparer aux trois derniers exercices approuvés.`,
      ],
    },
  ],

  diagnostique: [
    {
      titre: "Comprendre le DPE et le calendrier d'interdiction",
      source: "Ministère de la Transition écologique",
      duree: "15 min",
      url: "https://www.ecologie.gouv.fr/diagnostic-performance-energetique-dpe",
      resume:
        "Méthode de calcul, durée de validité, portée juridique du DPE et calendrier d'interdiction de location des passoires énergétiques.",
      points: (p) => [
        "Le calendrier d'interdiction vise le logement : pour un local commercial, l'enjeu est surtout la valeur verte et le décret tertiaire au-delà de 1 000 m².",
        "Un DPE réalisé avant la réforme de 2021 n'a plus la même méthode de calcul : vérifier sa date.",
        p.dpe_note ? `Classe renseignée pour ce lot : ${p.dpe_note}${p.dpe_consommation > 0 ? ` (${p.dpe_consommation} kWh/m²/an)` : ""}.` : null,
      ],
    },
    {
      titre: "Diagnostics obligatoires à la vente",
      source: "service-public.gouv.fr",
      duree: "5 min",
      url: "https://www.service-public.gouv.fr/particuliers/vosdroits/F16096",
      resume:
        "Base publique de tous les DPE réalisés en France : recherche par adresse, consultation du détail du calcul et vérification de la certification du diagnostiqueur.",
      points: (p) => [
        "Un DPE non retrouvé dans la base est un signal : tout diagnostic valide y est déposé.",
        "Comparer le DPE du lot à ceux des autres lots de l'immeuble donne une idée fiable de la qualité du bâti.",
        p.adresse_complete && `Rechercher « ${p.adresse_complete} » pour retrouver les diagnostics de l'immeuble.`,
      ],
    },
  ],

  documents_projet: [
    {
      titre: "Les pièces obligatoires d'une vente de local commercial",
      source: "entreprendre.service-public.gouv.fr",
      duree: "10 min",
      url: "https://entreprendre.service-public.gouv.fr/vosdroits/F23927",
      resume:
        "Liste des documents que le vendeur doit remettre : dossier de diagnostic technique, état des risques, documents de copropriété, bail et ses avenants, quittances et derniers procès-verbaux d'assemblée.",
      points: (p) => [
        "L'absence d'un diagnostic obligatoire engage la responsabilité du vendeur après la vente : c'est un levier de négociation.",
        "Le bail et l'ensemble de ses avenants doivent être fournis : un avenant manquant peut modifier le loyer ou la destination.",
        p.fichiers_projet && p.fichiers_projet.length > 0
          ? `${p.fichiers_projet.length} document${p.fichiers_projet.length > 1 ? "s" : ""} déjà disponible${p.fichiers_projet.length > 1 ? "s" : ""} dans ce dossier.`
          : "Aucun document n'est encore déposé dans ce dossier.",
      ],
    },
  ],
};

/** Résout `url` et `points`, qui peuvent dépendre du projet. */
export function resoudreRessource(ressource, project) {
  return {
    ...ressource,
    url: typeof ressource.url === "function" ? ressource.url(project) : ressource.url,
    points: (typeof ressource.points === "function" ? ressource.points(project) : ressource.points || []).filter(Boolean),
  };
}
