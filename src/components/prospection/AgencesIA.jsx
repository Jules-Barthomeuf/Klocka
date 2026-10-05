import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronRight, Globe, Loader2, Mail, MapPin, Phone, Search, UserPlus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// L'agent IA de la prospection des agents immobiliers, et ses listes. On
// lui donne une ville : il y cherche toutes les agences (Data-B), leur
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

/** L'onglet Agent IA : la ville à chercher, et ce que l'agent fait ou a fait, ville par ville. */
export function OngletAgentIA({ onOuvrirListe }) {
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
        <h2 className="m-0 text-[24px] font-normal tracking-[-0.02em] text-encre">Où l'agent cherche-t-il ?</h2>
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
                <button key={l.id} type="button" onClick={() => onOuvrirListe(l.id)}
                  className="flex w-full items-center gap-5 border-t border-trait px-2 py-4 text-left first:border-t-0" style={{ background: "transparent" }}>
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
  const listes = data?.listes || [];
  const active = ouverte && listes.some((l) => l.id === ouverte) ? ouverte : listes[0]?.id || null;
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  if (!listes.length) return <p className="py-12 text-center text-[14px] text-brume">Aucune liste encore : lancez l'agent IA sur une ville.</p>;
  // Le classeur des listes du mandataire : les intercalaires en haut, l'ouvert
  // raccordé à la page à points (rail-actif), le tableau sur le rail.
  return (
    <div className="w-full pb-16">
      <div role="tablist" aria-label="Les listes par ville" className="flex items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span aria-hidden className="w-2 flex-none" />
        {listes.map((l, i) => {
          const actif = active === l.id;
          return (
            <React.Fragment key={l.id}>
              {i > 0 && <span aria-hidden className="w-1 flex-none" />}
              <button type="button" role="tab" aria-selected={actif} onClick={() => onOuvrir(l.id)}
                className={`flex max-w-[240px] flex-none items-center gap-2 rounded-t-[10px] px-4 text-left text-[13px] transition-colors ${actif ? "bg-rail-actif pb-[11px] pt-2.5 text-encre" : "bg-surface py-2 text-ardoise hover:bg-rail-actif hover:text-encre"}`}>
                <span className="truncate">{l.ville}</span>
                <span className={`flex-none text-[11.5px] tabular-nums ${actif ? "text-menthe" : "text-brume"}`}>{l.agences}</span>
                {l.etat === "en_cours" && <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-menthe" />}
              </button>
            </React.Fragment>
          );
        })}
        <span aria-hidden className="min-w-2 flex-1" />
      </div>
      <div data-zone="listes" className="k-points relative rounded-b-md bg-rail-actif px-5 pb-5 pt-4 max-md:px-3">
        {active && <TableauAgences key={active} id={active} onAppeler={onAppeler} />}
      </div>
    </div>
  );
}

function TableauAgences({ id, onAppeler }) {
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
  // Appeler : l'agence (ou l'agent) entre au carnet si besoin, puis le panneau d'appel s'ouvre.
  const appeler = useMutation({
    mutationFn: ({ agence, agent }) => base44.request("POST", `${API}/agences/${agence}/appeler`, { body: { agent: agent ?? null } }),
    onSuccess: (r) => { onAppeler?.(r.agent_id); queryClient.invalidateQueries({ queryKey: ["agent-ia-liste", id] }); },
    onError: (e) => toast.error(e?.message || "Appel impossible"),
  });
  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.lignes || []).filter((a) => !a.fermee)
      .filter((a) => filtre === "toutes" || (filtre === "agents" ? (a.agents || []).length : filtre === "telephone" ? a.telephone : filtre === "independants" ? estIndependant(a) : filtre === "agences" ? !estIndependant(a) : !a.carnet_id))
      .filter((a) => !t || [a.nom, a.adresse, a.telephone, a.email, ...(a.gerants || []).map((g) => g.nom), ...(a.agents || []).flatMap((x) => [x.nom, x.email])].filter(Boolean).join(" ").toLowerCase().includes(t));
  }, [data, q, filtre]);
  if (isLoading || !data) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] max-w-[420px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 focus-within:border-bord-doux">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Agence, gérant, agent, numéro"
            className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        <div className="flex gap-1 rounded-full bg-rail-actif p-1">
          {[["toutes", "Toutes"], ["agences", "Agences"], ["independants", "Agents indépendants"], ["telephone", "Avec un numéro"], ["agents", "Avec des agents"], ["hors", "Pas au carnet"]].map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setFiltre(k)}
              className={`rounded-full px-3 py-1 text-[12.5px] ${filtre === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`}
              style={filtre === k ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
        <span className="ml-auto text-[13px] text-ardoise">
          {data.etat === "en_cours" ? <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />{data.etape || "L'agent cherche"}</span> : `${lignes.length} agence${lignes.length > 1 ? "s" : ""}${data.fini_le ? ` · mise à jour ${ilYa(data.fini_le)}` : ""}`}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-[16px] border border-trait bg-rail">
        <table className="w-full min-w-[1180px] border-collapse text-left text-[13.5px]">
          <thead>
            <tr>
              {["Agence", "Appeler", "Numéro", "Gérant", "Agents qui publient", "Annonces", ""].map((t, i, tout) => (
                <th key={t || "geste"} className={`border-b border-trait bg-rail px-4 py-3.5 text-[12.5px] font-normal text-encre ${i < tout.length - 1 ? "border-r" : ""}`}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((a) => (
              <tr key={a.id} className="align-top [&>td]:border-b [&>td]:border-trait [&>td:not(:last-child)]:border-r">
                <td className="max-w-[300px] px-4 py-3.5">
                  <p className="m-0 flex items-center gap-2 text-[14.5px] text-encre">
                    {nomPropre(a)}
                    {estIndependant(a) && <span className="flex-none rounded-full border border-trait px-2 py-px text-[11px] text-ardoise">Agent indépendant</span>}
                  </p>
                  {a.adresse && <p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">{a.adresse}</p>}
                  <p className="m-0 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-brume">
                    {a.site && <a href={/^https?:/.test(a.site) ? a.site : `https://${a.site}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-encre"><Globe className="h-3 w-3" />site</a>}
                    {a.email && <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 hover:text-encre"><Mail className="h-3 w-3" />{a.email}</a>}
                    <span>{(a.sources || []).join(" · ")}</span>
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  {a.telephone || (a.agents || []).some((x) => x.telephone) ? (
                    <button type="button" onClick={() => appeler.mutate({ agence: a.id, agent: a.telephone ? null : a.agents.find((x) => x.telephone).email || a.agents.find((x) => x.telephone).telephone })}
                      disabled={appeler.isPending} title="Ouvrir l'appel : enregistrez-le, AK propose la suite et prépare le mail"
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[12.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
                      {appeler.isPending && appeler.variables?.agence === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}Appeler
                    </button>
                  ) : <span className="text-bord-vif">—</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  {a.telephone ? <a href={`tel:${a.telephone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 tabular-nums text-encre hover:text-menthe"><Phone className="h-3.5 w-3.5 text-ardoise" />{a.telephone}</a> : <span className="text-bord-vif">—</span>}
                </td>
                <td className="px-4 py-3.5">
                  {(a.gerants || []).length && !estIndependant(a) ? a.gerants.map((g) => (
                    <p key={g.nom} className="m-0 text-encre">{g.nom}{g.tranche_age ? <span className="text-ardoise"> · {age(g.tranche_age)}</span> : null}</p>
                  )) : <span className="text-bord-vif">—</span>}
                </td>
                <td className="px-4 py-3.5">
                  {(a.agents || []).length ? (
                    <ul className="m-0 list-none space-y-1 p-0">
                      {a.agents.slice(0, 6).map((x) => (
                        <li key={x.email || x.telephone} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                          <span className="text-encre">{x.nom || x.email || "Agent"}</span>
                          {x.telephone && (
                            <button type="button" onClick={() => appeler.mutate({ agence: a.id, agent: x.email || x.telephone })} title={`Appeler ${x.nom || x.email || "cet agent"}`}
                              className="inline-flex items-center gap-1 tabular-nums text-craie hover:text-menthe" style={{ background: "transparent" }}>
                              <Phone className="h-3 w-3" />{x.telephone}
                            </button>
                          )}
                          {x.nom && x.email && <span className="truncate text-[12px] text-brume">{x.email}</span>}
                        </li>
                      ))}
                      {a.agents.length > 6 && <li className="text-[12px] text-brume">et {a.agents.length - 6} autres</li>}
                    </ul>
                  ) : <span className="text-bord-vif">—</span>}
                </td>
                <td className="px-4 py-3.5 tabular-nums text-craie">{a.annonces || ""}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right">
                  {a.carnet_id ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-menthe"><Check className="h-3.5 w-3.5" />Au carnet</span>
                  ) : (
                    <button type="button" onClick={() => carnet.mutate({ agence: a.id })} disabled={carnet.isPending || (!a.telephone && !a.email && !(a.agents || []).length)}
                      title={(a.agents || []).length ? `Ses ${a.agents.length} agents entrent au carnet` : "L'agence entre au carnet par son standard"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-menthe hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
                      <UserPlus className="h-3.5 w-3.5" />Au carnet
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!lignes.length && (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-[13.5px] text-brume">{data.etat === "en_cours" ? "L'agent cherche : les agences arrivent ici." : "Aucune agence ne correspond."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-3 flex items-center gap-1.5 text-[12.5px] text-brume">
        <ArrowRight className="h-3 w-3" />« Au carnet » fait entrer l'agence dans la prospection : la liste du jour, les appels, Monday.
      </p>
    </div>
  );
}
