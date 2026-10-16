import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Trash2, Undo2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import ListeRelances from "@/components/prospection/ListeRelances";
import ModeAppel from "@/components/prospection/ModeAppel";

// Les relances dans « Aujourd'hui » (16 oct. 2026, Jules : Prospection et
// Relances en une seule page). La logique est celle de l'ancienne page
// Relances (spec du 8 oct. 2026) : la liste partagée par toute l'équipe, les
// motifs, cocher pour supprimer ou renvoyer en prospection, et « Pris par »
// (un clic prend la ligne, un collègue la voit grisée en moins de deux
// secondes, elle se libère au bout de 15 minutes). Un clic sur une ligne la
// prend et ouvre le Mode appel sur cet agent : FileRelances rend la ligne
// prise, ModeAppelRelances la déroule (relance suivante, retour).

const API = "/api/prospection/relances";
const pl = (n, mot, mots = `${mot}s`) => `${n} ${n > 1 ? mots : mot}`;

const lacher = (cle) => base44.request("POST", `${API}/lacher`, { body: { cle } }).catch(() => {});
const prendre = async (x) => {
  const r = await base44.request("POST", `${API}/prendre`, { body: { cle: x.cle } });
  return { cle: x.cle, agence_id: r.agence_id };
};

/** La liste des relances dues, avec ses filtres. `onOuvrir(courante)` : la ligne est prise, le Mode appel s'ouvre dessus. */
export function FileRelances({ onOuvrir }) {
  const queryClient = useQueryClient();
  const [motif, setMotif] = useState(null);
  const [cherche, setCherche] = useState("");
  const [coches, setCoches] = useState(() => new Set());
  const [ouverture, setOuverture] = useState(null);
  const [avis, setAvis] = useState(null);
  const q = useQuery({ queryKey: ["relances"], queryFn: () => base44.request("GET", API), refetchInterval: 20_000, refetchOnWindowFocus: true });
  // « Pris par » : relu toutes les secondes et demie tant que la liste est à l'écran.
  const p = useQuery({ queryKey: ["relances-prises"], queryFn: () => base44.request("GET", `${API}/prises`), refetchInterval: 1_500 });
  const data = q.data;
  // Un appel validé ailleurs (relance ou rappel entrant) : la liste se relit tout de suite chez tout le monde.
  const versionVue = useRef(null);
  useEffect(() => {
    const v = p.data?.version;
    if (v == null) return;
    if (versionVue.current != null && v !== versionVue.current) q.refetch();
    versionVue.current = v;
  }, [p.data?.version]);
  const prises = p.data?.prises || data?.prises || {};
  const moi = data?.moi || null;
  const lignes = useMemo(() => {
    const t = cherche.trim().toLowerCase();
    return (data?.lignes || []).filter((x) => (!motif || x.motif.cle === motif)
      && (!t || [x.nom, x.agence, x.telephone, x.ville].filter(Boolean).join(" ").toLowerCase().includes(t)));
  }, [data, motif, cherche]);
  const toutes = data?.lignes || [];

  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["relances"] }); queryClient.invalidateQueries({ queryKey: ["relances-prises"] }); };
  const ouvrir = useMutation({
    mutationFn: prendre,
    onMutate: (x) => { setOuverture(x.cle); setAvis(null); },
    onSuccess: (c) => onOuvrir(c),
    onError: (e, x) => { setAvis({ texte: e?.message || "Cette relance n'a pas pu s'ouvrir.", apres: x.cle }); p.refetch(); },
    onSettled: () => setOuverture(null),
  });
  const prendreLaSuivante = async () => {
    const apres = avis?.apres;
    setAvis(null);
    const [frais, fp] = await Promise.all([q.refetch(), p.refetch()]);
    const ls = frais.data?.lignes || [];
    const pr = fp.data?.prises || {};
    const i = ls.findIndex((x) => x.cle === apres);
    const candidates = (i >= 0 ? [...ls.slice(i + 1), ...ls.slice(0, i)] : ls).filter((x) => x.cle !== apres && (!pr[x.cle] || pr[x.cle].par === moi));
    for (const x of candidates.slice(0, 8)) {
      try { onOuvrir(await prendre(x)); return; } catch { /* prise entre-temps : la suivante */ }
    }
    toast.success("Plus de relance libre pour l'instant");
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

  if (q.isError && /403|réservé/i.test(q.error?.message || "")) return null;
  if (!data) return q.isError ? <p className="m-0 py-6 text-center text-[14px] text-alerte">Les relances n'ont pas pu être lues : {q.error?.message || "erreur"}.</p> : null;
  return (
    <div data-zone="listes" className="k-points relative mt-8 rounded-[14px] bg-rail px-5 pb-5 pt-4 max-md:px-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="m-0 text-[11.5px] uppercase tracking-[0.12em] text-ardoise">Relances dues</p>
        <span className="text-[13px] text-ardoise">{pl(toutes.length, "relance")}{toutes.filter((x) => x.groupe === "retard").length ? ` · ${toutes.filter((x) => x.groupe === "retard").length} en retard` : ""}{data.demain ? ` · ${data.demain} demain` : ""}</span>
      </div>
      {avis && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-ambre/40 px-4 py-3">
          <span className="text-[15px] text-ambre">{avis.texte}</span>
          <span className="flex gap-2">
            <button type="button" onClick={prendreLaSuivante} className="h-9 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol">Prendre la suivante</button>
            <button type="button" onClick={() => setAvis(null)} className="h-9 rounded-full border border-trait px-3.5 text-[13px] text-ardoise" style={{ background: "transparent" }}>Fermer</button>
          </span>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] max-w-[420px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 focus-within:border-bord-doux max-md:min-w-0 max-md:max-w-none max-md:basis-full">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Agent, agence, numéro"
            className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        <div className="flex gap-1 rounded-full bg-rail-actif p-1 max-md:max-w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
          {[[null, "Tous", toutes.length], ...data.motifs.filter((m) => m.n > 0).map((m) => [m.cle, m.libelle, toutes.filter((x) => x.motif.cle === m.cle).length])].map(([k, mot, n]) => (
            <button key={k || "tous"} type="button" onClick={() => setMotif(k)} aria-pressed={motif === k}
              className={`rounded-full px-3 py-1 text-[12.5px] max-md:flex-none max-md:whitespace-nowrap max-md:py-1.5 ${motif === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`}
              style={motif === k ? undefined : { background: "transparent" }}>{mot}{k && <span className="ml-1.5 tabular-nums text-brume">{n}</span>}</button>
          ))}
        </div>
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
        : toutes.length ? <p className="m-0 py-10 text-center text-[14px] text-brume">Aucune relance avec ces filtres.</p>
          : <p className="m-0 py-10 text-center text-[15px] text-craie">Aucune relance due. Prochaines demain : {data.demain}.</p>}
    </div>
  );
}

/** Le Mode appel : sur la relance prise si `courante`, sinon la file des villes. Une seule entrée pour les deux. */
export function ModeAppelUnique({ courante, setCourante }) {
  const queryClient = useQueryClient();
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["relances"] }); queryClient.invalidateQueries({ queryKey: ["relances-prises"] }); };
  // En quittant le Mode appel avec une ligne prise, elle se libère.
  const ref = useRef(null);
  useEffect(() => { ref.current = courante; }, [courante]);
  useEffect(() => () => { if (ref.current) { lacher(ref.current.cle); queryClient.invalidateQueries({ queryKey: ["relances"] }); } }, []);

  const suivante = async () => {
    const c = courante;
    const [frais, fp] = await Promise.all([queryClient.fetchQuery({ queryKey: ["relances"], queryFn: () => base44.request("GET", API), staleTime: 0 }), base44.request("GET", `${API}/prises`)]);
    const ls = frais?.lignes || [];
    const pr = fp?.prises || {};
    const moi = frais?.moi || null;
    const i = ls.findIndex((x) => x.cle === c?.cle);
    const candidates = (i >= 0 ? [...ls.slice(i + 1), ...ls.slice(0, i)] : ls).filter((x) => x.cle !== c?.cle && (!pr[x.cle] || pr[x.cle].par === moi));
    for (const x of candidates.slice(0, 8)) {
      try { setCourante(await prendre(x)); return; } catch { /* prise entre-temps : la suivante */ }
    }
    if (c) await lacher(c.cle);
    setCourante(null); rafraichir();
    toast.success("Plus de relance libre pour l'instant");
  };
  const retour = async ({ deja_lachee = false } = {}) => {
    if (courante && !deja_lachee) await lacher(courante.cle);
    setCourante(null); rafraichir();
  };
  if (courante) return <ModeAppel key={courante.cle} relances relance={courante} onSuivante={suivante} onRetour={retour} />;
  return <ModeAppel />;
}
