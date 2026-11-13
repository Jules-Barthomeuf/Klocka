import React, { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

// Le formulaire et l'aperçu du simulateur ont le même dessin (9 nov. 2026, Jules) : un cadre fin par partie, titre à 16 px,
// une ligne de 36 px par donnée, le libellé à gauche et la valeur à droite.
const LIGNE = "flex min-h-[36px] items-center justify-between gap-3 border-b border-trait px-4 py-1.5 text-[13.5px] transition-colors max-md:min-h-[40px]";

function Bloc({ titre, children }) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-trait">
      <h3 className="flex h-[46px] items-center border-b border-trait px-4 text-[16px] font-medium text-encre">{titre}</h3>
      <div className="[&>*:last-child]:border-b-0">{children}</div>
    </section>
  );
}

function SousTitre({ children }) {
  return <p className="flex min-h-[30px] items-center border-b border-trait px-4 py-1 text-[12.5px] text-ardoise">{children}</p>;
}

function Ligne({ label, children, largeur = "w-[110px]", attachee = false }) {
  return (
    <label className={`${LIGNE} cursor-text focus-within:bg-encre/[0.04] ${attachee ? "border-b-0" : ""}`}>
      <span className="min-w-0 text-craie">{label}</span>
      <span className={`flex-shrink-0 ${largeur}`}>{children}</span>
    </label>
  );
}

function Calcule({ label, children }) {
  return (
    <div className={LIGNE}>
      <span className="min-w-0 text-ardoise">{label}</span>
      <span className="flex-shrink-0 tabular-nums text-encre">{children}</span>
    </div>
  );
}

function Saisie({ className = "", ...props }) {
  return <input {...props} className={`w-full border-none bg-transparent text-right text-[13.5px] tabular-nums text-encre outline-none placeholder:text-brume max-md:text-[16px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${className}`} />;
}

// « sous » : l'interrupteur appartient à la ligne du dessus (Refacturable locataire sous ses charges).
function ToggleRow({ checked, onCheckedChange, title, description = undefined, sous = false }) {
  return (
    <label className={`${LIGNE} cursor-pointer ${sous ? "!min-h-0 pt-0" : ""}`}>
      <span className="min-w-0">
        <span className={`block ${sous ? "text-[12.5px] text-ardoise" : "text-craie"}`}>{title}</span>
        {description && <span className="mt-0.5 block text-[12.5px] leading-snug text-ardoise">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function FSelect({ label, value, onValueChange, children }) {
  return (
    <div className={LIGNE}>
      <span className="min-w-0 text-craie">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-auto w-[205px] flex-shrink-0 gap-1.5 border-none bg-transparent p-0 text-right text-[13.5px] text-encre focus:ring-0 [&>span]:ml-auto [&>span]:line-clamp-2"><SelectValue /></SelectTrigger>
        <SelectContent className="border-trait bg-surface text-encre">{children}</SelectContent>
      </Select>
    </div>
  );
}

// `colonnes` : dans le panneau au-dessus du simulateur d'un projet (13 nov. 2026, Jules), les parties sur deux colonnes.
export default function ProjectFormSimulateurTab({ formData, setFormData, travauxList, setTravauxList, colonnes = false }) {
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
    <div className={colonnes ? "grid items-start gap-3 lg:grid-cols-2" : "mt-6 space-y-3"}>
      <Bloc titre="1. Acquisition">
      <ToggleRow
        checked={modeNetVendeur}
        onCheckedChange={handleNetVendeurToggle}
        title="Mode Prix net vendeur"
        description="Entrez le prix net vendeur + honoraires agent → calcul automatique du prix FAI"
      />

      {modeNetVendeur ? (
        <>
            <Ligne label="Prix net vendeur (€)">
              <Saisie type="number" value={formData.sim_prix_net_vendeur || ''} onChange={(e) => handleNetVendeurChange("sim_prix_net_vendeur", parseFloat(e.target.value) || 0)} />
            </Ligne>
            <Ligne label="Surface pondérée (m²)">
              <Saisie type="number" value={formData.sim_surface || ''} onChange={(e) => setFormData({...formData, sim_surface: parseFloat(e.target.value) || 0})} />
            </Ligne>

            <SousTitre>Honoraires agent immobilier</SousTitre>
              <FSelect label="Mode de calcul" value={formData.sim_honoraires_agent_mode || "pct_ttc"} onValueChange={(v) => handleNetVendeurChange("sim_honoraires_agent_mode", v)}>
                <SelectItem value="pct_ttc">% du prix net vendeur — TTC</SelectItem>
                <SelectItem value="pct_ht">% du prix net vendeur — HT (+20% TVA)</SelectItem>
                <SelectItem value="fixe_ttc">Montant fixe TTC (€)</SelectItem>
                <SelectItem value="fixe_ht">Montant fixe HT (€) (+20% TVA)</SelectItem>
              </FSelect>
              <Ligne label={(formData.sim_honoraires_agent_mode || "pct_ttc").startsWith("pct") ? "Taux (%)" : "Montant HT (€)"}>
                <Saisie type="number" step="0.1" value={formData.sim_honoraires_agent_montant || ''} onChange={(e) => handleNetVendeurChange("sim_honoraires_agent_montant", parseFloat(e.target.value) || 0)} />
              </Ligne>
              <Calcule label="Honoraires TTC calculés">{honorairesAgent > 0 ? fmtEur(honorairesAgent) : "—"}</Calcule>
              <Calcule label="Prix FAI calculé (net vendeur + honoraires)">{prixFAI > 0 ? fmtEur(prixFAI) : "—"}</Calcule>
            <Ligne label="Prix du bien affiché FAI (€)">
              <Saisie type="number" value={formData.sim_prix_bien_fai || ''} onChange={(e) => setFormData({...formData, sim_prix_bien_fai: parseFloat(e.target.value) || 0})} />
            </Ligne>
            <Ligne label="Prix du bien négocié FAI (€)">
              <Saisie type="number" value={formData.sim_prix_bien_negocie || ''} onChange={(e) => setFormData({...formData, sim_prix_bien_negocie: parseFloat(e.target.value) || 0})} />
            </Ligne>
        </>
      ) : (
        <>
          <Ligne label="Prix du bien affiché FAI (€)">
            <Saisie type="number" value={formData.sim_prix_bien_fai || ''} onChange={(e) => setFormData({...formData, sim_prix_bien_fai: parseFloat(e.target.value) || 0})} />
          </Ligne>
          <Ligne label="Surface pondérée (m²)">
            <Saisie type="number" value={formData.sim_surface || ''} onChange={(e) => setFormData({...formData, sim_surface: parseFloat(e.target.value) || 0})} />
          </Ligne>
          <Ligne label="Prix du bien négocié FAI (€)">
            <Saisie type="number" value={formData.sim_prix_bien_negocie || ''} onChange={(e) => setFormData({...formData, sim_prix_bien_negocie: parseFloat(e.target.value) || 0})} />
          </Ligne>
        </>
      )}
      </Bloc>

      <Bloc titre="2. Location">
        <Ligne label="Loyer annuel initial HC HT (€)">
          <Saisie type="number" value={formData.sim_loyer_initial_ht || ''} onChange={(e) => setFormData({...formData, sim_loyer_initial_ht: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <Ligne label="Indexation annuelle des loyers (%)">
          <Saisie type="number" step="0.1" value={formData.sim_indexation_loyers || ''} onChange={(e) => setFormData({...formData, sim_indexation_loyers: parseFloat(e.target.value) || 0})} />
        </Ligne>
        {/* Chaque montant avec son interrupteur « refacturable », sans trait entre les deux (30 oct. 2026, Jules :
            « refacturable locataire » n'était pas en face des charges ou de la taxe). */}
        <Ligne attachee label="Charges de copropriété (€)">
          <Saisie type="number" value={formData.sim_charges_copropriete || ''} onChange={(e) => setFormData({...formData, sim_charges_copropriete: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <ToggleRow checked={formData.sim_charges_refacturable} onCheckedChange={(checked) => setFormData({...formData, sim_charges_refacturable: checked})} title="Refacturable locataire" sous />
        <Ligne attachee label="Taxe foncière (€)">
          <Saisie type="number" value={formData.sim_taxe_fonciere || ''} onChange={(e) => setFormData({...formData, sim_taxe_fonciere: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <ToggleRow checked={formData.sim_taxe_refacturable} onCheckedChange={(checked) => setFormData({...formData, sim_taxe_refacturable: checked})} title="Refacturable locataire" sous />
        <ToggleRow checked={formData.sim_loyer_soumis_tva} onCheckedChange={(checked) => setFormData({...formData, sim_loyer_soumis_tva: checked})} title="Loyer initial assujetti à TVA" />
      </Bloc>

      <Bloc titre="3. Revalorisation du loyer">
        <Ligne label="Année de revalorisation / déplafonnement">
          <Saisie type="number" value={formData.sim_annee_revalorisation || ''} onChange={(e) => setFormData({...formData, sim_annee_revalorisation: parseInt(e.target.value) || null})} />
        </Ligne>
        <Ligne label="Loyer annuel revalorisé / déplafonné HC HT (€)">
          <Saisie type="number" value={formData.sim_loyer_revalorise || ''} onChange={(e) => setFormData({...formData, sim_loyer_revalorise: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <ToggleRow checked={formData.sim_loyer_revalorise_tva || false} onCheckedChange={(checked) => setFormData({...formData, sim_loyer_revalorise_tva: checked})} title="Loyer revalorisé / déplafonné assujetti à TVA" />
        <Ligne label="Vacance locative prévisionnelle (mois/an)">
          <Saisie type="number" value={formData.sim_vacance_locative || ''} onChange={(e) => setFormData({...formData, sim_vacance_locative: parseFloat(e.target.value) || 0})} />
        </Ligne>
      </Bloc>

      <Bloc titre="4. Financement">
        <Ligne label="Apport / Fonds propres (€)">
          <Saisie type="number" value={formData.sim_apport || ''} onChange={(e) => setFormData({...formData, sim_apport: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <Ligne label="Durée du crédit bancaire initial (années)">
          <Saisie type="number" value={formData.sim_duree_credit || ''} onChange={(e) => setFormData({...formData, sim_duree_credit: parseInt(e.target.value) || 20})} />
        </Ligne>
        <Ligne label="Taux d'intérêt (%)">
          <Saisie type="number" step="0.01" value={formData.sim_taux_interet || ''} onChange={(e) => setFormData({...formData, sim_taux_interet: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <Ligne label="Taux de l'assurance crédit (%)">
          <Saisie type="number" step="0.01" value={formData.sim_taux_assurance || ''} onChange={(e) => setFormData({...formData, sim_taux_assurance: parseFloat(e.target.value) || 0})} />
        </Ligne>
      {/* Prêt in fine */}
      <ToggleRow
        checked={formData.sim_pret_in_fine ?? false}
        onCheckedChange={(checked) => setFormData({...formData, sim_pret_in_fine: checked})}
        title="Prêt in fine"
        description="Remboursement des intérêts uniquement chaque mois — le capital est remboursé en totalité la dernière année"
      />

      <SousTitre>Paramètres avancés (renégociation)</SousTitre>
        <Ligne label="Année de renégociation du crédit">
          <Saisie type="number" value={formData.sim_annee_renegociation || ''} onChange={(e) => setFormData({...formData, sim_annee_renegociation: e.target.value})} placeholder="Aucune" />
        </Ligne>
        <Ligne label="Taux d'intérêt renégocié (%)">
          <Saisie type="number" step="0.01" value={formData.sim_taux_renegocie || ''} onChange={(e) => setFormData({...formData, sim_taux_renegocie: e.target.value})} />
        </Ligne>
        <Ligne label="Indemnité de remboursement anticipé (mois)">
          <Saisie type="number" value={formData.sim_ira_mois || 0} onChange={(e) => setFormData({...formData, sim_ira_mois: e.target.value})} />
        </Ligne>
      </Bloc>

      <Bloc titre="5. Charges diverses">
        <Ligne label="Frais de création de société (€)">
          <Saisie type="number" value={formData.sim_cout_creation_societe || ''} onChange={(e) => setFormData({...formData, sim_cout_creation_societe: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <Ligne label="Frais de dossier bancaire (€)">
          <Saisie type="number" value={formData.sim_frais_dossier_bancaire || ''} onChange={(e) => setFormData({...formData, sim_frais_dossier_bancaire: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <Ligne label="Frais de courtage (€)">
          <Saisie type="number" value={formData.sim_frais_courtage || ''} onChange={(e) => setFormData({...formData, sim_frais_courtage: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <Ligne label="Comptabilité annuelle (€/an)">
          <Saisie type="number" value={formData.sim_comptabilite || ''} onChange={(e) => setFormData({...formData, sim_comptabilite: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <Ligne label="Assurance PNE (€/an)">
          <Saisie type="number" value={formData.sim_assurance_pne || ''} onChange={(e) => setFormData({...formData, sim_assurance_pne: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <Ligne label="Gestion locative TTC (%)">
          <Saisie type="number" step="0.1" value={formData.sim_gestion_locative || ''} onChange={(e) => setFormData({...formData, sim_gestion_locative: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <Ligne label="Charges diverses (€/an)">
          <Saisie type="number" value={formData.sim_charges_diverses || ''} onChange={(e) => setFormData({...formData, sim_charges_diverses: parseFloat(e.target.value) || 0})} />
        </Ligne>
      </Bloc>

      <Bloc titre="6. Travaux à la charge du bailleur">
      <SousTitre>Saisissez le montant des travaux pour chaque année (laisser vide si aucun travaux)</SousTitre>
      <div className="grid grid-cols-2 [&>*:nth-child(odd)]:border-r [&>*:nth-last-child(-n+2)]:border-b-0">
        {Array.from({ length: 20 }, (_, i) => i + 1).map((annee) => {
          const entry = travauxList.find(t => parseInt(t.annee) === annee);
          return (
            <Ligne key={annee} largeur="w-[72px]" label={`Année ${annee}`}>
              <Saisie
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
            </Ligne>
          );
        })}
      </div>
      </Bloc>

      <Bloc titre="7. Revente">
        <Ligne label="Année de revente">
          <Saisie type="number" value={formData.sim_annee_revente || ''} onChange={(e) => setFormData({...formData, sim_annee_revente: parseInt(e.target.value) || 20})} />
        </Ligne>
        <Ligne label="Honoraire agent pour la revente TTC (%)">
          <Saisie type="number" step="0.1" value={formData.sim_commission_agent_revente || ''} onChange={(e) => setFormData({...formData, sim_commission_agent_revente: parseFloat(e.target.value) || 0})} />
        </Ligne>
        <Ligne label="Rendement brut à la revente pour l'acquéreur (%)">
          <Saisie type="number" step="0.1" value={formData.sim_rendement_capital || ''} onChange={(e) => setFormData({...formData, sim_rendement_capital: parseFloat(e.target.value) || 0})} />
        </Ligne>
      </Bloc>

      <Bloc titre="8. Paramètres Administrateur">
        <ToggleRow checked={formData.sim_commission_agent_active ?? false} onCheckedChange={(checked) => setFormData({...formData, sim_commission_agent_active: checked})} title="Honoraires à la charge de l'acquéreur TTC" />
        {formData.sim_commission_agent_active && (
          <>
            <ToggleRow
              checked={formData.sim_commission_agent_inclus_fai ?? true}
              onCheckedChange={(checked) => setFormData({...formData, sim_commission_agent_inclus_fai: checked})}
              title="Honoraires inclus dans le prix FAI"
              description={(formData.sim_commission_agent_inclus_fai ?? true)
                ? "Les honoraires sont déjà compris dans le prix négocié FAI (déduits pour le calcul des droits d'enregistrement)"
                : "Les honoraires s'ajoutent en sus du prix négocié FAI (ajoutés au prix de revient total)"}
            />
              <FSelect label="Type honoraires charge acquéreur TTC" value={formData.sim_commission_agent_type || "pourcentage"} onValueChange={(value) => setFormData({...formData, sim_commission_agent_type: value})}>
                <SelectItem value="pourcentage">Pourcentage (%)</SelectItem>
                <SelectItem value="fixe">Montant fixe (€)</SelectItem>
              </FSelect>
              <Ligne label={`Honoraires charge acquéreur TTC ${formData.sim_commission_agent_type === "fixe" ? "(€)" : "(%)"}`}>
                <Saisie type="number" step="0.1" value={formData.sim_commission_agent || ''} onChange={(e) => setFormData({...formData, sim_commission_agent: parseFloat(e.target.value) || 0})} />
              </Ligne>
          </>
        )}
        <Ligne label="Droits d'enregistrement (%)">
          <Saisie type="number" step="0.1" value={formData.sim_droits_enregistrement || ''} onChange={(e) => setFormData({...formData, sim_droits_enregistrement: parseFloat(e.target.value) || 0})} />
        </Ligne>
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
          <Ligne label={`Fees Klocka TTC ${formData.sim_fees_klocka_type === "fixe" ? "(€)" : "(%)"}`}>
            <Saisie type="number" step="0.1" value={formData.sim_fees_klocka || ''} onChange={(e) => setFormData({...formData, sim_fees_klocka: parseFloat(e.target.value) || 0})} />
          </Ligne>
          <Ligne label="Incentive Klocka TTC (%)">
            <Saisie type="number" step="0.1" value={formData.sim_incentive_klocka || ''} onChange={(e) => setFormData({...formData, sim_incentive_klocka: parseFloat(e.target.value) || 0})} />
          </Ligne>
        </>)}
      </Bloc>
    </div>
  );
}