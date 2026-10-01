import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import CarteGoogleSecteurs from "@/components/mandataire/CarteGoogleSecteurs";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import VueProspection from "@/components/mandataire/VueProspection";
import TableauListe from "@/components/mandataire/TableauListe";
import { TYPES_CARTE } from "@/components/kzoning/CarteGoogleZones";
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { ResultatsProspective } from "@/components/mandataire/ProspecterDataB";
import { JL } from "@/design/jetons";

// La Prospection du mandataire, en deux moitiés.
//  - Prospecter : le chat. « Les boulangeries à Lyon » (ou un, plusieurs
//    clients) lance ALX sur la ville ; la page de la prospection suit le
//    parcours en direct (les rues n°1, 1 bis, 2, puis les commerces lus), on
//    coche ce qu'on garde et on l'exporte vers une liste.
//  - Listes : ce qu'on a gardé, pour appeler.

const API = "/api/mandataire";

export default function MandataireProspection() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [conversation, setConversation] = useState(false);
  const [historique, setHistorique] = useState(false);
  const [vueId, setVueId] = useState(null); // la prospection ALX ouverte
  const [vueDataB, setVueDataB] = useState(null); // le jeton de la prospective Data-B ouverte
  const [onglet, setOnglet] = useState("prospecter");
  // « Voir » sur la notification d'une liste créée : la page bascule sur la liste.
  const [listeDemandee, setListeDemandee] = useState(null);
  useEffect(() => {
    const ouvrir = (e) => { setVueId(null); setConversation(false); setOnglet("listes"); setListeDemandee(e.detail?.id || null); };
    window.addEventListener("klocka:ouvrir-liste", ouvrir);
    return () => window.removeEventListener("klocka:ouvrir-liste", ouvrir);
  }, []);
  // La notification « liste du jour » ouvre la liste par l'adresse.
  useEffect(() => {
    if (params.get("onglet") !== "listes") return;
    setOnglet("listes");
    if (params.get("liste")) setListeDemandee(params.get("liste"));
    setParams((p) => { const n = new URLSearchParams(p); n.delete("onglet"); n.delete("liste"); return n; }, { replace: true });
  }, [params, setParams]);

  const { data: secteurData } = useQuery({ queryKey: ["mandataire-secteur"], queryFn: () => base44.request("GET", `${API}/secteur`) });
  const secteur = secteurData?.secteur || null;

  // « Prospecter pour ce client » depuis la page Clients : la prospection se lance.
  const lanceeDepuisClients = useRef(false);
  useEffect(() => {
    const id = params.get("demande");
    if (!id || lanceeDepuisClients.current) return;
    lanceeDepuisClients.current = true;
    base44.request("POST", `${API}/prospections/lancer`, { body: { demande_ids: [id] } })
      .then((r) => { queryClient.invalidateQueries({ queryKey: ["mandataire-prospections"] }); setVueId(r.prospection_id); })
      .catch((e) => toast.error(e?.message || "Prospection impossible"))
      // L'adresse oublie la demande : un rechargement ne relance pas la prospection.
      .finally(() => setParams((p) => { const n = new URLSearchParams(p); n.delete("demande"); return n; }, { replace: true }));
  }, [params, setParams, queryClient]);

  const [typeCarte, setTypeCarte] = useState("roadmap");
  const { data: prospectionsData } = useQuery({ queryKey: ["mandataire-prospections"], queryFn: () => base44.request("GET", `${API}/prospections`) });

  // La page est un fil, comme le tableau de bord : on écrit, les étapes
  // défilent, puis les résultats s'ouvrent sur leur page à eux (carte, liste,
  // étiquettes), d'où l'on revient à la conversation.
  const ouvrirResultats = (id) => { setOnglet("prospecter"); setVueId(id); };

  return (
    <div className={`mx-auto px-5 md:px-8 ${vueId ? "max-w-[1440px]" : "max-w-[1100px]"} ${conversation && !vueId ? "" : "pb-14 pt-4"}`}>
      {vueId && <VueProspection key={vueId} id={vueId} retour={conversation ? "Conversation" : "Prospection"} onRetour={() => setVueId(null)} />}

      {/* Prospecter (le chat) ou Listes (pour appeler) : les deux moitiés de la Prospection. */}
      {!vueId && !conversation && (
        <div className="flex justify-center pt-2">
          <div className="flex gap-1 rounded-full bg-rail-actif p-1">
            {[["prospecter", "Prospecter"], ["listes", "Listes"]].map(([k, mot]) => (
              <button key={k} type="button" onClick={() => setOnglet(k)} aria-pressed={onglet === k}
                className={`rounded-full px-4 py-1.5 text-[13.5px] transition-colors ${onglet === k ? "bg-surface-pleine text-encre shadow-[0_1px_3px_rgb(0_0_0/0.08)]" : "text-ardoise hover:text-encre"}`}
                style={onglet === k ? undefined : { background: "transparent" }}>
                {mot}
              </button>
            ))}
          </div>
        </div>
      )}
      {!vueId && !conversation && onglet === "listes" && <Listes demandee={listeDemandee} onDemandeVue={() => setListeDemandee(null)} />}

      {/* Les résultats d'une prospective Data-B, en pleine page. */}
      {vueDataB && !vueId && (
        <ResultatsProspective jeton={vueDataB} onRetour={() => setVueDataB(null)} />
      )}

      {/* Le chat de la prospection : la même structure que le dashboard. */}
      <div className={vueId || vueDataB || (onglet === "listes" && !conversation) ? "hidden" : ""}>
        <header className={conversation ? "flex flex-col" : "flex flex-col items-center pt-[10vh] text-center max-md:pt-8"}>
          {!conversation && (
            <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>
              Quelle zone prospectez-vous ?
            </h1>
          )}
          {!conversation && !secteur && <p className="m-0 mt-3 text-[13.5px] text-ardoise">Aucun secteur attribué : demandez à Klocka de le tracer.</p>}
          <div className={conversation ? "w-full" : "mt-9 w-full max-w-[660px] max-md:mt-6"}>
            <ChatDashboard
              espace="prospection"
              onConversation={setConversation}
              onHistorique={setHistorique}
              onOuvrirResultats={ouvrirResultats}
              onRecherche={(r) => (r.datab_jeton ? setVueDataB(r.datab_jeton) : setVueId(r.prospection_id))}
            />
          </div>
        </header>

        {!conversation && (
          historique ? (
            <div className="mt-[9vh] max-md:mt-10"><HistoriqueColonne espace="prospection" /></div>
          ) : (
            <div className="mt-[8vh] max-md:mt-10">
              {(prospectionsData?.prospections || []).length > 0 && (
                <section className="mx-auto mb-6 max-w-[880px]">
                  <p className="m-0 border-b border-bord pb-2.5 text-[13.5px] text-craie">Mes prospections</p>
                  {prospectionsData.prospections.slice(0, 6).map((x) => (
                    <button key={x.id} type="button" onClick={() => ouvrirResultats(x.id)}
                      className="flex w-full items-baseline gap-4 border-t border-trait py-3 text-left first:border-t-0 hover:bg-encre/[0.02]" style={{ background: "transparent" }}>
                      <span className="min-w-0 flex-1 truncate text-[14.5px] text-encre">{x.nom}</span>
                      <span className="flex-none text-[12.5px] tabular-nums text-ardoise">{x.trouves} commerce{x.trouves > 1 ? "s" : ""}</span>
                      <span className="flex-none text-[12.5px] text-brume">{new Date(x.cree_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                    </button>
                  ))}
                </section>
              )}
      {secteur && (
        <div className="relative mx-auto mt-6 h-[360px] max-w-[880px] overflow-hidden rounded-[16px] border border-bord max-md:mt-8 max-md:h-[260px]">
          {/* La zone du secteur, rien d'autre : ni nom, ni point de ville. */}
          <CarteGoogleSecteurs
            secteurs={[{ ...secteur, teinte: JL["menthe"] }]}
            etiquettes={false}
            type={typeCarte}
            onVille={() => {}}
            onSecteur={() => {}}
            onErreur={(m) => toast.error(m)}
          />
          <div className="absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-full border border-bord bg-fond/80 p-1 backdrop-blur-xl">
            <div className="flex items-center gap-0.5">
              {TYPES_CARTE.map((t) => (
                <button key={t.cle} type="button" onClick={() => setTypeCarte(t.cle)}
                  className={`rounded-full px-3 py-1.5 text-[11.5px] transition-colors ${t.cle === typeCarte ? "bg-encre/[0.09] text-encre" : "text-ardoise hover:text-encre"}`}
                  style={t.cle === typeCarte ? undefined : { background: "transparent" }}>
                  {t.nom}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// Les listes créées : chaque prospection enregistrée, avec son avancement, et


// Les listes : ce qu'on a gardé des prospections, pour appeler. Une liste
// s'ouvre sur ses propriétaires, avec les mêmes gestes que partout
// (appeler, sans réponse, statut, historique).
function Listes({ demandee = null, onDemandeVue = null }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["m-listes"], queryFn: () => base44.request("GET", `${API}/listes`) });
  const [ouverte, setOuverte] = useState(demandee);
  // La liste demandée par la notification s'ouvre, une fois.
  useEffect(() => { if (demandee) { setOuverte(demandee); onDemandeVue?.(); } }, [demandee, onDemandeVue]);
  const listes = data?.listes || [];
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["m-listes"] });
  const renommer = (l) => {
    const nom = window.prompt("Nom de la liste", l.nom);
    if (nom?.trim()) base44.request("PATCH", `${API}/listes/${l.id}`, { body: { nom } }).then(rafraichir).catch((e) => toast.error(e?.message || "Impossible"));
  };
  const supprimer = (l) => {
    if (!window.confirm(`Supprimer la liste « ${l.nom} » ? Ses propriétaires et leurs relances restent.`)) return;
    base44.request("DELETE", `${API}/listes/${l.id}`).then(() => { rafraichir(); setOuverte(null); }).catch((e) => toast.error(e?.message || "Impossible"));
  };
  const l = listes.find((x) => x.id === ouverte);

  if (isLoading) return <p className="m-0 mt-10 text-center text-[13.5px] text-brume">Lecture…</p>;
  if (!listes.length) {
    return <p className="m-0 mt-10 text-center text-[14px] text-brume">Aucune liste encore. Lancez une prospection, cochez les commerces à garder, puis « Exporter vers une nouvelle liste ».</p>;
  }
  if (l) {
    return (
      <div className="mx-auto mt-6 max-w-[1400px]">
        <div className="flex flex-wrap items-center gap-3 border-b border-trait pb-3">
          <button type="button" onClick={() => setOuverte(null)} className="inline-flex items-center gap-1 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
            <ChevronLeft className="h-4 w-4" /> Listes
          </button>
          <p className="m-0 min-w-0 flex-1 truncate text-center text-[15px] text-encre">{l.nom}</p>
          <button type="button" onClick={() => renommer(l)} className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><Pencil className="h-3.5 w-3.5" /> Renommer</button>
          <button type="button" onClick={() => supprimer(l)} className="inline-flex items-center gap-1.5 text-[12.5px] text-brume hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
        <p className="m-0 mt-3 text-[13px] text-ardoise">{l.total} propriétaire{l.total > 1 ? "s" : ""} · {l.a_appeler} à appeler · {l.contactes} contacté{l.contactes > 1 ? "s" : ""} · {l.rdv} RDV</p>
        <TableauListe fiches={l.fiches} libelles={data?.libelles || {}} listeId={l.id} />
      </div>
    );
  }
  // Des lignes, pas des cartes : le nom, la date, et l'avancement à droite,
  // comme l'Historique et « Mes prospections ».
  // Deux rayons : les listes servies par la veille (une par jour, prêtes à
  // appeler), puis celles que le mandataire a créées lui-même.
  const suggerees = listes.filter((x) => x.suggeree);
  const manuelles = listes.filter((x) => !x.suggeree);
  const Ligne = ({ x }) => (
        <button type="button" onClick={() => setOuverte(x.id)}
          className="flex w-full items-baseline gap-4 border-t border-trait py-3.5 text-left transition-colors first:border-t-0 hover:bg-encre/[0.02]" style={{ background: "transparent" }}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] text-encre">{x.nom}</span>
            <span className="mt-0.5 block text-[12.5px] text-ardoise">
              {x.total} propriétaire{x.total > 1 ? "s" : ""}
              {x.contactes > 0 ? ` · ${x.contactes} contacté${x.contactes > 1 ? "s" : ""}` : ""}
              {x.rdv > 0 ? ` · ${x.rdv} RDV` : ""}
            </span>
          </span>
          {x.a_appeler > 0 && <span className="flex-none text-[12.5px] tabular-nums text-menthe">{x.a_appeler} à appeler</span>}
          <span className="flex-none text-[12.5px] tabular-nums text-brume">{new Date(x.cree_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
          <ChevronRight className="h-3.5 w-3.5 flex-none self-center text-brume" />
        </button>
  );
  return (
    <div className="mx-auto mt-6 max-w-[880px]">
      {suggerees.length > 0 && (
        <div className="mb-8">
          <p className="m-0 border-b border-bord pb-2.5 text-[13.5px] text-craie">Listes suggérées <span className="text-brume">· prêtes à appeler, servies par la veille</span></p>
          {suggerees.map((x) => <Ligne key={x.id} x={x} />)}
        </div>
      )}
      <p className="m-0 border-b border-bord pb-2.5 text-[13.5px] text-craie">Vos listes <span className="text-brume">· {manuelles.length}</span></p>
      {manuelles.map((x) => <Ligne key={x.id} x={x} />)}
      {!manuelles.length && <p className="m-0 mt-4 text-[13px] text-brume">Aucune liste créée à la main. Lancez une prospection, cochez, exportez.</p>}
    </div>
  );
}
