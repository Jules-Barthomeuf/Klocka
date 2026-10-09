import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Trash2, Undo2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import TableauDeBordRelances from "@/components/prospection/TableauDeBordRelances";
import ListeRelances from "@/components/prospection/ListeRelances";
import ModeAppel from "@/components/prospection/ModeAppel";

// La page Relances (spec du 8 oct. 2026) : une seule page partagée par toute
// l'équipe, en trois onglets comme la Prospection : Tableau de bord (mails à
// valider, activité, pilotage), Liste (toutes les relances à faire, en
// tableau ; cocher pour supprimer ou renvoyer en prospection) et Mode appel.
// Un clic sur une ligne la prend (« En cours : Maxime » chez les autres en
// moins de deux secondes) et ouvre le mode appel sur cet agent ; l'onglet Mode
// appel prend la première ligne libre. Après l'issue : « Relance suivante »
// prend la prochaine ligne libre dans l'ordre de la liste, ou « Retour à la liste ».

const API = "/api/prospection/relances";
const PARTIES = [["bord", "Tableau de bord"], ["liste", "Liste"], ["appel", "Mode appel"]];
const pl = (n, mot, mots = `${mot}s`) => `${n} ${n > 1 ? mots : mot}`;

export default function Relances() {
  const queryClient = useQueryClient();
  const [courante, setCourante] = useState(null); // { cle, agence_id } : la ligne prise, mode appel ouvert
  const [motif, setMotif] = useState(null);
  const [ville, setVille] = useState("");
  const [avis, setAvis] = useState(null); // { texte, apres } : une ligne prise entre-temps, et d'où proposer la suivante
  const [ouverture, setOuverture] = useState(null);
  const [coches, setCoches] = useState(() => new Set());
  const [cherche, setCherche] = useState("");
  const [partie, setPartieBrute] = useState(() => { try { const x = localStorage.getItem("relances.partie"); return PARTIES.some(([k]) => k === x) && x !== "appel" ? x : "liste"; } catch { return "liste"; } });
  const setPartie = (k) => { setPartieBrute(k); try { if (k !== "appel") localStorage.setItem("relances.partie", k); } catch { /* navigation privée */ } };
  const q = useQuery({ queryKey: ["relances"], queryFn: () => base44.request("GET", API), refetchInterval: courante ? false : 20_000, refetchOnWindowFocus: true });
  // « Pris par » : relu toutes les secondes et demie tant que la liste est à l'écran.
  const p = useQuery({ queryKey: ["relances-prises"], queryFn: () => base44.request("GET", `${API}/prises`), refetchInterval: courante ? false : 1_500 });
  const data = q.data;
  // Un appel validé ailleurs (relance ou rappel entrant) : la liste se relit tout de suite chez tout le monde.
  const versionVue = useRef(null);
  useEffect(() => {
    const v = p.data?.version;
    if (v == null) return;
    if (versionVue.current != null && v !== versionVue.current && !courante) q.refetch();
    versionVue.current = v;
  }, [p.data?.version]);
  const prises = p.data?.prises || data?.prises || {};
  const moi = data?.moi || null;
  const filtrer = (t, v = ville) => (t || []).filter((x) => (!motif || x.motif.cle === motif) && (!v || x.ville === v));
  const lignes = useMemo(() => {
    const t = cherche.trim().toLowerCase();
    return filtrer(data?.lignes).filter((x) => !t || [x.nom, x.agence, x.telephone, x.ville].filter(Boolean).join(" ").toLowerCase().includes(t));
  }, [data, motif, ville, cherche]);
  // Les quatre chiffres de la ville, comme la barre d'une liste de la Prospection.
  const dansLaVille = useMemo(() => (data?.lignes || []).filter((x) => !ville || x.ville === ville), [data, ville]);

  // En quittant la page avec une ligne prise, elle se libère.
  const couranteRef = useRef(null);
  useEffect(() => { couranteRef.current = courante; }, [courante]);
  useEffect(() => () => { if (couranteRef.current) base44.request("POST", `${API}/lacher`, { body: { cle: couranteRef.current.cle } }).catch(() => {}); }, []);

  const prendre = async (x) => {
    const r = await base44.request("POST", `${API}/prendre`, { body: { cle: x.cle } });
    return { cle: x.cle, agence_id: r.agence_id };
  };
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["relances"] }); queryClient.invalidateQueries({ queryKey: ["relances-prises"] }); };
  const ouvrir = useMutation({
    mutationFn: prendre,
    onMutate: (x) => { setOuverture(x.cle); setAvis(null); },
    onSuccess: (c) => { setCourante(c); setPartie("appel"); },
    onError: (e, x) => { setAvis({ texte: e?.message || "Cette relance n'a pas pu s'ouvrir.", apres: x.cle }); p.refetch(); },
    onSettled: () => setOuverture(null),
  });

  // La prochaine ligne libre après `apres`, dans l'ordre de la liste ; on en essaie quelques-unes si un collègue est plus rapide.
  const prochaineLibre = async (apres, v = ville) => {
    const [frais, fp] = await Promise.all([q.refetch(), p.refetch()]);
    const toutes = filtrer(frais.data?.lignes, v);
    const pr = fp.data?.prises || {};
    const i = toutes.findIndex((x) => x.cle === apres);
    const candidates = (i >= 0 ? [...toutes.slice(i + 1), ...toutes.slice(0, i)] : toutes).filter((x) => x.cle !== apres && (!pr[x.cle] || pr[x.cle].par === moi));
    for (const x of candidates.slice(0, 8)) {
      try { return await prendre(x); } catch { /* prise entre-temps : la suivante */ }
    }
    return null;
  };
  const suivante = async () => {
    const c = courante;
    const n = await prochaineLibre(c?.cle);
    if (n) { setCourante(n); return; }
    if (c) await base44.request("POST", `${API}/lacher`, { body: { cle: c.cle } }).catch(() => {});
    setCourante(null); rafraichir();
    toast.success("Plus de relance libre pour l'instant");
  };
  const retour = async ({ deja_lachee = false } = {}) => {
    if (courante && !deja_lachee) await base44.request("POST", `${API}/lacher`, { body: { cle: courante.cle } }).catch(() => {});
    setCourante(null); rafraichir();
    setPartie("liste");
  };
  // L'onglet Mode appel : la ligne ouverte, sinon la première libre de la liste.
  const [aucuneLibre, setAucuneLibre] = useState(false);
  const choisirPartie = async (k) => {
    if (k === partie) return;
    if (k !== "appel") { setEssai(false); if (courante) await retour(); setPartie(k); return; }
    setPartie("appel");
    if (courante) return;
    setAucuneLibre(false);
    const n = await prochaineLibre(null);
    if (n) setCourante(n); else setAucuneLibre(true);
  };
  // Le mode appel, ville par ville (8 oct. 2026) : les intercalaires de la Prospection, « Toutes les villes » d'abord.
  const ongletsVilles = data ? [["", "Toutes les villes", (data.lignes || []).length], ...data.villes.map((v) => [v, v, (data.lignes || []).filter((x) => x.ville === v).length])] : [];
  // Le mode Essai (8 oct. 2026) : des agences fictives et des cas de figure, sans toucher aux vraies relances.
  const [essai, setEssai] = useState(false);
  const ouvrirEssai = async () => {
    if (courante) await base44.request("POST", `${API}/lacher`, { body: { cle: courante.cle } }).catch(() => {});
    setCourante(null); setAucuneLibre(false); setEssai(true);
    rafraichir();
  };
  const changerDeVille = async (v) => {
    if (v === ville && !essai) return;
    setEssai(false);
    setVille(v);
    if (courante) await base44.request("POST", `${API}/lacher`, { body: { cle: courante.cle } }).catch(() => {});
    setCourante(null); setAucuneLibre(false);
    const n = await prochaineLibre(null, v);
    if (n) setCourante(n); else setAucuneLibre(true);
  };

  // Les lignes cochées : supprimées, ou renvoyées en prospection.
  const enMasse = useMutation({
    mutationFn: ({ quoi }) => base44.request("POST", `${API}/${quoi === "retirer" ? "retirer" : "prospection"}`, { body: { cles: [...coches] } }),
    onSuccess: (r, { quoi }) => {
      if (quoi === "retirer") toast.success(`${pl(r.retirees, "relance supprimée", "relances supprimées")}`);
      else toast.success(`${pl(r.renvoyees, "agence renvoyée", "agences renvoyées")} en prospection${r.sans_agence ? ` · ${r.sans_agence} sans fiche d'agence, restée${r.sans_agence > 1 ? "s" : ""} ici` : ""}`);
      setCoches(new Set()); rafraichir();
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const prendreLaSuivante = async () => {
    const n = await prochaineLibre(avis?.apres);
    setAvis(null);
    if (n) setCourante(n); else toast.success("Plus de relance libre pour l'instant");
  };

  if (q.isError && /403|réservé/i.test(q.error?.message || "")) return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée à l'équipe.</p>;
  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-8 md:px-6 max-md:py-6">
      <header className="mb-8 flex flex-col items-center gap-6 text-center max-md:mb-6">
        <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre max-md:text-[26px]">Relances</h1>
        {/* Les onglets en pilule, comme ceux de la Prospection. */}
        <nav className="inline-flex max-w-full gap-1 self-center overflow-x-auto rounded-full border border-trait bg-surface-pleine/60 p-[5px] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Parties des relances">
          {PARTIES.map(([k, mot]) => (
            <button key={k} type="button" onClick={() => choisirPartie(k)} aria-pressed={partie === k}
              className={`inline-flex h-9 flex-none items-center gap-2 rounded-full border-0 px-4 text-[14px] transition-colors ${partie === k ? "bg-encre text-fond" : "text-craie hover:text-encre"}`}
              style={partie === k ? undefined : { background: "transparent" }}>
              {mot}{k === "liste" && data?.total > 0 && <span className={`text-[12px] tabular-nums ${partie === k ? "opacity-70" : "text-brume"}`}>{data.total}</span>}
            </button>
          ))}
        </nav>
      </header>

      {(partie === "appel" || partie === "liste") && data && (ongletsVilles.length > 1 || partie === "appel") && (
        // Le classeur de la Prospection : les intercalaires des villes, l'ouvert raccordé au panneau.
        <div role="tablist" aria-label="Les villes" className="flex items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span aria-hidden className="w-3 flex-none" />
          {ongletsVilles.map(([v, mot, n], i) => {
            const actif = ville === v && !(partie === "appel" && essai);
            return (
              <React.Fragment key={v || "toutes"}>
                {i > 0 && <span aria-hidden className="w-1 flex-none" />}
                <button type="button" role="tab" aria-selected={actif} onClick={() => (partie === "appel" ? changerDeVille(v) : setVille(v))}
                  className={`flex max-w-[240px] flex-none items-center gap-2 rounded-t-[10px] px-4 text-left text-[13px] transition-colors ${actif ? "bg-rail pb-[11px] pt-2.5 text-encre" : "bg-surface py-2 text-ardoise hover:bg-rail hover:text-encre"}`}>
                  <span className="truncate">{mot}</span>
                  <span className={`flex-none text-[11.5px] tabular-nums ${actif ? "text-menthe" : "text-brume"}`}>{n}</span>
                </button>
              </React.Fragment>
            );
          })}
          {/* L'essai, en pointillé au bout, comme dans la Prospection. */}
          {partie === "appel" && (
            <>
              <span aria-hidden className="w-1 flex-none" />
              <button type="button" role="tab" aria-selected={essai} onClick={ouvrirEssai}
                className={`flex flex-none items-center gap-2 rounded-t-[10px] border border-b-0 border-dashed border-bord-vif px-4 text-[13px] transition-colors ${essai ? "bg-rail pb-[11px] pt-2.5 text-encre" : "py-2 text-ardoise hover:bg-rail hover:text-encre"}`}
                style={essai ? undefined : { background: "transparent" }}>
                Essai
              </button>
            </>
          )}
        </div>
      )}
      {partie === "appel" && essai ? (
        <ModeAppel essaiSeul />
      ) : partie === "appel" && courante ? (
        <ModeAppel relances relance={courante} onSuivante={suivante} onRetour={retour} />
      ) : (
        <div key={partie} className="flex flex-col gap-6 pb-16 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-1">
          {q.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>}
          {q.isError && !/403|réservé/i.test(q.error?.message || "") && <p className="py-12 text-center text-[14px] text-alerte">Les relances n'ont pas pu être lues : {q.error?.message || "erreur"}.</p>}
          {data && partie === "bord" && <TableauDeBordRelances data={data} />}

          {data && partie === "appel" && !courante && (
            <p className="m-0 py-12 text-center text-[15px] text-craie">{aucuneLibre ? (data.total ? "Toutes les relances sont déjà ouvertes par un collègue." : `Tout est à jour. Prochaines relances demain : ${data.demain}.`) : <Loader2 className="mx-auto h-5 w-5 animate-spin text-ardoise" />}</p>
          )}

          {data && partie === "liste" && (
            <div data-zone="listes" className="k-points relative rounded-b-md rounded-t-[12px] bg-rail px-5 pb-5 pt-4 max-md:px-3">
              {avis && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-ambre/40 px-4 py-3">
                  <span className="text-[15px] text-ambre">{avis.texte}</span>
                  <span className="flex gap-2">
                    <button type="button" onClick={prendreLaSuivante} className="h-9 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol">Prendre la suivante</button>
                    <button type="button" onClick={() => setAvis(null)} className="h-9 rounded-full border border-trait px-3.5 text-[13px] text-ardoise" style={{ background: "transparent" }}>Fermer</button>
                  </span>
                </div>
              )}

              {/* Les quatre chiffres, comme la barre d'une liste de la Prospection. */}
              <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {[
                  [dansLaVille.length, `relance${dansLaVille.length > 1 ? "s" : ""} à faire${ville ? ` à ${ville}` : ""}`, "text-encre"],
                  [dansLaVille.filter((x) => x.groupe === "retard").length, "en retard", "text-ambre"],
                  [dansLaVille.filter((x) => ["bien_retenu", "bien_refuse"].includes(x.motif.cle)).length, "biens à annoncer", "text-menthe"],
                  [dansLaVille.filter((x) => x.motif.cle === "retenter").length, "à retenter", "text-encre"],
                ].map(([n, mot, ton]) => (
                  <div key={mot} className="rounded-[16px] border border-trait bg-surface px-4 py-3">
                    <p className={`m-0 text-[24px] leading-none tabular-nums ${n ? ton : "text-encre"}`}>{n}</p>
                    <p className="m-0 mt-1.5 text-[12.5px] text-ardoise">{mot}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-[240px] max-w-[420px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 focus-within:border-bord-doux max-md:min-w-0 max-md:max-w-none max-md:basis-full">
                  <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
                  <input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Agent, agence, numéro"
                    className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
                </div>
                {/* Les motifs, en pilule comme les filtres d'une liste de la Prospection. */}
                <div className="flex gap-1 rounded-full bg-rail-actif p-1 max-md:max-w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
                  {[[null, "Tous", dansLaVille.length], ...data.motifs.filter((m) => m.n > 0).map((m) => [m.cle, m.libelle, dansLaVille.filter((x) => x.motif.cle === m.cle).length])].map(([k, mot, n]) => (
                    <button key={k || "tous"} type="button" onClick={() => setMotif(k)} aria-pressed={motif === k}
                      className={`rounded-full px-3 py-1 text-[12.5px] max-md:flex-none max-md:whitespace-nowrap max-md:py-1.5 ${motif === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`}
                      style={motif === k ? undefined : { background: "transparent" }}>{mot}{k && <span className="ml-1.5 tabular-nums text-brume">{n}</span>}</button>
                  ))}
                </div>
                <span className="ml-auto text-[13px] text-ardoise max-md:ml-0">{pl(lignes.length, "relance")}{data.demain ? ` · ${data.demain} demain` : ""}</span>
              </div>

              {coches.size > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-trait bg-surface-pleine px-4 py-2.5">
                  <span className="text-[13.5px] text-encre">{pl(coches.size, "relance cochée", "relances cochées")}</span>
                  <button type="button" disabled={enMasse.isPending} onClick={() => enMasse.mutate({ quoi: "prospection" })}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
                    {enMasse.isPending && enMasse.variables?.quoi === "prospection" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}Renvoyer en prospection
                  </button>
                  <button type="button" disabled={enMasse.isPending} onClick={() => enMasse.mutate({ quoi: "retirer" })}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13px] text-alerte hover:border-alerte disabled:opacity-50" style={{ background: "transparent" }}>
                    {enMasse.isPending && enMasse.variables?.quoi === "retirer" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Supprimer
                  </button>
                  <button type="button" onClick={() => setCoches(new Set())} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Tout décocher</button>
                </div>
              )}

              {lignes.length ? <ListeRelances lignes={lignes} prises={prises} moi={moi} onOuvrir={(x) => ouvrir.mutate(x)} ouverture={ouverture} coches={coches} setCoches={setCoches} />
                : data.total ? <p className="m-0 py-10 text-center text-[14px] text-brume">Aucune relance avec ces filtres.</p>
                  : <p className="m-0 py-12 text-center text-[15px] text-craie">Tout est à jour. Prochaines relances demain : {data.demain}.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
