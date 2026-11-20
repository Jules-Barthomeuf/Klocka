import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Search, User, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { dateCourte, dateJournal } from "@/lib/fiche-dossier";
import { Depliant } from "@/components/haka/ReglagesDemande";
import CarteNote from "@/components/fiche-dossier/CarteNote";

// « Mes notes » (19 nov. 2026, Jules : « c'est l'entrée la plus importante, parce que c'est son réflexe actuel : je
// relis mes notes ») : à gauche d'« Historique », un clic ouvre à droite toutes ses notes, de la plus récente à la plus
// ancienne, chacune avec ses liens et son état (rangée, ou en attente de validation), et une recherche. Une note
// ouverte montre le texte tel qu'écrit et ce qui en a été rangé, fiche par fiche ; une note en attente se valide ici
// (elle n'est plus dans « Aujourd'hui »).

const TAG = { maj: "Fait", decision: "Décision", negociation: "Négociation", ressenti: "Ressenti", precision: "Précision", etape: "Étape" };
const IconeLien = ({ genre }) => (genre === "bien" ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />);

function Etat({ etat, libelle }) {
  const attente = etat === "proposee";
  return (
    <span className={`inline-flex flex-none items-center gap-1.5 text-[12px] ${attente ? "text-statut-ambre" : "text-ardoise"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${attente ? "bg-statut-ambre" : etat === "rangee" ? "bg-statut-menthe" : "bg-statut-gris"}`} />{libelle}
    </span>
  );
}

const Liens = ({ liens }) => (
  <span className="mt-1.5 flex flex-wrap gap-1.5">
    {liens.map((l) => (
      <span key={l.cle} className="inline-flex max-w-full items-center gap-1 rounded-full border border-trait px-2 py-0.5 text-[12px] text-craie">
        <IconeLien genre={l.genre} /><span className="truncate">{l.nom}</span>
      </span>
    ))}
  </span>
);

/** Une note ouverte : ce qui en a été rangé, puis le texte tel qu'écrit ; en attente, la carte pour la valider. */
function NoteOuverte({ id, onRetour }) {
  const { data: d, isLoading } = useQuery({ queryKey: ["fiche-dossier-rangement", id], queryFn: () => base44.request("GET", `/api/fiche-dossier/notes/${id}/rangement`) });
  const attente = d?.etat === "proposee";
  const { data: carte } = useQuery({ queryKey: ["fiche-dossier-note", id], queryFn: () => base44.request("GET", `/api/fiche-dossier/notes/${id}`), enabled: attente });
  const [brut, setBrut] = useState(true);
  return (
    <div className="k-entree flex min-h-0 flex-auto flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-6 pb-8 pt-4 max-md:px-4">
        <button type="button" onClick={onRetour} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise transition-colors hover:text-encre" style={{ background: "transparent" }}>
          <ArrowLeft className="h-3.5 w-3.5" />Mes notes
        </button>
        {isLoading || !d ? <p className="m-0 mt-4 text-[13.5px] text-brume">Chargement de la note…</p> : (
          <>
            <p className="m-0 mt-4 text-[17px] leading-[1.35] text-encre">{d.titre}</p>
            <p className="m-0 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ardoise">{dateJournal(d.le)}<Etat etat={d.etat} libelle={d.etat_lisible} /></p>
            {d.liens.length > 0 && <Liens liens={d.liens} />}

            {attente && carte && <div className="mt-5 border-t border-trait pt-5"><CarteNote donnees={carte} /></div>}

            {!attente && (
              <section className="mt-5 border-t border-trait pt-4">
                <p className="m-0 mb-2 text-[15px] text-encre">Ce qui a été rangé</p>
                {d.rangement.length || d.actions.length ? (
                  <div className="space-y-4">
                    {d.rangement.map((f) => (
                      <div key={f.cle}>
                        <p className="m-0 mb-1 inline-flex items-center gap-1.5 text-[13px] text-craie"><IconeLien genre={f.genre} />{f.nom}</p>
                        <ul className="m-0 list-none space-y-1.5 p-0">
                          {f.lignes.map((l, i) => (
                            <li key={i} className="text-[14px] leading-[1.5] text-encre">
                              {TAG[l.genre] && <span className="mr-1.5 text-[11px] uppercase tracking-[.14em] text-brume">{TAG[l.genre]}</span>}{l.texte}
                              {l.raison && <span className="text-ardoise"> Parce que {l.raison.charAt(0).toLowerCase()}{l.raison.slice(1)}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {d.actions.length > 0 && (
                      <div>
                        <p className="m-0 mb-1 text-[13px] text-craie">Actions</p>
                        <ul className="m-0 list-none space-y-1 p-0">
                          {d.actions.map((a) => (
                            <li key={a.id} className={`text-[14px] leading-[1.5] ${a.statut === "faite" ? "text-ardoise line-through decoration-trait" : "text-encre"}`}>
                              {a.titre}{a.echeance && <span className="text-ardoise"> · {dateCourte(a.echeance)}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : <p className="m-0 text-[13.5px] text-brume">{d.etat === "rangee" ? "La note seule, gardée sur ses fiches." : "Rien n'a été rangé."}</p>}
              </section>
            )}

            <section className="mt-5 border-t border-trait pt-4">
              <button type="button" onClick={() => setBrut((o) => !o)} aria-expanded={brut} className="text-[15px] text-encre" style={{ background: "transparent" }}>
                La note telle qu'écrite{d.conversation ? " · conversation WhatsApp importée" : ""}
              </button>
              <Depliant ouvert={brut}><p className="m-0 mt-2 whitespace-pre-line rounded-champ bg-relief px-4 py-3 text-[14px] leading-[1.6] text-craie">{d.texte}</p></Depliant>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/** @param {{ onFermer: () => void }} props */
export default function MesNotes({ onFermer }) {
  const [q, setQ] = useState("");
  const [cherche, setCherche] = useState("");
  const [ouverte, setOuverte] = useState(null);
  useEffect(() => { const t = setTimeout(() => setCherche(q.trim()), 200); return () => clearTimeout(t); }, [q]);
  const { data, isLoading } = useQuery({
    queryKey: ["fiche-dossier-mes-notes", cherche],
    queryFn: () => base44.request("GET", `/api/fiche-dossier/mes-notes${cherche ? `?q=${encodeURIComponent(cherche)}` : ""}`),
    placeholderData: (avant) => avant,
  });
  const notes = data?.notes || [];
  const attente = notes.filter((n) => n.etat === "proposee").length;

  return (
    <div className="flex min-h-0 flex-auto flex-col">
      <div className="flex flex-none items-center justify-between gap-3 border-b border-trait px-6 py-3 max-md:px-4">
        <p className="m-0 text-[15px] text-encre">Mes notes{notes.length ? <span className="text-ardoise"> · {notes.length}{attente ? `, ${attente} en attente` : ""}</span> : null}</p>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      {ouverte ? <NoteOuverte key={ouverte} id={ouverte} onRetour={() => setOuverte(null)} /> : (
        <div className="flex min-h-0 flex-auto flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] px-6 pb-8 pt-4 max-md:px-4">
            <label className="flex h-10 items-center gap-2 rounded-full border border-trait px-4 focus-within:border-bord-doux">
              <Search className="h-4 w-4 flex-none text-ardoise" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher dans mes notes, un bien, une personne" aria-label="Chercher dans mes notes"
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="Effacer" className="text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>}
            </label>
            {isLoading && !data ? <p className="m-0 mt-4 text-[13.5px] text-brume">Chargement de tes notes…</p>
              : !notes.length ? <p className="m-0 mt-4 text-[13.5px] text-brume">{cherche ? "Aucune note ne répond." : "Pas encore de note : écris-en une dans le chat et lie-la à un bien ou une personne."}</p>
                : (
                  <ul className="k-serie m-0 mt-3 list-none divide-y divide-trait p-0">
                    {notes.map((n) => (
                      <li key={n.id}>
                        <button type="button" onClick={() => setOuverte(n.id)} className="block w-full py-3 text-left transition-colors hover:bg-relief/40" style={{ background: "transparent" }}>
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 text-[14.5px] leading-[1.4] text-encre">{n.titre}</span>
                            <span className="flex-none text-[12.5px] tabular-nums text-ardoise">{dateJournal(n.le)}</span>
                          </span>
                          {n.extrait && n.extrait !== n.titre && <span className="mt-0.5 block truncate text-[13px] text-ardoise">{n.extrait}</span>}
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <Etat etat={n.etat} libelle={n.etat_lisible} />
                            {n.liens.length > 0 && <Liens liens={n.liens} />}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
          </div>
        </div>
      )}
    </div>
  );
}
