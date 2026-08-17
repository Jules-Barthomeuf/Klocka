import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, CheckCircle2, Loader2, Eye, Layers, Save, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import ProjectFormLocataireTab from "./ProjectFormLocataireTab";
import ProjectFormInfoTab from "./ProjectFormInfoTab";
import ProjectFormDocumentsTab from "./ProjectFormDocumentsTab";
import ProjectFormDiagnosticsTab from "./ProjectFormDiagnosticsTab";
import ProjectFormSimulateurTab from "./ProjectFormSimulateurTab";
import ProjectFormImagesTab from "./ProjectFormImagesTab";
import ProjectFormCoproTab from "./ProjectFormCoproTab";
import ProjectFormSwotTab from "./ProjectFormSwotTab";
import ProjectFormMarcheTab from "./ProjectFormMarcheTab";
import ProjectFormEnvironnementTab from "./ProjectFormEnvironnementTab";

const EMPTY_FORM = {
  titre: "", client_email: "", client_emails: [], prix_acquisition: 0, rendement_locatif: 0,
  adresse_complete: "", statut: "prospect", latitude: null, longitude: null, documents: [],
  ville_secteur_champ1: "", ville_secteur_champ2: "", ville_secteur_champ3: "",
  description_ville: "", description_secteur: "",
  bien_champ1: "", bien_champ2: "", bien_champ3: "", description_bien: "",
  nom_locataire: "", activite_locataire: "", locataire_depuis: "",
  loyer_annuel_ht: 0, echeance_bail: "", loyer_m2_an: 0, analyse_bail: "",
  quote_part_lot: 0, charges_copropriete: 0, activites_autorisees: "", activites_interdites: "",
  type_construction: "", taxe_fonciere_an: 0, photos: [], surface_m2: 0,
  synthese_assemblee_generale: "", provision_charges: 0,
  resolutions_votees: "", resolutions_refusees: "",
  assemblees_generales: [], notes_libres: [], notes_secteur: [], notes_bien: [],
  notes_locataire: [], notes_marche: [], notes_diagnostique: [], bail_admin_fields: [],
  fichiers_projet: [], swot_liens: [], swot_data: null,
  dpe_note: "", dpe_consommation: 0, ges_note: "", ges_emission: 0,
  marche_quartier_nom: "", marche_prix_m2_median: 0, marche_prix_m2_bas: 0, marche_prix_m2_haut: 0,
  marche_evolution_1an: 0, marche_evolution_5ans: 0,
  marche_offre_bas: 0, marche_offre_moyenne: 0, marche_offre_haut: 0,
  marche_baux_bas: 0, marche_baux_moyenne: 0, marche_baux_haut: 0, marche_secteurs: [],
  sim_commission_agent_inclus_fai: true, sim_surface: 0, sim_loyer_initial_ht: 0,
  sim_loyer_soumis_tva: false, sim_charges_copropriete: 0, sim_charges_refacturable: true,
  sim_taxe_fonciere: 0, sim_taxe_refacturable: true, sim_taux_tva: 20, sim_etage: 0,
  sim_type_detention: "", sim_prix_bien_fai: 0, sim_prix_bien_negocie: 0, sim_prix_hors_droits: 0,
  sim_commission_agent_active: false, sim_commission_agent: 5, sim_commission_agent_type: "pourcentage",
  sim_droits_enregistrement: 8, sim_fees_klocka: 8, sim_fees_klocka_type: "pourcentage",
  sim_incentive_klocka: 20, sim_total_frais_klocka: 0, sim_frais_dossier_bancaire: 1000,
  sim_cout_creation_societe: 1000, sim_frais_courtage: 0, sim_frais_divers_acquisition: 2000,
  sim_prix_revient: 0, sim_montant_credit: 0, sim_duree_credit: 20, sim_taux_interet: 3.7,
  sim_taux_assurance: 0.25, sim_apport: 0, sim_total_financement: 0,
  sim_type_revente: "", sim_surface_revente: 0, sim_annee_revente: 20,
  sim_loyer_ht_revente: 0, sim_valeur_net_comptable: 0, sim_prix_vente_fai: 0,
  sim_commission_agent_revente: 0, sim_prix_vente_net: 0,
  sim_rendement_locatif_global_net: 0, sim_rendement_capital: 0, sim_rendement_global: 0,
  sim_cashflow_cumule: 0, sim_marge_brute_revente: 0, sim_creation_richesse_brute: 0,
  sim_creation_richesse_nette: 0, sim_multiple_fonds_propres: 0,
  sim_rendement_brut_fonds_propres: 0, sim_rendement_net_fonds_propres: 0,
  sim_indexation_loyers: 2, sim_fichier_excel: "", sim_lien_google_sheets: "",
  sim_fichier_pdf: "", presentation_google_slides: "",
  sim_annee_revalorisation: null, sim_loyer_revalorise: 0, sim_loyer_revalorise_tva: false,
  sim_vacance_locative: 0, sim_annee_renegociation: null, sim_taux_renegocie: 0,
  sim_ira_mois: 0, sim_comptabilite: 600, sim_assurance_pne: 400,
  sim_gestion_locative: 0, sim_charges_diverses: 0,
};

function projectToFormData(project) {
  if (!project) return { ...EMPTY_FORM };
  const fd = {};
  for (const key of Object.keys(EMPTY_FORM)) {
    fd[key] = project[key] !== undefined && project[key] !== null ? project[key] : EMPTY_FORM[key];
  }
  return fd;
}

export default function ShadowEditorDialog({ open, onOpenChange, project, shadowRecord, users, initialTab, initialViewMode }) {
  const [viewMode, setViewMode] = useState("shadow");
  const [activeTab, setActiveTab] = useState("informations");
  const [shadowFormData, setShadowFormData] = useState({ ...EMPTY_FORM });
  const [currentFormData, setCurrentFormData] = useState({ ...EMPTY_FORM });
  const [travauxList, setTravauxList] = useState([]);
  const [currentTravauxList, setCurrentTravauxList] = useState([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      // Init shadow data
      if (shadowRecord?.shadow_data) {
        setShadowFormData(projectToFormData(shadowRecord.shadow_data));
        const travaux = [];
        const sd = shadowRecord.shadow_data;
        for (let i = 1; i <= 5; i++) {
          if (sd[`sim_travaux_annee${i}`] && sd[`sim_travaux_montant${i}`]) {
            travaux.push({ annee: sd[`sim_travaux_annee${i}`], montant: sd[`sim_travaux_montant${i}`] });
          }
        }
        setTravauxList(travaux);
      } else {
        setShadowFormData({ ...EMPTY_FORM });
        setTravauxList([]);
      }
      // Init current project data
      setCurrentFormData(projectToFormData(project));
      const cTravaux = [];
      if (project) {
        for (let i = 1; i <= 5; i++) {
          if (project[`sim_travaux_annee${i}`] && project[`sim_travaux_montant${i}`]) {
            cTravaux.push({ annee: project[`sim_travaux_annee${i}`], montant: project[`sim_travaux_montant${i}`] });
          }
        }
      }
      setCurrentTravauxList(cTravaux);
      setViewMode(initialViewMode || "shadow");
      setActiveTab(initialTab || "informations");
    }
  }, [open, shadowRecord, project, initialTab, initialViewMode]);

  const saveShadowMutation = useMutation({
    mutationFn: async (data) => {
      const travauxData = {};
      travauxList.forEach((t, idx) => {
        if (idx < 5 && t.annee && t.montant) {
          travauxData[`sim_travaux_annee${idx + 1}`] = parseInt(t.annee);
          travauxData[`sim_travaux_montant${idx + 1}`] = parseFloat(t.montant);
        }
      });
      const shadowData = { ...data, ...travauxData };

      if (shadowRecord) {
        return base44.entities.ShadowProject.update(shadowRecord.id, { shadow_data: shadowData });
      } else {
        const me = await base44.auth.me();
        return base44.entities.ShadowProject.create({
          project_id: project.id,
          shadow_data: shadowData,
          created_by_admin: me.email
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shadow-projects'] });
      toast.success("Shadow enregistré !");
    }
  });

  const saveCurrentMutation = useMutation({
    mutationFn: async (data) => {
      const travauxData = {};
      currentTravauxList.forEach((t, idx) => {
        if (idx < 5 && t.annee && t.montant) {
          travauxData[`sim_travaux_annee${idx + 1}`] = parseInt(t.annee);
          travauxData[`sim_travaux_montant${idx + 1}`] = parseFloat(t.montant);
        }
      });
      return base44.entities.Project.update(project.id, { ...data, ...travauxData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success("Projet actuel mis à jour !");
    }
  });

  const handleSaveShadow = () => {
    saveShadowMutation.mutate(shadowFormData);
  };

  const handleSaveCurrent = () => {
    saveCurrentMutation.mutate(currentFormData);
  };

  const formData = viewMode === "current" ? currentFormData : shadowFormData;
  const setFormData = viewMode === "current" ? setCurrentFormData : setShadowFormData;
  const activeTravauxList = viewMode === "current" ? currentTravauxList : travauxList;
  const setActiveTravauxList = viewMode === "current" ? setCurrentTravauxList : setTravauxList;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-[#050505] border-[#1c2725]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-400 uppercase tracking-[0.2em] text-[10px] font-medium mb-1">Shadow Mode</p>
              <DialogTitle className="text-2xl font-light text-white tracking-tight">
                {project?.titre}
              </DialogTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="text-gray-500 hover:text-white hover:bg-white/5">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* View mode toggle + copy button */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setViewMode("current")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md border text-sm transition-all ${
              viewMode === "current"
                ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                : "bg-[#0a0f0e] border-[#16201f] text-gray-500 hover:text-white"
            }`}
          >
            <Eye className="w-4 h-4" />
            Projet actuel
            {viewMode === "current" && <span className="text-[10px] bg-blue-500/20 px-2 py-0.5 rounded-full">Édition</span>}
          </button>
          <button
            onClick={() => setViewMode("shadow")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md border text-sm transition-all ${
              viewMode === "shadow"
                ? "bg-purple-500/15 border-purple-500/40 text-purple-400"
                : "bg-[#0a0f0e] border-[#16201f] text-gray-500 hover:text-white"
            }`}
          >
            <Layers className="w-4 h-4" />
            Shadow
            {viewMode === "shadow" && <span className="text-[10px] bg-purple-500/20 px-2 py-0.5 rounded-full">Édition</span>}
          </button>
        </div>

        {viewMode === "shadow" && (
          <button
            onClick={() => {
              setShadowFormData({ ...currentFormData });
              setTravauxList([...currentTravauxList]);
              toast.success("Données du projet actuel copiées dans le Shadow");
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 mb-4 rounded-md border border-dashed border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 text-purple-400 text-xs transition-all"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            Copier les données du projet actuel dans le Shadow
          </button>
        )}

        {/* Form tabs */}
        <div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-10 bg-[#0a0f0e] border border-[#16201f] rounded-md p-1">
              <TabsTrigger value="informations" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-[11px] rounded-lg">Infos</TabsTrigger>
              <TabsTrigger value="environnement" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-[11px] rounded-lg">Env.</TabsTrigger>
              <TabsTrigger value="secteur" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-[11px] rounded-lg">Secteur</TabsTrigger>
              <TabsTrigger value="locataire" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-[11px] rounded-lg">Locataire</TabsTrigger>
              <TabsTrigger value="copropriete" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-[11px] rounded-lg">Copro</TabsTrigger>
              <TabsTrigger value="marche" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-[11px] rounded-lg">Marché</TabsTrigger>
              <TabsTrigger value="diagnostique" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-[11px] rounded-lg">Diag</TabsTrigger>
              <TabsTrigger value="docs_projet" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-[11px] rounded-lg">Docs</TabsTrigger>
              <TabsTrigger value="images" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-[11px] rounded-lg">Images</TabsTrigger>
              <TabsTrigger value="simulateur" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-[11px] rounded-lg">Simu</TabsTrigger>
            </TabsList>

            <TabsContent value="informations"><ProjectFormInfoTab formData={formData} setFormData={setFormData} users={users || []} /></TabsContent>
            <TabsContent value="environnement"><ProjectFormEnvironnementTab formData={formData} setFormData={setFormData} /></TabsContent>
            <TabsContent value="secteur" className="space-y-6 mt-6">
              <div className="space-y-4">
                {/* Minimal secteur inline - same structure as AdminProjets */}
                <p className="text-gray-400 text-sm">Utilisez les onglets Infos / Locataire / Copro pour les champs principaux.</p>
              </div>
            </TabsContent>
            <TabsContent value="locataire"><ProjectFormLocataireTab formData={formData} setFormData={setFormData} /></TabsContent>
            <TabsContent value="copropriete"><ProjectFormCoproTab formData={formData} setFormData={setFormData} /></TabsContent>
            <TabsContent value="marche"><ProjectFormMarcheTab formData={formData} setFormData={setFormData} /></TabsContent>
            <TabsContent value="diagnostique"><ProjectFormDiagnosticsTab formData={formData} setFormData={setFormData} /></TabsContent>
            <TabsContent value="docs_projet"><ProjectFormDocumentsTab formData={formData} setFormData={setFormData} /></TabsContent>
            <TabsContent value="images"><ProjectFormImagesTab formData={formData} setFormData={setFormData} /></TabsContent>
            <TabsContent value="simulateur"><ProjectFormSimulateurTab formData={formData} setFormData={setFormData} travauxList={activeTravauxList} setTravauxList={setActiveTravauxList} /></TabsContent>
          </Tabs>
        </div>

        {/* Save button */}
        <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-[#16201f]">
          <button onClick={() => onOpenChange(false)} className="px-5 py-2.5 text-gray-400 hover:text-white text-sm transition-colors">Annuler</button>
          {viewMode === "shadow" ? (
            <button
              onClick={handleSaveShadow}
              disabled={saveShadowMutation.isPending}
              className="flex items-center gap-2 bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 text-white px-6 py-2.5 rounded-md transition-all text-sm disabled:opacity-40"
            >
              {saveShadowMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" />Enregistrement...</>
                : <><CheckCircle2 className="w-4 h-4 text-purple-400" />Enregistrer Shadow</>
              }
            </button>
          ) : (
            <button
              onClick={handleSaveCurrent}
              disabled={saveCurrentMutation.isPending}
              className="flex items-center gap-2 bg-blue-500/15 border border-blue-500/30 hover:bg-blue-500/25 text-white px-6 py-2.5 rounded-md transition-all text-sm disabled:opacity-40"
            >
              {saveCurrentMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" />Enregistrement...</>
                : <><Save className="w-4 h-4 text-blue-400" />Enregistrer Projet</>
              }
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}