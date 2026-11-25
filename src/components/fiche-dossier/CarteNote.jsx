import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Building2, Check, CheckSquare, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { sonRange } from "@/lib/son";
import { dateCourte, ouvrirFiche } from "@/lib/fiche-dossier";
import { actionVue, basculer, fermerNote, ouvrirPanneau, poserNote, prochaineEtape, repondre, toutesLesCles, useNote } from "@/lib/note-en-cours";
import { ICONE_GENRE } from "@/components/fiche-dossier/LienNote";
import { ICONE_ACTION } from "@/components/fiche-dossier/ActionApercu";

// La réponse de l'assistant à une note liée (19 nov. 2026, Jules : « l'assistant dit voici ce que je propose, voici les
// fiches modifiées, voici ce que je propose comme actions ; on clique, et le détail est à droite ») : les fiches mises
// à jour, chacune avec « Voir la fiche » (onglets Bien, Client, Agent, ce que l'assistant ajoute à décocher) ; les
// actions proposées (un clic ouvre le message WhatsApp ou la relance, à programmer) ; OK (les questions sont posées dans le chat, 19 nov. 2026). Après le OK :
// un petit son, ce qui a été rangé, et de quoi annuler. Le même jour, sur la capture de Jules : trois onglets (Actions,
// Fiches, À préciser), les actions en étapes numérotées (à faire par toi, préparé par l'assistant), plus de « Lier aussi ».

const pluriel = (n, un, plusieurs = `${un}s`) => `${n} ${n > 1 ? plusieurs : un}`;
const QUI = { moi: "À toi", assistant: "Préparé par l'assistant" };

function resumeDeFiche(f, garde) {
  const n = f.elements.filter((e) => garde.has(e.id)).length;
  return [n ? pluriel(n, "ajout") : null, f.etape && garde.has(`${f.id}-etape`) ? `étape ${f.etape}` : null, f.resume ? "résumé mis à jour" : null].filter(Boolean).join(" · ");
}

export default function CarteNote({ donnees }) {
  const queryClient = useQueryClient();
  const noteId = donnees.note_id;
  useEffect(() => { poserNote(donnees); }, [donnees]);
  const n = useNote(noteId) || { donnees, garde: new Set(toutesLesCles(donnees.proposition)), modifs: {}, reponses: {} };
  const note = n.donnees;
  const p = note.proposition || { fiches: [], actions: [], questions: [], mentions: [] };
  const [onglet, setOnglet] = useState(null);
  const [etat, setEtat] = useState(donnees.etat === "rangee" ? "rangee" : "proposee");
  const [recu, setRecu] = useState(null);
  // Une carte rouverte (l'historique, une conversation reprise) : l'état réel de sa note, pas celui gardé dans le fil
  // (20 nov. 2026) ; une note déjà rangée ou écartée ne demande plus rien.
  useEffect(() => {
    if (donnees.etat === "rangee" || !noteId) return undefined;
    let vivant = true;
    base44.request("GET", `/api/fiche-dossier/notes/${noteId}`).then((r) => {
      if (!vivant || !r?.etat || r.etat === "proposee") return;
      fermerNote(noteId);
      setEtat(r.etat === "rangee" ? "rangee" : r.etat === "annulee" ? "annulee" : "ecartee");
    }).catch(() => {});
    return () => { vivant = false; };
  }, [noteId]);
  const rafraichir = () => { for (const k of [["fiche-dossier-jour"], ["fiche-dossier"], ["fiche-dossier-mes-actions"]]) queryClient.invalidateQueries({ queryKey: k }); };

  const ranger = useMutation({
    mutationFn: () => base44.request("POST", `/api/fiche-dossier/notes/${noteId}/ranger`, { body: { garde: [...n.garde], modifs: n.modifs, reponses: n.reponses } }),
    onSuccess: (r) => { sonRange(); fermerNote(noteId); setEtat("rangee"); setRecu(r); rafraichir(); },
    onError: (e) => toast.error(e?.message || "La note n'a pas été rangée."),
  });
  const annuler = useMutation({
    mutationFn: () => base44.request("POST", `/api/fiche-dossier/notes/${noteId}/annuler`),
    onSuccess: () => { setEtat("annulee"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Rien n'a été annulé."),
  });
  const ecarter = useMutation({
    mutationFn: () => base44.request("POST", `/api/fiche-dossier/notes/${noteId}/ecarter`),
    onSuccess: () => { fermerNote(noteId); setEtat("ecartee"); rafraichir(); },
  });
  const voirFiche = (cle) => ouvrirPanneau({ note_id: noteId, vue: "fiche", cle });
  // Une tâche n'a rien de plus à montrer qu'elle-même : son clic ouvre la fiche du dossier sur « Prochaine action »
  // (19 nov. 2026, Jules) ; un message, un mail ou une relance ouvrent ce que l'assistant a écrit.
  const voirAction = (id) => {
    const a = (p.actions || []).find((x) => x.id === id);
    if (a && (a.genre === "tache" || a.genre === "attente")) {
      const cles = a.fiches || [];
      const cle = cles.find((c) => /^(deal|projet):/.test(c)) || cles[0] || (note.liens || []).find((l) => l.genre === "bien")?.cle || (note.liens || [])[0]?.cle;
      if (cle) return ouvrirPanneau({ note_id: noteId, vue: "fiche", cle, onglet: "action" });
    }
    return ouvrirPanneau({ note_id: noteId, vue: "action", action_id: id });
  };

  if (etat === "annulee" || etat === "ecartee") {
    return <p className="m-0 text-[14.5px] text-ardoise">{etat === "annulee" ? "Annulé : rien n'est resté sur les fiches." : "Note écartée : rien n'a été rangé."}</p>;
  }

  if (etat === "rangee") {
    const fiches = recu?.fiches || (note.liens || []).map((l) => ({ cle: l.cle, nom: l.nom }));
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
        <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-menthe text-sur-menthe"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[16px] text-encre">C'est rangé.</p>
          {recu && <p className="m-0 mt-0.5 text-[14px] text-ardoise">{[recu.entrees || !recu.retraits ? pluriel(recu.entrees, "ligne") : null, recu.actions ? pluriel(recu.actions, "action") : null].filter(Boolean).join(" et ")}{recu.entrees || recu.actions || !recu.retraits ? ` sur ${pluriel(fiches.length, "fiche")}` : ""}{recu.retraits ? `${recu.entrees || recu.actions ? ", " : ""}${pluriel(recu.retraits, "lien retiré", "liens retirés")}` : ""}{recu.faites ? `, ${pluriel(recu.faites, "action fermée", "actions fermées")}` : ""}.{recu.actions ? " Les actions sont dans « À faire »." : ""}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {fiches.map((f) => (
              <button key={f.cle} type="button" onClick={() => ouvrirFiche(f.cle)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>
                {f.nom}<ArrowRight className="h-3.5 w-3.5" />
              </button>
            ))}
            <button type="button" onClick={() => annuler.mutate()} disabled={annuler.isPending} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-ardoise hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
              {annuler.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Annuler
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Les fiches de la note : celles que l'assistant modifie, puis les autres fiches liées, telles quelles (25 nov. 2026,
  // Jules, sur « relancer Duranson par mail demain » : « je voudrais voir aussi la fiche de la personne »).
  const modifiees = (p.fiches || []).filter((f) => f.elements?.length || f.etape);
  const fichesTouchees = [...modifiees, ...(note.liens || []).filter((l) => l.cle && !modifiees.some((f) => f.cle === l.cle))
    .map((l) => ({ id: `lien-${l.cle}`, cle: l.cle, nom: l.nom, genre: l.genre, telle: true }))];
  const retraits = p.retraits || [];
  // Les retraits, par fiche : « Retirer de la fiche d'Alexis Petit ».
  const retraitsPar = [...new Set(retraits.map((r) => r.de))].map((de) => ({ de, nom: retraits.find((r) => r.de === de)?.de_nom, liste: retraits.filter((r) => r.de === de) }));
  const actions = (p.actions || []).map((a0) => actionVue(n, a0));
  const faites = p.faites || [];
  const aProgrammer = actions.filter((a) => n.garde.has(a.id) && !a.echeance).length;
  const etape = etat === "proposee" || !etat ? prochaineEtape(n) : null;
  const repondues = (p.questions || []).filter((q) => q?.id && String(n.reponses?.[q.id] || "").trim());
  // Toujours les deux onglets, Actions et Fiches (25 nov. 2026, Jules : « on a actions et fiches, normal »), dès que la
  // note propose quelque chose ; un onglet vide le dit.
  const onglets = actions.length || faites.length || fichesTouchees.length
    ? [["actions", `Actions · ${actions.length + faites.length}`], ["fiches", `Fiches · ${fichesTouchees.length}`]]
    : [];
  const vu = onglets.some(([k]) => k === onglet) ? onglet : onglets[0]?.[0];

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <p className="m-0 text-[17px] leading-[1.5] text-encre">{actions.length || faites.length || modifiees.length || retraits.length ? "Voici ce que je propose." : "Je n'y vois rien à ranger sur ces fiches : la note sera gardée telle quelle si tu valides."}</p>

      {onglets.length > 1 && (
        <div role="tablist" aria-label="Ce que je propose" className="mt-4 inline-flex rounded-[14px] bg-relief p-1">
          {onglets.map(([k, libelle]) => (
            <button key={k} type="button" role="tab" aria-selected={vu === k} onClick={() => setOnglet(k)}
              className={`relative h-9 rounded-[10px] px-4 text-[14px] transition-colors ${vu === k ? "text-encre" : "text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>
              {/* Fondu en CSS, pas de `layoutId` : dans un panneau qui se ferme, il bloquait le retrait de l'écran (23 nov. 2026). */}
              <span aria-hidden className={`absolute inset-0 rounded-[10px] bg-barre-relief transition-opacity duration-200 ${vu === k ? "opacity-100" : "opacity-0"}`} />
              <span className="relative">{libelle}</span>
            </button>
          ))}
        </div>
      )}

      {/* Les deux onglets dans la même case de grille, l'un visible, l'autre caché (20 nov. 2026, Jules : « quand je clique
          entre Fiches et Actions, ça scrolle, c'est énervant ») : la carte garde la hauteur du plus grand, le fil ne saute
          plus. */}
      <div className="grid">
      {onglets.some(([k]) => k === "actions") && (
        <div aria-hidden={vu !== "actions"} className={`[grid-area:1/1] ${vu === "actions" ? "k-entree" : "invisible pointer-events-none"}`}>
          {actions.length || faites.length
            ? <Actions actions={actions} faites={faites} garde={n.garde} noteId={noteId} onVoir={voirAction} />
            : <p className="m-0 mt-5 text-[14.5px] text-ardoise">Aucune action proposée.</p>}
        </div>
      )}

      {/* Les fiches modifiées : le détail s'ouvre à droite. */}
      {onglets.some(([k]) => k === "fiches") && (
        <div aria-hidden={vu !== "fiches"} className={`[grid-area:1/1] ${vu === "fiches" ? "k-entree" : "invisible pointer-events-none"}`}>
        {fichesTouchees.length
          ? <ListeFiches className="mt-5" fiches={fichesTouchees.map((f) => ({ ...f, detail: f.telle ? "Rien de changé" : resumeDeFiche(f, n.garde) || "Rien de gardé" }))} onVoir={(f) => voirFiche(f.cle)} />
          : <p className="m-0 mt-5 text-[14.5px] text-ardoise">Aucune fiche liée à cette note.</p>}
        </div>
      )}

      </div>

      {/* Les fiches liées à retirer (24 nov. 2026, Jules : « il ne nous a pas envoyé le dossier à Pau, enlève-le de la fiche
          d'Alexis ») : cochées, le OK les délie ; décochées, elles restent liées. */}
      {retraitsPar.map((g) => (
        <div key={g.de} className="mt-5">
          <p className="m-0 mb-2 text-[13.5px] text-ardoise">{g.nom ? `Retirer de la fiche ${/^[aeiouyhàâéèêîôû]/i.test(g.nom) ? "d'" : "de "}${g.nom}` : "Retirer de la fiche"}</p>
          <Cadre>
            {g.liste.map((r) => {
              const oui = n.garde.has(r.id);
              const I = ICONE_GENRE[r.genre] || Building2;
              return (
                <li key={r.id} className={`border-t border-trait px-5 py-3.5 first:border-t-0 transition-opacity ${oui ? "" : "opacity-45"}`}>
                  <div className="flex items-center gap-3.5">
                    <button type="button" role="checkbox" aria-checked={oui} onClick={() => basculer(noteId, r.id)} aria-label={oui ? `Laisser ${r.nom} sur la fiche` : `Retirer ${r.nom} de la fiche`}
                      className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full border transition-colors ${oui ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif text-transparent hover:border-menthe"}`}>
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </button>
                    <Pastille><I className="h-4 w-4" /></Pastille>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] leading-[1.45] text-encre">{r.nom}</span>
                      <span className="mt-0.5 block text-[13px] text-ardoise">{oui ? "Retiré avec ton OK" : "Reste sur la fiche"}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </Cadre>
        </div>
      ))}

      {/* Les règles de travail que la note énonce (22 nov. 2026, Jules : « lors de la prospection, demander le contexte de la
          vente ») : au OK, elles partent au Cerveau, où Jules les valide. */}
      {(p.regles || []).length > 0 && (
        <div className="mt-5">
          <p className="m-0 mb-1.5 text-[13.5px] text-ardoise">À retenir pour l'équipe, envoyé au Cerveau pour validation</p>
          <ul className="m-0 list-none space-y-1.5 p-0">
            {p.regles.map((r) => <li key={r.id} className="flex gap-2.5 text-[15px] leading-[1.5] text-encre"><span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-menthe" />{r.texte}</li>)}
          </ul>
        </div>
      )}

      {/* La question, dans la même réponse (19 nov. 2026, Jules : « pas une autre image de l'assistant ») : ce qui manque,
          puis la date de chaque action gardée ; on répond dans la saisie, avec ses mots. Pas de OK tant qu'il en reste. */}
      {/* Les réponses déjà données, sous leur question (20 nov. 2026, Jules : « c'est comme si mon message n'était pas
          pris en compte ») : on voit ce qui a été compris de chaque réponse. */}
      {repondues.length > 0 && (
        <ul className="k-serie m-0 mt-6 list-none space-y-3 p-0">
          {repondues.map((q) => (
            <li key={q.id} className="flex gap-3">
              <Check className="mt-1 h-3.5 w-3.5 flex-none text-menthe" strokeWidth={2.5} />
              <span className="min-w-0">
                <span className="block text-[13.5px] leading-[1.45] text-ardoise">{q.texte}</span>
                <span className="mt-0.5 block text-[15px] leading-[1.5] text-encre">{n.reponses[q.id]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {etape && (
        <div className="k-entree mt-6">
          <p className="m-0 text-[16px] leading-[1.5] text-encre">
            {etape.genre === "question" ? etape.q.texte : etape.plusieurs ? `« ${etape.a.titre} » : quand est-ce que tu veux la programmer ?` : "Quand est-ce que tu veux la programmer ?"}
          </p>
          {/* Seul un chiffre du projet à confirmer garde Oui / Non (20 nov. 2026, Jules : pas de choix devinés). */}
          {etape.genre === "question" && etape.q.maj_projet && etape.q.choix?.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {etape.q.choix.slice(0, 5).map((c) => (
                <button key={c} type="button" onClick={() => repondre(noteId, etape.q.id, c)} className="h-8 rounded-full border border-trait px-3.5 text-[13px] text-craie transition-colors hover:border-bord-doux hover:text-encre" style={{ background: "transparent" }}>{c}</button>
              ))}
            </div>
          )}
          {n.signal && <p className="m-0 mt-1.5 text-[13.5px] text-ardoise">{n.signal}</p>}
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => ranger.mutate()} disabled={ranger.isPending || aProgrammer > 0}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
          {ranger.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}OK c'est bon
        </button>
        <button type="button" onClick={() => ecarter.mutate()} disabled={ranger.isPending} className="h-10 rounded-full px-3 text-[14px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Écarter</button>
      </div>
    </motion.div>
  );
}

// Les listes de la carte (ce que l'assistant a préparé, les fiches touchées) sur le fond d'une fiche (20 nov. 2026, Jules) :
// le verre en sombre, le fond de la saisie en clair (.k-fiche-fond).
const Cadre = ({ className = "", children }) => <ul className={`k-fiche-fond m-0 list-none overflow-hidden rounded-[14px] border border-bord-doux p-0 ${className}`}>{children}</ul>;
const Pastille = ({ children }) => <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-relief text-craie">{children}</span>;

/** Les fiches d'une proposition, une ligne chacune, « Voir la fiche » à droite : la note liée, les actions d'un rappel. */
export function ListeFiches({ fiches, onVoir, className = "" }) {
  return (
    <Cadre className={className}>
      {fiches.map((f) => {
        const I = ICONE_GENRE[f.genre] || Building2;
        return (
          <li key={f.id || f.cle} className="border-t border-trait first:border-t-0">
            <button type="button" onClick={() => onVoir(f)} className="flex w-full items-center gap-3.5 px-5 py-4 text-left hover:bg-relief" style={{ background: "transparent" }}>
              <Pastille><I className="h-4 w-4" /></Pastille>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] leading-[1.45] text-encre">{f.nom}</span>
                {f.detail && <span className="mt-0.5 block truncate text-[13px] text-ardoise">{f.detail}</span>}
              </span>
              <span className="inline-flex flex-none items-center gap-1 text-[13px] text-menthe">Voir la fiche<ChevronRight className="h-3.5 w-3.5" /></span>
            </button>
          </li>
        );
      })}
    </Cadre>
  );
}

/** Les groupes d'actions, dans l'ordre : ce que tu fais, ce que l'assistant a préparé, ce qui revient à un collègue. */
function groupes(actions) {
  const g = new Map();
  for (const a of actions) {
    const cle = a.qui === "moi" ? "moi" : a.qui === "assistant" ? "assistant" : `pour:${a.qui}`;
    if (!g.has(cle)) g.set(cle, { cle, titre: cle === "moi" ? "À faire par toi" : cle === "assistant" ? "Préparé par l'assistant, à relire" : `Pour ${a.qui}`, actions: [] });
    g.get(cle).actions.push(a);
  }
  const rang = (c) => (c === "moi" ? 0 : c === "assistant" ? 1 : 2);
  return [...g.values()].sort((a, b) => rang(a.cle) - rang(b.cle));
}

/** Les actions proposées, en étapes numérotées reliées par un trait : la case pour garder, un clic pour voir à droite. */
function Actions({ actions, faites = [], garde, noteId, onVoir }) {
  // Ce que la note a fait parmi les actions prévues (20 nov. 2026, Jules : « l'appel à Alexandre, c'est fait ») vient
  // en premier, coché : le OK le ferme ; décoché, il reste dans « À faire ».
  const gs = [...(faites.length ? [{ cle: "faites", titre: "C'est fait", faites }] : []), ...groupes(actions)];
  return (
    <ol className="m-0 mt-5 list-none p-0">
      {gs.map((g, i) => (
        <li key={g.cle} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-4 pb-6 last:pb-0">
          {i < gs.length - 1 && <span aria-hidden className="absolute bottom-0 left-[13.5px] top-8 w-px bg-bord-doux" />}
          <span className="grid h-7 w-7 place-items-center rounded-full bg-relief text-[13px] tabular-nums text-craie">{i + 1}</span>
          <div className="min-w-0">
            <p className="m-0 flex h-7 items-center text-[15px] text-encre">{g.titre}</p>
            <Cadre className="mt-2.5">
              {(g.faites || []).map((d) => {
                const oui = garde.has(d.id);
                return (
                  <li key={d.id} className={`border-t border-trait px-5 py-4 first:border-t-0 transition-opacity ${oui ? "" : "opacity-45"}`}>
                    <div className="flex items-center gap-3.5">
                      <button type="button" role="checkbox" aria-checked={oui} onClick={() => basculer(noteId, d.id)} aria-label={oui ? `Laisser ouvert : ${d.titre}` : `Fermer : ${d.titre}`}
                        className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full border transition-colors ${oui ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif text-transparent hover:border-menthe"}`}>
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] leading-[1.45] text-encre">{d.libelle}</span>
                        <span className="mt-0.5 block text-[13px] text-ardoise">{oui ? "Sort de « À faire » avec ton OK" : "Reste dans « À faire »"}{d.restees?.length ? ` · ${pluriel(d.restees.length, "question")} sans réponse, sur la prochaine relance` : ""}</span>
                      </span>
                    </div>
                  </li>
                );
              })}
              {(g.actions || []).map((a) => {
                const oui = garde.has(a.id);
                const I = ICONE_ACTION[a.genre] || CheckSquare;
                return (
                  <li key={a.id} className={`border-t border-trait px-5 py-4 first:border-t-0 transition-opacity ${oui ? "" : "opacity-45"}`}>
                    <div className="flex items-center gap-3.5">
                    <button type="button" role="checkbox" aria-checked={oui} onClick={() => basculer(noteId, a.id)} aria-label={oui ? `Ne pas garder : ${a.titre}` : `Garder : ${a.titre}`}
                      className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full border transition-colors ${oui ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif text-transparent hover:border-menthe"}`}>
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </button>
                    <button type="button" onClick={() => onVoir(a.id)} className="flex min-w-0 flex-1 items-center gap-3.5 text-left" style={{ background: "transparent" }}>
                      <Pastille><I className="h-4 w-4" /></Pastille>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] leading-[1.45] text-encre">{a.titre}</span>
                        <span className="mt-0.5 block truncate text-[13px] text-ardoise">{QUI[a.qui] || `Pour ${a.qui}`} · {a.echeance ? `pour ${dateCourte(a.echeance)}` : "à programmer"}{a.reprises ? ` · ${pluriel(a.reprises, "question reprise", "questions reprises")}` : ""}</span>
                      </span>
                      {/* Plus de flèche sur une action (19 nov. 2026, Jules : « au clic il n'y a rien de plus ») ; les fiches la gardent. */}
                    </button>
                    </div>
                  </li>
                );
              })}
            </Cadre>
          </div>
        </li>
      ))}
    </ol>
  );
}
