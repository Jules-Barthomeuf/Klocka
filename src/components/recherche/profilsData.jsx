export const PROFILS = [
  {
    id: "0-250k",
    label: "0 – 250K",
    budgetMin: 0,
    budgetMax: 250000,
    color: "#6366F1",
    titre: "Petites et grandes surfaces — diversité géographique",
    sections: [
      {
        titre: "GÉOGRAPHIE & EMPLACEMENTS",
        items: [
          { label: "Grandes villes", desc: "> 100 000 hab.\nN°1, N°1 bis, N°2 accepté" },
          { label: "Villes moyennes", desc: "20 000 – 100 000 hab.\nN°1 ou N°1 bis uniquement" },
          { label: "Petites villes", desc: "< 20 000 hab.\nN°1 ou N°1 bis uniquement — exigence renforcée" },
          { label: "Emplacement N°2", desc: "Accepté seulement en grande ville avec bassin > 100 000 hab." },
        ],
      },
    ],
    typesCommerceExclus: [
      "Monde de la nuit",
      "Kebab",
      "Coiffeur (sauf enseigne)",
      "Bureaux",
      "Professions libérales (sauf cabinet)",
    ],
    rendements: [
      { label: "Grande ville", range: "5,5 – 7 %", pct: 60 },
      { label: "Ville moyenne", range: "7 – 8,5 %", pct: 75 },
      { label: "Petite ville", range: "8 – 10 %", pct: 90 },
    ],
    note: null,
  },
  {
    id: "250-500k",
    label: "250 – 500K",
    budgetMin: 250000,
    budgetMax: 500000,
    color: "#22C55E",
    titre: "Emplacements prime en villes petites et moyennes",
    sections: [
      {
        titre: "GÉOGRAPHIE & EMPLACEMENTS",
        items: [
          { label: "Grandes villes", desc: "> 100 000 hab.\nN°1, N°1 bis — rue commerçante établie" },
          { label: "Villes moyennes", desc: "20 000 – 100 000 hab.\nN°1 exclusivement — axe piétonnier ou principal" },
          { label: "Petites villes", desc: "< 20 000 hab.\nN°1 uniquement — artère centrale incontournable" },
          { label: "Locataire", desc: "Enseigne régionale ou nationale fortement appréciée" },
        ],
      },
    ],
    typesCommerceExclus: [
      "Monde de la nuit",
      "Kebab",
      "Coiffeur (sauf enseigne)",
      "Bureaux",
      "Professions libérales (sauf cabinet)",
    ],
    rendements: [
      { label: "Grande ville", range: "5 – 6,5 %", pct: 55 },
      { label: "Ville moyenne", range: "6,5 – 8 %", pct: 70 },
      { label: "Petite ville", range: "7,5 – 9 %", pct: 80 },
    ],
    note: null,
  },
  {
    id: "500k-1m",
    label: "500K – 1M",
    budgetMin: 500000,
    budgetMax: 1000000,
    color: "#e0c9a0",
    titre: "Commerce de centre-ville + entrepôt loué à enseigne",
    sections: [
      {
        titre: "SOUS-CATÉGORIE A — COMMERCE DE CENTRE-VILLE",
        items: [
          { label: "Géographie", desc: "Grandes et moyennes villes — hyper-centre, rue prime ou semi-prime" },
          { label: "Emplacement", desc: "N°1 ou N°1 bis. N°2 refusé à ce ticket." },
          { label: "Surface", desc: "Plateau commercial de 100 à 400 m² — liquidité à la revente préservée" },
          { label: "Locataire", desc: "Enseigne nationale / internationale préférée. Bail résiduel 4 ans minimum." },
        ],
        tags: ["Prêt-à-porter / chaussures", "Banque / assurance", "Santé / paramédical", "Restauration assise", "Culture / loisirs"],
      },
      {
        titre: "SOUS-CATÉGORIE B — ENTREPÔT / LOCAL D'ACTIVITÉ LOUÉ À ENSEIGNE",
        items: [
          { label: "Localisation", desc: "Zone d'activité établie, accès poids lourd, proximité immédiate d'axe routier structurant" },
          { label: "Locataire obligatoire", desc: "Enseigne nationale uniquement — pas d'artisan indépendant ni de TPE" },
          { label: "Bail", desc: "Bail commercial ferme 6 ans ou 9 ans résiduel 3+ ans. Charges locataire maximum." },
          { label: "À éviter", desc: "Zone d'activité isolée, bâtiment mono-usage, absence de visibilité depuis l'axe" },
        ],
        tags: ["GSB / bricolage", "Logistique dernier km", "Drive alimentaire", "Équipements de la maison", "Automobile / pneumatiques"],
      },
    ],
    typesCommerceExclus: [
      "Monde de la nuit",
      "Kebab",
      "Coiffeur (sauf enseigne)",
      "Bureaux",
      "Professions libérales (sauf cabinet)",
    ],
    rendements: [
      { label: "Commerce centre-ville", range: "5 – 6,5 %", pct: 55 },
      { label: "Entrepôt / activité", range: "6,5 – 8 %", pct: 70 },
    ],
    note: null,
  },
  {
    id: "1m-3m",
    label: "1M – 3M",
    budgetMin: 1000000,
    budgetMax: 3000000,
    color: "#A855F7",
    titre: "Patrimoniaux grandes villes + locaux d'activité axe structurant",
    sections: [
      {
        titre: "SOUS-CATÉGORIE A — ACTIF PATRIMONIAL DE CENTRE-VILLE",
        items: [
          { label: "Géographie", desc: "Grandes villes uniquement (> 100 000 hab.) — Paris, Lyon, Bordeaux, Toulouse, Nantes, Marseille, Lille…" },
          { label: "Emplacement", desc: "N°1 et N°1 bis exclusivement — rue piétonne prime, hyper-centre, axe de flux dense" },
          { label: "Locataire", desc: "Enseigne nationale ou internationale. Solide historique de paiement. Bail résiduel 4 ans minimum." },
          { label: "Actif", desc: "Immeuble de rapport ou murs seuls. Qualité architecturale appréciée pour la liquidité." },
        ],
        tags: ["Mode / luxe accessible", "Banque / assurance", "Restauration haut de gamme", "Hôtellerie (fonds uniquement)", "Professions libérales (plateau)"],
      },
      {
        titre: "SOUS-CATÉGORIE B — LOCAL D'ACTIVITÉ SUR AXE STRUCTURANT",
        items: [
          { label: "Localisation", desc: "Axe très passant en périphérie d'agglomération — RN, rocade, entrée de ville structurée" },
          { label: "Locataire", desc: "Enseigne nationale uniquement — bail long, clauses de charges favorables au bailleur" },
          { label: "Surface", desc: "500 à 3 000 m² — lot unique, pas de multilocataires à ce ticket" },
          { label: "Visibilité", desc: "Façade visible depuis l'axe, signalétique enseigne en place, trafic vérifié" },
        ],
        tags: ["Grande distribution spécialisée", "Automobile (concession, entretien)", "Santé / clinique privée", "Éducation / formation", "Logistique urbaine enseigne"],
      },
    ],
    typesCommerceExclus: [
      "Monde de la nuit",
      "Kebab",
      "Coiffeur (sauf enseigne)",
      "Bureaux",
      "Professions libérales (sauf cabinet)",
    ],
    rendements: [
      { label: "Patrimonial prime", range: "4 – 5,5 %", pct: 45 },
      { label: "Local d'activité axe", range: "6 – 7,5 %", pct: 65 },
    ],
    note: null,
  },
];