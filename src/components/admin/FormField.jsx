import React from "react";

// Style "IMMO OS" partagé — aligné sur l'onglet Infos
export const fieldWrap = "bg-[#171A21] border border-[#1c2725] rounded-[14px] px-[18px] py-3.5 transition-all focus-within:border-[#33d6c0] focus-within:shadow-[0_0_0_3px_rgba(42,157,143,0.14)]";
export const fieldInput = "w-full bg-transparent border-none text-[#EAECEF] outline-none placeholder:text-[#5B616C]";
export const fieldLabel = "text-[12px] text-[#8D93A0] font-semibold mb-1.5";

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