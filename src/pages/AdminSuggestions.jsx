import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Lightbulb, 
  Plus, 
  Search, 
  Loader2, 
  Edit2,
  Trash2,
  Filter
} from "lucide-react";
import { toast } from "sonner";
import moment from "moment";
import "moment/locale/fr";
moment.locale("fr");

const statutConfig = {
  nouveau: { label: "Nouveau", color: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
  en_cours: { label: "En cours", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  accepte: { label: "Accepté", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  refuse: { label: "Refusé", color: "bg-red-500/20 text-red-300 border-red-500/30" },
  termine: { label: "Terminé", color: "bg-[#2A9D8F]/20 text-[#2A9D8F] border-[#2A9D8F]/30" }
};

export default function AdminSuggestions() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatut, setFilterStatut] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState(null);
  const [formData, setFormData] = useState({
    contenu: "",
    statut: "nouveau",
    note_admin: "",
    client_email: "admin@klocka.fr",
    client_name: "Admin Klocka"
  });
  const queryClient = useQueryClient();

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['all-suggestions'],
    queryFn: () => base44.entities.Suggestion.list("-created_date"),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Suggestion.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-suggestions'] });
      toast.success("Suggestion ajoutée");
      setShowDialog(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Suggestion.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-suggestions'] });
      toast.success("Suggestion mise à jour");
      setShowDialog(false);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Suggestion.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-suggestions'] });
      toast.success("Suggestion supprimée");
    }
  });

  const resetForm = () => {
    setFormData({
      contenu: "",
      statut: "nouveau",
      note_admin: "",
      client_email: "admin@klocka.fr",
      client_name: "Admin Klocka"
    });
    setEditingSuggestion(null);
  };

  const handleEdit = (suggestion) => {
    setEditingSuggestion(suggestion);
    setFormData({
      contenu: suggestion.contenu,
      statut: suggestion.statut,
      note_admin: suggestion.note_admin || "",
      client_email: suggestion.client_email,
      client_name: suggestion.client_name
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!formData.contenu.trim()) return;
    
    if (editingSuggestion) {
      updateMutation.mutate({ id: editingSuggestion.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredSuggestions = suggestions.filter(s => {
    const matchSearch = s.contenu?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        s.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        s.client_email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatut = filterStatut === "all" || s.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  const stats = {
    total: suggestions.length,
    nouveau: suggestions.filter(s => s.statut === "nouveau").length,
    en_cours: suggestions.filter(s => s.statut === "en_cours").length,
    termine: suggestions.filter(s => s.statut === "termine" || s.statut === "accepte").length
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="w-6 h-6 text-[#2A9D8F] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <p className="text-[#2A9D8F] uppercase tracking-[0.3em] text-[11px] font-medium mb-2">Administration</p>
            <h1 className="text-3xl md:text-4xl font-light text-white tracking-tight">Feedback</h1>
            <div className="h-px w-16 bg-[#2A9D8F] mt-3" />
          </div>
          <button onClick={() => { resetForm(); setShowDialog(true); }}
            className="group flex items-center gap-3 bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/20 hover:border-[#2A9D8F]/50 text-white px-6 py-3 rounded-xl transition-all duration-300">
            <div className="w-9 h-9 bg-[#2A9D8F]/20 rounded-lg flex items-center justify-center group-hover:bg-[#2A9D8F]/30 transition-colors">
              <Plus className="w-5 h-5 text-[#2A9D8F]" />
            </div>
            <span className="text-sm font-medium">Nouvelle amélioration</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total", value: stats.total, color: "text-white" },
            { label: "Nouvelles", value: stats.nouveau, color: "text-gray-400" },
            { label: "En cours", value: stats.en_cours, color: "text-blue-400" },
            { label: "Terminées", value: stats.termine, color: "text-[#2A9D8F]" }
          ].map((s) => (
            <div key={s.label} className="bg-[#0A0A0A] rounded-xl border border-white/[0.06] px-4 py-3">
              <p className="text-gray-500 text-[10px] uppercase tracking-[0.15em] mb-1">{s.label}</p>
              <p className={`text-xl font-light ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            <Input
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[#0A0A0A] border-white/[0.06] text-white placeholder:text-gray-600 h-10"
            />
          </div>
          <Select value={filterStatut} onValueChange={setFilterStatut}>
            <SelectTrigger className="w-full md:w-48 bg-[#0A0A0A] border-white/[0.06] text-white h-10">
              <Filter className="w-3.5 h-3.5 mr-2 text-gray-500" />
              <SelectValue placeholder="Filtrer par statut" />
            </SelectTrigger>
            <SelectContent className="bg-[#0A0A0A] border-white/[0.08] text-white">
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="nouveau">Nouveau</SelectItem>
              <SelectItem value="en_cours">En cours</SelectItem>
              <SelectItem value="accepte">Accepté</SelectItem>
              <SelectItem value="refuse">Refusé</SelectItem>
              <SelectItem value="termine">Terminé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Liste */}
        <div className="space-y-3">
          {filteredSuggestions.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Lightbulb className="w-10 h-10 text-gray-700" />
              </div>
              <h2 className="text-xl font-light text-white mb-2">Aucune suggestion</h2>
              <p className="text-gray-600 text-sm">Aucune suggestion ne correspond à votre recherche</p>
            </div>
          ) : (
            filteredSuggestions.map((suggestion) => {
              const config = statutConfig[suggestion.statut] || statutConfig.nouveau;
              const isAdmin = suggestion.client_email === "admin@klocka.fr";
              return (
                <div key={suggestion.id} className="bg-[#0A0A0A] rounded-xl border border-white/[0.06] hover:border-white/[0.10] transition-all p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-gray-600 text-xs flex-shrink-0">{moment(suggestion.created_date).format('DD/MM/YY')}</span>
                        <Badge className={`${config.color} text-[10px] px-2 py-0 border`}>{config.label}</Badge>
                        {isAdmin && <Badge className="bg-[#2A9D8F]/10 text-[#2A9D8F] text-[10px] px-2 py-0 border border-[#2A9D8F]/20">Admin</Badge>}
                      </div>
                      <p className="text-white/80 text-sm mb-2 leading-relaxed">{suggestion.contenu}</p>
                      <div className="flex items-center gap-3">
                        <p className="text-gray-500 text-xs">{suggestion.client_name}</p>
                        {!isAdmin && <p className="text-gray-600 text-xs">{suggestion.client_email}</p>}
                      </div>
                      {suggestion.note_admin && (
                        <div className="mt-3 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                          <p className="text-gray-500 text-xs"><span className="text-gray-400">Note :</span> {suggestion.note_admin}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleEdit(suggestion)}
                        className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-all">
                        <Edit2 className="w-3 h-3" /> Éditer
                      </button>
                      <Button variant="ghost" size="icon" onClick={() => { if (window.confirm("Supprimer ?")) deleteMutation.mutate(suggestion.id); }}
                        className="text-gray-600 hover:text-red-400 hover:bg-red-500/10 h-8 w-8">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Dialog ajout/édition */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-lg bg-[#050505] border-white/[0.08]">
            <DialogHeader>
              <DialogTitle className="text-xl font-light text-white">
                {editingSuggestion ? "Modifier la suggestion" : "Nouvelle amélioration"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 mt-4">
              <div className="space-y-2">
                <label className="text-white text-sm font-medium">Description</label>
                <Textarea
                  value={formData.contenu}
                  onChange={(e) => setFormData({ ...formData, contenu: e.target.value })}
                  placeholder="Décrivez l'amélioration..."
                  className="bg-[#0A0A0A] text-white border-white/[0.08] min-h-[120px]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-white text-sm font-medium">Statut</label>
                <Select value={formData.statut} onValueChange={(value) => setFormData({ ...formData, statut: value })}>
                  <SelectTrigger className="bg-[#0A0A0A] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A0A0A] border-white/[0.08] text-white">
                    <SelectItem value="nouveau">Nouveau</SelectItem>
                    <SelectItem value="en_cours">En cours</SelectItem>
                    <SelectItem value="accepte">Accepté</SelectItem>
                    <SelectItem value="refuse">Refusé</SelectItem>
                    <SelectItem value="termine">Terminé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-white text-sm font-medium">Note interne</label>
                <Textarea
                  value={formData.note_admin}
                  onChange={(e) => setFormData({ ...formData, note_admin: e.target.value })}
                  placeholder="Notes internes..."
                  className="bg-[#0A0A0A] text-white border-white/[0.08]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.06]">
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-gray-400 hover:text-white">Annuler</Button>
              <Button onClick={handleSubmit} disabled={!formData.contenu.trim() || createMutation.isPending || updateMutation.isPending}
                className="bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 text-white">
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {editingSuggestion ? "Mettre à jour" : "Ajouter"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}