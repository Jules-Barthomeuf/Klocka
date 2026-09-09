import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { sansMarkdown } from "@/components/preanalyse/ChatDossier";

// Un message de conversation, le même partout : la question dans une bulle à
// droite, la réponse en texte plein à gauche — elle se lit comme une page, pas
// comme un cadre. Le markdown résiduel est nettoyé à l'affichage.
//
// Sous une réponse, deux pouces. Un clic crée une remarque dans le Feedback
// avec l'échange, et fait rédiger le prompt à coller dans Claude pour corriger
// la cause. Le pouce en bas ouvre d'abord un champ, facultatif, pour dire ce
// qui cloche : le prompt en devient beaucoup plus juste.

export function AvisReponse({ question, reponse, surface, dealId }) {
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
      <div className="mt-3 rounded-xl border border-[#22262d] bg-[#0f1114] px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="m-0 text-[10.5px] tracking-[.18em] uppercase" style={{ color: resultat.pouce === "bas" ? "#e8746a" : "#96c0b8" }}>
            {resultat.pouce === "bas" ? "À corriger" : "À préserver"} — prompt pour Claude
          </p>
          <button onClick={copier} className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1 rounded-full border border-[#2c3139] text-[#c9cdd6] hover:text-[#f2f3f5] hover:border-[#3a3f4a]">
            {copie ? <Check className="w-3 h-3 text-[#96c0b8]" /> : <Copy className="w-3 h-3" />}
            {copie ? "Copié" : "Copier"}
          </button>
        </div>
        <p className="m-0 mt-2 text-[13px] leading-[1.6] text-[#c9cdd6] whitespace-pre-wrap max-h-[220px] overflow-y-auto">{resultat.prompt}</p>
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
          className="w-7 h-7 rounded-md flex items-center justify-center text-[#4d545d] hover:text-[#96c0b8] hover:bg-[#96c0b8]/[0.08] transition-colors disabled:opacity-40"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setOuvert(ouvert === "bas" ? null : "bas")}
          disabled={envoyer.isPending}
          title="Mauvaise réponse — dire ce qui ne va pas"
          aria-label="Mauvaise réponse"
          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors disabled:opacity-40 ${ouvert === "bas" ? "text-[#e8746a] bg-[#e8746a]/[0.1]" : "text-[#4d545d] hover:text-[#e8746a] hover:bg-[#e8746a]/[0.08]"}`}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
        {envoyer.isPending && <span className="text-[12px] text-[#6a7180]">Rédaction du prompt…</span>}
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
            className="w-full bg-transparent border border-[#3a3f4a] focus:border-[#e8746a] rounded-lg px-3 py-2 outline-none text-[13px] leading-[1.55] text-[#f2f3f5] placeholder:text-[#4d545d] resize-y"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button onClick={() => envoyer.mutate("bas")} disabled={envoyer.isPending} className="text-[12px] px-3 py-1 rounded-md bg-[#e8746a] text-[#0b0c0e] font-semibold disabled:opacity-40">Envoyer</button>
            <button onClick={() => setOuvert(null)} className="text-[12px] text-[#9298a6] hover:text-[#f2f3f5]">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MessageIA({ m, question = null, surface = null, dealId = null }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[20px] bg-[#1a1d1c] px-5 py-3.5 text-[15px] leading-[1.6] text-[#f2f3f5] whitespace-pre-wrap">{m.contenu}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[15px] leading-[1.75] text-[#e6e8eb] whitespace-pre-wrap">{sansMarkdown(m.contenu)}</div>
      {surface && m.contenu && <AvisReponse question={question} reponse={m.contenu} surface={surface} dealId={dealId} />}
    </div>
  );
}
