import React from "react";

const statutLabels = { prospect: "Prospect", analyse: "Analyse", negociation: "Négociation", financement: "Financement", signe: "Signé" };

function Row({ label, value, empty = "—" }) {
  return (
    <div className="flex justify-between text-[13px] text-[#8b9391] py-1.5 border-t border-[#242726]">
      <span className="flex-shrink-0">{label}</span>
      <span className="text-[#edeae5] truncate max-w-[190px] text-right ml-2">{value || empty}</span>
    </div>
  );
}

function Shell({ children, formData }) {
  return (
    <div className="bg-[#12151C] border border-[#282b2a] rounded-[18px] overflow-hidden max-w-[360px] shadow-[0_24px_50px_rgba(0,0,0,0.5)]">
      <div
        className="h-[130px] bg-[#1B1F29] bg-cover bg-center"
        style={formData.photos?.[0]
          ? { backgroundImage: `url(${formData.photos[0]})` }
          : { backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,0.05) 0 8px,transparent 8px 16px)" }}
      />
      <div className="px-[18px] pt-[18px] pb-5">
        <div className="flex justify-between items-center mb-3">
          <span className="font-bold text-[17px] truncate">{formData.titre || "Sans titre"}</span>
          <span className="text-[12px] font-semibold text-[#35a79b] bg-[#35a79b]/[0.15] px-2.5 py-1 rounded-full flex-shrink-0 ml-2">
            {statutLabels[formData.statut] || "Prospect"}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

const fmtEur = (v) => (v ? `${Number(v).toLocaleString("fr-FR")} €` : null);
const fmtPct = (v) => (v ? `${v} %` : null);

export default function ProjectLivePreview({ activeTab, formData }) {
  // Titre contextuel de la carte selon l'onglet
  const sectionTitles = {
    secteur: "Aperçu — Secteur",
    locataire: "Aperçu — Locataire",
    copropriete: "Aperçu — Copropriété",
    marche: "Aperçu — Marché",
    diagnostique: "Aperçu — Diagnostiques",
    simulateur: "Aperçu — Simulateur",
  };
  const label = sectionTitles[activeTab] || "Aperçu du projet";

  let body;
  switch (activeTab) {
    case "secteur":
      body = (
        <>
          <Row label="Ville" value={formData.ville_secteur_champ1} />
          <Row label="Secteur" value={formData.ville_secteur_champ2} />
          <Row label="Région" value={formData.ville_secteur_champ3} />
          <Row label="Bien" value={formData.bien_champ1} />
        </>
      );
      break;
    case "locataire":
      body = (
        <>
          <Row label="Locataire" value={formData.nom_locataire} />
          <Row label="Activité" value={formData.activite_locataire} />
          <Row label="Loyer annuel HT" value={fmtEur(formData.loyer_annuel_ht)} />
          <Row label="Échéance bail" value={formData.echeance_bail} />
        </>
      );
      break;
    case "copropriete":
      body = (
        <>
          <Row label="Quote-part lot" value={formData.quote_part_lot} />
          <Row label="Charges copro" value={fmtEur(formData.charges_copropriete)} />
          <Row label="Provision charges" value={fmtEur(formData.provision_charges)} />
          <Row label="Construction" value={formData.type_construction} />
        </>
      );
      break;
    case "marche":
      body = (
        <>
          <Row label="Quartier" value={formData.marche_quartier_nom} />
          <Row label="Prix médian /m²" value={fmtEur(formData.marche_prix_m2_median)} />
          <Row label="Évol. 1 an" value={fmtPct(formData.marche_evolution_1an)} />
          <Row label="Évol. 5 ans" value={fmtPct(formData.marche_evolution_5ans)} />
        </>
      );
      break;
    case "diagnostique":
      body = (
        <>
          <Row label="DPE" value={formData.dpe_note && formData.dpe_note !== "null" ? formData.dpe_note : null} />
          <Row label="Conso." value={formData.dpe_consommation ? `${formData.dpe_consommation} kWh` : null} />
          <Row label="GES" value={formData.ges_note && formData.ges_note !== "null" ? formData.ges_note : null} />
          <Row label="Émission" value={formData.ges_emission ? `${formData.ges_emission} kg` : null} />
        </>
      );
      break;
    case "simulateur":
      body = (
        <>
          <Row label="Prix FAI" value={fmtEur(formData.sim_prix_bien_fai)} />
          <Row label="Prix négocié" value={fmtEur(formData.sim_prix_bien_negocie)} />
          <Row label="Loyer HT" value={fmtEur(formData.sim_loyer_initial_ht)} />
          <Row label="Apport" value={fmtEur(formData.sim_apport)} />
        </>
      );
      break;
    default:
      body = (
        <>
          <Row label="Surface" value={formData.surface_m2 ? `${formData.surface_m2} m²` : null} empty="— m²" />
          <Row label="Adresse" value={formData.adresse_complete} empty="À définir" />
        </>
      );
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#6b7270] mb-3 font-semibold">{label}</p>
      <Shell formData={formData}>{body}</Shell>
    </div>
  );
}