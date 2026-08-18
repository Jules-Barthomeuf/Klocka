import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus, Trash2, Sparkles, Loader2, ArrowRight, Pencil, ClipboardCheck, CheckCircle2, X } from
"lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import DoubleCheckTable from "@/components/admin/DoubleCheckTable";

const EMPTY_CHECK_DATA = () => {
  const fields = [
  "adresse", "lien_annonce", "prix_vente_fai", "cause_vente", "offre_deja_soumise",
  "vendeur_indivision", "marchand_biens_vendus",
  "agent_nom", "agent_email", "agent_telephone",
  "bail", "tva", "anciennete_locataire", "activite_locataire",
  "loyer_ht_hc", "charges", "taxe_fonciere", "quittance_loyer",
  "depot_garantie", "caution_cession", "droit_entree", "vente_fonds_commerce",
  "copro_travaux", "copro_problemes",
  "surface_ponderee"];

  const data = {};
  fields.forEach((f) => {data[f] = { ia: "", human: "" };});
  return data;
};

export default function AdminBrouillons() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [titre, setTitre] = useState("");
  const [checkData, setCheckData] = useState(EMPTY_CHECK_DATA());
  const [notesLibres, setNotesLibres] = useState("");
  const [isConverting, setIsConverting] = useState(null);
  const [isRunningAI, setIsRunningAI] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["brouillons"],
    queryFn: () => base44.entities.Brouillon.filter({ statut: "en_cours" }, "-created_date")
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Brouillon.create(data),
    onSuccess: () => {queryClient.invalidateQueries({ queryKey: ["brouillons"] });toast.success("Check créé");closeDialog();}
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Brouillon.update(id, data),
    onSuccess: () => {queryClient.invalidateQueries({ queryKey: ["brouillons"] });toast.success("Check mis à jour");closeDialog();}
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Brouillon.delete(id),
    onSuccess: () => {queryClient.invalidateQueries({ queryKey: ["brouillons"] });toast.success("Supprimé");}
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingItem(null);
    setTitre("");
    setCheckData(EMPTY_CHECK_DATA());
    setNotesLibres("");
  };

  const openCreate = () => {closeDialog();setIsDialogOpen(true);};

  const openEdit = (item) => {
    setEditingItem(item);
    setTitre(item.titre || "");
    setCheckData(item.check_data || EMPTY_CHECK_DATA());
    setNotesLibres(item.notes_libres || "");
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!titre.trim()) {toast.error("Le titre est obligatoire");return;}
    const payload = { titre, check_data: checkData, notes_libres: notesLibres, statut: "en_cours" };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleRunAI = async (itemId, item) => {
    setIsRunningAI(itemId);
    try {
      const cd = item.check_data || {};
      const adresse = cd.adresse?.human || cd.adresse?.ia || "";
      const allHumanNotes = Object.entries(cd).
      filter(([, v]) => v.human).
      map(([k, v]) => `${k}: ${v.human}`).
      join("\n");

      const prompt = `Tu es un expert en immobilier commercial. Voici des informations brutes sur un bien immobilier. Remplis le maximum de champs avec les données disponibles.

ADRESSE: ${adresse}
NOTES LIBRES: ${item.notes_libres || ""}
DONNÉES HUMAINES:
${allHumanNotes}

Retourne un JSON avec ces clés (mets une chaîne vide "" si non disponible):
adresse, prix_vente_fai, cause_vente, offre_deja_soumise, vendeur_indivision, marchand_biens_vendus, bail, tva, anciennete_locataire, activite_locataire, loyer_ht_hc, charges, taxe_fonciere, quittance_loyer, depot_garantie, caution_cession, droit_entree, vente_fonds_commerce, copro_travaux, copro_problemes, surface_ponderee

Réponds UNIQUEMENT avec le JSON.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            adresse: { type: "string" }, prix_vente_fai: { type: "string" },
            cause_vente: { type: "string" }, offre_deja_soumise: { type: "string" },
            vendeur_indivision: { type: "string" }, marchand_biens_vendus: { type: "string" },
            bail: { type: "string" }, tva: { type: "string" },
            anciennete_locataire: { type: "string" }, activite_locataire: { type: "string" },
            loyer_ht_hc: { type: "string" }, charges: { type: "string" },
            taxe_fonciere: { type: "string" }, quittance_loyer: { type: "string" },
            depot_garantie: { type: "string" }, caution_cession: { type: "string" },
            droit_entree: { type: "string" }, vente_fonds_commerce: { type: "string" },
            copro_travaux: { type: "string" }, copro_problemes: { type: "string" },
            surface_ponderee: { type: "string" }
          }
        }
      });

      const updatedData = { ...(item.check_data || EMPTY_CHECK_DATA()) };
      Object.keys(result).forEach((key) => {
        if (result[key] && updatedData[key]) {
          updatedData[key] = { ...updatedData[key], ia: result[key] };
        }
      });

      await base44.entities.Brouillon.update(itemId, { check_data: updatedData });
      queryClient.invalidateQueries({ queryKey: ["brouillons"] });
      toast.success("Check N°1 (IA) rempli !");
    } catch (error) {
      toast.error("Erreur IA: " + (error.message || ""));
    } finally {
      setIsRunningAI(null);
    }
  };

  const handleConvert = async (item) => {
    setIsConverting(item.id);
    try {
      const cd = item.check_data || {};
      const projectData = {
        titre: item.titre || cd.adresse?.human || cd.adresse?.ia || "Nouveau projet",
        adresse_complete: cd.adresse?.human || cd.adresse?.ia || "",
        statut: "prospect",
        sim_prix_bien_fai: parseFloat((cd.prix_vente_fai?.human || cd.prix_vente_fai?.ia || "").replace(/[^\d.]/g, "")) || 0,
        nom_locataire: cd.activite_locataire?.human || cd.activite_locataire?.ia || "",
        sim_loyer_initial_ht: parseFloat((cd.loyer_ht_hc?.human || cd.loyer_ht_hc?.ia || "").replace(/[^\d.]/g, "")) || 0,
        sim_charges_copropriete: parseFloat((cd.charges?.human || cd.charges?.ia || "").replace(/[^\d.]/g, "")) || 0,
        sim_taxe_fonciere: parseFloat((cd.taxe_fonciere?.human || cd.taxe_fonciere?.ia || "").replace(/[^\d.]/g, "")) || 0,
        sim_surface: parseFloat((cd.surface_ponderee?.human || cd.surface_ponderee?.ia || "").replace(/[^\d.]/g, "")) || 0,
        bail_depot_garantie: parseFloat((cd.depot_garantie?.human || cd.depot_garantie?.ia || "").replace(/[^\d.]/g, "")) || 0,
        bail_droit_entree: parseFloat((cd.droit_entree?.human || cd.droit_entree?.ia || "").replace(/[^\d.]/g, "")) || 0
      };

      const newProject = await base44.entities.Project.create(projectData);
      await base44.entities.Brouillon.update(item.id, { statut: "converti", projet_id: newProject.id });
      queryClient.invalidateQueries({ queryKey: ["brouillons"] });
      queryClient.invalidateQueries({ queryKey: ["all-projects"] });
      toast.success("Projet créé !", {
        action: { label: "Voir", onClick: () => navigate("/AdminProjets") }
      });
    } catch (error) {
      toast.error("Erreur: " + (error.message || ""));
    } finally {
      setIsConverting(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c0c] text-[#edeae5] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <p className="text-[#35a79b] uppercase tracking-[0.3em] text-[11px] font-medium mb-2">Administration</p>
            <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#edeae5]">Double Check</h1>
          </div>
          <button onClick={openCreate}
          className="group flex items-center gap-3 bg-[#35a79b]/10 border border-[#35a79b]/30 hover:bg-[#35a79b]/20 hover:border-[#35a79b]/50 text-[#edeae5] px-6 py-3 rounded-md transition-all duration-300">
            <div className="w-9 h-9 bg-[#35a79b]/20 rounded-lg flex items-center justify-center group-hover:bg-[#35a79b]/30 transition-colors">
              <Plus className="w-5 h-5 text-[#35a79b]" />
            </div>
            <span className="text-sm font-medium">Nouveau check</span>
          </button>
        </div>

        {/* Stats */}
        <div className="bg-[#0a0c0c] rounded-md border border-[#242726] px-5 py-3 mb-6 inline-flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-[#35a79b]" />
          <span className="text-[#9aa19e] text-sm">{items.length} check{items.length !== 1 ? "s" : ""} en cours</span>
        </div>

        {/* List */}
        {isLoading ?
        <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#35a79b] animate-spin" />
          </div> :
        items.length === 0 ?
        <div className="text-center py-20">
            <div className="w-20 h-20 bg-[#edeae5]/[0.03] rounded-md flex items-center justify-center mx-auto mb-6">
              <ClipboardCheck className="w-10 h-10 text-[#4a4d4b]" />
            </div>
            <h2 className="text-xl font-light text-[#edeae5] mb-2">Aucun double check</h2>
            <p className="text-[#6b7270] mb-6 text-sm">Créez un check pour analyser un nouveau bien</p>
            <button onClick={openCreate}
          className="inline-flex items-center gap-2 bg-[#35a79b]/10 border border-[#35a79b]/30 hover:bg-[#35a79b]/20 text-[#edeae5] px-5 py-2.5 rounded-md transition-all text-sm">
              <Plus className="w-4 h-4 text-[#35a79b]" /> Nouveau check
            </button>
          </div> :

        <div className="space-y-3">
            {items.map((item) => {
            const cd = item.check_data || {};
            const adresse = cd.adresse?.human || cd.adresse?.ia || "Adresse non renseignée";
            const filledCount = Object.values(cd).filter((v) => v.ia || v.human).length;
            const totalCount = Object.keys(cd).length || 21;
            const date = new Date(item.created_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

            return (
              <div key={item.id} className="bg-[#0a0c0c] rounded-md border border-[#242726] hover:border-[#edeae5]/[0.10] transition-all p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-[#edeae5] font-medium text-sm truncate">{item.titre}</h3>
                        <span className="text-[#6b7270] text-xs flex-shrink-0">{date}</span>
                      </div>
                      <p className="text-[#8b9391] text-xs mb-3">{adresse}</p>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-1.5 flex-1 max-w-[200px] bg-[#edeae5]/[0.04] rounded-full overflow-hidden">
                          <div className="h-full bg-[#35a79b] rounded-full transition-all" style={{ width: `${filledCount / totalCount * 100}%` }} />
                        </div>
                        <span className="text-[#6b7270] text-[10px]">{filledCount}/{totalCount}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => openEdit(item)}
                      className="flex items-center gap-1.5 text-[#9aa19e] hover:text-[#edeae5] text-xs px-3 py-1.5 rounded-lg bg-[#edeae5]/[0.03] hover:bg-[#edeae5]/[0.06] transition-all">
                          <Pencil className="w-3 h-3" /> Éditer
                        </button>
                        {!item.projet_id && <button onClick={() => handleRunAI(item.id, item)} disabled={isRunningAI === item.id}
                      className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/15 transition-all disabled:opacity-50">
                          {isRunningAI === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          Check IA
                        </button>}
                        <button onClick={() => handleConvert(item)} disabled={isConverting === item.id}
                      className="flex items-center gap-1.5 text-[#35a79b] hover:text-[#35a79b]/80 text-xs px-3 py-1.5 rounded-lg bg-[#35a79b]/10 hover:bg-[#35a79b]/15 transition-all disabled:opacity-50">
                          {isConverting === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                          Créer projet
                        </button>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => {if (window.confirm("Supprimer ?")) deleteMutation.mutate(item.id);}}
                  className="text-[#6b7270] hover:text-red-400 hover:bg-red-500/10 h-8 w-8 flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>);

          })}
          </div>
        }
      </div>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {if (!open) closeDialog();else setIsDialogOpen(true);}}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[#0a0c0c] border-[#282b2a]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-light text-[#edeae5]">
                {editingItem ? "Modifier le check" : "Nouveau double check"}
              </DialogTitle>
              <Button variant="ghost" size="icon" onClick={closeDialog} className="text-[#8b9391] hover:text-[#edeae5] hover:bg-[#edeae5]/5 h-8 w-8 -mr-2">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-5 mt-4">
            <div className="space-y-2">
              <label className="text-[#edeae5] text-sm font-medium">Titre / Référence</label>
              <Input value={titre} onChange={(e) => setTitre(e.target.value)}
              placeholder="Ex: 45 rue de la République - Lyon" className="bg-[#171918] text-[#edeae5] px-3 py-1 text-base rounded-md flex w-full border shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm border-[#282b2a] h-11" />
              
            </div>

            <DoubleCheckTable checkData={checkData} onChange={setCheckData} />

            <div className="space-y-2">
              <label className="text-[#edeae5] text-sm font-medium">Notes libres</label>
              <Textarea value={notesLibres} onChange={(e) => setNotesLibres(e.target.value)}
              placeholder="Ajoutez vos notes ici..."
              className="bg-[#0a0c0c] text-[#edeae5] border-[#282b2a] min-h-[150px]" rows={8} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#242726]">
            <Button variant="ghost" onClick={closeDialog} className="text-[#9aa19e] hover:text-[#edeae5]">Annuler</Button>
            <Button onClick={handleSave} disabled={!titre.trim() || createMutation.isPending || updateMutation.isPending}
            className="bg-[#35a79b]/15 border border-[#35a79b]/30 hover:bg-[#35a79b]/25 text-[#edeae5]">
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <CheckCircle2 className="w-4 h-4 mr-1 text-[#35a79b]" />
              {editingItem ? "Mettre à jour" : "Créer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>);

}