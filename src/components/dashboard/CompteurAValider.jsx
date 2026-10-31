import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useCompteHaka } from "@/components/haka/useFileHaka";

// Sur le Dashboard (17 oct. 2026) : ce que Haka attend de vous, en une ligne,
// vers la page À valider. Rien si rien n'attend, ou si Haka n'est pas allumé.
export default function CompteurAValider({ className = "" }) {
  const { data } = useCompteHaka();
  if (!data?.actif) return null;
  const moi = data.moi || 0;
  const commun = data.commun || 0;
  if (!moi && !commun) return null;
  const texte = [moi ? `${moi} proposition${moi > 1 ? "s" : ""} de l'Assistant KPartners vous attend${moi > 1 ? "ent" : ""}` : null, commun ? `${commun} dans le Commun` : null].filter(Boolean).join(" · ");
  return (
    <Link to="/AValider" className={`flex items-center justify-between gap-3 rounded-[16px] border border-menthe/40 bg-rail px-5 py-3.5 text-[14.5px] text-encre transition-colors hover:border-menthe ${className}`}>
      <span><span className="mr-2 inline-block h-[7px] w-[7px] rounded-full bg-menthe align-middle" />{texte}</span>
      <span className="inline-flex flex-none items-center gap-1.5 text-[13.5px] text-menthe">À valider<ArrowRight className="h-3.5 w-3.5" /></span>
    </Link>
  );
}
