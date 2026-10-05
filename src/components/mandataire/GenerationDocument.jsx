import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

// La génération d'un document au premier message (mandat, avis de valeur) :
// à droite du chat, les étapes se cochent une à une pendant quelques
// secondes, puis le document apparaît. La dernière étape tourne tant que le
// document n'est pas là ; si le chat n'en ouvre pas (une question, pas une
// demande), l'attente s'arrête d'elle-même.

const PAS = 650;
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
    <div className="grid h-full place-items-center px-10">
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
    <div className="grid h-full place-items-center px-10">
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
