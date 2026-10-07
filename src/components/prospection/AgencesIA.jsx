import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDictee } from "@/lib/dictee";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, ChevronRight, Loader2, Lock, Mail, MapPin, Mic, Phone, Plus, RefreshCw, Search, Send, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// L'agent IA de la prospection des agents immobiliers, et ses listes. On
// lui donne une ville : il y cherche toutes les agences (Google Maps, comme
// une recherche « agence immobilière » sur Maps, puis Data-B), leur
// gérant (annuaire des entreprises) et les agents qui publient des annonces
// (Equimmox), puis range tout dans la liste de la ville, partagée par
// l'équipe. « Au carnet » fait entrer une agence dans la prospection.

const API = "/api/prospection/agent-ia";
const ilYa = (iso) => {
  if (!iso) return "";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};
// Un agent immatriculé en nom propre (« Monsieur Vito Schiavone ») : souvent un mandataire de réseau.
const INDEPENDANT = /^(monsieur|madame|mademoiselle)\s+/i;
const estIndependant = (a) => INDEPENDANT.test(a.raison_sociale || a.nom || "");
const nomPropre = (a) => String(a.nom || "").replace(INDEPENDANT, "");
/** Déjà en contact : appelée par nous, ou reconnue dans Monday. */
const dejaEnContact = (a) => ["contact", "relance"].includes(a.statut?.etat) || !!a.statut?.appelee;

/** « -50 » → « moins de 50 ans », « +70 » → « plus de 70 ans », « 50-60 » → « 50-60 ans ». */
const age = (t) => String(t).replace(/^-(\d+)$/, "moins de $1").replace(/^\+(\d+)$/, "plus de $1") + " ans";

const TONS = { succes: "bg-menthe", alerte: "bg-ambre", info: "bg-bord-vif" };
const ETATS = { en_cours: "Cherche", fini: "Fini", erreur: "Erreur", interrompue: "Interrompue" };

function useListes() {
  return useQuery({
    queryKey: ["agent-ia-listes"],
    queryFn: () => base44.request("GET", `${API}/listes`),
    // Tant qu'une ville se cherche, la page se relit.
    refetchInterval: (q) => ((q.state.data?.listes || []).some((l) => l.etat === "en_cours") ? 4000 : false),
  });
}

/**
 * Supprimer la liste d'une ville, après confirmation. Les agents déjà au
 * carnet y restent.
 */
function useSupprimerListe() {
  const queryClient = useQueryClient();
  const m = useMutation({
    mutationFn: (l) => base44.request("DELETE", `${API}/listes/${l.id}`),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["agent-ia-listes"] });
      toast.success(`Liste ${r.ville} supprimée`, { description: `${r.agences} agence${r.agences > 1 ? "s" : ""} retirée${r.agences > 1 ? "s" : ""} ; celles au carnet y restent.` });
    },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });
  const demander = (l) => {
    if (window.confirm(`Supprimer la liste ${l.ville} et ses ${l.agences} agence${l.agences > 1 ? "s" : ""} ? Les agents déjà au carnet y restent.`)) m.mutate(l);
  };
  return { demander, enCours: m.isPending };
}

/** L'onglet Agent IA : la ville à chercher, et ce que l'agent fait ou a fait, ville par ville. */
export function OngletAgentIA({ onOuvrirListe }) {
  const supprimer = useSupprimerListe();
  const queryClient = useQueryClient();
  const [ville, setVille] = useState("");
  const { data, isLoading } = useListes();
  const lancer = useMutation({
    mutationFn: (v) => base44.request("POST", `${API}/lancer`, { body: { ville: v } }),
    onSuccess: (r) => {
      toast.success(r.deja ? `${r.liste.ville} se cherche déjà` : `L'agent cherche à ${r.liste.ville}`, { description: "Les agences arrivent dans la liste au fil de l'eau." });
      setVille("");
      queryClient.invalidateQueries({ queryKey: ["agent-ia-listes"] });
    },
    onError: (e) => toast.error(e?.message || "Lancement impossible"),
  });
  const listes = data?.listes || [];
  const enCours = listes.filter((l) => l.etat === "en_cours");

  return (
    <div className="mx-auto max-w-[1100px] pb-16">
      <div className="text-center">
        <h2 className="m-0 text-[24px] font-normal tracking-[-0.02em] text-encre">Où cherchez-vous ?</h2>
        <p className="m-0 mx-auto mt-2 max-w-[64ch] text-[14px] leading-[1.6] text-ardoise">
          Donnez une ville : il trouve toutes ses agences immobilières et leur numéro, leur gérant, et les agents qui y publient des annonces. Tout se range dans la liste de la ville, partagée par l'équipe.
        </p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (ville.trim()) lancer.mutate(ville.trim()); }}
        className="mx-auto mt-6 flex max-w-[560px] items-center gap-3 rounded-full border border-trait bg-surface py-1.5 pl-5 pr-1.5 focus-within:border-bord-doux">
        <MapPin className="h-4 w-4 flex-none text-ardoise" />
        <input value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Nice, Bordeaux, Lille…" aria-label="Ville"
          className="min-w-0 flex-1 border-none bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        <button type="submit" disabled={!ville.trim() || lancer.isPending}
          className="inline-flex h-10 flex-none items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          {lancer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Chercher
        </button>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
      ) : !listes.length ? (
        <p className="py-12 text-center text-[14px] text-brume">Aucune ville cherchée encore : donnez-en une à l'agent.</p>
      ) : (
        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <p className="m-0 mb-3 text-[13.5px] text-craie">Ses villes <span className="text-brume">· {listes.length}</span></p>
            <div className="border-y border-trait">
              {listes.map((l) => (
                <div key={l.id} className="group flex items-center gap-2 border-t border-trait first:border-t-0">
                <button type="button" onClick={() => onOuvrirListe(l.id)}
                  className="flex min-w-0 flex-1 items-center gap-5 px-2 py-4 text-left" style={{ background: "transparent" }}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2.5 text-[15.5px] text-encre">
                      {l.ville}
                      <span className={`inline-flex items-center gap-1.5 rounded-full border border-trait px-2 py-px text-[11.5px] ${l.etat === "en_cours" ? "text-encre" : "text-ardoise"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${l.etat === "en_cours" ? "animate-pulse bg-menthe" : l.etat === "fini" ? "bg-menthe/60" : "bg-ambre"}`} />
                        {l.etat === "en_cours" ? l.etape || ETATS.en_cours : ETATS[l.etat] || l.etat}
                      </span>
                    </span>
                    <span className="mt-1 block text-[13px] text-ardoise">
                      {l.agences} agence{l.agences > 1 ? "s" : ""} · {l.avec_telephone} avec un numéro · {l.agents} agent{l.agents > 1 ? "s" : ""}{l.au_carnet ? ` · ${l.au_carnet} au carnet` : ""}
                    </span>
                  </span>
                  <span className="flex-none text-[12.5px] text-brume">{ilYa(l.fini_le || l.lancee_le)}</span>
                  <ChevronRight className="h-4 w-4 flex-none text-brume" />
                </button>
                {l.etat !== "en_cours" && (
                  <button type="button" onClick={() => supprimer.demander(l)} disabled={supprimer.enCours}
                    aria-label={`Supprimer la liste ${l.ville}`} title={`Supprimer la liste ${l.ville}`}
                    className="grid h-8 w-8 flex-none place-items-center rounded-full text-brume opacity-0 transition hover:bg-relief hover:text-alerte focus:opacity-100 group-hover:opacity-100 max-md:h-10 max-md:w-10 max-md:opacity-100" style={{ background: "transparent" }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                </div>
              ))}
            </div>
          </section>
          <aside className="rounded-[18px] border border-trait bg-surface-pleine lg:sticky lg:top-6">
            <p className="m-0 border-b border-trait px-5 py-3.5 text-[13.5px] text-craie">Journal de l'agent{enCours.length ? <span className="text-brume"> · {enCours.map((l) => l.ville).join(", ")}</span> : null}</p>
            <ol className="m-0 max-h-[520px] list-none overflow-y-auto p-0">
              {listes.flatMap((l) => l.journal.map((e) => ({ ...e, ville: l.ville }))).sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, 40).map((e, i) => (
                <li key={i} className="flex gap-3 border-t border-trait px-5 py-3 first:border-t-0">
                  <span className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${TONS[e.ton] || TONS.info}`} />
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-[1.5] text-encre">{e.texte}</span>
                    <span className="block text-[11.5px] text-brume">{e.ville} · {ilYa(e.le)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}

/** L'onglet Listes : une liste par ville, en classeur ; la ville ouverte en tableau. */
export function OngletListesAgences({ ouverte, onOuvrir, onAppeler }) {
  const { data, isLoading } = useListes();
  const supprimer = useSupprimerListe();
  const listes = data?.listes || [];
  const active = ouverte && listes.some((l) => l.id === ouverte) ? ouverte : listes[0]?.id || null;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  if (!listes.length) return <div className="pb-16"><p className="py-12 text-center text-[14px] text-brume">Aucune liste encore : lancez l'agent IA sur une ville.</p></div>;
  // Le classeur des listes du mandataire : les intercalaires en haut, l'ouvert
  // raccordé à la page à points (rail-actif), le tableau sur le rail.
  return (
    <div className="w-full pb-16">
      <div role="tablist" aria-label="Les listes par ville" className="flex items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Le premier onglet se tient au-delà de l'arrondi du classeur. */}
        <span aria-hidden className="w-3 flex-none" />
        {listes.map((l, i) => {
          const actif = active === l.id;
          return (
            <React.Fragment key={l.id}>
              {i > 0 && <span aria-hidden className="w-1 flex-none" />}
              <button type="button" role="tab" aria-selected={actif} onClick={() => onOuvrir(l.id)}
                className={`flex max-w-[240px] flex-none items-center gap-2 rounded-t-[10px] px-4 text-left text-[13px] transition-colors ${actif ? "bg-rail pb-[11px] pt-2.5 text-encre" : "bg-surface py-2 text-ardoise hover:bg-rail hover:text-encre"}`}>
                <span className="truncate">{l.ville}</span>
                <span className={`flex-none text-[11.5px] tabular-nums ${actif ? "text-menthe" : "text-brume"}`}>{l.agences}</span>
                {l.etat === "en_cours" && <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-menthe" />}
                {actif && l.etat !== "en_cours" && (
                  <span role="button" tabIndex={0} aria-label={`Supprimer la liste ${l.ville}`} title={`Supprimer la liste ${l.ville}`}
                    onClick={(e) => { e.stopPropagation(); supprimer.demander(l); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); supprimer.demander(l); } }}
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
        {active && <TableauAgences key={active} id={active} onAppeler={onAppeler} />}
      </div>
    </div>
  );
}

function TableauAgences({ id, onAppeler }) {
  // L'agent d'un collègue (le premier qui l'a joint) : absent de ma file, signalé ici.
  const { data: equipeDonnees } = useQuery({ queryKey: ["agent-ia-equipe"], queryFn: () => base44.request("GET", `${API}/equipe`), staleTime: 5 * 60_000 });
  const moiEmail = equipeDonnees?.moi || null;
  const contactDe = (a) => {
    const p = a.statut?.proprietaire;
    if (!p || !moiEmail || p === moiEmail) return null;
    const m = (equipeDonnees?.equipe || []).find((x) => x.email === p);
    const n = (m?.nom || String(p).split("@")[0].split(".")[0]).split(" ")[0];
    return n.charAt(0).toUpperCase() + n.slice(1);
  };
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState("toutes");
  const { data, isLoading } = useQuery({
    queryKey: ["agent-ia-liste", id],
    queryFn: () => base44.request("GET", `${API}/listes/${id}`),
    refetchInterval: (x) => (x.state.data?.etat === "en_cours" ? 5000 : false),
  });
  const carnet = useMutation({
    mutationFn: ({ agence, agent }) => base44.request("POST", `${API}/agences/${agence}/carnet`, { body: { agent: agent ?? null } }),
    onSuccess: (r) => {
      toast.success(r.crees ? `Au carnet : ${r.crees} agent${r.crees > 1 ? "s" : ""}` : "Déjà au carnet : fiche complétée");
      for (const k of [["agent-ia-liste", id], ["agent-ia-listes"], ["prospection-grille"]]) queryClient.invalidateQueries({ queryKey: k });
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const [coches, setCoches] = useState(() => new Set());
  const [ouverte, setOuverte] = useState(null);
  const verifier = useMutation({
    mutationFn: () => base44.request("POST", `${API}/listes/${id}/monday`),
    onSuccess: (r) => { toast.success(`Monday : ${r.connues} agence${r.connues > 1 ? "s" : ""} déjà en contact sur ${r.total}`); queryClient.invalidateQueries({ queryKey: ["agent-ia-liste", id] }); },
    onError: (e) => toast.error(e?.message || "Monday n'a pas répondu"),
  });
  // Compléter les cases vides du tableau : Maps, l'annuaire, puis Equimmox, en fond.
  const completer = useMutation({
    mutationFn: () => base44.request("POST", `${API}/listes/${id}/completer`),
    onSuccess: (r) => {
      toast.success(r.deja ? "L'agent travaille déjà sur cette liste" : "Je complète les colonnes vides", { description: r.deja ? undefined : "Google Maps, l'annuaire, puis les annonces Equimmox. Rien de rempli n'est remplacé." });
      for (const k of [["agent-ia-liste", id], ["agent-ia-listes"]]) queryClient.invalidateQueries({ queryKey: k });
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  // Supprimer des lignes cochées : masquées, pas effacées, et elles ne reviennent pas.
  const retirer = useMutation({
    mutationFn: ({ ids, motif }) => base44.request("POST", `${API}/agences/retirer`, { body: { ids, motif } }),
    onSuccess: (r) => {
      toast.success(`${r.retirees} ligne${r.retirees > 1 ? "s" : ""} supprimée${r.retirees > 1 ? "s" : ""}`, { description: r.metier ? `Retenu : « ${r.metier} ». ${r.aussi ? `${r.aussi} autre${r.aussi > 1 ? "s" : ""} ligne${r.aussi > 1 ? "s" : ""} du même métier retirée${r.aussi > 1 ? "s" : ""}, et les prochaines aussi.` : "Les prochaines de ce métier seront retirées d'elles-mêmes."}` : undefined });
      setCoches(new Set());
      setPourquoi(false);
      for (const k of [["agent-ia-liste", id], ["agent-ia-listes"]]) queryClient.invalidateQueries({ queryKey: k });
    },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });
  const [pourquoi, setPourquoi] = useState(false);
  const [mail, setMail] = useState(null); // { agence, agent }
  const basculer = (x) => setCoches((c) => { const n = new Set(c); if (n.has(x)) n.delete(x); else n.add(x); return n; });
  const versMonday = useMutation({
    mutationFn: (ids) => base44.request("POST", `${API}/monday`, { body: { ids } }),
    onSuccess: (r) => {
      toast.success(`${r.crees} contact${r.crees > 1 ? "s" : ""} dans Monday`, { description: r.doublons ? `${r.doublons} déjà au tableau, ou sans numéro ni mail.` : "Tableau « Prospection Agent Immo »." });
      setCoches(new Set());
      queryClient.invalidateQueries({ queryKey: ["agent-ia-liste", id] });
    },
    onError: (e) => toast.error(e?.message || "Monday n'a pas répondu"),
  });
  // Appeler : l'agence (ou l'agent) entre au carnet si besoin, puis le panneau d'appel s'ouvre.
  const appeler = useMutation({
    mutationFn: ({ agence, agent }) => base44.request("POST", `${API}/agences/${agence}/appeler`, { body: { agent: agent ?? null } }),
    onSuccess: (r) => { onAppeler?.(r.agent_id); queryClient.invalidateQueries({ queryKey: ["agent-ia-liste", id] }); },
    onError: (e) => toast.error(e?.message || "Appel impossible"),
  });
  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.lignes || []).filter((a) => !a.fermee)
      .filter((a) => filtre === "toutes" || (filtre === "agents" ? (a.agents || []).length : filtre === "telephone" ? a.telephone : filtre === "independants" ? estIndependant(a) : filtre === "agences" ? !estIndependant(a) : filtre === "inconnues" ? a.statut?.etat === "jamais" : filtre === "relance" ? a.statut?.etat === "relance" : filtre === "supprimees" ? true : !a.carnet_id))
      .filter((a) => !t || [a.nom, a.adresse, a.telephone, a.email, ...(a.gerants || []).map((g) => g.nom), ...(a.agents || []).flatMap((x) => [x.nom, x.email])].filter(Boolean).join(" ").toLowerCase().includes(t));
  }, [data, q, filtre]);
  if (isLoading || !data) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;

  return (
    <div>
      <BarreVille ville={data.ville} chiffres={data.chiffres} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] max-w-[420px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 focus-within:border-bord-doux max-md:min-w-0 max-md:max-w-none max-md:basis-full">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Agence, gérant, agent, numéro"
            className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        {/* Six filtres : au téléphone, la pilule défile sur une ligne. */}
        <div className="flex gap-1 rounded-full bg-rail-actif p-1 max-md:max-w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
          {[["toutes", "Toutes"], ["relance", "Relance due"], ["inconnues", "Jamais contactées"], ["agences", "Agences"], ["independants", "Indépendants"], ["telephone", "Avec un numéro"], ["agents", "Avec des agents"], ["supprimees", "Supprimées"]].map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setFiltre(k)}
              className={`rounded-full px-3 py-1 text-[12.5px] max-md:flex-none max-md:whitespace-nowrap max-md:py-1.5 ${filtre === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`}
              style={filtre === k ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
        <span className="ml-auto text-[13px] text-ardoise max-md:ml-0">
          {data.etat === "en_cours" ? <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />{data.etape || "L'agent cherche"}</span> : `${lignes.length} agence${lignes.length > 1 ? "s" : ""}${data.deja_monday ? ` · ${data.deja_monday} déjà en contact` : ""}${data.fini_le ? ` · mise à jour ${ilYa(data.fini_le)}` : ""}`}
        </span>
        <button type="button" onClick={() => completer.mutate()} disabled={completer.isPending || data.etat === "en_cours"} title="Remplir les cases vides (adresse, site, Maps, téléphone, gérants, agents) sans toucher au reste"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
          {completer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Compléter les colonnes vides
        </button>
        <button type="button" onClick={() => verifier.mutate()} disabled={verifier.isPending || data.etat === "en_cours"} title="Revérifier dans Monday qui est déjà en contact"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
          {verifier.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Vérifier dans Monday
        </button>
      </div>

      {coches.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-trait bg-surface-pleine px-4 py-2.5">
          <span className="text-[13.5px] text-encre">{coches.size} agence{coches.size > 1 ? "s" : ""} cochée{coches.size > 1 ? "s" : ""}</span>
          <button type="button" onClick={async () => { for (const x of coches) { const a = (data.lignes || []).find((l) => l.id === x); if (a && !a.carnet_id) await carnet.mutateAsync({ agence: x }).catch(() => {}); } setCoches(new Set()); }} disabled={carnet.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13px] text-encre hover:border-menthe" style={{ background: "transparent" }}>
            {carnet.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}Mettre au carnet
          </button>
          <button type="button" onClick={() => versMonday.mutate([...coches])} disabled={versMonday.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
            {versMonday.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Envoyer dans Monday
          </button>
          <button type="button" onClick={() => setPourquoi(true)} disabled={retirer.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13px] text-alerte hover:border-alerte disabled:opacity-50" style={{ background: "transparent" }}>
            {retirer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Supprimer
          </button>
          <button type="button" onClick={() => setCoches(new Set())} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Tout décocher</button>
        </div>
      )}
      {filtre === "supprimees" ? <Supprimees listeId={id} /> : (<>
      <div className="mt-4 overflow-x-auto rounded-[16px] border border-trait">
        <table className="w-full min-w-[1200px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="text-[12.5px] text-encre">
              <th className="w-[52px] border-b border-trait py-3.5 pl-5 pr-1">
                <button type="button" onClick={() => setCoches(lignes.every((a) => coches.has(a.id)) ? new Set() : new Set(lignes.map((a) => a.id)))} disabled={!lignes.length}
                  aria-label="Tout cocher" title="Tout cocher" className="grid place-items-center disabled:opacity-40" style={{ background: "transparent" }}>
                  <Case oui={lignes.length > 0 && lignes.every((a) => coches.has(a.id))} />
                </button>
              </th>
              {["Associé à", "Nom", "Adresse", "Site", "Maps", "Téléphone", "Gérants", "Agents"].map((t) => <th key={t} className="border-b border-trait px-4 py-3.5 font-normal text-encre">{t}</th>)}
            </tr>
          </thead>
          <tbody>
            {lignes.map((a) => {
              const domaine = a.site ? String(a.site).replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] : null;
              const tel = a.telephone || (a.agents || []).find((x) => x.telephone)?.telephone || null;
              const ouvert = ouverte === a.id;
              return (
                <React.Fragment key={a.id}>
                  <tr onClick={() => setOuverte(ouvert ? null : a.id)} className={`cursor-pointer align-top transition-colors [&>td]:border-b [&>td]:border-trait ${a.statut?.etat === "morte" ? "opacity-45" : ""} ${coches.has(a.id) ? "bg-menthe/[0.05]" : ouvert ? "bg-relief/50" : "hover:bg-relief/30"}`}>
                    <td className="py-4 pl-5 pr-1" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => basculer(a.id)} aria-label={`Cocher ${nomPropre(a)}`} className="grid place-items-center" style={{ background: "transparent" }}><Case oui={coches.has(a.id)} /></button>
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}><CellulePour agence={a} listeId={id} /></td>
                    <td className="max-w-[260px] px-4 py-4">
                      <p className="m-0 text-encre">{nomPropre(a)}</p>
                      {/* Sous le nom, une seule chose : déjà en contact, ou rien (6 oct. 2026). */}
                      {contactDe(a) ? <p className="m-0 mt-1"><span className="rounded-[6px] bg-relief px-1.5 py-px text-[11.5px] text-craie">Contact de {contactDe(a)}</span></p>
                        : dejaEnContact(a) && <p className="m-0 mt-1"><span className="rounded-[6px] bg-ambre/15 px-1.5 py-px text-[11.5px] text-ambre">Déjà en contact</span></p>}
                    </td>
                    <td className="max-w-[220px] px-4 py-4 text-craie">{a.adresse || <span className="text-bord-vif">—</span>}</td>
                    <td className="max-w-[180px] truncate px-4 py-4">
                      {domaine ? <a onClick={(e) => e.stopPropagation()} href={/^https?:/.test(a.site) ? a.site : `https://${a.site}`} target="_blank" rel="noreferrer" className="text-bleu hover:underline">{domaine}</a> : <span className="text-bord-vif">—</span>}
                    </td>
                    <td className="px-4 py-4">
                      {a.maps_url ? <a onClick={(e) => e.stopPropagation()} href={a.maps_url} target="_blank" rel="noreferrer" aria-label="Fiche Google Maps" title="Fiche Google Maps" className="text-craie hover:text-encre"><MapPin className="h-4 w-4" /></a> : <span className="text-bord-vif">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 tabular-nums text-encre">{tel || <span className="text-bord-vif">—</span>}</td>
                    <td className="px-4 py-4 text-craie">{(a.gerants || []).length ? a.gerants.map((g) => g.nom).join(", ") : <span className="text-bord-vif">—</span>}</td>
                    <td className="whitespace-nowrap px-4 py-4 tabular-nums text-craie">
                      {(a.agents || []).length}{a.en_appel_par && <Lock className="ml-1.5 inline h-3 w-3 text-ardoise" aria-label={`En appel par ${a.en_appel_par}`} />}
                    </td>
                  </tr>
                  {ouvert && (
                    <tr className="[&>td]:border-b [&>td]:border-trait">
                      <td />
                      <td colSpan={8} className="px-4 pb-5 pt-1">
                        <div className="flex flex-wrap items-start gap-6">
                          <div className="min-w-[280px] flex-1">
                            <p className="m-0 mb-2 text-[12.5px] text-ardoise">{(a.agents || []).length ? "Ses agents" : "Le standard"}{a.email ? ` · ${a.email}` : ""}</p>
                            {(a.agents || []).length ? (
                              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                                {a.agents.map((x) => (
                                  <li key={x.email || x.telephone} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                                    <span className="text-encre">{x.nom || x.email || "Agent"}</span>
                                    {x.telephone && <span className="tabular-nums text-craie">{x.telephone}</span>}
                                    {x.email && x.nom && <span className="text-ardoise">{x.email}</span>}
                                    {x.monday && <span className="rounded-[6px] bg-ambre/15 px-1.5 py-px text-[11px] text-ambre">Monday{x.monday.statut ? ` · ${x.monday.statut}` : ""}</span>}
                                    {x.telephone && <button type="button" onClick={() => appeler.mutate({ agence: a.id, agent: x.email || x.telephone })} className="inline-flex items-center gap-1 text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}><Phone className="h-3 w-3" />Appeler</button>}
                                    {x.email && <button type="button" onClick={() => setMail({ agence: a.id, agent: x.email })} className="inline-flex items-center gap-1 text-[12.5px] text-craie hover:text-encre" style={{ background: "transparent" }}><Mail className="h-3 w-3" />Écrire</button>}
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="m-0 text-[13px] text-craie">{a.gerants?.[0]?.nom ? `Au nom de ${a.gerants[0].nom}` : "L'agence, par son standard"}.</p>}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {tel && (
                              <button type="button" onClick={() => appeler.mutate({ agence: a.id, agent: a.telephone ? null : a.agents.find((x) => x.telephone).email || a.agents.find((x) => x.telephone).telephone })} disabled={appeler.isPending}
                                className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-encre px-4 text-[13.5px] text-fond hover:opacity-90 disabled:opacity-50">
                                {appeler.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}Appeler
                              </button>
                            )}
                            {(a.email || (a.agents || []).some((x) => x.email)) && (
                              <button type="button" onClick={() => setMail({ agence: a.id, agent: a.email ? null : a.agents.find((x) => x.email).email })}
                                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-trait px-3.5 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>
                                <Mail className="h-3.5 w-3.5" />Email{(a.mails || []).length ? <span className="text-brume">· {a.mails.length}</span> : null}
                              </button>
                            )}
                            {!a.carnet_id && (
                              <button type="button" onClick={() => carnet.mutate({ agence: a.id })} disabled={carnet.isPending || (!a.telephone && !a.email && !(a.agents || []).length)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-trait px-3.5 text-[13px] text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
                                <UserPlus className="h-3.5 w-3.5" />Au carnet
                              </button>
                            )}
                          </div>
                        </div>
                        {a.statut?.probable && <p className="m-0 mt-3 text-[12.5px] text-ambre">Correspondance probable dans Monday ({a.monday_connu?.tableau}, reconnue par {a.monday_connu?.par}) : vérifiez que c'est bien la même agence.</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {!lignes.length && (
              <tr><td colSpan={8} className="px-6 py-10 text-center text-[13.5px] text-brume">{data.etat === "en_cours" ? "L'agent cherche : les agences arrivent ici." : "Aucune agence ne correspond."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-3 flex items-center gap-1.5 text-[12.5px] text-brume">
        <ArrowRight className="h-3 w-3" />Une ligne s'ouvre au clic : ses agents, « Appeler », « Email », « Au carnet ». Les cases cochées vont au carnet ou dans Monday.
      </p>
      </>)}
      {pourquoi && <FenetrePourquoi n={coches.size} enCours={retirer.isPending} onFermer={() => setPourquoi(false)} onValider={(motif) => retirer.mutate({ ids: [...coches], motif })} />}
      {mail && <FenetreMail {...mail} lignes={data.lignes} onFermer={() => setMail(null)} onEnvoye={() => queryClient.invalidateQueries({ queryKey: ["agent-ia-liste", id] })} />}
    </div>
  );
}

/** Une case à cocher, comme dans les listes du mandataire. */
function Case({ oui }) {
  return (
    <span className={`grid h-[18px] w-[18px] place-items-center rounded-[5px] border transition-colors ${oui ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif hover:border-menthe"}`}>
      {oui && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

/** Le tableau de bord de la ville : les agences, la part faite, les intéressées, les relances. */
function BarreVille({ ville, chiffres }) {
  if (!chiffres) return null;
  const pc = chiffres.fait_pourcent ?? 0;
  const bloc = "rounded-[16px] border border-trait bg-surface px-4 py-3";
  return (
    <div className="mb-5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <div className={bloc}><p className="m-0 text-[24px] leading-none text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>{chiffres.agences}</p><p className="m-0 mt-1.5 text-[12.5px] text-ardoise">agence{chiffres.agences > 1 ? "s" : ""} à {ville}</p></div>
        <div className={bloc}>
          <p className="m-0 text-[24px] leading-none text-menthe" style={{ fontVariantNumeric: "tabular-nums" }}>{pc} %</p>
          <p className="m-0 mt-1.5 text-[12.5px] text-ardoise">fait</p>
          <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-encre/[0.10]"><div className="h-full rounded-full bg-menthe transition-[width] duration-500" style={{ width: `${pc}%` }} /></div>
        </div>
        <div className={bloc}><p className="m-0 text-[24px] leading-none text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>{chiffres.interessees}</p><p className="m-0 mt-1.5 text-[12.5px] text-ardoise">intéressée{chiffres.interessees > 1 ? "s" : ""}</p></div>
        <div className={bloc}><p className="m-0 text-[24px] leading-none text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>{chiffres.a_rappeler}</p><p className="m-0 mt-1.5 text-[12.5px] text-ardoise">à rappeler</p></div>
      </div>
      {/* Ce qui n'est pas compté comme agence, dit pour qu'on sache d'où vient le reste des lignes. */}
      {(chiffres.independants > 0 || chiffres.societes > 0 || chiffres.annonceurs > 0 || chiffres.mortes > 0) && (
        <p className="m-0 mt-2 text-[12.5px] text-brume">
          À part : {[
            chiffres.independants ? `${chiffres.independants} agent${chiffres.independants > 1 ? "s" : ""} en nom propre` : null,
            chiffres.societes ? `${chiffres.societes} société${chiffres.societes > 1 ? "s" : ""} sans vitrine (ni fiche Google, ni annonce)` : null,
            chiffres.annonceurs ? `${chiffres.annonceurs} nom${chiffres.annonceurs > 1 ? "s" : ""} d'annonces` : null,
            chiffres.mortes ? `${chiffres.mortes} morte${chiffres.mortes > 1 ? "s" : ""}` : null,
          ].filter(Boolean).join(" · ")}.
        </p>
      )}
    </div>
  );
}

/** Pourquoi on supprime : quelques mots, que la liste retient pour la suite. */
const MOTIFS_RAPIDES = ["Notaire", "Syndic", "Gestion locative", "Promoteur", "Que des entrepôts", "Centres commerciaux XXL", "Location saisonnière", "Pas une agence", "Doublon", "Fermée"];
function FenetrePourquoi({ n, onValider, onFermer, enCours }) {
  const [motif, setMotif] = useState("");
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm md:left-[var(--k-barre-largeur,0px)]" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="w-full max-w-[460px] rounded-[20px] border border-bord-vif bg-surface-pleine p-5">
        <p className="m-0 text-[17px] text-encre">Pourquoi supprimer {n > 1 ? `ces ${n} lignes` : "cette ligne"} ?</p>
        <p className="m-0 mt-1 text-[13px] text-ardoise">En quelques mots. Un métier (notaire, syndic, entrepôts…) devient une règle : les autres lignes de ce métier sortiront d'elles-mêmes.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {MOTIFS_RAPIDES.map((m) => (
            <button key={m} type="button" onClick={() => setMotif(m)}
              className={`rounded-full border px-3 py-1.5 text-[13px] ${motif === m ? "border-menthe bg-menthe/15 text-encre" : "border-trait text-craie hover:text-encre"}`} style={motif === m ? undefined : { background: "transparent" }}>{m}</button>
          ))}
        </div>
        <input value={motif} onChange={(e) => setMotif(e.target.value)} autoFocus placeholder="Ou écrivez : « le site ne parle que d'entrepôts »"
          onKeyDown={(e) => { if (e.key === "Enter" && motif.trim()) onValider(motif.trim()); if (e.key === "Escape") onFermer(); }}
          className="mt-3 h-11 w-full rounded-[12px] border border-trait bg-surface px-3.5 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onFermer} className="h-10 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
          <button type="button" onClick={() => onValider(motif.trim())} disabled={!motif.trim() || enCours}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-alerte/90 px-4 text-[13.5px] text-white disabled:opacity-50">
            {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

/** Les lignes supprimées, avec leur motif : le contexte qu'on garde, et « Remettre ». */
function Supprimees({ listeId }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["agent-ia-retirees", listeId], queryFn: () => base44.request("GET", `${API}/listes/${listeId}/retirees`) });
  const remettre = useMutation({
    mutationFn: (agence) => base44.request("POST", `${API}/agences/${agence}/remettre`),
    onSuccess: () => { for (const k of [["agent-ia-retirees", listeId], ["agent-ia-liste", listeId]]) queryClient.invalidateQueries({ queryKey: k }); },
  });
  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const lignes = data?.retirees || [];
  return (
    <div className="mt-4">
      {(data?.regles || []).length > 0 && <p className="m-0 mb-3 text-[13px] text-craie">Retenu de vos suppressions : {data.regles.map((r) => r.libelle).join(", ")}. Ces métiers sortent des listes d'eux-mêmes.</p>}
      {!lignes.length && <p className="py-10 text-center text-[14px] text-brume">Aucune ligne supprimée dans cette liste.</p>}
      <ul className="m-0 list-none border-y border-trait p-0">
        {lignes.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-4 border-t border-trait px-2 py-3.5 first:border-t-0">
            <span className="min-w-0">
              <span className="block truncate text-[15px] text-encre">{x.nom}</span>
              <span className="block text-[12.5px] text-ardoise">{[x.motif || "sans motif", x.par === "automatique" ? "retirée automatiquement" : x.par ? `par ${String(x.par).split("@")[0].split(".")[0]}` : null].filter(Boolean).join(" · ")}</span>
            </span>
            <button type="button" onClick={() => remettre.mutate(x.id)} className="h-9 flex-none rounded-full border border-trait px-3.5 text-[12.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>Remettre</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Qui tient la ligne : un clic dans la case y met celui qui clique, « + » y
 * ajoute quelqu'un de l'équipe, un clic sur un prénom l'enlève (6 oct. 2026).
 */
function CellulePour({ agence, listeId }) {
  const queryClient = useQueryClient();
  const [menu, setMenu] = useState(false);
  const { data } = useQuery({ queryKey: ["agent-ia-equipe"], queryFn: () => base44.request("GET", `${API}/equipe`), staleTime: 5 * 60_000 });
  const equipe = data?.equipe || [];
  const pour = agence.pour || [];
  const membre = (email) => equipe.find((m) => m.email === email) || { email, nom: String(email).split("@")[0], photo: null };
  const changer = useMutation({
    mutationFn: ({ email = null, retirer = false }) => base44.request("POST", `${API}/agences/${agence.id}/pour`, { body: { email, retirer } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-ia-liste", listeId] }),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const autres = equipe.filter((m) => !pour.includes(m.email));
  const moi = data?.moi ? membre(data.moi) : null;
  return (
    <div className="relative flex min-w-[96px] items-center">
      {/* Les photos se chevauchent un peu ; un clic sur l'une retire la personne. */}
      <div className="flex items-center -space-x-1.5">
        {pour.map((email) => {
          const m = membre(email);
          return (
            <button key={email} type="button" onClick={() => changer.mutate({ email, retirer: true })} title={`${m.nom} · cliquer pour retirer`} aria-label={`Retirer ${m.nom}`}
              className="relative rounded-full ring-2 ring-surface transition-transform hover:z-10 hover:scale-110" style={{ background: "transparent" }}>
              <Avatar membre={m} />
            </button>
          );
        })}
      </div>
      {!pour.length && (
        <button type="button" onClick={() => changer.mutate({})} disabled={changer.isPending} title="M'associer à cette ligne" aria-label="M'associer à cette ligne"
          className="rounded-full opacity-45 transition-opacity hover:opacity-100" style={{ background: "transparent" }}>
          {moi ? <Avatar membre={moi} pointille /> : <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-bord-vif text-[11px] text-brume">Moi</span>}
        </button>
      )}
      {autres.length > 0 && (
        <button type="button" onClick={() => setMenu((x) => !x)} aria-label="Associer quelqu'un d'autre" title="Associer quelqu'un d'autre"
          className="ml-1.5 grid h-6 w-6 place-items-center rounded-full border border-trait text-ardoise hover:border-menthe hover:text-encre max-md:h-8 max-md:w-8" style={{ background: "transparent" }}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
          {/* Nos têtes en grand : on reconnaît quelqu'un plus vite qu'on ne lit son prénom. */}
          <div className="absolute left-0 top-full z-40 mt-2 grid w-max grid-cols-3 gap-1 rounded-[14px] border border-bord-vif bg-surface-pleine p-2 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
            {autres.map((m) => (
              <button key={m.email} type="button" onClick={() => { changer.mutate({ email: m.email }); setMenu(false); }}
                className={`flex w-[84px] flex-col items-center gap-1.5 rounded-[12px] px-1.5 py-2 text-[12.5px] hover:bg-relief hover:text-encre ${m.ancien ? "text-brume" : "text-craie"}`} style={{ background: "transparent" }}>
                <Avatar membre={m} grand /><span className="w-full truncate text-center">{m.nom}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** La photo d'un membre de l'équipe, ou son initiale. */
function Avatar({ membre, petit = false, grand = false, pointille = false }) {
  const [ko, setKo] = useState(false);
  const taille = grand ? "h-14 w-14 text-[18px]" : petit ? "h-6 w-6 text-[10.5px]" : "h-8 w-8 text-[12px]";
  if (membre.photo && !ko) {
    return <img src={membre.photo} alt={membre.nom} onError={() => setKo(true)} className={`${taille} block rounded-full object-cover ${pointille ? "outline-dashed outline-1 outline-offset-2 outline-bord-vif" : ""}`} />;
  }
  return <span className={`${taille} grid place-items-center rounded-full bg-menthe/25 font-medium text-menthe ${pointille ? "border border-dashed border-bord-vif bg-transparent text-brume" : ""}`}>{(membre.nom || "?").charAt(0).toUpperCase()}</span>;
}

/** Le mail à une agence ou à l'un de ses agents : prérempli avec nos critères, relu, envoyé d'un clic. */
function FenetreMail({ agence, agent = null, lignes = [], onFermer, onEnvoye }) {
  const a = lignes.find((x) => x.id === agence);
  const adresses = [a?.email ? [a.email, `${a.nom} (agence)`] : null, ...(a?.agents || []).filter((x) => x.email).map((x) => [x.email, x.nom ? `${x.nom}` : x.email])].filter(Boolean);
  const [m, setM] = useState(null);
  const { isLoading } = useQuery({
    queryKey: ["agent-ia-mail", agence, agent],
    // Le brouillon se relit à chaque ouverture : il remplit la fenêtre.
    gcTime: 0,
    queryFn: async () => { const r = await base44.request("GET", `${API}/agences/${agence}/mail${agent ? `?agent=${encodeURIComponent(agent)}` : ""}`); setM({ a: r.a, objet: r.objet, corps: r.corps }); return r; },
  });
  const envoyer = useMutation({
    mutationFn: () => base44.request("POST", `${API}/mail`, { body: { ...m, agence_id: agence } }),
    onSuccess: (r) => { toast.success(r.simule ? "Envoi simulé" : "Mail envoyé", { description: m.a }); onEnvoye?.(); onFermer(); },
    onError: (e) => toast.error(e?.message || "Le mail n'est pas parti"),
  });
  const champ = "w-full rounded-[10px] border border-trait bg-fond px-3 py-2 text-[14px] text-encre outline-none focus:border-menthe/60 max-md:text-[16px]";
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 md:left-[var(--k-barre-largeur,0px)] max-md:p-3" role="dialog" aria-modal="true" aria-label="Écrire à l'agence">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFermer} />
      <div className="k-grid relative flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[20px] max-md:max-h-[calc(100dvh-24px)] border border-bord-vif bg-fond shadow-[0_40px_120px_-24px_rgba(0,0,0,0.8)]">
        <div className="flex h-14 flex-none items-center gap-3 border-b border-trait px-5 max-md:px-4">
          <span className="min-w-0 flex-1 truncate text-[15px] text-encre">Écrire à {a?.nom || "l'agence"}</span>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre max-md:h-10 max-md:w-10" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        {isLoading || !m ? (
          <div className="grid flex-1 place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 max-md:px-4">
              <label className="block text-[12.5px] text-ardoise">À
                {adresses.length > 1 ? (
                  <select value={m.a} onChange={(e) => setM({ ...m, a: e.target.value })} className={`${champ} mt-1`}>
                    {adresses.map(([e, nom]) => <option key={e} value={e}>{nom} · {e}</option>)}
                  </select>
                ) : <input value={m.a} onChange={(e) => setM({ ...m, a: e.target.value })} className={`${champ} mt-1`} />}
              </label>
              <label className="block text-[12.5px] text-ardoise">Objet
                <input value={m.objet} onChange={(e) => setM({ ...m, objet: e.target.value })} className={`${champ} mt-1`} />
              </label>
              <label className="block text-[12.5px] text-ardoise">Message
                <textarea value={m.corps} onChange={(e) => setM({ ...m, corps: e.target.value })} rows={12} className={`${champ} mt-1 resize-y leading-[1.6]`} />
              </label>
              <p className="m-0 text-[12px] text-brume">{"{signature}"} devient votre nom à l'envoi.</p>
            </div>
            <div className="flex flex-none items-center justify-end gap-3 border-t border-trait px-5 py-3.5 max-md:px-4">
              <button type="button" onClick={onFermer} className="text-[13px] text-ardoise hover:text-encre max-md:h-10 max-md:px-2" style={{ background: "transparent" }}>Annuler</button>
              <button type="button" onClick={() => envoyer.mutate()} disabled={envoyer.isPending || !m.a || !m.objet.trim() || !m.corps.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
                {envoyer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Envoyer
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
