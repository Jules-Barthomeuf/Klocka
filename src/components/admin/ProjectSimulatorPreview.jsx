import React, { useMemo } from "react";

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : fallback;
}

/**
 * Les paramètres du simulateur d'après les champs du projet (sim_*) : la même lecture pour l'aperçu et pour le
 * simulateur du projet, qui est celui de la Pré-analyse (11 nov. 2026, Jules : « tous les simulateurs pareils »).
 */
export function parametresDuProjet(formData, travauxList) {
    const travauxBailleur = Array(25).fill(0);

    (travauxList || []).forEach((travail) => {
      const year = Number(travail.annee);
      const amount = Number(travail.montant);
      if (year >= 1 && year <= 25 && Number.isFinite(amount)) {
        travauxBailleur[year - 1] = amount;
      }
    });

    const vacancesLocatives = Array.isArray(formData.sim_vacances_locatives) && formData.sim_vacances_locatives.length
      ? formData.sim_vacances_locatives : Array(25).fill(Number(formData.sim_vacance_locative) || 0);

    const params = {
      surface: numberOrDefault(formData.sim_surface, 34),
      loyerInitialHTHC: numberOrDefault(formData.sim_loyer_initial_ht, 27840),
      loyerSoumisTVA: !!formData.sim_loyer_soumis_tva,
      tauxTVA: numberOrDefault(formData.sim_taux_tva, 20),
      chargesCoproRefacturables: formData.sim_charges_refacturable !== false,
      chargesCopropriete: Number(formData.sim_charges_copropriete) || 0,
      taxeFonciereRefacturable: formData.sim_taxe_refacturable !== false,
      taxeFonciere: Number(formData.sim_taxe_fonciere) || 0,
      loyerRevalorise: Number(formData.sim_loyer_revalorise) || 0,
      anneeRevalorisation: formData.sim_annee_revalorisation ? Number(formData.sim_annee_revalorisation) : null,
      revalorisationActive: !!formData.sim_annee_revalorisation,
      gestionLocative: Number(formData.sim_gestion_locative) || 0,
      comptabilite: numberOrDefault(formData.sim_comptabilite, 600),
      chargesDiverses: Number(formData.sim_charges_diverses) || 0,
      assurancePNE: numberOrDefault(formData.sim_assurance_pne, 400),
      fraisDossierBancaire: numberOrDefault(formData.sim_frais_dossier_bancaire, 1000),
      fraisCourtage: Number(formData.sim_frais_courtage) || 0,
      coutCreationSociete: numberOrDefault(formData.sim_cout_creation_societe, 1000),
      vacancesLocatives,
      travauxBailleur,
      prixBienFAI: numberOrDefault(formData.sim_prix_bien_fai, 327000),
      prixBienNegocie: numberOrDefault(formData.sim_prix_bien_negocie, 327000),
      tauxCommissionAgent: numberOrDefault(formData.sim_commission_agent, 5),
      commissionAgentType: formData.sim_commission_agent_type || "pourcentage",
      commissionAgentInclusFAI: formData.sim_commission_agent_inclus_fai !== false,
      tauxDroitsEnregistrement: numberOrDefault(formData.sim_droits_enregistrement, 8),
      tauxFeesKlocka: formData.sim_no_fees_klocka ? 0 : numberOrDefault(formData.sim_fees_klocka, 8),
      feesKlockaType: formData.sim_fees_klocka_type || "pourcentage",
      tauxIncentiveKlocka: formData.sim_no_fees_klocka ? 0 : numberOrDefault(formData.sim_incentive_klocka, 20),
      apport: numberOrDefault(formData.sim_apport, 70000),
      dureeCredit: numberOrDefault(formData.sim_duree_credit, 20),
      tauxInteret: numberOrDefault(formData.sim_taux_interet, 3.7),
      tauxAssuranceCredit: numberOrDefault(formData.sim_taux_assurance, 0.25),
      renegociationActive: !!formData.sim_annee_renegociation,
      anneeRenegociation: numberOrDefault(formData.sim_annee_renegociation, 10),
      nouveauTauxRenegociation: numberOrDefault(formData.sim_taux_renegocie, 2.5),
      iraRenegociation: Number(formData.sim_ira_mois) || 0,
      indexation: numberOrDefault(formData.sim_indexation_loyers, 2),
      anneeRevente: numberOrDefault(formData.sim_annee_revente, 20),
      tauxCommissionAgentRevente: numberOrDefault(formData.sim_commission_agent_revente, 5),
      rendementBrutAcheteur: numberOrDefault(formData.sim_rendement_capital, 6.5),
      commissionAgentActive: !!formData.sim_commission_agent_active,
      pretInFine: !!formData.sim_pret_in_fine,
      sansCredit: !!formData.sim_sans_credit,
    };
    return params;
}

// Le chemin inverse : ce que le simulateur rend, rangé dans les champs du projet.
const VERS_PROJET = {
  surface: "sim_surface", loyerInitialHTHC: "sim_loyer_initial_ht", loyerSoumisTVA: "sim_loyer_soumis_tva", tauxTVA: "sim_taux_tva",
  chargesCoproRefacturables: "sim_charges_refacturable", chargesCopropriete: "sim_charges_copropriete",
  taxeFonciereRefacturable: "sim_taxe_refacturable", taxeFonciere: "sim_taxe_fonciere", loyerRevalorise: "sim_loyer_revalorise",
  gestionLocative: "sim_gestion_locative", comptabilite: "sim_comptabilite", chargesDiverses: "sim_charges_diverses",
  assurancePNE: "sim_assurance_pne", fraisDossierBancaire: "sim_frais_dossier_bancaire", fraisCourtage: "sim_frais_courtage",
  coutCreationSociete: "sim_cout_creation_societe", prixBienFAI: "sim_prix_bien_fai", prixBienNegocie: "sim_prix_bien_negocie",
  tauxCommissionAgent: "sim_commission_agent", commissionAgentType: "sim_commission_agent_type", commissionAgentInclusFAI: "sim_commission_agent_inclus_fai",
  tauxDroitsEnregistrement: "sim_droits_enregistrement", tauxFeesKlocka: "sim_fees_klocka", feesKlockaType: "sim_fees_klocka_type",
  tauxIncentiveKlocka: "sim_incentive_klocka", apport: "sim_apport", dureeCredit: "sim_duree_credit", tauxInteret: "sim_taux_interet",
  tauxAssuranceCredit: "sim_taux_assurance", nouveauTauxRenegociation: "sim_taux_renegocie", iraRenegociation: "sim_ira_mois",
  indexation: "sim_indexation_loyers", anneeRevente: "sim_annee_revente", tauxCommissionAgentRevente: "sim_commission_agent_revente",
  rendementBrutAcheteur: "sim_rendement_capital", pretInFine: "sim_pret_in_fine", sansCredit: "sim_sans_credit",
};

/** Pure : les chiffres du simulateur en champs du projet (travaux en liste année / montant, vacances par année). */
export function champsDuSimulateur(c = {}) {
  const champs = {};
  for (const [cle, champ] of Object.entries(VERS_PROJET)) if (c[cle] !== undefined) champs[champ] = c[cle];
  if (c.revalorisationActive !== undefined) champs.sim_annee_revalorisation = c.revalorisationActive && c.anneeRevalorisation ? c.anneeRevalorisation : "";
  if (c.renegociationActive !== undefined) champs.sim_annee_renegociation = c.renegociationActive ? c.anneeRenegociation : "";
  if (Array.isArray(c.vacancesLocatives)) { champs.sim_vacances_locatives = c.vacancesLocatives; champs.sim_vacance_locative = Number(c.vacancesLocatives[0]) || 0; }
  if (c.tauxFeesKlocka !== undefined) champs.sim_no_fees_klocka = !(Number(c.tauxFeesKlocka) > 0);
  const travaux = Array.isArray(c.travauxBailleur) ? c.travauxBailleur.map((montant, i) => ({ annee: i + 1, montant: Number(montant) || 0 })).filter((t) => t.montant) : null;
  return { champs, travaux };
}

export default function ProjectSimulatorPreview({ formData, travauxList, vue = null, hauteur = null }) {
  const previewUrl = useMemo(() => {
    const params = parametresDuProjet(formData, travauxList);
    return `/SimulateurPublic?data=${encodeURIComponent(JSON.stringify(params))}${vue ? `&vue=${vue}` : "&cadre=projet"}`;
  }, [formData, travauxList, vue]);

  // Une vue seule (le graphique) se pose sans en-tête, à la hauteur demandée.
  if (vue) {
    return (
      <div className="overflow-hidden k-verre">
        <iframe key={previewUrl} src={previewUrl} title="Graphique du simulateur" className="block w-full border-0" style={{ height: hauteur || 360 }} />
      </div>
    );
  }

  return (
    <iframe key={previewUrl} src={previewUrl} title="Preview simulateur client" className="block h-[78vh] w-full border-0" style={{ background: "transparent" }} />
  );
}