import React from "react";
import { Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Carte empilée pour l'affichage mobile des tableaux CRM.
 * Rend une liste label/valeur verticale au lieu d'un tableau qui scrolle horizontalement.
 *
 * fields: [{ label, value }] — value peut être un noeud React (badge, switch, cellule éditable...)
 * onEdit / onDelete: optionnels, affichent les boutons d'action en haut à droite.
 */
export default function MobileRecordCard({ title, fields = [], onEdit, onDelete }) {
  return (
    <div className="rounded-md border border-[#303332] bg-[#171918]/60 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="text-[#edeae5] font-semibold text-sm break-words flex-1 min-w-0">{title || "-"}</div>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {onEdit && (
              <Button variant="ghost" size="icon" onClick={onEdit} className="h-7 w-7 text-blue-400 hover:text-blue-300">
                <Edit className="w-3.5 h-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" onClick={onDelete} className="h-7 w-7 text-red-400 hover:text-red-300">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-[#9aa19e] text-xs uppercase tracking-wide flex-shrink-0 pt-1">{f.label}</span>
            <div className="text-[#edeae5] text-right break-words min-w-0">{f.value ?? "-"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}