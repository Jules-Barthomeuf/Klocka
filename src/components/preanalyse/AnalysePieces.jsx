import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import MiniaturePiece from "@/components/preanalyse/MiniaturePiece";
import TexteEnPlace from "@/components/ui/texte-en-place";
import NoteCellule, { useNotesTableaux } from "@/components/preanalyse/NoteCellule";
import { SourceSeule, Visionneuse } from "@/components/preanalyse/AnalyseDocuments";

// L'analyse pièce par pièce (29 oct. 2026, Jules) : les pièces se déposent dans la Data Room, une zone par
// type (DepotsDossier.jsx) ; les onglets Bail, Quittances, Copropriété et
// Diagnostics montrent les grilles case par case. Un clic sur une case ouvre à droite la pièce à la
// page, le passage surligné, et ce que l'analyste peut faire de la case. Voir server/deal/analyse-pieces.js.

const cle = (dealId) => ["analyse-pieces", dealId];

export function useAnalysePieces(dealId, { enabled = true } = {}) {
  return useQuery({
    queryKey: cle(dealId),
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/analyse-pieces`),
    enabled: !!dealId && enabled,
    // Tant qu'une pièce se lit, l'écran se met à jour seul.
    refetchInterval: (q) => (q.state.data?.en_lecture ? 3000 : false),
    staleTime: 30 * 1000,
  });
}

export function useGeste(dealId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chemin, corps, form }) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dealId}/analyse-pieces/${chemin}`, form ? { body: form, isForm: true } : { body: corps || {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cle(dealId) });
      queryClient.invalidateQueries({ queryKey: ["bien-analyse", dealId] });
      queryClient.invalidateQueries({ queryKey: ["versions-dossier", dealId] });
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
}

/**
 * Retour et Avant d'un dossier (29 oct. 2026, Jules) : à droite de « Tous les dossiers », ils défont et refont les
 * versions du dossier (chaque geste sur une case du tableau), comme Annuler et Rétablir ; ⌘Z et ⇧⌘Z aussi.
 */
export function FlechesVersions({ dealId }) {
  const q = useQuery({
    queryKey: ["versions-dossier", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/analyse-pieces/versions`),
    enabled: !!dealId,
  });
  const geste = useGeste(dealId);
  const n = q.data || { annuler: 0, retablir: 0 };
  const changer = (sens) => { if (!geste.isPending && n[sens]) geste.mutate({ chemin: `versions/${sens}` }); };
  useEffect(() => {
    const touche = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const cible = e.target;
      if (cible?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible?.tagName)) return;
      e.preventDefault();
      changer(e.shiftKey ? "retablir" : "annuler");
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  });
  const rond = "grid h-8 w-8 place-items-center rounded-full border border-trait text-ardoise transition-colors hover:border-bord-doux hover:text-encre disabled:pointer-events-none disabled:opacity-35";
  return (
    <div className="flex flex-none items-center gap-1.5">
      <button type="button" onClick={() => changer("annuler")} disabled={!n.annuler || geste.isPending} aria-label="Version précédente" title="Version précédente (⌘Z)" className={rond} style={{ background: "transparent" }}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => changer("retablir")} disabled={!n.retablir || geste.isPending} aria-label="Version suivante" title="Version suivante (⇧⌘Z)" className={rond} style={{ background: "transparent" }}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// --- Une case modifiable et son état à trois choix (29 oct. 2026, Jules : « tout dans le tableau doit être modifiable ;
// l'état change en modifié par Nora ; il y en a trois, lue par l'IA, modifié par et OK »). Partagé par les grilles et
// l'onglet Bien (TableauBienAnalyse.jsx).
export const prenom = (email) => { const t = String(email || "").split("@")[0].split(/[._-]/)[0]; return t ? t[0].toUpperCase() + t.slice(1) : "l'équipe"; };

/** La valeur d'une case : on écrit directement dedans (29 oct. 2026, Jules), Entrée ou quitter la case enregistre. */
export function ValeurModifiable({ valeur, vide = "Non trouvé", onEnregistrer, occupe = false, apres = null, bande = null }) {
  return (
    <div className={`min-w-0 ${bande ? "relative pr-5" : ""}`}>
      <TexteEnPlace valeur={valeur || ""} placeholder={vide} onEnregistrer={(t) => { if (t) onEnregistrer(t); }}
        className="whitespace-pre-line text-[14.5px] leading-[1.5] text-encre placeholder:text-encre max-md:text-[16px]" />
      {apres}
      {bande}
    </div>
  );
}

/**
 * L'état d'une case, deux seulement (29 oct. 2026, Jules) : grise « Lu par l'IA », verte « OK ». Une valeur modifiée
 * passe en OK ; un clic sur la case fait passer de l'un à l'autre, sans menu. Toute la case prend la couleur (jeton
 * fixe `vert`, qui ne suit pas l'accent choisi dans Compte). Une case sans valeur ne tourne pas ; une case « corrigée »
 * d'avant se lit OK. `defaut` : le mot et la teinte d'une case sans valeur (Non trouvé, Pièce absente).
 */
export const SUIVANT = { ia: "verifie", corrige: "ia", verifie: "ia" };
export function EtatTrois({ etat, par, valeur, defaut, onChoix, occupe = false }) {
  const tourne = ["ia", "corrige", "verifie"].includes(etat) && !!valeur;
  const [mot, classe] = etat === "verifie" || etat === "corrige" ? ["OK", "bg-vert/15 text-vert"]
    : etat === "ia" ? ["Lu par l'IA", "bg-rail-actif text-encre"]
    : [defaut[0], String(defaut[1] || "").split(" ").filter((c) => !c.startsWith("bg-")).join(" ")];
  const suivant = () => { if (tourne && !occupe) onChoix(SUIVANT[etat]); };
  return (
    <div role={tourne ? "button" : undefined} tabIndex={tourne ? 0 : undefined} aria-disabled={occupe || undefined}
      title={tourne ? `Cliquer : ${SUIVANT[etat] === "ia" ? "Lu par l'IA" : "OK"}` : undefined}
      onClick={(e) => { e.stopPropagation(); suivant(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); suivant(); } }}
      className={`select-none text-[13px] transition-colors max-lg:rounded-[10px] max-lg:px-3 max-lg:py-2 ${tourne ? "cursor-pointer hover:brightness-110" : ""} ${occupe ? "opacity-70" : ""} ${classe}`}>
      {mot}
    </div>
  );
}

/**
 * La case du nom de la ligne porte l'état (30 oct. 2026, Jules : « gris si c'est lu par l'IA, vert si c'est vérifié,
 * on clique et c'est simple ») : toute la case en sable `lu-ia/25` (lu par l'IA) ou `vert/15` (vérifié), un clic fait passer
 * de l'un à l'autre ; sans valeur, la case reste neutre et ne se clique pas. La source s'ouvre par sa vignette.
 */
export function CaseNom({ libelle, etat, par, valeur, onChoix, occupe = false }) {
  const tourne = !!valeur && ["ia", "corrige", "verifie"].includes(etat);
  const ok = etat === "verifie" || etat === "corrige";
  const mot = !tourne ? null : ok ? `Vérifié${par ? ` par ${prenom(par)}` : ""} · cliquer pour revenir à « lu par l'IA »` : "Lu par l'IA · cliquer quand c'est vérifié";
  return (
    <button type="button" disabled={!tourne || occupe} title={mot || undefined} aria-pressed={tourne ? ok : undefined}
      onClick={(e) => { e.stopPropagation(); if (tourne) onChoix(SUIVANT[etat]); }}
      className={`m-0 select-none text-left text-[14.5px] transition-colors max-lg:rounded-[10px] max-lg:px-3 max-lg:py-2 disabled:cursor-default ${!tourne ? "text-craie" : ok ? "bg-vert/15 text-craie hover:bg-vert/25" : "bg-lu-ia/25 text-craie hover:bg-lu-ia/35"}`}
      style={tourne ? undefined : { background: "transparent" }}>
      {libelle}
    </button>
  );
}

/** Le geste d'un choix d'état ou d'une saisie, en appel à la case. */
// Revenir à OK remet la valeur saisie à la main s'il y en a une ; modifier une valeur la met en OK (`main`).
export const corpsDuChoix = (id, valeur, valeurMain = null) => (id === "ia" ? { action: "reinitialiser" } : { action: "verifier", valeur: valeurMain || valeur });
export const corpsDeLaSaisie = (valeur) => ({ action: "verifier", valeur, main: true });

const date = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const qui = (email) => (email ? email.split("@")[0] : "l'équipe");

// --- Les grilles d'un onglet ------------------------------------------------------------------------------
export const ETAT = {
  ia: ["Lu par l'IA", "bg-rail-actif text-encre", true],
  verifie: ["Vérifiée", "text-menthe", false],
  corrige: ["Corrigée", "text-menthe", false],
  introuvable: ["Introuvable", "text-encre", false],
  manquant: ["Pièce absente", "text-encre", false],
  lecture: ["Lecture…", "text-encre", false],
  non_lu: ["Pas encore lue", "text-encre", false],
};
// La colonne Notes, en dernier (29 oct. 2026, Jules : « une nouvelle colonne dans les tableaux », pas un onglet).
export const COLONNES = "grid-cols-[minmax(150px,0.9fr)_minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]";
// Des traits verticaux entre les colonnes (29 oct. 2026, Jules) ; au téléphone, une colonne, sans trait.
// Le remplissage est dans les cellules, pas dans la ligne : les traits courent d'une ligne à l'autre sans coupure.
// Des traits un peu plus marqués que le filet courant (29 oct. 2026, Jules) : `bord-doux`.
export const CELLULES = "px-2 max-lg:gap-y-1.5 lg:px-0 lg:py-0 lg:divide-x lg:divide-bord-doux lg:[&>*]:px-3.5";
// La source se nomme par sa pièce, pas par son fichier (« Bail p. 4 », pas « doc0165…pdf »).
const TYPE_COURT = { bail: "Bail", avenants: "Avenant", quittances: "Quittance", pv_ag: "PV d'AG", rcp: "Règlement", diagnostics: "Diagnostic", taxe_fonciere: "Taxe foncière", kbis: "Kbis" };

/**
 * Les sources d'une case (29 oct. 2026, Jules) : la vraie vignette de chaque pièce, toujours à la même taille, et le
 * nom de celle de devant à sa droite avec la page (« Bail commercial · page 4 »). Plusieurs sources s'empilent l'une
 * derrière l'autre ; survoler une vignette la met devant et montre son nom. Un clic ouvre la page et son passage.
 */
const VIGNETTE = 40;
const DECALAGE = 12;
function SourcesEmpilees({ sources, retenue, onOuvrir }) {
  const depart = Math.max(0, sources.findIndex((s) => s.document_id === retenue));
  const [devant, setDevant] = useState(depart);
  useEffect(() => { setDevant(depart); }, [depart, sources.length]);
  if (!sources.length) return <div />;
  const s = sources[Math.min(devant, sources.length - 1)];
  const titre = s.document_titre || TYPE_COURT[s.type] || "Pièce";
  return (
    <div className="flex min-w-0 items-center gap-3" onMouseLeave={() => setDevant(depart)}>
      <div className="relative flex-none" style={{ width: VIGNETTE + DECALAGE * (sources.length - 1), height: Math.round(VIGNETTE * 1.3) + 4 * (sources.length - 1) }}>
        {sources.map((x, i) => (
          <button key={x.document_id} type="button" onMouseEnter={() => setDevant(i)} onFocus={() => setDevant(i)}
            onClick={(ev) => { ev.stopPropagation(); onOuvrir(x); }} aria-label={`Ouvrir ${x.document_titre || "la pièce"}${x.page ? `, page ${x.page}` : ""}`}
            className="absolute top-0 transition-transform duration-150 hover:-translate-y-0.5" style={{ left: i * DECALAGE, top: i * 4, zIndex: i === devant ? 10 : sources.length - i, background: "transparent" }}>
            <MiniaturePiece url={x.document_url} largeur={VIGNETTE} className={x.verifiee === false ? "ring-1 ring-ambre" : ""} />
          </button>
        ))}
      </div>
      <button type="button" onClick={(ev) => { ev.stopPropagation(); onOuvrir(s); }} className="min-w-0 text-left text-[13px] leading-[1.35] text-encre hover:opacity-80" style={{ background: "transparent" }}>
        <span className="line-clamp-2">{titre}{s.page ? <span className="text-craie"> · page {s.page}</span> : null}</span>
      </button>
    </div>
  );
}

// La note de l'IA (30 oct. 2026, Jules) : ce que la règle ou la relecture signale ne s'écrit plus en orange sous la
// valeur ; il passe dans la colonne Notes. Elle ne se montre que sur une ligne lue par l'IA (sable) : dès que la ligne
// est verte (vérifiée, ou valeur modifiée), elle disparaît ; revenue en sable, elle revient (30 oct. 2026, Jules).
const noteIA = (l) => (["verifie", "corrige"].includes(l.statut) ? null : [
  l.alerte?.motif,
  l.a_choisir ? "Les pièces ne disent pas la même chose : choisissez celle à retenir." : null,
  l.relue ? `La relecture lit autre chose : « ${String(l.relue).slice(0, 80)} ».` : null,
].filter(Boolean).join(" ") || null);

export function GrillesPieces({ dossier, onglet, apercu = false }) {
  const dealId = dossier?.deal_id;
  const { data, isLoading, isError } = useAnalysePieces(dealId, { enabled: !apercu });
  const geste = useGeste(dealId);
  const [ouverte, setOuverte] = useState(null);
  const notes = useNotesTableaux(dealId);

  if (apercu) return <p className="m-0 py-8 text-[13.5px] text-brume">Les grilles se lisent sur un vrai dossier.</p>;
  if (isLoading) return <Chargement titre="Les grilles" etats={["Les pièces rangées", "Les valeurs relevées", "Les écarts"]} />;
  if (isError || !data) return <p className="m-0 py-8 text-[13.5px] text-alerte">Les grilles ne se chargent pas. Rechargez la page.</p>;

  const grilles = data.grilles.filter((g) => g.onglet === onglet);
  // La case ouverte suit les données : après un geste, le panneau montre l'état nouveau.
  const caseOuverte = ouverte?.case ? grilles.find((g) => g.id === ouverte.case.grille)?.lignes.find((l) => l.id === ouverte.case.id) : null;



  return (
    <div className="space-y-8">
      {grilles.map((g) => (
        <section key={g.id}>
          {/* Le nom de la grille dans la case vide en haut à gauche du tableau (29 oct. 2026, Jules) ; au téléphone, où
              la ligne d'en-tête n'existe pas, il reste au-dessus. */}
          <div className="flex flex-col items-center gap-1 px-2 pb-4 text-center lg:hidden">
            <p className="m-0 text-[20px] leading-[1.2] tracking-[-0.01em] text-encre">{g.titre}</p>
          </div>
          {/* Tout le tableau a ses lignes (29 oct. 2026, Jules) : le cadre ferme à droite et en bas. Sans pièce, le
              tableau est flouté, seule la case de son nom reste nette, et le message est posé dessus (Jules, même jour). */}
          <div className="relative overflow-hidden lg:rounded-[14px] lg:border lg:border-bord-doux">
          <div className={`grid ${COLONNES} ${CELLULES} border-t border-bord-doux py-3 lg:border-t-0 text-[13.5px] text-craie max-lg:hidden lg:[&>*]:py-3.5 ${g.pieces.length ? "" : "[&>*:not(:first-child)]:blur-[3px]"}`}>
            <span className="text-[15px] font-medium leading-[1.3] tracking-[-0.01em] text-encre">{g.titre}</span><span>Valeur</span><span>Source</span><span>Notes</span>
          </div>
          {!g.pieces.length && (
            <div className="absolute inset-x-0 bottom-0 top-0 z-10 grid place-items-center lg:top-[46px]">
              <p className="m-0 rounded-full border border-bord-doux bg-fond/80 px-4 py-2 text-[13.5px] text-encre shadow-[0_8px_24px_rgb(0_0_0/0.25)]">Aucune pièce : déposez-la dans la Data Room.</p>
            </div>
          )}
          <div className={g.pieces.length ? "" : "pointer-events-none select-none blur-[3px]"} aria-hidden={g.pieces.length ? undefined : true}>
          {g.lignes.map((l) => {
            const choisie = ouverte?.case?.grille === g.id && ouverte?.case?.id === l.id;
            return (
              <div key={l.id}
                className={`group/ligne grid ${COLONNES} ${CELLULES} border-t border-bord-doux py-3.5 transition-colors lg:[&>*]:py-3.5 hover:bg-encre/[0.02] max-lg:grid-cols-1 max-lg:gap-y-1.5 ${choisie ? "bg-menthe/[0.06]" : ""}`}>
                {/* Le libellé ouvre la source ; la valeur se modifie ; l'état se choisit (29 oct. 2026, Jules). */}
                <CaseNom libelle={l.libelle} etat={l.statut} par={l.par} valeur={l.valeur} occupe={geste.isPending}
                  onChoix={(id) => geste.mutate({ chemin: `cases/${g.id}/${l.id}`, corps: corpsDuChoix(id, l.valeur, l.valeur_main) })} />
                <ValeurModifiable valeur={l.valeur} occupe={geste.isPending}
                  vide={l.statut === "manquant" ? "Pas encore de pièce" : l.statut === "lecture" ? "En cours de lecture" : l.statut === "non_lu" ? "Pièce pas encore lue" : "Non trouvé dans les pièces"}
                  onEnregistrer={(t) => geste.mutate({ chemin: `cases/${g.id}/${l.id}`, corps: corpsDeLaSaisie(t) })} />
                <SourcesEmpilees sources={l.sources.slice(0, 3)} retenue={l.retenue}
                  onOuvrir={(s) => setOuverte({ seul: true, doc: { id: s.document_id, nom: s.document_nom, url: s.document_url, mime: s.mime }, page: s.page, citation: s.citation })} />
                <div className="min-w-0"><NoteCellule dealId={dealId} tableau={`pieces-${g.id}`} ligne={l.id} note={notes[`pieces-${g.id}.${l.id}`]} noteIA={noteIA(l)} /></div>
              </div>
            );
          })}
          </div>
          </div>
        </section>
      ))}
      {ouverte && <PanneauPiece dealId={dealId} ouverte={ouverte} caseOuverte={caseOuverte} onChange={setOuverte} onFermer={() => setOuverte(null)} />}
    </div>
  );
}

function docDe(data, id) {
  const d = [...data.a_ranger, ...data.emplacements.flatMap((e) => e.documents)].find((x) => x.id === id);
  return d ? { id: d.id, nom: d.nom, url: d.url, mime: d.mime } : null;
}

// --- Le panneau de droite : la case, la pièce surlignée, une question libre ---------------------------------
function PanneauPiece({ dealId, ouverte, caseOuverte = null, onChange, onFermer }) {
  // Échap ferme, et un clic ailleurs dans la page aussi (29 oct. 2026, Jules) ; un clic sur une autre source
  // ferme celle-ci et ouvre l'autre.
  const zone = useRef(null);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    const ailleurs = (e) => { if (zone.current && !zone.current.contains(e.target) && !e.target.closest?.("[role=dialog], [data-sonner-toaster]")) onFermer(); };
    window.addEventListener("keydown", k);
    document.addEventListener("pointerdown", ailleurs);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("pointerdown", ailleurs); };
  }, [onFermer]);
  const doc = ouverte.doc;
  // Un clic sur une source : la page et son passage surligné, rien d'autre (29 oct. 2026, Jules).
  if (ouverte.seul && doc) {
    return createPortal(
      <div ref={zone} className="animate-in slide-in-from-right duration-300 ease-out fixed inset-y-0 right-0 z-[60] flex w-full flex-col border-l border-bord bg-fond shadow-[-24px_0_60px_rgba(0,0,0,.6)] sm:w-[760px]">
        <button type="button" onClick={onFermer} className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-surface-pleine/90 text-ardoise shadow-[0_6px_18px_rgb(0_0_0/0.18)] hover:text-encre max-md:top-[max(12px,env(safe-area-inset-top))]" aria-label="Fermer" title="Fermer (Échap)"><X className="h-4 w-4" /></button>
        <SourceSeule dealId={dealId} doc={doc} page={ouverte.page} citation={ouverte.citation} />
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div ref={zone} className="animate-in slide-in-from-right duration-300 ease-out fixed inset-y-0 right-0 z-[60] flex w-full flex-col gap-3 overflow-y-auto overscroll-contain border-l border-bord bg-fond p-4 shadow-[-24px_0_60px_rgba(0,0,0,.6)] sm:w-[760px] max-md:p-3 max-md:pt-[max(12px,env(safe-area-inset-top))]">
      {caseOuverte && ouverte.case && <EditeurCase dealId={dealId} grille={ouverte.case} l={caseOuverte} docOuvert={doc?.id} onSource={(s) => onChange({ ...ouverte, doc: { id: s.document_id, nom: s.document_nom, url: s.document_url, mime: s.mime }, page: s.page, citation: s.citation })} onFermer={onFermer} />}
      {doc ? (
        <>
          <Visionneuse key={`${doc.id}:${ouverte.page}:${ouverte.citation}`} dealId={dealId} hauteur="min-h-[420px] flex-1"
            extraction={{ document_id: doc.id, document_url: doc.url, document_mime: doc.mime || null, document_nom: doc.nom }}
            ligne={{ page: ouverte.page, citation: ouverte.citation, element: ouverte.libelle }} onFermer={onFermer} />
        </>
      ) : (
        <p className="m-0 py-6 text-center text-[13.5px] text-brume">Aucune pièce pour cette grille : déposez-la dans la Data Room.</p>
      )}
    </div>,
    document.body,
  );
}

function EditeurCase({ dealId, grille, l, docOuvert, onSource, onFermer }) {
  const geste = useGeste(dealId);
  const [texte, setTexte] = useState(l.valeur || "");
  const [note, setNote] = useState(l.note || "");
  useEffect(() => { setTexte(l.valeur || ""); setNote(l.note || ""); }, [l.cle, l.valeur, l.note]);
  const chemin = `cases/${grille.grille}/${l.id}`;
  const change = texte.trim() !== String(l.valeur || "").trim();
  const decide = ["verifie", "corrige", "introuvable"].includes(l.statut) || !!l.introuvable_par;
  const envoyer = (corps, message) => geste.mutate({ chemin, corps }, { onSuccess: () => message && toast.success(message) });

  return (
    <div className="rounded-[14px] border border-trait bg-rail p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">{grille.titre}</p>
          <p className="m-0 mt-0.5 text-[16px] text-encre">{l.libelle}</p>
          <p className="m-0 mt-0.5 text-[12.5px] leading-[1.45] text-brume">{l.format}</p>
        </div>
        <button type="button" onClick={onFermer} className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }} aria-label="Fermer" title="Fermer (Échap)"><X className="h-4 w-4" /></button>
      </div>

      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={Math.min(6, Math.max(2, texte.split("\n").length))} placeholder="La valeur, telle que vous la retenez"
        className="mt-3 w-full resize-y rounded-[10px] border border-trait bg-surface px-3 py-2 text-[14px] leading-[1.5] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
      {l.alerte && <p className="m-0 mt-1 text-[13px] text-ambre">{l.alerte.motif}</p>}
      {l.relue && <p className="m-0 mt-1 text-[12.5px] text-ambre">La relecture lit : « {l.relue} ». Votre valeur reste ; « Revenir à la lecture » la remplace.</p>}
      {decide && <p className="m-0 mt-1 text-[12.5px] text-brume">{ETAT[l.statut]?.[0] || "Décidée"} par {qui(l.par || l.introuvable_par)}{l.le ? ` le ${date(l.le)}` : ""} : aucune relecture ne la change.</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={geste.isPending || !texte.trim()} onClick={() => envoyer({ action: change ? "corriger" : "verifier", valeur: texte }, change ? "Correction enregistrée" : "Case vérifiée")}
          className="inline-flex h-9 items-center rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          {change ? "Enregistrer la correction" : "C'est juste"}
        </button>
        <button type="button" disabled={geste.isPending} onClick={() => envoyer({ action: "introuvable" }, "Notée introuvable")}
          className="inline-flex h-9 items-center rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>Introuvable</button>
        <button type="button" disabled={geste.isPending} onClick={() => geste.mutate({ chemin: `${chemin}/relire` }, { onSuccess: () => toast.success("Relecture lancée sur les pièces de cette grille") })}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }} title="Relit ce seul critère ; votre décision, s'il y en a une, reste"><RefreshCw className="h-3.5 w-3.5" /> Relire</button>
        {decide && <button type="button" disabled={geste.isPending} onClick={() => envoyer({ action: "reinitialiser" }, "Retour à la lecture")} className="ml-auto text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Revenir à la lecture</button>}
      </div>

      {l.sources.length > 0 && (
        <div className="mt-4">
          <p className="m-0 mb-1 text-[11px] uppercase tracking-[.16em] text-brume">Ce que disent les pièces</p>
          <ul className="m-0 list-none p-0">
            {l.sources.map((s) => (
              <li key={s.document_id} className={`flex items-start gap-3 border-t border-trait py-2 first:border-t-0 ${docOuvert === s.document_id ? "" : "opacity-90"}`}>
                <button type="button" onClick={() => onSource(s)} className="min-w-0 flex-1 text-left" style={{ background: "transparent" }}>
                  <span className="block text-[12.5px] text-brume">
                    {s.document_nom}{s.page ? ` · page ${s.page}` : ""}
                    {s.verifiee === true && <span className="text-menthe"> · passage retrouvé</span>}
                    {s.verifiee === false && <span className="text-ambre"> · passage non retrouvé mot pour mot</span>}
                  </span>
                  <span className="block whitespace-pre-line text-[13.5px] text-craie hover:text-encre">{s.valeur}</span>
                </button>
                {l.sources.length > 1 && (s.document_id === l.retenue
                  ? <span className="flex-none text-[12px] text-menthe">Retenue</span>
                  : <button type="button" onClick={() => envoyer({ action: "retenir", source: s.document_id })} className="flex-none text-[12px] text-ardoise hover:text-menthe" style={{ background: "transparent" }}>Retenir</button>)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note.trim() !== (l.note || "") && envoyer({ action: "noter", note })} placeholder="Une note sur cette ligne"
        className="mt-3 h-9 w-full rounded-[10px] border border-trait bg-transparent px-3 text-[13.5px] text-craie outline-none focus:border-menthe max-md:text-[16px]" />
    </div>
  );
}
