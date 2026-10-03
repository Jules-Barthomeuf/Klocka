import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CarteProjet from "@/components/projet/CarteProjet";
import { euros } from "@/components/mandataire/kit";

// Projets — ceux de la plateforme, tels que les clients les voient : les
// siens (nés de ses dossiers) et tous les autres projets disponibles, sans
// rien qui dise qui les a apportés, qui a le mandat, ni pour quel client.

const FILTRES = [["tous", "Tous"], ["mes", "Mes projets"], ["autres", "Les autres"]];

export default function MandataireProjets() {
  const { data, isLoading } = useQuery({ queryKey: ["m-projets"], queryFn: () => base44.request("GET", "/api/mandataire/projets") });
  const [filtre, setFiltre] = useState("tous");
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState(null);
  const projets = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    const liste = filtre === "mes" ? data?.mes || [] : filtre === "autres" ? data?.autres || [] : [...(data?.mes || []), ...(data?.autres || [])];
    return liste.filter((p) => !t || `${p.titre || ""} ${p.adresse_complete || ""} ${p.ville_secteur_champ1 || ""} ${p.activite_locataire || ""}`.toLowerCase().includes(t));
  }, [data, filtre, recherche]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 py-6 md:px-10 md:py-9">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre">Projets</h1>
          <p className="m-0 mt-2 max-w-[62ch] text-[14px] leading-[1.6] text-craie">Les biens présentés aux investisseurs de Klocka, comme ils les voient. Les vôtres, et tous les autres.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full bg-rail-actif p-1">
            {FILTRES.map(([cle, mot]) => (
              <button key={cle} type="button" onClick={() => setFiltre(cle)} aria-pressed={filtre === cle}
                className={`rounded-full px-3.5 py-1.5 text-[13px] ${filtre === cle ? "bg-surface-pleine text-encre" : "text-ardoise"}`} style={filtre === cle ? undefined : { background: "transparent" }}>
                {mot}{cle === "mes" && data ? ` · ${data.mes.length}` : ""}
              </button>
            ))}
          </div>
          <div className="flex min-w-[220px] items-center gap-2 rounded-full border border-trait bg-surface-pleine px-4 py-2">
            <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Ville, activité…" className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>
      ) : !projets.length ? (
        <p className="py-20 text-center text-[14px] text-brume">{filtre === "mes" ? "Aucun projet né de vos dossiers pour l'instant : il apparaîtra ici au Go de Klocka." : "Aucun projet à montrer."}</p>
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {projets.map((p) => (
            <div key={p.id} className="relative">
              {p.mien && <span className="absolute left-3 top-3 z-10 rounded-full bg-menthe px-2.5 py-0.5 text-[11.5px] text-sur-menthe">Votre projet</span>}
              <CarteProjet project={p} onOuvrir={() => setOuvert(p)} />
              {p.mien && p.origine && <p className="m-0 mt-2 px-1 text-[12.5px] text-ardoise">Né de votre dossier « {p.origine.bien} »{p.origine.mandat_numero ? `, mandat n° ${p.origine.mandat_numero}` : ""}</p>}
            </div>
          ))}
        </div>
      )}
      {ouvert && <FicheProjet p={ouvert} onFermer={() => setOuvert(null)} />}
    </div>
  );
}

/** Le détail d'un projet : ses photos et ses chiffres, rien d'autre. */
function FicheProjet({ p, onFermer }) {
  const photos = (p.photos || []).map((x) => (typeof x === "string" ? x : x?.url)).filter(Boolean);
  const lignes = [
    ["Adresse", p.adresse_complete || p.ville_secteur_champ1],
    ["Prix", p.sim_prix_bien_fai || p.prix_acquisition ? euros(p.sim_prix_bien_fai || p.prix_acquisition) : null],
    ["Loyer annuel HT", p.loyer_annuel_ht || p.sim_loyer_initial_ht ? euros(p.loyer_annuel_ht || p.sim_loyer_initial_ht) : null],
    ["Rendement", p.rendement_locatif ? `${String(p.rendement_locatif).replace(".", ",")} %` : null],
    ["Surface", p.surface_m2 || p.sim_surface ? `${p.surface_m2 || p.sim_surface} m²` : null],
    ["Locataire", [p.nom_locataire, p.activite_locataire].filter(Boolean).join(" · ") || null],
    ["Fin du bail", p.echeance_bail || null],
  ].filter(([, v]) => v);
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center px-4" style={{ background: "rgb(var(--k-encre-rgb) / 0.35)" }} onClick={onFermer}>
      <div className="relative max-h-[88vh] w-full max-w-[720px] overflow-y-auto rounded-[20px] border border-trait k-grid" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-surface-pleine text-ardoise hover:text-encre"><X className="h-4 w-4" /></button>
        {photos[0] && <img src={photos[0]} alt="" className="h-[300px] w-full object-cover" />}
        <div className="px-6 py-5">
          <p className="m-0 text-[20px] text-encre">{p.titre}</p>
          {p.mien && <p className="m-0 mt-1 text-[12.5px] text-menthe">Votre projet{p.origine ? ` · né de votre dossier « ${p.origine.bien} »${p.origine.mandat_numero ? `, mandat n° ${p.origine.mandat_numero}` : ""}` : ""}</p>}
          <dl className="m-0 mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {lignes.map(([k, v]) => (
              <div key={k} className="border-t border-trait py-2.5">
                <dt className="text-[11.5px] uppercase tracking-[.1em] text-brume">{k}</dt>
                <dd className="m-0 mt-0.5 text-[14px] text-encre">{v}</dd>
              </div>
            ))}
          </dl>
          {photos.length > 1 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {photos.slice(1, 7).map((u) => <img key={u} src={u} alt="" className="h-24 w-full rounded-[10px] object-cover" />)}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
