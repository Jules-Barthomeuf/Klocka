import React, { useRef, useState } from "react";
import ReprisePlace from "./ReprisePlace";
import CeQuiVousAttend from "@/components/dashboard/CeQuiVousAttend";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useUser } from "@/components/providers/UserProvider";
import { J, alpha } from "@/design/jetons";

// Le plan de travail : ce que l'assistant propose de faire, maintenant.
//
// La pile vient du serveur, calculée depuis l'état des dossiers et des mails —
// aucune décision n'est prise par un modèle. Ici on exécute l'action choisie, et
// rien ne part vers l'extérieur sans que le texte ait été relu : une action
// « mail » ouvre un brouillon éditable, jamais un envoi.


// L'urgence se lit au filet de gauche, pas à une pastille de couleur : la même
// grammaire que « Ce qui a échoué », pour que la page se parcoure d'un regard.

// Une phrase d'accueil, tirée au sort à chaque venue, avec le prénom — et à
// l'heure : « Bonjour » jusqu'à 18 h, « Bonsoir » ensuite, jamais l'inverse.
const SALUTS = (p, heure) => [
  heure >= 18 || heure < 5 ? `Bonsoir ${p}` : `Bonjour ${p}`,
  "Je vous écoute", `À vous, ${p}`, "Je suis prêt", `On y va, ${p}`, "Dites-moi tout", `De retour, ${p}`, "Prêt quand vous voulez", "On reprend\u202f?",
];

export default function PlanDeTravail({ chat = null }) {
  const utilisateur = useUser();
  const prenom = (utilisateur?.full_name || utilisateur?.email || "").split(/[ @]/)[0] || "";
  const [salut] = useState(() => { const l = SALUTS(prenom ? prenom.charAt(0).toUpperCase() + prenom.slice(1) : "Jules", new Date().getHours()); return l[Math.floor(Math.random() * l.length)]; });

  const queryClient = useQueryClient();

  // Une proposition traitée se déclare : c'est ce qui permet de savoir, plus
  // tard, lesquelles servent à quelque chose et lesquelles personne ne touche.

  const { data: sante } = useQuery({ queryKey: ["sante"], queryFn: () => base44.request("GET", "/api/health"), staleTime: 60000 });

  const maintenant = new Date().toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div>
      {/* --- En-tête ---------------------------------------------------------
          On arrive sur une question, pas sur un tableau : le salut, le chat au
          centre, les gestes courants juste en dessous. L'ensemble est posé sur
          son propre fond, délimité par un filet : ce qui est au-dessus se fait,
          ce qui est en dessous se reprend. */}
      <header className="accueil relative overflow-hidden rounded-bloc border border-trait pb-12 pt-[8vh] text-center max-md:pb-8 max-md:pt-8">
        <div aria-hidden="true" className="accueil-halo-a" />
        <div aria-hidden="true" className="accueil-halo-b" />
        {/* Une lueur menthe dans le coin, comme sur le dossier. */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-[220px] -top-[240px] h-[620px] w-[840px]" style={{ background: `radial-gradient(closest-side, ${alpha("menthe", 0.1)}, transparent)` }} />
        <div aria-hidden="true" className="pointer-events-none absolute -right-[260px] bottom-[-280px] h-[560px] w-[760px]" style={{ background: `radial-gradient(closest-side, ${alpha("menthe", 0.06)}, transparent)` }} />
        <h1 className="relative m-0 font-display text-[34px] font-normal italic leading-[1.1] tracking-[-.01em] text-encre" >
          {salut}
        </h1>

        {/* Le chat, centré et pas plus large qu'une page : on le lit d'un regard. */}
        {chat && <div className="relative mx-auto mt-11 max-w-[900px] px-5 max-md:mt-8">{chat}</div>}
      </header>

      {/* Le stockage, tant qu'il n'est pas sûr : on ne découvre pas la perte après coup. */}
      {sante?.hebergeur === "render" && !sante?.base?.persistante && (
        <div className="mt-8 rounded-bloc border px-5 py-4" style={{ borderColor: alpha("alerte", 0.4), background: J["surface"] }}>
          <p className="m-0 text-[11px] uppercase tracking-[.18em] text-alerte">La base sera effacée au prochain déploiement</p>
          <p className="m-0 mt-1.5 text-[13.5px] leading-[1.6] text-craie">{sante.base?.diagnostic}</p>
          <p className="m-0 mt-1.5 text-[12.5px] text-brume">
            Chemin : {sante.base?.emplacement} · déclaré : {sante.base?.declaree ? "oui" : "non"} · disque monté : {sante.base?.disque_monte ? "oui" : "non"}
          </p>
        </div>
      )}

      {/* Ce qui est dû passe avant ce qu'on avait laissé en plan. Les deux
          blocs se cachent quand ils sont vides : une barre au-dessus du néant
          ne sépare rien. */}
      <div className="mt-12 flex flex-col gap-12 max-md:mt-9 max-md:gap-9">
        <CeQuiVousAttend />
        <ReprisePlace />
      </div>
    </div>
  );
}
