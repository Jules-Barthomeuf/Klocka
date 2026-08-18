import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ChevronDown, ChevronUp, CalendarDays, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

export default function AssembleesGeneralesSection({ project, isAdmin }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedYear, setSelectedYear] = useState("");
  const [synthese, setSynthese] = useState("");
  const [resVotees, setResVotees] = useState("");
  const [resRefusees, setResRefusees] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedAG, setExpandedAG] = useState(null);

  const assemblees = (project.assemblees_generales || []).sort((a, b) => (b.annee || 0) - (a.annee || 0));

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => currentYear - i);

  const handleAdd = async () => {
    if (!selectedYear) return;
    setSaving(true);
    const newAG = {
      annee: parseInt(selectedYear),
      synthese,
      resolutions_votees: resVotees,
      resolutions_refusees: resRefusees,
    };
    const updated = [...(project.assemblees_generales || []), newAG];
    await base44.entities.Project.update(project.id, { assemblees_generales: updated });
    queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    setShowForm(false);
    setSelectedYear("");
    setSynthese("");
    setResVotees("");
    setResRefusees("");
    setSaving(false);
  };

  const handleDelete = async (index) => {
    setSaving(true);
    const sorted = [...assemblees];
    sorted.splice(index, 1);
    await base44.entities.Project.update(project.id, { assemblees_generales: sorted });
    queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    setSaving(false);
    if (expandedAG === index) setExpandedAG(null);
  };

  return (
    <div className="mt-10 max-md:mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] tracking-[0.2em] uppercase text-[#8b9391] mb-0">
          Synthèse des assemblées générales
        </h3>
        {isAdmin && (
          <Button
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="bg-[#35a79b] hover:bg-[#35a79b]/80 text-[#edeae5] gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Ajouter une AG
          </Button>
        )}
      </div>

      {/* Formulaire d'ajout */}
      {showForm && (
        <div className="mb-6 p-5 bg-[#171918]/50 rounded-md border border-[#35a79b]/30 space-y-4">
          <div>
            <label className="text-sm text-[#9aa19e] mb-1 block">Année</label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="bg-[#121413] text-[#edeae5] border-[#303332] w-40">
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent className="bg-[#121413] text-[#edeae5] border-[#303332]">
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedYear && (
            <>
              <div>
                <label className="text-sm text-[#9aa19e] mb-1 block">Synthèse de l'assemblée générale</label>
                <Textarea
                  value={synthese}
                  onChange={(e) => setSynthese(e.target.value)}
                  placeholder="Résumé des points abordés..."
                  className="bg-[#121413] text-[#edeae5] border-[#303332] min-h-[100px]"
                />
              </div>
              <div>
                <label className="text-sm text-[#9aa19e] mb-1 block">Résolutions votées</label>
                <Textarea
                  value={resVotees}
                  onChange={(e) => setResVotees(e.target.value)}
                  placeholder="Résolutions acceptées..."
                  className="bg-[#121413] text-[#edeae5] border-[#303332] min-h-[80px]"
                />
              </div>
              <div>
                <label className="text-sm text-[#9aa19e] mb-1 block">Résolutions non votées</label>
                <Textarea
                  value={resRefusees}
                  onChange={(e) => setResRefusees(e.target.value)}
                  placeholder="Résolutions refusées..."
                  className="bg-[#121413] text-[#edeae5] border-[#303332] min-h-[80px]"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAdd}
                  disabled={saving}
                  className="bg-[#35a79b] hover:bg-[#35a79b]/80 text-[#edeae5] gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setShowForm(false); setSelectedYear(""); }}
                  className="text-[#9aa19e] hover:text-[#edeae5]"
                >
                  Annuler
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Liste des AG */}
      {assemblees.length > 0 ? (
        <div className="border-t border-[#edeae5]/[0.35]">
          {assemblees.map((ag, idx) => {
            const isExpanded = expandedAG === idx;
            return (
              <div
                key={idx}
                className="border-b border-[#edeae5]/[0.12]"
              >
                <button
                  onClick={() => setExpandedAG(isExpanded ? null : idx)}
                  className="w-full flex items-center justify-between py-3.5 text-left group"
                >
                  <div className="flex items-center gap-3">
                    <CalendarDays className="w-4 h-4 text-[#35a79b]" />
                    <span className="text-[14.5px] text-[#edeae5] group-hover:text-[#7fd3c9] transition-colors">AG {ag.annee}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleDelete(idx); }}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8 w-8"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-[#9aa19e]" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-[#9aa19e]" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="pb-5 space-y-5">
                    {ag.synthese && (
                      <div>
                        <p className="text-[10px] tracking-[0.2em] uppercase text-[#8b9391] mb-2">Synthèse</p>
                        <p className="text-[14.5px] leading-[1.8] text-[#d3d8d6] whitespace-pre-wrap mb-0">{ag.synthese}</p>
                      </div>
                    )}
                    <div className="grid md:grid-cols-2 gap-x-12 gap-y-5">
                      {ag.resolutions_votees && (
                        <div className="border-l border-[#35a79b] pl-5">
                          <p className="text-[10px] tracking-[0.2em] uppercase text-[#7fd3c9] mb-2">Résolutions votées</p>
                          <p className="text-[14.5px] leading-[1.8] text-[#d3d8d6] whitespace-pre-wrap mb-0">{ag.resolutions_votees}</p>
                        </div>
                      )}
                      {ag.resolutions_refusees && (
                        <div className="border-l border-[#e0c9a0] pl-5">
                          <p className="text-[10px] tracking-[0.2em] uppercase text-[#e0c9a0] mb-2">Résolutions non votées</p>
                          <p className="text-[14.5px] leading-[1.8] text-[#d3d8d6] whitespace-pre-wrap mb-0">{ag.resolutions_refusees}</p>
                        </div>
                      )}
                    </div>
                    {!ag.synthese && !ag.resolutions_votees && !ag.resolutions_refusees && (
                      <p className="text-sm text-[#8b9391] mb-0">Aucune information renseignée pour cette AG.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !showForm && (
          <p className="text-sm text-[#8b9391] text-center py-6">Aucune assemblée générale enregistrée.</p>
        )
      )}
    </div>
  );
}