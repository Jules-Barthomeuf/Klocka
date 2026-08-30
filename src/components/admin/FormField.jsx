import React from "react";

// Style "IMMO OS" partagé — aligné sur l'onglet Infos
export const fieldWrap = "bg-[#0f1114] border border-[#1f2228] rounded-none px-[18px] py-3.5 transition-all focus-within:border-[#3a3f4a] focus-within:shadow-[0_0_0_3px_rgba(237,234,229,0.08)]";
export const fieldInput = "w-full bg-transparent border-none text-[#f2f3f5] outline-none placeholder:text-[#6a7180]";
export const fieldLabel = "text-[12px] text-[#9298a6] font-semibold mb-1.5";

// Champ texte / nombre
export function FField({ label, labelColor, children, className = "" }) {
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