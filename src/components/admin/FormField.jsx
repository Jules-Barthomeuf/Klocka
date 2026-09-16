import React from "react";

// Le style des cases de tous les panneaux : posées sur la surface, intitulé
// en petites capitales espacées. C'est le registre de l'onglet Marché, tenu
// ici pour que les six autres onglets le suivent sans se répéter.
export const fieldWrap = "bg-surface border border-trait rounded-[12px] px-4 py-3.5 transition-colors focus-within:border-menthe/60";
export const fieldInput = "w-full bg-transparent border-none text-encre outline-none placeholder:text-brume";
export const fieldLabel = "text-[11px] uppercase tracking-[.16em] text-ardoise mb-2";

// Champ texte / nombre
export function FField({ label = undefined, labelColor = undefined, children, className = "" }) {
  return (
    <div className={`${fieldWrap} ${className}`}>
      {label && <div className={fieldLabel} style={labelColor ? { color: labelColor } : undefined}>{label}</div>}
      {children}
    </div>
  );
}

// Input aligné sur le style Infos
export function FInput({ className = "", ...props }) {
  return <input {...props} className={`${fieldInput} text-[15px] ${className}`} />;
}

// Textarea aligné sur le style Infos
export function FTextarea({ className = "", ...props }) {
  return <textarea {...props} className={`${fieldInput} text-[15px] resize-y ${className}`} />;
}