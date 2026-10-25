import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { FILTRES_VIDES, filtrer } from "@/lib/off-market-filtres";
import FicheLocal from "./FicheLocal";
import FicheProprietaire from "./FicheProprietaire";
import Recherche from "./Recherche";
import Simple from "./Simple";
import { Aujourdhui, Bilan, Courriers, Listes, Pipeline } from "./Parties";
import { Vide, pl, req, useOffMarket } from "./commun";
import Chargement from "@/components/ui/Chargement";

// Off-market (spec de Jules du 10 oct. 2026, organisation de PropStream le
// même jour) : le sourcing des murs commerciaux. La boucle tient en six
// parties : Rechercher (territoire, listes rapides, carte et liste, filtres),
// Aujourd'hui (ce qu'il y a à faire), Listes (figées et sauvegardées),
// Courriers (préparés par l'IA, relus, postés), Pipeline, Bilan. L'équipe voit
// toutes les villes lues, un mandataire celles de son secteur, avec son propre
// pipeline.

const PARTIES = [["recherche", "Rechercher"], ["aujourdhui", "Aujourd'hui"], ["listes", "Listes"], ["courriers", "Courriers"], ["pipeline", "Pipeline"], ["bilan", "Bilan"]];
const PANNEAU = "h-[900px] max-lg:fixed max-lg:inset-0 max-lg:z-[70] max-lg:h-auto max-lg:p-3";

/** @param entete  posé en tête de la barre du mode Simple (la bascule « Pour mes clients / Tous les commerces » du mandataire). */
export default function OffMarket({ espace = "klocka", entete = null }) {
  const queryClient = useQueryClient();
  // Une ville en lecture : on suit toutes les cinq secondes, les locaux arrivent au fil de l'eau.
  const base = useOffMarket(["base"], "", { refetchInterval: (q) => ((q.state.data?.territoires || []).some((v) => v.lecture?.etat === "en_cours") ? 5_000 : 60_000) });
  const territoires = base.data?.territoires || [];
  const statuts = base.data?.statuts || {};
  // On arrive toujours sur Rechercher ; les autres parties se rejoignent par les pilules.
  const [partie, setPartie] = useState("recherche");
  // ?ville= dans l'adresse (un lien de la page Modèle Zone) passe avant la dernière ville ouverte.
  const [villeId, setVilleId] = useState(() => { try { return new URLSearchParams(window.location.search).get("ville") || localStorage.getItem("off-market.ville") || null; } catch { return null; } });
  useEffect(() => { if (territoires.length && !territoires.some((v) => v.id === villeId)) setVilleId(territoires[0].id); }, [territoires.length]);
  useEffect(() => { try { if (villeId) localStorage.setItem("off-market.ville", villeId); } catch { /* navigation privée */ } }, [villeId]);
  const territoire = territoires.find((v) => v.id === villeId) || null;
  const enLecture = territoires.some((v) => v.id === villeId && v.lecture?.etat === "en_cours");
  const q = useOffMarket(["locaux", villeId], `/locaux?villes=${villeId || ""}`, { enabled: !!villeId, staleTime: enLecture ? 0 : 60_000, refetchInterval: enLecture ? 15_000 : false });
  const locaux = q.data?.locaux || [];
  const [f, setF] = useState(() => ({ ...FILTRES_VIDES }));
  const visibles = useMemo(() => filtrer(locaux, f), [locaux, f]);
  const [panneau, setPanneau] = useState(null); // { type: 'local'|'proprietaire', id|cle }
  const [menuOuvert, setMenuOuvert] = useState(false);
  // Simple ou Avancé (11 oct. 2026) : toujours Simple. La bascule, le menu des parties (Aujourd'hui, Listes,
  // Courriers, Pipeline, Bilan) et le mode Avancé sont masqués pour l'instant (11 oct., Jules : « rendre la page plus simple ») ; le code reste.
  const [mode, setMode] = useState("simple");
  const ouvrirLocal = (l) => setPanneau({ type: "local", id: l.id });
  const ouvrirProprietaire = (cle) => setPanneau({ type: "proprietaire", cle });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["off-market"] });

  const preparer = useMutation({
    mutationFn: (cles) => req("POST", "/courriers/preparer", { cles }),
    onSuccess: (r) => {
      const refus = r.refuses.length ? ` · ${r.refuses.length} refusé${r.refuses.length > 1 ? "s" : ""} : ${r.refuses.slice(0, 3).map((x) => `${x.nom} (${x.raison})`).join(", ")}${r.refuses.length > 3 ? "…" : ""}` : "";
      toast.success(`${pl(r.prepares.length, "courrier préparé", "courriers préparés")}${refus}`);
      rafraichir();
      if (r.prepares.length) setPartie("courriers");
    },
    onError: (e) => toast.error(e?.message || "Préparation impossible"),
  });
  const onCourriers = (cles) => { if (!cles.length) { toast.error("Aucun propriétaire exact dans la sélection : pas de courrier possible."); return; } preparer.mutate(cles); };
  const preanalyse = useMutation({
    mutationFn: (l) => req("POST", `/pipeline/${encodeURIComponent(l.proprietaire?.cle || `local:${l.id}`)}/dossier`, { local_id: l.id }),
    onSuccess: (r) => { toast.success(r.deal_id ? "Dossier créé : il est dans Dossiers, en pré-analyse" : r.note || "Dossier noté"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const ajouterEnListe = useMutation({
    mutationFn: ({ l }) => req("POST", "/listes", { nom: `${l.ville || "Territoire"} · ${new Date().toLocaleDateString("fr-FR")}`, locaux: [l.id] }),
    onSuccess: () => { toast.success("Mis dans une nouvelle liste (partie Listes)"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (base.isError) return <p className="p-8 text-[14px] text-ardoise">{/403|réservé/i.test(base.error?.message || "") ? "Cette page est réservée à l'équipe et aux mandataires K Partners." : base.error?.message}</p>;

  const fiche = panneau?.type === "local"
    ? <FicheLocal id={panneau.id} espace={espace} onFermer={() => setPanneau(null)} onProprietaire={ouvrirProprietaire} onListe={(l) => ajouterEnListe.mutate({ l })} onCourrier={(l) => l.proprietaire?.cle && preparer.mutate([l.proprietaire.cle])} onPreanalyse={(l) => preanalyse.mutate(l)} />
    : panneau?.type === "proprietaire"
      ? <FicheProprietaire cle={panneau.cle} statuts={statuts} onFermer={() => setPanneau(null)} onLocal={ouvrirLocal} onCourrier={(p) => preparer.mutate([p.cle])} />
      : null;
  const avecPanneau = (contenu) => (
    <div className={`grid gap-4 ${panneau ? "lg:grid-cols-[minmax(0,1fr)_420px]" : ""}`}>
      {contenu}
      {panneau && <div className={PANNEAU}>{fiche}</div>}
    </div>
  );

  const aValider = base.data?.aujourdhui?.courriers_a_valider || 0;
  // Le menu des parties : un hamburger à droite de la barre, pas d'en-tête.
  const menu = (
    <div className="relative">
      <button type="button" onClick={() => setMenuOuvert((m) => !m)} aria-expanded={menuOuvert} aria-label="Les parties d'Off-market" className="relative grid h-10 w-10 place-items-center rounded-full border border-bord-vif text-encre hover:border-menthe" style={{ background: "transparent" }}>
        <Menu className="h-5 w-5" strokeWidth={1.8} />
        {aValider > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-menthe" />}
      </button>
      {menuOuvert && (
        <nav className="absolute right-0 top-12 z-40 w-[240px] rounded-bloc border border-bord-doux bg-surface-pleine p-2 shadow-xl">
          {PARTIES.map(([k, mot]) => (
            <button key={k} type="button" onClick={() => { setPartie(k); setMenuOuvert(false); }} aria-current={partie === k} className={`flex w-full items-center justify-between gap-2 rounded-champ px-3 py-2.5 text-left text-[14px] ${partie === k ? "bg-rail text-encre" : "text-craie hover:bg-relief hover:text-encre"}`} style={partie === k ? undefined : { background: "transparent" }}>
              {mot}{k === "courriers" && aValider > 0 && <span className="text-[12px] tabular-nums text-menthe">{aValider}</span>}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
  const nomPartie = PARTIES.find(([k]) => k === partie)?.[1];
  const bascule = (
    <div className="inline-flex h-10 rounded-full border border-bord-vif p-[3px]" role="group" aria-label="Simple ou avancé">
      {[["simple", "Simple"], ["avance", "Avancé"]].map(([k, mot]) => <button key={k} type="button" onClick={() => { setMode(k); setPanneau(null); }} aria-pressed={mode === k} className={`h-full rounded-full px-4 text-[13.5px] transition-colors ${mode === k ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={mode === k ? undefined : { background: "transparent" }}>{mot}</button>)}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1700px] px-4 py-5 md:px-6">
      {partie !== "recherche" && (
        <div className="mb-4 flex items-center justify-between gap-3 md:pr-16">
          <h1 className="m-0 text-[22px] font-normal tracking-[-0.01em] text-encre">{nomPartie}</h1>
          {menu}
        </div>
      )}

      <div key={partie} className="duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-1">
        {base.isLoading && <Chargement taille="grand" />}
        {base.data && !territoires.length && ["recherche", "listes"].includes(partie) && <Vide>{espace === "klocka" ? "Aucune ville lue : lancez la lecture d'un territoire pour commencer." : "Aucune ville lue dans votre secteur pour l'instant : demandez à Klocka d'en ouvrir une."}</Vide>}

        {partie === "recherche" && territoires.length > 0 && mode === "simple" && (
          <Simple territoires={territoires} territoire={territoire} onTerritoire={(id) => { setVilleId(id); setPanneau(null); }} espace={espace} menu={null} bascule={entete} />
        )}
        {partie === "recherche" && territoires.length > 0 && mode === "avance" && (
          <Recherche territoires={territoires} territoire={territoire} onTerritoire={(id) => { setVilleId(id); setPanneau(null); }} locaux={locaux} visibles={visibles} f={f} setF={setF} chargement={q.isFetching} panneau={panneau} fiche={fiche} onOuvrirLocal={ouvrirLocal} onOuvrirProprietaire={ouvrirProprietaire} onCourriers={onCourriers} statuts={statuts} rafraichir={rafraichir} menu={menu} bascule={bascule} />
        )}
        {partie === "aujourdhui" && base.data && avecPanneau(<Aujourdhui a={base.data.aujourdhui} onProprietaire={ouvrirProprietaire} onPartie={setPartie} />)}
        {partie === "listes" && territoire && avecPanneau(<Listes territoire={territoire} filtresCourants={f} selectionCourante={visibles.map((l) => l.id)} onLocal={ouvrirLocal} onCourriers={onCourriers} />)}
        {partie === "courriers" && avecPanneau(<Courriers onProprietaire={ouvrirProprietaire} />)}
        {partie === "pipeline" && avecPanneau(<Pipeline statuts={statuts} onProprietaire={ouvrirProprietaire} />)}
        {partie === "bilan" && <Bilan statuts={statuts} espace={espace} />}
      </div>
    </div>
  );
}
