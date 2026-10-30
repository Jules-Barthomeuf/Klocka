import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import CarteGoogleSecteurs from "@/components/mandataire/CarteGoogleSecteurs";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import VueProspection from "@/components/mandataire/VueProspection";
import TableauListe from "@/components/mandataire/TableauListe";
import { TYPES_CARTE } from "@/components/kzoning/CarteGoogleZones";
import { Map as IconeCarte, Sparkles, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { ResultatsProspective } from "@/components/mandataire/ProspecterDataB";
import AgentIA from "@/components/mandataire/AgentIA";
import ProspecterClients from "@/components/mandataire/ProspecterClients";
import ModeTerrain from "@/components/mandataire/ModeTerrain";
import { AnimatePresence } from "framer-motion";
import KProspectiveDataB from "@/components/mandataire/KProspectiveDataB";
import { J, JL, alpha } from "@/design/jetons";
import { Onglets } from "@/components/ui/kit";

// La Prospection du mandataire, en deux moitiés.
//  - Prospecter : l'Off-market du mandataire (23 oct. 2026, Jules : « supprime Commerces et Rues, juste un bouton
//    Rues à gauche du plein écran, on clique et on voit les rues colorées »). Les villes de son secteur, les murs,
//    les propriétaires ; le bouton Rues de la carte dessine les rues n°1, 1 bis et 2. L'Off-market n'a plus de page
//    à part pour un mandataire : son ancienne adresse mène ici. Le chat qui lançait ALX (« Les boulangeries à Lyon »)
//    n'est plus affiché ; une prospection lancée depuis Clients s'ouvre toujours sur sa page.
//  - Listes : ce qu'on a gardé, pour appeler.

const API = "/api/mandataire";

// L'onglet Agent IA est caché pour l'instant (12 oct. 2026, demande de Jules) :
// l'agent tourne toujours côté serveur, seul l'onglet disparaît. Le remettre à
// true le rend de nouveau visible.
const AGENT_IA_VISIBLE = false;
// K Prospective masqué de la Prospection (12 oct. 2026, Jules) : le code reste, l'onglet ne s'affiche plus.
const K_PROSPECTIVE_VISIBLE = false;

export default function MandataireProspection() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [conversation, setConversation] = useState(false);
  const [historique, setHistorique] = useState(false);
  const [vueId, setVueId] = useState(null); // la prospection ALX ouverte
  const [vueDataB, setVueDataB] = useState(null); // le jeton de la prospective Data-B ouverte
  const [onglet, setOnglet] = useState("prospecter");
  // Un appui sur « Carte » : la liste ouverte montre sa carte en grand, une fois (elle consomme la demande).
  const [carteListe, setCarteListe] = useState(false);
  // Le mode terrain de Listes (25 oct. 2026, Jules) : la carte autour de soi. `?terrain=1` l'ouvre (raccourci du dashboard).
  const [terrain, setTerrain] = useState(false);
  // Prospecter pour ses clients (24 oct. 2026, Jules) : le secteur et les clients d'abord ; tous les commerces d'une ville restent à un clic.
  // ?vue= des anciens liens (l'ancienne page Off-market) : sans objet aujourd'hui, l'adresse l'oublie.
  useEffect(() => {
    if (!params.get("vue")) return;
    setParams((p) => { const n = new URLSearchParams(p); n.delete("vue"); return n; }, { replace: true });
  }, [params, setParams]);
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
    if (o !== "listes" && !(o === "agent" && AGENT_IA_VISIBLE)) return;
    setOnglet(o);
    if (params.get("liste")) setListeDemandee(params.get("liste"));
    if (params.get("terrain") === "1") setTerrain(true);
    setParams((p) => { const n = new URLSearchParams(p); n.delete("onglet"); n.delete("liste"); n.delete("terrain"); return n; }, { replace: true });
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
  const commerces = !vueId && !vueDataB && !conversation && onglet === "prospecter";
  // La vue choisie dans la rangée : deux façons de chercher, puis les listes à appeler.
  // Deux choix seulement (25 oct. 2026, Jules) : le client est un filtre de « Mon secteur », plus une vue à part.
  // Terrain rejoint la rangée (25 oct. 2026, Jules : « intégrer Terrain dans Mon secteur et Listes, enlever Liste ») :
  // c'est le mode terrain des listes, la carte en plein écran ; sa croix revient à Listes.
  const vue = onglet === "listes" ? (terrain ? "terrain" : "listes") : "secteur";
  const choisirVue = (k) => {
    setVueDataB(null);
    setOnglet(k === "secteur" ? "prospecter" : "listes");
    setTerrain(k === "terrain");
  };
  // Les onglets de l'Analyse des dossiers (30 oct. 2026, Jules : « prends exemple sur la page Analyse ») : soulignés,
  // en tête de la carte de la page.
  const bascule = (
    <Onglets items={[{ cle: "secteur", titre: "Mon secteur" }, { cle: "listes", titre: "Listes" }, { cle: "terrain", titre: "Terrain" }]}
      valeur={vue} onChange={choisirVue} taille="page" />
  );
  // La page sur une carte de la couleur de la barre de navigation, comme un dossier ouvert dans l'Analyse.
  const carte = "mt-9 rounded-[18px] border border-trait bg-rail p-6 max-md:mt-4 max-md:p-4";

  return (
    // Les listes sont des tableaux : elles prennent toute la largeur de la page.
    <div className={`mx-auto px-5 md:px-8 ${vueId ? "max-w-[1440px]" : (!conversation && onglet === "listes") || commerces ? "max-w-none" : "max-w-[1100px]"} ${conversation && !vueId ? "" : "pb-14 pt-4"}`}>
      {vueId && <VueProspection key={vueId} id={vueId} retour={conversation ? "Conversation" : "Prospection"} onRetour={() => setVueId(null)} />}

      {/* Une seule rangée de deux choix (25 oct. 2026, Jules) : « Mon secteur · Listes », à gauche
          de la ligne de « Filtrer » ; plus de pilule centrée Prospecter / Listes (toute la page sert à prospecter). Pas de titre au-dessus : le choix
          sélectionné dit déjà où l'on est (25 oct. 2026, Jules : « est-ce que Votre secteur est nécessaire ? »). */}
      {commerces && (
        <div className={carte}>
          {bascule}
          <div className="animate-in fade-in slide-in-from-bottom-2 pt-6 duration-500"><ProspecterClients /></div>
        </div>
      )}
      {!vueId && !conversation && onglet === "listes" && (
        <>
          <div className="mt-4">{bascule}</div>
          <Listes demandee={listeDemandee} onDemandeVue={() => setListeDemandee(null)} carteDemandee={carteListe} onCarteVue={() => setCarteListe(false)} terrain={terrain} onFermerTerrain={() => setTerrain(false)} />
        </>
      )}
      {!vueId && !conversation && onglet === "agent" && AGENT_IA_VISIBLE && <AgentIA />}
      {/* K Prospective : le formulaire de Data Prospective. On remplit les
          champs, la prospective se lance dans Data-B (6 oct. 2026). */}
      {!vueId && !vueDataB && !conversation && onglet === "kprospective" && K_PROSPECTIVE_VISIBLE && <KProspectiveDataB onOuvrir={setVueDataB} />}

      {/* Les résultats d'une prospective Data-B, en pleine page. */}
      {vueDataB && !vueId && (
        <ResultatsProspective jeton={vueDataB} onRetour={() => setVueDataB(null)} />
      )}

      {/* Le chat de la prospection : la même structure que le dashboard. */}
      <div className={vueId || vueDataB || commerces || (onglet !== "prospecter" && !conversation) ? "hidden" : ""}>
        <header className={conversation ? "flex flex-col" : "flex flex-col items-center pt-[10vh] text-center max-md:pt-8"}>
          {!conversation && (
            <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>
              Quelle zone prospectez-vous ?
            </h1>
          )}
          {!conversation && !secteur && <p className="m-0 mt-3 text-[13.5px] text-ardoise">Aucun secteur attribué : demandez à K Partners de le tracer.</p>}
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

function Listes({ demandee = null, onDemandeVue = null, carteDemandee = false, onCarteVue = null, terrain = false, onFermerTerrain = null }) {
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
  const [aSupprimer, setASupprimer] = useState(null);
  const supprimer = useMutation({
    mutationFn: (x) => base44.request("DELETE", `${API}/listes/${x.id}`),
    onSuccess: () => { setASupprimer(null); setChoisie(null); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  // Le mode terrain : la carte en plein écran par-dessus la liste ; la croix revient à la liste.
  const carteTerrain = <AnimatePresence>{terrain && <ModeTerrain key="terrain" listes={listes} libelles={data?.libelles || {}} onFermer={onFermerTerrain} />}</AnimatePresence>;
  // Terrain s'ouvre aussi pendant le chargement : la carte se remplit quand les listes arrivent. Elle reste à la même
  // place dans l'arbre d'un état à l'autre, sinon elle se refermerait et se rouvrirait à l'arrivée des listes.
  return <>{carteTerrain}{corpsListes()}</>;
  function corpsListes() {
  if (isLoading) return <SqueletteListes />;
  if (!l) {
    return <><p className="m-0 mt-10 text-center text-[14px] text-brume">Aucune liste encore. Lancez une prospection, cochez les commerces à garder, puis « Exporter vers une nouvelle liste ».</p></>;
  }
  return (
    <div className="mt-6 w-full pb-16">
      {/* Le classeur de la Prospection de l'admin (9 oct. 2026) : intercalaires
          sur le voile de surface, l'ouvert raccordé à la page à points (rail),
          le compte de chaque liste, la croix de suppression sur l'ouvert. Remis le 30 oct. 2026 (Jules : « comme avant »). */}
      <div ref={ongletsRef} role="tablist" aria-label="Vos listes" className="flex items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span aria-hidden className="w-3 flex-none" />
        {listes.map((x, i) => {
          const actif = x.id === l.id;
          return (
            <React.Fragment key={x.id}>
              {i > 0 && <span aria-hidden className="w-1 flex-none" />}
              <button type="button" role="tab" aria-selected={actif} onClick={() => setChoisie(x.id)} title={x.nom}
                className={`flex max-w-[240px] flex-none items-center gap-2 rounded-t-[10px] px-4 text-left text-[13px] transition-colors ${actif ? "bg-rail pb-[11px] pt-2.5 text-encre" : "bg-surface py-2 text-ardoise hover:bg-rail hover:text-encre"}`}>
                {(x.suggeree || x.agent) && <Sparkles className={`h-3 w-3 flex-none ${actif ? "text-menthe" : "text-brume"}`} aria-label="Liste de votre agent IA" />}
                <span className="truncate">{x.nom}</span>
                <span className={`flex-none text-[11.5px] tabular-nums ${actif ? "text-menthe" : "text-brume"}`}>{x.total}</span>
                {actif && (
                  <span role="button" tabIndex={0} aria-label={`Supprimer la liste ${x.nom}`} title={`Supprimer la liste ${x.nom}`}
                    onClick={(e) => { e.stopPropagation(); setASupprimer(x); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setASupprimer(x); } }}
                    className="-mr-1.5 grid h-5 w-5 flex-none place-items-center rounded-full text-brume transition-colors hover:bg-relief hover:text-alerte max-md:-my-1.5 max-md:h-8 max-md:w-8">
                    <X className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
        <span aria-hidden className="min-w-3 flex-1" />
      </div>
      <div data-zone="listes" className="k-points relative rounded-b-md rounded-t-[12px] bg-rail px-5 pb-5 pt-4 max-md:px-3">
        <TableauListe key={l.id} chiffres={{ total: l.total || 0, faits: (l.total || 0) - (l.a_appeler || 0), rdv: l.rdv || 0 }} fiches={l.fiches} libelles={data?.libelles || {}} listeId={l.id} reste={l.reste} carteDemandee={carteDemandee} onCarteVue={onCarteVue} onRenommer={() => renommer(l)} onSupprimer={() => setASupprimer(l)} agent={!!(l.suggeree || l.agent)} />
      </div>
      <AlertDialog open={!!aSupprimer} onOpenChange={(o) => { if (!o && !supprimer.isPending) setASupprimer(null); }}>
        <AlertDialogContent className="border-bord-vif bg-surface-pleine sm:rounded-bloc">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-encre">Supprimer la liste « {aSupprimer?.nom} » ?</AlertDialogTitle>
            <AlertDialogDescription className="text-ardoise">Ses propriétaires et leurs relances restent : seule la liste disparaît.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={supprimer.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={supprimer.isPending} onClick={(e) => { e.preventDefault(); supprimer.mutate(aSupprimer); }} className="bg-alerte text-fond hover:bg-alerte/90">
              {supprimer.isPending ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
  }
}

