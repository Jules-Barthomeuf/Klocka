import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { RefreshCw, X } from "lucide-react";
import { useAuthPeutEtre } from "@/lib/AuthContext";
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: cle(dealId) }); queryClient.invalidateQueries({ queryKey: ["bien-analyse", dealId] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
}

// --- Une case modifiable et son état à trois choix (29 oct. 2026, Jules : « tout dans le tableau doit être modifiable ;
// l'état change en modifié par Nora ; il y en a trois, lue par l'IA, modifié par et OK »). Partagé par les grilles et
// l'onglet Bien (TableauBienAnalyse.jsx).
export const prenom = (email) => { const t = String(email || "").split("@")[0].split(/[._-]/)[0]; return t ? t[0].toUpperCase() + t.slice(1) : "l'équipe"; };

/** La valeur d'une case : un clic l'ouvre en saisie ; Entrée enregistre, Maj+Entrée va à la ligne, Échap annule. */
export function ValeurModifiable({ valeur, vide = "Non trouvé", onEnregistrer, occupe = false, apres = null }) {
  const [texte, setTexte] = useState(null);
  const enregistrer = () => { const t = (texte || "").trim(); setTexte(null); if (t && t !== String(valeur || "").trim()) onEnregistrer(t); };
  if (texte != null) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <textarea autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={enregistrer} rows={Math.min(6, Math.max(2, texte.split("\n").length))}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enregistrer(); } if (e.key === "Escape") setTexte(null); }}
          className="w-full resize-y rounded-[10px] border border-menthe bg-surface px-3 py-2 text-[14px] leading-[1.5] text-encre outline-none max-md:text-[16px]" />
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <button type="button" disabled={occupe} onClick={(e) => { e.stopPropagation(); setTexte(valeur || ""); }} title="Cliquer pour modifier"
        className="-mx-1.5 -my-1 block w-[calc(100%+12px)] rounded-[8px] px-1.5 py-1 text-left transition-colors hover:bg-encre/[0.05]" style={{ background: "transparent" }}>
        {valeur ? <span className="block whitespace-pre-line text-[14.5px] leading-[1.5] text-encre">{valeur}</span> : <span className="text-[14.5px] text-ardoise">{vide}</span>}
      </button>
      {apres}
    </div>
  );
}

/**
 * L'état d'une case : un clic le fait tourner, sans menu (29 oct. 2026, Jules) : Lu par l'IA, puis Modifié par, puis
 * OK, puis Lu par l'IA. Toute la case prend la couleur : grise lue par l'IA, jaune modifiée, verte OK (jetons fixes
 * `vert` et `jaune`, qui ne suivent pas l'accent choisi dans Compte). Une case sans valeur ne tourne pas.
 * `defaut` : le mot et la teinte d'une case sans valeur (Non trouvé, Pièce absente).
 */
export const SUIVANT = { ia: "corrige", corrige: "verifie", verifie: "ia" };
export function EtatTrois({ etat, par, valeur, defaut, onChoix, occupe = false }) {
  const auth = useAuthPeutEtre();
  const tourne = ["ia", "corrige", "verifie"].includes(etat) && !!valeur;
  const [mot, classe] = etat === "corrige" ? [`Modifié par ${prenom(par || auth?.user?.email)}`, "bg-jaune/15 text-jaune"]
    : etat === "verifie" ? ["OK", "bg-vert/15 text-vert"]
    : etat === "ia" ? ["Lu par l'IA", "bg-rail-actif text-craie"]
    : [defaut[0], String(defaut[1] || "").split(" ").filter((c) => !c.startsWith("bg-")).join(" ")];
  const suivant = () => { if (tourne && !occupe) onChoix(SUIVANT[etat]); };
  return (
    <div role={tourne ? "button" : undefined} tabIndex={tourne ? 0 : undefined} aria-disabled={occupe || undefined}
      title={tourne ? `Cliquer : ${{ corrige: "Modifié par", verifie: "OK", ia: "Lu par l'IA" }[SUIVANT[etat]]}` : undefined}
      onClick={(e) => { e.stopPropagation(); suivant(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); suivant(); } }}
      className={`select-none text-[13px] transition-colors max-lg:rounded-[10px] max-lg:px-3 max-lg:py-2 ${tourne ? "cursor-pointer hover:brightness-110" : ""} ${occupe ? "opacity-70" : ""} ${classe}`}>
      {mot}
    </div>
  );
}

/** Le geste d'un choix d'état ou d'une saisie, en appel à la case. */
export const corpsDuChoix = (id, valeur, valeurMain = null) => (id === "ia" ? { action: "reinitialiser" } : id === "corrige" ? { action: "corriger", valeur: valeurMain || valeur } : { action: "verifier", valeur });

const date = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const qui = (email) => (email ? email.split("@")[0] : "l'équipe");

// --- Les grilles d'un onglet ------------------------------------------------------------------------------
const ETAT = {
  ia: ["Lu par l'IA", "bg-rail-actif text-craie", true],
  verifie: ["Vérifiée", "text-menthe", false],
  corrige: ["Corrigée", "text-menthe", false],
  introuvable: ["Introuvable", "text-brume", false],
  manquant: ["Pièce absente", "text-brume", false],
  lecture: ["Lecture…", "text-brume", false],
  non_lu: ["Pas encore lue", "text-brume", false],
};
const COLONNES = "grid-cols-[minmax(150px,0.9fr)_minmax(0,2.4fr)_minmax(0,1.2fr)_120px]";
// Des traits verticaux entre les colonnes (29 oct. 2026, Jules) ; au téléphone, une colonne, sans trait.
// Le remplissage est dans les cellules, pas dans la ligne : les traits courent d'une ligne à l'autre sans coupure.
const CELLULES = "px-2 max-lg:gap-y-1.5 lg:border-l lg:border-trait lg:px-0 lg:py-0 lg:divide-x lg:divide-trait lg:[&>*]:px-4";
// La source se nomme par sa pièce, pas par son fichier (« Bail p. 4 », pas « doc0165…pdf »).
const TYPE_COURT = { bail: "Bail", avenants: "Avenant", quittances: "Quittance", pv_ag: "PV d'AG", rcp: "Règlement", diagnostics: "Diagnostic", taxe_fonciere: "Taxe foncière", kbis: "Kbis" };

export function GrillesPieces({ dossier, onglet, apercu = false }) {
  const dealId = dossier?.deal_id;
  const { data, isLoading, isError } = useAnalysePieces(dealId, { enabled: !apercu });
  const geste = useGeste(dealId);
  const [ouverte, setOuverte] = useState(null);

  if (apercu) return <p className="m-0 py-8 text-[13.5px] text-brume">Les grilles se lisent sur un vrai dossier.</p>;
  if (isLoading) return <Chargement titre="Les grilles" etats={["Les pièces rangées", "Les valeurs relevées", "Les écarts"]} />;
  if (isError || !data) return <p className="m-0 py-8 text-[13.5px] text-alerte">Les grilles ne se chargent pas. Rechargez la page.</p>;

  const grilles = data.grilles.filter((g) => g.onglet === onglet);
  // La case ouverte suit les données : après un geste, le panneau montre l'état nouveau.
  const caseOuverte = ouverte?.case ? grilles.find((g) => g.id === ouverte.case.grille)?.lignes.find((l) => l.id === ouverte.case.id) : null;

  const ouvrirCase = (g, l, source = null) => {
    const s = source || l.sources.find((x) => x.document_id === l.retenue) || l.sources[0] || null;
    const doc = s ? { id: s.document_id, nom: s.document_nom, url: s.document_url, mime: s.mime } : g.pieces[0] ? docDe(data, g.pieces[0].id) : null;
    // Comme une source : la page et son passage surligné, rien d'autre (29 oct. 2026, Jules). Sans pièce, rien à ouvrir.
    // L'éditeur de la case (EditeurCase, plus bas) ne s'ouvre plus d'ici : vérifier et corriger attendent leur place.
    if (!doc) return;
    setOuverte({ seul: true, case: { grille: g.id, id: l.id, titre: g.titre }, doc, page: s?.page || null, citation: s?.citation || null, libelle: l.libelle });
  };

  return (
    <div className="space-y-8">
      {grilles.map((g) => (
        <section key={g.id}>
          <div className="flex flex-wrap items-baseline gap-x-3 px-2 pb-2">
            <p className="m-0 text-[15px] text-encre">{g.titre}</p>
            {!g.pieces.length && <p className="m-0 text-[12.5px] text-brume">Aucune pièce : déposez-la dans la Data Room.</p>}
          </div>
          {/* Tout le tableau a ses lignes (29 oct. 2026, Jules) : le cadre ferme à droite et en bas. */}
          <div className="lg:border-b lg:border-r lg:border-trait">
          <div className={`grid ${COLONNES} ${CELLULES} border-t border-trait py-3 text-[13px] text-ardoise max-lg:hidden lg:[&>*]:py-3`}>
            <span>Ligne</span><span>Ce qu'on y lit</span><span>Source</span><span>État</span>
          </div>
          {g.lignes.map((l) => {
            const [mot, classe, puce] = ETAT[l.statut] || ETAT.introuvable;
            const choisie = ouverte?.case?.grille === g.id && ouverte?.case?.id === l.id;
            return (
              <div key={l.id}
                className={`grid ${COLONNES} ${CELLULES} border-t border-trait py-3.5 transition-colors lg:[&>*]:py-3.5 hover:bg-encre/[0.02] max-lg:grid-cols-1 max-lg:gap-y-1.5 ${choisie ? "bg-menthe/[0.06]" : ""}`}>
                {/* Le libellé ouvre la source ; la valeur se modifie ; l'état se choisit (29 oct. 2026, Jules). */}
                <button type="button" onClick={() => ouvrirCase(g, l)} title={l.sources.length ? "Voir la source" : l.regle} className="m-0 text-left text-[14.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>{l.libelle}</button>
                <ValeurModifiable valeur={l.valeur} occupe={geste.isPending}
                  vide={l.statut === "manquant" ? "Pas encore de pièce" : l.statut === "lecture" ? "En cours de lecture" : l.statut === "non_lu" ? "Pièce pas encore lue" : "Non trouvé dans les pièces"}
                  onEnregistrer={(t) => geste.mutate({ chemin: `cases/${g.id}/${l.id}`, corps: { action: "corriger", valeur: t } })}
                  apres={<>
                    {l.alerte && l.statut !== "corrige" && <p className="m-0 mt-0.5 text-[13px] leading-[1.45] text-ambre">{l.alerte.motif}</p>}
                    {l.a_choisir && <p className="m-0 mt-0.5 text-[13px] text-ambre">Les pièces ne disent pas la même chose : choisissez celle à retenir.</p>}
                    {l.relue && <p className="m-0 mt-0.5 text-[12.5px] text-ambre">La relecture lit autre chose : « {String(l.relue).slice(0, 80)} ».</p>}
                  </>} />
                <div className="flex flex-wrap content-start gap-1.5">
                  {l.sources.slice(0, 3).map((s) => (
                    <button key={s.document_id} type="button" onClick={(ev) => { ev.stopPropagation(); setOuverte({ seul: true, doc: { id: s.document_id, nom: s.document_nom, url: s.document_url, mime: s.mime }, page: s.page, citation: s.citation }); }} title={s.citation || undefined}
                      className={`inline-flex h-7 max-w-full items-center truncate rounded-full border px-2.5 text-[12.5px] transition-colors hover:text-encre ${s.verifiee === false ? "border-ambre/40 text-ambre" : "border-trait text-craie hover:border-bord-vif"} ${l.sources.length > 1 && s.document_id === l.retenue ? "border-menthe" : ""}`} style={{ background: "transparent" }}>
                      {TYPE_COURT[s.type] || court(s.document_nom)}{s.page ? ` p. ${s.page}` : ""}
                    </button>
                  ))}
                </div>
                <EtatTrois etat={l.statut} par={l.par} valeur={l.valeur} defaut={[mot, classe, puce]} occupe={geste.isPending}
                  onChoix={(id) => geste.mutate({ chemin: `cases/${g.id}/${l.id}`, corps: corpsDuChoix(id, l.valeur, l.valeur_main) })} />
              </div>
            );
          })}
          </div>
        </section>
      ))}
      {ouverte && <PanneauPiece dealId={dealId} ouverte={ouverte} caseOuverte={caseOuverte} onChange={setOuverte} onFermer={() => setOuverte(null)} />}
    </div>
  );
}

const court = (nom) => String(nom || "Pièce").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").slice(0, 24);
function docDe(data, id) {
  const d = [...data.a_ranger, ...data.emplacements.flatMap((e) => e.documents)].find((x) => x.id === id);
  return d ? { id: d.id, nom: d.nom, url: d.url, mime: d.mime } : null;
}

// --- Le panneau de droite : la case, la pièce surlignée, une question libre ---------------------------------
function PanneauPiece({ dealId, ouverte, caseOuverte = null, onChange, onFermer }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFermer]);
  const doc = ouverte.doc;
  // Un clic sur une source : la page et son passage surligné, rien d'autre (29 oct. 2026, Jules).
  if (ouverte.seul && doc) {
    return createPortal(
      <div className="animate-in slide-in-from-right duration-300 ease-out fixed inset-y-0 right-0 z-[60] flex w-full flex-col border-l border-bord bg-fond shadow-[-24px_0_60px_rgba(0,0,0,.6)] sm:w-[760px]">
        <button type="button" onClick={onFermer} className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-surface-pleine/90 text-ardoise shadow-[0_6px_18px_rgb(0_0_0/0.18)] hover:text-encre max-md:top-[max(12px,env(safe-area-inset-top))]" aria-label="Fermer" title="Fermer (Échap)"><X className="h-4 w-4" /></button>
        <SourceSeule dealId={dealId} doc={doc} page={ouverte.page} citation={ouverte.citation} />
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div className="animate-in slide-in-from-right duration-300 ease-out fixed inset-y-0 right-0 z-[60] flex w-full flex-col gap-3 overflow-y-auto overscroll-contain border-l border-bord bg-fond p-4 shadow-[-24px_0_60px_rgba(0,0,0,.6)] sm:w-[760px] max-md:p-3 max-md:pt-[max(12px,env(safe-area-inset-top))]">
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
