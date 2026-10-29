import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Check, ExternalLink, Loader2, Plus, X } from "lucide-react";
import MiniaturePiece from "@/components/preanalyse/MiniaturePiece";
import TexteEnPlace from "@/components/ui/texte-en-place";

// La Data Room (29 oct. 2026, Jules : « on n'a pas une dropbox, on en a plusieurs, une par type de document ;
// on met les documents, ça ne fait rien, on voit juste que c'est bien importé ») : une zone de dépôt par type,
// toute la carte se clique, et sous chaque pièce son contexte (« bail de 2005, en tacite reconduction depuis… »)
// que l'IA lira avec elle. Le « + » nomme un autre type avant d'importer : aucune pièce n'arrive sans qu'on
// sache ce qu'elle est. Ni lecture, ni classement, ni conversion. Voir lireDepots (server/deal/analyse-pieces.js).

const taille = (o) => (!o ? "" : o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`);
const arreter = (ev) => ev.stopPropagation();

export default function DepotsDossier({ dossier, apercu = false, onRefresh = null }) {
  const dealId = dossier?.deal_id;
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["depots", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/analyse-pieces/depots`),
    enabled: !!dealId && !apercu,
  });
  const [enCours, setEnCours] = useState(null);
  const [aRetirer, setARetirer] = useState(null);
  const url = (chemin) => `/api/preanalyse/dossiers/${dealId}/analyse-pieces/${chemin}`;
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["depots", dealId] }); queryClient.invalidateQueries({ queryKey: ["analyse-pieces", dealId] }); onRefresh?.(); };

  const deposer = useMutation({
    mutationFn: async ({ type, titre, fichiers, contexte }) => {
      const id = type || (await base44.request("POST", url("types"), { body: { titre } })).id;
      const form = new FormData();
      for (const f of fichiers) { form.append("fichiers", f); form.append("noms", f.name); }
      if (contexte?.trim()) form.append("contexte", contexte.trim());
      return base44.request("POST", url(`emplacements/${id}`), { body: form, isForm: true });
    },
    onMutate: ({ type }) => setEnCours(type || "nouveau"),
    onSuccess: (r, { fichiers, contexte }) => {
      toast.success(fichiers.length > 1 ? `${fichiers.length} pièces importées` : "Pièce importée");
      rafraichir();
    },
    onError: (e) => toast.error(e?.message || "Import impossible"),
    onSettled: () => setEnCours(null),
  });
  const geste = useMutation({
    mutationFn: ({ chemin, corps, methode = "POST" }) => base44.request(methode, chemin, corps ? { body: corps } : undefined),
    onSuccess: (_, { message }) => { if (message) toast.success(message); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (apercu) return <p className="m-0 py-8 text-center text-[13.5px] text-brume">Les pièces se déposent sur un vrai dossier.</p>;
  if (isLoading) return <Chargement titre="La Data Room" etats={["Les emplacements", "Les pièces importées", "Presque prêt"]} />;
  if (isError || !data) return <p className="m-0 py-8 text-center text-[13.5px] text-alerte">La Data Room ne se charge pas. Rechargez la page.</p>;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.emplacements.map((e) => (
        <Depot key={e.id} e={e} occupe={enCours === e.id}
          onDeposer={(fichiers) => fichiers.length && deposer.mutate({ type: e.id, fichiers })}
          onRetirer={setARetirer}
          onRetirerType={() => geste.mutate({ chemin: url(`types/${e.id}/retirer`), corps: {}, message: "Type retiré" })}
          onContexte={(id, contexte) => geste.mutate({ chemin: url(`documents/${id}/contexte`), corps: { contexte } })} />
      ))}
      <NouveauType occupe={enCours === "nouveau"} onImporter={(titre, contexte, fichiers) => deposer.mutateAsync({ titre, contexte, fichiers })} />
      <AlertDialog open={!!aRetirer} onOpenChange={(o) => { if (!o) setARetirer(null); }}>
        <AlertDialogContent className="border-bord-vif bg-surface-pleine sm:rounded-bloc">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-encre">Retirer « {aRetirer?.nom} » ?</AlertDialogTitle>
            <AlertDialogDescription className="text-ardoise">La pièce sort du dossier et son fichier est supprimé.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { geste.mutate({ chemin: `/api/preanalyse/dossiers/${dealId}/espace/documents/${aRetirer.id}`, methode: "DELETE", message: "Pièce retirée" }); setARetirer(null); }} className="bg-alerte text-fond hover:bg-alerte/90">Retirer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Après le dépôt, deux gestes dans l'ordre du travail (29 oct. 2026, Jules), en haut à droite du dossier, à gauche
// du « ⋯ » : ranger dans le Drive sous des noms proposés et relus (dans une fenêtre), puis lancer l'analyse.
// Voir server/deal/data-room.js.
export function ActionsDataRoom({ dossier, onRefresh = null, onAnalyse = null }) {
  const dealId = dossier?.deal_id;
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["depots", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/analyse-pieces/depots`),
    enabled: !!dealId,
  });
  const url = (chemin) => `/api/preanalyse/dossiers/${dealId}/analyse-pieces/depots/${chemin}`;
  const onFait = () => { queryClient.invalidateQueries({ queryKey: ["depots", dealId] }); queryClient.invalidateQueries({ queryKey: ["analyse-pieces", dealId] }); onRefresh?.(); };
  const [ouvert, setOuvert] = useState(false);
  const [noms, setNoms] = useState({});
  // Ajouter au Drive (29 oct. 2026, Jules) : une fois le Drive créé, seules les pièces qui n'y sont pas encore,
  // cochées d'office ; on décoche celles qu'on ne veut pas y mettre.
  const [ajout, setAjout] = useState(null);
  const [exclues, setExclues] = useState(() => new Set());
  const proposer = useMutation({
    mutationFn: ({ force = false, seulement = null } = {}) => base44.request("POST", url("noms"), { body: { force, seulement } }),
    onSuccess: (r) => {
      const n = {};
      for (const e of r.emplacements || []) for (const d of e.documents) n[d.id] = d.nom_propose || d.nom;
      setNoms(n);
      onFait();
    },
    onError: (e) => { toast.error(e?.message || "Les noms ne se proposent pas"); setOuvert(false); },
  });
  const ranger = useMutation({
    mutationFn: () => {
      const ids = ajout ? ajout.filter((id) => !exclues.has(id)) : null;
      return base44.request("POST", url("drive"), { body: { noms: ids ? Object.fromEntries(ids.map((id) => [id, noms[id]]).filter(([, n]) => n)) : noms, seulement: ids } });
    },
    onSuccess: (r) => {
      if (r.test) toast.success(`Dossier de test : ${r.renommees} pièce${r.renommees > 1 ? "s" : ""} renommée${r.renommees > 1 ? "s" : ""}, rien envoyé au Drive`);
      else if (r.erreurs?.length) toast.error(`${r.ranges} pièce${r.ranges > 1 ? "s" : ""} dans le Drive, ${r.erreurs.length} en échec : ${r.erreurs[0]}`);
      else toast.success(ajout ? `${r.ranges} pièce${r.ranges > 1 ? "s" : ""} ajoutée${r.ranges > 1 ? "s" : ""} au Drive` : "Pièces renommées et rangées dans le Drive");
      setOuvert(false);
      onFait();
    },
    // Le renommage a pu se faire même si le Drive refuse : la liste se relit.
    onError: (e) => { toast.error(e?.message || "Le Drive n'a pas répondu"); onFait(); },
  });
  const analyser = useMutation({
    mutationFn: () => base44.request("POST", url("analyser"), { body: {} }),
    onSuccess: (r) => {
      // Seules les pièces jamais lues partent à la lecture (29 oct. 2026, Jules) : les autres gardent leur analyse.
      toast.success(r.lancees ? `Lecture lancée : ${r.lancees} nouvelle${r.lancees > 1 ? "s" : ""} pièce${r.lancees > 1 ? "s" : ""}${r.deja ? `, les ${r.deja} autres gardent leur analyse` : ""}` : r.completees ? "Les informations du Bien se complètent" : "Tout est déjà lu");
      onFait();
      onAnalyse?.();
    },
    onError: (e) => toast.error(e?.message || "Lecture impossible"),
  });
  if (!data) return null;
  const pieces = data.emplacements.flatMap((e) => e.documents);
  if (!pieces.length) return null;
  const aRanger = pieces.filter((d) => !d.drive_range_le).length;
  const rangee = !!data.drive_folder_url && aRanger === 0;
  const bordee = "border border-trait text-craie hover:border-menthe hover:text-encre";

  return (
    <>
      {data.drive_folder_url && (
        <a href={data.drive_folder_url} target="_blank" rel="noopener noreferrer" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:text-encre" aria-label="Ouvrir le Drive" title="Ouvrir le Drive du dossier">
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
      <button type="button" onClick={() => {
          const nouvelles = data.drive_folder_url && aRanger ? pieces.filter((d) => !d.drive_range_le).map((d) => d.id) : null;
          setAjout(nouvelles); setExclues(new Set()); setOuvert(true);
          proposer.mutate({ seulement: nouvelles });
        }} disabled={proposer.isPending || ranger.isPending}
        title={aRanger ? `${aRanger} pièce${aRanger > 1 ? "s" : ""} pas encore dans le Drive` : "Toutes les pièces sont dans le Drive"}
        className={`inline-flex h-9 flex-none items-center gap-1.5 rounded-full px-4 text-[13px] disabled:opacity-60 ${rangee ? bordee : "border border-menthe text-encre hover:bg-menthe/[0.08]"}`} style={{ background: "transparent" }}>
        <span className="tabular-nums text-ardoise">1</span> {data.drive_folder_url && aRanger ? "Ajouter au Drive" : "Ranger dans le Drive"}
        {aRanger > 0 && data.drive_folder_url && <span className="rounded-full bg-ambre/15 px-1.5 text-[11px] tabular-nums text-ambre">{aRanger}</span>}
      </button>
      <button type="button" onClick={() => analyser.mutate()} disabled={analyser.isPending}
        className={`inline-flex h-9 flex-none items-center gap-1.5 rounded-full px-4 text-[13px] disabled:opacity-60 ${rangee ? "bg-menthe text-sur-menthe hover:bg-menthe-survol" : bordee}`} style={rangee ? undefined : { background: "transparent" }}>
        {analyser.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className={`tabular-nums ${rangee ? "" : "text-ardoise"}`}>2</span>}
        {!data.nouvelles ? "Voir l'analyse" : data.deja_lues ? `Analyser ${data.nouvelles > 1 ? `les ${data.nouvelles} nouvelles pièces` : "la nouvelle pièce"}` : "Lancer l'analyse"}
      </button>

      <Dialog open={ouvert} onOpenChange={(o) => { if (!o && !ranger.isPending) setOuvert(false); }}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-trait bg-fond text-encre">
          <DialogTitle className="text-[18px] font-normal text-encre">{ajout ? "Les nouvelles pièces pour le Drive" : "Les noms pour le Drive"}</DialogTitle>
          <DialogDescription className="text-[13px] text-ardoise">{ajout ? "Les pièces importées depuis le dernier rangement, avec un nom proposé. Décochez celles à laisser hors du Drive ; ces noms deviennent aussi ceux de Klocka." : "Proposés en lisant le début de chaque pièce. Corrigez ce qui ne va pas : ces noms deviennent aussi ceux de Klocka."}</DialogDescription>
          {proposer.isPending ? (
            <div className="py-6"><Chargement titre="Les noms se préparent" etats={["Le début de chaque pièce", "Les dates et les parties", "Les noms proposés"]} /></div>
          ) : (
            <>
              {data.emplacements.map((e) => ({ ...e, documents: e.documents.filter((d) => !ajout || ajout.includes(d.id)) })).filter((e) => e.documents.length).map((e) => (
                <div key={e.id} className="mt-2">
                  <p className="m-0 mb-1 text-[11px] uppercase tracking-[.16em] text-brume">{e.titre}</p>
                  {e.documents.map((d) => {
                    const coche = !exclues.has(d.id);
                    return (
                      <div key={d.id} className={`flex items-start gap-3 border-t border-trait py-2 first:border-t-0 ${ajout && !coche ? "opacity-50" : ""}`}>
                        {ajout && (
                          <button type="button" role="checkbox" aria-checked={coche} aria-label={`${coche ? "Décocher" : "Cocher"} ${d.nom}`}
                            onClick={() => setExclues((x) => { const n = new Set(x); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })}
                            className={`mt-2 grid h-5 w-5 flex-none place-items-center rounded-[6px] border transition-colors ${coche ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif text-transparent"}`}>
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </button>
                        )}
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <input value={noms[d.id] ?? d.nom_propose ?? d.nom} onChange={(ev) => setNoms((n) => ({ ...n, [d.id]: ev.target.value }))} aria-label={`Nom de ${d.nom}`} disabled={ajout && !coche}
                            className="h-9 w-full rounded-[10px] border border-trait bg-surface px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
                          <span className="truncate text-[12px] text-brume" title={d.nom}>Aujourd'hui : {d.nom}{d.drive_range_le ? " · déjà dans le Drive" : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => ranger.mutate()} disabled={ranger.isPending || (ajout && ajout.every((id) => exclues.has(id)))} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
                  {ranger.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {ajout ? (() => { const n = ajout.filter((id) => !exclues.has(id)).length; return `Ajouter ${n} pièce${n > 1 ? "s" : ""} au Drive`; })() : data.drive_folder_url ? "Ranger dans le Drive" : "Créer le dossier Drive"}
                </button>
                <button type="button" onClick={() => proposer.mutate({ force: true, seulement: ajout })} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Proposer à nouveau</button>
                <span className="text-[12.5px] text-brume">Un sous-dossier par famille, et le Doc « Contexte du dossier ».</span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const cadre = (survol, plein) => `flex min-h-[150px] flex-col rounded-[14px] border border-dashed p-4 text-left transition-colors ${survol ? "border-menthe bg-menthe/[0.06]" : plein ? "border-bord-doux hover:border-bord-vif" : "border-bord hover:border-bord-vif"}`;

function Depot({ e, occupe, onDeposer, onRetirer, onRetirerType, onContexte }) {
  const ref = useRef(null);
  const [survol, setSurvol] = useState(false);
  const n = e.documents.length;
  const ouvrir = () => !occupe && ref.current?.click();
  return (
    <section role="button" tabIndex={0} aria-label={`Importer : ${e.titre}`}
      onClick={ouvrir} onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); ouvrir(); } }}
      onDragOver={(ev) => { ev.preventDefault(); setSurvol(true); }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(ev) => { ev.preventDefault(); setSurvol(false); onDeposer([...ev.dataTransfer.files]); }}
      className={`cursor-pointer ${cadre(survol, n)}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 text-[15px] text-encre">{e.titre}</p>
        <span className="flex items-center gap-1">
          {/* En haut à droite (29 oct. 2026, Jules) : un check quand tout ce qu'on attend est là, sinon le nombre. */}
          {n > 0 && (!e.attendus || n >= e.attendus)
            ? <span className="grid h-6 w-6 place-items-center rounded-full bg-menthe/15 text-menthe" title={`${n} fichier${n > 1 ? "s" : ""} importé${n > 1 ? "s" : ""}`} aria-label="Tout est importé"><Check className="h-3.5 w-3.5" /></span>
            : <span className="text-[12.5px] tabular-nums text-brume">{e.attendus ? `${n} / ${e.attendus}` : ""}</span>}
          {e.perso && !n && <button type="button" onClick={(ev) => { arreter(ev); onRetirerType(); }} className="grid h-6 w-6 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }} aria-label={`Retirer le type ${e.titre}`} title="Retirer ce type"><X className="h-3 w-3" /></button>}
        </span>
      </div>
      {n > 0 && (
        <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
          {e.documents.map((d) => (
            <li key={d.id} className="group flex items-start gap-2.5 text-[13px]">
              {/* La vignette de la pièce, comme dans les tableaux de l'Analyse (29 oct. 2026, Jules). */}
              <MiniaturePiece url={d.url} largeur={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {/* Le même nom que le Drive et la colonne Source (29 oct. 2026, Jules) : le nom proposé, puis validé. */}
                  <span className="min-w-0 flex-1 truncate text-craie" title={d.nom_propose && d.nom_propose !== d.nom ? `Fichier importé : ${d.nom}` : d.nom}>{d.nom_propose || d.nom}</span>
                  <span className="flex-none text-[12px] text-brume">{taille(d.taille)}</span>
                  <button type="button" onClick={(ev) => { arreter(ev); onRetirer(d); }} className="grid h-6 w-6 flex-none place-items-center rounded-full text-ardoise opacity-0 transition-opacity hover:text-encre group-hover:opacity-100 focus:opacity-100 max-md:opacity-100" style={{ background: "transparent" }} aria-label={`Retirer ${d.nom}`} title="Retirer"><X className="h-3 w-3" /></button>
                </div>
                {/* Le contexte s'écrit directement sous la pièce (29 oct. 2026, Jules), comme les cases de l'Analyse. */}
                <TexteEnPlace valeur={d.contexte || ""} placeholder="+ Ajouter du contexte" onEnregistrer={(t) => onContexte(d.id, t)}
                  classeCase="mt-0.5" className="text-[12.5px] leading-[1.45] text-ardoise placeholder:text-brume focus:text-encre max-md:text-[16px]" />
              </div>
            </li>
          ))}
        </ul>
      )}
      <input ref={ref} type="file" multiple className="hidden" onClick={arreter} onChange={(ev) => { onDeposer([...ev.target.files]); ev.target.value = ""; }} />
      <p className="m-0 mt-auto flex items-center justify-center gap-1.5 pt-4 text-[12.5px] text-brume">
        {occupe && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {occupe ? "Import…" : n ? "Cliquez ou glissez pour en ajouter" : "Cliquez ou glissez un fichier"}
      </p>
    </section>
  );
}

// Le « + » : on nomme le type de document, on peut dire son contexte, puis on choisit le fichier.
function NouveauType({ occupe, onImporter }) {
  const ref = useRef(null);
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState("");
  const [contexte, setContexte] = useState("");
  const [survol, setSurvol] = useState(false);
  const fermer = () => { setOuvert(false); setTitre(""); setContexte(""); };
  const importer = (fichiers) => {
    if (!fichiers.length || !titre.trim()) return;
    onImporter(titre.trim(), contexte, fichiers).then(fermer).catch(() => {});
  };
  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className={`${cadre(false, false)} items-center justify-center gap-2 text-brume hover:text-encre`} style={{ background: "transparent" }}>
        <Plus className="h-5 w-5" />
        <span className="text-[13.5px]">Autre type de document</span>
      </button>
    );
  }
  return (
    <section onDragOver={(ev) => { ev.preventDefault(); if (titre.trim()) setSurvol(true); }} onDragLeave={() => setSurvol(false)}
      onDrop={(ev) => { ev.preventDefault(); setSurvol(false); importer([...ev.dataTransfer.files]); }}
      className={`${cadre(survol, false)} gap-2`}>
      <input autoFocus value={titre} onChange={(ev) => setTitre(ev.target.value)} placeholder="Type de document : ancien bail, état locatif…" aria-label="Type de document"
        onKeyDown={(ev) => { if (ev.key === "Escape") fermer(); }}
        className="h-9 w-full rounded-[10px] border border-trait bg-surface px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
      <textarea value={contexte} onChange={(ev) => setContexte(ev.target.value)} rows={3} placeholder="Contexte, facultatif : ce que l'IA doit savoir de ce document" aria-label="Contexte"
        className="w-full resize-y rounded-[10px] border border-trait bg-surface px-3 py-2 text-[13.5px] leading-[1.5] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
      <input ref={ref} type="file" multiple className="hidden" onChange={(ev) => { importer([...ev.target.files]); ev.target.value = ""; }} />
      <div className="mt-auto flex items-center gap-3">
        <button type="button" disabled={!titre.trim() || occupe} onClick={() => ref.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          {occupe && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Choisir le fichier
        </button>
        <button type="button" onClick={fermer} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
      </div>
    </section>
  );
}
