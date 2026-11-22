import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { GripVertical, Plus, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import PhotoFiche from "@/components/fiche-dossier/PhotoFiche";
import { ouvrirFiche } from "@/lib/fiche-dossier";

// Les meilleurs agents (22 nov. 2026, Jules) : un classement commun à l'équipe, vide au départ. « Ajouter un agent »
// cherche un agent (de Klocka ou du CRM) et le met en bas ; on le place en le tirant, on le retire d'une croix. Chacun a
// sa photo : trouvée d'elle-même à l'ajout quand on la connaît, sinon importée d'un clic sur sa tête.

const quand = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

function AjouterAgent({ deja, onChoisir, onFermer }) {
  const [q, setQ] = useState("");
  const [cherche, setCherche] = useState("");
  const champ = useRef(null);
  useEffect(() => { champ.current?.focus(); }, []);
  useEffect(() => { const t = setTimeout(() => setCherche(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, isFetching } = useQuery({ queryKey: ["chercher-agent", cherche], queryFn: () => base44.request("GET", `/api/fiche-dossier/chercher?q=${encodeURIComponent(cherche)}`), enabled: cherche.length >= 2, staleTime: 30_000 });
  const agents = (data?.agents || []).filter((a) => !deja.has(a.cle)).slice(0, 6);
  return (
    <div className="mt-2 rounded-[12px] border border-bord-doux bg-surface-pleine p-2">
      <div className="flex items-center gap-2 px-1.5">
        <Search className="h-4 w-4 flex-none text-brume" />
        <input ref={champ} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onFermer(); }} placeholder="Nom de l'agent ou de l'agence"
          aria-label="Chercher un agent" className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume" />
        <button type="button" onClick={onFermer} aria-label="Fermer la recherche" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>
      </div>
      {cherche.length >= 2 && (
        <ul className="m-0 mt-1 flex list-none flex-col p-0">
          {agents.map((a) => (
            <li key={a.cle}>
              <button type="button" onClick={() => onChoisir(a)} className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left hover:bg-encre/[0.05]" style={{ background: "transparent" }}>
                <PhotoFiche cle={a.cle} nom={a.nom} photo={a.photo} taille={28} modifiable={false} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] text-encre">{a.nom}</span>
                  {a.detail && a.detail !== "Twenty CRM" && <span className="truncate text-[11.5px] text-ardoise">{a.detail}</span>}
                </span>
              </button>
            </li>
          ))}
          {!agents.length && <li className="px-2 py-2 text-[12.5px] text-brume">{isFetching ? "Recherche…" : "Aucun agent à ce nom."}</li>}
        </ul>
      )}
    </div>
  );
}

export default function MeilleursAgents({ teintes = {}, prenoms = {} }) {
  const queryClient = useQueryClient();
  const cle = ["meilleurs-agents"];
  const { data } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", "/api/statistiques/meilleurs-agents"), staleTime: 30_000 });
  const [liste, setListe] = useState([]);
  const [ajout, setAjout] = useState(false);
  useEffect(() => { if (data?.agents) setListe(data.agents); }, [data]);
  const poser = useMutation({
    mutationFn: (l) => base44.request("POST", "/api/statistiques/meilleurs-agents", { body: { ordre: l.map((a) => a.cle), infos: Object.fromEntries(l.map((a) => [a.cle, { nom: a.nom, detail: a.detail }])) } }),
    // La photo d'un agent ajouté se cherche à part : la liste se relit un peu après.
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: cle }); setTimeout(() => { queryClient.invalidateQueries({ queryKey: cle }); queryClient.invalidateQueries({ queryKey: ["photos-fiches"] }); }, 6000); },
    onError: (e) => { toast.error(e?.message || "Classement non enregistré"); if (data?.agents) setListe(data.agents); },
  });
  const enregistrer = (l) => { setListe(l); poser.mutate(l); };
  const deplacer = (l, de, vers) => { const c = [...l]; const [x] = c.splice(de, 1); c.splice(vers, 0, x); return c; };
  // Pendant le glisser, les rangs suivent la place où la ligne tomberait.
  const [apercu, setApercu] = useState(null);
  const survoler = ({ source, destination }) => setApercu(destination ? deplacer(liste, source.index, destination.index).map((a) => a.cle) : null);
  const deposer = ({ source, destination }) => {
    setApercu(null);
    if (!destination || destination.index === source.index) return;
    enregistrer(deplacer(liste, source.index, destination.index));
  };
  const rangDe = (a, i) => (apercu ? apercu.indexOf(a.cle) : i);
  const choisir = (a) => {
    setAjout(false);
    enregistrer([...liste, { cle: a.cle, nom: a.nom, detail: a.detail && a.detail !== "Twenty CRM" ? a.detail : null, photo: a.photo || null, fiches: 0 }]);
  };

  return (
    <section className="k-verre p-4">
      <h2 className="m-0 text-[14px] font-normal text-encre">Meilleurs agents</h2>
      <p className="m-0 mb-3 mt-1 text-[12px] text-brume">Classement commun : chacun peut placer un agent en n°1.</p>
      {!data ? <p className="m-0 py-3 text-[12.5px] text-brume">Chargement…</p> : (
        <>
          {!liste.length && !ajout && <p className="m-0 pb-2 text-[12.5px] text-brume">Aucun agent pour l'instant.</p>}
          {liste.length > 0 && (
            <DragDropContext onDragUpdate={survoler} onDragEnd={deposer}>
              <Droppable droppableId="meilleurs-agents">
                {(depot) => (
                  <ol ref={depot.innerRef} {...depot.droppableProps} className="m-0 flex list-none flex-col gap-1 p-0">
                    {liste.map((a, i) => (
                      <Draggable key={a.cle} draggableId={a.cle} index={i}>
                        {(tire, etat) => {
                          const rang = rangDe(a, i);
                          // Tirée, la ligne passe au-dessus de la page : un parent animé (transform) décalerait sa position fixe.
                          const ligne = (
                            <li ref={tire.innerRef} {...tire.draggableProps} {...tire.dragHandleProps} aria-label={`${rang + 1}. ${a.nom}. Tirer pour changer sa place.`}
                              className={`group flex cursor-grab items-center gap-2.5 rounded-[12px] border px-2.5 py-2 active:cursor-grabbing ${etat.isDragging ? "border-bord-vif bg-surface-pleine shadow-lg" : rang === 0 ? "border-bord bg-encre/[0.04]" : "border-transparent hover:bg-encre/[0.03]"}`}>
                              <span className={`grid h-6 w-6 flex-none place-items-center rounded-full text-[12px] tabular-nums ${rang === 0 ? "bg-menthe text-sur-menthe" : "bg-encre/[0.07] text-craie"}`}>{rang + 1}</span>
                              <PhotoFiche cle={a.cle} nom={a.nom} photo={a.photo} taille={34} />
                              {/* Un clic sur le nom ouvre la fiche de l'agent (22 nov. 2026, Jules). */}
                              <button type="button" onClick={(e) => { e.stopPropagation(); ouvrirFiche(a.cle); }} title={`Voir la fiche de ${a.nom}`}
                                className="flex min-w-0 flex-1 flex-col items-start overflow-hidden text-left" style={{ background: "transparent" }}>
                                <span className="max-w-full truncate text-[13.5px] text-encre hover:underline">{a.nom}</span>
                                <span className="flex w-full min-w-0 items-center gap-1.5 text-[12px] text-ardoise">
                                  {a.analyste_email && <span aria-hidden className="inline-block h-1.5 w-1.5 flex-none rounded-full" style={{ background: teintes[a.analyste_email] }} title={prenoms[a.analyste_email]} />}
                                  <span className="min-w-0 truncate">{[a.detail, `${a.fiches || 0} fiche${a.fiches > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}</span>
                                </span>
                              </button>
                              {/* La poignée, et la croix à sa place au survol : le nom garde toute la largeur. */}
                              <span className="relative grid h-7 w-6 flex-none place-items-center">
                                <GripVertical aria-hidden className="h-4 w-4 text-brume group-hover:opacity-0 group-focus-within:opacity-0 max-md:opacity-0" />
                                <button type="button" onClick={(e) => { e.stopPropagation(); enregistrer(liste.filter((x) => x.cle !== a.cle)); }} aria-label={`Retirer ${a.nom} du classement`}
                                  className="absolute inset-0 grid place-items-center rounded-full text-brume opacity-0 hover:text-encre focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            </li>
                          );
                          return etat.isDragging ? createPortal(ligne, document.body) : ligne;
                        }}
                      </Draggable>
                    ))}
                    {depot.placeholder}
                  </ol>
                )}
              </Droppable>
            </DragDropContext>
          )}
          {ajout ? <AjouterAgent deja={new Set(liste.map((a) => a.cle))} onChoisir={choisir} onFermer={() => setAjout(false)} /> : (
            <button type="button" onClick={() => setAjout(true)} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-bord-doux text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
              <Plus className="h-4 w-4" />Ajouter un agent
            </button>
          )}
        </>
      )}
      {data?.par && liste.length > 0 && <p className="m-0 mt-2.5 text-[11.5px] text-brume">Dernier changement par {prenoms[data.par] || data.par.split("@")[0]}, le {quand(data.le)}.</p>}
    </section>
  );
}
