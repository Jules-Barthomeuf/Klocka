import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Landmark, Trash2, Loader2, Link2, ExternalLink, Pencil, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import BankPitchGenerator from "@/components/banque/BankPitchGenerator";

export default function AdminBanque() {
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [editLinkId, setEditLinkId] = useState(null);
  const [linkValue, setLinkValue] = useState("");

  const { data: users = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["all-projects"],
    queryFn: () => base44.entities.Project.list("-created_date"),
  });

  const { data: presentations = [], isLoading } = useQuery({
    queryKey: ["presentations-bancaires"],
    queryFn: () => base44.entities.PresentationBancaire.list("-created_date"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PresentationBancaire.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presentations-bancaires"] });
      toast.success("Présentation supprimée");
    },
  });

  const clientProjects = projects.filter((p) =>
    selectedClient && (p.client_email === selectedClient || (p.client_emails || []).includes(selectedClient))
  );

  const selectedProjectData = projects.find((p) => p.id === selectedProject);
  const selectedClientData = users.find((u) => u.email === selectedClient);

  const handleSaveLink = async (presId) => {
    await base44.entities.PresentationBancaire.update(presId, { pptx_url: linkValue });
    queryClient.invalidateQueries({ queryKey: ["presentations-bancaires"] });
    toast.success("Lien enregistré !");
    setEditLinkId(null);
    setLinkValue("");
  };

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[#9298a6] uppercase tracking-[0.3em] text-[11px] font-medium mb-2">Administration</p>
          <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#f2f3f5]">Présentations bancaires</h1>
        </div>

        {/* Générateur de texte pour présentation */}
        <div className="bg-[#000000] rounded-md border border-[#1f2228] p-6 mb-8">
          <h2 className="text-[#f2f3f5] text-lg font-light mb-1 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#9298a6]" /> Générer le contenu des slides
          </h2>
          <p className="text-[#9298a6] text-xs mb-5">Sélectionnez un client et un projet — le contenu prêt-à-copier pour chaque slide est généré automatiquement.</p>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-[#9298a6] text-xs uppercase tracking-wider mb-2">Client</p>
              <Select value={selectedClient} onValueChange={(v) => { setSelectedClient(v); setSelectedProject(""); }}>
                <SelectTrigger className="bg-[#000000] border-[#1f2228] text-[#f2f3f5] h-11">
                  <SelectValue placeholder="Sélectionner un client" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((c) => (
                    <SelectItem key={c.id} value={c.email}>
                      {c.full_name ? `${c.full_name} (${c.email})` : c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[#9298a6] text-xs uppercase tracking-wider mb-2">Projet</p>
              <Select value={selectedProject} onValueChange={setSelectedProject} disabled={!selectedClient}>
                <SelectTrigger className="bg-[#000000] border-[#1f2228] text-[#f2f3f5] h-11">
                  <SelectValue placeholder={selectedClient ? "Sélectionner un projet" : "Choisir un client d'abord"} />
                </SelectTrigger>
                <SelectContent>
                  {clientProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.titre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedProjectData ? (
            <BankPitchGenerator project={selectedProjectData} client={selectedClientData} />
          ) : (
            <div className="text-center py-10 border border-dashed border-[#1f2228] rounded-md text-[#6a7180] text-sm">
              Sélectionnez un client et un projet pour générer le contenu
            </div>
          )}
        </div>

        {/* Présentations existantes */}
        <div>
          <h2 className="text-[#f2f3f5] text-lg font-light mb-4">Présentations existantes</h2>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[#9298a6]" />
            </div>
          ) : presentations.length === 0 ? (
            <div className="text-center py-16 bg-[#000000] rounded-md border border-[#1f2228]">
              <Landmark className="w-10 h-10 text-[#3a3f4a] mx-auto mb-3" />
              <p className="text-[#9298a6] text-sm">Aucune présentation créée</p>
              <p className="text-[#6a7180] text-xs mt-1">Générez un prompt ci-dessus pour commencer.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {presentations.map((pres) => (
                <div key={pres.id} className="bg-[#000000] rounded-md border border-[#1f2228] p-4 hover:border-[#22262d] transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-[#f2f3f5] font-light truncate">{pres.project_title}</p>
                      <p className="text-[#9298a6] text-xs mt-0.5">
                        {pres.client_name || pres.client_email} — {new Date(pres.created_date).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3">
                      {pres.pptx_url && (
                        <a
                          href={pres.pptx_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#9298a6] hover:text-[#f2f3f5] h-8 w-8 inline-flex items-center justify-center"
                          title="Ouvrir la présentation"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditLinkId(pres.id);
                          setLinkValue(pres.pptx_url || "");
                        }}
                        className={`h-8 w-8 ${pres.pptx_url ? "text-[#8fa0f2]" : "text-[#9298a6] hover:text-[#a9c5b9]"}`}
                        title={pres.pptx_url ? "Modifier le lien" : "Ajouter un lien de présentation"}
                      >
                        {pres.pptx_url ? <Pencil className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { if (confirm("Supprimer cette présentation ?")) deleteMutation.mutate(pres.id); }}
                        className="text-[#9298a6] hover:text-red-400 h-8 w-8"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Lien de la présentation */}
                  {pres.pptx_url && editLinkId !== pres.id && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#f2f3f5]/[0.05] border border-[#22262d]">
                      <Link2 className="w-3.5 h-3.5 text-[#9298a6] flex-shrink-0" />
                      <a href={pres.pptx_url} target="_blank" rel="noopener noreferrer" className="text-[#c8cfcd] text-xs truncate hover:underline">
                        {pres.pptx_url}
                      </a>
                    </div>
                  )}

                  {/* Edit link inline */}
                  {editLinkId === pres.id && (
                    <div className="mt-3 flex items-center gap-2">
                      <Input
                        value={linkValue}
                        onChange={(e) => setLinkValue(e.target.value)}
                        placeholder="Coller le lien Google Slides ou .pptx ici..."
                        className="bg-[#000000] border-[#f2f3f5]/[0.1] text-[#f2f3f5] text-xs h-9 flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveLink(pres.id)}
                        disabled={!linkValue.trim()}
                        className="bg-[#f2f3f5]/[0.06] border border-[#2c3139] hover:bg-[#f2f3f5]/[0.1] text-[#f2f3f5] text-xs h-9 px-4"
                      >
                        Enregistrer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditLinkId(null); setLinkValue(""); }}
                        className="text-[#9298a6] text-xs h-9"
                      >
                        Annuler
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}