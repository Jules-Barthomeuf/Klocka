import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Check, ChevronDown, Sparkles, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { dateCourte, dateJournal, enRetard } from "@/lib/fiche-dossier";
import { actionVue, basculer, modifier, useNote } from "@/lib/note-en-cours";
import ActionApercu, { ICONE_ACTION } from "@/components/fiche-dossier/ActionApercu";
import { Depliant, RESSORT } from "@/components/haka/ReglagesDemande";
import CarteDossier from "@/components/fiche-dossier/CarteDossier";
import MesNotes from "@/components/fiche-dossier/MesNotes";
import { EtoileAgent } from "@/components/fiche-dossier/EtoileAgent";

// La fiche du dossier (19 nov. 2026, Jules, maquette « Murs de pharmacie ») : trois onglets soulignés, Dossier, Client,
// Agent ; le nom centré et sa ligne (« Antibes · dossier ») ; puis, sous le nom, les onglets de la fiche (19 nov. 2026,
// Jules, à la place des lignes qui se dépliaient) : Résumé (le résumé IA, plus long, et l'avancement, ouvert : ce qu'on
// voit en arrivant), Prochaine action, Identité, Historique (les décisions en tête), Personnes. Quand une note attend
// son OK, ce qu'elle ajoute se range dans son onglet, une petite lumière à gauche du nom de l'onglet ; chaque ajout se
// décoche.

const GENRE_LISIBLE = { bien: "dossier", agent: "agent", client: "client" };
const ONGLETS = [["bien", "Dossier"], ["client", "Client"], ["agent", "Agent"]];
const initiales = (n) => String(n || "?").replace(/^\(test\)\s*/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
const raisonLisible = (r) => `Parce que ${r.charAt(0).toLowerCase()}${r.slice(1)}`;
const TAG = { evenement: ["Historique", "text-ardoise"], decision: ["Décision", "text-menthe"], negociation: ["Négociation", "text-menthe"], ressenti: ["Ressenti", "text-brume"] };
const POSITION_LISIBLE = { presente: "Présenté", visio: "Visio faite", positionne: "Positionné", interesse: "Positionné", offre: "Offre", signe: "Signé", abandon: "Présenté, refusé" };

/**
 * Les onglets de la fiche, sous le nom (19 nov. 2026, Jules : « des onglets comme Dossier, Client, Agent ») : Résumé
 * (le résumé et l'avancement, ce qu'on voit en arrivant), Prochaine action, Identité, Historique, Personnes. Un onglet
 * remplace tout ce qui est dessous ; une lumière dit qu'une note en attente y ajoute quelque chose.
 */
function OngletsFiche({ onglets, actif, onChoisir }) {
  return (
    // Un peu d'air à gauche (20 nov. 2026, Jules) : la lumière de « Résumé » et son halo ne touchent plus le bord.
    <div role="tablist" aria-label="Parties de la fiche" className="mt-5 flex items-end gap-6 overflow-x-auto border-b border-trait pl-2.5 pr-1 max-md:gap-5" style={{ scrollbarWidth: "none" }}>
      {onglets.map(([id, libelle, lumiere]) => (
        <button key={id} type="button" role="tab" aria-selected={actif === id} onClick={(e) => { onChoisir(id); e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }); }}
          className={`relative flex h-11 flex-none items-center gap-2 whitespace-nowrap px-0.5 text-[14px] transition-colors ${actif === id ? "text-encre" : "text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>
          {lumiere && <span aria-label="Ajouté par l'assistant" title="Ajouté par l'assistant" className="k-lumiere h-[7px] w-[7px] rounded-full bg-menthe" />}
          {libelle}
          {actif === id && <motion.span layoutId="k-onglet-partie" transition={RESSORT} aria-hidden className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-menthe" />}
        </button>
      ))}
    </div>
  );
}

const Titre = ({ children, className = "" }) => <p className={`m-0 mb-2 text-[15px] text-encre ${className}`}>{children}</p>;

function Case({ coche, onClick, libelle, rond = false, enCours = false }) {
  return (
    <button type="button" role="checkbox" aria-checked={coche} onClick={onClick} disabled={enCours} aria-label={libelle}
      className={`mt-[2px] grid h-[18px] w-[18px] flex-none place-items-center border transition-colors ${rond ? "rounded-full" : "rounded-[6px]"} ${coche ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-doux text-transparent hover:border-menthe"}`}>
      <Check className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}

/** Un ajout de la note en attente, dans la ligne où il ira : la case pour le garder ou non. */
function Ajout({ coche, onClick, children, libelle }) {
  return (
    <li className={`flex gap-3 py-2 ${coche ? "" : "opacity-45"}`}>
      <Case coche={coche} onClick={onClick} libelle={libelle} />
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

/** Une action enregistrée : la case pour la cocher, qui et quand ; un clic ouvre son aperçu (le message, la relance). */
export function LigneAction({ a, avecFiche = false, onOuvrir = null }) {
  const queryClient = useQueryClient();
  const cocher = useMutation({
    mutationFn: () => base44.request("PATCH", `/api/fiche-dossier/actions/${a.id}`, { body: { statut: a.statut === "faite" ? "ouverte" : "faite" } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["fiche-dossier"] }); queryClient.invalidateQueries({ queryKey: ["fiche-dossier-jour"] }); },
    onError: (e) => toast.error(e?.message || "Action non modifiée."),
  });
  const retard = a.statut === "ouverte" && enRetard(a.echeance);
  const Icone = ICONE_ACTION[a.genre] || null;
  const ouvrir = onOuvrir || (() => window.dispatchEvent(new CustomEvent("klocka:panneau-note", { detail: { vue: "action", action: a } })));
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Case rond coche={a.statut === "faite"} onClick={() => cocher.mutate()} libelle={a.statut === "faite" ? `Rouvrir : ${a.titre}` : `Fait : ${a.titre}`} enCours={cocher.isPending} />
      <button type="button" onClick={ouvrir} className="min-w-0 flex-1 text-left" style={{ background: "transparent" }}>
        <span className={`flex items-center gap-2 text-[14px] leading-[1.5] ${a.statut === "faite" ? "text-ardoise line-through decoration-trait" : "text-encre"}`}>
          {Icone && <Icone className="h-3.5 w-3.5 flex-none text-menthe" />}<span className="min-w-0">{a.titre}</span>
        </span>
        <span className="mt-0.5 block text-[12.5px] text-ardoise">
          {[a.qui === "assistant" ? "Préparé par l'assistant" : a.responsable_prenom,
            a.echeance ? (retard ? `en retard, prévu ${dateCourte(a.echeance)}` : dateCourte(a.echeance)) : "sans date",
            a.genre === "appel" && a.contexte?.length ? `${a.contexte.length} question${a.contexte.length > 1 ? "s" : ""} à poser` : null,
            avecFiche && a.fiches?.length ? a.fiches.map((f) => f.nom).filter(Boolean).join(", ") : null].filter(Boolean).join(" · ")}
        </span>
      </button>
    </li>
  );
}

/** La frise de l'avancement : la plus récente en haut, la courante marquée. */
function Frise({ etapes }) {
  if (!etapes?.length) return <p className="m-0 text-[13.5px] text-brume">Pas encore d'étape connue.</p>;
  return (
    <ol className="k-serie relative m-0 list-none p-0">
      <span aria-hidden className="absolute bottom-3.5 left-[4.5px] top-3.5 w-px bg-bord-doux" />
      {etapes.map((e) => (
        <li key={e.nom} className="relative grid grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-x-4 py-2">
          <span className={`mt-[5px] h-[10px] w-[10px] rounded-full ${e.courante ? "bg-menthe ring-[3px] ring-menthe/20" : "bg-ardoise"}`} />
          <span className="min-w-0">
            <span className="block text-[14.5px] text-encre">{e.nom}</span>
            {e.detail && <span className="mt-0.5 block text-[14px] text-ardoise">{e.detail}</span>}
          </span>
          <span className="pt-px text-[14px] tabular-nums text-ardoise">{e.le ? dateJournal(e.le) : ""}</span>
        </li>
      ))}
    </ol>
  );
}

// Identité en tableau, une ligne par information séparée d'un filet (19 nov. 2026, Jules : « mets en tableau avec
// lignes ») : le libellé à gauche, la valeur à droite.
const Faits = ({ lignes }) => (
  <dl className="m-0 divide-y divide-trait border-y border-trait">
    {lignes.filter(([, v]) => v).map(([k, v]) => (
      <div key={k} className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-4 py-3 text-[14.5px] max-md:grid-cols-[110px_minmax(0,1fr)]">
        <dt className="text-[14px] text-ardoise">{k}</dt><dd className="m-0 min-w-0 text-encre">{v}</dd>
      </div>
    ))}
  </dl>
);

/** Une fiche, sur la maquette : `noteId` montre ce qu'une note en attente ajoute. */
export function FicheVue({ cle, noteId = null, nomDefaut = null, onOuvrir, onAction, onVue, ongletDepart = null }) {
  const n = useNote(noteId);
  const [onglet, setOnglet] = useState(ongletDepart || "resume");
  const { data: f, isLoading, isError, error } = useQuery({
    queryKey: ["fiche-dossier", cle],
    queryFn: () => base44.request("GET", `/api/fiche-dossier/fiche?cle=${encodeURIComponent(cle)}`),
    staleTime: 15_000,
  });
  if (isLoading) return <p className="m-0 px-6 py-6 text-[13.5px] text-brume">Chargement de la fiche…</p>;
  if (isError) return <p className="m-0 px-6 py-6 text-[13.5px] text-alerte">{error?.message || "Cette fiche ne se charge pas."}</p>;
  if (!f) return null;

  const p = n?.donnees?.proposition;
  const ajouts = p?.fiches?.find((x) => x.cle === cle) || null;
  const garde = n?.garde || new Set();
  const gardeEl = ajouts ? ajouts.elements.filter((e) => garde.has(e.id)) : [];
  const etapeNeuve = ajouts?.etape && garde.has(`${ajouts.id}-etape`) ? ajouts.etape : null;
  const blocageNeuf = ajouts && ajouts.blocage !== undefined && garde.has(`${ajouts.id}-blocage`) ? ajouts.blocage : undefined;
  const resumeNeuf = ajouts?.resume && (gardeEl.length || etapeNeuve || blocageNeuf !== undefined) ? ajouts.resume : null;
  const proposees = (p?.actions || []).filter((a) => a.fiches?.includes(cle) && garde.has(a.id)).map((a) => ({ ...actionVue(n, a), propose: true }));
  const nom = f.nom === "Fiche du CRM" && nomDefaut ? nomDefaut : f.nom;
  const bien = f.genre === "bien";
  const d = f.dossier;
  const id = d?.identite || {};
  const neuf = <span className="ml-1.5 rounded-full bg-menthe/15 px-1.5 py-0.5 text-[11px] text-menthe">proposé</span>;

  // L'avancement : ce que la plateforme et les notes savent, plus l'étape que la note propose (« Offre », son état).
  const etapes = (d?.avancement?.etapes || []).map((e) => ({ ...e }));
  if (etapeNeuve && (etapes[0]?.nom !== etapeNeuve || etapes[0]?.detail !== (ajouts.etat || null))) { for (const e of etapes) e.courante = false; etapes.unshift({ nom: etapeNeuve, le: new Date().toISOString(), detail: ajouts.etat || null, courante: true }); }
  const aFaire = [...proposees, ...f.actions];
  // Ce que la note en attente ajoute, ligne par ligne : la négociation dans l'avancement, les décisions dans les
  // décisions, le reste dans l'historique.
  const ajoutsDe = (pred) => (ajouts?.elements || []).filter(pred);
  const enNego = ajoutsDe((e) => e.genre === "negociation");
  const enDecision = ajoutsDe((e) => e.genre === "decision");
  const enHistorique = ajoutsDe((e) => !["negociation", "decision", "ressenti"].includes(e.genre));
  // Les ressentis vont dans « Notes » (19 nov. 2026, Jules : « des notes libres, un ressenti sur le client, sur l'agent,
  // qui ne sont ni dans l'historique, ni dans la prochaine action, ni dans les dossiers »).
  const enNotes = ajoutsDe((e) => e.genre === "ressenti");
  const ajout = (e) => (
    <Ajout key={e.id} coche={garde.has(e.id)} onClick={() => basculer(noteId, e.id)} libelle={garde.has(e.id) ? `Retirer : ${e.texte}` : `Garder : ${e.texte}`}>
      {TAG[e.genre] && <p className={`m-0 text-[11px] uppercase tracking-[.14em] ${TAG[e.genre][1]}`}>{TAG[e.genre][0]}</p>}
      <p className="m-0 text-[14px] leading-[1.5] text-encre">{e.texte}</p>
      {e.raison && <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-ardoise">{raisonLisible(e.raison)}</p>}
    </Ajout>
  );
  const nego = d?.negociation;
  // La carte avec ce que la note en attente dit : la position d'un client, le vendeur.
  const positionsNeuves = new Map((p?.fiches || []).filter((x) => x.position).map((x) => [x.cle, { position: x.position, detail: x.position_detail || null }]));
  const carteVue = f.carte ? {
    ...f.carte,
    vendeur: ajouts?.vendeur || f.carte.vendeur,
    clients: f.carte.clients.map((c) => (positionsNeuves.has(c.cle) ? { ...c, ...positionsNeuves.get(c.cle) } : c)),
  } : null;
  const sous = [bien ? id.ville : f.detail, GENRE_LISIBLE[f.genre]].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-0 flex-auto flex-col">
      <div className="flex min-h-0 flex-auto flex-col overflow-y-auto">
        <div className="k-entree mx-auto flex w-full max-w-[860px] flex-auto shrink-0 flex-col px-8 pb-10 pt-8 max-md:px-4">
          {/* L'étoile d'un agent, à droite de son nom (20 nov. 2026, Jules) : un de ses cinq agents préférés. */}
          <div className="flex items-center justify-center gap-1">
            {f.genre === "agent" && <span aria-hidden className="w-8 flex-none" />}
            <h2 className="m-0 text-center text-[19px] font-normal leading-[1.25] tracking-[-0.01em] text-encre">{nom}</h2>
            {f.genre === "agent" && <EtoileAgent cle={cle} />}
          </div>
          {sous && <p className="m-0 mt-1 text-center text-[14.5px] text-ardoise">{sous}</p>}

          {(() => {
            const vide = (t) => <p className="m-0 text-[13.5px] text-brume">{t}</p>;
            const onglets = [
              ["resume", "Résumé", !!resumeNeuf || !!ajouts?.etape || enNego.length > 0],
              ...(bien || aFaire.length > 0 ? [["action", "Prochaine action", proposees.length > 0]] : []),
              ...(bien && d ? [["identite", "Identité", false]] : []),
              ...(!bien ? [["dossiers", "Dossiers", false]] : []),
              ["historique", "Historique", enHistorique.length > 0 || enDecision.length > 0],
              ["notes", "Notes", enNotes.length > 0],
              ...(bien ? [["personnes", "Personnes", !!ajouts?.vendeur || positionsNeuves.size > 0]] : []),
            ];
            const ici = onglets.some(([o]) => o === onglet) ? onglet : "resume";
            return (
              <>
                <OngletsFiche onglets={onglets} actif={ici} onChoisir={setOnglet} />
                <div key={ici} className={`k-entree pt-5 ${ici === "personnes" ? "flex flex-auto flex-col" : ""}`}>
                  {ici === "resume" && (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <span className="inline-flex items-center gap-1.5 text-[13.5px] text-menthe"><Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />{!resumeNeuf && f.source === "twenty" && !f.maj_le ? <>Résumé<span className="text-ardoise"> · repris de Twenty</span></> : <>Résumé IA{resumeNeuf && <span className="text-ardoise"> · mis à jour par l'assistant</span>}</>}</span>
                        <p className="m-0 text-[15px] leading-[1.6] text-encre [text-wrap:pretty]">{resumeNeuf || f.resume || <span className="text-brume">Il s'écrira à la première note liée à cette fiche.</span>}</p>
                      </div>
                      {/* L'avancement d'un client (20 nov. 2026, Jules) : où il en est (« En recherche »), puis chaque
                          dossier qu'on lui a présenté et sa position (« Comtesse du Barry · Présenté, refusé »). */}
                      {f.genre === "client" && (f.etape || ajouts?.etape || f.liees.some((l) => l.genre === "bien")) && (
                        <section className="mt-6 border-t border-trait pt-4">
                          <Titre>Avancement</Titre>
                          {ajouts?.etape && (
                            <ul className="m-0 mb-2 list-none p-0">
                              <Ajout coche={garde.has(`${ajouts.id}-etape`)} onClick={() => basculer(noteId, `${ajouts.id}-etape`)} libelle={`Étape ${ajouts.etape}`}>
                                <p className="m-0 text-[14px] text-encre">Passe à <span className="text-menthe">{ajouts.etape}</span>{ajouts.etat && <span className="text-ardoise"> · {ajouts.etat}</span>}</p>
                              </Ajout>
                            </ul>
                          )}
                          {f.etape && <p className="m-0 text-[14.5px] text-encre">{f.etape}{f.etat ? <span className="text-ardoise"> · {f.etat}</span> : null}</p>}
                          {f.liees.some((l) => l.genre === "bien") && (
                            <ul className="m-0 mt-2 list-none divide-y divide-trait p-0">
                              {f.liees.filter((l) => l.genre === "bien").map((l) => (
                                <li key={l.cle}>
                                  <button type="button" onClick={() => onOuvrir?.(l.cle)} className="flex w-full items-baseline justify-between gap-4 py-2.5 text-left" style={{ background: "transparent" }}>
                                    <span className="min-w-0 truncate text-[14.5px] text-encre">{l.nom}</span>
                                    <span className="flex-none text-[13px] text-ardoise">{[POSITION_LISIBLE[l.position] || "Présenté", l.position_detail].filter(Boolean).join(" · ")}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>
                      )}
                      {bien && (
                        <section className="mt-6 border-t border-trait pt-4">
                          <Titre>Avancement</Titre>
                          {ajouts?.etape && (
                            <ul className="m-0 mb-2 list-none p-0">
                              <Ajout coche={garde.has(`${ajouts.id}-etape`)} onClick={() => basculer(noteId, `${ajouts.id}-etape`)} libelle={`Étape ${ajouts.etape}`}>
                                <p className="m-0 text-[14px] text-encre">Passe à <span className="text-menthe">{ajouts.etape}</span>{ajouts.etat && <span className="text-ardoise"> · {ajouts.etat}</span>}</p>
                              </Ajout>
                            </ul>
                          )}
                          <Frise etapes={etapes} />
                          {(enNego.length > 0 || nego?.lignes?.length > 0 || nego?.offre) && (
                            <div className="mt-3 border-t border-trait pt-3">
                              <p className="m-0 mb-1 text-[12.5px] text-ardoise">Négociation{nego?.offre && nego?.resume ? ` · ${nego.resume}` : ""}</p>
                              <ul className="m-0 list-none divide-y divide-trait p-0">
                                {enNego.map(ajout)}
                                {(nego?.lignes || []).map((l, i) => <li key={i} className="flex justify-between gap-4 py-2 text-[14px] leading-[1.5] text-encre"><span>{l.texte}</span><span className="flex-none text-[13px] text-ardoise">{dateJournal(l.le)}</span></li>)}
                              </ul>
                            </div>
                          )}
                        </section>
                      )}
                    </>
                  )}

                  {ici === "action" && (aFaire.length ? (
                    <ul className="m-0 list-none divide-y divide-trait p-0">
                      {aFaire.map((a) => a.propose ? (
                        <li key={a.id} className="py-2.5">
                          <button type="button" onClick={() => onAction?.(a.id)} className="flex w-full items-start gap-2.5 text-left" style={{ background: "transparent" }}>
                            {(() => { const I = ICONE_ACTION[a.genre] || Check; return <I className="mt-[4px] h-3.5 w-3.5 flex-none text-menthe" />; })()}
                            <span className="min-w-0 flex-1">
                              <span className="block text-[14.5px] leading-[1.5] text-encre">{a.titre}{neuf}</span>
                              <span className="block text-[13.5px] text-ardoise">{a.qui === "assistant" ? "Préparé par l'assistant" : a.qui === "moi" ? "À toi" : `Pour ${a.qui}`} · {a.echeance ? dateCourte(a.echeance) : "à programmer"}</span>
                            </span>
                          </button>
                        </li>
                      ) : <LigneAction key={a.id} a={a} onOuvrir={() => onVue?.({ vue: "action", action: a, note_id: noteId })} />)}
                    </ul>
                  ) : vide("Rien de prévu. Dis la suite dans une note liée : l'assistant la posera ici."))}

                  {ici === "identite" && (
                    <>
                      <Faits lignes={[["Activité", id.activite], ["Locataire", id.locataire], ["Adresse", id.adresse || id.ville], ["Prix FAI", id.prix_lisible], ["Loyer HT HC", id.loyer_lisible], ["Rendement", id.rendement_lisible], ["Surface", id.surface ? `${id.surface.toLocaleString("fr-FR")} m²` : null], ["Fin de bail", id.bail]]} />
                      {!id.activite && !id.prix_lisible && vide("La fiche commerciale et le projet ne disent encore rien de ce bien.")}
                    </>
                  )}

                  {ici === "dossiers" && (f.liees.length ? <Personnes liees={f.liees} onOuvrir={onOuvrir} /> : vide("Aucun dossier encore : lie une note à un bien et à cette fiche."))}

                  {ici === "notes" && (
                    <>
                      {enNotes.length > 0 && <ul className="m-0 mb-1 list-none divide-y divide-trait border-b border-trait p-0">{enNotes.map(ajout)}</ul>}
                      {f.notes?.length ? (
                        <ul className="k-serie m-0 list-none divide-y divide-trait p-0">
                          {f.notes.map((x) => (
                            <li key={x.id} className="py-3">
                              <p className="m-0 text-[14.5px] leading-[1.55] text-encre">{x.texte}</p>
                              <p className="m-0 mt-1 text-[13px] text-ardoise">{dateJournal(x.le)}{x.par ? ` · ${x.par}` : ""}</p>
                            </li>
                          ))}
                        </ul>
                      ) : !enNotes.length && vide("Pas encore de note : un ressenti ou une impression dits dans une note liée viendront ici.")}
                    </>
                  )}

                  {ici === "historique" && (
                    <>
                      {(f.decisions.length > 0 || enDecision.length > 0) && (
                        <section className="mb-5 border-b border-trait pb-3">
                          <Titre>Décisions</Titre>
                          <ul className="m-0 list-none divide-y divide-trait p-0">
                            {enDecision.map(ajout)}
                            {f.decisions.map((x) => (
                              <li key={x.id} className="py-2.5">
                                <p className="m-0 text-[14.5px] leading-[1.5] text-encre">{x.texte}</p>
                                <p className="m-0 mt-0.5 text-[14px] leading-[1.5] text-ardoise">{x.raison ? raisonLisible(x.raison) : "Raison non notée."} · {dateJournal(x.le)}{x.par ? `, ${x.par}` : ""}</p>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {enHistorique.length > 0 && <ul className="m-0 mb-1 list-none divide-y divide-trait border-b border-trait p-0">{enHistorique.map(ajout)}</ul>}
                      {f.journal.length ? <Chronologie journal={f.journal} /> : !enHistorique.length && vide("Lie une note à cette fiche depuis la page de l'assistant.")}
                    </>
                  )}

                  {ici === "personnes" && <CarteDossier carte={carteVue} sous={[id.ville, etapes[0]?.nom].filter(Boolean).join(" · ")} onOuvrir={onOuvrir} />}
                </div>
              </>
            );
          })()}

        </div>
      </div>
    </div>
  );
}

function Personnes({ liees, onOuvrir }) {
  return (
    <ul className="m-0 list-none divide-y divide-trait p-0">
      {liees.map((l) => (
        <li key={l.cle}>
          <button type="button" onClick={() => onOuvrir?.(l.cle)} className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left" style={{ background: "transparent" }}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-rail-actif text-[12px] text-craie">{l.genre === "bien" ? <Building2 className="h-3.5 w-3.5" /> : initiales(l.nom)}</span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] text-encre">{l.nom}</span>
              <span className="block truncate text-[12.5px] text-ardoise">{l.genre === "bien" ? (l.etape || "Dossier") : [l.genre === "agent" ? "Agent" : "Client", l.ressenti || l.resume].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="flex items-center gap-2 text-[12.5px] text-brume">{l.ressenti_le || l.maj_le ? dateJournal(l.ressenti_le || l.maj_le) : ""}<ArrowRight className="h-3.5 w-3.5 text-ardoise" /></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * L'historique en frise (19 nov. 2026, Jules : « comme l'avancement, une ligne au milieu qui descend, et de chaque
 * côté la date avec une petite annotation ») : le plus récent en haut, un côté sur deux ; sur un téléphone, d'un seul
 * côté. Un clic sur une entrée déplie ce que la note a rangé et la note telle qu'écrite.
 */
function Chronologie({ journal }) {
  return (
    <ol className="k-serie relative m-0 list-none p-0">
      <span aria-hidden className="absolute bottom-3 top-3 left-1/2 w-px -translate-x-1/2 bg-bord-doux max-md:left-[10px]" />
      {journal.map((j, i) => <EntreeJournal key={j.id} j={j} gauche={i % 2 === 0} recente={i === 0} />)}
    </ol>
  );
}

function EntreeJournal({ j, gauche, recente }) {
  const [ouvert, setOuvert] = useState(false);
  const [brut, setBrut] = useState(false);
  const annotation = j.titre || j.lignes[0]?.texte || "Note";
  const cote = gauche ? "col-start-1 text-right max-md:col-start-2 max-md:text-left" : "col-start-3 max-md:col-start-2";
  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] gap-x-4 py-2.5 max-md:grid-cols-[20px_minmax(0,1fr)] max-md:gap-x-3">
      <span aria-hidden className={`col-start-2 row-start-1 mt-[5px] h-[9px] w-[9px] justify-self-center rounded-full ring-4 ring-barre max-md:col-start-1 ${recente ? "bg-menthe" : "bg-ardoise"}`} />
      <div className={`row-start-1 min-w-0 ${cote}`}>
        <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className={`group block w-full ${gauche ? "text-right max-md:text-left" : "text-left"}`} style={{ background: "transparent" }}>
          <span className="block text-[14px] tabular-nums text-ardoise">{dateJournal(j.le)}{j.par ? ` · ${j.par}` : ""}</span>
          <span className={`mt-0.5 block text-[14.5px] leading-[1.45] text-encre transition-colors group-hover:text-menthe-texte ${ouvert ? "" : "line-clamp-2"}`}>{annotation}</span>
        </button>
        <Depliant ouvert={ouvert}>
          <div className="pt-2 text-left">
            <ul className="m-0 list-none space-y-1.5 p-0">
              {j.lignes.map((l, i) => (
                <li key={i} className="text-[13.5px] leading-[1.5] text-craie">
                  {l.genre === "decision" && <span className="mr-1.5 text-[11px] uppercase tracking-[.14em] text-menthe">Décision</span>}
                  {l.genre === "ressenti" && <span className="mr-1.5 text-[11px] uppercase tracking-[.14em] text-brume">Ressenti</span>}
                  {l.texte}
                  {l.raison && <span className="text-ardoise"> {raisonLisible(l.raison)}</span>}
                </li>
              ))}
            </ul>
            {j.brut && (
              <>
                <button type="button" onClick={() => setBrut((o) => !o)} aria-expanded={brut} className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
                  La note telle qu'écrite <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${brut ? "rotate-180" : ""}`} />
                </button>
                <Depliant ouvert={brut}><p className="m-0 mt-1.5 whitespace-pre-line rounded-champ bg-relief px-3.5 py-3 text-[13.5px] leading-[1.6] text-craie">{j.brut}</p></Depliant>
              </>
            )}
          </div>
        </Depliant>
      </div>
    </li>
  );
}

/** Une action enregistrée, ouverte depuis « Aujourd'hui » ou une fiche : la date et le texte s'enregistrent. */
function ActionEnregistree({ a: depart, onFermer }) {
  const queryClient = useQueryClient();
  const a = depart;
  const patcher = (body) => base44.request("PATCH", `/api/fiche-dossier/actions/${a.id}`, { body })
    .then(() => { queryClient.invalidateQueries({ queryKey: ["fiche-dossier-jour"] }); queryClient.invalidateQueries({ queryKey: ["fiche-dossier"] }); })
    .catch((e) => toast.error(e?.message || "Non enregistré."));
  const [texte, setTexte] = useState(depart.brouillon?.texte || "");
  useEffect(() => {
    if (!depart.brouillon || texte === depart.brouillon.texte) return undefined;
    const t = setTimeout(() => patcher({ brouillon: texte }), 700);
    return () => clearTimeout(t);
  }, [texte]); // eslint ne suit pas `patcher`, recréée à chaque rendu : seul le texte compte.
  return (
    <ActionApercu a={{ ...a, brouillon: a.brouillon ? { ...a.brouillon, texte } : null }} onTexte={a.brouillon ? setTexte : null} onFermer={onFermer} />
  );
}

/**
 * Le panneau de droite : la fiche en onglets Dossier, Client, Agent, ou l'aperçu d'une action.
 * @param {{ vue: { note_id?: string, vue: "fiche"|"action", cle?: string, action_id?: string, action?: object }, onVue: (v: object) => void, onFermer: () => void }} props
 */
export function PanneauNote({ vue, onVue, onFermer }) {
  if (vue.vue === "notes") return <MesNotes onFermer={onFermer} />;
  if (vue.vue === "attente") return <AttenteFiches onFermer={onFermer} />;
  return <PanneauFiche vue={vue} onVue={onVue} onFermer={onFermer} />;
}

/** Le mode Enregistrement, avant tout lien : la place des fiches, et ce qu'il faut faire pour les voir. */
function AttenteFiches({ onFermer }) {
  return (
    <div className="flex min-h-0 flex-auto flex-col">
      <div className="flex flex-none justify-end px-6 pt-3 max-md:px-4">
        <button type="button" onClick={onFermer} aria-label="Fermer le panneau" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      <div className="k-entree mx-auto flex max-w-[420px] flex-auto flex-col items-center justify-center gap-2 px-8 pb-16 text-center">
        <p className="m-0 text-[17px] text-encre">Les fiches s'ouvriront ici</p>
        <p className="m-0 text-[14.5px] leading-[1.6] text-ardoise">Lie un bien, des clients, un agent avec « Lier » : leurs fiches se chargent ici, puis se mettent à jour pendant l'enregistrement.</p>
      </div>
    </div>
  );
}

function PanneauFiche({ vue, onVue, onFermer }) {
  const n = useNote(vue.note_id);
  const principale = vue.cle || null;
  const { data: f } = useQuery({
    queryKey: ["fiche-dossier", principale],
    queryFn: () => base44.request("GET", `/api/fiche-dossier/fiche?cle=${encodeURIComponent(principale)}`),
    enabled: !!principale && !vue.note_id, staleTime: 15_000,
  });
  // Les fiches des onglets : celles de la note, ou la fiche ouverte et ce qui lui est lié.
  const [ancre, setAncre] = useState(null);
  const base = f && (!ancre || f.genre === "bien") ? f : ancre;
  useEffect(() => { if (f && f.genre === "bien") setAncre(f); }, [f]);
  // `vue.liens` : les fiches liées à la saisie (le mode Enregistrement, 20 nov. 2026), en tête des onglets.
  const liens = vue.note_id
    ? n?.donnees?.liens || []
    : [...(vue.liens || []), ...(base ? [{ cle: base.cle, genre: base.genre, nom: base.nom }, ...(base.liees || [])]
      : principale ? [{ cle: principale, genre: /^(deal|projet):/.test(principale) ? "bien" : "agent", nom: "" }] : [])].filter((l, i, t) => t.findIndex((x) => x.cle === l.cle) === i);
  const active = vue.vue === "fiche" ? (principale || liens.find((l) => l.genre === "bien")?.cle || liens[0]?.cle) : null;
  const genreActif = vue.vue === "fiche" ? (liens.find((l) => l.cle === active)?.genre || (/^(deal|projet):/.test(active || "") ? "bien" : null)) : null;
  const ouvrirGenre = (g) => { const l = liens.find((x) => x.genre === g); if (l) onVue({ ...vue, vue: "fiche", cle: l.cle, action_id: null, action: null, onglet: null }); };
  const actionNote = vue.vue === "action" && vue.note_id && n && !vue.action ? n.donnees.proposition.actions.find((a) => a.id === vue.action_id) : null;
  const actionsNote = n ? n.donnees.proposition.actions.map((a) => actionVue(n, a)) : [];

  return (
    <div className="flex max-h-full min-h-0 flex-auto flex-col overflow-hidden">
      {vue.vue === "fiche" && (
      <div className="flex flex-none items-end justify-between gap-3 border-b border-trait px-6 max-md:px-4">
        <div role="tablist" aria-label="Fiches" className="flex items-end gap-6">
          {ONGLETS.map(([g, libelle]) => {
            const nb = liens.filter((l) => l.genre === g).length;
            const actif = genreActif === g;
            return (
              <button key={g} type="button" role="tab" aria-selected={actif} disabled={!nb} onClick={() => ouvrirGenre(g)}
                className={`relative h-11 px-0.5 text-[14px] transition-colors disabled:opacity-35 ${actif ? "text-encre" : "text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>
                {libelle}{nb > 1 ? ` · ${nb}` : ""}
                {actif && <motion.span layoutId="k-onglet-fiche" transition={RESSORT} aria-hidden className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-menthe" />}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer le panneau" className="mb-2 grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      )}
      {/* Plusieurs fiches dans un onglet (deux clients) : une pastille chacune. */}
      {vue.vue === "fiche" && liens.filter((l) => l.genre === genreActif).length > 1 && (
        <div className="flex flex-none flex-wrap justify-center gap-1.5 px-6 pt-3">
          {liens.filter((l) => l.genre === genreActif).map((l) => (
            <button key={l.cle} type="button" onClick={() => onVue({ ...vue, vue: "fiche", cle: l.cle })} aria-pressed={l.cle === active}
              className={`h-7 rounded-full border px-3 text-[12.5px] ${l.cle === active ? "border-menthe text-encre" : "border-trait text-craie hover:text-encre"}`} style={{ background: "transparent" }}>{l.nom}</button>
          ))}
        </div>
      )}
      <div className="flex min-h-0 flex-auto flex-col">
        {vue.vue === "fiche" && active && (
          <FicheVue key={`${active}-${vue.onglet || ""}`} ongletDepart={vue.onglet || null} cle={active} noteId={vue.note_id || null} nomDefaut={liens.find((l) => l.cle === active)?.nom}
            onOuvrir={(c) => onVue({ vue: "fiche", cle: c, note_id: liens.some((l) => l.cle === c) ? vue.note_id : null })}
            onAction={(id) => onVue({ ...vue, vue: "action", action_id: id, action: null })} onVue={onVue} onFermer={onFermer} />
        )}
        {actionNote && (
          <div key={actionNote.id} className="k-entree flex min-h-0 flex-auto flex-col">
          <ActionApercu a={{ ...actionVue(n, actionNote), fiches: (actionNote.fiches || []).map((c) => ({ cle: c, nom: liens.find((l) => l.cle === c)?.nom || c })) }} liees={actionsNote} onFermer={onFermer}
            onTexte={actionNote.brouillon ? (t) => modifier(vue.note_id, actionNote.id, "brouillon", t) : null} />
          </div>
        )}
        {vue.vue === "action" && vue.action && <div key={vue.action.id} className="k-entree flex min-h-0 flex-auto flex-col"><ActionEnregistree a={vue.action} onFermer={onFermer} /></div>}
        {vue.vue === "action" && vue.note_id && !vue.action && !actionNote && <p className="m-0 px-6 py-5 text-[13.5px] text-brume">Cette action n'est plus proposée.</p>}
      </div>
    </div>
  );
}

/** L'état du panneau : ouvert par « Voir la fiche », une action, une fiche (ouvrirFiche), d'où qu'on soit. */
export function usePanneau() {
  const [vue, setVue] = useState(null);
  useEffect(() => {
    const surFiche = (e) => { const cle = e?.detail?.cle; if (cle) setVue({ vue: "fiche", cle }); };
    // `{ fermer: true }` referme le panneau (20 nov. 2026 : la fiche d'appel arrive dans le chat seul).
    const surPanneau = (e) => { if (e?.detail?.fermer) setVue(null); else if (e?.detail) setVue(e.detail); };
    window.addEventListener("klocka:fiche-dossier", surFiche);
    window.addEventListener("klocka:panneau-note", surPanneau);
    return () => { window.removeEventListener("klocka:fiche-dossier", surFiche); window.removeEventListener("klocka:panneau-note", surPanneau); };
  }, []);
  return [vue, setVue];
}

/** Le panneau posé par-dessus la page, à droite (plein écran au téléphone). */
export function PanneauFlottant({ vue, setVue }) {
  return createPortal(
    <AnimatePresence>
      {vue && (
        <>
          <motion.div key="voile" data-crm-dehors className="fixed inset-0 z-[84] bg-fond/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setVue(null)} />
          <motion.aside key="panneau" role="dialog" aria-label="Fiche" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28 }} transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-y-0 right-0 z-[85] flex w-full flex-col overflow-hidden bg-barre shadow-[0_12px_40px_rgb(0_0_0/0.3)] max-md:pt-[env(safe-area-inset-top)] md:w-[min(760px,94vw)] md:border-l md:border-trait">
            <PanneauNote vue={vue} onVue={setVue} onFermer={() => setVue(null)} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Pour les pages sans écran scindé (le CRM) : le panneau flottant, ouvert par ouvrirFiche ou ouvrirPanneau. */
export function FicheDossierHote() {
  const [vue, setVue] = usePanneau();
  useEffect(() => {
    if (!vue) return undefined;
    const echap = (e) => { if (e.key === "Escape") setVue(null); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [vue, setVue]);
  return <PanneauFlottant vue={vue} setVue={setVue} />;
}
