import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { sansMarkdown } from "@/components/preanalyse/ChatDossier";
import { J } from "@/design/jetons";

// Un message de conversation, le même partout : la question dans une bulle de
// verre, la réponse en texte plein — l'une sous l'autre, toutes deux calées à
// gauche, pour que l'œil suive une seule colonne. Le markdown résiduel est
// nettoyé à l'affichage.
//
// Sous une réponse, deux pouces. Un clic crée une remarque dans le Feedback
// avec l'échange, et fait rédiger le prompt à coller dans Claude pour corriger
// la cause. Le pouce en bas ouvre d'abord un champ, facultatif, pour dire ce
// qui cloche : le prompt en devient beaucoup plus juste.

export function AvisReponse({ question, reponse, surface, dealId = undefined }) {
  const [ouvert, setOuvert] = useState(null); // "bas" quand on précise
  const [precision, setPrecision] = useState("");
  const [resultat, setResultat] = useState(null); // { prompt, resume, pouce }
  const [copie, setCopie] = useState(false);

  const envoyer = useMutation({
    mutationFn: (pouce) =>
      base44.request("POST", "/api/assistant/avis", {
        body: { pouce, question, reponse, surface, deal_id: dealId || null, precision: pouce === "bas" ? precision.trim() : "" },
      }),
    onSuccess: (r, pouce) => {
      setOuvert(null);
      setPrecision("");
      setResultat({ ...r, pouce });
      toast.success(pouce === "bas" ? "Remarque enregistrée" : "Noté comme une bonne réponse", {
        description: "Le prompt de correction est prêt, dans le Feedback aussi.",
      });
    },
    onError: (e) => toast.error(e?.message || "Enregistrement impossible"),
  });

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(resultat.prompt);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      window.prompt("Copiez le prompt :", resultat.prompt);
    }
  };

  if (resultat) {
    return (
      <div className="mt-3 rounded-xl border border-bord bg-surface px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="m-0 text-[11px] tracking-[.18em] uppercase" style={{ color: resultat.pouce === "bas" ? J["alerte"] : J["menthe"] }}>
            {resultat.pouce === "bas" ? "À corriger" : "À préserver"} — prompt pour Claude
          </p>
          <button onClick={copier} className="inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1 rounded-full border border-bord-doux text-craie hover:text-encre hover:border-bord-vif">
            {copie ? <Check className="w-3 h-3 text-menthe" /> : <Copy className="w-3 h-3" />}
            {copie ? "Copié" : "Copier"}
          </button>
        </div>
        <p className="m-0 mt-2 text-[12.5px] leading-[1.6] text-craie whitespace-pre-wrap max-h-[220px] overflow-y-auto">{resultat.prompt}</p>
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => envoyer.mutate("haut")}
          disabled={envoyer.isPending}
          title="Bonne réponse — à préserver"
          aria-label="Bonne réponse"
          className="w-7 h-7 rounded-md flex items-center justify-center text-brume hover:text-menthe hover:bg-menthe/[0.08] transition-colors disabled:opacity-40"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setOuvert(ouvert === "bas" ? null : "bas")}
          disabled={envoyer.isPending}
          title="Mauvaise réponse — dire ce qui ne va pas"
          aria-label="Mauvaise réponse"
          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors disabled:opacity-40 ${ouvert === "bas" ? "text-alerte bg-alerte/[0.1]" : "text-brume hover:text-alerte hover:bg-alerte/[0.08]"}`}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
        {envoyer.isPending && <span className="text-[12.5px] text-brume">Rédaction du prompt…</span>}
      </div>

      {ouvert === "bas" && (
        <div className="mt-2 max-w-[560px]">
          <textarea
            autoFocus
            value={precision}
            onChange={(e) => setPrecision(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer.mutate("bas"); } if (e.key === "Escape") setOuvert(null); }}
            rows={2}
            placeholder="Qu'est-ce qui ne va pas ? (facultatif — trop long, hors sujet, chiffre inventé…)"
            className="w-full bg-transparent border border-bord-vif focus:border-alerte rounded-lg px-3 py-2 outline-none text-[12.5px] leading-[1.55] text-encre placeholder:text-brume resize-y"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button onClick={() => envoyer.mutate("bas")} disabled={envoyer.isPending} className="text-[12.5px] px-3 py-1 rounded-md bg-alerte text-fond font-semibold disabled:opacity-40">Envoyer</button>
            <button onClick={() => setOuvert(null)} className="text-[12.5px] text-ardoise hover:text-encre">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MessageIA({ m, question = null, surface = null, dealId = null }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[20px] bg-encre/[0.06] backdrop-blur-xl px-5 py-3.5 text-[15px] leading-[1.6] text-encre whitespace-pre-wrap">{m.contenu}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[15px] leading-[1.75] text-encre whitespace-pre-wrap">{sansMarkdown(m.contenu)}</div>
      {surface && m.contenu && <AvisReponse question={question} reponse={m.contenu} surface={surface} dealId={dealId} />}
    </div>
  );
}
