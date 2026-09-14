import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Copy, Check, Loader2, Power } from "lucide-react";

/**
 * Quand le serveur est tombé, et pourquoi.
 *
 * Une erreur « le serveur n'a pas répondu » dans l'interface n'a d'explication
 * que si la chute a laissé une trace. Le terminal qui lance `npm run dev` se
 * referme, et chez un hébergeur les journaux tournent : le lendemain, il ne
 * reste rien. Le serveur écrit donc chaque rejet, chaque exception et chaque
 * démarrage dans server/data/incidents.log, et cette page les montre.
 *
 * Un démarrage est un incident comme un autre : c'est lui qui date les
 * redémarrages, et donc les erreurs qu'ils ont provoquées dans l'interface.
 */
const ETIQUETTES = {
  exception: { mot: "Exception", teinte: "text-alerte", Icone: AlertTriangle },
  rejet: { mot: "Rejet non traité", teinte: "text-ambre", Icone: AlertTriangle },
  demarrage: { mot: "Démarrage", teinte: "text-ardoise", Icone: Power },
};

const quand = (iso) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const duree = (depuis) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(depuis).getTime()) / 1000));
  if (s < 90) return `${s} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
};

export default function Incidents() {
  const [deplie, setDeplie] = useState(null);
  const [copie, setCopie] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["incidents"],
    queryFn: () => base44.request("GET", "/api/monitoring/incidents?limite=60"),
    staleTime: 15000,
  });

  const incidents = data?.incidents || [];
  const chutes = incidents.filter((i) => i.type !== "demarrage");

  // De quoi coller l'incident dans une conversation, tel quel.
  const copier = async () => {
    const texte = incidents.slice(0, 10).map((i) => `${i.le} · ${i.type} · ${i.message}${i.pile ? `\n${i.pile}` : ""}`).join("\n\n");
    try { await navigator.clipboard.writeText(texte); setCopie(true); setTimeout(() => setCopie(false), 1800); }
    catch { window.prompt("Copiez les incidents :", texte); }
  };

  return (
    <section className="mt-10 border-t border-trait pt-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[.16em] text-ardoise">Incidents</div>
          <h2 className="m-0 text-[18px] font-normal text-encre">Quand le serveur est tombé</h2>
          <p className="mb-0 mt-2 max-w-[62ch] text-[12.5px] leading-[1.65] text-ardoise">
            Les exceptions, les rejets non traités et les démarrages. Une erreur « le serveur n'a pas répondu »
            dans l'interface se lit ici : un démarrage à la même minute, c'est un redémarrage ; une exception, sa pile est en dessous.
            {data?.depuis && <> Le serveur tourne depuis {duree(data.depuis)}, sans interruption.</>}
          </p>
        </div>
        {incidents.length > 0 && (
          <button onClick={copier} className="inline-flex items-center gap-1.5 rounded-md border border-bord px-3 py-1.5 text-[12.5px] text-ardoise transition-colors hover:border-bord-vif hover:text-encre">
            {copie ? <Check className="h-3 w-3 text-menthe" /> : <Copy className="h-3 w-3" />}
            {copie ? "Copié" : "Copier les dix derniers"}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-[12.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" /> Lecture…</div>
      ) : incidents.length === 0 ? (
        <p className="m-0 text-[12.5px] text-brume">Rien. Le serveur n'est pas tombé depuis que ce journal existe.</p>
      ) : (
        <>
          {chutes.length === 0 && (
            <p className="m-0 mb-4 text-[12.5px] text-brume">Aucune chute : seulement des démarrages, qui sont des redémarrages voulus.</p>
          )}
          <div className="flex flex-col">
            {incidents.map((i, n) => {
              const e = ETIQUETTES[i.type] || ETIQUETTES.rejet;
              const ouvert = deplie === n;
              return (
                <div key={`${i.le}-${n}`} className="border-t border-trait py-3 first:border-t-0">
                  <button
                    onClick={() => setDeplie(ouvert ? null : n)}
                    disabled={!i.pile}
                    className="grid w-full grid-cols-[130px_150px_minmax(0,1fr)] items-baseline gap-3 text-left disabled:cursor-default"
                  >
                    <span className="text-[12.5px] tabular-nums text-ardoise">{quand(i.le)}</span>
                    <span className={`inline-flex items-center gap-1.5 text-[12.5px] ${e.teinte}`}><e.Icone className="h-3 w-3" />{e.mot}</span>
                    <span className="truncate text-[12.5px] text-craie">{i.message}</span>
                  </button>
                  {ouvert && i.pile && (
                    <pre className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap rounded-md border border-trait bg-fond px-3 py-2 font-mono text-[11px] leading-[1.6] text-ardoise">{i.pile}</pre>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
