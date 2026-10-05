import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import CarteGoogleSecteurs from "@/components/mandataire/CarteGoogleSecteurs";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import VueProspection from "@/components/mandataire/VueProspection";
import TableauListe from "@/components/mandataire/TableauListe";
import { TYPES_CARTE } from "@/components/kzoning/CarteGoogleZones";
import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { ResultatsProspective } from "@/components/mandataire/ProspecterDataB";
import AgentIA from "@/components/mandataire/AgentIA";
import { J, JL, alpha } from "@/design/jetons";

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
    const o = params.get("onglet");
    if (o !== "listes" && o !== "agent") return;
    setOnglet(o);
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
    // Les listes sont des tableaux : elles prennent toute la largeur de la page.
    <div className={`mx-auto px-5 md:px-8 ${vueId ? "max-w-[1440px]" : !conversation && onglet === "listes" ? "max-w-none" : "max-w-[1100px]"} ${conversation && !vueId ? "" : "pb-14 pt-4"}`}>
      {vueId && <VueProspection key={vueId} id={vueId} retour={conversation ? "Conversation" : "Prospection"} onRetour={() => setVueId(null)} />}

      {/* Prospecter (le chat) ou Listes (pour appeler) : les deux moitiés de la Prospection. */}
      {!vueId && !conversation && (
        <div className="flex justify-center pt-2">
          <div className="flex gap-1 rounded-full bg-rail-actif p-1">
            {[["prospecter", "Prospecter"], ["agent", "Agent IA"], ["listes", "Listes"]].map(([k, mot]) => {
              const actif = onglet === k;
              // L'agent se distingue : un liseré multicolore, léger, qui tourne doucement.
              if (k === "agent") {
                return (
                  <button key={k} type="button" onClick={() => setOnglet(k)} aria-pressed={actif}
                    className={`agent-onglet relative rounded-full px-4 py-1.5 text-[13.5px] transition-colors ${actif ? "text-encre" : "text-ardoise hover:text-encre"}`}
                    // Jamais rempli : seul le liseré (dessiné en CSS, .agent-onglet) le
                    // distingue ; sélectionné, son texte passe en blanc.
                    style={{ background: "transparent" }}>
                    {mot}
                  </button>
                );
              }
              return (
                <button key={k} type="button" onClick={() => setOnglet(k)} aria-pressed={actif}
                  className={`rounded-full border border-transparent px-4 py-1.5 text-[13.5px] transition-colors ${actif ? "bg-surface-pleine text-encre shadow-[0_1px_3px_rgb(0_0_0/0.08)]" : "text-ardoise hover:text-encre"}`}
                  style={actif ? undefined : { background: "transparent" }}>
                  {mot}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!vueId && !conversation && onglet === "listes" && <Listes demandee={listeDemandee} onDemandeVue={() => setListeDemandee(null)} />}
      {!vueId && !conversation && onglet === "agent" && <AgentIA />}

      {/* Les résultats d'une prospective Data-B, en pleine page. */}
      {vueDataB && !vueId && (
        <ResultatsProspective jeton={vueDataB} onRetour={() => setVueDataB(null)} />
      )}

      {/* Le chat de la prospection : la même structure que le dashboard. */}
      <div className={vueId || vueDataB || (onglet !== "prospecter" && !conversation) ? "hidden" : ""}>
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


// Les listes : ce qu'on a gardé des prospections, pour appeler. Un classeur :
// la dernière liste ouverte s'affiche d'emblée, les autres attendent en
// onglets au-dessus, la plus récente à gauche.
const CLE_DERNIERE = "klocka:m-liste-ouverte";
const lireDerniere = () => { try { return localStorage.getItem(CLE_DERNIERE); } catch { return null; } };
const noterDerniere = (id) => { try { localStorage.setItem(CLE_DERNIERE, id); } catch { /* stockage indisponible */ } };

/**
 * Le classeur en attente : ses intercalaires, son titre et ses lignes, en
 * gris qui respire, à leur place. La page a sa forme avant d'avoir ses données.
 */
function SqueletteListes() {
  const bloc = "rounded-full bg-encre/[0.12]";
  return (
    <div className="mt-6 w-full animate-pulse" aria-busy="true" aria-label="Chargement des listes">
      <div className="flex items-end">
        <span className="w-2 flex-none self-stretch border-b border-trait" />
        <span className="flex h-[42px] w-[190px] flex-none items-center rounded-t-[10px] border border-b-0 border-trait bg-rail-actif px-4"><span className={`${bloc} h-2.5 w-28`} /></span>
        {[150, 170, 130].map((l, i) => (
          <React.Fragment key={i}>
            <span className="w-1 flex-none self-stretch border-b border-trait" />
            <span className="flex h-[38px] flex-none items-center rounded-t-[10px] border-b border-trait bg-surface px-4" style={{ width: l }}><span className={`${bloc} h-2.5 w-20`} /></span>
          </React.Fragment>
        ))}
        <span className="flex-1 self-stretch border-b border-trait" />
      </div>
      <div className="rounded-b-md border-x border-b border-trait bg-rail-actif px-5 pb-5 pt-4">
        <span className={`${bloc} block h-3.5 w-56`} />
        <span className={`${bloc} mt-2.5 block h-2.5 w-80 max-w-full`} />
        <div className="mt-5 overflow-hidden rounded-[10px] border border-trait">
          <div className="flex gap-4 border-b border-trait bg-encre/[0.03] px-4 py-3">
            {[16, 120, 90, 110, 80, 70].map((l, i) => <span key={i} className={`${bloc} h-2.5`} style={{ width: l }} />)}
          </div>
          {[0, 1, 2, 3, 4, 5].map((r) => (
            <div key={r} className="flex items-center gap-4 border-b border-trait px-4 py-3.5 last:border-b-0">
              <span className="h-4 w-4 flex-none rounded-[4px] bg-encre/[0.12]" />
              {[150, 110, 130, 90, 70].map((l, i) => <span key={i} className={`${bloc} h-2.5`} style={{ width: l - (r % 3) * 12 }} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Listes({ demandee = null, onDemandeVue = null }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["m-listes"], queryFn: () => base44.request("GET", `${API}/listes`) });
  const [choisie, setChoisie] = useState(demandee || lireDerniere());
  // La liste demandée par la notification s'ouvre, une fois.
  useEffect(() => { if (demandee) { setChoisie(demandee); onDemandeVue?.(); } }, [demandee, onDemandeVue]);
  const listes = [...(data?.listes || [])].sort((a, b) => String(b.cree_le || "").localeCompare(String(a.cree_le || "")));
  const l = listes.find((x) => x.id === choisie) || listes[0] || null;
  useEffect(() => { if (l?.id) noterDerniere(l.id); }, [l?.id]);
  // L'onglet ouvert reste visible quand le classeur défile.
  const ongletsRef = useRef(null);
  useEffect(() => { ongletsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [l?.id]);
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["m-listes"] });
  const renommer = (x) => {
    const nom = window.prompt("Nom de la liste", x.nom);
    if (nom?.trim()) base44.request("PATCH", `${API}/listes/${x.id}`, { body: { nom } }).then(rafraichir).catch((e) => toast.error(e?.message || "Impossible"));
  };
  const supprimer = (x) => {
    if (!window.confirm(`Supprimer la liste « ${x.nom} » ? Ses propriétaires et leurs relances restent.`)) return;
    base44.request("DELETE", `${API}/listes/${x.id}`).then(() => { setChoisie(null); rafraichir(); }).catch((e) => toast.error(e?.message || "Impossible"));
  };

  if (isLoading) return <SqueletteListes />;
  if (!l) {
    return <p className="m-0 mt-10 text-center text-[14px] text-brume">Aucune liste encore. Lancez une prospection, cochez les commerces à garder, puis « Exporter vers une nouvelle liste ».</p>;
  }
  return (
    <div className="mt-6 w-full">
      {/* Les intercalaires, sans trait : l'onglet ouvert a le fond de la page
          de la liste, celui du sélecteur Prospecter / Agent IA / Listes
          (rail-actif, plus clair, décision du 5 oct. 2026) ; les autres, le
          voile de surface. */}
      <div ref={ongletsRef} role="tablist" aria-label="Vos listes" className="flex items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span aria-hidden className="w-2 flex-none" />
        {listes.map((x, i) => {
          const actif = x.id === l.id;
          return (
            <React.Fragment key={x.id}>
              {i > 0 && <span aria-hidden className="w-1 flex-none" />}
              <button type="button" role="tab" aria-selected={actif} onClick={() => setChoisie(x.id)} title={x.nom}
                className={`flex max-w-[240px] flex-none items-center gap-2 rounded-t-[10px] px-4 text-left text-[13px] transition-colors ${actif ? "bg-rail-actif pb-[11px] pt-2.5 text-encre" : "bg-surface py-2 text-ardoise hover:bg-rail-actif hover:text-encre"}`}>
                {(x.suggeree || x.agent) && <Sparkles className={`h-3 w-3 flex-none ${actif ? "text-menthe" : "text-brume"}`} aria-label="Liste de votre agent IA" />}
                <span className="truncate">{x.nom}</span>
                {x.a_appeler > 0 && <span className={`flex-none text-[11.5px] tabular-nums ${actif ? "text-menthe" : "text-brume"}`}>{x.a_appeler}</span>}
              </button>
            </React.Fragment>
          );
        })}
        <span aria-hidden className="min-w-2 flex-1" />
      </div>
      <div data-zone="listes" className="k-points relative rounded-b-md bg-rail-actif px-5 pb-5 pt-4 max-md:px-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 min-w-0 flex-1 truncate text-[15px] text-encre">{l.nom}</p>
          <button type="button" onClick={() => renommer(l)} className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><Pencil className="h-3.5 w-3.5" /> Renommer</button>
          <button type="button" onClick={() => supprimer(l)} className="inline-flex items-center gap-1.5 text-[12.5px] text-brume hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
        <p className="m-0 mt-1 text-[13px] text-ardoise">
          {(l.suggeree || l.agent) ? "Remplie par votre agent IA · " : ""}
          {l.total} propriétaire{l.total > 1 ? "s" : ""} · {l.a_appeler} à appeler · {l.contactes} contacté{l.contactes > 1 ? "s" : ""} · {l.rdv} RDV
        </p>
        <TableauListe key={l.id} fiches={l.fiches} libelles={data?.libelles || {}} listeId={l.id} />
      </div>
    </div>
  );
}
