import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Search, Sparkles, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { ChoixMetiers, GrilleCriteres } from "@/components/mandataire/ProspecterDataB";

// L'onglet K Prospective du mandataire : le formulaire de Data Prospective.
// On remplit les champs (ville, rue facultative, métiers, critères), et la
// prospective se lance chez Data-B, comme depuis le chat. Les résultats
// s'ouvrent sur la même page que ceux du chat (ResultatsProspective).
//
// La ville se choisit dans la liste de Data-B, jamais dans un annuaire
// d'adresses : « Anibes » propose Antibes (correction par la BAN, communes
// seulement, côté serveur), pas la rue d'Antibes de Cannes.

const API = "/api/mandataire";
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Attendre que la frappe se pose avant d'interroger Data-B. */
function useApaise(valeur, ms = 300) {
  const [v, setV] = useState(valeur);
  useEffect(() => {
    const t = setTimeout(() => setV(valeur), ms);
    return () => clearTimeout(t);
  }, [valeur, ms]);
  return v;
}

/**
 * Un champ qui se choisit dans une liste : la ville, puis la rue. Choisi, il
 * devient une pastille qu'une croix efface.
 */
function ChampListe({ etiquette, placeholder, choisi, onChoisir, chercher, cle, actif = true, aide = null }) {
  const [q, setQ] = useState("");
  const terme = useApaise(q.trim());
  const { data, isFetching } = useQuery({
    queryKey: [...cle, terme],
    queryFn: () => chercher(terme),
    enabled: actif && !choisi && terme.length >= 2,
  });
  const options = data || [];
  const corrige = options[0]?.corrige_de;

  return (
    <div className="relative">
      <span className="mb-1.5 block text-[11px] uppercase tracking-[.16em] text-brume">{etiquette}</span>
      {choisi ? (
        <span className="inline-flex h-11 items-center gap-2 rounded-full bg-menthe/[0.14] pl-4 pr-2 text-[14px] text-encre">
          <MapPin className="h-3.5 w-3.5 text-menthe" /> {choisi.nom}
          <button type="button" onClick={() => { onChoisir(null); setQ(""); }} aria-label={`Effacer ${etiquette.toLowerCase()}`} title="Effacer"
            className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : (
        <>
          <label className={`flex h-11 items-center gap-2.5 rounded-full border border-trait bg-surface px-4 focus-within:border-menthe ${actif ? "" : "opacity-50"}`}>
            <Search className="h-4 w-4 flex-none text-ardoise" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} disabled={!actif}
              className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
            {isFetching && <Loader2 className="h-4 w-4 flex-none animate-spin text-brume" />}
          </label>
          {aide && <p className="m-0 mt-1.5 text-[12.5px] text-brume">{aide}</p>}
          {terme.length >= 2 && !isFetching && data && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[14px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
              {corrige && <p className="m-0 border-b border-trait px-4 py-2 text-[12.5px] text-ardoise">Aucun résultat pour « {corrige} » : voici les noms les plus proches.</p>}
              {options.slice(0, 6).map((o) => (
                <button key={o.valeur} type="button" onClick={() => { onChoisir(o); setQ(""); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13.5px] text-encre hover:bg-encre/[0.06]" style={{ background: "transparent" }}>
                  <MapPin className="h-3.5 w-3.5 flex-none text-ardoise" />
                  {o.nom}
                  {/* Une ville porte ses codes postaux en fin de valeur : ils départagent les homonymes. */}
                  {o.valeur.split("|")[3] === "ville" && o.valeur.split("|")[6] && <span className="text-[12.5px] text-ardoise">{o.valeur.split("|")[6].split("-")[0]}</span>}
                </button>
              ))}
              {!options.length && <p className="m-0 px-4 py-3 text-[13px] text-brume">Data-B ne connaît rien sous ce nom.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function KProspectiveDataB({ onOuvrir }) {
  const queryClient = useQueryClient();
  const { data: ref } = useQuery({ queryKey: ["m-prospective-ref"], queryFn: () => base44.request("GET", `${API}/prospective/metiers`), staleTime: Infinity });
  const { data: faites, isLoading: chargeFaites } = useQuery({ queryKey: ["m-prospectives"], queryFn: () => base44.request("GET", `${API}/prospective`) });
  const [ville, setVille] = useState(null);
  const [rue, setRue] = useState(null);
  const [metiers, setMetiers] = useState([]);
  const [filtres, setFiltres] = useState({});

  const tous = ref?.metiers || {};
  const libelleMetier = (id) => Object.keys(tous).find((k) => tous[k] === id) || id;
  const basculerMetier = (id) => setMetiers((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const basculer = (cle, valeur) => setFiltres((f) => {
    const l = new Set(f[cle] || []);
    if (l.has(valeur)) l.delete(valeur); else l.add(valeur);
    return { ...f, [cle]: [...l] };
  });
  const nbCriteres = Object.values(filtres).reduce((n, l) => n + l.length, 0);

  const lancer = useMutation({
    mutationFn: () => base44.request("POST", `${API}/prospective/lancer`, {
      body: {
        nom: [ville.nom, rue?.nom, metiers.length ? metiers.map(libelleMetier).slice(0, 2).join(", ") : null].filter(Boolean).join(" · "),
        ville, rue, metiers, filtres,
      },
    }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["m-prospectives"] });
      onOuvrir?.(r.jeton);
    },
    onError: (e) => toast.error(e?.message || "Lancement impossible"),
  });

  const chercherVilles = (q) => base44.request("GET", `${API}/prospective/villes?q=${encodeURIComponent(q)}`).then((r) => r.villes || []);
  const chercherRues = (q) => base44.request("GET", `${API}/prospective/rues?ville=${encodeURIComponent(ville?.valeur || "")}&q=${encodeURIComponent(q)}`).then((r) => r.rues || []);
  const prospectives = faites?.prospectives || [];

  return (
    <div className="mx-auto max-w-[1100px] pt-8">
      <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>Quels commerces cherchez-vous ?</h1>
      <p className="m-0 mt-2 text-[13.5px] text-ardoise">Remplissez les champs : la prospective se lance dans Data-B, dans votre secteur.</p>

      <div className="mt-7 grid gap-5 md:grid-cols-2">
        <ChampListe etiquette="Ville" placeholder="Antibes, Cannes…" choisi={ville}
          onChoisir={(v) => { setVille(v); setRue(null); }} chercher={chercherVilles} cle={["m-prospective-villes"]} />
        <ChampListe etiquette="Rue (facultatif)" placeholder="Rue d'Antibes, boulevard Carnot…" choisi={rue} onChoisir={setRue}
          chercher={chercherRues} cle={["m-prospective-rues", ville?.valeur]} actif={!!ville}
          aide={ville ? "Vide : toute la ville." : "Choisissez d'abord la ville."} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="flex flex-col">
          <ChoixMetiers tous={tous} metiers={metiers} onBasculer={basculerMetier} />
        </section>
        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="m-0 text-[15px] font-medium text-encre">Critères</h3>
            <button type="button" onClick={() => setFiltres(ref?.suggestion || {})} disabled={!ref?.suggestion}
              title="Indépendants, rues commerçantes et mieux, solvables, avec téléphone"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
              <Sparkles className="h-4 w-4" /> Suggestion intelligente
            </button>
          </div>
          <GrilleCriteres valeurs={ref?.filtres} filtres={filtres} onBasculer={basculer} />
        </section>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-trait pt-5">
        <button type="button" onClick={() => lancer.mutate()} disabled={!ville || lancer.isPending}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          {lancer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Lancer la prospective
        </button>
        <span className="text-[13px] text-ardoise">
          {ville ? `${ville.nom}${rue ? ` · ${rue.nom}` : " · toute la ville"}` : "Aucune ville choisie"}
          {" · "}{metiers.length ? `${metiers.length} métier${metiers.length > 1 ? "s" : ""}` : "tous les commerces"}
          {" · "}{nbCriteres ? `${nbCriteres} critère${nbCriteres > 1 ? "s" : ""}` : "aucun critère"}
        </span>
        {(metiers.length > 0 || nbCriteres > 0) && (
          <button type="button" onClick={() => { setMetiers([]); setFiltres({}); }} className="text-[13px] text-brume underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>
            Tout effacer
          </button>
        )}
      </div>

      <h2 className="mb-3 mt-12 text-[20px] font-normal text-encre">Prospectives réalisées</h2>
      {chargeFaites ? (
        <p className="m-0 text-[13.5px] text-brume">Chargement…</p>
      ) : !prospectives.length ? (
        <p className="m-0 text-[13.5px] text-brume">Aucune pour l'instant : remplissez les champs plus haut et lancez.</p>
      ) : (
        <div className="border-y border-trait">
          {prospectives.map((p, i) => (
            <button key={p.jeton} type="button" onClick={() => onOuvrir?.(p.jeton)}
              className={`flex w-full items-baseline justify-between gap-4 px-2 py-4 text-left hover:bg-encre/[0.03] ${i ? "border-t border-trait" : ""}`} style={{ background: "transparent" }}>
              <span className="min-w-0">
                <span className="block truncate text-[16px] text-encre">{p.nom}</span>
                <span className="block text-[13.5px] text-ardoise">
                  {[p.criteres?.ville?.nom, p.criteres?.rue?.nom || "toute la ville", p.criteres?.metiers?.length ? `${p.criteres.metiers.length} métier${p.criteres.metiers.length > 1 ? "s" : ""}` : "tous les commerces"].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="flex-none text-[12.5px] tabular-nums text-ardoise">{quand(p.cree_le)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
