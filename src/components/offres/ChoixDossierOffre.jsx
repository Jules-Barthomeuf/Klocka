import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { etapeEnCours } from "@/lib/dossiers-architecture";

// « Préparer une offre » depuis l'Assistant (26 nov. 2026, Jules : « on ne sait pas encore sur quel dossier : c'est logique
// d'arriver sur la page des offres pour dire sur quel dossier on va faire l'offre ») : on choisit le dossier, et on arrive
// sur son étape Offre, la même page que depuis le dossier (le chat demande l'acheteur et le prix, la lettre à droite).
// Les projets qui n'ont pas de dossier restent choisissables : leur offre se prépare ici, dans le chat de la page.

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ouvre l'étape Offre d'un dossier (la vue que le dossier relit en arrivant). */
export function ouvrirOffreDuDossier(navigate, dealId) {
  try { sessionStorage.setItem(`klocka_vue_${dealId}`, "offre"); } catch { /* le dossier s'ouvre sur son étape */ }
  navigate(`/Dossiers?deal_id=${encodeURIComponent(dealId)}`);
}

function Carte({ photo, titre, detail, onClick }) {
  return (
    <button type="button" onClick={onClick} title={titre}
      className="group flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-bord-doux bg-[var(--k-surface)] text-left transition-colors hover:border-bord-vif">
      <span className="block h-[92px] w-full flex-none overflow-hidden bg-encre/[0.05]">
        {photo && <img src={photo} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-3.5 py-3">
        <span className="line-clamp-2 text-[14px] leading-[1.35] text-encre">{titre}</span>
        {detail && <span className="truncate text-[12px] text-ardoise">{detail}</span>}
      </span>
    </button>
  );
}

export default function ChoixDossierOffre({ onProjet }) {
  const navigate = useNavigate();
  const [cherche, setCherche] = useState("");
  const q = cherche.trim();
  const dossiers = useQuery({
    queryKey: ["preanalyse-pipeline", "offre", q],
    queryFn: () => base44.request("GET", `/api/preanalyse/pipeline?page=1&q=${encodeURIComponent(q)}`),
    staleTime: 30_000, placeholderData: (avant) => avant,
  });
  const projets = useQuery({ queryKey: ["projets-sans-dossier"], queryFn: () => base44.entities.Project.list(), staleTime: 60_000 });
  const listeDossiers = (dossiers.data?.deals || dossiers.data?.dossiers || dossiers.data?.lignes || []).filter((d) => d && d.statut !== "abandonne").slice(0, 12);
  const sansDossier = useMemo(() => (projets.data || [])
    .filter((p) => !p.deal_id && !p.archive && p.statut !== "archive")
    .filter((p) => !q || norm([p.titre, p.adresse_complete, p.nom_locataire].join(" ")).includes(norm(q)))
    .slice(0, 8), [projets.data, q]);
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col items-center text-center">
      <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>Sur quel dossier ?</h1>
      <p className="m-0 mt-2 max-w-[56ch] text-[14px] text-ardoise">L'offre se prépare dans le dossier : la lettre s'ouvre avec ce qu'il sait déjà, le chat demande l'acheteur et le prix.</p>
      <label className="mt-6 flex w-full max-w-[520px] items-center gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 text-left focus-within:border-bord-doux">
        <Search className="h-4 w-4 flex-none text-ardoise" />
        <input autoFocus value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Adresse, ville, enseigne" aria-label="Chercher un dossier"
          className="w-full border-none bg-transparent text-[14.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
      </label>
      <div className="mt-6 grid w-full grid-cols-2 gap-3 text-left sm:grid-cols-3 lg:grid-cols-4">
        {listeDossiers.map((d) => (
          <Carte key={d.deal_id} photo={d.photo} titre={d.titre || d.nom_fichier || "Dossier"} detail={etapeEnCours(d)?.label || null}
            onClick={() => ouvrirOffreDuDossier(navigate, d.deal_id)} />
        ))}
      </div>
      {!dossiers.isLoading && !listeDossiers.length && <p className="m-0 mt-4 text-[13.5px] text-brume">{q ? "Aucun dossier ne correspond." : "Aucun dossier pour l'instant."}</p>}
      {sansDossier.length > 0 && (
        <div className="mt-8 w-full text-left">
          <p className="m-0 mb-3 text-[13.5px] text-ardoise">Projets sans dossier</p>
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {sansDossier.map((p) => (
              <Carte key={p.id} photo={(p.photos || []).map((x) => (typeof x === "string" ? x : x?.url)).find(Boolean) || null}
                titre={p.titre || p.adresse_complete || "Projet"} detail={p.adresse_complete || null} onClick={() => onProjet(p)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
