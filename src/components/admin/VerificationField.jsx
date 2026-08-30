import React, { useState } from "react";
import { CheckCircle2, Circle, MessageSquare, ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

/**
 * Wrapper pour un champ avec vérification.
 * Props:
 *  - fieldKey: string unique pour ce champ dans verification_fields
 *  - formData / setFormData: état global du formulaire
 *  - children: le champ original
 *  - label: optionnel, affiché à côté du check
 */
export default function VerificationField({ fieldKey, formData, setFormData, children }) {
  const [showNote, setShowNote] = useState(false);

  const fields = formData.verification_fields || {};
  const field = fields[fieldKey] || { checked: false, note: "" };

  const setField = (updates) => {
    setFormData({
      ...formData,
      verification_fields: {
        ...fields,
        [fieldKey]: { ...field, ...updates },
      },
    });
  };

  const isChecked = field.checked;
  const hasNote = field.note && field.note.trim().length > 0;

  return (
    <div className={`relative rounded-lg transition-all ${isChecked ? "ring-1 ring-[#96c0b8]/40" : ""}`}>
      {/* Contenu du champ */}
      <div className="relative">
        {children}

        {/* Barre d'actions vérificateur */}
        <div className="flex items-center gap-1 mt-1.5">
          <button
            type="button"
            onClick={() => setField({ checked: !isChecked })}
            title={isChecked ? "Marquer comme non vérifié" : "Marquer comme vérifié"}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] transition-all border ${
              isChecked
                ? "border-[#96c0b8]/50 bg-[#96c0b8]/10 text-[#c3ddd6] hover:bg-[#96c0b8]/20"
                : "border-[#22262d] bg-[#0f1114]/60 text-[#9298a6] hover:text-[#c9cdd6] hover:border-[#22262d]"
            }`}
          >
            {isChecked ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <Circle className="w-3 h-3" />
            )}
            <span>{isChecked ? "Vérifié" : "Vérifier"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNote(!showNote)}
            title="Ajouter une note"
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] transition-all border ${
              hasNote
                ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                : "border-[#22262d] bg-[#0f1114]/60 text-[#9298a6] hover:text-[#c9cdd6] hover:border-[#22262d]"
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Note{hasNote ? " ✎" : ""}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showNote ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Note du vérificateur */}
        {showNote && (
          <div className="mt-2">
            <Textarea
              value={field.note || ""}
              onChange={(e) => setField({ note: e.target.value })}
              placeholder="Note du vérificateur..."
              className="bg-[#000000] text-orange-100 border-orange-500/30 text-xs placeholder:text-[#6a7180]"
              rows={2}
            />
          </div>
        )}
      </div>
    </div>
  );
}