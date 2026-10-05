import React from "react";
import { motion } from "framer-motion";
import ReprisePlace from "./ReprisePlace";
import CeQuiVousAttend from "@/components/dashboard/CeQuiVousAttend";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { J, alpha } from "@/design/jetons";

// Le plan de travail (maquette du 28 septembre 2026) : le salut, le chat au
// centre, puis deux colonnes, ce qui est dû et ce qu'on avait laissé en plan.
// Rien ne part vers l'extérieur sans que le texte ait été relu : une action
// « mail » ouvre un brouillon éditable, jamais un envoi.

export default function PlanDeTravail({ chat = null, conversation = false, historique = null }) {
  const utilisateur = useUser();
  const brut = (utilisateur?.full_name || utilisateur?.email || "").split(/[ @]/)[0] || "";
  const prenom = brut ? brut.charAt(0).toUpperCase() + brut.slice(1) : "";

  const { data: sante } = useQuery({ queryKey: ["sante"], queryFn: () => base44.request("GET", "/api/health"), staleTime: 60000 });

  return (
    <div>
      {/* Un message envoyé : le salut et les colonnes s'effacent, le chat
          devient le fil. L'arbre ne change pas, le chat garde son état. */}
      <header className={conversation ? "flex flex-col" : "relative flex flex-col items-center pt-[13vh] text-center max-md:pt-8"}>
        {/* Le halo sauge derrière le salut et le chat : réglage « Halo » de
            Compte (caché à « Sans » et en mode clair, par index.css). Il était
            parti avec le chat en une barre (14 sept.), sans que le réglage le sache. */}
        {!conversation && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-[6vh] h-[900px] overflow-hidden"
            style={{ maskImage: "linear-gradient(to bottom, #000 55%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent)" }}>
            <div className="accueil-halo-a" style={{ top: "32%" }} />
            <div className="accueil-halo-b" style={{ top: "72%" }} />
          </div>
        )}
        {!conversation && (
          <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="relative m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>
            Bonjour{prenom ? ` ${prenom}` : ""}. Que puis-je faire pour vous ?
          </motion.h1>
        )}
        {chat && <div className={conversation ? "w-full" : "relative mt-9 w-full max-w-[660px] max-md:mt-6"}>{chat}</div>}
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

      {/* Ce qui est dû à gauche, ce qu'on avait laissé en plan à droite. Un
          bloc vide se cache : une barre au-dessus du néant ne sépare rien. */}
      {/* Historique ouvert : une seule grande colonne à la place des deux. */}
      {!conversation && historique && <div className="mt-[9vh] max-md:mt-10">{historique}</div>}
      {!conversation && !historique && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }} className="mx-auto mt-[9vh] grid max-w-[880px] gap-x-12 gap-y-8 md:grid-cols-2 max-md:mt-10">
          <CeQuiVousAttend />
          <ReprisePlace />
        </motion.div>
      )}
    </div>
  );
}
