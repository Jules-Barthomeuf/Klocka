import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { EcranRejoue } from "@/components/monitoring/LecteurEcran";

// Les questions d'AK sur mes appels (16 oct. 2026, Jules). AK surveille le
// journal des appels : un appel corrigé, pas validé, validé sans appel ou
// validé trop lentement donne une question. Elle s'affiche ici dès la
// connexion : à gauche l'écran que j'avais pendant l'appel, rejoué ; à droite
// ce que j'ai fait ensuite, un court résumé d'AK et les questions. Mes
// réponses aident Jules à améliorer le module (Suivi > Appels > Retours).
// Rien ne s'affiche s'il n'y a pas de question.

const champ = "w-full rounded-champ border border-trait bg-surface px-3 py-2 text-[14px] leading-[1.5] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";
const quand = (iso) => new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const jour = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

function Question({ q, suivantes }) {
  const qc = useQueryClient();
  const [textes, setTextes] = useState({});
  useEffect(() => { setTextes({}); }, [q.id, q.questions.length]);
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["questions-appels"] });
  const envoyer = useMutation({
    mutationFn: () => base44.request("POST", `/api/questions-appels/${q.id}/reponse`, { body: { reponses: q.questions.filter((x) => !x.reponse && (textes[x.id] || "").trim()).map((x) => ({ id: x.id, texte: textes[x.id] })) } }),
    onSuccess: (r) => { toast.success(r.question.etat === "repondue" ? "Merci, c'est noté" : "Réponse enregistrée"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Ça n'est pas parti."),
  });
  const plusTard = useMutation({
    mutationFn: () => base44.request("POST", `/api/questions-appels/${q.id}/plus-tard`, { body: {} }),
    onSuccess: rafraichir,
  });
  const ouvertes = q.questions.filter((x) => !x.reponse);
  const aEcrit = ouvertes.some((x) => (textes[x.id] || "").trim());
  return (
    <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-6 max-md:grid-cols-1">
      <div className="min-w-0">
        {q.ecran?.present ? (
          <>
            <EcranRejoue key={q.id} url={`/api/questions-appels/${q.id}/ecran`} className="overflow-hidden rounded-[12px] border border-trait bg-surface-pleine p-2" />
            <p className="m-0 mt-1.5 text-[12px] text-brume">Ton écran pendant l'appel, rejoué. Gardé jusqu'au {jour(q.ecran.jusqu_au)}.</p>
          </>
        ) : (
          <div className="grid h-full min-h-[160px] place-items-center rounded-[12px] border border-dashed border-trait px-5 py-8 text-center text-[13px] text-brume">
            {q.ecran ? "L'enregistrement de cet appel n'est plus sur le serveur." : `Pas d'écran enregistré pour cet appel : il part avec la validation${q.motifs.includes("non_valide") ? ", et cet appel n'est pas validé" : ""}.`}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {q.motifs_libelles.map((m) => <span key={m} className="rounded-full border border-trait px-2.5 py-0.5 text-[11.5px] text-craie">{m}</span>)}
          </div>
          <p className="m-0 mt-2 text-[15px] leading-[1.55] text-encre">
            {q.resume || `Ton appel du ${quand(q.le_appel)}${q.agence || q.agent ? ` à ${[q.agent, q.agence].filter(Boolean).join(", ")}` : ""} pose question.`}
          </p>
        </div>

        <div>
          <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Ce que tu as fait</p>
          <ul className="m-0 mt-1.5 list-none p-0">
            {q.chronologie.map((e, k) => (
              <li key={k} className="border-t border-trait py-1.5 text-[13px] leading-[1.45] first:border-t-0">
                <span className="text-encre">{e.quoi}</span>{e.detail ? <span className="text-ardoise"> · {e.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>

        <div>
          {q.questions.map((x) => (
            <label key={x.id} className="mb-3 block">
              <span className="block text-[14px] leading-[1.5] text-encre">{x.texte}</span>
              {x.reponse
                ? <span className="mt-1 block whitespace-pre-line text-[13.5px] text-craie"><span className="text-menthe">Ta réponse · </span>{x.reponse}</span>
                : <textarea value={textes[x.id] || ""} onChange={(e) => setTextes((t) => ({ ...t, [x.id]: e.target.value }))} rows={2} placeholder="Ta réponse, même en quelques mots" className={`${champ} mt-1.5`} />}
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => envoyer.mutate()} disabled={!aEcrit || envoyer.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
              {envoyer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Envoyer ma réponse
            </button>
            <button type="button" onClick={() => plusTard.mutate()} disabled={plusTard.isPending} className="h-10 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>Plus tard</button>
            {suivantes > 0 && <span className="text-[12.5px] text-brume">Et {suivantes} autre{suivantes > 1 ? "s" : ""} ensuite.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuestionsDAK({ className = "" }) {
  const { data } = useQuery({ queryKey: ["questions-appels"], queryFn: () => base44.request("GET", "/api/questions-appels"), refetchInterval: 5 * 60_000, retry: false });
  const liste = data?.questions || [];
  if (!liste.length) return null;
  const q = liste[0];
  return (
    <section className={`rounded-[18px] border border-trait bg-rail px-5 pb-5 pt-4 ${className}`}>
      <p className="m-0 mb-3 text-[11px] tracking-[.16em] text-brume">AK A UNE QUESTION SUR TON APPEL DU {jour(q.le_appel).toUpperCase()}{q.agence ? ` · ${q.agence.toUpperCase()}` : ""}</p>
      <Question key={q.id} q={q} suivantes={liste.length - 1} />
    </section>
  );
}
