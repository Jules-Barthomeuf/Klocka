import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, CheckCircle2, Loader2, FileSearch, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const COMPARE_FIELDS = [
  { label: "Surface (m²)", key: "sim_surface", type: "number", tab: "simulateur" },
  { label: "Prix FAI", key: "sim_prix_bien_fai", type: "number", tab: "simulateur" },
  { label: "Prix négocié", key: "sim_prix_bien_negocie", type: "number", tab: "simulateur" },
  { label: "Loyer initial HT", key: "sim_loyer_initial_ht", type: "number", tab: "simulateur" },
  { label: "Charges copropriété", key: "sim_charges_copropriete", type: "number", tab: "simulateur" },
  { label: "Taxe foncière", key: "sim_taxe_fonciere", type: "number", tab: "simulateur" },
  { label: "Quote-part lot", key: "quote_part_lot", type: "number", tab: "copropriete" },
  { label: "Surface m²", key: "surface_m2", type: "number", tab: "informations" },
  { label: "Loyer annuel HT", key: "loyer_annuel_ht", type: "number", tab: "locataire" },
  { label: "Loyer €/m²/an", key: "loyer_m2_an", type: "number", tab: "locataire" },
  { label: "DPE Note", key: "dpe_note", type: "text", tab: "diagnostique" },
  { label: "DPE Consommation", key: "dpe_consommation", type: "number", tab: "diagnostique" },
  { label: "GES Note", key: "ges_note", type: "text", tab: "diagnostique" },
  { label: "GES Émission", key: "ges_emission", type: "number", tab: "diagnostique" },
  { label: "Nom locataire", key: "nom_locataire", type: "text", tab: "locataire" },
  { label: "Activité locataire", key: "activite_locataire", type: "text", tab: "locataire" },
  { label: "Adresse complète", key: "adresse_complete", type: "text", tab: "informations" },
  { label: "Droits enregistrement %", key: "sim_droits_enregistrement", type: "number", tab: "simulateur" },
  { label: "Fees Klocka", key: "sim_fees_klocka", type: "number", tab: "simulateur" },
  { label: "Apport", key: "sim_apport", type: "number", tab: "simulateur" },
  { label: "Durée crédit", key: "sim_duree_credit", type: "number", tab: "simulateur" },
  { label: "Taux intérêt", key: "sim_taux_interet", type: "number", tab: "simulateur" },
  { label: "Marché prix m² médian", key: "marche_prix_m2_median", type: "number", tab: "marche" },
  { label: "Marché prix m² bas", key: "marche_prix_m2_bas", type: "number", tab: "marche" },
  { label: "Marché prix m² haut", key: "marche_prix_m2_haut", type: "number", tab: "marche" },
];

const TEXT_FIELDS = [
  { label: "Analyse du bail", key: "analyse_bail", tab: "locataire" },
  { label: "Description ville", key: "description_ville", tab: "informations" },
  { label: "Description secteur", key: "description_secteur", tab: "informations" },
  { label: "Description bien", key: "description_bien", tab: "informations" },
  { label: "Synthèse AG", key: "synthese_assemblee_generale", tab: "copropriete" },
  { label: "Activités autorisées", key: "activites_autorisees", tab: "copropriete" },
  { label: "Activités interdites", key: "activites_interdites", tab: "copropriete" },
];

function getVal(obj, key) {
  if (!obj) return undefined;
  return obj[key];
}

export default function ShadowReportDialog({ open, onOpenChange, project, shadowRecord, onNavigateToField }) {
  const [textDiffs, setTextDiffs] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  if (!shadowRecord?.shadow_data) return null;

  const shadowData = shadowRecord.shadow_data;

  const numericDiffs = [];
  for (const field of COMPARE_FIELDS) {
    const currentVal = getVal(project, field.key);
    const shadowVal = getVal(shadowData, field.key);
    const cv = field.type === "number" ? (parseFloat(currentVal) || 0) : (currentVal || "");
    const sv = field.type === "number" ? (parseFloat(shadowVal) || 0) : (shadowVal || "");
    if (cv !== sv && (cv || sv)) {
      numericDiffs.push({ ...field, currentVal: cv, shadowVal: sv });
    }
  }

  const analyzeTexts = async () => {
    setIsAnalyzing(true);
    const textsToCompare = [];
    for (const field of TEXT_FIELDS) {
      const cv = getVal(project, field.key) || "";
      const sv = getVal(shadowData, field.key) || "";
      if (cv && sv && cv !== sv) {
        textsToCompare.push({ label: field.label, key: field.key, current: cv, shadow: sv, tab: field.tab });
      }
    }

    if (textsToCompare.length === 0) {
      setTextDiffs([]);
      setIsAnalyzing(false);
      return;
    }

    const prompt = `Tu es un expert en immobilier commercial. Compare les deux versions de chaque champ ci-dessous.
Ne signale PAS les différences de formulation ou de style. Signale UNIQUEMENT les différences d'INFORMATION ou de SENS (données contradictoires, chiffres différents, faits opposés).

Pour chaque champ, donne:
- "has_diff": true si une différence de sens/information est trouvée, false sinon
- "description": description concise de la différence trouvée (en français). Si pas de diff, mets "".

${textsToCompare.map((t, i) => `
--- CHAMP ${i + 1}: ${t.label} ---
VERSION PROJET ACTUEL:
${t.current}

VERSION SHADOW:
${t.shadow}
`).join("\n")}

Réponds UNIQUEMENT en JSON.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          comparisons: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field_label: { type: "string" },
                has_diff: { type: "boolean" },
                description: { type: "string" }
              }
            }
          }
        }
      }
    });

    const diffs = (result.comparisons || []).map((c, i) => ({
      ...c,
      label: textsToCompare[i]?.label || c.field_label,
      key: textsToCompare[i]?.key,
      tab: textsToCompare[i]?.tab
    }));
    setTextDiffs(diffs);
    setIsAnalyzing(false);
  };

  const handleClickDiff = (tab, viewMode) => {
    if (onNavigateToField) {
      onOpenChange(false);
      onNavigateToField(tab, viewMode);
    }
  };

  const totalNumericDiffs = numericDiffs.length;
  const totalTextDiffsFound = textDiffs ? textDiffs.filter(d => d.has_diff).length : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-[#000000] border-[#1f2228]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-400 uppercase tracking-[0.2em] text-[10px] font-medium mb-1">Rapport de comparaison</p>
              <DialogTitle className="text-xl font-light text-[#f2f3f5] tracking-tight">
                {project?.titre}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              {totalNumericDiffs > 0 && (
                <span className="text-[10px] bg-[#a9c5b9]/20 text-[#a9c5b9] px-2 py-0.5 rounded-full">
                  {totalNumericDiffs} diff. valeurs
                </span>
              )}
              {totalTextDiffsFound !== null && totalTextDiffsFound > 0 && (
                <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                  {totalTextDiffsFound} diff. textes
                </span>
              )}
              {totalNumericDiffs === 0 && totalTextDiffsFound === 0 && (
                <span className="text-[10px] bg-[#8fa0f2]/20 text-[#aab6f5] px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> RAS
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <p className="text-[10px] text-[#6a7180] mb-2">Cliquez sur une différence pour ouvrir le champ correspondant dans l'éditeur.</p>

        <div className="space-y-6 mt-2">
          {/* Numeric diffs */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[#9298a6] mb-3">Différences de valeurs</p>
            {numericDiffs.length > 0 ? (
              <div className="space-y-1.5">
                {numericDiffs.map((diff) => (
                  <div key={diff.key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#a9c5b9]/5 border border-[#a9c5b9]/10 group">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#a9c5b9] flex-shrink-0" />
                    <span className="text-xs text-[#9298a6] w-44 flex-shrink-0">{diff.label}</span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs text-blue-400 truncate">Actuel: <strong>{String(diff.currentVal)}</strong></span>
                      <span className="text-[#6a7180]">→</span>
                      <span className="text-xs text-purple-400 truncate">Shadow: <strong>{String(diff.shadowVal)}</strong></span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => handleClickDiff(diff.tab, "current")}
                        className="text-[10px] text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded-md flex items-center gap-1 transition-all"
                        title="Modifier dans le projet actuel"
                      >
                        <ExternalLink className="w-3 h-3" /> Actuel
                      </button>
                      <button
                        onClick={() => handleClickDiff(diff.tab, "shadow")}
                        className="text-[10px] text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-2 py-1 rounded-md flex items-center gap-1 transition-all"
                        title="Modifier dans le shadow"
                      >
                        <ExternalLink className="w-3 h-3" /> Shadow
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#8fa0f2]/5 border border-[#8fa0f2]/10">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#aab6f5]" />
                <span className="text-xs text-[#aab6f5]">Tous les champs numériques correspondent</span>
              </div>
            )}
          </div>

          {/* Text analysis */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-wider text-[#9298a6]">Analyse sémantique des textes</p>
              <Button
                size="sm"
                onClick={analyzeTexts}
                disabled={isAnalyzing}
                className="bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 text-purple-300 text-xs h-7"
              >
                {isAnalyzing
                  ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Analyse...</>
                  : <><FileSearch className="w-3 h-3 mr-1" />Analyser les textes</>
                }
              </Button>
            </div>

            {textDiffs && textDiffs.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#8fa0f2]/5 border border-[#8fa0f2]/10">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#aab6f5]" />
                <span className="text-xs text-[#aab6f5]">Aucune différence de sens détectée dans les textes</span>
              </div>
            )}

            {textDiffs && textDiffs.filter(d => d.has_diff).length > 0 && (
              <div className="space-y-1.5">
                {textDiffs.filter(d => d.has_diff).map((diff, idx) => (
                  <div key={idx} className="px-3 py-2.5 rounded-lg bg-red-500/5 border border-red-500/10 group">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-red-400 font-medium">{diff.label}</p>
                        <p className="text-xs text-[#9298a6] mt-1">{diff.description}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={() => handleClickDiff(diff.tab, "current")}
                          className="text-[10px] text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded-md flex items-center gap-1 transition-all"
                        >
                          <ExternalLink className="w-3 h-3" /> Actuel
                        </button>
                        <button
                          onClick={() => handleClickDiff(diff.tab, "shadow")}
                          className="text-[10px] text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-2 py-1 rounded-md flex items-center gap-1 transition-all"
                        >
                          <ExternalLink className="w-3 h-3" /> Shadow
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {textDiffs && textDiffs.filter(d => !d.has_diff).length > 0 && textDiffs.filter(d => d.has_diff).length > 0 && (
              <p className="text-[10px] text-[#6a7180] mt-2">
                {textDiffs.filter(d => !d.has_diff).length} autre(s) champ(s) texte sans différence de sens.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}