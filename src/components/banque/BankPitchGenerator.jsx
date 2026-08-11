import React, { useState } from "react";
import { Copy, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const fmt = (v) => {
  if (!v) return null;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(v));
};
const fmtNum = (v) => v ? new Intl.NumberFormat("fr-FR").format(v) : null;
const pct = (v) => (v != null && v !== 0) ? `${Number(v).toFixed(2)}%` : null;
const dateStr = (d) => { try { return d ? new Date(d).toLocaleDateString("fr-FR") : null; } catch { return d; } };

function generateSlideTexts(project, client) {
  const p = project || {};
  const clientName = client?.full_name || "";

  const prixNegocie = p.sim_prix_bien_negocie || 0;
  const surface = p.sim_surface || p.surface_m2 || 0;
  const loyerAnnuel = p.sim_loyer_initial_ht || p.loyer_annuel_ht || 0;
  const apport = p.sim_apport || 0;
  const dureeCredit = p.sim_duree_credit || 20;
  const tauxInteret = p.sim_taux_interet || 3.7;
  const indexation = p.sim_indexation_loyers || 2;
  const tauxDroits = p.sim_droits_enregistrement || 8;
  const honoraires = p.sim_commission_agent_active ? (p.sim_commission_agent_type === "fixe" ? p.sim_commission_agent : prixNegocie * ((p.sim_commission_agent || 5) / 100)) : 0;
  const inclusFAI = p.sim_commission_agent_inclus_fai !== false;
  const prixHorsDroits = inclusFAI ? (prixNegocie - honoraires) : prixNegocie;
  const droitsEnreg = prixHorsDroits * (tauxDroits / 100);
  const feesType = p.sim_fees_klocka_type || "pourcentage";
  const fees = feesType === "fixe" ? (p.sim_fees_klocka || 0) : prixNegocie * ((p.sim_fees_klocka || 8) / 100);
  const incentive = ((p.sim_prix_bien_fai || prixNegocie) - prixNegocie) * ((p.sim_incentive_klocka || 20) / 100);
  const fraisDivers = (p.sim_frais_dossier_bancaire || 0) + (p.sim_cout_creation_societe || 0) + (p.sim_frais_courtage || 0);
  const prixRevient = prixNegocie > 0
    ? prixNegocie + droitsEnreg + fees + incentive + fraisDivers + (inclusFAI ? 0 : honoraires)
    : (p.sim_prix_revient || p.prix_acquisition || 0);
  const rendement = prixRevient > 0 && loyerAnnuel > 0 ? (loyerAnnuel / prixRevient) * 100 : 0;
  const prixM2 = surface > 0 && prixNegocie > 0 ? Math.round(prixNegocie / surface) : 0;
  const loyerM2 = surface > 0 && loyerAnnuel > 0 ? Math.round(loyerAnnuel / surface) : 0;
  const montantEmprunte = prixRevient - apport;

  const slides = [];

  // --- Slide 1 : Sommaire ---
  slides.push({
    num: "01",
    title: "Sommaire",
    text: `Sommaire de la présentation :

1. La ville${p.ville_secteur_champ1 ? ` de ${p.ville_secteur_champ1}` : ""}
2. Le quartier${p.ville_secteur_champ2 ? ` — ${p.ville_secteur_champ2}` : ""}
3. Un emplacement stratégique${p.adresse_complete ? ` — ${p.adresse_complete}` : ""}
4. Zoom sur le quartier
5. Présentation du local${surface > 0 ? ` (${surface} m²)` : ""}
6. Analyse du bail en cours${p.nom_locataire ? ` — ${p.nom_locataire}` : ""}
7. Projection financière${rendement > 0 ? ` — Rendement ${pct(rendement)}` : ""}
8. Conditions souhaitées${dureeCredit ? ` — ${dureeCredit} ans` : ""}
9. CV des porteurs du projet & structuration${clientName ? ` — ${clientName}` : ""}`,
  });

  // --- Slide 2 : La Ville ---
  const villeLines = [];
  if (p.ville_secteur_champ1) villeLines.push(`📍 ${p.ville_secteur_champ1}${p.ville_secteur_champ2 ? ` — ${p.ville_secteur_champ2}` : ""}`);
  if (p.description_ville) villeLines.push(`\n${p.description_ville}`);
  if (p.secteur_bassin_emploi) villeLines.push(`\nBassin d'emploi : ${fmtNum(p.secteur_bassin_emploi)} emplois`);
  if (p.secteur_taux_vacance != null) villeLines.push(`Taux de vacance commerciale : ${p.secteur_taux_vacance}%`);
  if (p.secteur_revenu_median) villeLines.push(`Revenu médian : ${fmt(p.secteur_revenu_median)} / an`);
  if (p.secteur_temps_aeroport) villeLines.push(`Aéroport : ${p.secteur_temps_aeroport} min`);
  if (p.secteur_temps_gare) villeLines.push(`Gare : ${p.secteur_temps_gare} min`);
  if (p.secteur_temps_centre_ville) villeLines.push(`Centre-ville : ${p.secteur_temps_centre_ville} min`);
  if (p.adresse_complete) villeLines.push(`\nEmplacement du bien : ${p.adresse_complete}`);

  slides.push({
    num: "02",
    title: p.ville_secteur_champ1 ? `La ville de ${p.ville_secteur_champ1}` : "La ville",
    text: villeLines.length > 0 ? villeLines.join("\n") : "Compléter les données ville dans le projet (champs description_ville, ville_secteur_champ1, etc.)",
  });

  // --- Slide 3 : Emplacement stratégique (Google Maps) ---
  slides.push({
    num: "03",
    title: "Un emplacement stratégique",
    text: `Cette slide nécessite une capture d'écran Google Maps.

Adresse à rechercher : ${p.adresse_complete || "À compléter"}
${p.latitude && p.longitude ? `Coordonnées GPS : ${p.latitude}, ${p.longitude}` : ""}

👉 Faire une capture de la carte Google Maps centrée sur l'adresse, montrant le quartier et les commerces alentours. Mettre un marqueur rouge sur le local.`,
  });

  // --- Slide 4 : Zoom sur le quartier ---
  const quartierLines = [];
  if (p.description_secteur) quartierLines.push(p.description_secteur);
  if (p.secteur_entreprises_majeures?.length) quartierLines.push(`\nEnseiges & entreprises majeures :\n${p.secteur_entreprises_majeures.map(e => `• ${e}`).join("\n")}`);
  if (p.secteur_services_proximite?.length) quartierLines.push(`\nServices de proximité :\n${p.secteur_services_proximite.map(s => `• ${s}`).join("\n")}`);
  if (p.secteur_transports?.length) quartierLines.push(`\nTransports :\n${p.secteur_transports.map(t => `• ${t.type} ${t.ligne} — ${t.distance_metres}m (${t.temps_marche_min} min à pied)`).join("\n")}`);
  if (p.secteur_walk_score) quartierLines.push(`\nWalk Score : ${p.secteur_walk_score}/100`);
  if (p.secteur_bike_score) quartierLines.push(`Bike Score : ${p.secteur_bike_score}/100`);
  if (p.secteur_nb_restaurants) quartierLines.push(`Restaurants à proximité : ${p.secteur_nb_restaurants}`);
  if (p.secteur_nb_parkings) quartierLines.push(`Parkings à proximité : ${p.secteur_nb_parkings}`);
  if (p.secteur_pct_bureaux) quartierLines.push(`Part bureaux : ${p.secteur_pct_bureaux}%`);
  if (p.secteur_pct_commerces) quartierLines.push(`Part commerces : ${p.secteur_pct_commerces}%`);
  if (p.secteur_pct_residentiel) quartierLines.push(`Part résidentiel : ${p.secteur_pct_residentiel}%`);
  if (p.secteur_projets_urbains) quartierLines.push(`\nProjets urbains en cours :\n${p.secteur_projets_urbains}`);

  slides.push({
    num: "04",
    title: "Zoom sur le quartier",
    text: quartierLines.length > 0 ? quartierLines.join("\n") : "Compléter les données secteur dans le projet.",
  });

  // --- Slide 5 : Tension locative ---
  const tensionLines = [];
  if (p.secteur_taux_vacance != null) tensionLines.push(`Taux de vacance commerciale : ${p.secteur_taux_vacance}%`);
  if (p.secteur_flux_routier) tensionLines.push(`Flux routier : ${p.secteur_flux_routier} véhicules/jour`);
  if (p.secteur_nb_restaurants) tensionLines.push(`Nombre de restaurants : ${p.secteur_nb_restaurants}`);
  if (p.secteur_bassin_emploi) tensionLines.push(`Bassin d'emploi : ${fmtNum(p.secteur_bassin_emploi)} emplois`);
  if (p.secteur_pct_commerces) tensionLines.push(`Part commerces dans le secteur : ${p.secteur_pct_commerces}%`);
  if (p.secteur_projets_urbains) tensionLines.push(`\nDynamique urbaine :\n${p.secteur_projets_urbains}`);
  if (p.secteur_entreprises_majeures?.length) tensionLines.push(`\nEnseignes de référence à proximité :\n${p.secteur_entreprises_majeures.map(e => `• ${e}`).join("\n")}`);
  tensionLines.push("\n👉 Ajouter les logos des commerces voisins (banques, enseignes, restaurants...) en complément visuel.");

  slides.push({
    num: "05",
    title: "Une forte tension locative sur le quartier",
    text: tensionLines.length > 1 ? tensionLines.join("\n") : "Compléter les données de tension locative dans le projet.",
  });

  // --- Slide 6 : Présentation du local ---
  const localLines = [];
  if (p.adresse_complete) localLines.push(`Adresse : ${p.adresse_complete}`);
  if (surface) localLines.push(`Surface : ${surface} m²`);
  if (p.loyer_m2_an || loyerM2 > 0) localLines.push(`Loyer au m²/an : ${fmt(p.loyer_m2_an || loyerM2)}`);
  if (p.bien_champ1) localLines.push(`${p.bien_champ1}`);
  if (p.bien_champ2) localLines.push(`${p.bien_champ2}`);
  if (p.bien_champ3) localLines.push(`${p.bien_champ3}`);
  if (p.description_bien) localLines.push(`\n${p.description_bien}`);
  if (p.nom_locataire) localLines.push(`\nLocataire : ${p.nom_locataire}`);
  if (p.activite_locataire) localLines.push(`Activité : ${p.activite_locataire}`);
  if (p.type_construction) localLines.push(`Type de construction : ${p.type_construction}`);
  if (p.dpe_note) localLines.push(`DPE : ${p.dpe_note}${p.dpe_consommation ? ` (${p.dpe_consommation} kWh/m²/an)` : ""}`);
  if (p.ges_note) localLines.push(`GES : ${p.ges_note}${p.ges_emission ? ` (${p.ges_emission} kg CO₂/m²/an)` : ""}`);
  if (p.quote_part_lot) localLines.push(`\nQuote-part copropriété : ${p.quote_part_lot}/1000 ème`);
  if (p.charges_copropriete) localLines.push(`Charges de copropriété : ${fmt(p.charges_copropriete)}/an`);

  slides.push({
    num: "06",
    title: "Présentation du local",
    text: localLines.length > 0 ? localLines.join("\n") : "Compléter les données du bien dans le projet.",
  });

  // --- Slide 7 : Zoom sur le bail commercial ---
  const bailLines = [];
  if (p.nom_locataire) bailLines.push(`Preneur : ${p.nom_locataire}`);
  if (p.activite_locataire) bailLines.push(`Activité : ${p.activite_locataire}`);
  if (p.bail_type) bailLines.push(`\nType de bail : ${p.bail_type}`);
  if (p.bail_date_debut) bailLines.push(`Date de début : ${dateStr(p.bail_date_debut)}`);
  if (p.bail_date_echeance || p.echeance_bail) bailLines.push(`Échéance : ${dateStr(p.bail_date_echeance || p.echeance_bail)}`);
  if (p.statut_bail) bailLines.push(`Statut : ${p.statut_bail.replace(/_/g, " ")}`);
  if (loyerAnnuel) {
    bailLines.push(`\nLoyer annuel HT : ${fmt(loyerAnnuel)}`);
    bailLines.push(`Loyer mensuel HT : ${fmt(Math.round(loyerAnnuel / 12))}`);
  }
  if (p.bail_loyer_initial) bailLines.push(`Loyer initial : ${fmt(p.bail_loyer_initial)}`);
  if (p.bail_depot_garantie) bailLines.push(`Dépôt de garantie : ${fmt(p.bail_depot_garantie)}`);
  if (p.bail_pas_de_porte) bailLines.push(`Pas de porte : ${fmt(p.bail_pas_de_porte)}`);
  if (p.bail_droit_entree) bailLines.push(`Droit d'entrée : ${fmt(p.bail_droit_entree)}`);
  bailLines.push(`\nIndexation : ILC +${indexation}%/an (théorique)`);
  if (p.bail_charges_redevable) bailLines.push(`Charges : à la charge du ${p.bail_charges_redevable}`);
  if (p.bail_taxe_fonciere) bailLines.push(`Taxe foncière : ${fmt(p.bail_taxe_fonciere)}/an`);
  if (p.activites_autorisees) bailLines.push(`\nActivités autorisées : ${p.activites_autorisees}`);
  if (p.activites_interdites) bailLines.push(`Activités interdites : ${p.activites_interdites}`);
  if (p.bail_periodicite_paiement) bailLines.push(`Périodicité de paiement : ${p.bail_periodicite_paiement}`);
  if (p.bail_infos_importantes) bailLines.push(`\nInfos importantes :\n${p.bail_infos_importantes}`);
  if (p.analyse_bail) bailLines.push(`\nAnalyse du bail :\n${p.analyse_bail}`);

  // bail_admin_fields
  if (p.bail_admin_fields?.length) {
    bailLines.push(`\nInformations complémentaires :`);
    p.bail_admin_fields.forEach(f => { if (f.label && f.value) bailLines.push(`• ${f.label} : ${f.value}`); });
  }

  slides.push({
    num: "07",
    title: "Zoom sur le bail commercial",
    text: bailLines.length > 0 ? bailLines.join("\n") : "Compléter les données du bail dans le projet.",
  });

  // --- Slide 8 : Marché immobilier ---
  const marcheLines = [];
  if (p.marche_quartier_nom) marcheLines.push(`Secteur de référence : ${p.marche_quartier_nom}`);
  if (p.marche_prix_m2_median) marcheLines.push(`\nValeur des murs (médiane) : ${fmt(p.marche_prix_m2_median)} / m²`);
  if (p.marche_prix_m2_bas && p.marche_prix_m2_haut) marcheLines.push(`Fourchette : ${fmt(p.marche_prix_m2_bas)} — ${fmt(p.marche_prix_m2_haut)} / m²`);
  if (p.marche_evolution_1an) marcheLines.push(`Évolution sur 1 an : ${p.marche_evolution_1an > 0 ? "+" : ""}${p.marche_evolution_1an}%`);
  if (p.marche_evolution_5ans) marcheLines.push(`Évolution sur 5 ans : ${p.marche_evolution_5ans > 0 ? "+" : ""}${p.marche_evolution_5ans}%`);
  if (p.marche_offre_bas && p.marche_offre_haut) marcheLines.push(`\nLoyers en offre : ${fmt(p.marche_offre_bas)} — ${fmt(p.marche_offre_haut)} / m²/an (moy. ${fmt(p.marche_offre_moyenne)})`);
  if (p.marche_baux_bas && p.marche_baux_haut) marcheLines.push(`Baux constatés : ${fmt(p.marche_baux_bas)} — ${fmt(p.marche_baux_haut)} / m²/an (moy. ${fmt(p.marche_baux_moyenne)})`);

  // marche_secteurs
  if (p.marche_secteurs?.length) {
    marcheLines.push(`\nComparatif par secteur :`);
    p.marche_secteurs.forEach(s => { if (s.nom) marcheLines.push(`• ${s.nom} : ${fmt(s.estimation_basse)} — ${fmt(s.estimation_haute)}`); });
  }

  slides.push({
    num: "08",
    title: "Le marché immobilier",
    text: marcheLines.length > 0 ? marcheLines.join("\n") : "Compléter les données marché dans le projet.",
  });

  // --- Slide 9 : Acquisition vs Marché ---
  const acqLines = [];
  if (prixNegocie) acqLines.push(`Prix d'acquisition négocié : ${fmt(prixNegocie)}`);
  if (prixM2) acqLines.push(`Prix au m² (acquisition) : ${fmtNum(prixM2)} €/m²`);
  if (p.marche_prix_m2_median && prixM2) {
    const diff = Math.round(((prixM2 - p.marche_prix_m2_median) / p.marche_prix_m2_median) * 100);
    acqLines.push(`Vs marché (${fmtNum(p.marche_prix_m2_median)} €/m²) : ${diff > 0 ? "+" : ""}${diff}%`);
  }
  if (loyerAnnuel && loyerM2) acqLines.push(`\nLoyer annuel HT : ${fmt(loyerAnnuel)}`);
  if (loyerM2) acqLines.push(`Loyer au m²/an : ${fmtNum(loyerM2)} €/m²/an`);
  if (p.marche_offre_moyenne && loyerM2) {
    const lDiff = Math.round(((loyerM2 - p.marche_offre_moyenne) / p.marche_offre_moyenne) * 100);
    acqLines.push(`Vs marché (${fmtNum(p.marche_offre_moyenne)} €/m²/an) : ${lDiff > 0 ? "+" : ""}${lDiff}%`);
  }
  if (rendement) acqLines.push(`\nRendement brut : ${pct(rendement)}`);

  slides.push({
    num: "09",
    title: "Acquisition vs Marché",
    text: acqLines.length > 0 ? acqLines.join("\n") : "Compléter prix et marché dans le projet.",
  });

  // --- Slide 10 : Projection financière ---
  const projLines = [];
  if (prixRevient) projLines.push(`Prix de revient total : ${fmt(prixRevient)}`);
  if (loyerAnnuel) projLines.push(`Loyer initial HT : ${fmt(loyerAnnuel)}/an`);
  if (rendement) projLines.push(`Rendement brut : ${pct(rendement)}`);
  projLines.push(`Indexation des loyers : ILC +${indexation}%/an`);
  if (p.sim_vacance_locative > 0) projLines.push(`Vacance locative : ${p.sim_vacance_locative}%`);

  // Loyers cumulés sur N ans
  if (loyerAnnuel > 0 && p.sim_annee_revente > 0) {
    let total = 0, loyer = loyerAnnuel;
    for (let i = 1; i <= p.sim_annee_revente; i++) {
      if (i > 1) loyer *= (1 + indexation / 100);
      total += loyer;
    }
    projLines.push(`Revenus locatifs cumulés sur ${p.sim_annee_revente} ans : ${fmt(total)}`);
  }

  if (p.sim_taxe_fonciere) projLines.push(`\nTaxe foncière : ${fmt(p.sim_taxe_fonciere)}/an — ${p.sim_taxe_refacturable ? "refacturée au locataire" : "charge propriétaire"}`);
  if (p.sim_charges_copropriete) projLines.push(`Charges copropriété : ${fmt(p.sim_charges_copropriete)}/an — ${p.sim_charges_refacturable ? "refacturées au locataire" : "charge propriétaire"}`);
  if (p.sim_comptabilite) projLines.push(`Comptabilité : ${fmt(p.sim_comptabilite)}/an`);
  if (p.sim_assurance_pne) projLines.push(`Assurance PNE : ${fmt(p.sim_assurance_pne)}/an`);
  if (p.sim_gestion_locative > 0) projLines.push(`Gestion locative : ${fmt(p.sim_gestion_locative)}/an`);

  // Travaux
  const travauxEntries = [1, 2, 3, 4, 5].map(i => ({
    annee: p[`sim_travaux_annee${i}`],
    montant: p[`sim_travaux_montant${i}`],
  })).filter(t => t.annee && t.montant);
  if (travauxEntries.length > 0) {
    projLines.push(`\nProvisions travaux :`);
    travauxEntries.forEach(t => projLines.push(`• Année ${t.annee} : ${fmt(t.montant)}`));
  }

  slides.push({
    num: "10",
    title: "Projection financière",
    text: projLines.length > 0 ? projLines.join("\n") : "Compléter la simulation financière dans le projet.",
  });

  // --- Slide 11 : Conditions souhaitées ---
  const condLines = [];
  if (prixRevient) condLines.push(`Prix de revient total : ${fmt(prixRevient)}`);
  if (apport) condLines.push(`Apport personnel : ${fmt(apport)}${prixRevient ? ` (${Math.round((apport / prixRevient) * 100)}%)` : ""}`);
  if (montantEmprunte > 0) condLines.push(`Montant à emprunter : ${fmt(montantEmprunte)}`);
  condLines.push(`Durée souhaitée : ${dureeCredit} ans`);
  condLines.push(`Taux fixe souhaité : ${pct(tauxInteret)}`);
  if (p.sim_taux_assurance) condLines.push(`Assurance emprunteur : ${pct(p.sim_taux_assurance)}`);
  if (p.sim_frais_dossier_bancaire) condLines.push(`Frais de dossier bancaire : ${fmt(p.sim_frais_dossier_bancaire)}`);
  if (p.sim_frais_courtage) condLines.push(`Frais de courtage : ${fmt(p.sim_frais_courtage)}`);
  if (p.sim_annee_renegociation && p.sim_taux_renegocie) condLines.push(`\nRenégociation prévue : Année ${p.sim_annee_renegociation} — Taux ${pct(p.sim_taux_renegocie)}`);

  slides.push({
    num: "11",
    title: "Conditions souhaitées",
    text: condLines.length > 0 ? condLines.join("\n") : "Compléter la simulation financière dans le projet.",
  });

  // --- Slide 12 : CV porteurs & structuration ---
  const cvLines = [];
  if (clientName) cvLines.push(`Porteur du projet : ${clientName}`);
  if (client?.email) cvLines.push(`Email : ${client.email}`);
  cvLines.push(`\n👉 Compléter avec :\n• Situation professionnelle\n• Revenus annuels\n• Patrimoine immobilier existant\n• Structure juridique retenue (SCI, SARL, personne physique...)\n• Répartition du capital (si associés)`);

  slides.push({
    num: "12",
    title: "CV des porteurs du projet & structuration",
    text: cvLines.join("\n"),
  });

  return slides;
}

function SlideBlock({ slide, index }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(index === 0);

  const handleCopy = () => {
    navigator.clipboard.writeText(slide.text);
    setCopied(true);
    toast.success(`Slide ${slide.num} copiée !`);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="border border-white/[0.07] rounded-xl overflow-hidden bg-[#0A0A0A]">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <span className="text-[#2A9D8F] text-sm font-bold w-8">{slide.num}</span>
          <span className="text-white text-sm font-light">{slide.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {open && (
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              className={`h-7 px-3 text-xs transition-all ${
                copied
                  ? "bg-green-500/20 border border-green-500/40 text-green-400"
                  : "bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 text-white"
              }`}
            >
              {copied ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copied ? "Copié !" : "Copier"}
            </Button>
          )}
          {open ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </button>

      {/* Content */}
      {open && (
        <div className="px-5 pb-5">
          <div className="bg-black/50 border border-white/[0.05] rounded-lg p-4">
            <pre className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap font-mono">
              {slide.text}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BankPitchGenerator({ project, client }) {
  const [copiedAll, setCopiedAll] = useState(false);
  const slides = generateSlideTexts(project, client);

  const handleCopyAll = () => {
    const full = slides.map(s => `--- SLIDE ${s.num} : ${s.title.toUpperCase()} ---\n\n${s.text}`).join("\n\n\n");
    navigator.clipboard.writeText(full);
    setCopiedAll(true);
    toast.success("Toute la présentation copiée !");
    setTimeout(() => setCopiedAll(false), 3000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-500 text-xs">
          {slides.length} slides générées · Cliquez sur chaque slide pour voir le contenu et le copier.
        </p>
        <Button
          size="sm"
          onClick={handleCopyAll}
          className={`h-8 px-4 text-xs transition-all ${
            copiedAll
              ? "bg-green-500/20 border border-green-500/40 text-green-400"
              : "bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] text-white"
          }`}
        >
          {copiedAll ? <CheckCircle2 className="w-3 h-3 mr-1.5" /> : <Copy className="w-3 h-3 mr-1.5" />}
          {copiedAll ? "Tout copié !" : "Tout copier"}
        </Button>
      </div>
      <div className="space-y-2">
        {slides.map((slide, i) => (
          <SlideBlock key={slide.num} slide={slide} index={i} />
        ))}
      </div>
    </div>
  );
}