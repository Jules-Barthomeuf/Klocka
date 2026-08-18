import React from "react";

// Style "IMMO OS" partagé — aligné sur l'onglet Infos
export const fieldWrap = "bg-[#121413] border border-[#282b2a] rounded-none px-[18px] py-3.5 transition-all focus-within:border-[#565b59] focus-within:shadow-[0_0_0_3px_rgba(237,234,229,0.08)]";
export const fieldInput = "w-full bg-transparent border-none text-[#edeae5] outline-none placeholder:text-[#6b7270]";
export const fieldLabel = "text-[12px] text-[#8b9391] font-semibold mb-1.5";

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