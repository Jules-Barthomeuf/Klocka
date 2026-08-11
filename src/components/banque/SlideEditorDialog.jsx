import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Save, Loader2, ChevronRight, Check } from "lucide-react";
import SlideRenderer from "./SlideRenderer";

// Map of slide type -> human-readable label
const SLIDE_LABELS = {
  cover: "Couverture",
  sommaire: "Sommaire",
  ville: "Environnement / Ville",
  transition: "Emplacement stratégique",
  quartier: "Zoom sur le quartier",
  tension_locative: "Tension locative / Enseignes",
  marche: "Marché immobilier",
  local: "Présentation du local",
  local_photos: "Photos du local",
  bail: "Bail commercial",
  acquisition_vs_marche: "Acquisition vs Marché",
  projection: "Projection financière",
  conditions: "Conditions de financement",
  cv: "Porteur du projet",
  diagnostics: "Diagnostics énergétiques",
  contact: "Contact",
};

// Define which fields are editable per slide type, with labels and input type
function getEditableFields(slide) {
  const t = slide.type;
  const c = slide.content || {};
  const fields = [];

  // Always allow editing the title
  fields.push({ key: "_title", label: "Titre de la slide", value: slide.title, type: "text" });

  switch (t) {
    case "cover":
      fields.push({ key: "client_name", label: "Nom du client", value: c.client_name, type: "text" });
      fields.push({ key: "subtitle", label: "Adresse / sous-titre", value: c.subtitle, type: "text" });
      fields.push({ key: "project_title", label: "Titre du projet", value: c.project_title, type: "text" });
      break;
    case "sommaire":
      (c.sections || []).forEach((s, i) => {
        fields.push({ key: `sections.${i}.label`, label: `Section ${s.num}`, value: s.label, type: "text" });
      });
      break;
    case "ville":
      fields.push({ key: "description", label: "Description de la ville", value: c.description, type: "textarea" });
      (c.badges || []).forEach((b, i) => {
        fields.push({ key: `badges.${i}`, label: `Badge ${i + 1}`, value: b, type: "text" });
      });
      break;
    case "transition":
      fields.push({ key: "subtitle", label: "Adresse", value: c.subtitle, type: "text" });
      fields.push({ key: "description", label: "Description", value: c.description, type: "textarea" });
      break;
    case "quartier": {
      fields.push({ key: "description", label: "Description du quartier", value: c.description, type: "textarea" });
      // Population & Ambiance
      fields.push({ key: "_sep_pop", label: "— POPULATION & AMBIANCE —", value: null, type: "separator" });
      const ent = c.entreprises || [];
      for (let i = 0; i < Math.max(4, ent.length); i++) {
        fields.push({ key: `entreprises.${i}`, label: `Population & Ambiance — Ligne ${i + 1}`, value: ent[i] || "", type: "text" });
      }
      // Localisation
      fields.push({ key: "_sep_loc", label: "— LOCALISATION —", value: null, type: "separator" });
      const svc = c.services || [];
      for (let i = 0; i < Math.max(4, svc.length); i++) {
        fields.push({ key: `services.${i}`, label: `Localisation — Ligne ${i + 1}`, value: svc[i] || "", type: "text" });
      }
      // Accessibilité
      fields.push({ key: "_sep_acc", label: "— ACCESSIBILITÉ —", value: null, type: "separator" });
      const trText = c.transports_text || [];
      for (let i = 0; i < Math.max(4, trText.length); i++) {
        fields.push({ key: `transports_text.${i}`, label: `Accessibilité — Ligne ${i + 1}`, value: trText[i] || "", type: "text" });
      }
      break;
    }
    case "tension_locative":
      fields.push({ key: "taux_vacance", label: "Taux de vacance (%)", value: c.taux_vacance, type: "number" });
      fields.push({ key: "bassin_emploi", label: "Bassin d'emploi", value: c.bassin_emploi, type: "number" });
      fields.push({ key: "nb_restaurants", label: "Nb restaurants", value: c.nb_restaurants, type: "number" });
      fields.push({ key: "pct_commerces", label: "% Commerces", value: c.pct_commerces, type: "number" });
      fields.push({ key: "pct_bureaux", label: "% Bureaux", value: c.pct_bureaux, type: "number" });
      fields.push({ key: "projets_urbains", label: "Projets urbains", value: c.projets_urbains, type: "textarea" });
      fields.push({ key: "description", label: "Description", value: c.description, type: "textarea" });
      break;
    case "marche":
      fields.push({ key: "quartier", label: "Nom du quartier", value: c.quartier, type: "text" });
      fields.push({ key: "prix_m2_median", label: "Prix m² médian", value: c.prix_m2_median, type: "number" });
      fields.push({ key: "prix_m2_bas", label: "Prix m² bas", value: c.prix_m2_bas, type: "number" });
      fields.push({ key: "prix_m2_haut", label: "Prix m² haut", value: c.prix_m2_haut, type: "number" });
      fields.push({ key: "offre_moyenne", label: "Offre moyenne (€/m²/an)", value: c.offre_moyenne, type: "number" });
      fields.push({ key: "offre_bas", label: "Offre basse", value: c.offre_bas, type: "number" });
      fields.push({ key: "offre_haut", label: "Offre haute", value: c.offre_haut, type: "number" });
      fields.push({ key: "baux_moyenne", label: "Baux moyenne", value: c.baux_moyenne, type: "number" });
      fields.push({ key: "evolution_1an", label: "Évolution 1 an (%)", value: c.evolution_1an, type: "number" });
      fields.push({ key: "evolution_5ans", label: "Évolution 5 ans (%)", value: c.evolution_5ans, type: "number" });
      break;
    case "local":
      fields.push({ key: "adresse", label: "Adresse", value: c.adresse, type: "text" });
      fields.push({ key: "surface", label: "Surface", value: c.surface, type: "text" });
      fields.push({ key: "locataire", label: "Locataire", value: c.locataire, type: "text" });
      fields.push({ key: "loyer_mensuel", label: "Loyer mensuel", value: c.loyer_mensuel, type: "text" });
      fields.push({ key: "type_construction", label: "Type de construction", value: c.type_construction, type: "text" });
      fields.push({ key: "description", label: "Description du bien", value: c.description, type: "textarea" });
      (c.badges || []).forEach((b, i) => {
        fields.push({ key: `badges.${i}`, label: `Caractéristique ${i + 1}`, value: b, type: "text" });
      });
      break;
    case "local_photos":
      fields.push({ key: "adresse", label: "Adresse", value: c.adresse, type: "text" });
      break;
    case "bail":
      fields.push({ key: "locataire", label: "Locataire", value: c.locataire, type: "text" });
      fields.push({ key: "activite", label: "Activité", value: c.activite, type: "text" });
      fields.push({ key: "loyer_annuel", label: "Loyer annuel", value: c.loyer_annuel, type: "text" });
      fields.push({ key: "loyer_mensuel", label: "Loyer mensuel", value: c.loyer_mensuel, type: "text" });
      fields.push({ key: "surface", label: "Surface", value: c.surface, type: "text" });
      fields.push({ key: "bail_type", label: "Type de bail", value: c.bail_type, type: "text" });
      fields.push({ key: "echeance", label: "Échéance", value: c.echeance, type: "text" });
      fields.push({ key: "date_debut", label: "Date de début", value: c.date_debut, type: "text" });
      fields.push({ key: "indexation", label: "Indexation", value: c.indexation, type: "text" });
      fields.push({ key: "analyse", label: "Analyse du bail", value: c.analyse, type: "textarea" });
      break;
    case "acquisition_vs_marche":
      fields.push({ key: "prix_m2_achat", label: "Prix m² achat", value: c.prix_m2_achat, type: "number" });
      fields.push({ key: "loyer_m2_achat", label: "Loyer m²/an achat", value: c.loyer_m2_achat, type: "number" });
      fields.push({ key: "prix_m2_marche_median", label: "Prix m² marché médian", value: c.prix_m2_marche_median, type: "number" });
      fields.push({ key: "offre_moyenne_marche", label: "Offre moyenne marché", value: c.offre_moyenne_marche, type: "number" });
      fields.push({ key: "baux_moyenne_marche", label: "Baux moyenne marché", value: c.baux_moyenne_marche, type: "number" });
      fields.push({ key: "rendement", label: "Rendement (%)", value: c.rendement, type: "number" });
      fields.push({ key: "prix_negocie", label: "Prix négocié", value: c.prix_negocie, type: "text" });
      fields.push({ key: "surface", label: "Surface", value: c.surface, type: "text" });
      break;
    case "projection":
      fields.push({ key: "duree", label: "Durée (années)", value: c.duree, type: "number" });
      fields.push({ key: "indexation", label: "Indexation (%)", value: c.indexation, type: "number" });
      fields.push({ key: "loyer_initial", label: "Loyer initial", value: c.loyer_initial, type: "text" });
      fields.push({ key: "revenus_cumules", label: "Revenus cumulés", value: c.revenus_cumules, type: "text" });
      fields.push({ key: "prix_revient", label: "Prix de revient", value: c.prix_revient, type: "text" });
      fields.push({ key: "rendement", label: "Rendement", value: c.rendement, type: "text" });
      fields.push({ key: "apport", label: "Apport", value: c.apport, type: "text" });
      break;
    case "conditions":
      (c.items || []).forEach((item, i) => {
        fields.push({ key: `items.${i}.label`, label: `Condition ${i + 1} — Libellé`, value: item.label, type: "text" });
        fields.push({ key: `items.${i}.value`, label: `Condition ${i + 1} — Valeur`, value: item.value, type: "text" });
      });
      break;
    case "cv":
      fields.push({ key: "nom", label: "Nom", value: c.nom, type: "text" });
      fields.push({ key: "email", label: "Email", value: c.email, type: "text" });
      break;
    case "diagnostics":
      fields.push({ key: "dpe_note", label: "Note DPE (A-G)", value: c.dpe_note, type: "text" });
      fields.push({ key: "dpe_consommation", label: "Consommation DPE", value: c.dpe_consommation, type: "number" });
      fields.push({ key: "ges_note", label: "Note GES (A-G)", value: c.ges_note, type: "text" });
      fields.push({ key: "ges_emission", label: "Émission GES", value: c.ges_emission, type: "number" });
      break;
    case "contact":
      fields.push({ key: "message", label: "Message", value: c.message, type: "text" });
      fields.push({ key: "client_name", label: "Nom du client", value: c.client_name, type: "text" });
      fields.push({ key: "client_email", label: "Email du client", value: c.client_email, type: "text" });
      break;
  }
  return fields;
}

// Apply a dotted key path to set a value in an object
function setNestedValue(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = isNaN(parts[i]) ? parts[i] : parseInt(parts[i]);
    if (cur[key] === undefined) cur[key] = {};
    cur = cur[key];
  }
  const lastKey = isNaN(parts[parts.length - 1]) ? parts[parts.length - 1] : parseInt(parts[parts.length - 1]);
  cur[lastKey] = value;
}

export default function SlideEditorDialog({ open, onOpenChange, presentation, onSave }) {
  const [editedSlides, setEditedSlides] = useState([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [modifiedSlides, setModifiedSlides] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (presentation?.slides) {
      // Deep clone
      setEditedSlides(JSON.parse(JSON.stringify(presentation.slides)));
      setActiveSlideIndex(0);
      setModifiedSlides(new Set());
    }
  }, [presentation]);

  const handleFieldChange = (slideIndex, fieldKey, value) => {
    setEditedSlides(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const slide = copy[slideIndex];
      if (fieldKey === "_title") {
        slide.title = value;
      } else {
        setNestedValue(slide.content, fieldKey, value);
      }
      return copy;
    });
    setModifiedSlides(prev => new Set(prev).add(slideIndex));
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(editedSlides);
    setIsSaving(false);
    setModifiedSlides(new Set());
  };

  const currentSlide = editedSlides[activeSlideIndex];
  const fields = currentSlide ? getEditableFields(currentSlide) : [];
  const hasChanges = modifiedSlides.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 bg-[#0A0A0A] border-white/[0.08] overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-white/[0.06] flex-shrink-0">
          <DialogTitle className="text-white font-light flex items-center justify-between">
            <span>Modifier — {presentation?.project_title}</span>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 text-white disabled:opacity-40 h-9 px-4 text-sm"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Appliquer les modifications
              {hasChanges && <span className="ml-2 bg-[#2A9D8F] text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{modifiedSlides.size}</span>}
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Slide list */}
          <div className="w-[260px] border-r border-white/[0.06] overflow-y-auto flex-shrink-0">
            {editedSlides.map((slide, i) => (
              <button
                key={i}
                onClick={() => setActiveSlideIndex(i)}
                className={`w-full text-left px-4 py-3 border-b border-white/[0.04] transition-colors flex items-center gap-3 ${
                  i === activeSlideIndex ? 'bg-[#2A9D8F]/10 border-l-2 border-l-[#2A9D8F]' : 'hover:bg-white/[0.02]'
                }`}
              >
                <span className="text-gray-600 text-[10px] font-mono w-5">{String(i + 1).padStart(2, '0')}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs truncate ${i === activeSlideIndex ? 'text-white' : 'text-gray-400'}`}>
                    {SLIDE_LABELS[slide.type] || slide.type}
                  </p>
                  <p className="text-gray-600 text-[10px] truncate mt-0.5">{slide.title}</p>
                </div>
                {modifiedSlides.has(i) && (
                  <div className="w-2 h-2 bg-[#F59E0B] rounded-full flex-shrink-0" />
                )}
                <ChevronRight className={`w-3 h-3 flex-shrink-0 ${i === activeSlideIndex ? 'text-[#2A9D8F]' : 'text-gray-700'}`} />
              </button>
            ))}
          </div>

          {/* Right: Editor + preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Slide preview mini */}
            {currentSlide && (
              <div className="flex-shrink-0 px-6 pt-4 pb-2">
                <div className="w-full rounded-lg overflow-hidden border border-white/[0.06]" style={{ aspectRatio: '16/5' }}>
                  <div className="w-full h-full origin-top-left pointer-events-none" style={{ transform: 'scale(0.3)', width: '333.33%', height: '333.33%' }}>
                    <div style={{ aspectRatio: '16/9', width: '100%' }}>
                      <SlideRenderer slide={currentSlide} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fields form */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
              <p className="text-[#2A9D8F] text-[10px] uppercase tracking-widest mb-4">
                {SLIDE_LABELS[currentSlide?.type] || ""} — Champs éditables
              </p>
              <div className="space-y-3">
                {fields.map((field) => {
                  if (field.type === "separator") {
                    return (
                      <div key={field.key} className="pt-4 pb-1 border-t border-white/[0.06]">
                        <p className="text-[#F59E0B] text-[10px] uppercase tracking-widest font-semibold">{field.label}</p>
                      </div>
                    );
                  }
                  return (
                    <div key={field.key}>
                      <label className="text-gray-500 text-[11px] uppercase tracking-wider block mb-1">{field.label}</label>
                      {field.type === "textarea" ? (
                        <Textarea
                          value={field.value ?? ""}
                          onChange={(e) => handleFieldChange(activeSlideIndex, field.key, e.target.value)}
                          className="bg-black border-white/[0.08] text-white text-sm min-h-[80px] resize-y"
                        />
                      ) : (
                        <Input
                          type={field.type === "number" ? "number" : "text"}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const val = field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value;
                            handleFieldChange(activeSlideIndex, field.key, val);
                          }}
                          className="bg-black border-white/[0.08] text-white text-sm h-9"
                        />
                      )}
                    </div>
                  );
                })}
                {fields.length === 1 && (
                  <p className="text-gray-600 text-xs italic mt-4">Seul le titre est modifiable pour cette slide.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}