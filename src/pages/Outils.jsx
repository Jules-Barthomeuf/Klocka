import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import ResultatsOutils, { PastilleStatut } from "@/components/outils/ResultatsOutils";

// La section Outils (11 nov. 2026, Jules) : l'usage hors dossier, pour tester une adresse entendue au téléphone. Le
// formulaire lance les cinq outils, qui s'affichent dans le même composant que l'onglet Marché d'un dossier
// (outils/ResultatsOutils.jsx), rangés en trois parties : Rue (emplacement, ville), Marché (loyer, prix), Locataire.
// L'historique liste tous les lancements, des dossiers comme d'ici ; un lancement fait ici se rattache à un dossier.
// Les anciennes adresses /Outils?lat=… de K-Vacance y mènent toujours.

export const PARTIES = [
  { cle: "rue", mot: "Rue", outils: ["emplacement", "ville"] },
  { cle: "marche", mot: "Marché", outils: ["loyer", "prix"] },
  { cle: "locataire", mot: "Locataire", outils: ["locataire"] },
  // Plus de page Passage (13 nov. 2026, Jules : « pour le passage, enlève ça ») : l'équipe ne note plus des adresses pour
  // régler le calcul. JugerPassage et ses routes restent dans le code.
  { cle: "historique", mot: "Historique", outils: [] },
];
const CHAMPS = [
  ["adresse", "Adresse", "12 rue de la République, 69002 Lyon"],
  ["locataire", "Locataire", "Nom de l'enseigne ou de la société"],
  ["surface", "Surface (m²)", ""],
  ["loyer", "Loyer annuel HT HC (€)", ""],
  ["prix", "Prix FAI (€)", ""],
];
const NOMS = { locataire: "Locataire", loyer: "Loyer", prix: "Prix", emplacement: "Emplacement", ville: "Ville" };
const quand = (d) => (d ? new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/** Le choix d'un dossier pour y rattacher un lancement. */
function Rattacher({ lancement, onFait }) {
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState("");
  const dossiers = useQuery({ queryKey: ["dossiers-rattacher"], queryFn: () => base44.request("GET", "/api/preanalyse/dossiers"), enabled: ouvert, staleTime: 60000 });
  const rattacher = useMutation({
    mutationFn: () => base44.request("POST", `/api/outils/lancements/${lancement.id}/rattacher`, { body: { deal_id: choix } }),
    onSuccess: () => { toast.success("Rattaché au dossier"); setOuvert(false); onFait?.(); },
    onError: (e) => toast.error(e?.data?.error || e?.message || "Le rattachement a échoué"),
  });
  if (!ouvert) return <button type="button" onClick={() => setOuvert(true)} className="text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}>Rattacher à un dossier</button>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select value={choix} onChange={(e) => setChoix(e.target.value)} aria-label="Dossier" className="h-8 max-w-[260px] rounded-[8px] border border-trait bg-rail px-2 text-[13px] text-encre">
        <option value="">{dossiers.isLoading ? "Chargement…" : "Choisir un dossier"}</option>
        {(Array.isArray(dossiers.data) ? dossiers.data : []).map((d) => <option key={d.deal_id} value={d.deal_id}>{d.nom || d.deal_id}</option>)}
      </select>
      <button type="button" disabled={!choix || rattacher.isPending} onClick={() => rattacher.mutate()} className="h-8 rounded-full bg-menthe px-3 text-[13px] text-sur-menthe disabled:opacity-50">Rattacher</button>
      <button type="button" onClick={() => setOuvert(false)} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
    </span>
  );
}

/** L'historique de tous les lancements, les plus récents d'abord. */
function Historique() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["outils-historique"], queryFn: () => base44.request("GET", "/api/outils/lancements") });
  if (q.isLoading) return <div className="flex items-center gap-2 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>;
  const ls = q.data?.lancements || [];
  if (!ls.length) return <p className="m-0 text-[13.5px] text-ardoise">Aucun lancement pour l'instant.</p>;
  return (
    <ul className="m-0 list-none border-b border-trait p-0">
      {ls.map((l) => (
        <li key={l.id} className="grid grid-cols-[130px_110px_minmax(0,1fr)_220px] items-start gap-3 border-t border-trait py-2.5 text-[13.5px] max-lg:grid-cols-1 max-lg:gap-1">
          <span className="tabular-nums text-ardoise">{quand(l.lance_le)}</span>
          <span className="text-encre">{NOMS[l.outil] || l.outil}</span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-craie">{[l.entrees?.adresse, l.entrees?.locataire].filter(Boolean).join(" · ") || "—"}</span>
            <span className="flex items-start gap-2">{l.statut === "en_cours" ? <span className="text-ardoise">En cours…</span> : l.statut === "echec" ? <span className="text-alerte">Échec</span> : <><PastilleStatut statut={l.resultat?.statut} /><span className="min-w-0 text-ardoise">{l.resultat?.conclusion}</span></>}</span>
          </span>
          <span>{l.deal_id ? <Link to={`/Analyse?deal_id=${encodeURIComponent(l.deal_id)}`} className="text-[12.5px] text-menthe hover:underline">Ouvrir le dossier</Link> : l.statut === "fini" ? <Rattacher lancement={l} onFait={() => queryClient.invalidateQueries({ queryKey: ["outils-historique"] })} /> : null}</span>
        </li>
      ))}
    </ul>
  );
}

export default function OutilsPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(search);
  const partie = PARTIES.find((p) => p.cle === params.get("outil")) || PARTIES[0];
  const ids = params.get("r") || "";
  const [champs, setChamps] = useState({ adresse: params.get("adresse") || "" });

  const lus = useQuery({
    queryKey: ["outils-libres", ids],
    queryFn: () => base44.request("GET", `/api/outils/lancements?ids=${encodeURIComponent(ids)}`),
    enabled: !!ids,
    refetchInterval: (q) => (q.state.data?.lancements?.some((l) => l.statut === "en_cours") ? 3000 : false),
  });
  const aller = (cle, r = ids) => navigate(`/Outils?${new URLSearchParams({ outil: cle, ...(r ? { r } : {}) })}`, { replace: true });
  const lancer = useMutation({
    mutationFn: (outils) => base44.request("POST", "/api/outils/lancements", { body: { ...champs, ...(outils ? { outils } : {}) } }),
    onSuccess: (r, outils) => {
      // Relancer un outil remplace son lancement dans la vue ; les autres restent.
      const avant = (lus.data?.lancements || []).filter((l) => !outils || !outils.includes(l.outil)).map((l) => l.id);
      aller(partie.cle === "historique" ? "rue" : partie.cle, [...avant, ...r.lancements].join(","));
      queryClient.invalidateQueries({ queryKey: ["outils-historique"] });
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || "La lecture n'a pas pu partir"),
  });

  // Les anciens liens de K-Vacance : un point sans outil choisi.
  if (!params.get("outil") && params.get("lat")) return <Navigate to={`/KVacance${search}`} replace />;
  const parOutil = Object.fromEntries((lus.data?.lancements || []).map((l) => [l.outil, l]));
  const defs = Object.fromEntries((lus.data?.outils || []).map((o) => [o.cle, o]));
  const outils = partie.outils.map((k) => ({ cle: k, nom: NOMS[k], question: defs[k]?.question || "", lancement: parOutil[k] || null }));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 pb-16 pt-8 max-md:px-4">
      <h1 className="m-0 text-center text-[24px] font-normal text-encre">Outils</h1>
      <nav className="mt-5 flex justify-center gap-6 border-b border-trait" aria-label="Outils">
        {PARTIES.map((p) => (
          <button key={p.cle} type="button" onClick={() => aller(p.cle)} aria-current={partie.cle === p.cle ? "page" : undefined}
            className={`-mb-px border-b-[1.5px] pb-2 text-[14px] transition-colors ${partie.cle === p.cle ? "border-menthe text-encre" : "border-transparent text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>
            {p.mot}
          </button>
        ))}
      </nav>

      {partie.cle === "historique" ? (
        <div className="mt-6"><Historique /></div>
      ) : (
        <>
          <form className="mt-6 grid grid-cols-5 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1" onSubmit={(e) => { e.preventDefault(); lancer.mutate(null); }}>
            {CHAMPS.map(([k, mot, exemple]) => (
              <label key={k} className={`flex flex-col gap-1 ${k === "adresse" ? "col-span-2 max-md:col-span-1" : ""}`}>
                <span className="text-[12.5px] text-ardoise">{mot}</span>
                <input value={champs[k] || ""} onChange={(e) => setChamps((c) => ({ ...c, [k]: e.target.value }))} placeholder={exemple}
                  inputMode={["surface", "loyer", "prix"].includes(k) ? "decimal" : undefined}
                  className="h-10 rounded-[10px] border border-trait bg-rail px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-bord-vif" />
              </label>
            ))}
            <div className="col-span-5 flex items-center justify-between gap-3 max-lg:col-span-2 max-md:col-span-1">
              <span className="text-[12.5px] text-ardoise">Les cinq outils partent ensemble ; chacun s'affiche dès qu'il a fini. Une adresse avec son numéro.</span>
              <button type="submit" disabled={lancer.isPending || (!champs.adresse && !champs.locataire)} className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe disabled:opacity-50">
                {lancer.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lancer les outils
              </button>
            </div>
          </form>
          <div className="mt-6">
            <ResultatsOutils key={partie.cle} outils={outils} onRelancer={(cles) => lancer.mutate(cles || partie.outils)} relance={lancer.isPending}
              vide={<p className="m-0 text-[13.5px] text-ardoise">Donnez une adresse ou un locataire, puis lancez les outils. Pour un dossier, tout se lance seul dans l'onglet Marché de son Analyse.</p>} />
          </div>
        </>
      )}
    </div>
  );
}
