import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/components/hooks/useCurrentUser";
import Deck from "@/components/presentations/Deck";
import EditeurPresentation from "@/components/presentations/EditeurPresentation";
import Chargement from "@/components/ui/Chargement";

// Présentations, côté client (13 oct. 2026, Jules) : les dossiers bancaires
// que l'équipe Klocka lui a envoyés. Une présentation ouverte prend toute la
// page : l'éditeur seul, sans le chat (édition, lecture, sources, plein écran),
// ses retouches enregistrées d'elles-mêmes, et « Une question » qui arrive dans
// le Feedback de l'équipe. L'équipe, en vue client, les voit toutes dès leur
// création, avec leurs destinataires ou « pas encore envoyée ». La liste : la
// première diapositive en grand, un clic l'ouvre (13 oct. 2026, Jules).

export default function MesPresentations() {
  const [params, setParams] = useSearchParams();
  const ouverte = params.get("presentation");
  const ouvrir = (id) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("presentation", id); else n.delete("presentation"); return n; });
  const { data: user } = useCurrentUser();
  const equipe = user?.role === "admin";
  const { data, isLoading } = useQuery({ queryKey: ["presentations-client"], queryFn: () => base44.request("GET", "/api/client/presentations") });
  const presentations = data?.presentations || [];

  // Ouverte, elle prend l'écran entier : la barre latérale s'efface, comme pour un éditeur.
  useEffect(() => {
    if (!ouverte) return undefined;
    document.documentElement.classList.add("k-sans-barre");
    return () => document.documentElement.classList.remove("k-sans-barre");
  }, [ouverte]);

  if (ouverte) {
    return (
      <div className="h-[100dvh] w-full">
        <EditeurPresentation key={ouverte} id={ouverte} client onFermer={() => ouvrir(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-6 md:px-10 md:py-9">
      <header className="flex flex-col items-center pt-[6vh] text-center max-md:pt-4">
        <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>Vos présentations</h1>
        <p className="m-0 mt-2 max-w-[56ch] text-[14px] text-ardoise">Les dossiers de financement préparés par Klocka : relisez-les, retouchez-les, vérifiez chaque chiffre et présentez-les depuis l'application.</p>
      </header>
      <div className="mt-[6vh]">
        {isLoading ? (
          <Chargement taille="grand" />
        ) : !presentations.length ? (
          <p className="py-16 text-center text-[14px] text-brume">{equipe ? "Aucune présentation pour l'instant : elles apparaissent ici dès leur création." : "Aucune présentation pour l'instant : Klocka vous l'enverra ici dès qu'elle sera prête."}</p>
        ) : (
          <div className="mx-auto flex max-w-[960px] flex-col gap-10">
            {presentations.map((p) => (
              <div key={p.id}>
                <button type="button" onClick={() => ouvrir(p.id)} aria-label={`Ouvrir ${p.titre}`}
                  className="group relative block aspect-[16/9] w-full overflow-hidden rounded-[18px] border border-trait bg-rail text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-bord-vif" style={{ padding: 0 }}>
                  {p.premiere ? (
                    <div className="pb-apercu pointer-events-none absolute inset-0">
                      <Deck diapos={[p.premiere]} courante={p.premiere.id} onCourante={() => {}} mode="lecture" relief={0} onChange={() => {}} onPhoto={() => {}} />
                    </div>
                  ) : (
                    <span className="grid h-full place-items-center text-[14px] text-brume">{p.titre}</span>
                  )}
                </button>
                <div className="mt-3 flex items-baseline justify-between gap-4 px-1">
                  <span className="min-w-0 truncate text-[15px] text-encre">{p.titre}</span>
                  <span className="flex-none text-[12.5px] text-ardoise">{equipe ? (p.envoye_a?.length ? `envoyée à ${p.envoye_a.join(", ")}` : "pas encore envoyée") : `${p.diapos} diapositive${p.diapos > 1 ? "s" : ""}`}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
