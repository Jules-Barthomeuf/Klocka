import React, { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// L'outil Rue (11 nov. 2026, Jules) : un commerce peut-il vivre ici, celui-là ou le suivant ? Trois parties : le local
// et sa rotation, le passage noté sur 10 avec son pourquoi (l'analyste peut poser la sienne), la rue cellule par
// cellule avec la position du local. Les photos Street View sont celles que le modèle a lues. Le calcul vit dans
// server/outils/rue.js ; ce détail s'affiche à droite de l'outil Emplacement (outils/ResultatsOutils.jsx).

const POINT = { ok: "bg-menthe", a_voir: "bg-menthe/55", alerte: "bg-alerte", vide: "bg-brume" };
const MOT = { ok: "OK", a_voir: "À voir", alerte: "Alerte", vide: "Pas de donnée" };
const dec = (n) => (n == null ? "—" : String(n).replace(".", ","));
const annee = (d) => (d ? String(d).slice(0, 4) : "?");
const jour = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : null);

export function Pastille({ statut, mot }) {
  return (
    <span className="inline-flex flex-none items-center gap-1.5 text-[12.5px] text-ardoise">
      <span className={`h-2 w-2 rounded-full ${POINT[statut] || POINT.vide}`} aria-hidden="true" />{mot || MOT[statut] || MOT.vide}
    </span>
  );
}

function Titre({ children, droite }) {
  return <div className="flex items-baseline justify-between gap-3 border-b border-trait pb-2"><h3 className="m-0 text-[15px] font-normal text-encre">{children}</h3>{droite}</div>;
}

/** Le passage : la note du calcul, celle de l'analyste si elle existe, le pourquoi, les deux photos. */
function Passage({ passage, streetView, noteAnalyste, onNote }) {
  const [ouvert, setOuvert] = useState(false);
  const [note, setNote] = useState(noteAnalyste?.note ?? "");
  const [commentaire, setCommentaire] = useState(noteAnalyste?.commentaire || "");
  useEffect(() => { setNote(noteAnalyste?.note ?? ""); setCommentaire(noteAnalyste?.commentaire || ""); }, [noteAnalyste]);
  const retenue = noteAnalyste?.note ?? passage?.note ?? null;
  const statut = retenue == null ? "vide" : retenue >= 7 ? "ok" : retenue >= 4.5 ? "a_voir" : "alerte";
  const explication = noteAnalyste?.note != null ? `Note de ${(noteAnalyste.par || "l'analyste").split("@")[0]}${passage?.note != null ? ` · le calcul disait ${dec(passage.note)}` : ""}` : passage ? `Calcul Klocka, confiance ${passage.confiance}${passage.manque?.length ? ` (sans ${passage.manque.map((m) => ({ troncon: "le tronçon", enseignes: "les enseignes", transports: "les transports", voie: "le type de voie", vues: "les photos" })[m] || m).join(", ")})` : ""}` : "Rien n'a pu être lu.";
  return (
    <section className="flex flex-col gap-3">
      <Titre droite={<Pastille statut={statut} />}>Passage</Titre>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div><span className="text-[28px] leading-none text-encre">{dec(retenue)}</span><span className="text-[14px] text-ardoise"> / 10</span>
          <p className="m-0 mt-1 text-[12.5px] text-ardoise">{explication}</p></div>
        {onNote && (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); onNote({ note: note === "" ? null : Number(note), commentaire }); }}>
            <input type="number" step="0.5" min="0" max="10" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ma note" aria-label="Ma note de passage" className="h-8 w-24 rounded-[8px] border border-trait bg-rail px-2 text-[13.5px] text-encre outline-none focus:border-bord-vif" />
            <input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Pourquoi (vu à la visite, Street View…)" aria-label="Pourquoi" className="h-8 w-72 max-w-full rounded-[8px] border border-trait bg-rail px-2 text-[13.5px] text-encre outline-none focus:border-bord-vif" />
            <button type="submit" className="h-8 rounded-full border border-trait px-3 text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Poser ma note</button>
          </form>
        )}
      </div>
      {noteAnalyste?.commentaire && <p className="m-0 text-[13.5px] text-craie">{noteAnalyste.commentaire}</p>}
      {passage?.pourquoi?.length > 0 && (
        <ul className="m-0 list-none p-0 text-[13.5px] leading-[1.5] text-craie">
          {passage.pourquoi.map((p, i) => <li key={i} className="flex gap-2"><span className="text-brume">·</span><span>{p}</span></li>)}
        </ul>
      )}
      {streetView?.photos && (
        <div>
          <button type="button" onClick={() => setOuvert((o) => !o)} className="inline-flex items-center gap-1 text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${ouvert ? "rotate-180" : ""}`} />{ouvert ? "Cacher les photos" : `Voir les photos Street View${streetView.date ? ` (${streetView.date})` : ""}`}
          </button>
          {ouvert && (
            <div className="mt-2 grid grid-cols-2 gap-3 max-md:grid-cols-1">
              <figure className="m-0"><img src={streetView.photos.local} alt="Vers le local" className="w-full rounded-[10px] border border-trait" /><figcaption className="mt-1 text-[12px] text-ardoise">Vers le local{streetView.lecture?.enseigne_lue ? ` · enseigne lue : ${streetView.lecture.enseigne_lue}` : ""}{streetView.lecture?.local_occupe === false ? " · paraît vide" : ""}</figcaption></figure>
              <figure className="m-0"><img src={streetView.photos.rue} alt="Le long de la rue" className="w-full rounded-[10px] border border-trait" /><figcaption className="mt-1 text-[12px] text-ardoise">Le long de la rue{streetView.lecture?.pietons != null ? ` · ${streetView.lecture.pietons} piéton${streetView.lecture.pietons > 1 ? "s" : ""} visibles` : ""}{streetView.lecture?.trottoir ? ` · trottoir ${streetView.lecture.trottoir}` : ""}</figcaption></figure>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Le passage avec la note de l'analyste qui s'enregistre (`id` : l'analyse de la rue). */
function PassageAvecNote({ x, id = null, onNote = null }) {
  const [noteAnalyste, setNoteAnalyste] = useState(x?.note_analyste || null);
  useEffect(() => { setNoteAnalyste(x?.note_analyste || null); }, [x]);
  const noter = useMutation({
    mutationFn: ({ note, commentaire }) => base44.request("POST", `/api/outils/rue/${id}/passage`, { body: { note, commentaire } }),
    onSuccess: (r) => { setNoteAnalyste(r.note_analyste); onNote?.(r.note_analyste); toast.success("Note gardée"); },
    onError: (e) => toast.error(e?.message || "La note n'a pas été gardée"),
  });
  if (!x) return null;
  return <Passage passage={x.passage} streetView={x.street_view} noteAnalyste={noteAnalyste} onNote={id ? (v) => noter.mutate(v) : null} />;
}

/** Le local : ce qui y est, et qui s'y est succédé. */
function LocalRue({ local }) {
  const r = local.rotation;
  return (
    <section className="flex flex-col gap-3">
      <Titre droite={<Pastille statut={r.statut} />}>Le local</Titre>
      <p className="m-0 text-[14px] leading-[1.45] text-encre">{r.verdict}{r.duree_moyenne_ans != null && r.exploitants_10_ans > 0 ? ` · ${dec(r.duree_moyenne_ans)} an${r.duree_moyenne_ans > 1 ? "s" : ""} en moyenne par exploitant` : ""}{local.angle ? " · local d'angle" : ""}</p>
      {local.etat === "vacant" && local.dernier && <p className="m-0 text-[13.5px] text-alerte">Vide au registre depuis le {jour(local.dernier.ferme_le)} ({local.dernier.nom}).</p>}
      {local.etat === "inconnu" && <p className="m-0 text-[13.5px] text-brume">Aucun commerce à vitrine connu à ce numéro au registre. L'adresse est peut-être écrite autrement (numéro voisin, bis).</p>}
      {local.historique?.length > 0 && (
        <ol className="m-0 list-none p-0 text-[13.5px] leading-[1.5]">
          {[...local.historique].reverse().map((h, i) => (
            <li key={i} className="flex gap-3 border-t border-trait py-1.5 first:border-t-0">
              <span className="w-40 flex-none tabular-nums text-ardoise">{annee(h.ouvert)} → {h.ferme ? annee(h.ferme) : "aujourd'hui"}</span>
              <span className={`min-w-0 ${h.ferme ? "text-ardoise" : "text-encre"}`}>{h.nom}{h.ei ? " (entrepreneur individuel)" : ""}</span>
              <span className="ml-auto flex-none text-[12px] text-brume">{h.naf}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** La rue : ses chiffres, puis chaque cellule numéro par numéro. */
function RueEntiere({ rue, position, cleLocal }) {
  const [tout, setTout] = useState(false);
  const cellules = tout ? rue.cellules : rue.cellules.slice(0, 24);
  const vac = rue.vacance_registre_pct;
  return (
    <section className="flex flex-col gap-3">
      <Titre droite={<Pastille statut={!rue.fiable ? "vide" : vac < 10 ? "ok" : vac < 20 ? "a_voir" : "alerte"} mot={!rue.fiable ? "Peu de cellules" : undefined} />}>La rue</Titre>
      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
        {[["Cellules", rue.cellules_total ?? rue.cellules.length], ["Vides au registre", vac != null ? `${vac} %` : "—"], ["Enseignes nationales", rue.part_enseignes_pct != null ? `${rue.part_enseignes_pct} %` : "—"], ["Rotation moyenne", rue.rotation_moyenne != null ? `${dec(rue.rotation_moyenne)} / cellule` : "—"]].map(([k, v]) => (
          <div key={k} className="rounded-[10px] border border-trait bg-rail px-3 py-2"><p className="m-0 text-[12px] text-ardoise">{k}</p><p className="m-0 text-[17px] text-encre">{v}</p></div>
        ))}
      </div>
      {rue.noms_enseignes?.length > 0 && <p className="m-0 text-[13px] text-craie">{rue.noms_enseignes.join(" · ")}</p>}
      {position?.place && <p className="m-0 text-[13.5px] text-encre">Le local est {position.place.mot}{position.troncon ? ` (du ${position.troncon.du} au ${position.troncon.au} : ${position.troncon.occupes} ouverts, ${position.troncon.vacants} vides)` : ""}{position.enseigne_proche ? ` · ${position.enseigne_proche.nom} à ${position.enseigne_proche.distance_m} m` : ""}.</p>}
      <ul className="m-0 grid list-none grid-cols-2 gap-x-6 p-0 text-[13px] leading-[1.5] max-md:grid-cols-1">
        {cellules.map((c) => (
          <li key={c.cle} className={`flex items-center gap-2 border-t border-trait py-1 ${c.cle === cleLocal ? "text-menthe" : ""}`}>
            <span className={`h-1.5 w-1.5 flex-none rounded-full ${c.etat === "vacant" ? "bg-alerte" : "bg-menthe"}`} aria-hidden="true" />
            <span className="w-10 flex-none tabular-nums text-ardoise">{c.cle.split(" ").slice(0, c.cle.match(/^\d+ (BIS|TER|QUATER)/) ? 2 : 1).join(" ")}</span>
            <span className={`min-w-0 truncate ${c.etat === "vacant" ? "text-ardoise" : "text-encre"}`}>{c.etat === "vacant" ? `vide depuis ${annee(c.dernier?.ferme_le)} (${c.dernier?.nom})` : c.occupants.map((o) => o.nom).join(", ")}</span>
            {c.enseigne_nationale && <span className="flex-none rounded-full bg-menthe/15 px-1.5 text-[11px] text-menthe">enseigne</span>}
            <span className="ml-auto flex-none text-[11.5px] tabular-nums text-brume" title="Exploitants en dix ans">{c.exploitants_10_ans}</span>
          </li>
        ))}
      </ul>
      {rue.cellules.length > 24 && <button type="button" onClick={() => setTout((t) => !t)} className="self-start text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}>{tout ? "Réduire" : `Voir les ${rue.cellules.length} cellules`}</button>}
      {rue.domiciliations?.length > 0 && <p className="m-0 text-[12.5px] text-brume">Mis à part, trop d'entreprises pour un local : {rue.domiciliations.map((d) => `${d.cle.split(" ")[0]} (${d.entreprises})`).join(", ")}.</p>}
      <p className="m-0 text-[12px] text-brume">{rue.source} · dix ans d'historique · « vide » veut dire sans commerce ouvert au registre, à confirmer sur place.</p>
    </section>
  );
}

/**
 * Le détail de l'outil Rue sur un résultat déjà lu (celui d'un lancement) : le local, le passage, la rue. `id` :
 * l'analyse de la rue, pour y poser la note de l'analyste ; `onNote` est rappelé une fois la note gardée.
 */
export function RueDetail({ x, id = null, onNote = null }) {
  if (!x) return null;
  return (
    <div className="flex flex-col gap-7">
      {x.adresse?.rue_differente && <p className="m-0 text-[13.5px] text-alerte">Adresse à vérifier : la rue écrite (« {x.adresse.ecrite} ») n'est pas celle que la Base Adresse Nationale a reconnue ({x.adresse.label}).</p>}
      <LocalRue local={x.local} />
      <PassageAvecNote x={x} id={id} onNote={onNote} />
      <RueEntiere rue={x.rue} position={x.position} cleLocal={x.local.cle} />
      {x.manques?.length > 0 && <p className="m-0 text-[12.5px] text-brume">Pas lu cette fois : {x.manques.join(" · ")}.</p>}
    </div>
  );
}
