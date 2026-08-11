/**
 * Génère un prompt complet pour Genspark / Gamma / Canva AI
 * à partir des données du projet et du client.
 */
const fmt = (v) => {
  if (v === null || v === undefined || v === 0) return null;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(v));
};

const pct = (v) => {
  if (!v && v !== 0) return null;
  return `${Number(v).toFixed(2)}%`;
};

export default function generatePrompt(project, client) {
  const p = project;
  const clientName = client?.full_name || "";

  const prixNegocie = p.sim_prix_bien_negocie || 0;
  const surface = p.sim_surface || p.surface_m2 || 0;
  const loyerAnnuel = p.sim_loyer_initial_ht || p.loyer_annuel_ht || 0;
  const prixM2 = surface > 0 && prixNegocie > 0 ? Math.round(prixNegocie / surface) : 0;
  const loyerM2 = surface > 0 && loyerAnnuel > 0 ? Math.round(loyerAnnuel / surface) : 0;

  const tauxDroits = p.sim_droits_enregistrement || 8;
  const honoraires = p.sim_commission_agent_active ? (p.sim_commission_agent_type === "fixe" ? p.sim_commission_agent : prixNegocie * ((p.sim_commission_agent || 5) / 100)) : 0;
  const inclusFAI = p.sim_commission_agent_inclus_fai !== false;
  const prixHorsDroits = inclusFAI ? (prixNegocie - honoraires) : prixNegocie;
  const droitsEnreg = prixHorsDroits * (tauxDroits / 100);
  const feesType = p.sim_fees_klocka_type || "pourcentage";
  const fees = feesType === "fixe" ? (p.sim_fees_klocka || 0) : prixNegocie * ((p.sim_fees_klocka || 8) / 100);
  const incentive = ((p.sim_prix_bien_fai || prixNegocie) - prixNegocie) * ((p.sim_incentive_klocka || 20) / 100);
  const fraisDivers = (p.sim_frais_dossier_bancaire || 0) + (p.sim_cout_creation_societe || 0) + (p.sim_frais_courtage || 0);
  const prixRevient = prixNegocie > 0 ? prixNegocie + droitsEnreg + fees + incentive + fraisDivers + (inclusFAI ? 0 : honoraires) : (p.sim_prix_revient || p.prix_acquisition || 0);
  const rendement = prixRevient > 0 && loyerAnnuel > 0 ? (loyerAnnuel / prixRevient) * 100 : 0;
  const apport = p.sim_apport || 0;
  const dureeCredit = p.sim_duree_credit || 20;
  const tauxInteret = p.sim_taux_interet || 3.7;
  const indexation = p.sim_indexation_loyers || 2;

  const sections = [];

  sections.push(`Tu es un expert en investissement immobilier commercial. Génère une présentation PowerPoint professionnelle de type "Business Plan Bancaire" pour un projet d'investissement immobilier. Le fond des slides doit être noir (fond #2D2D2D), moderne, avec des accents en vert émeraude (#2A9D8F). Chaque slide doit être claire, aérée, avec des icônes et des chiffres mis en valeur.`);

  sections.push(`\n--- INFORMATIONS DU PROJET ---`);
  sections.push(`Titre du projet : ${p.titre}`);
  if (clientName) sections.push(`Client : ${clientName}`);
  if (p.adresse_complete) sections.push(`Adresse : ${p.adresse_complete}`);

  // Ville & Secteur
  sections.push(`\n--- VILLE & SECTEUR ---`);
  if (p.ville_secteur_champ1) sections.push(`Ville : ${p.ville_secteur_champ1}`);
  if (p.ville_secteur_champ2) sections.push(`Secteur : ${p.ville_secteur_champ2}`);
  if (p.description_ville) sections.push(`Description de la ville : ${p.description_ville}`);
  if (p.description_secteur) sections.push(`Description du secteur : ${p.description_secteur}`);
  if (p.secteur_entreprises_majeures?.length) sections.push(`Entreprises majeures : ${p.secteur_entreprises_majeures.join(", ")}`);
  if (p.secteur_services_proximite?.length) sections.push(`Services de proximité : ${p.secteur_services_proximite.join(", ")}`);
  if (p.secteur_transports?.length) {
    const tr = p.secteur_transports.map(t => `${t.type} ${t.ligne} à ${t.distance_metres}m`).join(", ");
    sections.push(`Transports : ${tr}`);
  }
  if (p.secteur_walk_score) sections.push(`Walk Score : ${p.secteur_walk_score}`);
  if (p.secteur_taux_vacance != null) sections.push(`Taux de vacance : ${p.secteur_taux_vacance}%`);
  if (p.secteur_bassin_emploi) sections.push(`Bassin d'emploi : ${new Intl.NumberFormat("fr-FR").format(p.secteur_bassin_emploi)} emplois`);

  // Le bien
  sections.push(`\n--- LE BIEN ---`);
  if (surface) sections.push(`Surface : ${surface} m²`);
  if (p.type_construction) sections.push(`Type de construction : ${p.type_construction}`);
  if (p.description_bien) sections.push(`Description du bien : ${p.description_bien}`);
  if (p.bien_champ1) sections.push(`Caractéristique 1 : ${p.bien_champ1}`);
  if (p.bien_champ2) sections.push(`Caractéristique 2 : ${p.bien_champ2}`);
  if (p.bien_champ3) sections.push(`Caractéristique 3 : ${p.bien_champ3}`);

  // Locataire & Bail
  sections.push(`\n--- LOCATAIRE & BAIL ---`);
  if (p.nom_locataire) sections.push(`Locataire : ${p.nom_locataire}`);
  if (p.activite_locataire) sections.push(`Activité : ${p.activite_locataire}`);
  if (p.bail_type) sections.push(`Type de bail : ${p.bail_type}`);
  if (p.bail_date_debut) sections.push(`Date de début du bail : ${p.bail_date_debut}`);
  if (p.bail_date_echeance || p.echeance_bail) sections.push(`Échéance du bail : ${p.bail_date_echeance || p.echeance_bail}`);
  if (p.statut_bail) sections.push(`Statut du bail : ${p.statut_bail}`);
  if (loyerAnnuel) sections.push(`Loyer annuel HT : ${fmt(loyerAnnuel)}`);
  if (loyerAnnuel) sections.push(`Loyer mensuel HT : ${fmt(Math.round(loyerAnnuel / 12))}`);

  // Marché immobilier
  sections.push(`\n--- MARCHÉ IMMOBILIER ---`);
  if (p.marche_quartier_nom) sections.push(`Quartier de référence : ${p.marche_quartier_nom}`);
  if (p.marche_prix_m2_median) sections.push(`Prix médian au m² : ${fmt(p.marche_prix_m2_median)}`);
  if (p.marche_prix_m2_bas && p.marche_prix_m2_haut) sections.push(`Fourchette prix m² : ${fmt(p.marche_prix_m2_bas)} - ${fmt(p.marche_prix_m2_haut)}`);
  if (p.marche_offre_moyenne) sections.push(`Valeur locative moyenne : ${fmt(p.marche_offre_moyenne)} /m²/an`);
  if (p.marche_baux_moyenne) sections.push(`Baux constatés moyenne : ${fmt(p.marche_baux_moyenne)} /m²/an`);
  if (p.marche_evolution_1an) sections.push(`Évolution 1 an : ${p.marche_evolution_1an}%`);
  if (p.marche_evolution_5ans) sections.push(`Évolution 5 ans : ${p.marche_evolution_5ans}%`);

  // Acquisition vs marché
  sections.push(`\n--- ACQUISITION VS MARCHÉ ---`);
  if (prixNegocie) sections.push(`Prix négocié : ${fmt(prixNegocie)}`);
  if (prixM2) sections.push(`Prix au m² (acquisition) : ${fmt(prixM2)}`);
  if (loyerM2) sections.push(`Loyer au m² (acquisition) : ${fmt(loyerM2)}/an`);
  if (p.marche_prix_m2_median && prixM2) {
    const diff = Math.round(((prixM2 - p.marche_prix_m2_median) / p.marche_prix_m2_median) * 100);
    sections.push(`Décote prix vs marché : ${diff}%`);
  }

  // Données financières
  sections.push(`\n--- DONNÉES FINANCIÈRES ---`);
  if (prixRevient) sections.push(`Prix de revient total : ${fmt(prixRevient)}`);
  if (rendement) sections.push(`Rendement brut : ${pct(rendement)}`);
  if (apport) sections.push(`Apport personnel : ${fmt(apport)}`);
  if (prixRevient && apport) sections.push(`Montant emprunté : ${fmt(prixRevient - apport)}`);
  sections.push(`Durée du crédit : ${dureeCredit} ans`);
  sections.push(`Taux d'intérêt : ${pct(tauxInteret)}`);
  sections.push(`Indexation loyers : +${indexation}% / an`);
  if (p.sim_taux_assurance) sections.push(`Assurance emprunteur : ${pct(p.sim_taux_assurance)}`);

  // Diagnostics
  if (p.dpe_note || p.ges_note) {
    sections.push(`\n--- DIAGNOSTICS ÉNERGÉTIQUES ---`);
    if (p.dpe_note) sections.push(`DPE : ${p.dpe_note}${p.dpe_consommation ? ` (${p.dpe_consommation} kWh/m²/an)` : ""}`);
    if (p.ges_note) sections.push(`GES : ${p.ges_note}${p.ges_emission ? ` (${p.ges_emission} kg CO₂/m²/an)` : ""}`);
  }

  sections.push(`\n--- STRUCTURE DES SLIDES ---`);
  sections.push(`La présentation doit contenir les slides suivantes dans cet ordre :
1. Page de couverture : "Business Plan — Investissement Immobilier" avec l'adresse du bien
2. Sommaire
3. La ville : description et atouts du secteur
4. Transition : "Un emplacement stratégique" avec l'adresse
5. Zoom sur le quartier : Population & Ambiance, Localisation, Accessibilité (3 colonnes)
6. Enseignes & commerces de premier rang
7. Marché immobilier : Valeur des murs (€/m²) et Valeur locative (€/m²/an)
8. Présentation du local : adresse, surface, locataire, loyer
9. Photos du local (placeholder)
10. Bail commercial : type, dates, loyer, charges
11. Prix d'acquisition vs Marché : comparaison côte à côte avec pourcentages de décote
12. Paramètres du business plan : loyer initial, charges, travaux, indexation
13. Conditions de financement souhaitées : durée, taux fixe, montant emprunté
14. Structuration de l'opération : personne physique → société civile
15. Diagnostics énergétiques (DPE + GES) si disponibles
16. Slide de contact / remerciement`);

  sections.push(`\nIMPORTANT : Copie exactement le design de cette présentation ppt https://drive.google.com/file/d/1Kr-2sF8quDQxwlcduaxWMOTEsE9ONoz4/view?usp=sharing. Copie le même type de design et utilise les images en pièce-jointe également. Le design doit être professionnel, sobre, style dark theme avec fond sombre. Utilise des cartes avec bordures subtiles, des icônes, et mets les chiffres clés en grand et en couleur.`);

  return sections.join("\n");
}