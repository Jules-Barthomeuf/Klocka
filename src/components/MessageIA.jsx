import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { sansMarkdown } from "@/components/preanalyse/ChatDossier";
import { J } from "@/design/jetons";
import { morceaux } from "@/lib/chiffres-message";

// Un message de conversation, le même partout : la question dans une bulle de
// verre, la réponse en texte plein — l'une sous l'autre, toutes deux calées à
// gauche, pour que l'œil suive une seule colonne. Le markdown résiduel est
// nettoyé à l'affichage.
//
// Sous une réponse, deux pouces (18 oct. 2026, Jules : « juste mettre un pouce rapidement ») : un clic, c'est noté,
// sans champ ni appel au modèle. Le pouce choisi reste allumé ; un clic sur l'autre le remplace. Chaque pouce
// crée une remarque dans le Feedback avec l'échange : c'est la matière pour corriger Haka (voir Suivi).

export function AvisReponse({ question, reponse, surface, dealId = undefined, heure = null }) {
  const [pouce, setPouce] = useState(null);
  const envoyer = useMutation({
    mutationFn: (p) => base44.request("POST", "/api/assistant/avis", { body: { pouce: p, question, reponse, surface, deal_id: dealId || null } }),
    onMutate: (p) => { const avant = pouce; setPouce(p); return { avant }; },
    onError: (e, _p, ctx) => { setPouce(ctx?.avant ?? null); toast.error(e?.message || "Enregistrement impossible"); },
  });
  const bouton = (p, Icone, titre, teinte) => {
    const actif = pouce === p;
    return (
      <button type="button" onClick={() => !actif && envoyer.mutate(p)} disabled={envoyer.isPending} title={titre} aria-label={titre} aria-pressed={actif}
        className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors max-md:h-9 max-md:w-9 ${actif ? "" : "text-brume hover:bg-encre/[0.05] hover:text-encre"}`}
        style={actif ? { color: J[teinte], background: "transparent" } : { background: "transparent" }}>
        <Icone className="h-3.5 w-3.5" fill={actif ? "currentColor" : "none"} />
      </button>
    );
  };
  return (
    <div className="mt-2.5 flex items-center gap-1.5">
      {heure && <span className="mr-2 text-[13px] tabular-nums text-brume">{heure}</span>}
      {bouton("haut", ThumbsUp, "Bonne réponse", "menthe")}
      {bouton("bas", ThumbsDown, "Mauvaise réponse", "alerte")}
      {pouce && <span className="text-[12px] text-brume animate-in fade-in duration-200">Noté</span>}
    </div>
  );
}

function CarteChiffres({ chiffres }) {
  return (
    <div className="my-4 overflow-hidden rounded-[16px] border border-trait">
      {chiffres.map((c, n) => (
        <div key={n} className="border-t border-trait px-5 py-4 first:border-t-0">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[14px] text-ardoise">{c.libelle}</span>
            <span className="flex-none text-[16px] font-semibold tabular-nums text-encre">{c.valeur}</span>
          </div>
          {c.detail && <p className="m-0 mt-1.5 text-[14px] leading-[1.55] text-craie">{c.detail}</p>}
        </div>
      ))}
    </div>
  );
}

export default function MessageIA({ m, question = null, surface = null, dealId = null, heure = null }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-[20px] bg-encre/[0.06] backdrop-blur-xl px-5 py-3.5 text-[15px] leading-[1.6] text-encre whitespace-pre-wrap">{m.contenu}</div>
      </div>
    );
  }
  return (
    <div>
      {morceaux(m.contenu).map((x, n) => (x.chiffres
        ? <CarteChiffres key={n} chiffres={x.chiffres} />
        : <div key={n} className="text-[15px] leading-[1.75] text-encre whitespace-pre-wrap [&+&]:mt-3">{sansMarkdown(x.texte)}</div>))}
      {surface && m.contenu ? <AvisReponse question={question} reponse={m.contenu} surface={surface} dealId={dealId} heure={heure} />
        : heure ? <p className="m-0 mt-2.5 text-[13px] tabular-nums text-brume">{heure}</p> : null}
    </div>
  );
}
