import React, { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { prevenir } from "@/lib/notifications";

// Ce qui vous attend : les rappels que vous vous posez, les promesses des
// agents et les relances de dossiers, dans une seule liste datée.
//
// Trois registres existaient déjà, chacun dans son coin — donc on ne regardait
// aucun des trois. Ici la question est « qu'est-ce qui est dû », et la réponse
// tient en un bloc, du plus en retard au plus lointain.
//
// Un rappel arrivé à échéance pendant que la page est ouverte vous prévient.
// C'est la limite assumée de la notification navigateur : l'onglet doit vivre.

const GROUPES = [
  { cle: "retard", mot: "En retard", teinte: "#e8746a", garde: (l) => l.dans != null && l.dans < 0 },
  { cle: "aujourdhui", mot: "Aujourd'hui", teinte: "#d9b46a", garde: (l) => l.dans === 0 },
  { cle: "semaine", mot: "Cette semaine", teinte: "#96c0b8", garde: (l) => l.dans > 0 && l.dans <= 7 },
  { cle: "apres", mot: "Plus tard", teinte: "#3a3f4a", garde: (l) => l.dans > 7 },
];

// La nature d'une ligne, pour savoir d'un coup d'œil d'où elle vient.
const NATURES = {
  rappel: { mot: "rappel", teinte: "#96c0b8" },
  promesse: { mot: "promesse", teinte: "#d9b46a" },
  dossier: { mot: "relance", teinte: "#5a8db5" },
};

const quand = (dans, echeance) => {
  if (dans == null) return "sans date";
  if (dans < -1) return `en retard de ${-dans} jours`;
  if (dans === -1) return "en retard d'un jour";
  if (dans === 0) return "aujourd'hui";
  if (dans === 1) return "demain";
  if (dans <= 7) return `dans ${dans} jours`;
  return new Date(echeance).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
};

const telLisible = (t) => String(t || "").replace(/(\d{2})(?=\d)/g, "$1 ").trim();

export default function CeQuiVousAttend({ limite = 12 }) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["ce-qui-attend"],
    queryFn: () => base44.request("GET", "/api/assistant/attend"),
    // Une minute : assez fin pour qu'un rappel de 14 h se signale à 14 h 01,
    // assez large pour ne pas marteler le serveur.
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  const fait = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/assistant/rappels/${id}/fait`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ce-qui-attend"] }),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/assistant/rappels/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ce-qui-attend"] }),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  // Prévenir au moment où une ligne devient due, une seule fois par ligne et
  // par session. Sans cette mémoire, chaque relecture rejouerait la notification.
  const prevenus = useRef(new Set());
  const premierPassage = useRef(true);
  useEffect(() => {
    const lignes = data?.lignes || [];
    const dues = lignes.filter((l) => l.dans != null && l.dans <= 0);
    // À l'ouverture de la page, on ne rejoue pas ce qui était déjà en retard :
    // la liste est sous les yeux, une volée de notifications n'apprendrait rien.
    if (premierPassage.current) {
      premierPassage.current = false;
      dues.forEach((l) => prevenus.current.add(`${l.source}:${l.id}`));
      return;
    }
    for (const l of dues) {
      const cle = `${l.source}:${l.id}`;
      if (prevenus.current.has(cle)) continue;
      prevenus.current.add(cle);
      prevenir(
        l.source === "rappel" ? "Rappel" : l.source === "promesse" ? "Promesse attendue" : "Relance à faire",
        [l.titre, l.dossier || l.detail].filter(Boolean).join(" — "),
        l.lien || "/Dashboard"
      );
    }
  }, [data]);

  const lignes = data?.lignes || [];
  if (!lignes.length) return null;

  const visibles = lignes.slice(0, limite);
  const reste = lignes.length - visibles.length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
        <p className="m-0 text-[13.5px] text-[#6a7180]">
          Ce qui vous attend
          {data.en_retard > 0 && <span className="text-[#e8746a]"> · {data.en_retard} en retard</span>}
          {data.aujourdhui > 0 && <span className="text-[#d9b46a]"> · {data.aujourdhui} aujourd'hui</span>}
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {GROUPES.map((g) => {
          const dedans = visibles.filter(g.garde);
          if (!dedans.length) return null;
          return (
            <div key={g.cle}>
              <p className="m-0 mb-2 text-[10.5px] tracking-[.18em] uppercase" style={{ color: g.teinte }}>
                {g.mot} <span className="text-[#3a3f4a]">· {dedans.length}</span>
              </p>
              <div className="flex flex-col gap-2">
                {dedans.map((l) => {
                  const n = NATURES[l.source] || NATURES.rappel;
                  return (
                    <div
                      key={`${l.source}-${l.id}`}
                      className="group flex items-start gap-3 rounded-xl border border-[#1f2228] bg-[#0f1114] px-4 py-3 hover:border-[#2c3139] transition-colors"
                    >
                      <span className="w-[2px] self-stretch rounded-full flex-none" style={{ background: g.teinte }} />

                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[14px] leading-[1.45] text-[#f2f3f5]">
                          {l.titre}
                          {l.telephone && (
                            <a
                              href={`tel:${l.telephone}`}
                              className="ml-2 inline-flex items-center gap-1 text-[13px] text-[#96c0b8] tabular-nums hover:underline"
                            >
                              <Phone className="w-3 h-3" /> {telLisible(l.telephone)}
                            </a>
                          )}
                        </p>
                        <p className="m-0 mt-1 text-[12px] text-[#6a7180] truncate">
                          <span style={{ color: n.teinte }}>{n.mot}</span>
                          <span className="text-[#3a3f4a]"> · </span>
                          {quand(l.dans, l.echeance)}
                          {(l.dossier || l.detail) && (
                            <>
                              <span className="text-[#3a3f4a]"> · </span>
                              {l.dossier || l.detail}
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex-none flex items-center gap-1.5">
                        {l.cloturable ? (
                          <>
                            <button
                              onClick={() => fait.mutate(l.id)}
                              disabled={fait.isPending}
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#2c3139] px-3 py-1 text-[12px] text-[#c9cdd6] hover:text-[#f2f3f5] hover:border-[#96c0b8] transition-colors disabled:opacity-40"
                            >
                              <Check className="w-3 h-3" /> Fait
                            </button>
                            <button
                              onClick={() => { if (window.confirm("Supprimer ce rappel ?")) supprimer.mutate(l.id); }}
                              title="Supprimer"
                              className="text-[#3f4644] hover:text-[#e8746a] transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : l.lien ? (
                          <Link
                            to={l.lien}
                            className="inline-flex items-center gap-1 text-[12.5px] text-[#9298a6] hover:text-[#96c0b8] transition-colors"
                          >
                            Ouvrir <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {reste > 0 && <p className="m-0 mt-3 text-[12.5px] text-[#6a7180]">et {reste} de plus, plus loin dans le temps.</p>}
    </section>
  );
}
