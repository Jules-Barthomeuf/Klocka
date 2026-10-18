import React from "react";
import { motion } from "framer-motion";
import CeQuiVousAttend from "@/components/dashboard/CeQuiVousAttend";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { J, alpha } from "@/design/jetons";

// Le plan de travail (maquette du 28 septembre 2026) : le salut, le chat au
// centre, puis deux colonnes, ce qui est dû et ce qu'on avait laissé en plan.
// Rien ne part vers l'extérieur sans que le texte ait été relu : une action
// « mail » ouvre un brouillon éditable, jamais un envoi.

// L'Accueil (17 oct. 2026, Jules) : `apresChat` (raccourcis et cartes de Haka) se pose sous la saisie,
// `bas` (À valider, Fait par Haka) prend la place de « Ce qui vous attend ».
export default function PlanDeTravail({ chat = null, conversation = false, historique = null, apresChat = null, bas = null }) {
  const utilisateur = useUser();
  const brut = (utilisateur?.full_name || utilisateur?.email || "").split(/[ @]/)[0] || "";
  const prenom = brut ? brut.charAt(0).toUpperCase() + brut.slice(1) : "";

  const { data: sante } = useQuery({ queryKey: ["sante"], queryFn: () => base44.request("GET", "/api/health"), staleTime: 60000 });

  return (
    <div>
      {/* Un message envoyé : le salut et les colonnes s'effacent, le chat
          devient le fil. L'arbre ne change pas, le chat garde son état. */}
      <header className={conversation ? "flex flex-col" : `relative flex flex-col items-center text-center max-md:pt-8 ${apresChat ? "min-h-[calc(100dvh-4.5rem)] justify-center pb-[10vh] max-md:min-h-0 max-md:justify-start max-md:pb-0" : "pt-[13vh]"}`}>
        {/* Plus de halo propre derrière le salut : le fond « Halo » commun
            (FondHalo, Layout) suffit, le même que sur Projets (18 oct. 2026, Jules). */}
        {!conversation && (
          <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="k-balayage relative m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>
            Bonjour{prenom ? ` ${prenom}` : ""}. Que puis-je faire pour vous ?
          </motion.h1>
        )}
        {chat && <div className={conversation ? "h-full w-full" : `relative mt-9 w-full max-md:mt-6 ${apresChat ? "max-w-[820px]" : "max-w-[660px]"}`}>{chat}</div>}
        {!conversation && !historique && apresChat && <div className="relative w-full">{apresChat}</div>}
      </header>

      {/* Le stockage, tant qu'il n'est pas sûr : on ne découvre pas la perte après coup. */}
      {!conversation && sante?.hebergeur === "render" && !sante?.base?.persistante && (
        <div className="mt-8 rounded-bloc border px-5 py-4" style={{ borderColor: alpha("alerte", 0.4), background: J["surface-pleine"] }}>
          <p className="m-0 text-[11px] uppercase tracking-[.18em] text-alerte">La base sera effacée au prochain déploiement</p>
          <p className="m-0 mt-1.5 text-[13.5px] leading-[1.6] text-craie">{sante.base?.diagnostic}</p>
          <p className="m-0 mt-1.5 text-[12.5px] text-brume">
            Chemin : {sante.base?.emplacement} · déclaré : {sante.base?.declaree ? "oui" : "non"} · disque monté : {sante.base?.disque_monte ? "oui" : "non"}
          </p>
        </div>
      )}

      {/* Ce qui est dû, seul : « Reprenez là où vous en étiez » est retiré (16 oct. 2026, Jules). Un
          bloc vide se cache : une barre au-dessus du néant ne sépare rien. */}
      {/* Historique ouvert : une seule grande colonne à la place des deux. */}
      {!conversation && historique && <div className="mt-[9vh] max-md:mt-10">{historique}</div>}
      {!conversation && !historique && bas && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }} className="mx-auto max-w-[1000px]">
          {bas}
        </motion.div>
      )}
      {!conversation && !historique && !bas && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }} className="mx-auto mt-[9vh] grid max-w-[440px] gap-y-8 max-md:mt-10">
          <CeQuiVousAttend />
        </motion.div>
      )}
    </div>
  );
}
