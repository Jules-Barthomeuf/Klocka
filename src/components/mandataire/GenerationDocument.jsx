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
export function DocumentTelephone({ libelle, children }) {
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
        className="fixed left-1/2 top-[calc(var(--k-haut-mobile,3.5rem)+3.75rem)] z-30 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border border-bord-vif bg-surface-pleine px-4 text-[13px] text-encre shadow-[0_18px_40px_rgb(0_0_0/0.18)] md:hidden">
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

/**
 * La mise à jour du document après un message : les étapes réelles du serveur
 * (« Loyer annuel : 50 000 € »…), cochées à mesure, la dernière qui tourne.
 */
export function MiseAJourDocument({ surtitre, titre, etapes, enCours }) {
  const liste = etapes.length ? etapes : ["Lecture de votre message"];
  const faites = enCours ? liste.length - 1 : liste.length;
  return (
    <div className="grid h-full place-items-center px-10 max-md:px-6">
      <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-2 duration-500">
        <p className="m-0 text-[12px] uppercase tracking-[.12em] text-menthe">{surtitre}</p>
        <p className="m-0 mt-1.5 text-[20px] font-normal text-encre">{titre}</p>
        <ul className="m-0 mt-6 flex list-none flex-col gap-3 p-0">
          {liste.map((mot, i) => {
            const fait = i < faites;
            return (
              <li key={`${i}-${mot}`} className={`flex items-center gap-3 text-[14px] animate-in fade-in slide-in-from-bottom-1 duration-300 ${fait ? "text-craie" : "text-encre"}`}>
                {fait ? (
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-menthe text-sur-menthe animate-in zoom-in-50 duration-300"><Check className="h-3 w-3" strokeWidth={3} /></span>
                ) : (
                  <Loader2 className="h-5 w-5 flex-none animate-spin text-menthe" />
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
