import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileText, Loader2, X } from "lucide-react";

// La génération d'un document au premier message (mandat, avis de valeur) :
// à droite du chat, les étapes se cochent une à une pendant quelques
// secondes, puis le document apparaît. La dernière étape tourne tant que le
// document n'est pas là ; si le chat n'en ouvre pas (une question, pas une
// demande), l'attente s'arrête d'elle-même.

const PAS = 650;

/**
 * Au téléphone, l'écran scindé laisse le chat seul : une pastille en haut du
 * fil ouvre le document en plein écran (portail, la page derrière ne défile
 * plus) ; « Fermer » ramène au chat. L'aperçu reçu garde sa propre barre.
 */
// `enLigne` (26 oct. 2026) : la pastille posée dans la page (à côté de l'état de l'avis), pas flottante en haut du fil.
export function DocumentTelephone({ libelle, children, enLigne = false, serre = false }) {
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    if (!ouvert) return undefined;
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = avant; };
  }, [ouvert]);
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)}
        className={`${enLigne ? "flex-none" : "fixed left-1/2 top-[calc(var(--k-haut-mobile,3.5rem)+3.75rem)] z-30 -translate-x-1/2"} inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-vif bg-surface-pleine ${serre ? "px-3" : "px-4"} text-[13px] text-encre shadow-[0_18px_40px_rgb(0_0_0/0.18)] md:hidden`}>
        <FileText className="h-4 w-4 text-menthe" /> {libelle}
      </button>
      {ouvert && createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col bg-fond">
          <div className="flex h-12 flex-none items-center border-b border-trait px-3">
            <button type="button" onClick={() => setOuvert(false)} className="inline-flex h-10 items-center gap-1.5 px-1 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
              <X className="h-4 w-4" /> Fermer
            </button>
          </div>
          {/* L'aperçu est taillé pour la colonne de l'écran scindé (100dvh) : ici il prend la place qui reste. */}
          <div className="min-h-0 flex-1 [&>div]:h-full [&>div]:border-l-0">{children}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
const ATTENTE_MAX = 12000;

export default function GenerationDocument({ surtitre, titre, etapes, pret, onFini }) {
  const [faites, setFaites] = useState(0);
  const fin = useRef(onFini);
  fin.current = onFini;
  useEffect(() => {
    if (faites >= etapes.length) { const t = setTimeout(() => fin.current?.(), 350); return () => clearTimeout(t); }
    if (faites === etapes.length - 1 && !pret) { const t = setTimeout(() => fin.current?.(), ATTENTE_MAX); return () => clearTimeout(t); }
    const t = setTimeout(() => setFaites((n) => n + 1), PAS);
    return () => clearTimeout(t);
  }, [faites, pret, etapes.length]);
  const part = Math.round((faites / etapes.length) * 100);
  return (
    <div className="grid h-full place-items-center px-10 max-md:px-6">
      <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-2 duration-500">
        <p className="m-0 text-[12px] uppercase tracking-[.12em] text-menthe">{surtitre}</p>
        <p className="m-0 mt-1.5 text-[20px] font-normal text-encre">{titre}</p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-encre/[0.12]">
          <div className="h-full rounded-full bg-menthe transition-[width] duration-500 ease-out" style={{ width: `${part}%` }} />
        </div>
        <ul className="m-0 mt-6 flex list-none flex-col gap-3 p-0">
          {etapes.map((mot, i) => {
            const fait = i < faites;
            const encours = i === faites;
            return (
              <li key={mot} className={`flex items-center gap-3 text-[14px] transition-opacity duration-300 ${fait ? "text-craie" : encours ? "text-encre" : "text-brume opacity-60"}`}>
                {fait ? (
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-menthe text-sur-menthe animate-in zoom-in-50 duration-300"><Check className="h-3 w-3" strokeWidth={3} /></span>
                ) : encours ? (
                  <Loader2 className="h-5 w-5 flex-none animate-spin text-menthe" />
                ) : (
                  <span className="h-5 w-5 flex-none rounded-full border-[1.5px] border-bord-vif" />
                )}
                {mot}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Les trois lignes d'état, selon le document qu'AK retouche. */
function lignesPour(surtitre = "") {
  const t = String(surtitre).toLowerCase();
  const quoi = /présentation/.test(t) ? ["Analyse des slides", "Mise à jour de la présentation"]
    : /projet/.test(t) ? ["Analyse du projet", "Mise à jour du projet"]
      : /lettre|loi/.test(t) ? ["Analyse de la lettre", "Mise à jour de la lettre"]
        : /newsletter/.test(t) ? ["Analyse des mails", "Mise à jour de la newsletter"]
          : /avis de valeur/.test(t) ? ["Analyse de l'avis", "Mise à jour de l'avis de valeur"]
            : ["Analyse du document", "Mise à jour du document"];
  return ["Lecture de votre message", ...quoi];
}

/**
 * AK au travail, dans le panneau de droite (14 oct. 2026, Jules) : trois
 * mini-diapositives qui se relaient (texte, image et texte, graphique), le
 * titre traversé d'une bande de lumière, une ligne d'état qui change toutes
 * les deux secondes. Calme : le titre dit qu'AK travaille, les diapositives
 * sur quoi, la ligne où il en est. Les animations sont en CSS (index.css).
 */
export function MiseAJourDocument({ surtitre, titre = "Haka lit votre demande", lignes = null }) {
  const etats = (lignes && lignes.length === 3 ? lignes : lignesPour(surtitre));
  const ligne = "h-[7px] rounded-full bg-bord-doux";
  return (
    <div className="grid h-full place-items-center bg-rail px-10 max-md:px-6">
      <div className="flex flex-col items-center text-center animate-in fade-in duration-500">
        <div className="k-pile" aria-hidden>
          {/* Texte : un titre et deux lignes. */}
          <div className="k-mini p-4">
            <div className="h-[9px] w-[58%] rounded-full bg-menthe" />
            <div className={`${ligne} mt-3 w-[82%]`} />
            <div className={`${ligne} mt-2 w-[66%]`} />
          </div>
          {/* Image et texte : un bloc à gauche, des lignes à droite. */}
          <div className="k-mini flex gap-3 p-4">
            <div className="h-full w-[42%] rounded-[6px] bg-menthe-fonce" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <div className="h-[8px] w-[80%] rounded-full bg-menthe/70" />
              <div className={`${ligne} w-full`} />
              <div className={`${ligne} w-[70%]`} />
            </div>
          </div>
          {/* Graphique : quatre barres, une verte. */}
          <div className="k-mini flex items-end justify-center gap-3 px-6 pb-5 pt-4">
            {[44, 66, 52, 84].map((h, i) => <div key={i} className={`w-6 rounded-t-[4px] ${i === 3 ? "bg-menthe" : "bg-bord-doux"}`} style={{ height: `${h}%` }} />)}
          </div>
        </div>
        <p className="m-0 mt-10 text-[12px] text-menthe">{surtitre}</p>
        <p className="k-titre-metal m-0 mt-2 text-[28px] font-medium leading-[1.2] tracking-[-0.01em]">{titre}</p>
        <div className="k-etats mt-3 w-[320px] max-w-full text-[14px] text-craie" aria-live="polite">
          {etats.map((e) => <span key={e}>{e}</span>)}
        </div>
      </div>
    </div>
  );
}
