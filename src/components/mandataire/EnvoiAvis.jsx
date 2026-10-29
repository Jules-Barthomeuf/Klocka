import React, { useEffect, useState } from "react";
import Loader from "@/components/ui/Loader";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Loader2, Send, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// L'envoi de l'avis de valeur (27 oct. 2026, Jules : « à la fin de l'estimation, l'IA propose d'écrire le message et de
// l'envoyer avec l'estimation en PDF »). Le mail de Haka se relit ici ; il part de la messagerie du mandataire (Klocka
// n'envoie rien pour lui) avec l'avis en PDF : au téléphone, le partage joint le fichier ; sinon le PDF se télécharge
// et la messagerie s'ouvre. Puis « C'est envoyé » : l'affaire passe en Estimation envoyée ; on reste sur l'Estimation,
// et le chat suit la relation avec le propriétaire (27 oct. 2026, Jules : plus de relances programmées d'office).

const BOUTON = "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] transition-colors disabled:opacity-40";
const CHAMP = "w-full rounded-[10px] border border-trait bg-surface px-3 text-[14px] text-encre outline-none focus:border-bord-vif max-md:text-[16px]";

async function pdfDe(id) {
  const r = await fetch(`/api/mandataire/estimations/${encodeURIComponent(id)}/pdf`, { credentials: "include" });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error || "Le PDF ne s'est pas fait."); }
  const nom = decodeURIComponent((r.headers.get("content-disposition") || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] || "Avis de valeur.pdf");
  return new File([await r.blob()], nom, { type: "application/pdf" });
}

function telecharger(fichier) {
  const url = URL.createObjectURL(fichier);
  const a = document.createElement("a");
  a.href = url;
  a.download = fichier.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** La fenêtre d'envoi d'un avis : `estimationId` l'ouvre, `onFermer` la ferme. */
export default function EnvoiAvis({ estimationId, onFermer }) {
  const queryClient = useQueryClient();
  const [mail, setMail] = useState(null);
  const [parti, setParti] = useState(false);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    let vivant = true;
    setMail(null); setParti(false); setErreur(null);
    base44.request("POST", `/api/mandataire/estimations/${encodeURIComponent(estimationId)}/envoi`, { body: {} })
      .then((r) => { if (vivant) setMail({ a: r.envoi?.a || "", objet: r.envoi?.objet || "", texte: r.envoi?.texte || "" }); })
      .catch((e) => { if (vivant) setErreur(e?.message || "Le mail ne s'est pas préparé."); });
    return () => { vivant = false; };
  }, [estimationId]);
  const envoyer = useMutation({
    mutationFn: async () => {
      const fichier = await pdfDe(estimationId);
      // Le partage du système joint le PDF au mail (téléphone, Safari) ; ailleurs, le PDF se télécharge et la messagerie s'ouvre.
      if (navigator.canShare?.({ files: [fichier] })) {
        try { await navigator.share({ files: [fichier], title: mail.objet, text: mail.texte }); return "partage"; } catch (e) { if (e?.name === "AbortError") return "annule"; }
      }
      telecharger(fichier);
      window.location.href = `mailto:${encodeURIComponent(mail.a || "")}?subject=${encodeURIComponent(mail.objet)}&body=${encodeURIComponent(mail.texte)}`;
      return "messagerie";
    },
    onSuccess: (facon) => { if (facon !== "annule") setParti(facon); },
    onError: (e) => toast.error(e?.message || "Le PDF ne s'est pas fait"),
  });
  const pdfSeul = useMutation({ mutationFn: () => pdfDe(estimationId).then(telecharger), onError: (e) => toast.error(e?.message || "Le PDF ne s'est pas fait") });
  const confirmer = useMutation({
    mutationFn: () => base44.request("POST", `/api/mandataire/estimations/${encodeURIComponent(estimationId)}/envoye`, { body: mail }),
    onSuccess: () => {
      ["m-proprietaires", "m-fiche", "m-estimations", "m-rappels"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success("Estimation envoyée");
      window.dispatchEvent(new CustomEvent("klocka:dire", { detail: { texte: "L'avis est parti. Racontez-moi la suite quand vous avez des nouvelles : un appel, un rendez-vous, sa réponse. Je note, je pose les relances, et on passe au mandat quand le prix est d'accord." } }));
      onFermer();
    },
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-fond/60 px-4 backdrop-blur-sm" onClick={onFermer}>
      <div role="dialog" aria-label="Envoyer l'avis au propriétaire" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-[560px] flex-col rounded-[14px] border border-trait bg-surface-pleine p-5 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="mb-3 flex flex-none items-center justify-between gap-3">
          <p className="m-0 text-[16px] text-encre">Envoyer l'avis au propriétaire</p>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        {erreur && <p className="m-0 text-[13.5px] text-alerte">{erreur}</p>}
        {!mail && !erreur && <Loader titre="Haka prépare le mail…" />}
        {mail && !parti && (
          <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto">
            <label className="flex flex-col gap-1 text-[12.5px] text-ardoise">À
              <input type="email" value={mail.a} onChange={(e) => setMail({ ...mail, a: e.target.value })} placeholder="L'adresse du propriétaire" className={`${CHAMP} h-10`} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] text-ardoise">Objet
              <input value={mail.objet} onChange={(e) => setMail({ ...mail, objet: e.target.value })} className={`${CHAMP} h-10`} />
            </label>
            <textarea value={mail.texte} onChange={(e) => setMail({ ...mail, texte: e.target.value })} aria-label="Le mail"
              rows={Math.min(14, Math.max(7, mail.texte.split("\n").length + 1))} className={`${CHAMP} resize-y py-2.5 leading-[1.6]`} />
            <p className="m-0 text-[12.5px] text-ardoise">L'avis de valeur part en PDF, joint au mail. Il s'envoie de votre messagerie.</p>
            <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => pdfSeul.mutate()} disabled={pdfSeul.isPending} className={`${BOUTON} border border-trait text-craie hover:text-encre`} style={{ background: "transparent" }}>
                {pdfSeul.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Le PDF seul
              </button>
              <button type="button" onClick={() => envoyer.mutate()} disabled={envoyer.isPending || !mail.texte.trim()} className={`${BOUTON} bg-menthe text-sur-menthe hover:bg-menthe-survol`}>
                {envoyer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{envoyer.isPending ? "Le PDF se prépare…" : "Envoyer avec l'avis en PDF"}
              </button>
            </div>
          </div>
        )}
        {mail && parti && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[14px] leading-[1.55] text-encre">
              {parti === "messagerie" ? "Le PDF est téléchargé et votre messagerie s'ouvre : joignez-y le PDF, puis envoyez." : "Le mail est prêt dans votre messagerie, avec l'avis joint."} Le mail est parti ?
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setParti(false)} className={`${BOUTON} border border-trait text-craie hover:text-encre`} style={{ background: "transparent" }}>Pas encore</button>
              <button type="button" onClick={() => confirmer.mutate()} disabled={confirmer.isPending} className={`${BOUTON} bg-menthe text-sur-menthe hover:bg-menthe-survol`}>
                {confirmer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Oui, c'est envoyé
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
