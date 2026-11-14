import React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import OngletsSuivi from "@/components/OngletsSuivi";
import { base44 } from "@/api/base44Client";
import { TitrePage } from "@/components/mandataire/elements";
import Chargement from "@/components/ui/Chargement";
import { toast } from "@/components/ui/avis";
import { VERRE } from "@/lib/verre";

// Suivi > Corrections (13 nov. 2026, Jules : « toutes les corrections loguées, et que ça les utilise pour s'améliorer ;
// mets-le dans Suivi, pour que je voie et qu'on aille plus loin ») : ce que la plateforme a appris (règles appliquées
// d'office aux prochains projets, chacune se coupe), ce qu'elle observe encore, puis chaque correction de l'équipe sur un
// projet rentré. Le serveur : server/corrections-projet.js.

const GENRES = {
  majuscule: "majuscule", minuscule: "minuscule", casse: "casse", forme: "mise en forme", chiffre: "chiffre corrigé",
  texte: "texte réécrit", ajout: "rempli à la main", retrait: "vidé",
};
const OBSERVE = {
  majuscule: (o) => `majuscule remise sur ${o.projets} projet${o.projets > 1 ? "s" : ""} ; règle à ${o.seuil}`,
  ajout: (o) => `rempli à la main sur ${o.projets} projet${o.projets > 1 ? "s" : ""} : l'agent ne le trouve pas`,
  chiffre: (o) => `chiffre corrigé sur ${o.projets} projet${o.projets > 1 ? "s" : ""}`,
  texte: (o) => `texte réécrit sur ${o.projets} projet${o.projets > 1 ? "s" : ""}`,
  retrait: (o) => `vidé sur ${o.projets} projet${o.projets > 1 ? "s" : ""}`,
};
const date = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const prenom = (email) => { const p = String(email || "").split("@")[0].split(/[._-]/)[0]; return p ? p[0].toUpperCase() + p.slice(1) : "—"; };
const valeur = (v) => (v == null || v === "" ? <span className="text-brume">vide</span> : <span className="text-encre">« {String(v)} »</span>);

function Section({ titre, sous = null, children }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[20px] font-normal text-encre">{titre}</h2>
        {sous && <span className="text-[12.5px] text-ardoise">{sous}</span>}
      </div>
      {children}
    </section>
  );
}

const Vide = ({ children }) => <p className={`${VERRE} m-0 px-5 py-4 text-[13.5px] text-ardoise`}>{children}</p>;

export default function SuiviCorrections() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["suivi-corrections"], queryFn: () => base44.request("GET", "/api/monitoring/corrections") });
  const couper = useMutation({
    mutationFn: ({ cle, coupee }) => base44.request("POST", "/api/monitoring/corrections/regle", { cle, coupee }),
    onSuccess: (d, v) => { qc.setQueryData(["suivi-corrections"], d); toast.success(v.coupee ? "Règle coupée" : "Règle rallumée", { duration: 1800 }); },
    onError: (e) => toast.error("La règle n'a pas changé", { description: e?.message || "" }),
  });

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1100px] px-5 py-[22px] md:px-8">
        <OngletsSuivi className="mb-3 overflow-x-auto" />
        <TitrePage titre="Corrections" className="mb-2" />
        <p className="m-0 mb-6 max-w-[760px] text-[13.5px] leading-[1.55] text-ardoise">
          Ce que l'équipe corrige sur les projets rentrés par la plateforme. Une correction qui revient sur plusieurs projets devient une règle,
          appliquée d'office aux projets suivants ; chaque règle se coupe ici.
        </p>
        {error ? <p className="text-[13.5px] text-alerte">{error.message || "Accès refusé."}</p> : isLoading || !data ? <Chargement taille="grand" /> : (
          <div className="flex flex-col gap-9 pb-10">
            <p className="m-0 text-[13.5px] text-craie">{data.total} correction{data.total > 1 ? "s" : ""} sur {data.projets} projet{data.projets > 1 ? "s" : ""}</p>

            <Section titre="Ce que la plateforme a appris" sous={`une majuscule à partir de ${data.seuil} projets, un même remplacement à partir de 2`}>
              {data.regles.length ? (
                <ul className={`${VERRE} m-0 list-none divide-y divide-trait p-0`}>
                  {data.regles.map((r) => (
                    <li key={r.cle} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className={`text-[16px] ${r.active ? "text-encre" : "text-ardoise line-through"}`}>{r.phrase}</span>
                        <span className="text-[13.5px] text-ardoise">
                          Appris sur {r.projets} projets · {r.appliquee_n ? `appliquée ${r.appliquee_n} fois, la dernière le ${date(r.appliquee_le)}` : "pas encore appliquée"}
                        </span>
                      </div>
                      <button type="button" disabled={couper.isPending} onClick={() => couper.mutate({ cle: r.cle, coupee: r.active })}
                        className={r.active ? "h-9 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol" : "h-9 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-menthe hover:text-encre"}
                        style={r.active ? undefined : { background: "transparent" }}>
                        {r.active ? "Appliquée d'office" : "Coupée"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <Vide>Rien d'appris pour l'instant. Une majuscule remise sur {data.seuil} projets, ou un même texte remplacé sur 2, devient une règle.</Vide>}
            </Section>

            <Section titre="En observation" sous="ce qui revient, sans être encore une règle">
              {data.observations.length ? (
                <ul className={`${VERRE} m-0 list-none divide-y divide-trait p-0`}>
                  {data.observations.slice(0, 20).map((o) => (
                    <li key={`${o.champ}:${o.genre}`} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                      <span className="text-[15px] text-encre">{o.libelle}</span>
                      <span className="text-[13.5px] text-ardoise">{(OBSERVE[o.genre] || ((x) => `${x.projets} projets`))(o)}</span>
                    </li>
                  ))}
                </ul>
              ) : <Vide>Rien encore.</Vide>}
            </Section>

            <Section titre="Les corrections" sous={data.champs.length ? `les plus reprises : ${data.champs.slice(0, 4).map((c) => `${c.libelle} (${c.n})`).join(", ")}` : null}>
              {data.corrections.length ? (
                <ul className={`${VERRE} m-0 list-none divide-y divide-trait p-0`}>
                  {data.corrections.map((c) => (
                    <li key={c.id} className="flex flex-col gap-1 px-5 py-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[16px] text-encre">{c.libelle || c.champ}</span>
                        <span className="text-[12.5px] text-brume">{date(c.maj_le || c.le)} · {prenom(c.par)}</span>
                      </div>
                      <p className="m-0 text-[13.5px] leading-[1.5] text-ardoise">
                        {valeur(c.avant)} → {valeur(c.apres)}
                        <span className="ml-2 rounded-full border border-trait px-2 py-px text-[12px] text-craie">{GENRES[c.genre] || c.genre}</span>
                      </p>
                      {c.project_id && <Link to={`/Projet?id=${c.project_id}`} className="self-start text-[12.5px] text-menthe hover:underline">{c.titre || "Le projet"}</Link>}
                    </li>
                  ))}
                </ul>
              ) : <Vide>Aucune correction notée pour l'instant : elles arrivent dès qu'on modifie un projet rentré depuis un dossier.</Vide>}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
