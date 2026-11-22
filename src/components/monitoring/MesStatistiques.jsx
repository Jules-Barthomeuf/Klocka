import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { base44 } from "@/api/base44Client";
import { Bulle, axe } from "@/components/monitoring/GraphesAppels";
import { Ecart, pilule } from "@/components/monitoring/ApercuStatistiques";
import Chargement from "@/components/ui/Chargement";

// « Mes statistiques » (22 nov. 2026, maquette de Jules) : une personne, par jour sur les 30 derniers jours (mois glissant),
// comparés aux 30 jours d'avant, en pointillés. Quatre chiffres au choix ; la personne connectée d'abord, les autres d'un
// clic. Le calcul : server/statistiques.js, parJourPersonne.

const CHIFFRES = [["fiches", "Fiches reçues"], ["dossiers", "Dossiers étudiés"], ["projets", "Projets"], ["presentations", "Présentations"]];
const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const moins = (j, n) => new Date(Date.parse(`${j}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

export default function MesStatistiques({ equipe, moi, c }) {
  const [qui, setQui] = useState(() => (equipe.some((a) => a.email === moi) ? moi : equipe[0]?.email));
  const [chiffre, setChiffre] = useState("fiches");
  const { data, isLoading } = useQuery({ queryKey: ["statistiques-personne", qui], queryFn: () => base44.request("GET", `/api/statistiques/personne?email=${encodeURIComponent(qui)}`), enabled: !!qui, placeholderData: (prev) => prev, staleTime: 30_000 });
  const couleur = equipe.find((a) => a.email === qui)?.teinte || c.menthe;
  const nom = CHIFFRES.find(([k]) => k === chiffre)[1];
  const serie = data?.serie || [];
  const dernier = serie.length - 1;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[20px] font-normal text-encre">Mes statistiques</h2>
          <p className="m-0 mt-1 text-[12.5px] text-ardoise">Par jour, sur les 30 derniers jours (mois glissant), comparés aux 30 jours d'avant.</p>
        </div>
        <div role="group" aria-label="Les statistiques de" className="flex flex-wrap gap-1.5">
          {equipe.map((a) => (
            <button key={a.email} type="button" onClick={() => setQui(a.email)} aria-pressed={qui === a.email} className={pilule(qui === a.email)} style={{ background: qui === a.email ? undefined : "transparent" }}>
              <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: a.teinte }} />{a.prenom}
            </button>
          ))}
        </div>
      </div>

      <div className="k-verre p-4">
        {!data && isLoading ? <Chargement /> : (
          <>
            <div role="group" aria-label="Le chiffre" className="mb-3 flex flex-wrap gap-2">
              {CHIFFRES.map(([k, mot]) => {
                const t = data?.totaux?.[k] || { actuel: 0, avant: 0 };
                const actif = chiffre === k;
                return (
                  <button key={k} type="button" onClick={() => setChiffre(k)} aria-pressed={actif}
                    className={`inline-flex h-10 items-center gap-2 rounded-[12px] border px-3.5 text-[13px] transition-colors ${actif ? "border-menthe bg-menthe/[0.1] text-encre" : "border-bord text-craie hover:border-bord-vif"}`} style={{ background: actif ? undefined : "transparent" }}>
                    {mot}<span className="text-[15px] font-medium tabular-nums text-encre">{t.actuel}</span><Ecart actuel={t.actuel} avant={t.avant} />
                  </button>
                );
              })}
            </div>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-craie">
              <span className="inline-flex items-center gap-1.5"><svg aria-hidden width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke={couleur} strokeWidth="2" /></svg>30 derniers jours</span>
              <span className="inline-flex items-center gap-1.5"><svg aria-hidden width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke={c.ardoise} strokeWidth="1.5" strokeDasharray="3 3" /></svg>30 jours d'avant</span>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer>
                <AreaChart data={serie} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="kstat-perso" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={couleur} stopOpacity={0.26} />
                      <stop offset="100%" stopColor={couleur} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={c.trait} />
                  <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={24} {...axe(c)} />
                  <YAxis allowDecimals={false} {...axe(c)} />
                  <Tooltip cursor={{ stroke: c.ardoise, strokeWidth: 1 }} content={({ active, payload }) => (active && payload?.length ? (
                    <Bulle titre={jourLong(payload[0].payload.jour)} lignes={[{ nom, valeur: payload[0].payload[chiffre], couleur }, { nom: `Le ${jourCourt(moins(payload[0].payload.jour, 30))}`, valeur: payload[0].payload[`${chiffre}_avant`], couleur: c.ardoise }]} />
                  ) : null)} />
                  <Line type="monotone" dataKey={`${chiffre}_avant`} stroke={c.ardoise} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey={chiffre} stroke={couleur} strokeWidth={2} fill="url(#kstat-perso)" isAnimationActive={false}
                    dot={(p) => (p.index === dernier ? <circle key="fin" cx={p.cx} cy={p.cy} r={5} fill={couleur} stroke={c["surface-pleine"]} strokeWidth={2} /> : <g key={p.index} />)} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
