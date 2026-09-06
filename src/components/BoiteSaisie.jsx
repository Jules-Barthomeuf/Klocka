import React from "react";
import { ArrowRight, Loader2 } from "lucide-react";

// La boîte de saisie, la même partout : un cadre sombre arrondi, le texte,
// une barre en bas avec les commandes discrètes à gauche et le bouton blanc à
// droite. Ce qui change d'un chat à l'autre, c'est ce qu'on met à gauche et
// ce que dit le bouton.
export default function BoiteSaisie({
  valeur,
  onChange,
  placeholder,
  onEnvoyer,
  peutEnvoyer = true,
  enCours = false,
  libelle = "Envoyer",
  gauche = null,
  sous = null,
  rows = 3,
  disabled = false,
  compact = false,
  conteneur = {},
  className = "",
}) {
  return (
    <div
      {...conteneur}
      className={`bg-[#0a0a0b] border border-[#1f2228] rounded-[20px] shadow-[0_18px_50px_rgba(0,0,0,.45)] focus-within:border-[#3a3f4a] transition-colors ${conteneur.className || ""} ${className}`}
    >
      <div className={compact ? "px-5 pt-3" : "px-7 max-md:px-5 pt-6"}>
        <textarea
          rows={rows}
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && peutEnvoyer && !enCours) { e.preventDefault(); onEnvoyer(); } }}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full bg-transparent border-0 outline-none resize-none ${compact ? "text-[14.5px]" : "text-[17px] max-md:text-[15px]"} leading-[1.55] text-[#f2f3f5] placeholder:text-[#6c737c] disabled:opacity-50`}
        />
        {sous}
      </div>
      <div className={`flex items-center justify-between gap-4 border-t border-[#1f2228] ${compact ? "px-4 py-2" : "px-7 max-md:px-5 py-4"}`}>
        <div className="flex flex-wrap items-center gap-2 min-w-0 text-[#9298a6]">{gauche}</div>
        <button
          onClick={onEnvoyer}
          disabled={!peutEnvoyer || enCours || disabled}
          className={`inline-flex items-center gap-3 rounded-full bg-[#f2f3f5] text-[#0b0c0e] font-medium hover:bg-[#ffffff] disabled:opacity-40 transition-colors flex-shrink-0 ${compact ? "px-4 py-1.5 text-[13px]" : "px-6 py-3 text-[16px] max-md:px-4 max-md:py-2 max-md:text-[14px]"}`}
        >
          {libelle}
          {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// Un bouton discret de la barre du bas : une icône, un titre.
export function BoutonBarre({ actif = false, alerte = false, children, ...props }) {
  return (
    <button
      {...props}
      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${
        alerte ? "bg-[#e8746a] text-[#000000] animate-pulse" : actif ? "text-[#f2f3f5] bg-[#f2f3f5]/10" : "text-[#8f959e] hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/[0.06]"
      } ${props.className || ""}`}
    >
      {children}
    </button>
  );
}
