import React, { useMemo } from "react";

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : fallback;
}

export default function ProjectSimulatorPreview({ formData, travauxList }) {
  const previewUrl = useMemo(() => {
    const travauxBailleur = Array(25).fill(0);

    (travauxList || []).forEach((travail) => {
      const year = Number(travail.annee);
      const amount = Number(travail.montant);
      if (year >= 1 && year <= 25 && Number.isFinite(amount)) {
        travauxBailleur[year - 1] = amount;
      }
    });

    const vacancesLocatives = Array(25).fill(Number(formData.sim_vacance_locative) || 0);

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
    };

    return `/SimulateurPublic?data=${encodeURIComponent(JSON.stringify(params))}`;
  }, [formData, travauxList]);

  return (
    <div className="mt-6 rounded-md border border-[#1f2228] bg-[#000000] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1f2228] flex items-center justify-between">
        <div>
          <h3 className="text-[#f2f3f5] text-sm font-medium">Preview simulateur client</h3>
          <p className="text-[#f2f3f5]/35 text-xs">Aperçu complet basé sur les données du formulaire.</p>
        </div>
      </div>
      <iframe
        key={previewUrl}
        src={previewUrl}
        title="Preview simulateur client"
        className="w-full h-[72vh] bg-[#000000]"
      />
    </div>
  );
}