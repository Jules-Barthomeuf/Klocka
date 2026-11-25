import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, Paperclip, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { Recherche } from "@/components/mandataire/elements";

// La sauvegarde de Monday (25 nov. 2026, Jules : « un export de chaque page, une sauvegarde dans la plateforme, pour
// toujours avoir la dernière version de Monday et le couper une fois pour toutes »). La liste des tableaux gardés, espace
// par espace ; un tableau s'ouvre en lignes (chaque fiche se déplie : ses colonnes, ses fichiers, son fil) et se
// télécharge en CSV. « Refaire la sauvegarde » relit Monday tant qu'il répond (server/crm/sauvegarde-monday.js).

const API = "/api/crm/sauvegarde-monday";
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—");
const heure = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const pluriel = (n, mot) => `${(n || 0).toLocaleString("fr-FR")} ${mot}${n > 1 ? "s" : ""}`;
const lienFichier = (f) => `${API}/fichiers/${encodeURIComponent(f.chemin)}`;

function Fichiers({ fichiers }) {
  if (!fichiers?.length) return null;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {fichiers.map((f) => (
        <a key={f.id} href={lienFichier(f)} className="inline-flex max-w-full items-center gap-1 text-[13px] text-menthe hover:underline">
          <Paperclip className="h-3.5 w-3.5 flex-none" /><span className="truncate">{f.nom}</span>
        </a>
      ))}
    </span>
  );
}

function Fiche({ e, colonnes, fil }) {
  const remplies = colonnes.filter((c) => e.valeurs?.[c.id]);
  return (
    <div className="grid gap-5 px-4 pb-4 pt-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <dl className="m-0 grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
        {remplies.map((c) => (
          <React.Fragment key={c.id}>
            <dt className="text-ardoise">{c.titre}</dt>
            <dd className="m-0 min-w-0 whitespace-pre-wrap break-words text-encre">{e.valeurs[c.id]}</dd>
          </React.Fragment>
        ))}
        <dt className="text-ardoise">Créée</dt>
        <dd className="m-0 text-encre">{jour(e.cree_le)}{e.par ? ` par ${e.par}` : ""}</dd>
        {!!e.fichiers?.length && (<><dt className="text-ardoise">Fichiers</dt><dd className="m-0 min-w-0"><Fichiers fichiers={e.fichiers} /></dd></>)}
      </dl>
      <div className="min-w-0">
        <p className="m-0 mb-2 text-[12.5px] text-ardoise">Fil · {fil.length}</p>
        {fil.length ? (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {fil.map((u, i) => (
              <li key={i} className="border-l-2 border-trait pl-3">
                <p className="m-0 text-[12px] text-ardoise">{u.par || "?"} · {heure(u.le)}</p>
                <p className="m-0 whitespace-pre-wrap break-words text-[13px] leading-[1.5] text-encre">{u.texte}</p>
                <Fichiers fichiers={u.fichiers} />
                {(u.reponses || []).map((r, j) => (
                  <p key={j} className="m-0 mt-1.5 whitespace-pre-wrap break-words pl-3 text-[13px] leading-[1.5] text-craie"><span className="text-ardoise">{r.par || "?"} · {heure(r.le)} : </span>{r.texte}</p>
                ))}
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-[13px] text-brume">Aucun message.</p>}
      </div>
    </div>
  );
}

function Tableau({ id, onRetour }) {
  const { data: t, isLoading, error } = useQuery({ queryKey: ["sauvegarde-monday", id], queryFn: () => base44.request("GET", `${API}/tableaux/${id}`) });
  const [cherche, setCherche] = useState("");
  const [ouverte, setOuverte] = useState(null);
  const filPar = useMemo(() => {
    const m = new Map();
    for (const u of t?.fil || []) m.set(u.element_id, [...(m.get(u.element_id) || []), u]);
    return m;
  }, [t]);
  const lignes = useMemo(() => {
    const q = cherche.trim().toLowerCase();
    const tous = t?.elements || [];
    return q ? tous.filter((e) => `${e.nom} ${e.groupe || ""} ${Object.values(e.valeurs || {}).join(" ")}`.toLowerCase().includes(q)) : tous;
  }, [t, cherche]);
  // Les trois premières colonnes remplies le plus souvent, en aperçu sur la ligne.
  const apercu = useMemo(() => (t?.colonnes || []).map((c) => [c, (t.elements || []).filter((e) => e.valeurs?.[c.id]).length]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c), [t]);

  return (
    <div>
      <button type="button" onClick={onRetour} className="inline-flex items-center gap-1.5 text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
        <ArrowLeft className="h-4 w-4" />Tous les tableaux
      </button>
      {isLoading && <div className="mt-10"><Chargement /></div>}
      {error && <p className="mt-10 text-center text-[14px] text-brume">{error.message}</p>}
      {t && (
        <>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-[12.5px] text-ardoise">{t.espace}</p>
              <h2 className="m-0 text-[22px] font-normal text-encre">{t.nom}</h2>
              <p className="m-0 mt-1 text-[13px] text-ardoise">{pluriel(t.n_elements, "fiche")} · {pluriel(t.n_fil, "message")} · {pluriel(t.n_fichiers, "fichier")} · gardé le {jour(t.exporte_le)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Recherche value={cherche} onChange={setCherche} placeholder="Chercher dans ce tableau" className="w-[260px] max-md:w-full" />
              <a href={`${API}/tableaux/${t.tableau_id}/csv`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13px] text-encre hover:border-bord-vif"><Download className="h-3.5 w-3.5" />CSV</a>
            </div>
          </div>
          <ul className="m-0 mt-5 list-none border-y border-trait p-0">
            {lignes.map((e) => {
              const fil = filPar.get(e.id) || [];
              const ici = ouverte === e.id;
              return (
                <li key={e.id} className="border-t border-trait first:border-t-0">
                  <button type="button" onClick={() => setOuverte(ici ? null : e.id)} aria-expanded={ici}
                    className={`grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors max-md:grid-cols-[minmax(0,1fr)_auto] ${ici ? "bg-relief" : "hover:bg-relief/60"}`} style={ici ? undefined : { background: "transparent" }}>
                    <span className="truncate text-[14px] text-encre">{e.nom || "(sans nom)"}</span>
                    <span className="truncate text-[12.5px] text-ardoise max-md:hidden">{e.groupe || ""}</span>
                    <span className="truncate text-[12.5px] text-craie max-md:hidden">{apercu.map((c) => e.valeurs?.[c.id]).filter(Boolean).join(" · ")}</span>
                    <span className="whitespace-nowrap text-[12px] tabular-nums text-brume">{fil.length ? pluriel(fil.length, "message") : ""}{e.fichiers?.length ? ` · ${e.fichiers.length} pj` : ""}</span>
                  </button>
                  {ici && <Fiche e={e} colonnes={t.colonnes} fil={fil} />}
                </li>
              );
            })}
            {!lignes.length && <li className="px-4 py-6 text-center text-[13.5px] text-brume">Aucune fiche ne correspond.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

export default function SauvegardeMonday() {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["sauvegarde-monday"],
    queryFn: () => base44.request("GET", API),
    refetchInterval: (q) => (q.state.data?.etat?.en_cours ? 5000 : false),
  });
  const lancer = useMutation({
    mutationFn: () => base44.request("POST", `${API}/lancer`),
    onSuccess: () => { toast.success("Sauvegarde lancée : quelques minutes, Monday limite le rythme de lecture"); queryClient.invalidateQueries({ queryKey: ["sauvegarde-monday"] }); },
    onError: (e) => toast.error(e?.message || "La sauvegarde n'a pas pu partir"),
  });
  const etat = data?.etat;
  const espaces = useMemo(() => {
    const m = new Map();
    for (const t of data?.tableaux || []) m.set(t.espace, [...(m.get(t.espace) || []), t]);
    return [...m];
  }, [data]);
  const total = (k) => (data?.tableaux || []).reduce((n, t) => n + (t[k] || 0), 0);

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden px-5 py-6 text-encre md:px-10 md:py-9">
      <div className="mx-auto max-w-[1100px]">
        {ouvert ? <Tableau id={ouvert} onRetour={() => setOuvert(null)} /> : (
          <>
            <header className="flex flex-col items-center gap-2 text-center">
              <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre max-md:text-[26px]">Sauvegarde Monday</h1>
              <p className="m-0 max-w-[64ch] text-[14px] text-ardoise">Chaque tableau de Monday, gardé dans Klocka avec ses fiches, leur fil et leurs fichiers : la dernière version, lisible même une fois Monday coupé. Le CRM, lui, est Twenty.</p>
            </header>
            {isLoading && <div className="mt-10"><Chargement /></div>}
            {error && <p className="mt-10 text-center text-[14px] text-brume">{error.message}</p>}
            {data && (
              <>
                <section className="mt-8 flex flex-wrap items-center justify-between gap-4 k-verre px-5 py-4">
                  <div className="min-w-0 text-[13.5px]">
                    {etat?.en_cours
                      ? <p className="m-0 inline-flex items-center gap-2 text-encre"><Loader2 className="h-4 w-4 animate-spin" />Sauvegarde en cours : {etat.faits || 0} tableau(x) sur {etat.tableaux || "…"}</p>
                      : <p className="m-0 text-encre">{data.tableaux.length ? `Dernière sauvegarde le ${jour(etat?.debut || data.tableaux[0]?.exporte_le)} : ${pluriel(data.tableaux.length, "tableau")}, ${pluriel(total("n_elements"), "fiche")}, ${pluriel(total("n_fil"), "message")}, ${pluriel(total("n_fichiers"), "fichier")}.` : "Aucune sauvegarde pour l'instant."}</p>}
                    {etat?.fichiers && !etat.en_cours && <p className="m-0 mt-0.5 text-ardoise">Fichiers gardés : {etat.fichiers.ok} sur {etat.fichiers.total}{etat.fichiers.n_ratees ? ` (${etat.fichiers.n_ratees} non téléchargés)` : ""}.</p>}
                    {!!etat?.erreurs?.length && <p className="m-0 mt-0.5 text-ambre">{etat.erreurs.length} tableau(x) non relu(s) : leur version précédente est gardée.</p>}
                    {etat?.erreur && <p className="m-0 mt-0.5 text-alerte">{etat.erreur}</p>}
                  </div>
                  <button type="button" onClick={() => lancer.mutate()} disabled={!data.monday_lisible || etat?.en_cours || lancer.isPending}
                    title={data.monday_lisible ? "Relire Monday et remplacer la sauvegarde" : "Monday ne peut plus être lu depuis ce serveur"}
                    className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
                    <RefreshCw className="h-4 w-4" />Refaire la sauvegarde
                  </button>
                </section>
                {espaces.map(([espace, tableaux]) => (
                  <section key={espace} className="mt-8">
                    <p className="m-0 mb-2 text-[12.5px] text-ardoise">{espace} · {tableaux.length}</p>
                    <ul className="m-0 list-none border-y border-trait p-0">
                      {tableaux.map((t) => (
                        <li key={t.tableau_id} className="flex items-center gap-3 border-t border-trait px-1 first:border-t-0">
                          <button type="button" onClick={() => setOuvert(t.tableau_id)} className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 text-left" style={{ background: "transparent" }}>
                            <span className="truncate text-[14.5px] text-encre hover:underline">{t.nom}</span>
                            <span className="whitespace-nowrap text-[12.5px] tabular-nums text-ardoise">{pluriel(t.n_elements, "fiche")}{t.n_fil ? ` · ${pluriel(t.n_fil, "message")}` : ""}{t.n_fichiers ? ` · ${pluriel(t.n_fichiers, "fichier")}` : ""}</span>
                          </button>
                          <a href={`${API}/tableaux/${t.tableau_id}/csv`} title="Télécharger en CSV" aria-label={`Télécharger ${t.nom} en CSV`} className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre"><Download className="h-4 w-4" /></a>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
