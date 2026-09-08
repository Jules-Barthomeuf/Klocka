import React from "react";
import { ArrowUp, Loader2 } from "lucide-react";

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
  // lumiere : une lueur discrète fait lentement le tour du cadre — le chat IA
  // du dossier et du dashboard la portent, pas les boîtes utilitaires.
  lumiere = false,
}) {
  const { className: classeConteneur = "", ...propsConteneur } = conteneur;
  return (
    <div {...propsConteneur} className={`relative ${classeConteneur}`}>
      {lumiere && (
        <div aria-hidden className="absolute -inset-[1.5px] rounded-[21.5px] overflow-hidden pointer-events-none">
          <div className="lumiere-tour absolute inset-[-60%]" />
        </div>
      )}
    <div
      className={`relative bg-[#0a0a0b] border border-[#1f2228] rounded-[20px] shadow-[0_18px_50px_rgba(0,0,0,.45)] focus-within:border-[#3a3f4a] transition-colors [.glisse_&]:border-[#96c0b8] ${className}`}
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
        {/* Le bouton d'envoi ne dit plus « Envoyer » : une flèche ronde, comme
            dans les chats qu'on connaît. Le libellé reste l'intitulé accessible. */}
        <button
          onClick={onEnvoyer}
          disabled={!peutEnvoyer || enCours || disabled}
          title={libelle}
          aria-label={libelle}
          className={`inline-flex items-center justify-center rounded-full bg-[#f2f3f5] text-[#0b0c0e] hover:bg-[#ffffff] disabled:opacity-30 transition-colors flex-shrink-0 ${compact ? "w-8 h-8" : "w-10 h-10"}`}
        >
          {enCours ? <Loader2 className={compact ? "w-4 h-4 animate-spin" : "w-[18px] h-[18px] animate-spin"} /> : <ArrowUp className={compact ? "w-4 h-4" : "w-[18px] h-[18px]"} strokeWidth={2.2} />}
        </button>
      </div>
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
