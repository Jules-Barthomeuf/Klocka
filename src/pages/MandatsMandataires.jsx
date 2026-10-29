import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { EnTeteListe, LigneDocument, Vignette } from "@/components/ui/liste-documents";
import { euros } from "@/components/mandataire/kit";
import { DocumentMandat } from "@/components/mandataire/ApercuMandat";
import { DocumentTelephone } from "@/components/mandataire/GenerationDocument";
import { PointNouveau } from "@/components/conversations/DossiersMandataire";
import FilDossier from "@/components/mandataire/FilDossier";

// Les mandats des mandataires, côté Klocka (27 oct. 2026, Jules : « on reçoit le mandat créé sur la plateforme par
// le mandataire, c'est nous qui devons le mettre dans MyNotary et lui envoyer »). Sans automatisme : on lit le
// mandat, on le saisit sur MyNotary et on l'envoie en signature ; une fois signé, on joint le PDF dans la conversation ;
// le mandataire passe à l'étape suivante ; on l'inscrit au registre. Ce qui attend un geste de Klocka passe en tête.

const API = "/api/mandataire/admin/mandats";
const ETATS = {
  demande_envoyee: ["À saisir sur MyNotary", "text-ambre"],
  pret: ["Signé et envoyé au mandataire", "text-ardoise"],
  signe: ["Signé : à inscrire au registre", "text-ambre"],
  enregistre: ["Inscrit au registre", "text-menthe"],
};
const honoraires = (m) => (m.honoraires == null ? null : `honoraires ${m.honoraires}${Number(m.honoraires) <= 100 ? " %" : " €"}${m.honoraires_charge === "acquereur" ? " acquéreur" : ""}`);

export default function MandatsMandataires() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: ["k-mandats"], queryFn: () => base44.request("GET", API), refetchInterval: 30_000 });
  const mandats = data?.mandats || [];
  const ouvert = params.get("mandat");
  // La conversation se charge en même temps que la liste (une notification ouvre le mandat directement), et au survol
  // d'une ligne : elle est là au clic.
  const queryClient = useQueryClient();
  const precharger = (id) => queryClient.prefetchQuery({ queryKey: ["fil-dossier", `${API}/${id}`, "analyste"], queryFn: () => base44.request("GET", `${API}/${id}/fil?lire=0`), staleTime: 10_000 });
  useEffect(() => { if (ouvert) precharger(ouvert); }, [ouvert]);
  const ouvrir = (id) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("mandat", id); else n.delete("mandat"); return n; });
  const m = mandats.find((x) => x.id === ouvert) || null;
  if (ouvert && m) return <Mandat m={m} onFermer={() => ouvrir(null)} />;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 md:px-6 max-md:py-6">
      <header className="mb-8 flex flex-col items-center gap-2 text-center">
        <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre max-md:text-[26px]">Mandats</h1>
        <p className="m-0 max-w-[60ch] text-[14px] text-ardoise">Les mandats préparés par les mandataires. Saisissez-les sur MyNotary et envoyez-les en signature, joignez le mandat signé dans la conversation, puis inscrivez-le au registre.</p>
      </header>
      {isLoading ? <Chargement taille="grand" /> : !mandats.length ? (
        <p className="py-16 text-center text-sm text-brume">Aucun mandat reçu : ils arrivent ici quand un mandataire envoie le sien.</p>
      ) : (
        <div className="border-y border-trait">
          <EnTeteListe droite="Où il en est" />
          {mandats.map((x) => {
            const [mot, teinte] = ETATS[x.statut] || [x.statut, "text-ardoise"];
            return (
              <div key={x.id} onMouseEnter={() => precharger(x.id)} onFocus={() => precharger(x.id)}>
              <LigneDocument onOuvrir={() => ouvrir(x.id)} modifie={x.activite}
                titre={<span className="inline-flex items-center gap-2">{x.bien}<PointNouveau n={x.non_lus} /></span>}
                detail={[x.vendeur, x.prix ? euros(x.prix) : null, honoraires(x), x.type, x.duree_mois ? `${x.duree_mois} mois` : null].filter(Boolean).join(" · ")}
                vignette={<Vignette page bandeau="bg-ardoise" titre={x.bien} />}
                auteur={<span className="block truncate text-[14px] text-craie">{x.mandataire_nom}</span>}
                droite={<span className={`text-[14px] ${teinte}`}>{mot}{x.statut === "enregistre" && x.numero_registre ? `, n° ${x.numero_registre}` : ""}</span>} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Un mandat ouvert : le fil avec le mandataire et les gestes à gauche, le mandat à droite (au téléphone, en plein écran). */
function Mandat({ m, onFermer }) {
  const large = useEcranLarge();
  useEffect(() => {
    if (!large) return undefined;
    document.documentElement.classList.add("k-sans-barre");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-barre");
  }, [large]);
  const document_ = (
    <div className="h-full min-h-0 overflow-y-auto px-6 py-8 max-md:px-3 max-md:py-4">
      <DocumentMandat q={m.questionnaire || {}} numero={m.numero_registre} />
    </div>
  );
  const colonne = (
    <div className={large ? "flex h-[100dvh] min-h-0 min-w-0 flex-col" : "flex flex-col gap-4 px-4 py-4"}>
      <div className={`flex flex-none items-center gap-3 ${large ? "h-14 border-b border-trait px-5" : ""}`}>
        <button type="button" onClick={onFermer} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          <ArrowLeft className="h-4 w-4" /> Mandats
        </button>
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-encre">{m.bien}</span>
      </div>
      <div className={large ? "flex min-h-0 flex-1 flex-col gap-4 px-5 py-4" : "flex flex-col gap-4"}>
        <Gestes m={m} />
        {!large && <DocumentTelephone enLigne libelle="Voir le mandat">{document_}</DocumentTelephone>}
        <div className={large ? "min-h-0 flex-1" : ""}>
          <FilDossier api={`${API}/${m.id}`} cote="analyste" plein={large} titre={`Avec ${m.mandataire_nom}`}
            vide="Saisissez le mandat sur MyNotary et envoyez-le en signature. Une fois signé, joignez ici le PDF." />
        </div>
      </div>
    </div>
  );
  if (!large) return colonne;
  return (
    <div className="grid h-[100dvh] grid-cols-[minmax(360px,440px)_minmax(0,1fr)] overflow-hidden">
      {colonne}
      <div className="flex min-h-0 min-w-0 flex-col border-l border-trait">
        <div className="flex h-14 flex-none items-center border-b border-trait px-5 text-[12.5px] text-ardoise">
          Le mandat tel que le mandataire l'a préparé : à reprendre dans MyNotary.
        </div>
        <div className="min-h-0 flex-1">{document_}</div>
      </div>
    </div>
  );
}

/** Ce que Klocka fait à chaque étape : déposer le mandat rédigé, puis inscrire le signé au registre. */
function Gestes({ m }) {
  const queryClient = useQueryClient();
  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["k-mandats"] });
    queryClient.invalidateQueries({ queryKey: ["fil-dossier", `${API}/${m.id}`, "analyste"] });
  };
  const registre = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${m.id}/registre`),
    onSuccess: (r) => { rafraichir(); toast.success(`Inscrit au registre, n° ${r.mandat?.numero_registre || ""}`); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const [mot, teinte] = ETATS[m.statut] || [m.statut, "text-ardoise"];
  return (
    <div className="flex flex-none flex-col gap-3 rounded-[16px] border border-trait bg-rail px-4 py-3.5">
      <p className={`m-0 text-[14px] ${teinte}`}>{mot}{m.statut === "enregistre" && m.numero_registre ? `, n° ${m.numero_registre}` : ""}</p>
      <p className="m-0 text-[12.5px] text-ardoise">{[m.mandataire_nom, m.vendeur, m.vendeur_contact].filter(Boolean).join(" · ")}</p>
      {m.statut === "demande_envoyee" && <p className="m-0 text-[13px] text-craie">Saisissez-le sur MyNotary et envoyez-le en signature. Une fois signé, joignez le PDF dans la conversation avec le trombone : le mandataire peut alors passer à l'étape suivante.</p>}
      {m.statut === "signe" && (
        <button type="button" onClick={() => registre.mutate()} disabled={registre.isPending}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-full bg-menthe px-4 text-[13px] font-medium text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          {registre.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Inscrire au registre
        </button>
      )}
    </div>
  );
}

/** Un écran assez large pour le fil et le mandat côte à côte. */
function useEcranLarge() {
  const requete = "(min-width: 1024px)";
  const [large, setLarge] = useState(() => typeof window !== "undefined" && window.matchMedia(requete).matches);
  useEffect(() => {
    const q = window.matchMedia(requete);
    const changer = () => setLarge(q.matches);
    q.addEventListener("change", changer);
    return () => q.removeEventListener("change", changer);
  }, []);
  return large;
}
