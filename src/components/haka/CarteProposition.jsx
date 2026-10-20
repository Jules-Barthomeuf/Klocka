import React, { useState } from "react";
import ApercuFicheRecue from "@/components/haka/ApercuFicheRecue";
import { Link } from "react-router-dom";
import { Check, Loader2, Pencil, Hand } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import ListeSources from "@/components/haka/ListeSources";

// Une proposition de Haka (17 oct. 2026) : ce qu'il propose, pourquoi (ses
// sources), et trois gestes : Valider, Modifier (valider une version
// retouchée), Rejeter (avec un motif). Un élément à choix (rattacher ou créer)
// montre ses options ; un élément d'information se marque « Vu ».

const champ = "w-full rounded-[10px] border border-trait bg-surface px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]";
const depuis = (iso) => {
  if (!iso) return "";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 60) return `il y a ${Math.max(1, min)} min`;
  if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};
// Le coût est mesuré en dollars (tarifs Anthropic) et montré en euros, comme dans le Suivi.
const euros = (usd) => { const n = (usd || 0) * 0.92; return n > 0 ? `${n < 0.01 ? "< 0,01" : String(Math.round(n * 100) / 100).replace(".", ",")} €` : null; };

function ApercuMail({ charge, edition, setCharge }) {
  if (edition) {
    return (
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-3 text-[12.5px] text-ardoise"><span className="w-12 flex-none">À</span><input value={charge.a || ""} onChange={(e) => setCharge({ ...charge, a: e.target.value })} className={`${champ} h-9`} /></label>
        <label className="flex items-center gap-3 text-[12.5px] text-ardoise"><span className="w-12 flex-none">Objet</span><input value={charge.objet || ""} onChange={(e) => setCharge({ ...charge, objet: e.target.value })} className={`${champ} h-9`} /></label>
        <textarea value={charge.corps || ""} onChange={(e) => setCharge({ ...charge, corps: e.target.value })} rows={Math.min(16, Math.max(6, String(charge.corps || "").split("\n").length + 2))} className={`${champ} resize-y py-2.5 leading-[1.55]`} />
      </div>
    );
  }
  return (
    <div className="rounded-[12px] border border-trait px-4 py-3">
      <p className="m-0 text-[12.5px] text-ardoise">
        <span className="text-brume">À</span> {charge.a || <span className="text-ambre">adresse de l'agent à compléter</span>}
        {charge.de ? <><span className="mx-2 text-brume">·</span><span className="text-brume">De</span> {charge.de}</> : <><span className="mx-2 text-brume">·</span><span className="text-ambre">aucune boîte connectée</span></>}
      </p>
      <p className="m-0 mt-1.5 text-[14.5px] text-encre">{charge.objet}</p>
      <p className="m-0 mt-2 whitespace-pre-wrap text-[13.5px] leading-[1.55] text-craie">{charge.corps}</p>
    </div>
  );
}

export default function CarteProposition({ proposition: p, moi, onValider, onRejeter, onPrendre, enCours = false, compacte = false }) {
  const [edition, setEdition] = useState(false);
  const [charge, setCharge] = useState(p.charge || {});
  const [rejet, setRejet] = useState(false);
  const [motif, setMotif] = useState("");
  const [apercu, setApercu] = useState(false);
  const aChoix = Array.isArray(p.choix) && p.choix.length > 0;
  const information = Array.isArray(p.actions) && p.actions.length === 1 && p.actions[0] === "vu";
  const estMail = p.type === "demande_documents" || p.type === "relance_mail";
  const prenom = (e) => String(e || "").split("@")[0].split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
  return (
    <article className={`rounded-[16px] border border-trait bg-rail ${compacte ? "p-4" : "p-5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[16px] text-encre">{p.titre}</p>
          <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ardoise">
            {p.dossier && <Link to={`/Dossiers?deal_id=${p.dossier}`} className="text-menthe underline-offset-4 hover:underline">Ouvrir le dossier</Link>}
            <span>{p.pour ? (p.pour === moi ? "pour vous" : `pour ${prenom(p.pour)}`) : "Commun"}</span>
            <span>{depuis(p.cree_le)}</span>
            {euros(p.cout_usd) && <span title="Ce que ce travail a coûté en IA">{euros(p.cout_usd)}</span>}
          </p>
        </div>
        {p.erreur && <span className="rounded-full border border-alerte/50 px-2.5 py-0.5 text-[12px] text-alerte">{p.erreur}</span>}
      </div>
      {p.resume && <p className="m-0 mt-3 text-[14px] leading-[1.55] text-craie">{p.resume}</p>}

      <div className="mt-3">
        {estMail && <ApercuMail charge={charge} edition={edition} setCharge={setCharge} />}
        {p.type === "reponse_equipe" && (
          <div className="flex flex-col gap-2">
            <div className="rounded-[12px] border border-trait px-4 py-3"><p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">La demande</p><p className="m-0 mt-1 whitespace-pre-wrap text-[13.5px] leading-[1.5] text-craie">{p.charge?.demande}</p></div>
            <div className="rounded-[12px] border border-menthe/40 px-4 py-3"><p className="m-0 text-[11px] uppercase tracking-[.14em] text-menthe">La réponse de Haka</p><p className="m-0 mt-1 whitespace-pre-wrap text-[14px] leading-[1.55] text-encre">{p.charge?.reponse}</p></div>
          </div>
        )}
        {/* Une fiche reçue (20 oct. 2026, Jules) : on la regarde, fiche ou mail, avant de la rentrer. */}
        {p.type === "preanalyser_fiche" && (
          <button type="button" onClick={() => setApercu(true)} className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-trait px-4 py-3 text-left hover:border-bord-vif" style={{ background: "transparent" }}>
            <span className="min-w-0"><span className="block truncate text-[14px] text-encre">{p.charge?.objet || "(sans objet)"}</span><span className="block truncate text-[12.5px] text-ardoise">De {p.charge?.de || p.charge?.de_email}</span></span>
            <span className="flex-none text-[13px] text-menthe">Voir la fiche ou le mail</span>
          </button>
        )}
        {p.type === "mail_exterieur" && (
          <div className="rounded-[12px] border border-trait px-4 py-3"><p className="m-0 text-[12.5px] text-ardoise"><span className="text-brume">De</span> {p.charge?.de}</p><p className="m-0 mt-1 text-[14.5px] text-encre">{p.charge?.objet}</p><p className="m-0 mt-2 whitespace-pre-wrap text-[13.5px] leading-[1.5] text-craie">{p.charge?.extrait}</p></div>
        )}
        {aChoix && (
          <div className="flex flex-col gap-2">
            {(p.charge?.candidats || []).map((c) => (
              <Link key={c.deal_id} to={`/Dossiers?deal_id=${c.deal_id}`} className="flex items-baseline justify-between gap-3 rounded-[12px] border border-trait px-4 py-2.5 text-[13.5px] text-encre hover:border-bord-vif">
                <span className="truncate">{c.titre}</span><span className="flex-none text-[12px] text-ardoise">{c.niveau === "meme_adresse" ? "même adresse" : c.niveau === "identique" ? "identique" : "adresse proche"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <ListeSources sources={p.sources} className="mt-4" />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {information ? (
          <button type="button" onClick={() => onValider({})} disabled={enCours} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
            {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Vu
          </button>
        ) : aChoix ? (
          p.choix.map((c, i) => (
            <button key={c.cle} type="button" onClick={() => onValider({ choix: c.cle })} disabled={enCours}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-5 text-[14px] disabled:opacity-50 ${i === 0 ? "bg-menthe text-sur-menthe hover:bg-menthe-survol" : "border border-trait text-craie hover:border-menthe hover:text-encre"}`} style={i === 0 ? undefined : { background: "transparent" }}>
              {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{c.libelle}
            </button>
          ))
        ) : (
          <>
            <button type="button" onClick={() => onValider(edition ? { charge } : {})} disabled={enCours || (estMail && !String(charge.a || "").trim())}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
              {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{edition ? "Valider la version modifiée" : "Valider"}
            </button>
            {estMail && (
              <button type="button" onClick={() => setEdition((v) => !v)} className="inline-flex h-10 items-center gap-2 rounded-full border border-trait px-4 text-[14px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
                <Pencil className="h-3.5 w-3.5" />{edition ? "Annuler la retouche" : "Modifier"}
              </button>
            )}
          </>
        )}
        {!information && (
          <button type="button" onClick={() => setRejet(true)} className="ml-auto h-10 px-2 text-[13.5px] text-alerte hover:underline" style={{ background: "transparent" }}>Rejeter</button>
        )}
        {!p.pour && onPrendre && (
          <button type="button" onClick={onPrendre} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}><Hand className="h-3.5 w-3.5" />Je prends</button>
        )}
      </div>

      {apercu && <ApercuFicheRecue proposition={p} onFermer={() => setApercu(false)} onTrancher={(choix) => { setApercu(false); onValider({ choix }); }} />}
      <AlertDialog open={rejet} onOpenChange={(o) => { if (!o) setRejet(false); }}>
        <AlertDialogContent className="border-bord-vif bg-surface-pleine sm:rounded-bloc">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-encre">Rejeter cette proposition ?</AlertDialogTitle>
            <AlertDialogDescription className="text-ardoise">Dites pourquoi : le motif reste sur le dossier et aide Haka à faire mieux.</AlertDialogDescription>
          </AlertDialogHeader>
          <textarea autoFocus value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} placeholder="Le motif, en quelques mots" className={`${champ} resize-y py-2.5`} />
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={!motif.trim()} onClick={() => { onRejeter(motif.trim()); setRejet(false); setMotif(""); }} className="bg-alerte text-fond hover:bg-alerte/90">Rejeter</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
