import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, ArrowUpRight, Check, FileWarning, Loader2, Scale } from "lucide-react";

// La page d'entrée de l'étape Analyse : le dossier, pas les documents.
//
// Vingt pièces décrivent un seul bien. On lit donc, dans cet ordre : le bien
// en huit lignes sourcées, ce que les documents se contredisent, ce qui manque
// à réclamer au vendeur, et les points qui changent la décision ou le prix.
// Les tables document par document viennent après — elles servent à vérifier.

const Bloc = ({ titre, compte, teinte, enfants, vide }) => (
  <section className="min-w-0">
    <div className="flex items-baseline gap-2.5 pb-2.5 mb-3 border-b border-[#1e1e22]">
      <p className="m-0 text-[11px] tracking-[.16em] uppercase font-semibold" style={{ color: teinte }}>{titre}</p>
      {compte != null && <span className="text-[11px] tabular-nums" style={{ color: teinte }}>{compte}</span>}
    </div>
    {enfants || <p className="m-0 text-[13px] text-[#6c6c74]">{vide}</p>}
  </section>
);

// D'où vient une valeur : le document, la page. Un clic ouvre la pièce.
function Source({ source }) {
  if (!source?.document) return null;
  return (
    <span className="text-[11.5px] text-[#6c6c74]" title={source.citation || source.element || undefined}>
      {source.document}
      {source.page ? ` · p. ${source.page}` : ""}
    </span>
  );
}

export default function LectureDossier({ dealId, nbExtractions = 0 }) {
  const { data, isLoading } = useQuery({
    queryKey: ["lecture-dossier", dealId, nbExtractions],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/lecture`),
    enabled: !!dealId,
  });

  if (isLoading) {
    return (
      <p className="m-0 py-8 text-[13px] text-[#8f959e] inline-flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Je croise les documents…
      </p>
    );
  }
  if (!data) return null;

  const { fiche = [], contradictions = [], manquantes = [], a_trancher = [], a_classer = 0 } = data;
  const renseignees = fiche.filter((f) => f.affiche).length;
  const essentiellesManquantes = manquantes.filter((m) => m.essentiel);

  return (
    <div className="space-y-9">
      {/* --- Le bien, en huit lignes --------------------------------------- */}
      <Bloc titre="Le bien" compte={`${renseignees}/${fiche.length}`} teinte="#8f959e"
        enfants={
          <dl className="m-0">
            {fiche.map((f) => (
              <div key={f.cle} className="flex items-baseline gap-4 py-2 border-b border-[#1e1e22]/70">
                <dt className="w-[190px] max-md:w-[130px] flex-none text-[12.5px] text-[#77777e]">{f.libelle}</dt>
                <dd className={`m-0 flex-1 min-w-0 text-[14px] leading-[1.6] ${f.affiche ? "text-[#f2f3f5]" : "text-[#4d545d] italic"}`}>
                  {f.affiche || "non renseigné"}
                </dd>
                <div className="flex-none max-w-[34%] text-right truncate"><Source source={f.source} /></div>
              </div>
            ))}
          </dl>
        }
      />

      {/* --- Ce que les documents se contredisent --------------------------- */}
      <Bloc
        titre="Contradictions entre documents"
        compte={contradictions.length || null}
        teinte={contradictions.length ? "#e8927c" : "#8f959e"}
        vide="Aucune : les documents disent la même chose là où ils se recoupent."
        enfants={
          contradictions.length ? (
            <div className="space-y-4">
              {contradictions.map((c) => (
                <div key={c.sujet} className="rounded-xl border border-[#e8927c]/30 bg-[#e8927c]/[0.04] px-5 py-4">
                  <p className="m-0 flex items-center gap-2 text-[15px] font-semibold text-[#f2f3f5]">
                    <AlertTriangle className="w-4 h-4 text-[#e8927c]" /> {c.sujet}
                    <span className="text-[12.5px] font-normal text-[#e8b04c]">— {c.ecart}</span>
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-x-8 gap-y-1.5">
                    {c.valeurs.map((v, i) => (
                      <span key={i} className="text-[13.5px] text-[#b5b5bd]">
                        <span className="text-[#f2f3f5] font-medium tabular-nums">{v.affiche}</span>
                        <span className="text-[#6c6c74]"> — {v.document}{v.page ? ` p. ${v.page}` : ""}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null
        }
      />

      {/* --- Ce qui manque -------------------------------------------------- */}
      <Bloc
        titre="Pièces à réclamer"
        compte={manquantes.length || null}
        teinte={essentiellesManquantes.length ? "#e8b04c" : "#8f959e"}
        vide="La data room est complète."
        enfants={
          manquantes.length ? (
            <>
              <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                {manquantes.map((m) => (
                  <li key={m.cle} className="flex items-start gap-2.5 py-1.5 text-[13.5px]">
                    <FileWarning className={`w-3.5 h-3.5 mt-[3px] flex-none ${m.essentiel ? "text-[#e8b04c]" : "text-[#4d545d]"}`} />
                    <span className={m.essentiel ? "text-[#f2f3f5]" : "text-[#8f959e]"}>{m.libelle}</span>
                  </li>
                ))}
              </ul>
              <p className="m-0 mt-3 text-[12px] text-[#6c6c74]">
                {essentiellesManquantes.length} pièce{essentiellesManquantes.length > 1 ? "s" : ""} essentielle
                {essentiellesManquantes.length > 1 ? "s" : ""} sur {manquantes.length} manquante{manquantes.length > 1 ? "s" : ""} — à demander au vendeur.
              </p>
            </>
          ) : null
        }
      />

      {/* --- Ce qu'il faut trancher ----------------------------------------- */}
      <Bloc
        titre="À trancher"
        compte={a_trancher.length || null}
        teinte={a_trancher.length ? "#e8927c" : "#8f959e"}
        vide="Rien qui pèse sur la décision dans ce qui a été lu."
        enfants={
          a_trancher.length ? (
            <div className="space-y-5">
              {a_trancher.map((p, i) => (
                <div key={i} className="flex gap-3">
                  <Scale className="w-4 h-4 mt-1 flex-none text-[#e8927c]" />
                  <div className="min-w-0">
                    <p className="m-0 text-[15px] font-semibold text-[#f2f3f5]">{p.element}</p>
                    <p className="m-0 mt-1 text-[13.5px] leading-[1.65] text-[#b5b5bd]">{p.constat}</p>
                    {p.commentaire && <p className="m-0 mt-1 text-[13px] leading-[1.6] text-[#e8b04c]">→ {p.commentaire}</p>}
                    <p className="m-0 mt-1"><Source source={p.source} /></p>
                  </div>
                </div>
              ))}
            </div>
          ) : null
        }
      />

      {a_classer > 0 && (
        <p className="m-0 flex items-center gap-2 text-[12.5px] text-[#e8b04c]">
          <ArrowUpRight className="w-3.5 h-3.5" />
          {a_classer} document{a_classer > 1 ? "s" : ""} sans catégorie : classez-{a_classer > 1 ? "les" : "le"} dans l'onglet Documents pour qu'
          {a_classer > 1 ? "ils entrent" : "il entre"} dans la lecture croisée.
        </p>
      )}

      {data.analyses === 0 && (
        <p className="m-0 flex items-center gap-2 text-[13px] text-[#8f959e]">
          <Check className="w-3.5 h-3.5" /> Aucun document analysé pour l'instant : la lecture se remplira au fur et à mesure.
        </p>
      )}
    </div>
  );
}
