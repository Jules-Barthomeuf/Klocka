import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { EnTeteAlx, Carte, GrilleStats, Stat } from "@/components/alx/alx-commun";

// Ce qui a marché. C'est ici qu'on ajuste les seuils du fichier de règles :
// un signal qui ne convertit jamais n'en est pas un, une rue qui ne répond
// pas ne vaut pas un second passage.

function BarreSignal({ cle, total, reponses, max }) {
  const pct = max ? Math.round((total / max) * 100) : 0;
  const tauxReponse = total ? Math.round((reponses / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)_54px] gap-3 items-center">
      <div className="text-[13px] text-craie truncate">{cle}</div>
      <div className="h-2 rounded bg-white/[0.06]">
        <div className="h-2 rounded bg-menthe" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <div className="text-[13px] text-right tabular-nums">{tauxReponse} %</div>
    </div>
  );
}

function TableauRue({ lignes, vide }) {
  if (!lignes?.length) return <p className="m-0 text-[12.5px] text-brume">{vide}</p>;
  return (
    <div className="flex flex-col">
      {lignes.map((l) => (
        <div key={l.cle} className="grid grid-cols-[minmax(0,1fr)_70px_70px] gap-3 py-[11px] border-t border-trait first:border-t-0 text-[13px]">
          <span className="text-craie truncate">{l.cle}</span>
          <span className="text-ardoise text-right">{l.total} envoi{l.total > 1 ? "s" : ""}</span>
          <span className="text-right text-encre">{l.reponses}</span>
        </div>
      ))}
    </div>
  );
}

function TableauRefus({ lignes }) {
  if (!lignes?.length) return <p className="m-0 text-[12.5px] text-brume">Aucun refus encore. Ça viendra, et c'est de l'information.</p>;
  return (
    <div className="flex flex-col">
      {lignes.map((l) => (
        <div key={l.cle} className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 py-[11px] border-t border-trait first:border-t-0 text-[13px]">
          <span className="text-craie truncate">{l.cle}</span>
          <span className="text-ardoise text-right">{l.total} fois</span>
        </div>
      ))}
    </div>
  );
}

export default function ALXBilan() {
  const user = useUser();
  const { data } = useQuery({ queryKey: ["alx-bilan"], queryFn: () => base44.request("GET", "/api/alx/bilan") });
  if (!user || user.role !== "admin") return null;

  const c = data?.cibles || {};
  const a = data?.approches || {};
  const parCanal = data?.par_canal || [];
  const mails = parCanal.find((x) => x.cle === "mail")?.total || 0;
  const courriers = parCanal.find((x) => x.cle === "courrier")?.total || 0;
  const parSignal = data?.par_signal || [];
  const maxSignal = Math.max(1, ...parSignal.map((s) => s.total));

  return (
    <div className="bg-fond min-h-screen text-encre">
      <div className="max-w-[1440px] mx-auto px-7 pt-7 pb-20">
        <EnTeteAlx titre="Bilan" sous="Ce qui a répondu, par rue, par signal, par canal. C'est ici qu'on décide de reculer un seuil ou d'abandonner un tronçon." />

        <div className="flex flex-col gap-5">
          <GrilleStats>
            <Stat label="Approches envoyées" valeur={a.total || 0} detail={a.total ? `${courriers} courriers · ${mails} mails` : "aucune encore"} />
            <Stat
              label="Réponses"
              valeur={a.reponses || 0}
              teinte="var(--k-menthe)"
              detail={a.total ? `${Math.round(((a.reponses || 0) / a.total) * 100)} % · délai médian ${a.delai_median_jours ?? "—"} jours` : "—"}
            />
            <Stat label="Rendez-vous obtenus" valeur={a.oui || 0} detail={`dont ${c.en_dossier || 0} avec bail communiqué`} />
            <Stat label="Dossiers créés" valeur={c.en_dossier || 0} detail="entrés en analyse, étape 1" />
          </GrilleStats>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Carte className="flex flex-col gap-[18px]">
              <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Réponses par type de signal</div>
              {parSignal.length ? (
                <div className="flex flex-col gap-3.5">
                  {parSignal.map((s) => <BarreSignal key={s.cle} cle={s.cle} total={s.total} reponses={s.reponses} max={maxSignal} />)}
                </div>
              ) : (
                <p className="m-0 text-[12.5px] text-brume">Aucune approche encore.</p>
              )}
            </Carte>

            <Carte className="flex flex-col gap-[18px]">
              <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Réponses par rue</div>
              <TableauRue lignes={data?.par_rue} vide="Aucune approche encore." />
            </Carte>

            <Carte className="flex flex-col gap-[18px]">
              <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Motifs de refus</div>
              <TableauRefus lignes={data?.motifs_refus} />
              <p className="m-0 text-[12px] text-brume leading-[1.6] border-t border-trait pt-3.5">
                C'est ici qu'on cale les seuils des trois piles.
              </p>
            </Carte>
          </div>
        </div>
      </div>
    </div>
  );
}
