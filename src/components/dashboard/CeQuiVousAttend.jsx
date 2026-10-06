/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
import React, { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, Phone, X } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { prevenir } from "@/lib/notifications";
import { J } from "@/design/jetons";

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
  // Ce que Klocka a fait tout seul et qu'il faut savoir : un agent ajouté dans
  // Monday, une adresse qui manque. Pas d'échéance, donc en tête.
  { cle: "nouveau", mot: "Nouveau", teinte: J["menthe"], garde: (l) => l.nouveau },
  { cle: "retard", mot: "En retard", teinte: J["alerte"], garde: (l) => l.dans != null && l.dans < 0 },
  { cle: "aujourdhui", mot: "Aujourd'hui", teinte: J["ambre"], garde: (l) => l.dans === 0 },
  { cle: "semaine", mot: "Cette semaine", teinte: J["menthe"], garde: (l) => l.dans > 0 && l.dans <= 7 },
  { cle: "apres", mot: "Plus tard", teinte: J["bord-vif"], garde: (l) => l.dans > 7 },
];

// La nature d'une ligne, pour savoir d'un coup d'œil d'où elle vient.
const NATURES = {
  rappel: { mot: "rappel", teinte: J["menthe"] },
  promesse: { mot: "promesse", teinte: J["ambre"] },
  dossier: { mot: "relance", teinte: "#5a8db5" },
  agent: { mot: "agent", teinte: J["menthe"] },
};

// Ce que « Supprimer » fait vraiment, dit avant de le faire.
const CONFIRMATIONS = {
  rappel: "Supprimer ce rappel ?",
  promesse: "Effacer cette promesse du registre ?",
  dossier: "Retirer la relance de ce dossier ?",
  agent: "Masquer cette annonce ?",
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

/** Un numéro rendu lisible : par paires de chiffres. Le chat s'en sert aussi. */
export const telLisible = (t) => String(t || "").replace(/(\d{2})(?=\d)/g, "$1 ").trim();

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
    mutationFn: (l) => base44.request("POST", `/api/assistant/attend/${l.source}/${encodeURIComponent(l.id)}/fait`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ce-qui-attend"] }),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (l) => base44.request("DELETE", `/api/assistant/attend/${l.source}/${encodeURIComponent(l.id)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ce-qui-attend"] }),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  // Prévenir au moment où une ligne devient due, une seule fois par ligne et
  // par session. Sans cette mémoire, chaque relecture rejouerait la notification.
  const prevenus = useRef(new Set());
  const premierPassage = useRef(true);
  useEffect(() => {
    const lignes = data?.lignes || [];
    const dues = lignes.filter((l) => l.nouveau || (l.dans != null && l.dans <= 0));
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
        l.source === "rappel" ? "Rappel" : l.source === "promesse" ? "Promesse attendue" : l.source === "agent" ? "Agent" : "Relance à faire",
        [l.titre, l.dossier || l.detail].filter(Boolean).join(" — "),
        l.lien || "/TableauDeBord"
      );
    }
  }, [data]);

  const lignes = data?.lignes || [];
  if (!lignes.length) return null;

  const visibles = lignes.slice(0, limite);
  const reste = lignes.length - visibles.length;

  return (
    <section>
      <div className="mb-1 border-b border-bord pb-2.5">
        <p className="m-0 text-[13.5px] text-craie">
          Ce qui vous attend
          {data.en_retard > 0 && <span className="text-alerte"> · {data.en_retard} en retard</span>}
          {data.aujourdhui > 0 && <span className="text-ambre"> · {data.aujourdhui} aujourd'hui</span>}
        </p>
      </div>

      <div className="flex flex-col">
        {GROUPES.map((g) => {
          const dedans = visibles.filter(g.garde);
          if (!dedans.length) return null;
          return (
            <div key={g.cle}>
              <div className="flex flex-col">
                {dedans.map((l) => {
                  const n = NATURES[l.source] || NATURES.rappel;
                  // Une ligne, pas un encadré. La ligne entière mène au dossier
                  // quand il y en a un : un bouton « Ouvrir » à côté d'un titre
                  // déjà cliquable dit deux fois la même chose.
                  const Ligne = l.lien ? Link : "div";
                  return (
                    <Ligne
                      key={`${l.source}-${l.id}`}
                      {...(l.lien ? { to: l.lien } : {})}
                      className={`group flex items-baseline gap-2.5 border-t border-trait py-2.5 first:border-t-0 ${
                        l.lien ? "cursor-pointer" : ""
                      }`}
                    >
                      <span
                        className="mt-[6px] h-[7px] w-[7px] rounded-full flex-none"
                        style={{ background: g.teinte }}
                      />

                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[14.5px] leading-[1.45] text-encre">
                          {l.titre}
                          {l.telephone && (
                            <a
                              href={`tel:${l.telephone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="ml-2 inline-flex items-center gap-1 text-[12.5px] text-menthe tabular-nums hover:underline"
                            >
                              <Phone className="w-3 h-3" /> {telLisible(l.telephone)}
                            </a>
                          )}
                        </p>
                        <p className="m-0 mt-0.5 text-[13px] text-ardoise truncate">
                          <span style={{ color: n.teinte }}>{n.mot}</span>
                          <span className="text-bord-vif"> · </span>
                          {l.nouveau ? l.detail || "à l'instant" : quand(l.dans, l.echeance)}
                          {(l.dossier || l.detail) && (
                            <>
                              <span className="text-bord-vif"> · </span>
                              {l.dossier || l.detail}
                            </>
                          )}
                        </p>
                      </div>

                      {l.cloturable && (
                        <div className="flex-none flex items-center gap-3 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity max-md:opacity-100">
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); fait.mutate(l); }}
                            disabled={fait.isPending}
                            className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-menthe transition-colors disabled:opacity-40"
                          >
                            <Check className="w-3.5 h-3.5" /> Fait
                          </button>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (window.confirm(CONFIRMATIONS[l.source] || "Supprimer cette ligne ?")) supprimer.mutate(l); }}
                            aria-label="Supprimer" title="Supprimer"
                            className="text-brume hover:text-alerte transition-colors max-md:-m-2 max-md:grid max-md:h-9 max-md:w-9 max-md:place-items-center"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </Ligne>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {reste > 0 && <p className="m-0 mt-3 text-[12.5px] text-brume">et {reste} de plus, plus loin dans le temps.</p>}
    </section>
  );
}
