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
    <div className="min-h-screen bg-[#0a0c0c] text-[#edeae5] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[#35a79b] uppercase tracking-[0.3em] text-[11px] font-medium mb-2">Administration</p>
          <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#edeae5]">Présentations bancaires</h1>
        </div>

        {/* Générateur de texte pour présentation */}
        <div className="bg-[#0a0c0c] rounded-md border border-[#242726] p-6 mb-8">
          <h2 className="text-[#edeae5] text-lg font-light mb-1 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#35a79b]" /> Générer le contenu des slides
          </h2>
          <p className="text-[#8b9391] text-xs mb-5">Sélectionnez un client et un projet — le contenu prêt-à-copier pour chaque slide est généré automatiquement.</p>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-[#8b9391] text-xs uppercase tracking-wider mb-2">Client</p>
              <Select value={selectedClient} onValueChange={(v) => { setSelectedClient(v); setSelectedProject(""); }}>
                <SelectTrigger className="bg-[#0a0c0c] border-[#242726] text-[#edeae5] h-11">
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
              <p className="text-[#8b9391] text-xs uppercase tracking-wider mb-2">Projet</p>
              <Select value={selectedProject} onValueChange={setSelectedProject} disabled={!selectedClient}>
                <SelectTrigger className="bg-[#0a0c0c] border-[#242726] text-[#edeae5] h-11">
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
            <div className="text-center py-10 border border-dashed border-[#242726] rounded-md text-[#6b7270] text-sm">
              Sélectionnez un client et un projet pour générer le contenu
            </div>
          )}
        </div>

        {/* Présentations existantes */}
        <div>
          <h2 className="text-[#edeae5] text-lg font-light mb-4">Présentations existantes</h2>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[#35a79b]" />
            </div>
          ) : presentations.length === 0 ? (
            <div className="text-center py-16 bg-[#0a0c0c] rounded-md border border-[#242726]">
              <Landmark className="w-10 h-10 text-[#4a4d4b] mx-auto mb-3" />
              <p className="text-[#8b9391] text-sm">Aucune présentation créée</p>
              <p className="text-[#6b7270] text-xs mt-1">Générez un prompt ci-dessus pour commencer.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {presentations.map((pres) => (
                <div key={pres.id} className="bg-[#0a0c0c] rounded-md border border-[#242726] p-4 hover:border-[#303332] transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-[#edeae5] font-light truncate">{pres.project_title}</p>
                      <p className="text-[#8b9391] text-xs mt-0.5">
                        {pres.client_name || pres.client_email} — {new Date(pres.created_date).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3">
                      {pres.pptx_url && (
                        <a
                          href={pres.pptx_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#35a79b] hover:text-[#35a79b]/80 h-8 w-8 inline-flex items-center justify-center"
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
                        className={`h-8 w-8 ${pres.pptx_url ? "text-[#35a79b]" : "text-[#9aa19e] hover:text-[#e0c9a0]"}`}
                        title={pres.pptx_url ? "Modifier le lien" : "Ajouter un lien de présentation"}
                      >
                        {pres.pptx_url ? <Pencil className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { if (confirm("Supprimer cette présentation ?")) deleteMutation.mutate(pres.id); }}
                        className="text-[#9aa19e] hover:text-red-400 h-8 w-8"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Lien de la présentation */}
                  {pres.pptx_url && editLinkId !== pres.id && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#35a79b]/10 border border-[#35a79b]/20">
                      <Link2 className="w-3.5 h-3.5 text-[#35a79b] flex-shrink-0" />
                      <a href={pres.pptx_url} target="_blank" rel="noopener noreferrer" className="text-[#35a79b] text-xs truncate hover:underline">
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
                        className="bg-[#0a0c0c] border-[#edeae5]/[0.1] text-[#edeae5] text-xs h-9 flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveLink(pres.id)}
                        disabled={!linkValue.trim()}
                        className="bg-[#35a79b]/15 border border-[#35a79b]/30 hover:bg-[#35a79b]/25 text-[#edeae5] text-xs h-9 px-4"
                      >
                        Enregistrer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditLinkId(null); setLinkValue(""); }}
                        className="text-[#8b9391] text-xs h-9"
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