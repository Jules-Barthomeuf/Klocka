import React, { useRef, useState } from "react";
import ReprisePlace from "./ReprisePlace";
import CeQuiVousAttend from "@/components/dashboard/CeQuiVousAttend";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useUser } from "@/components/providers/UserProvider";

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

  const REGLE = "h-px bg-trait my-12 max-md:my-9";

  return (
    <div>
      {/* --- En-tête --------------------------------------------------------- */}
      {/* On arrive sur une question, pas sur un tableau : le chat au centre,
          un halo menthe derrière, les gestes courants juste en dessous. */}
      {/* L'accueil : un salut en italique, deux halos sauge, le chat au centre. */}
      <header className="accueil relative text-center pt-[10vh] max-md:pt-6">
        <div aria-hidden="true" className="accueil-halo-a" />
        <div aria-hidden="true" className="accueil-halo-b" />
        <h1 className="relative m-0 text-[40px] max-md:text-[30px] font-normal italic tracking-[-.01em] leading-[1.1] text-white" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
          {salut}
        </h1>
      </header>

      {/* Le stockage, tant qu'il n'est pas sûr : on ne découvre pas la perte après coup. */}
      {sante?.hebergeur === "render" && !sante?.base?.persistante && (
        <div className="mt-8 border rounded-xl px-5 py-4" style={{ borderColor: "#e8746a66", background: "#0f1114" }}>
          <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-alerte">La base sera effacée au prochain déploiement</p>
          <p className="m-0 mt-1.5 text-[13.5px] leading-[1.6] text-craie">{sante.base?.diagnostic}</p>
          <p className="m-0 mt-1.5 text-[12px] text-brume">
            Chemin : {sante.base?.emplacement} · déclaré : {sante.base?.declaree ? "oui" : "non"} · disque monté : {sante.base?.disque_monte ? "oui" : "non"}
          </p>
        </div>
      )}

      {/* Le chat, centré et pas plus large qu'une page : on le lit d'un regard. */}
      {chat && <div className="relative mt-11 max-md:mt-8 max-w-[900px] mx-auto">{chat}</div>}

      <div className={REGLE} />

      {/* Ce qui est dû : rappels, promesses des agents, relances de dossiers.
          Avant « Reprenez là où vous en étiez » : ce qui attend passe avant ce
          qu'on avait laissé en plan. */}
      <CeQuiVousAttend />

      <div className={REGLE} />

      {/* Là où on en était : les derniers dossiers et projets ouverts. */}
      <ReprisePlace />
    </div>
  );
}
