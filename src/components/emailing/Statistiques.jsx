import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { req, pourcent } from "./commun";

// Les statistiques, dessinées sur la maquette (6 oct. 2026) : la période, cinq
// chiffres en bandeau, les envoyés et ouverts en barres. Depuis le 9 oct. 2026
// (plan des newsletters) : la santé du domaine avec ses seuils, l'entonnoir
// d'une newsletter jusqu'au call (l'indicateur principal), le détail de chaque
// mail, et les contacts à cibler. Les ouvertures, clics, bounces et plaintes
// viennent du webhook de Resend ; le simulateur et les calls, des liens
// personnels et de Calendly.

const PERIODES = [[7, "7 j"], [30, "30 j"], [90, "90 j"], [365, "12 mois"]];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const JOURS = ["D", "L", "M", "M", "J", "V", "S"];
const nombre = (n) => Number(n || 0).toLocaleString("fr-FR");
const part = (n, sur) => pourcent(sur ? (n / sur) * 100 : 0);
const jourIso = (d) => d.toISOString().slice(0, 10);

/**
 * Les envois par jour regroupés en barres selon la période. 7 jours : une
 * barre par jour ; 30 : par trois jours ; 90 : par semaine ; 12 mois : par
 * mois. Chaque barre porte son libellé (vide quand il chargerait l'axe).
 */
function barres(parJour, jours) {
  const fin = new Date();
  fin.setHours(12, 0, 0, 0);
  const debut = new Date(fin.getTime() - (jours - 1) * 86400000);
  const parDate = new Map((parJour || []).map((j) => [j.jour, j]));
  const seaux = [];
  if (jours === 365) {
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(fin.getFullYear(), fin.getMonth() - i, 1);
      seaux.push({ libelle: MOIS[d.getMonth()], cle: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, envoyes: 0, ouverts: 0 });
    }
    for (const j of parJour || []) { const s = seaux.find((x) => j.jour.startsWith(x.cle)); if (s) { s.envoyes += j.envoyes; s.ouverts += j.ouverts; } }
    return seaux;
  }
  const pas = jours === 7 ? 1 : jours === 30 ? 3 : 7;
  for (let t = debut.getTime(), n = 0; t <= fin.getTime(); t += pas * 86400000, n += 1) {
    const s = { envoyes: 0, ouverts: 0, libelle: "" };
    for (let k = 0; k < pas; k += 1) {
      const j = parDate.get(jourIso(new Date(t + k * 86400000)));
      if (j) { s.envoyes += j.envoyes; s.ouverts += j.ouverts; }
    }
    const d = new Date(t);
    s.libelle = pas === 1 ? JOURS[d.getDay()] : pas === 3 ? (n % 2 ? "" : `S${n / 2 + 1}`) : d.getDate() <= 7 ? MOIS[d.getMonth()] : "";
    seaux.push(s);
  }
  return seaux;
}

function Barres({ seaux }) {
  const max = Math.max(...seaux.map((s) => s.envoyes), 1);
  if (!seaux.some((s) => s.envoyes)) return <p className="m-0 flex h-[160px] items-center justify-center text-[13px] text-brume">Aucun envoi sur la période.</p>;
  return (
    <div className="mt-4 flex h-[160px] items-end gap-2 max-md:gap-1">
      {seaux.map((s, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${nombre(s.envoyes)} envoyés, ${nombre(s.ouverts)} ouverts`}>
          <div className="flex w-full max-w-[34px] items-end rounded-t-[4px] bg-bord-vif" style={{ height: `${(s.envoyes / max) * 100}%` }}>
            <div className="w-full rounded-t-[4px] bg-menthe-pale" style={{ height: `${s.envoyes ? (s.ouverts / s.envoyes) * 100 : 0}%` }} />
          </div>
          <span className="h-3.5 text-[11px] leading-none text-ardoise">{s.libelle}</span>
        </div>
      ))}
    </div>
  );
}

function Tableau({ colonnes, gabarit, lignes, vide }) {
  if (!lignes.length) return <p className="m-0 mt-3 text-[13px] text-brume">{vide}</p>;
  return (
    <div className="mt-3 overflow-x-auto rounded-[14px] border border-trait bg-rail">
      <div className="min-w-[720px]">
        <div className={`grid ${gabarit} gap-3.5 border-b border-trait bg-surface-pleine px-4 py-[11px] text-[12px] text-ardoise`}>{colonnes.map((c) => <div key={c}>{c}</div>)}</div>
        {lignes.map((l) => (
          <div key={l.cle} className={`grid ${gabarit} gap-3.5 border-b border-trait px-4 py-3 text-[13px] last:border-b-0`}>
            {l.cellules.map((v, i) => <div key={i} className={i ? "tabular-nums text-craie" : "min-w-0 truncate text-encre"}>{v}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

const SEUILS_MOTS = { bounce: "Bounces", plainte: "Plaintes", desinscription: "Désinscriptions" };

/** La santé du domaine : trois taux et leur seuil ; au-delà, l'alerte. */
function Sante({ jours }) {
  const { data } = useQuery({ queryKey: ["emailing-sante", jours], queryFn: () => req("GET", `/sante?jours=${jours}`) });
  if (!data) return null;
  return (
    <div className="mt-[30px]">
      <p className="m-0 text-[15px] text-encre">Santé du domaine</p>
      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-[14px] border border-trait bg-trait max-md:grid-cols-1">
        {Object.keys(SEUILS_MOTS).map((k) => {
          const alerte = data.alertes.includes(k);
          return (
            <div key={k} className="bg-rail p-[18px] max-md:p-4">
              <p className="m-0 text-[12.5px] text-ardoise">{SEUILS_MOTS[k]}</p>
              <p className={`m-0 mt-2 text-[22px] tabular-nums ${alerte ? "text-alerte" : "text-encre"}`}>{pourcent(data.taux[k])}</p>
              <p className={`m-0 mt-1 text-[12px] ${alerte ? "text-alerte" : "text-ardoise"}`}>{alerte ? `Au-dessus du seuil de ${pourcent(data.seuils[k])}` : `Seuil : ${pourcent(data.seuils[k])}`}</p>
            </div>
          );
        })}
      </div>
      <p className="m-0 mt-2 text-[12px] text-ardoise">{data.envoyes < 50 ? "Moins de 50 envois sur la période : les taux sont indicatifs, aucune alerte." : `Sur ${nombre(data.envoyes)} envois. Au-dessus d'un seuil, Gmail et Outlook classent plus vite en spam : nettoyer la liste avant le prochain envoi.`}</p>
    </div>
  );
}

/** L'entonnoir d'une newsletter, jusqu'au call, et chaque mail. */
function ParNewsletter() {
  const [id, setId] = useState("");
  const { data: liste } = useQuery({ queryKey: ["emailing-newsletters"], queryFn: () => req("GET", "/newsletters") });
  const nls = liste?.newsletters || [];
  const nid = id || nls[0]?.id || "";
  const { data } = useQuery({ queryKey: ["emailing-newsletter-stats", nid], queryFn: () => req("GET", `/newsletters/${nid}/stats`), enabled: !!nid });
  const e = data?.entonnoir;
  const etapes = e ? [["Envoyés", e.envoyes], ["Délivrés", e.delivres], ["Ouverts", e.ouverts], ["Cliqués", e.cliques], ["Simulateur utilisé", e.simulateur], ["Call pris", e.calls]] : [];
  const max = Math.max(1, e?.envoyes || 0);
  return (
    <div className="mt-[30px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[15px] text-encre">Par newsletter</p>
        {nls.length > 0 && (
          <select value={nid} onChange={(x) => setId(x.target.value)} className="h-9 rounded-[8px] border border-bord-doux bg-surface px-2.5 text-[13px] text-encre outline-none max-md:h-10 max-md:text-[16px]">
            {nls.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
          </select>
        )}
      </div>
      {!nls.length ? <p className="m-0 mt-3 text-[13px] text-brume">Aucune newsletter encore.</p> : (
        <>
          <div className="mt-3 flex flex-col gap-2.5 rounded-[14px] border border-trait bg-rail px-5 py-[18px] max-md:px-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-ardoise">Calls pris</span>
              <span className="text-[28px] tabular-nums text-menthe">{nombre(e?.calls)}</span>
            </div>
            {etapes.map(([mot, v], k) => (
              <div key={mot} className="grid grid-cols-[150px_minmax(0,1fr)_110px] items-center gap-3 text-[13px] max-md:grid-cols-[110px_minmax(0,1fr)_80px]">
                <span className="text-craie">{mot}</span>
                <span className="h-2 overflow-hidden rounded-full bg-encre/[0.06]"><span className={`block h-full rounded-full ${mot === "Call pris" ? "bg-menthe" : "bg-menthe-pale"}`} style={{ width: `${((v || 0) / max) * 100}%` }} /></span>
                <span className="text-right tabular-nums text-encre">{nombre(v)}{k ? <span className="text-ardoise"> · {part(v, etapes[k - 1][1])}</span> : null}</span>
              </div>
            ))}
            <p className="m-0 text-[12px] text-ardoise">En contacts : chaque étape rapportée à la précédente. Le simulateur et le call comptent après le premier mail reçu.</p>
          </div>
          <Tableau gabarit="grid-cols-[minmax(0,2.2fr)_100px_repeat(4,minmax(0,1fr))_minmax(0,1.6fr)]" colonnes={["Mail", "Parti le", "Envoyés", "Ouvertures", "Clics", "Désinscr.", "Lien le plus cliqué"]} vide="Aucun mail encore."
            lignes={(data?.mails || []).map((m) => ({ cle: m.id, cellules: [`Mail ${m.rang + 1} · ${m.objet || "Sans objet"}`, m.envoye_le ? new Date(m.envoye_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : m.statut === "pret" ? "Prêt" : "Brouillon", nombre(m.envoyes), pourcent(m.taux_ouverture), pourcent(m.taux_clic), nombre(m.desinscrits), m.liens?.[0] ? `${String(m.liens[0].lien).replace(/^https?:\/\/(www\.)?/, "").split("?")[0]} · ${m.liens[0].clics}` : "—"] }))} />
        </>
      )}
    </div>
  );
}

/** Les contacts à cibler : ceux qui ont utilisé le simulateur sans prendre de call, puis les plus engagés. */
function ACibler() {
  const [filtre, setFiltre] = useState("simulateur_sans_call");
  const { data } = useQuery({ queryKey: ["emailing-engagement", filtre], queryFn: () => req("GET", `/engagement?filtre=${filtre === "tous" ? "" : filtre}`) });
  const lignes = (data?.contacts || []).map((c) => ({ cle: c.id, cellules: [[c.prenom, c.nom].filter(Boolean).join(" ") || c.email, nombre(c.score), nombre(c.ouverts), nombre(c.cliques), nombre(c.simulateur), c.call ? "Oui" : "Non"] }));
  return (
    <div className="mt-[30px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[15px] text-encre">Contacts à cibler</p>
        <div className="flex gap-1.5">
          {[["simulateur_sans_call", "Simulateur sans call"], ["tous", "Les plus engagés"]].map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setFiltre(k)} aria-pressed={filtre === k} className={`rounded-[8px] px-3 py-1.5 text-[13px] transition-colors ${filtre === k ? "bg-relief text-encre" : "text-ardoise hover:text-encre"}`} style={filtre === k ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
      </div>
      <Tableau gabarit="grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))]" colonnes={["Contact", "Score", "Ouvertures", "Clics", "Simulateur", "Call"]} lignes={lignes}
        vide={filtre === "simulateur_sans_call" ? "Personne n'a encore utilisé le simulateur sans prendre de call." : "Aucun engagement mesuré encore."} />
      <p className="m-0 mt-2 text-[12px] text-ardoise">Score : 1 par ouverture, 3 par clic, 5 par passage au simulateur, 20 pour un call.</p>
    </div>
  );
}

export default function Statistiques() {
  const [jours, setJours] = useState(30);
  const { data, isLoading } = useQuery({ queryKey: ["emailing-stats", jours], queryFn: () => req("GET", `/stats?jours=${jours}`) });
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const g = data?.globales || {};
  const periode = PERIODES.find(([j]) => j === jours)?.[1];
  const chiffres = [
    ["Envoyés", nombre(g.envoyes), periode],
    ["Ouvertures", pourcent(g.taux_ouverture), `${nombre(g.ouverts)} contacts`],
    ["Clics", pourcent(g.taux_clic), `${nombre(g.cliques)} contacts`],
    ["Désinscriptions", part(g.desinscrits, g.envoyes), nombre(g.desinscrits)],
    ["Bounces", pourcent(g.taux_bounce), nombre(g.bounces)],
  ];
  return (
    <div className="px-10 pb-20 pt-7 max-md:px-4 max-md:pt-5">
      <div className="flex gap-1.5">
        {PERIODES.map(([j, mot]) => (
          <button key={j} type="button" onClick={() => setJours(j)} aria-pressed={jours === j}
            className={`rounded-[8px] px-3 py-1.5 text-[13px] transition-colors max-md:py-2 ${jours === j ? "bg-relief text-encre" : "text-ardoise hover:text-encre"}`}
            style={jours === j ? undefined : { background: "transparent" }}>{mot}</button>
        ))}
      </div>

      <div className="mt-[18px] grid grid-cols-5 gap-px overflow-hidden rounded-[14px] border border-trait bg-trait max-md:grid-cols-2">
        {chiffres.map(([mot, valeur, sous]) => (
          <div key={mot} className="bg-rail p-[18px] max-md:p-4">
            <p className="m-0 text-[12.5px] text-ardoise">{mot}</p>
            <p className="m-0 mt-2 text-[26px] tracking-[-0.01em] text-encre tabular-nums max-md:text-[22px]">{valeur}</p>
            <p className="m-0 mt-1 text-[12px] text-ardoise">{sous}</p>
          </div>
        ))}
      </div>

      <div className="mt-[18px] rounded-[14px] border border-trait bg-rail px-5 py-[18px] max-md:px-4">
        <div className="flex flex-wrap justify-between gap-3 text-[13px]">
          <span className="text-encre">Envoyés et ouverts</span>
          <span className="flex gap-3.5 text-[12px] text-ardoise">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-bord-vif" />Envoyés</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-menthe-pale" />Ouverts</span>
          </span>
        </div>
        <Barres seaux={barres(g.par_jour, jours)} />
      </div>

      <Sante jours={jours} />
      <ParNewsletter />
      <ACibler />
      <p className="m-0 mt-6 text-[12px] text-ardoise">Les ouvertures se comptent par une image invisible, que certaines boîtes bloquent ou chargent d'office : un taux indicatif, les clics sont plus sûrs.</p>
    </div>
  );
}
