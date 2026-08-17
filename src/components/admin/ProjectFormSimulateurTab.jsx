import React, { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FField, FInput } from "./FormField";

// Calcule les honoraires agent depuis le prix net vendeur
function calcHonorairesAgent(prixNetVendeur, mode, montant, tva) {
  if (!prixNetVendeur || !montant) return 0;
  if (mode === "fixe_ht") return Math.round(montant * (1 + (tva ? 0.20 : 0)));
  if (mode === "fixe_ttc") return Math.round(montant);
  if (mode === "pct_ht") return Math.round(prixNetVendeur * (montant / 100) * (1 + (tva ? 0.20 : 0)));
  if (mode === "pct_ttc") return Math.round(prixNetVendeur * (montant / 100));
  return 0;
}

const fmtEur = (v) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

// Titre de section aligné sur le style "IMMO OS"
function SectionTitle({ children, accent }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent || "#33d6c0" }} />
      <h3 className="text-[15px] font-semibold text-white tracking-tight">{children}</h3>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
}

// Toggle stylé "IMMO OS"
function ToggleRow({ checked, onCheckedChange, title, description }) {
  return (
    <div className="flex items-center gap-3 bg-[#171A21] border border-[#1c2725] rounded-[14px] px-[18px] py-3.5">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      <div>
        <Label className="text-[#EAECEF] text-[14px] font-medium cursor-pointer">{title}</Label>
        {description && <p className="text-[#8D93A0] text-[12px] mt-0.5 leading-snug">{description}</p>}
      </div>
    </div>
  );
}

// Select stylé "IMMO OS"
function FSelect({ label, value, onValueChange, children }) {
  return (
    <div className="bg-[#171A21] border border-[#1c2725] rounded-[14px] px-[18px] py-3 transition-all focus-within:border-[#33d6c0]">
      {label && <div className="text-[12px] text-[#8D93A0] font-semibold mb-1.5">{label}</div>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="bg-transparent border-none h-auto p-0 text-[15px] text-[#EAECEF] focus:ring-0"><SelectValue /></SelectTrigger>
        <SelectContent className="bg-[#171A21] text-white border-[#1c2725]">{children}</SelectContent>
      </Select>
    </div>
  );
}

export default function ProjectFormSimulateurTab({ formData, setFormData, travauxList, setTravauxList }) {
  const modeNetVendeur = !!formData.sim_mode_prix_net_vendeur;

  // Calcul des honoraires agent en temps réel
  const honorairesAgent = useMemo(() => {
    if (!modeNetVendeur) return 0;
    return calcHonorairesAgent(
      formData.sim_prix_net_vendeur || 0,
      formData.sim_honoraires_agent_mode || "pct_ttc",
      formData.sim_honoraires_agent_montant || 0,
      false
    );
  }, [modeNetVendeur, formData.sim_prix_net_vendeur, formData.sim_honoraires_agent_mode, formData.sim_honoraires_agent_montant]);

  const prixFAI = modeNetVendeur
    ? (formData.sim_prix_net_vendeur || 0) + honorairesAgent
    : (formData.sim_prix_bien_fai || 0);

  const handleNetVendeurToggle = (checked) => {
    if (checked) {
      // On pré-remplit prix net vendeur avec le prix FAI actuel
      setFormData({ ...formData, sim_mode_prix_net_vendeur: true, sim_prix_net_vendeur: formData.sim_prix_bien_fai || 0 });
    } else {
      setFormData({ ...formData, sim_mode_prix_net_vendeur: false });
    }
  };

  const handleNetVendeurChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    // Recalcule et met à jour sim_prix_bien_fai automatiquement
    const hon = calcHonorairesAgent(
      field === "sim_prix_net_vendeur" ? value : (formData.sim_prix_net_vendeur || 0),
      field === "sim_honoraires_agent_mode" ? value : (formData.sim_honoraires_agent_mode || "pct_ttc"),
      field === "sim_honoraires_agent_montant" ? value : (formData.sim_honoraires_agent_montant || 0),
      false
    );
    const netV = field === "sim_prix_net_vendeur" ? value : (formData.sim_prix_net_vendeur || 0);
    newData.sim_prix_bien_fai = netV + hon;
    newData.sim_prix_bien_negocie = netV + hon; // Prix négocié = Prix FAI par défaut
    setFormData(newData);
  };

  return (
    <div className="space-y-6 mt-6">
      <SectionTitle>1. Acquisition</SectionTitle>

      {/* Mode prix net vendeur */}
      <ToggleRow
        checked={modeNetVendeur}
        onCheckedChange={handleNetVendeurToggle}
        title="Mode Prix net vendeur"
        description="Entrez le prix net vendeur + honoraires agent → calcul automatique du prix FAI"
      />

      {modeNetVendeur ? (
        <div className="space-y-4 p-4 bg-white/[0.02] rounded-[14px] border border-[#16201f]">
          <div className="grid md:grid-cols-2 gap-4">
            <FField label="Prix net vendeur (€)">
              <FInput type="number" value={formData.sim_prix_net_vendeur || ''} onChange={(e) => handleNetVendeurChange("sim_prix_net_vendeur", parseFloat(e.target.value) || 0)} />
            </FField>
            <FField label="Surface pondérée (m²)">
              <FInput type="number" value={formData.sim_surface || ''} onChange={(e) => setFormData({...formData, sim_surface: parseFloat(e.target.value) || 0})} />
            </FField>
          </div>

          {/* Honoraires agent */}
          <div className="pt-2">
            <p className="text-[12px] text-[#8D93A0] mb-3 uppercase tracking-[0.14em] font-semibold">Honoraires agent immobilier</p>
            <div className="grid md:grid-cols-3 gap-3">
              <FSelect label="Mode de calcul" value={formData.sim_honoraires_agent_mode || "pct_ttc"} onValueChange={(v) => handleNetVendeurChange("sim_honoraires_agent_mode", v)}>
                <SelectItem value="pct_ttc">% du prix net vendeur — TTC</SelectItem>
                <SelectItem value="pct_ht">% du prix net vendeur — HT (+20% TVA)</SelectItem>
                <SelectItem value="fixe_ttc">Montant fixe TTC (€)</SelectItem>
                <SelectItem value="fixe_ht">Montant fixe HT (€) (+20% TVA)</SelectItem>
              </FSelect>
              <FField label={(formData.sim_honoraires_agent_mode || "pct_ttc").startsWith("pct") ? "Taux (%)" : "Montant HT (€)"}>
                <FInput type="number" step="0.1" value={formData.sim_honoraires_agent_montant || ''} onChange={(e) => handleNetVendeurChange("sim_honoraires_agent_montant", parseFloat(e.target.value) || 0)} />
              </FField>
              <div className="bg-[#171A21] border border-[#1c2725] rounded-[14px] px-[18px] py-3">
                <div className="text-[12px] text-[#8D93A0] font-semibold mb-1.5">Honoraires TTC calculés</div>
                <span className="text-[#33d6c0] font-semibold text-[15px]">
                  {honorairesAgent > 0 ? fmtEur(honorairesAgent) : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Récap Prix FAI calculé */}
          <div className="pt-3 border-t border-[#16201f] flex items-center justify-between">
            <span className="text-[#8D93A0] text-[13px]">Prix FAI calculé (net vendeur + honoraires) :</span>
            <span className="text-white font-semibold text-[16px]">
              {prixFAI > 0 ? fmtEur(prixFAI) : "—"}
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <FField label="Prix du bien affiché FAI (€)">
              <FInput type="number" value={formData.sim_prix_bien_fai || ''} onChange={(e) => setFormData({...formData, sim_prix_bien_fai: parseFloat(e.target.value) || 0})} />
            </FField>
            <FField label="Prix du bien négocié FAI (€)">
              <FInput type="number" value={formData.sim_prix_bien_negocie || ''} onChange={(e) => setFormData({...formData, sim_prix_bien_negocie: parseFloat(e.target.value) || 0})} />
            </FField>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <FField label="Prix du bien affiché FAI (€)">
            <FInput type="number" value={formData.sim_prix_bien_fai || ''} onChange={(e) => setFormData({...formData, sim_prix_bien_fai: parseFloat(e.target.value) || 0})} />
          </FField>
          <FField label="Surface pondérée (m²)">
            <FInput type="number" value={formData.sim_surface || ''} onChange={(e) => setFormData({...formData, sim_surface: parseFloat(e.target.value) || 0})} />
          </FField>
          <FField label="Prix du bien négocié FAI (€)">
            <FInput type="number" value={formData.sim_prix_bien_negocie || ''} onChange={(e) => setFormData({...formData, sim_prix_bien_negocie: parseFloat(e.target.value) || 0})} />
          </FField>
        </div>
      )}

      <SectionTitle>2. Location</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <FField label="Loyer annuel initial HC HT (€)">
          <FInput type="number" value={formData.sim_loyer_initial_ht || ''} onChange={(e) => setFormData({...formData, sim_loyer_initial_ht: parseFloat(e.target.value) || 0})} />
        </FField>
        <FField label="Indexation annuelle des loyers (%)">
          <FInput type="number" step="0.1" value={formData.sim_indexation_loyers || ''} onChange={(e) => setFormData({...formData, sim_indexation_loyers: parseFloat(e.target.value) || 0})} />
        </FField>
        <ToggleRow checked={formData.sim_loyer_soumis_tva} onCheckedChange={(checked) => setFormData({...formData, sim_loyer_soumis_tva: checked})} title="Loyer initial assujetti à TVA" />
        <FField label="Charges de copropriété (€)">
          <FInput type="number" value={formData.sim_charges_copropriete || ''} onChange={(e) => setFormData({...formData, sim_charges_copropriete: parseFloat(e.target.value) || 0})} />
        </FField>
        <ToggleRow checked={formData.sim_charges_refacturable} onCheckedChange={(checked) => setFormData({...formData, sim_charges_refacturable: checked})} title="Refacturable locataire" />
        <FField label="Taxe foncière (€)">
          <FInput type="number" value={formData.sim_taxe_fonciere || ''} onChange={(e) => setFormData({...formData, sim_taxe_fonciere: parseFloat(e.target.value) || 0})} />
        </FField>
        <ToggleRow checked={formData.sim_taxe_refacturable} onCheckedChange={(checked) => setFormData({...formData, sim_taxe_refacturable: checked})} title="Refacturable locataire" />
      </div>

      <SectionTitle>3. Revalorisation du loyer</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <FField label="Année de revalorisation / déplafonnement">
          <FInput type="number" value={formData.sim_annee_revalorisation || ''} onChange={(e) => setFormData({...formData, sim_annee_revalorisation: parseInt(e.target.value) || null})} />
        </FField>
        <FField label="Loyer annuel revalorisé / déplafonné HC HT (€)">
          <FInput type="number" value={formData.sim_loyer_revalorise || ''} onChange={(e) => setFormData({...formData, sim_loyer_revalorise: parseFloat(e.target.value) || 0})} />
        </FField>
        <ToggleRow checked={formData.sim_loyer_revalorise_tva || false} onCheckedChange={(checked) => setFormData({...formData, sim_loyer_revalorise_tva: checked})} title="Loyer revalorisé / déplafonné assujetti à TVA" />
        <FField label="Vacance locative prévisionnelle (mois/an)">
          <FInput type="number" value={formData.sim_vacance_locative || ''} onChange={(e) => setFormData({...formData, sim_vacance_locative: parseFloat(e.target.value) || 0})} />
        </FField>
      </div>

      <SectionTitle>4. Financement</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <FField label="Apport / Fonds propres (€)">
          <FInput type="number" value={formData.sim_apport || ''} onChange={(e) => setFormData({...formData, sim_apport: parseFloat(e.target.value) || 0})} />
        </FField>
        <FField label="Durée du crédit bancaire initial (années)">
          <FInput type="number" value={formData.sim_duree_credit || ''} onChange={(e) => setFormData({...formData, sim_duree_credit: parseInt(e.target.value) || 20})} />
        </FField>
        <FField label="Taux d'intérêt (%)">
          <FInput type="number" step="0.01" value={formData.sim_taux_interet || ''} onChange={(e) => setFormData({...formData, sim_taux_interet: parseFloat(e.target.value) || 0})} />
        </FField>
        <FField label="Taux de l'assurance crédit (%)">
          <FInput type="number" step="0.01" value={formData.sim_taux_assurance || ''} onChange={(e) => setFormData({...formData, sim_taux_assurance: parseFloat(e.target.value) || 0})} />
        </FField>
      </div>
      {/* Prêt in fine */}
      <ToggleRow
        checked={formData.sim_pret_in_fine ?? false}
        onCheckedChange={(checked) => setFormData({...formData, sim_pret_in_fine: checked})}
        title="Prêt in fine"
        description="Remboursement des intérêts uniquement chaque mois — le capital est remboursé en totalité la dernière année"
      />

      <p className="text-[13px] text-[#8D93A0] mt-2">Paramètres avancés (renégociation)</p>
      <div className="grid md:grid-cols-2 gap-4">
        <FField label="Année de renégociation du crédit">
          <FInput type="number" value={formData.sim_annee_renegociation || ''} onChange={(e) => setFormData({...formData, sim_annee_renegociation: e.target.value})} placeholder="Laisser vide si pas de renégociation" />
        </FField>
        <FField label="Taux d'intérêt renégocié (%)">
          <FInput type="number" step="0.01" value={formData.sim_taux_renegocie || ''} onChange={(e) => setFormData({...formData, sim_taux_renegocie: e.target.value})} />
        </FField>
        <FField label="Indemnité de remboursement anticipé (mois)">
          <FInput type="number" value={formData.sim_ira_mois || 0} onChange={(e) => setFormData({...formData, sim_ira_mois: e.target.value})} />
        </FField>
      </div>

      <SectionTitle>5. Charges diverses</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <FField label="Frais de création de société (€)">
          <FInput type="number" value={formData.sim_cout_creation_societe || ''} onChange={(e) => setFormData({...formData, sim_cout_creation_societe: parseFloat(e.target.value) || 0})} />
        </FField>
        <FField label="Frais de dossier bancaire (€)">
          <FInput type="number" value={formData.sim_frais_dossier_bancaire || ''} onChange={(e) => setFormData({...formData, sim_frais_dossier_bancaire: parseFloat(e.target.value) || 0})} />
        </FField>
        <FField label="Frais de courtage (€)">
          <FInput type="number" value={formData.sim_frais_courtage || ''} onChange={(e) => setFormData({...formData, sim_frais_courtage: parseFloat(e.target.value) || 0})} />
        </FField>
        <FField label="Comptabilité annuelle (€/an)">
          <FInput type="number" value={formData.sim_comptabilite || ''} onChange={(e) => setFormData({...formData, sim_comptabilite: parseFloat(e.target.value) || 0})} />
        </FField>
        <FField label="Assurance PNE (€/an)">
          <FInput type="number" value={formData.sim_assurance_pne || ''} onChange={(e) => setFormData({...formData, sim_assurance_pne: parseFloat(e.target.value) || 0})} />
        </FField>
        <FField label="Gestion locative TTC (%)">
          <FInput type="number" step="0.1" value={formData.sim_gestion_locative || ''} onChange={(e) => setFormData({...formData, sim_gestion_locative: parseFloat(e.target.value) || 0})} />
        </FField>
        <FField label="Charges diverses (€/an)">
          <FInput type="number" value={formData.sim_charges_diverses || ''} onChange={(e) => setFormData({...formData, sim_charges_diverses: parseFloat(e.target.value) || 0})} />
        </FField>
      </div>

      <SectionTitle>6. Travaux à la charge du bailleur</SectionTitle>
      <p className="text-[12px] text-[#8D93A0] -mt-2">Saisissez le montant des travaux pour chaque année (laisser vide si aucun travaux)</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 20 }, (_, i) => i + 1).map((annee) => {
          const entry = travauxList.find(t => parseInt(t.annee) === annee);
          return (
            <FField key={annee} label={`Année ${annee}`}>
              <FInput
                type="number"
                value={entry?.montant || ""}
                onChange={(e) => {
                  const montant = e.target.value;
                  const existing = travauxList.filter(t => parseInt(t.annee) !== annee);
                  if (montant) {
                    setTravauxList([...existing, { annee, montant }]);
                  } else {
                    setTravauxList(existing);
                  }
                }}
                placeholder="0 €"
              />
            </FField>
          );
        })}
      </div>

      <SectionTitle>7. Revente</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <FField label="Année de revente">
          <FInput type="number" value={formData.sim_annee_revente || ''} onChange={(e) => setFormData({...formData, sim_annee_revente: parseInt(e.target.value) || 20})} />
        </FField>
        <FField label="Honoraire agent pour la revente TTC (%)">
          <FInput type="number" step="0.1" value={formData.sim_commission_agent_revente || ''} onChange={(e) => setFormData({...formData, sim_commission_agent_revente: parseFloat(e.target.value) || 0})} />
        </FField>
        <FField label="Rendement brut à la revente pour l'acquéreur (%)">
          <FInput type="number" step="0.1" value={formData.sim_rendement_capital || ''} onChange={(e) => setFormData({...formData, sim_rendement_capital: parseFloat(e.target.value) || 0})} />
        </FField>
      </div>

      <SectionTitle accent="#F59E0B">8. Paramètres Administrateur</SectionTitle>
      <div className="space-y-4 p-4 bg-[#F59E0B]/10 rounded-[14px] border border-[#F59E0B]/30">
        <ToggleRow checked={formData.sim_commission_agent_active ?? false} onCheckedChange={(checked) => setFormData({...formData, sim_commission_agent_active: checked})} title="Honoraires à la charge de l'acquéreur TTC" />
        {formData.sim_commission_agent_active && (
          <div className="space-y-4">
            <ToggleRow
              checked={formData.sim_commission_agent_inclus_fai ?? true}
              onCheckedChange={(checked) => setFormData({...formData, sim_commission_agent_inclus_fai: checked})}
              title="Honoraires inclus dans le prix FAI"
              description={(formData.sim_commission_agent_inclus_fai ?? true)
                ? "Les honoraires sont déjà compris dans le prix négocié FAI (déduits pour le calcul des droits d'enregistrement)"
                : "Les honoraires s'ajoutent en sus du prix négocié FAI (ajoutés au prix de revient total)"}
            />
            <div className="grid md:grid-cols-2 gap-4">
              <FSelect label="Type honoraires charge acquéreur TTC" value={formData.sim_commission_agent_type || "pourcentage"} onValueChange={(value) => setFormData({...formData, sim_commission_agent_type: value})}>
                <SelectItem value="pourcentage">Pourcentage (%)</SelectItem>
                <SelectItem value="fixe">Montant fixe (€)</SelectItem>
              </FSelect>
              <FField label={`Honoraires charge acquéreur TTC ${formData.sim_commission_agent_type === "fixe" ? "(€)" : "(%)"}`}>
                <FInput type="number" step="0.1" value={formData.sim_commission_agent || ''} onChange={(e) => setFormData({...formData, sim_commission_agent: parseFloat(e.target.value) || 0})} />
              </FField>
            </div>
          </div>
        )}
        <FField label="Droits d'enregistrement (%)">
          <FInput type="number" step="0.1" value={formData.sim_droits_enregistrement || ''} onChange={(e) => setFormData({...formData, sim_droits_enregistrement: parseFloat(e.target.value) || 0})} />
        </FField>
        <ToggleRow
          checked={formData.sim_no_fees_klocka ?? false}
          onCheckedChange={(checked) => setFormData({...formData, sim_no_fees_klocka: checked, ...(checked ? { sim_fees_klocka: 0, sim_incentive_klocka: 0 } : {})})}
          title="Ne pas mettre d'honoraires Klocka"
        />
        {!formData.sim_no_fees_klocka && (<>
          <FSelect label="Type honoraires Klocka TTC" value={formData.sim_fees_klocka_type || "pourcentage"} onValueChange={(value) => setFormData({...formData, sim_fees_klocka_type: value})}>
            <SelectItem value="pourcentage">Pourcentage (%)</SelectItem>
            <SelectItem value="fixe">Montant fixe (€)</SelectItem>
          </FSelect>
          <FField label={`Fees Klocka TTC ${formData.sim_fees_klocka_type === "fixe" ? "(€)" : "(%)"}`}>
            <FInput type="number" step="0.1" value={formData.sim_fees_klocka || ''} onChange={(e) => setFormData({...formData, sim_fees_klocka: parseFloat(e.target.value) || 0})} />
          </FField>
          <FField label="Incentive Klocka TTC (%)">
            <FInput type="number" step="0.1" value={formData.sim_incentive_klocka || ''} onChange={(e) => setFormData({...formData, sim_incentive_klocka: parseFloat(e.target.value) || 0})} />
          </FField>
        </>)}
      </div>
    </div>
  );
}