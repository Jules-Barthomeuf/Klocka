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
    <div className="mt-8 max-md:mt-4 pt-6 max-md:pt-4 border-t border-[#24312f]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-montserrat text-white text-lg">
          Assemblées Générales
        </h3>
        {isAdmin && (
          <Button
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="bg-[#33d6c0] hover:bg-[#33d6c0]/80 text-white gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Ajouter une AG
          </Button>
        )}
      </div>

      {/* Formulaire d'ajout */}
      {showForm && (
        <div className="mb-6 p-5 bg-[#101715]/50 rounded-md border border-[#33d6c0]/30 space-y-4">
          <div>
            <label className="text-sm text-[#93aca7] mb-1 block">Année</label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="bg-[#0a0f0e] text-white border-[#24312f] w-40">
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent className="bg-[#0a0f0e] text-white border-[#24312f]">
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedYear && (
            <>
              <div>
                <label className="text-sm text-[#93aca7] mb-1 block">Synthèse de l'assemblée générale</label>
                <Textarea
                  value={synthese}
                  onChange={(e) => setSynthese(e.target.value)}
                  placeholder="Résumé des points abordés..."
                  className="bg-[#0a0f0e] text-white border-[#24312f] min-h-[100px]"
                />
              </div>
              <div>
                <label className="text-sm text-[#93aca7] mb-1 block">Résolutions votées</label>
                <Textarea
                  value={resVotees}
                  onChange={(e) => setResVotees(e.target.value)}
                  placeholder="Résolutions acceptées..."
                  className="bg-[#0a0f0e] text-white border-[#24312f] min-h-[80px]"
                />
              </div>
              <div>
                <label className="text-sm text-[#93aca7] mb-1 block">Résolutions non votées</label>
                <Textarea
                  value={resRefusees}
                  onChange={(e) => setResRefusees(e.target.value)}
                  placeholder="Résolutions refusées..."
                  className="bg-[#0a0f0e] text-white border-[#24312f] min-h-[80px]"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAdd}
                  disabled={saving}
                  className="bg-[#33d6c0] hover:bg-[#33d6c0]/80 text-white gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setShowForm(false); setSelectedYear(""); }}
                  className="text-[#93aca7] hover:text-white"
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
        <div className="space-y-3">
          {assemblees.map((ag, idx) => {
            const isExpanded = expandedAG === idx;
            return (
              <div
                key={idx}
                className="bg-[#101715]/50 rounded-md border border-[#24312f] overflow-hidden"
              >
                <button
                  onClick={() => setExpandedAG(isExpanded ? null : idx)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-[#101715]/80 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#33d6c0]/20 flex items-center justify-center">
                      <CalendarDays className="w-5 h-5 text-[#33d6c0]" />
                    </div>
                    <span className="text-white font-medium">AG {ag.annee}</span>
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
                      <ChevronUp className="w-5 h-5 text-[#93aca7]" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-[#93aca7]" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4">
                    {ag.synthese && (
                      <div>
                        <p className="text-xs text-[#93aca7] uppercase tracking-wider mb-1">Synthèse</p>
                        <p className="text-sm text-[#c4d5d1] whitespace-pre-wrap">{ag.synthese}</p>
                      </div>
                    )}
                    <div className="grid md:grid-cols-2 gap-4">
                      {ag.resolutions_votees && (
                        <div className="p-3 bg-[#33d6c0]/10 rounded-lg border border-[#33d6c0]/30">
                          <p className="text-xs text-[#5ee7d4] mb-2 font-semibold">✓ Résolutions votées</p>
                          <p className="text-sm text-[#c4d5d1] whitespace-pre-wrap">{ag.resolutions_votees}</p>
                        </div>
                      )}
                      {ag.resolutions_refusees && (
                        <div className="p-3 bg-red-900/20 rounded-lg border border-red-500/30">
                          <p className="text-xs text-red-400 mb-2 font-semibold">✗ Résolutions non votées</p>
                          <p className="text-sm text-[#c4d5d1] whitespace-pre-wrap">{ag.resolutions_refusees}</p>
                        </div>
                      )}
                    </div>
                    {!ag.synthese && !ag.resolutions_votees && !ag.resolutions_refusees && (
                      <p className="text-sm text-[#7f9995] italic">Aucune information renseignée pour cette AG.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !showForm && (
          <p className="text-sm text-[#7f9995] text-center py-6">Aucune assemblée générale enregistrée.</p>
        )
      )}
    </div>
  );
}