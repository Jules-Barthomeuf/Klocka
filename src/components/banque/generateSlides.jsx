// Génère les slides à partir des données d'un projet et du client
export default function generateSlides(project, client, extras = {}) {
  const fmt = (v) => {
    if (v === null || v === undefined || v === 0) return null;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(v));
  };

  const pct = (v) => {
    if (!v && v !== 0) return null;
    return `${Number(v).toFixed(2)}%`;
  };

  // Calculs financiers
  const prixBienNegocie = project.sim_prix_bien_negocie || 0;
  const prixBienFAI = project.sim_prix_bien_fai || prixBienNegocie;
  const tauxDroits = project.sim_droits_enregistrement || 8;
  const tauxFees = project.sim_fees_klocka || 8;
  const feesType = project.sim_fees_klocka_type || "pourcentage";
  const tauxIncentive = project.sim_incentive_klocka || 20;
  const commActive = project.sim_commission_agent_active || false;
  const commType = project.sim_commission_agent_type || "pourcentage";
  const tauxComm = project.sim_commission_agent || 5;
  const inclusFAI = project.sim_commission_agent_inclus_fai !== false;

  const honoraires = commActive ? (commType === "fixe" ? tauxComm : prixBienNegocie * (tauxComm / 100)) : 0;
  const prixHorsDroits = inclusFAI ? (prixBienNegocie - honoraires) : prixBienNegocie;
  const droitsEnreg = prixHorsDroits * (tauxDroits / 100);
  const fees = feesType === "fixe" ? tauxFees : prixBienNegocie * (tauxFees / 100);
  const incentive = (prixBienFAI - prixBienNegocie) * (tauxIncentive / 100);
  const totalFrais = fees + incentive;
  const fraisDivers = (project.sim_frais_dossier_bancaire || 0) + (project.sim_cout_creation_societe || 0) + (project.sim_frais_courtage || 0);

  const prixRevient = prixBienNegocie > 0
    ? prixBienNegocie + droitsEnreg + totalFrais + fraisDivers + (inclusFAI ? 0 : honoraires)
    : (project.sim_prix_revient || project.prix_acquisition || 0);

  const loyerAnnuel = project.sim_loyer_initial_ht || project.loyer_annuel_ht || 0;
  const rendement = prixRevient > 0 && loyerAnnuel > 0 ? (loyerAnnuel / prixRevient) * 100 : 0;
  const apport = project.sim_apport || 0;
  const dureeCredit = project.sim_duree_credit || 20;
  const tauxInteret = project.sim_taux_interet || 3.7;
  const surface = project.sim_surface || project.surface_m2 || 0;
  const indexation = project.sim_indexation_loyers || 2;
  const anneeRevente = project.sim_annee_revente || 20;

  // Projection sur N ans
  let totalLoyersCumules = 0;
  let loyerCourant = loyerAnnuel;
  for (let i = 1; i <= anneeRevente; i++) {
    if (i > 1) loyerCourant *= (1 + indexation / 100);
    totalLoyersCumules += loyerCourant;
  }

  // Prix/m² et loyer/m²
  const prixM2 = surface > 0 && prixBienNegocie > 0 ? Math.round(prixBienNegocie / surface) : 0;
  const loyerM2 = surface > 0 && loyerAnnuel > 0 ? Math.round(loyerAnnuel / surface) : 0;

  const clientName = client?.full_name || "";
  const clientEmail = client?.email || "";

  const slides = [];

  // --- Page 1 : Projet de Financement (couverture) ---
  slides.push({
    type: "cover",
    title: "Projet de Financement",
    content: {
      subtitle: project.adresse_complete || project.titre,
      project_title: project.titre,
      photo: project.photos?.[0] || null,
      client_name: clientName,
    }
  });

  // --- Page 2 : Sommaire ---
  slides.push({
    type: "sommaire",
    title: "Sommaire",
    content: {
      sections: [
        { num: "01", label: "La ville" },
        { num: "02", label: "Le quartier" },
        { num: "03", label: "Le marché immobilier" },
        { num: "04", label: "Le local" },
        { num: "05", label: "Le bail commercial" },
        { num: "06", label: "Acquisition vs Marché" },
        { num: "07", label: "Projection financière" },
        { num: "08", label: "Conditions souhaitées" },
        { num: "09", label: "Porteur du projet" },
      ]
    }
  });

  // --- Page 3 : La ville ---
  slides.push({
    type: "ville",
    title: project.ville_secteur_champ1 || "La ville",
    content: {
      badges: [project.ville_secteur_champ1, project.ville_secteur_champ2, project.ville_secteur_champ3].filter(Boolean),
      description: project.description_ville,
      photo: project.photos?.[0] || null,
    }
  });

  // --- Page 4 : Transition emplacement ---
  slides.push({
    type: "transition",
    title: "Un emplacement stratégique",
    content: {
      subtitle: project.adresse_complete,
      description: project.description_secteur ? project.description_secteur.substring(0, 120) + "..." : "Au c\u0153ur d'un secteur dynamique et recherch\u00e9.",
      photo: extras.emplacement_image || project.photos?.[1] || project.photos?.[0] || null,
    }
  });

  // --- Page 5 : Zoom sur le quartier ---
  slides.push({
    type: "quartier",
    title: "Zoom sur le quartier",
    content: {
      description: project.description_secteur,
      transports: project.secteur_transports || [],
      walk_score: project.secteur_walk_score,
      entreprises: project.secteur_entreprises_majeures || [],
      services: project.secteur_services_proximite || [],
      map_image: extras.quartier_map_image || null,
    }
  });

  // --- Page 6 : Tension locative ---
  slides.push({
    type: "tension_locative",
    title: "Une forte tension locative",
    content: {
      taux_vacance: project.secteur_taux_vacance,
      nb_restaurants: project.secteur_nb_restaurants,
      bassin_emploi: project.secteur_bassin_emploi,
      pct_commerces: project.secteur_pct_commerces,
      pct_bureaux: project.secteur_pct_bureaux,
      projets_urbains: project.secteur_projets_urbains,
      description: project.description_secteur,
      logos: extras.tension_logos || [],
    }
  });

  // --- Page 7 : Marché immobilier ---
  slides.push({
    type: "marche",
    title: "Le marché immobilier",
    content: {
      prix_m2_median: project.marche_prix_m2_median,
      prix_m2_bas: project.marche_prix_m2_bas,
      prix_m2_haut: project.marche_prix_m2_haut,
      evolution_1an: project.marche_evolution_1an,
      evolution_5ans: project.marche_evolution_5ans,
      offre_bas: project.marche_offre_bas,
      offre_moyenne: project.marche_offre_moyenne,
      offre_haut: project.marche_offre_haut,
      baux_bas: project.marche_baux_bas,
      baux_moyenne: project.marche_baux_moyenne,
      baux_haut: project.marche_baux_haut,
      quartier: project.marche_quartier_nom,
    }
  });

  // --- Page 8 : Présentation du local ---
  slides.push({
    type: "local",
    title: "Présentation du local",
    content: {
      adresse: project.adresse_complete,
      surface: surface > 0 ? `${surface} m²` : null,
      badges: [project.bien_champ1, project.bien_champ2, project.bien_champ3].filter(Boolean),
      description: project.description_bien,
      locataire: project.nom_locataire,
      loyer_mensuel: loyerAnnuel > 0 ? fmt(Math.round(loyerAnnuel / 12)) + " /mois" : null,
      type_construction: project.type_construction,
      photo: project.photos?.[1] || project.photos?.[0] || null,
    }
  });

  // --- Page 9 : Photos du local ---
  slides.push({
    type: "local_photos",
    title: "Le local en images",
    content: {
      photos: (project.photos || []).slice(0, 4),
      adresse: project.adresse_complete,
    }
  });

  // --- Page 10 : Bail commercial ---
  slides.push({
    type: "bail",
    title: "Zoom sur le bail commercial",
    content: {
      locataire: project.nom_locataire,
      activite: project.activite_locataire,
      loyer_annuel: fmt(loyerAnnuel),
      loyer_mensuel: loyerAnnuel > 0 ? fmt(Math.round(loyerAnnuel / 12)) : null,
      surface: surface > 0 ? `${surface} m²` : null,
      bail_type: project.bail_type,
      echeance: project.echeance_bail || project.bail_date_echeance,
      date_debut: project.bail_date_debut,
      statut_bail: project.statut_bail,
      indexation: indexation + "%",
      analyse: project.analyse_bail,
    }
  });

  // --- Page 11 : Prix d'acquisition vs Marché ---
  slides.push({
    type: "acquisition_vs_marche",
    title: "Acquisition vs Marché",
    content: {
      prix_m2_achat: prixM2,
      loyer_m2_achat: loyerM2,
      prix_m2_marche_median: project.marche_prix_m2_median,
      offre_moyenne_marche: project.marche_offre_moyenne,
      baux_moyenne_marche: project.marche_baux_moyenne,
      rendement: rendement,
      prix_negocie: fmt(prixBienNegocie),
      surface: surface > 0 ? `${surface} m²` : null,
    }
  });

  // --- Page 12 : Projection financière ---
  slides.push({
    type: "projection",
    title: "Projection financière",
    content: {
      duree: anneeRevente,
      indexation: indexation,
      loyer_initial: fmt(loyerAnnuel),
      revenus_cumules: fmt(totalLoyersCumules),
      prix_revient: fmt(prixRevient),
      rendement: pct(rendement),
      apport: fmt(apport),
    }
  });

  // --- Page 13 : Conditions souhaitées ---
  slides.push({
    type: "conditions",
    title: "Conditions souhaitées",
    content: {
      items: [
        { label: "Prix de revient total", value: fmt(prixRevient) },
        { label: "Apport personnel", value: fmt(apport) },
        { label: "Montant emprunté", value: fmt(prixRevient - apport) },
        { label: "Durée souhaitée", value: `${dureeCredit} ans` },
        { label: "Taux fixe souhaité", value: pct(tauxInteret) },
        { label: "Assurance emprunteur", value: pct(project.sim_taux_assurance || 0.25) },
      ].filter(i => i.value),
      apport_pct: prixRevient > 0 ? Math.round((apport / prixRevient) * 100) : 0,
    }
  });

  // --- Page 14 : CV porteur du projet ---
  slides.push({
    type: "cv",
    title: "CV — Porteur du projet",
    content: {
      nom: clientName,
      email: clientEmail,
    }
  });

  // --- Page 15 : Diagnostics énergétiques ---
  if (project.dpe_note || project.ges_note) {
    slides.push({
      type: "diagnostics",
      title: "Diagnostics énergétiques",
      content: {
        dpe_note: project.dpe_note,
        dpe_consommation: project.dpe_consommation,
        ges_note: project.ges_note,
        ges_emission: project.ges_emission,
      }
    });
  }

  // --- Page 16 : Contact ---
  slides.push({
    type: "contact",
    title: "Contact",
    content: {
      client_name: clientName,
      client_email: clientEmail,
      message: "Merci pour votre attention.",
    }
  });

  return slides;
}