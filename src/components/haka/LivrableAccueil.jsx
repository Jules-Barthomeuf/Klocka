import React from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Download, FolderOpen, Loader2, X } from "lucide-react";
import CarteProposition from "@/components/haka/CarteProposition";
import { useCompteHaka, useGestesHaka, usePropositions } from "@/components/haka/useFileHaka";
import { useUser } from "@/components/providers/UserProvider";

// La moitié droite de l'Accueil, une demande envoyée (17 oct. 2026, Jules) :
// Haka à gauche, ce qu'il prépare à droite, comme Offres et Présentations.
// On y voit le dossier en contexte, ce que la conversation a produit, puis ce
// qui, né pendant cette conversation, attend un clic dans « À valider ».

function Livrable({ l }) {
  const navigate = useNavigate();
  const lien = String(l.lien || "");
  const fichier = lien.startsWith("fichier:");
  const ouvrir = () => {
    if (fichier) {
      const a = document.createElement("a");
      a.href = lien.slice(8);
      a.download = decodeURIComponent(lien.split("/").pop() || "fichier").replace(/^[^-]+-/, "");
      document.body.appendChild(a); a.click(); a.remove();
    } else if (/^https?:/.test(lien)) window.open(lien, "_blank", "noopener");
    else if (lien.startsWith("/")) navigate(lien);
  };
  const cliquable = fichier || /^https?:/.test(lien) || lien.startsWith("/");
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="flex items-center gap-3 border-t border-trait py-3 first:border-t-0">
      <span className={`grid h-6 w-6 flex-none place-items-center rounded-full ${l.etat === "rate" ? "bg-alerte/15 text-alerte" : "bg-menthe/15 text-menthe"}`}>
        {l.etat === "rate" ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14.5px] text-encre">{l.titre}</p>
        {l.detail && <p className="m-0 mt-0.5 truncate text-[13px] text-ardoise">{l.detail}</p>}
      </div>
      {cliquable && (
        <button type="button" onClick={ouvrir} className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full border border-trait px-3 text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
          {fichier ? <Download className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}{l.action || (fichier ? "Télécharger" : "Ouvrir")}
        </button>
      )}
    </motion.div>
  );
}

/** Ce que Haka a mis dans « À valider » depuis `depuis` (le début de la conversation), ou sur le dossier choisi. */
export function usePropositionsNees(depuis = null, dossier = null) {
  const actif = !!useCompteHaka().data?.actif;
  const pourMoi = usePropositions("moi");
  const commun = usePropositions("commun");
  if (!actif) return [];
  return [...(pourMoi.data?.propositions || []), ...(commun.data?.propositions || [])]
    .filter((p, i, t) => t.findIndex((x) => x.id === p.id) === i)
    .filter((p) => (depuis && String(p.cree_le || "") >= depuis) || (dossier && p.dossier === dossier.deal_id));
}

/**
 * @param {{ livrables: Array<{titre: string, detail?: string, lien?: string, etat?: string, action?: string}>, dossier: {deal_id: string, titre?: string}|null, depuis: string|null, travail: boolean }} props
 */
export default function LivrableAccueil({ livrables = [], dossier = null, depuis = null, travail = false }) {
  const user = useUser();
  const moi = String(user?.email || "").toLowerCase();
  const gestes = useGestesHaka();
  // Ce qui est né pendant cette conversation, ou porte sur le dossier choisi.
  const nees = usePropositionsNees(depuis, dossier);
  const vide = !livrables.length && !nees.length && !dossier;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="k-barre-apercu flex h-14 flex-none items-center gap-3 border-b border-trait pl-5 pr-16">
        <p className="m-0 min-w-0 flex-1 truncate text-[14px] text-encre">{dossier ? dossier.titre : "Ce que l'Assistant KPartners prépare"}</p>
        {travail && <span className="inline-flex flex-none items-center gap-1.5 text-[12.5px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin" />L'Assistant KPartners travaille</span>}
        {dossier && (
          <Link to={`/Dossiers?deal_id=${dossier.deal_id}`} className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full border border-trait px-3 text-[13px] text-craie hover:border-bord-vif hover:text-encre">
            <FolderOpen className="h-3.5 w-3.5" />Ouvrir le dossier
          </Link>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {vide ? (
          <div className="grid h-full place-items-center text-center">
            <p className="m-0 max-w-[44ch] text-[14px] leading-[1.6] text-ardoise">{travail ? "L'Assistant KPartners travaille sur votre demande. Ce qu'il prépare s'affiche ici." : "Ce que l'Assistant KPartners prépare s'affiche ici : le document, ses sources, puis ce qui attend votre clic dans À valider."}</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[760px] flex-col gap-8">
            {livrables.length > 0 && (
              <section aria-label="Préparé dans cette conversation">
                <p className="m-0 mb-1 text-[11px] uppercase tracking-[.16em] text-brume">Préparé dans cette conversation</p>
                <div className="flex flex-col">{livrables.map((l, i) => <Livrable key={`${l.titre}-${i}`} l={l} />)}</div>
              </section>
            )}
            {nees.length > 0 && (
              <section aria-label="À valider" className="flex flex-col gap-3">
                <p className="m-0 text-[11px] uppercase tracking-[.16em] text-menthe">À valider · {nees.length}</p>
                {nees.map((p) => (
                  <CarteProposition key={p.id} proposition={p} compacte moi={moi} enCours={gestes.enCours(p.id)}
                    onValider={({ charge = null, choix = null, motif = null, categorie = null } = {}) => gestes.valider.mutate({ id: p.id, charge, choix, motif, categorie })}
                    onRejeter={(motif) => gestes.rejeter.mutate({ id: p.id, motif })}
                    onPrendre={!p.pour ? () => gestes.prendre.mutate({ id: p.id }) : null} />
                ))}
              </section>
            )}
            {dossier && !livrables.length && !nees.length && (
              <p className="m-0 text-[14px] leading-[1.6] text-ardoise">L'Assistant KPartners a ce dossier en contexte. Ce qu'il en tire s'affiche ici, puis rejoint À valider.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
