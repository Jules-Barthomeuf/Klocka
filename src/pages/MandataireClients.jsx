import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

// Recherche des clients Klocka (spécification V1, page 6 ; maquette du
// 1er octobre 2026). À gauche, les demandes triées par commerces à
// prospecter ; à droite, la demande ouverte : ce qu'elle cherche, où, à quel
// prix, et ce que le secteur du mandataire a pour elle. Les clients restent
// anonymes : jamais un nom, un mail ou une société.

const kEuros = (n) => (n == null ? null : `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`);

// Des murs commerciaux, toujours : inutile de l'écrire. Le titre d'une
// demande, c'est OÙ le client cherche ; le type de commerce vient ensuite.
const zonesDe = (d) => (d.zones?.length ? d.zones.join(", ") : "Toute la France");
const typeDe = (d) => (d.type_commerce ? d.type_commerce.charAt(0).toUpperCase() + d.type_commerce.slice(1) : null);

/** La date d'entrée du client (celle de Monday), précise : « 12 mars 2026 ». */
const entreLe = (d) => {
  const t = Date.parse(d.entre_le || "");
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
};

function budget(d) {
  if (d.budget_min && d.budget_max) return `${Math.round(d.budget_min / 1000).toLocaleString("fr-FR")} – ${kEuros(d.budget_max)}`;
  return kEuros(d.budget_max || d.budget_min) || "—";
}

export default function MandataireClients() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["mandataire-demandes"], queryFn: () => base44.request("GET", "/api/mandataire/demandes") });
  const demandes = useMemo(
    () => [...(data?.demandes || [])].sort((a, b) => (b.a_prospecter ?? 0) - (a.a_prospecter ?? 0) || (b.depuis_jours ?? 0) - (a.depuis_jours ?? 0)),
    [data]
  );
  const [choisie, setChoisie] = useState(null);
  useEffect(() => {
    if (!choisie && demandes.length) setChoisie(demandes[0].id);
  }, [demandes, choisie]);
  const d = demandes.find((x) => x.id === choisie) || null;

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-10 md:px-10 max-md:pt-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(26px, 2.6vw, 36px)" }}>
            Recherche des clients Klocka
          </h1>
          <p className="m-0 mt-2 text-[15px] text-ardoise">Les clients restent anonymes. Vous trouvez le bien, Klocka fait le lien avec eux.</p>
        </div>
        {demandes.length > 0 && <p className="m-0 text-[14.5px] text-craie">{demandes.length} demande{demandes.length > 1 ? "s" : ""} active{demandes.length > 1 ? "s" : ""}</p>}
      </header>

      {isLoading && <p className="m-0 mt-10 text-[14px] text-brume">Lecture…</p>}
      {!isLoading && !demandes.length && (
        <p className="m-0 mt-10 text-[14px] text-brume">Aucune demande ouverte pour l'instant. Elles apparaissent ici dès que Klocka en publie.</p>
      )}

      {demandes.length > 0 && (
        <div className="mt-9 grid items-start gap-10 lg:grid-cols-[360px_minmax(0,1fr)] max-lg:gap-6">
          {/* Les demandes : celles qui ont le plus à prospecter en tête. */}
          <nav aria-label="Demandes des clients">
            <p className="m-0 mb-2 px-4 text-[12.5px] text-brume">Triées par commerces à prospecter</p>
            {demandes.map((x) => {
              const actif = x.id === choisie;
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setChoisie(x.id)}
                  aria-current={actif ? "true" : undefined}
                  className={`flex w-full items-center gap-4 rounded-[14px] border px-4 py-3.5 text-left transition-colors ${actif ? "border-trait bg-barre-relief" : "border-transparent hover:bg-encre/[0.03]"}`}
                  style={actif ? undefined : { background: "transparent" }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] text-encre">{[x.reference, entreLe(x)].filter(Boolean).join(" · ")}</span>
                    <span className="mt-0.5 block truncate text-[13.5px] text-ardoise">{[zonesDe(x), typeDe(x)].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className={`flex-none text-[16px] tabular-nums ${actif ? "text-menthe" : "text-ardoise"}`}>{x.a_prospecter ?? x.commerces_du_secteur ?? 0}</span>
                </button>
              );
            })}
          </nav>

          {/* La demande ouverte. */}
          {d && (
            <section key={d.id} className="animate-in fade-in duration-200 rounded-[24px] border border-trait bg-surface-pleine px-12 py-10 max-md:px-5 max-md:py-6">
              <p className="m-0 text-[14.5px] text-ardoise">
                {[d.reference, d.profil, entreLe(d) ? `entré le ${entreLe(d)}` : null].filter(Boolean).join(" · ")}
              </p>
              <h2 className="m-0 mt-3 font-normal leading-[1.1] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(28px, 3vw, 42px)" }}>{zonesDe(d)}</h2>
              {typeDe(d) && <p className="m-0 mt-3 text-[16px] text-craie">{typeDe(d)}</p>}

              <div className="mt-8 grid gap-6 border-t border-trait pt-8 sm:grid-cols-4 max-sm:grid-cols-2">
                <Fait mot="Budget" valeur={budget(d)} />
                <Fait mot="Apport possible" valeur={kEuros(d.apport) || "—"} />
                <Fait mot="Rendement minimum" valeur={d.rendement_min ? `${String(d.rendement_min).replace(".", ",")} %` : "—"} />
                <Fait mot="Bail" valeur={d.bail || "—"} petit />
              </div>

              {(d.remarque || d.information) && (
                <div className="mt-8 border-t border-trait pt-6">
                  <p className="m-0 text-[11.5px] uppercase tracking-[.14em] text-brume">Remarques de l'équipe</p>
                  {d.remarque && <p className="m-0 mt-2 whitespace-pre-line text-[14.5px] leading-[1.65] text-craie">{d.remarque}</p>}
                  {d.information && <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-ardoise">{d.information}</p>}
                </div>
              )}

              <div className="mt-8 grid overflow-hidden rounded-[16px] border border-trait sm:grid-cols-3" style={{ background: "rgb(var(--k-fond-rgb) / 0.5)" }}>
                <Compte n={d.commerces_du_secteur ?? 0} mot="correspondent dans votre secteur" />
                <Compte n={d.dans_ma_liste ?? 0} mot="déjà dans votre liste" />
                <Compte n={d.a_prospecter ?? 0} mot="à prospecter" accent />
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-5">
                <p className="m-0 max-w-[46ch] text-[14.5px] leading-[1.6] text-ardoise">
                  Vous ne contactez pas ce client. Quand vous trouvez un bien, Klocka fait le lien.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`${createPageUrl("MandataireProspection")}?demande=${d.id}`)}
                  className="inline-flex h-12 items-center rounded-full bg-menthe-pale px-7 text-[15.5px] font-medium text-sur-menthe-pale transition-opacity hover:opacity-90"
                >
                  Prospecter pour ce client
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

const Fait = ({ mot, valeur, petit = false }) => (
  <div>
    <p className="m-0 text-[14px] text-ardoise">{mot}</p>
    <p className={`m-0 mt-1.5 leading-[1.45] text-encre ${petit ? "text-[16px]" : "text-[22px] tabular-nums"}`}>{valeur}</p>
  </div>
);

const Compte = ({ n, mot, accent = false }) => (
  <div className="border-trait px-7 py-6 [&:not(:first-child)]:border-l max-sm:[&:not(:first-child)]:border-l-0 max-sm:[&:not(:first-child)]:border-t">
    <p className={`m-0 text-[30px] font-light leading-none tabular-nums ${accent ? "text-menthe" : "text-encre"}`}>{n}</p>
    <p className="m-0 mt-2.5 text-[14px] leading-[1.45] text-ardoise">{mot}</p>
  </div>
);
