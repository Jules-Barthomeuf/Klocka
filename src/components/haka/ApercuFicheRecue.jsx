import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Paperclip, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

// La fiche reçue, ouverte avant de dire oui (20 oct. 2026, Jules : « l'agent dit une nouvelle fiche commerciale est
// arrivée, je la rentre ? On clique et on voit soit l'email soit la fiche commerciale : un humain dans la boucle »).
// Deux vues : la Fiche (la pièce, PDF ou image, dans la page) et l'Email (qui, quand, l'objet, le texte). En bas,
// les deux gestes : « Pré-analyser » ou « Pas une fiche ».

const date = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "");

export default function ApercuFicheRecue({ proposition: p, onFermer, onTrancher }) {
  const q = useQuery({ queryKey: ["haka-fiche-mail", p.id], queryFn: () => base44.request("GET", `/api/haka/propositions/${p.id}/mail`), retry: false });
  const mail = q.data || null;
  const pieces = mail?.pieces || [];
  const [vue, setVue] = useState("fiche");
  const [n, setN] = useState(null);
  // La pièce montrée : la première qui peut être la fiche, sinon la première pièce.
  const choisie = n ?? (pieces.find((x) => x.fiche) || pieces[0])?.n ?? null;
  const piece = pieces.find((x) => x.n === choisie) || null;
  const url = piece ? `/api/haka/propositions/${p.id}/piece/${piece.n}` : null;
  const estPdf = piece && (/pdf/.test(piece.mime || "") || /\.pdf$/i.test(piece.nom));
  const estImage = piece && (/^image\//.test(piece.mime || "") || /\.(png|jpe?g|webp|gif)$/i.test(piece.nom));
  useEffect(() => { if (q.isSuccess && !pieces.length) setVue("email"); }, [q.isSuccess, pieces.length]);
  useEffect(() => {
    const touche = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [onFermer]);

  const onglet = (cle, mot) => (
    <button type="button" onClick={() => setVue(cle)} aria-pressed={vue === cle}
      className={`h-8 rounded-full px-4 text-[13.5px] transition-colors ${vue === cle ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={vue === cle ? undefined : { background: "transparent" }}>{mot}</button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onFermer}>
      <motion.div role="dialog" aria-label="Fiche reçue" onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-[min(88vh,900px)] w-[min(960px,100%)] flex-col overflow-hidden rounded-[18px] border border-bord-doux bg-rail shadow-[0_24px_60px_rgb(0_0_0/0.35)]">
        <div className="flex flex-none items-center gap-3 border-b border-trait px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[15px] text-encre">{p.titre}</p>
            {mail && <p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">{[mail.objet, date(mail.date)].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="inline-flex flex-none gap-1 rounded-full border border-trait p-1">{onglet("fiche", "Fiche")}{onglet("email", "Email")}</div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {q.isLoading ? (
            <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
          ) : q.isError ? (
            <p className="m-0 p-6 text-[14px] text-alerte">{q.error?.message || "Le mail n'a pas pu être lu."}</p>
          ) : vue === "fiche" ? (
            <div className="flex h-full flex-col">
              {pieces.length > 1 && (
                <div className="flex flex-none flex-wrap gap-1.5 border-b border-trait px-5 py-2.5">
                  {pieces.map((x) => (
                    <button key={x.n} type="button" onClick={() => setN(x.n)} aria-pressed={x.n === choisie}
                      className={`inline-flex h-7 max-w-[260px] items-center gap-1.5 truncate rounded-full border px-3 text-[12.5px] ${x.n === choisie ? "border-menthe/60 text-encre" : "border-trait text-craie hover:border-bord-vif"}`} style={{ background: "transparent" }}>
                      <Paperclip className="h-3 w-3 flex-none" /><span className="truncate">{x.nom}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1 bg-fond">
                {!piece ? <p className="m-0 p-6 text-[14px] text-brume">Ce mail n'a pas de pièce jointe : voyez l'Email.</p>
                  : estPdf ? <iframe key={url} src={url} title={piece.nom} className="h-full w-full border-0" />
                  : estImage ? <div className="grid h-full place-items-center overflow-auto p-4"><img src={url} alt={piece.nom} className="max-h-full max-w-full rounded-[8px]" /></div>
                  : <div className="grid h-full place-items-center p-6 text-center"><a href={url} target="_blank" rel="noreferrer" className="text-[14px] text-menthe underline-offset-4 hover:underline">Ouvrir « {piece.nom} »</a></div>}
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto px-6 py-5">
              <p className="m-0 text-[13px] text-ardoise"><span className="text-brume">De</span> {mail?.de}</p>
              {mail?.compte && <p className="m-0 mt-0.5 text-[13px] text-ardoise"><span className="text-brume">Reçu dans</span> {mail.compte}</p>}
              <p className="m-0 mt-3 text-[17px] text-encre">{mail?.objet || "(sans objet)"}</p>
              <p className="m-0 mt-4 whitespace-pre-wrap text-[14.5px] leading-[1.6] text-craie">{mail?.texte || "(mail sans texte)"}</p>
              {pieces.length > 0 && <p className="m-0 mt-5 text-[13px] text-ardoise">Pièces : {pieces.map((x) => x.nom).join(", ")}</p>}
            </div>
          )}
        </div>

        <div className="flex flex-none items-center justify-end gap-2.5 border-t border-trait px-5 py-3.5">
          <span className="mr-auto text-[13px] text-ardoise">Je la rentre ?</span>
          <button type="button" onClick={() => onTrancher("ignorer")} className="inline-flex h-10 items-center rounded-full border border-trait px-4 text-[14px] text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Pas une fiche</button>
          <button type="button" onClick={() => onTrancher("preanalyser")} className="inline-flex h-10 items-center rounded-full bg-menthe px-5 text-[14px] text-sur-menthe transition-colors hover:bg-menthe-survol">Pré-analyser</button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
