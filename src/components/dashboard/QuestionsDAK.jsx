import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
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

const prenom = (email) => { const p = String(email || "").split("@")[0].split(".")[0]; return p ? p.charAt(0).toUpperCase() + p.slice(1) : "?"; };

/**
 * Pour Jules : une question posée à un analyste, en lecture seule (16 oct. 2026,
 * Jules : « je ne vais pas répondre, mais ça me permet de voir et de tester »).
 * La ligne s'ouvre sur ce que l'analyste voit : son écran, le résumé, ce qu'il
 * a fait, les questions et ses réponses.
 */
function QuestionEquipe({ q }) {
  const [ouvert, setOuvert] = useState(false);
  const repondues = q.questions.filter((x) => x.reponse).length;
  return (
    <div className="border-t border-trait first:border-t-0">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-3 text-left" style={{ background: "transparent" }}>
        <span className="text-[14px] text-encre">{prenom(q.par)}</span>
        <span className="min-w-0 truncate text-[13.5px] text-craie">{q.agence || q.agent || "Appel"}</span>
        <span className="text-[12.5px] text-brume">{quand(q.le_appel)}</span>
        <span className="flex flex-wrap gap-1.5">{q.motifs_libelles.map((m) => <span key={m} className="rounded-full border border-trait px-2 py-0.5 text-[11.5px] text-craie">{m}</span>)}</span>
        <span className={`ml-auto text-[12.5px] ${q.etat === "repondue" ? "text-menthe" : "text-ambre"}`}>{q.etat === "repondue" ? "Répondue" : repondues ? `${repondues} réponse${repondues > 1 ? "s" : ""} sur ${q.questions.length}` : "Sans réponse"}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-brume transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && (
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-6 pb-5 max-md:grid-cols-1">
          <div className="min-w-0">
            {q.ecran?.present
              ? <EcranRejoue key={q.id} url={`/api/questions-appels/${q.id}/ecran`} className="overflow-hidden rounded-[12px] border border-trait bg-surface-pleine p-2" />
              : <div className="grid min-h-[140px] place-items-center rounded-[12px] border border-dashed border-trait px-5 py-8 text-center text-[13px] text-brume">{q.ecran ? "L'enregistrement de cet appel n'est plus sur le serveur." : "Pas d'écran enregistré pour cet appel : il part avec la validation."}</div>}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <p className="m-0 text-[15px] leading-[1.55] text-encre">{q.resume || `L'appel du ${quand(q.le_appel)} pose question.`}</p>
            <ul className="m-0 list-none p-0">
              {q.chronologie.map((e, k) => <li key={k} className="border-t border-trait py-1.5 text-[13px] leading-[1.45] first:border-t-0"><span className="text-encre">{e.quoi}</span>{e.detail ? <span className="text-ardoise"> · {e.detail}</span> : null}</li>)}
            </ul>
            <div>
              {q.questions.map((x) => (
                <div key={x.id} className="mb-3">
                  <p className="m-0 text-[14px] leading-[1.5] text-encre">{x.texte}</p>
                  {x.reponse
                    ? <p className="m-0 mt-1 whitespace-pre-line text-[13.5px] text-craie"><span className="text-menthe">{prenom(q.par)} · </span>{x.reponse}</p>
                    : <p className="m-0 mt-1 text-[13px] text-ambre">Pas encore de réponse.</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuestionsDAK({ className = "" }) {
  const { data } = useQuery({ queryKey: ["questions-appels"], queryFn: () => base44.request("GET", "/api/questions-appels"), refetchInterval: 5 * 60_000, retry: false });
  const liste = data?.questions || [];
  const equipe = data?.equipe || [];
  if (!liste.length && !equipe.length) return null;
  const q = liste[0];
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {q && (
        <section className="rounded-[18px] border border-trait bg-rail px-5 pb-5 pt-4">
          <p className="m-0 mb-3 text-[11px] tracking-[.16em] text-brume">AK A UNE QUESTION SUR TON APPEL DU {jour(q.le_appel).toUpperCase()}{q.agence ? ` · ${q.agence.toUpperCase()}` : ""}</p>
          <Question key={q.id} q={q} suivantes={liste.length - 1} />
        </section>
      )}
      {/* Pour Jules : toutes les questions posées aux analystes, en lecture seule (16 oct. 2026). */}
      {equipe.length > 0 && (
        <section className="rounded-[18px] border border-trait bg-rail px-5 pb-2 pt-4">
          <p className="m-0 mb-1 text-[11px] tracking-[.16em] text-brume">POSÉES À L'ÉQUIPE · {equipe.length}</p>
          <p className="m-0 mb-2 text-[12.5px] text-brume">Ce que chaque analyste voit sur son Dashboard. Tu ne réponds pas : tu regardes et tu testes.</p>
          {equipe.map((x) => <QuestionEquipe key={x.id} q={x} />)}
        </section>
      )}
    </div>
  );
}
