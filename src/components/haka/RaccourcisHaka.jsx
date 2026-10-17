import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Building2, FileSearch, FileSignature, FolderOpen, Landmark } from "lucide-react";
import { useUser } from "@/components/providers/UserProvider";
import { createPageUrl } from "@/utils";

// Les raccourcis sous la saisie de l'Accueil (17 oct. 2026, Jules) : les
// compétences les plus demandées, à la place de « Connecter un skill ». Un
// clic pose la demande dans le champ, avec le dossier choisi s'il y en a un ;
// rien ne part avant l'envoi. « Toutes les compétences » ouvre Paramètres.

const RACCOURCIS = [
  { cle: "preanalyse", libelle: "Pré-analyser", icone: FileSearch, sans: "Pré-analyse cette fiche : ", avec: "Pré-analyse ce dossier." },
  { cle: "data-room", libelle: "Analyser une data room", icone: FolderOpen, sans: "Analyse la data room du dossier ", avec: "Analyse la data room de ce dossier." },
  { cle: "loi", libelle: "Préparer une LOI", icone: FileSignature, sans: "Prépare la LOI pour ", avec: "Prépare la LOI de ce dossier pour " },
  { cle: "page-plateforme", libelle: "Page plateforme", icone: Building2, sans: "Prépare la page plateforme du dossier ", avec: "Prépare la page plateforme de ce dossier." },
  { cle: "presentation-bancaire", libelle: "Dossier bancaire", icone: Landmark, sans: "Prépare le dossier bancaire du projet ", avec: "Prépare le dossier bancaire de ce dossier." },
];

const PILULE = "inline-flex h-9 items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 text-[13.5px] text-encre transition-colors hover:border-bord-vif";

/** @param {{ dossier?: {deal_id: string, titre?: string}|null, className?: string }} props */
export default function RaccourcisHaka({ dossier = null, className = "" }) {
  const user = useUser();
  const navigate = useNavigate();
  const poser = (r) => window.dispatchEvent(new CustomEvent("klocka:composer", { detail: { texte: dossier ? r.avec : r.sans } }));
  const toutes = () => {
    try { localStorage.setItem("compte.section", "competences"); } catch { /* navigation privée */ }
    navigate(createPageUrl("Personnalisation"));
  };
  return (
    <nav aria-label="Raccourcis" className={`flex flex-wrap justify-center gap-2 ${className}`}>
      {RACCOURCIS.map((r) => {
        const Icone = r.icone;
        return (
          <button key={r.cle} type="button" onClick={() => poser(r)} className={PILULE}>
            <Icone className="h-3.5 w-3.5 text-ardoise" strokeWidth={1.8} />{r.libelle}
          </button>
        );
      })}
      {user?.gere_les_acces && (
        <button type="button" onClick={toutes} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] text-craie transition-colors hover:text-encre" style={{ background: "transparent" }}>
          Toutes les compétences<ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </nav>
  );
}
