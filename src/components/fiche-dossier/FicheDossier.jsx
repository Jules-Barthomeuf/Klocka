import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Check, ChevronDown, Loader2, Mic, Sparkles, X } from "lucide-react";
import { useDictee } from "@/lib/dictee";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { dateCourte, dateJournal, enRetard } from "@/lib/fiche-dossier";
import { actionVue, basculer, modifier, useNote } from "@/lib/note-en-cours";
import ActionApercu, { ICONE_ACTION } from "@/components/fiche-dossier/ActionApercu";
import { Depliant } from "@/components/haka/ReglagesDemande";
import CarteDossier from "@/components/fiche-dossier/CarteDossier";
import MesNotes from "@/components/fiche-dossier/MesNotes";
import { EtoileAgent } from "@/components/fiche-dossier/EtoileAgent";
import { PhotosFiche } from "@/components/fiche-dossier/PhotoFiche";
import FondHalo from "@/components/projet/FondHalo";

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
const TAG = { evenement: ["Historique", "text-ardoise"], decision: ["Décision", "text-menthe"], negociation: ["Négociation", "text-menthe"], ressenti: ["Ressenti", "text-brume"], profil: ["Comment lui parler", "text-menthe"], ecart: ["Écart entre deux sources", "text-craie"] };
const ORIGINE = { google_chat: "Google Chat", whatsapp: "WhatsApp", appel: "un appel", texte: "un texte collé" };
const POSITION_LISIBLE = { presente: "Présenté", visio: "Visio faite", positionne: "Positionné", interesse: "Positionné", offre: "Offre", signe: "Signé", abandon: "Présenté, refusé" };

/**
 * Les onglets de la fiche, sous le nom (19 nov. 2026, Jules : « des onglets comme Dossier, Client, Agent ») : Résumé
 * (le résumé et l'avancement, ce qu'on voit en arrivant), Prochaine action, Identité, Historique, Personnes. Un onglet
 * remplace tout ce qui est dessous ; une lumière dit qu'une note en attente y ajoute quelque chose.
 */
function OngletsFiche({ onglets, actif, onChoisir }) {
  // Une fiche ouverte sur un onglet du bout (Notes, Personnes) le montre, sans faire bouger la page.
  const rangee = React.useRef(null);
  useEffect(() => {
    const r = rangee.current;
    const b = r?.querySelector('[aria-selected="true"]');
    if (r && b && (b.offsetLeft + b.offsetWidth > r.scrollLeft + r.clientWidth || b.offsetLeft < r.scrollLeft)) r.scrollLeft = b.offsetLeft - 8;
  }, []);
  return (
    // En pastilles (20 nov. 2026, Jules, maquette de la fiche de Sébastien ROBIC) : l'onglet ouvert sur un fond plein, sans
    // trait dessous.
    <div ref={rangee} role="tablist" aria-label="Parties de la fiche" className="mt-6 flex items-center gap-0.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      {onglets.map(([id, libelle, lumiere]) => (
        <button key={id} type="button" role="tab" aria-selected={actif === id} onClick={(e) => { onChoisir(id); e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }); }}
          className={`relative flex h-10 flex-none items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[14px] transition-colors ${actif === id ? "text-encre" : "text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>
          {/* Un fondu en CSS, plus la forme partagée de framer-motion (`layoutId`) : dans la fiche qui se ferme, elle
              empêchait le retrait de l'écran, resté invisible par-dessus la page (23 nov. 2026, Jules : « je ne peux plus
              cliquer sur rien »). */}
          <span aria-hidden className={`absolute inset-0 rounded-full bg-relief transition-opacity duration-200 ${actif === id ? "opacity-100" : "opacity-0"}`} />
          {lumiere && <span aria-label="Ajouté par l'assistant" title="Ajouté par l'assistant" className="k-lumiere relative h-[7px] w-[7px] rounded-full bg-menthe" />}
          <span className="relative">{libelle}</span>
        </button>
      ))}
    </div>
  );
}

const Titre = ({ children, className = "" }) => <p className={`m-0 mb-2 text-[15px] text-encre ${className}`}>{children}</p>;

function Case({ coche, onClick, libelle, rond = false, enCours = false, grand = false }) {
  return (
    <button type="button" role="checkbox" aria-checked={coche} onClick={onClick} disabled={enCours} aria-label={libelle}
      className={`grid flex-none place-items-center border transition-colors ${grand ? "mt-0.5 h-[22px] w-[22px] border-[1.5px]" : "mt-[2px] h-[18px] w-[18px]"} ${rond ? "rounded-full" : "rounded-[6px]"} ${coche ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-doux text-transparent hover:border-menthe"}`}>
      <Check className={grand ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={3} />
    </button>
  );
}

/**
 * Ce que l'assistant propose, après une note ou un appel, en carte (20 nov. 2026, Jules, maquette « Décider de la suite ») :
 * le fond d'une carte posé sur la fiche, le rond pour le garder ou non, la pastille « proposé », qui le propose et
 * pourquoi, et ses boutons s'il en a.
 */
function Ajout({ coche, onClick, children, libelle, actions = null }) {
  return (
    <li className={`flex gap-3.5 rounded-[18px] border border-trait bg-relief px-4 py-3.5 transition-opacity duration-200 ${coche ? "" : "opacity-55"}`}>
      <Case rond grand coche={coche} onClick={onClick} libelle={libelle} />
      <div className="min-w-0 flex-1">
        {children}
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </li>
  );
}
const Proposees = ({ children, className = "" }) => <ul className={`m-0 flex list-none flex-col gap-2 p-0 ${className}`}>{children}</ul>;
const Propose = () => <span className="ml-2 inline-block rounded-full bg-menthe/15 px-2 py-px align-[1px] text-[12px] leading-[1.6] text-menthe">proposé</span>;
const BOUTON_PLEIN = "inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-4 text-[14px] text-sur-menthe transition-colors hover:bg-menthe-survol";
const VOIR_ACTION = { whatsapp: "Voir le message", sms: "Voir le message", mail: "Voir le mail", appel: "Voir la relance" };

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
            a.avant ? `avant ${a.avant.replace(/^avant\s+/i, "")}` : null,
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
export function FicheVue({ cle, noteId = null, nomDefaut = null, crm = null, onOuvrir, onAction, onVue, ongletDepart = null }) {
  const n = useNote(noteId);
  const [onglet, setOnglet] = useState(ongletDepart || "resume");
  // Ouverte sous une autre clé (la demande d'un client, la ligne du CRM d'un agent), la fiche passe sur celle qui fait foi,
  // que les gestes rafraîchissent (25 nov. 2026, une seule fiche par chose).
  const queryClient = useQueryClient();
  const [cleLue, setCleLue] = useState(cle);
  const { data: f, isLoading, isError, error } = useQuery({
    queryKey: ["fiche-dossier", cleLue],
    queryFn: () => base44.request("GET", `/api/fiche-dossier/fiche?cle=${encodeURIComponent(cleLue)}${nomDefaut ? `&nom=${encodeURIComponent(nomDefaut)}` : ""}`),
    staleTime: 15_000,
  });
  useEffect(() => {
    if (!f?.cle || f.cle === cleLue) return;
    queryClient.setQueryData(["fiche-dossier", f.cle], f);
    setCleLue(f.cle);
  }, [f, cleLue, queryClient]);
  if (isLoading) return <p className="m-0 px-6 py-6 text-[13.5px] text-brume">Chargement de la fiche…</p>;
  if (isError) return <p className="m-0 px-6 py-6 text-[13.5px] text-alerte">{error?.message || "Cette fiche ne se charge pas."}</p>;
  if (!f) return null;
  // La clé qui fait foi, renvoyée par le serveur (25 nov. 2026, une seule fiche par chose) : les gestes sur la fiche la suivent.
  const cleVue = f.cle || cle;

  const p = n?.donnees?.proposition;
  const ajouts = p?.fiches?.find((x) => x.cle === cle || x.cle === cleVue) || null;
  const garde = n?.garde || new Set();
  const gardeEl = ajouts ? ajouts.elements.filter((e) => garde.has(e.id)) : [];
  const etapeNeuve = ajouts?.etape && garde.has(`${ajouts.id}-etape`) ? ajouts.etape : null;
  const blocageNeuf = ajouts && ajouts.blocage !== undefined && garde.has(`${ajouts.id}-blocage`) ? ajouts.blocage : undefined;
  const resumeNeuf = ajouts?.resume && (gardeEl.length || etapeNeuve || blocageNeuf !== undefined) ? ajouts.resume : null;
  const proposees = (p?.actions || []).filter((a) => (a.fiches?.includes(cle) || a.fiches?.includes(cleVue)) && garde.has(a.id)).map((a) => ({ ...actionVue(n, a), propose: true }));
  const nom = f.nom === "Fiche du CRM" && nomDefaut ? nomDefaut : f.nom;
  const bien = f.genre === "bien";
  const d = f.dossier;
  const id = d?.identite || {};

  // L'avancement : ce que la plateforme et les notes savent, plus l'étape que la note propose (« Offre », son état).
  const etapes = (d?.avancement?.etapes || []).map((e) => ({ ...e }));
  if (etapeNeuve && (etapes[0]?.nom !== etapeNeuve || etapes[0]?.detail !== (ajouts.etat || null))) { for (const e of etapes) e.courante = false; etapes.unshift({ nom: etapeNeuve, le: new Date().toISOString(), detail: ajouts.etat || null, courante: true }); }
  const aFaire = [...proposees, ...f.actions];
  // Ce que la note en attente ajoute, ligne par ligne : la négociation dans l'avancement, les décisions dans les
  // décisions, le reste dans l'historique.
  const ajoutsDe = (pred) => (ajouts?.elements || []).filter(pred);
  const enNego = ajoutsDe((e) => e.genre === "negociation");
  const enDecision = ajoutsDe((e) => e.genre === "decision");
  const enHistorique = ajoutsDe((e) => !["negociation", "decision", "ressenti", "profil"].includes(e.genre));
  // Comment lui parler (22 nov. 2026, Jules, sur les notes de Maxime : « les profils sont la vraie richesse ») : en tête du
  // Résumé d'une personne, la synthèse, puis les profils notés.
  const enProfil = ajoutsDe((e) => e.genre === "profil");
  const parlerNeuf = ajouts?.comment_parler && enProfil.some((e) => garde.has(e.id)) ? ajouts.comment_parler : null;
  // Les ressentis vont dans « Notes » (19 nov. 2026, Jules : « des notes libres, un ressenti sur le client, sur l'agent,
  // qui ne sont ni dans l'historique, ni dans la prochaine action, ni dans les dossiers »).
  const enNotes = ajoutsDe((e) => e.genre === "ressenti");
  const ajout = (e) => (
    <Ajout key={e.id} coche={garde.has(e.id)} onClick={() => basculer(noteId, e.id)} libelle={garde.has(e.id) ? `Retirer : ${e.texte}` : `Garder : ${e.texte}`}>
      <p className="m-0 text-[15px] leading-[1.45] text-encre [text-wrap:pretty]">{e.texte}<Propose /></p>
      {/* Le jour de ce qui s'est passé, quand la note le dit (« mardi » ; 26 nov. 2026, Jules). */}
      <p className="m-0 mt-1 text-[13.5px] leading-[1.45] text-ardoise">{["Proposé par l'assistant", TAG[e.genre]?.[0], e.arrive_le ? new Date(`${e.arrive_le}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : null].filter(Boolean).join(" · ")}</p>
      {e.raison && <p className="m-0 mt-0.5 text-[13.5px] leading-[1.45] text-ardoise">{raisonLisible(e.raison)}</p>}
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
  // Une personne : « Agent · 1 dossier en cours » sous son nom, ses initiales au-dessus (20 nov. 2026, Jules, maquette).
  const enCours = f.liees.filter((l) => l.genre === "bien").length;
  const sous = bien ? [id.ville, GENRE_LISIBLE[f.genre]].filter(Boolean).join(" · ")
    : [f.genre === "agent" ? "Agent" : "Client", f.detail && f.detail !== "Twenty CRM" ? f.detail : f.envois?.contact?.agence || null, enCours ? `${enCours} dossier${enCours > 1 ? "s" : ""} en cours` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-0 flex-auto flex-col">
      <div className="flex min-h-0 flex-auto flex-col overflow-y-auto">
        <div className="k-entree mx-auto flex w-full max-w-[860px] flex-auto shrink-0 flex-col px-8 pb-10 pt-8 max-md:px-4">
          {/* Sa photo quand on l'a (20 nov. 2026, Jules), sinon ses initiales ; un clic en importe une (22 nov. 2026, Jules :
              « chaque agent doit avoir une image ; tous les clients aussi »). Celle d'une page équipe est resserrée sur le visage. */}
          {!bien && <PhotosFiche cle={cleVue} nom={nom} photo={f.photo} taille={60} recadrer={!!f.photo && !f.photo_importee} className="mx-auto mb-4" />}
          {/* L'étoile d'un agent, à droite de son nom (20 nov. 2026, Jules) : un de ses cinq agents préférés. */}
          <div className="flex items-center justify-center gap-1">
            {f.genre === "agent" && <span aria-hidden className="w-8 flex-none" />}
            <h2 className="m-0 text-center text-[22px] font-normal leading-[1.25] tracking-[-0.01em] text-encre">{nom}</h2>
            {f.genre === "agent" && <EtoileAgent cle={cleVue} />}
          </div>
          {sous && <p className="m-0 mt-1 text-center text-[14.5px] text-ardoise">{sous}</p>}
          {/* Le lien « Fiche du CRM » sous le nom est retiré (25 nov. 2026, Jules : « enlève Fiche du CRM dans une fiche »). */}

          {(() => {
            const vide = (t) => <p className="m-0 text-[13.5px] text-brume">{t}</p>;
            const onglets = [
              ["resume", "Résumé", !!resumeNeuf || !!ajouts?.etape || enNego.length > 0 || enProfil.length > 0],
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
                {f.a_relire && <BandeauRelire cle={cleVue} f={f} />}
                <OngletsFiche onglets={onglets} actif={ici} onChoisir={setOnglet} />
                <div key={ici} className={`k-entree pt-5 ${ici === "personnes" ? "flex flex-auto flex-col" : ""}`}>
                  {ici === "resume" && (
                    <>
                      <div className="flex flex-col gap-1.5">
                        {/* Sans note, le résumé d'un agent dit ses fiches (24 nov. 2026, Jules) : des faits, pas de l'IA. */}
                        {!resumeNeuf && !f.resume && f.envois?.resume ? (
                          <>
                            <span className="text-[13.5px] text-ardoise">Résumé · d'après ses fiches</span>
                            <p className="m-0 text-[15px] leading-[1.6] text-encre [text-wrap:pretty]">{f.envois.resume}</p>
                          </>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1.5 text-[13.5px] text-menthe"><Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />{!resumeNeuf && f.source === "twenty" && !f.maj_le ? <>Résumé<span className="text-ardoise"> · repris de Twenty</span></> : <>Résumé IA{resumeNeuf && <span className="text-ardoise"> · mis à jour par l'assistant</span>}</>}</span>
                            <p className="m-0 text-[15px] leading-[1.6] text-encre [text-wrap:pretty]">{resumeNeuf || f.resume || <span className="text-brume">Il s'écrira à la première note liée à cette fiche.</span>}</p>
                          </>
                        )}
                      </div>
                      {f.transactions?.en_cours > 0 && <TransactionsClient transactions={f.transactions} seulementEnCours />}
                      {f.activite && <ActivitePlateforme activite={f.activite} />}
                      {f.presente_a?.length > 0 && <PresenteA presente={f.presente_a} onOuvrir={onOuvrir} />}
                      {!bien && (f.comment_parler || parlerNeuf || f.profils?.length > 0 || enProfil.length > 0) && (
                        <section className="mt-6 border-t border-trait pt-4">
                          <Titre>Comment lui parler</Titre>
                          {(parlerNeuf || f.comment_parler) && <p className="m-0 text-[15px] leading-[1.6] text-encre [text-wrap:pretty]">{parlerNeuf || f.comment_parler}{parlerNeuf && <Propose />}</p>}
                          {enProfil.length > 0 && <Proposees className="mt-3">{enProfil.map(ajout)}</Proposees>}
                          {f.profils?.length > 0 && (
                            <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
                              {f.profils.slice(0, 6).map((x) => <li key={x.id} className="text-[13.5px] leading-[1.5] text-craie">{x.texte}<span className="text-ardoise"> · {dateJournal(x.le)}{x.par ? `, ${x.par}` : ""}{x.importe ? " · importé" : ""}</span></li>)}
                            </ul>
                          )}
                        </section>
                      )}
                      {f.envois && <FichesEnvoyees envois={f.envois} />}
                      {/* Deux sources qui se contredisent (l'import, 22 nov. 2026) : dit, jamais tranché en silence. */}
                      {f.ecarts?.length > 0 && (
                        <section className="mt-6 border-t border-trait pt-4">
                          <Titre>À vérifier</Titre>
                          <ul className="m-0 list-none space-y-1.5 p-0">{f.ecarts.slice(0, 5).map((x) => <li key={x.id} className="text-[14px] leading-[1.5] text-encre">{x.texte}<span className="text-ardoise"> · {dateJournal(x.le)}</span></li>)}</ul>
                        </section>
                      )}
                      {/* L'avancement d'un client (20 nov. 2026, Jules) : où il en est (« En recherche »), puis chaque
                          dossier qu'on lui a présenté et sa position (« Comtesse du Barry · Présenté, refusé »). */}
                      {f.genre === "client" && (f.etape || ajouts?.etape || f.liees.some((l) => l.genre === "bien")) && (
                        <section className="mt-6 border-t border-trait pt-4">
                          <Titre>Avancement</Titre>
                          {ajouts?.etape && (
                            <Proposees className="mb-3">
                              <Ajout coche={garde.has(`${ajouts.id}-etape`)} onClick={() => basculer(noteId, `${ajouts.id}-etape`)} libelle={`Étape ${ajouts.etape}`}>
                                <p className="m-0 text-[15px] leading-[1.45] text-encre">Passe à <span className="text-menthe">{ajouts.etape}</span>{ajouts.etat && <span className="text-ardoise"> · {ajouts.etat}</span>}<Propose /></p>
                                <p className="m-0 mt-1 text-[13.5px] text-ardoise">Proposé par l'assistant · Avancement</p>
                              </Ajout>
                            </Proposees>
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
                            <Proposees className="mb-3">
                              <Ajout coche={garde.has(`${ajouts.id}-etape`)} onClick={() => basculer(noteId, `${ajouts.id}-etape`)} libelle={`Étape ${ajouts.etape}`}>
                                <p className="m-0 text-[15px] leading-[1.45] text-encre">Passe à <span className="text-menthe">{ajouts.etape}</span>{ajouts.etat && <span className="text-ardoise"> · {ajouts.etat}</span>}<Propose /></p>
                                <p className="m-0 mt-1 text-[13.5px] text-ardoise">Proposé par l'assistant · Avancement</p>
                              </Ajout>
                            </Proposees>
                          )}
                          <Frise etapes={etapes} />
                          {(enNego.length > 0 || nego?.lignes?.length > 0 || nego?.offre) && (
                            <div className="mt-3 border-t border-trait pt-3">
                              <p className="m-0 mb-1 text-[12.5px] text-ardoise">Négociation{nego?.offre && nego?.resume ? ` · ${nego.resume}` : ""}</p>
                              {enNego.length > 0 && <Proposees className="mb-2 mt-1">{enNego.map(ajout)}</Proposees>}
                              <ul className="m-0 list-none divide-y divide-trait p-0">
                                {(nego?.lignes || []).map((l, i) => <li key={i} className="flex justify-between gap-4 py-2 text-[14px] leading-[1.5] text-encre"><span>{l.texte}</span><span className="flex-none text-[13px] text-ardoise">{dateJournal(l.le)}</span></li>)}
                              </ul>
                            </div>
                          )}
                        </section>
                      )}
                    </>
                  )}

                  {ici === "action" && (aFaire.length ? (
                    <>
                      {proposees.length > 0 && (
                        <Proposees className={f.actions.length ? "mb-4" : ""}>
                          {proposees.map((a) => (
                            <Ajout key={a.id} coche={garde.has(a.id)} onClick={() => basculer(noteId, a.id)} libelle={garde.has(a.id) ? `Retirer : ${a.titre}` : `Garder : ${a.titre}`}
                              actions={onAction ? <button type="button" onClick={() => onAction(a.id)} className={BOUTON_PLEIN}>{VOIR_ACTION[a.genre] || "Voir le détail"}<ArrowRight className="h-4 w-4" strokeWidth={1.8} /></button> : null}>
                              <p className="m-0 text-[15px] leading-[1.45] text-encre [text-wrap:pretty]">{a.titre}<Propose /></p>
                              <p className="m-0 mt-1 text-[13.5px] leading-[1.45] text-ardoise">{["Proposé par l'assistant", a.qui === "assistant" ? "préparé par lui" : a.qui === "moi" ? "à toi" : `pour ${a.qui}`, a.echeance ? dateCourte(a.echeance) : "à programmer"].join(" · ")}</p>
                            </Ajout>
                          ))}
                        </Proposees>
                      )}
                      {f.actions.length > 0 && (
                        <ul className="m-0 list-none divide-y divide-trait p-0">
                          {f.actions.map((a) => <LigneAction key={a.id} a={a} onOuvrir={() => onVue?.({ vue: "action", action: a, note_id: noteId })} />)}
                        </ul>
                      )}
                    </>
                  ) : vide("Rien de prévu. Dis la suite dans une note liée : l'assistant la posera ici."))}

                  {ici === "identite" && (
                    <>
                      <Faits lignes={[["Activité", id.activite], ["Locataire", id.locataire], ["Adresse", id.adresse || id.ville], ["Prix FAI", id.prix_lisible], ["Loyer HT HC", id.loyer_lisible], ["Rendement", id.rendement_lisible], ["Surface", id.surface ? `${id.surface.toLocaleString("fr-FR")} m²` : null], ["Fin de bail", id.bail]]} />
                      {!id.activite && !id.prix_lisible && vide("La fiche commerciale et le projet ne disent encore rien de ce bien.")}
                    </>
                  )}

                  {ici === "dossiers" && (
                    <>
                      {f.transactions && <TransactionsClient transactions={f.transactions} />}
                      {f.activite?.presentes?.length > 0 && <ProjetsPresentes presentes={f.activite.presentes} />}
                      {f.liees.length ? <Personnes cle={cleVue} nom={nom} liees={f.liees} onOuvrir={onOuvrir} /> : !f.transactions && !f.activite?.presentes?.length ? vide("Aucun dossier encore : lie une note à un bien et à cette fiche.") : null}
                    </>
                  )}

                  {ici === "notes" && (
                    <>
                      <NouvelleNote cle={cleVue} nom={nom} />
                      {enNotes.length > 0 && <Proposees className="mt-5">{enNotes.map(ajout)}</Proposees>}
                      {f.notes?.length ? (
                        <ul className="k-serie m-0 mt-3 list-none divide-y divide-trait p-0">
                          {f.notes.map((x) => (
                            <li key={x.id} className="py-4">
                              <p className="m-0 text-[15px] leading-[1.55] text-encre [text-wrap:pretty]">{x.texte}</p>
                              <p className="m-0 mt-1.5 text-[13.5px] text-ardoise">{[dateJournal(x.le), x.par, x.rangee ? "rangée par l'assistant" : null].filter(Boolean).join(" · ")}</p>
                            </li>
                          ))}
                        </ul>
                      ) : !enNotes.length && <div className="mt-4">{vide("Pas encore de note : écris-en une ici, ou dis un ressenti dans une note liée.")}</div>}
                    </>
                  )}

                  {ici === "historique" && (
                    <>
                      {(f.decisions.length > 0 || enDecision.length > 0) && (
                        <section className="mb-5 border-b border-trait pb-3">
                          <Titre>Décisions</Titre>
                          {enDecision.length > 0 && <Proposees className="mb-2">{enDecision.map(ajout)}</Proposees>}
                          <ul className="m-0 list-none divide-y divide-trait p-0">
                            {f.decisions.map((x) => (
                              <li key={x.id} className="py-2.5">
                                <p className="m-0 text-[14.5px] leading-[1.5] text-encre">{x.texte}</p>
                                <p className="m-0 mt-0.5 text-[14px] leading-[1.5] text-ardoise">{x.raison ? raisonLisible(x.raison) : "Raison non notée."} · {dateJournal(x.le)}{x.par ? `, ${x.par}` : ""}</p>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {enHistorique.length > 0 && <Proposees className="mb-4">{enHistorique.map(ajout)}</Proposees>}
                      {f.journal.length ? <Chronologie journal={f.journal} /> : !enHistorique.length && vide("Lie une note à cette fiche depuis la page de l'assistant.")}
                    </>
                  )}

                  {ici === "personnes" && <CarteDossier carte={carteVue} onOuvrir={onOuvrir} />}
                </div>
              </>
            );
          })()}

        </div>
      </div>
    </div>
  );
}

/**
 * Les fiches qu'un agent nous a envoyées (24 nov. 2026, Jules : « des agents nous ont envoyé des fiches mais leur fiche
 * est vide ») : lues dans la Mémoire à chaque ouverture (server/fiche-dossier/fiches-envoyees.js), en lignes ; une
 * ligne ouvre la fiche reçue. Ses coordonnées d'abord, celles lues sur ses fiches dites comme telles.
 */
/**
 * L'activité d'un client sur la plateforme (27 nov. 2026, Jules : « montrer que ce client est actif : il a regardé tel
 * dossier pendant tant, le simulateur ») : la phrase, puis ce qu'il a regardé en 30 jours, avec le temps.
 */
const TEINTE_ACTIVITE = { actif: "text-menthe", tiede: "text-ambre", inactif: "text-ardoise", jamais: "text-ardoise" };
function ActivitePlateforme({ activite: a }) {
  return (
    <section className="mt-6 border-t border-trait pt-4">
      <Titre>Sur la plateforme<span className={`${TEINTE_ACTIVITE[a.statut] || "text-ardoise"}`}> · {{ actif: "actif", tiede: "moins actif", inactif: "inactif", jamais: "jamais connecté" }[a.statut] || a.statut}</span></Titre>
      <p className="m-0 text-[15px] leading-[1.6] text-encre [text-wrap:pretty]">{a.phrase}</p>
      {a.regardes?.length > 0 && (
        <ul className="m-0 mt-2 list-none divide-y divide-trait p-0">
          {a.regardes.map((x) => {
            const contenu = (
              <>
                <span className="min-w-0 truncate text-[14.5px] text-encre">{x.genre === "dossier" ? x.nom : x.nom.charAt(0).toUpperCase() + x.nom.slice(1)}</span>
                <span className="flex-none text-right text-[13px] text-ardoise">{x.temps}{x.vues > 1 ? ` · ${x.vues} fois` : ""}{x.dernier ? <span className="block text-brume">{dateJournal(x.dernier)}</span> : null}</span>
              </>
            );
            const classe = "flex w-full items-center justify-between gap-4 py-2.5 text-left";
            return (
              <li key={`${x.genre}:${x.nom}`}>
                {x.lien
                  ? <Link to={x.lien} onClick={() => window.dispatchEvent(new CustomEvent("klocka:panneau-note", { detail: { fermer: true } }))} className={`${classe} no-underline hover:opacity-80`}>{contenu}</Link>
                  : <div className={classe}>{contenu}</div>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="m-0 mt-2 text-[12.5px] text-brume">Compte {a.compte}{a.lie_par === "nom" ? " · retrouvé par son nom" : ""} · 30 derniers jours</p>
    </section>
  );
}

/**
 * Les transactions du client, lues dans Twenty (27 nov. 2026, Jules : « est-ce qu'il négocie, finance, signe le
 * compromis ») : en cours d'abord, le statut à droite, les jalons datés dessous.
 */
const TEINTE_TRANSACTION = (t) => (t.en_cours ? "text-menthe" : t.finie ? "text-encre" : "text-ardoise");
function TransactionsClient({ transactions, seulementEnCours = false }) {
  const lignes = seulementEnCours ? transactions.lignes.filter((t) => t.en_cours) : transactions.lignes;
  if (!lignes.length) return null;
  return (
    <section className={seulementEnCours ? "mt-6 border-t border-trait pt-4" : "mb-6"}>
      <Titre>{seulementEnCours ? "En transaction" : "Transactions"}<span className="text-ardoise"> · {seulementEnCours ? lignes.length : `${transactions.en_cours} en cours, ${transactions.finies} signée${transactions.finies > 1 ? "s" : ""}`}</span></Titre>
      <ul className="m-0 list-none divide-y divide-trait p-0">
        {lignes.map((t) => (
          <li key={t.id}>
            <Link to={t.lien} onClick={() => window.dispatchEvent(new CustomEvent("klocka:panneau-note", { detail: { fermer: true } }))} className="flex w-full items-start justify-between gap-4 py-2.5 text-left no-underline hover:opacity-80">
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] text-encre">{t.bien || t.nom || "Transaction"}</span>
                <span className="block truncate text-[13px] text-ardoise">{[t.prix, t.jalons.length ? t.jalons.map((j) => `${j.mot} le ${dateJournal(j.le)}`).join(" · ") : null].filter(Boolean).join(" · ") || t.nom}</span>
              </span>
              <span className={`flex-none text-right text-[13px] ${TEINTE_TRANSACTION(t)}`}>{t.statut || "Sans statut"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Les projets présentés au client (assignés à son compte) : ouverts ou non, et le temps passé (27 nov. 2026, Jules). */
function ProjetsPresentes({ presentes }) {
  return (
    <section className="mb-6">
      <Titre>Projets présentés<span className="text-ardoise"> · {presentes.length}</span></Titre>
      <ul className="m-0 list-none divide-y divide-trait p-0">
        {presentes.map((p) => (
          <li key={p.id}>
            <Link to={p.lien} onClick={() => window.dispatchEvent(new CustomEvent("klocka:panneau-note", { detail: { fermer: true } }))} className="flex w-full items-center justify-between gap-4 py-2.5 text-left no-underline hover:opacity-80">
              <span className="min-w-0 truncate text-[14.5px] text-encre">{p.nom}</span>
              <span className="flex-none text-right text-[13px] text-ardoise">{p.ouvert ? <>{p.temps}<span className="block text-brume">ouvert le {dateJournal(p.premiere)}</span></> : <span className="text-brume">pas encore ouvert</span>}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** À qui le bien a été présenté (les clients assignés à ses projets), et s'ils l'ont ouvert (27 nov. 2026, Jules). */
function PresenteA({ presente, onOuvrir }) {
  return (
    <section className="mt-6 border-t border-trait pt-4">
      <Titre>Présenté à<span className="text-ardoise"> · {presente.length}</span></Titre>
      <ul className="m-0 list-none divide-y divide-trait p-0">
        {presente.map((x) => {
          const contenu = (
            <>
              <span className="min-w-0 truncate text-[14.5px] text-encre">{x.nom}</span>
              <span className="flex-none text-right text-[13px] text-ardoise">{x.ouvert ? <>{x.temps}<span className="block text-brume">ouvert le {dateJournal(x.premiere)}</span></> : <span className="text-brume">pas encore ouvert</span>}</span>
            </>
          );
          const classe = "flex w-full items-center justify-between gap-4 py-2.5 text-left";
          return (
            <li key={x.email}>
              {x.fiche && onOuvrir
                ? <button type="button" onClick={() => onOuvrir(x.fiche)} className={`${classe} hover:opacity-80`} style={{ background: "transparent" }}>{contenu}</button>
                : <div className={classe}>{contenu}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FichesEnvoyees({ envois }) {
  const [tout, setTout] = useState(false);
  const c = envois.contact || {};
  const coord = [c.telephone, c.email].filter(Boolean);
  const lues = (c.lues_sur_fiches || []).filter((k) => k !== "agence" && c[k]);
  const lignes = tout ? envois.lignes : envois.lignes.slice(0, 6);
  return (
    <section className="mt-6 border-t border-trait pt-4">
      <Titre>Fiches envoyées<span className="text-ardoise"> · {envois.total}</span></Titre>
      {coord.length > 0 && <p className="m-0 mb-2 text-[14px] leading-[1.5] text-craie [overflow-wrap:anywhere]">{coord.join(" · ")}{lues.length > 0 && <span className="text-ardoise"> · lu sur ses fiches</span>}</p>}
      <ul className="m-0 list-none divide-y divide-trait p-0">
        {lignes.map((l) => {
          const contenu = (
            <>
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] text-encre">{l.titre}</span>
                <span className="block truncate text-[13px] text-ardoise">{[l.ou, l.prix, l.loyer].filter(Boolean).join(" · ") || "Sans adresse"}</span>
              </span>
              <span className="flex-none text-right text-[13px] text-ardoise">{dateJournal(l.jour)}{l.qui ? <span className="block text-brume">via {l.qui}</span> : null}</span>
            </>
          );
          const classe = "flex w-full items-center justify-between gap-4 py-2.5 text-left";
          return (
            <li key={l.id}>
              {l.fiche?.url
                ? <a href={l.fiche.url} target="_blank" rel="noreferrer" className={`${classe} no-underline hover:opacity-80`} title={l.fiche.nom || "Ouvrir la fiche"}>{contenu}</a>
                : <Link to={`/MemoireKlocka?q=${encodeURIComponent(l.ville || l.titre)}`} onClick={() => window.dispatchEvent(new CustomEvent("klocka:panneau-note", { detail: { fermer: true } }))} className={`${classe} no-underline hover:opacity-80`}>{contenu}</Link>}
            </li>
          );
        })}
      </ul>
      {envois.lignes.length > 6 && (
        <button type="button" onClick={() => setTout((x) => !x)} className="mt-1 text-[13px] text-craie underline decoration-trait underline-offset-2 hover:text-encre" style={{ background: "transparent" }}>
          {tout ? "Moins" : `Voir les ${envois.lignes.length}`}
        </button>
      )}
    </section>
  );
}

/**
 * Écrire une note sur la fiche, en tête de l'onglet Notes (20 nov. 2026, Jules, maquette « Ajouter une note sur Sébastien
 * ROBIC… ») : tapée ou dictée, gardée telle quelle, sans passer par l'assistant.
 */
function NouvelleNote({ cle, nom }) {
  const queryClient = useQueryClient();
  const [texte, setTexte] = useState("");
  const base = React.useRef("");
  const dictee = useDictee({ onTexte: (t) => setTexte(`${base.current}${t}`), onFin: (t) => setTexte(`${base.current}${t}`) });
  const ajouter = useMutation({
    mutationFn: () => base44.request("POST", "/api/fiche-dossier/fiche/notes", { body: { cle, texte } }),
    onSuccess: () => { setTexte(""); queryClient.invalidateQueries({ queryKey: ["fiche-dossier", cle] }); },
    onError: (e) => toast.error(e?.message || "La note n'a pas été ajoutée."),
  });
  const pret = texte.trim().length > 0 && !ajouter.isPending && !dictee.ecoute && !dictee.finalisation;
  const micro = () => {
    if (dictee.ecoute) { dictee.arreter(); return; }
    base.current = texte.trim() ? `${texte.trim()} ` : "";
    dictee.demarrer();
  };
  return (
    <div className="rounded-[16px] border border-bord-doux px-4 pb-3 pt-3.5 transition-colors focus-within:border-bord-vif">
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2} placeholder={`Ajouter une note sur ${nom}…`} aria-label={`Ajouter une note sur ${nom}`}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && pret) { e.preventDefault(); ajouter.mutate(); } }}
        className="block w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.5] text-encre outline-none placeholder:text-brume" style={{ background: "transparent" }} />
      <div className="mt-2 flex items-center justify-between">
        {dictee.supporte ? (
          <button type="button" onClick={micro} aria-label={dictee.ecoute ? "Arrêter la dictée" : "Dicter la note"} aria-pressed={dictee.ecoute}
            className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${dictee.ecoute ? "k-anneau text-menthe" : "text-ardoise hover:bg-relief hover:text-encre"}`} style={{ background: "transparent" }}>
            {dictee.finalisation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          </button>
        ) : <span />}
        <button type="button" onClick={() => ajouter.mutate()} disabled={!pret}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-relief px-4 text-[14px] text-encre transition-colors hover:bg-rail-actif disabled:opacity-50">
          {ajouter.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Ajouter
        </button>
      </div>
    </div>
  );
}

/**
 * Les fiches liées. La croix délie (24 nov. 2026, Jules : « on doit pouvoir retirer un bien d'un agent, par exemple le
 * bien de Nazelles, cliquer sur une croix pour le délier d'Alexis ») : des deux côtés, et « Annuler » le relie.
 */
function Personnes({ cle, nom, liees, onOuvrir }) {
  const queryClient = useQueryClient();
  const rafraichir = (vers) => { for (const k of [["fiche-dossier", cle], ["fiche-dossier", vers]]) queryClient.invalidateQueries({ queryKey: k }); };
  const relier = useMutation({
    mutationFn: (avant) => base44.request("POST", "/api/fiche-dossier/relier", { body: { avant } }),
    onSuccess: (_, avant) => rafraichir(avant[0]?.vers),
    onError: (e) => toast.error(e?.message || "Le lien n'est pas revenu."),
  });
  const delier = useMutation({
    mutationFn: (l) => base44.request("POST", "/api/fiche-dossier/delier", { body: { de: cle, vers: l.cle } }),
    onSuccess: (r, l) => {
      rafraichir(l.cle);
      toast.success(`${l.nom} retiré de la fiche${nom ? ` ${/^[aeiouyhàâéèêîôû]/i.test(nom) ? "d'" : "de "}${nom}` : ""}.`, { action: { mot: "Annuler", faire: () => relier.mutate(r.avant || []) } });
    },
    onError: (e) => toast.error(e?.message || "Le lien n'a pas été retiré."),
  });
  return (
    <ul className="m-0 list-none divide-y divide-trait p-0">
      {liees.map((l) => (
        <li key={l.cle} className="group flex items-center gap-1">
          <button type="button" onClick={() => onOuvrir?.(l.cle)} className="grid min-w-0 flex-1 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left" style={{ background: "transparent" }}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-rail-actif text-[12px] text-craie">{l.genre === "bien" ? <Building2 className="h-3.5 w-3.5" /> : initiales(l.nom)}</span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] text-encre">{l.nom}</span>
              <span className="block truncate text-[12.5px] text-ardoise">{l.genre === "bien" ? (l.etape || "Dossier") : [l.genre === "agent" ? "Agent" : "Client", l.ressenti || l.resume].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="flex items-center gap-2 text-[12.5px] text-brume">{l.ressenti_le || l.maj_le ? dateJournal(l.ressenti_le || l.maj_le) : ""}<ArrowRight className="h-3.5 w-3.5 text-ardoise" /></span>
          </button>
          <button type="button" onClick={() => delier.mutate(l)} disabled={delier.isPending} aria-label={`Retirer ${l.nom} de cette fiche`} title="Retirer de cette fiche"
            className="grid h-8 w-8 flex-none place-items-center rounded-full text-brume opacity-0 transition-opacity hover:text-encre focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40 max-md:opacity-100" style={{ background: "transparent" }}>
            {delier.isPending && delier.variables?.cle === l.cle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
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
/**
 * La fiche remplie par l'import, à relire (22 nov. 2026, Jules : « l'analyste relit le résumé de ses fiches, corrige ce qui
 * est faux et clique OK ») : un OK pour toute la fiche, pas un par fait.
 */
function BandeauRelire({ cle, f }) {
  const queryClient = useQueryClient();
  const valider = useMutation({
    mutationFn: () => base44.request("POST", "/api/fiche-dossier/fiche/valider", { body: { cle } }),
    onSuccess: () => { for (const k of [["fiche-dossier", cle], ["fiche-dossier-a-relire"]]) queryClient.invalidateQueries({ queryKey: k }); toast.success("Fiche relue."); },
    onError: (e) => toast.error(e?.message || "La fiche n'a pas été validée."),
  });
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-trait px-4 py-3">
      <p className="m-0 min-w-0 flex-1 text-[14px] leading-[1.5] text-encre">
        Remplie par l'import{f.importees ? ` · ${f.importees} ligne${f.importees > 1 ? "s" : ""} à relire` : ""}
        <span className="block text-[13px] text-ardoise">{f.a_relire_par ? `Relecture : ${f.a_relire_par}. ` : ""}Corrige ce qui est faux dans une note liée, puis OK.</span>
      </p>
      <button type="button" onClick={() => valider.mutate()} disabled={valider.isPending}
        className="inline-flex h-9 flex-none items-center gap-2 rounded-full bg-menthe px-4 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
        {valider.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}OK, c'est relu
      </button>
    </div>
  );
}

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
          <span className="block text-[14px] tabular-nums text-ardoise">{dateJournal(j.le)}{j.origine ? ` · ${ORIGINE[j.origine.genre] || "import"}${j.origine.de ? `, ${j.origine.de.split(/\s+/)[0]}` : ""}` : j.par ? ` · ${j.par}` : ""}{j.importe && <span className="ml-1.5 rounded-full border border-trait px-1.5 py-px text-[11px] text-ardoise">importé</span>}</span>
          <span className={`mt-0.5 block text-[14.5px] leading-[1.45] text-encre transition-colors group-hover:text-menthe-texte ${ouvert ? "" : "line-clamp-2"}`}>{annotation}</span>
        </button>
        <Depliant ouvert={ouvert}>
          <div className="pt-2 text-left">
            <ul className="m-0 list-none space-y-1.5 p-0">
              {j.lignes.map((l, i) => (
                <li key={i} className="text-[13.5px] leading-[1.5] text-craie">
                  {l.genre === "decision" && <span className="mr-1.5 text-[11px] uppercase tracking-[.14em] text-menthe">Décision</span>}
                  {l.genre === "ressenti" && <span className="mr-1.5 text-[11px] uppercase tracking-[.14em] text-brume">Ressenti</span>}
                  {l.genre === "ecart" && <span className="mr-1.5 text-[11px] uppercase tracking-[.14em] text-craie">Écart</span>}
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
                {/* Fondu en CSS, pas de `layoutId` : voir les onglets des parties. */}
                <span aria-hidden className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-menthe transition-[opacity,transform] duration-200 ${actif ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0"}`} />
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
          <FicheVue key={`${active}-${vue.onglet || ""}`} ongletDepart={vue.onglet || null} cle={active} noteId={vue.note_id || null} nomDefaut={liens.find((l) => l.cle === active)?.nom || (active === vue.cle ? vue.nom : null) || null} crm={active === vue.cle ? vue.crm || null : null}
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
    const surFiche = (e) => { const cle = e?.detail?.cle; if (cle) setVue({ vue: "fiche", cle, nom: e.detail.nom || null, crm: e.detail.crm || null }); };
    // `{ fermer: true }` referme le panneau (20 nov. 2026 : la fiche d'appel arrive dans le chat seul).
    const surPanneau = (e) => { if (e?.detail?.fermer) setVue(null); else if (e?.detail) setVue(e.detail); };
    window.addEventListener("klocka:fiche-dossier", surFiche);
    window.addEventListener("klocka:panneau-note", surPanneau);
    return () => { window.removeEventListener("klocka:fiche-dossier", surFiche); window.removeEventListener("klocka:panneau-note", surPanneau); };
  }, []);
  return [vue, setVue];
}

/**
 * La fiche ouverte hors de l'écran scindé (la page de l'assistant, les fiches récentes, le CRM). Un écran qui cache
 * tout, fait du seul fond de la page (la base, le halo s'il est allumé, les points), et la fiche au milieu, au format
 * de celle d'à côté du chat ; un clic ailleurs la referme (20 nov. 2026, Jules). Au téléphone, plein écran sur `barre`.
 */
export function PanneauFlottant({ vue, setVue }) {
  // Le halo de la page (Layout, FondHalo) : repris seulement s'il est posé, sinon le fond uni du thème.
  const [halo, setHalo] = useState(false);
  useEffect(() => { if (vue) setHalo(!!document.querySelector(".k-fond-halo")); }, [vue]);
  return createPortal(
    <AnimatePresence>
      {vue && (
        <motion.div key="ecran" data-crm-dehors className="fixed inset-0 z-[84] flex items-center justify-center bg-fond"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} onClick={() => setVue(null)}>
          {halo && <FondHalo />}
          <div aria-hidden className="k-points pointer-events-none absolute inset-0" data-zone="fond" style={{ "--k-grid-marge": "0px" }} />
          <motion.aside role="dialog" aria-label="Fiche" onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 14, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.985 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="k-fiche-fond relative z-10 flex h-full w-full flex-col overflow-hidden max-md:!bg-barre max-md:pt-[env(safe-area-inset-top)] md:h-[calc(100dvh-48px)] md:w-[clamp(460px,42vw,640px)] md:rounded-[16px] md:border md:border-trait">
            <PanneauNote vue={vue} onVue={setVue} onFermer={() => setVue(null)} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * La fiche à droite de la page (22 nov. 2026, Jules : « lorsqu'on clique sur un nom, on doit voir à droite la fiche de
 * l'agent ») : la page reste visible à gauche ; un clic à côté, Échap ou la croix la ferment.
 */
export function PanneauDroite({ vue, setVue }) {
  return createPortal(
    <AnimatePresence>
      {vue && (
        <motion.div key="droite" data-crm-dehors className="fixed inset-0 z-[84]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <div aria-hidden className="absolute inset-0 bg-fond/40" onClick={() => setVue(null)} />
          <motion.aside role="dialog" aria-label="Fiche" initial={{ x: 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="k-fiche-fond absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden border-l border-trait shadow-[0_0_40px_-12px_rgb(0_0_0/0.5)] max-md:!bg-barre max-md:pt-[env(safe-area-inset-top)] md:w-[clamp(440px,38vw,600px)]">
            <PanneauNote vue={vue} onVue={setVue} onFermer={() => setVue(null)} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Pour les pages sans écran scindé (le CRM, Statistiques) : la fiche ouverte par ouvrirFiche ou ouvrirPanneau ; au centre, ou à droite. */
export function FicheDossierHote({ cote = "centre" }) {
  const [vue, setVue] = usePanneau();
  useEffect(() => {
    if (!vue) return undefined;
    const echap = (e) => { if (e.key === "Escape") setVue(null); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [vue, setVue]);
  return cote === "droite" ? <PanneauDroite vue={vue} setVue={setVue} /> : <PanneauFlottant vue={vue} setVue={setVue} />;
}
