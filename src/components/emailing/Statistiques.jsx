import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { req, pourcent } from "./commun";

// Les statistiques, dessinées sur la maquette (6 oct. 2026) : la période, cinq
// chiffres en bandeau, les envoyés et ouverts en barres, puis le détail par
// campagne et par étape d'une séquence. Les ouvertures, clics, bounces et
// plaintes viennent du webhook de Resend.

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

export default function Statistiques() {
  const [jours, setJours] = useState(30);
  const [sequenceId, setSequenceId] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["emailing-stats", jours], queryFn: () => req("GET", `/stats?jours=${jours}`) });
  const { data: lesSequences } = useQuery({ queryKey: ["emailing-sequences"], queryFn: () => req("GET", "/sequences") });
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
  const sequences = data?.sequences || [];
  const seq = sequences.find((s) => s.id === sequenceId) || sequences[0] || null;
  const delais = Object.fromEntries(((lesSequences?.sequences || []).find((s) => s.id === seq?.id)?.etapes || []).map((e) => [e.id, e.delai_jours]));
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

      <p className="m-0 mt-[30px] text-[15px] text-encre">Par campagne</p>
      <Tableau gabarit="grid-cols-[minmax(0,2.4fr)_repeat(5,minmax(0,1fr))]" colonnes={["Campagne", "Envoyés", "Ouvertures", "Clics", "Désinscriptions", "Bounces"]} vide="Aucune campagne envoyée encore."
        lignes={(data?.campagnes || []).map((c) => ({ cle: c.id, cellules: [c.nom, nombre(c.envoyes), pourcent(c.taux_ouverture), pourcent(c.taux_clic), part(c.desinscrits, c.envoyes), pourcent(c.taux_bounce)] }))} />

      <div className="mt-[30px] flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[15px] text-encre">Par étape de séquence</p>
        {sequences.length > 0 && (
          <select value={seq?.id || ""} onChange={(e) => setSequenceId(e.target.value)} className="h-9 rounded-[8px] border border-bord-doux bg-surface px-2.5 text-[13px] text-encre outline-none max-md:h-10 max-md:text-[16px]">
            {sequences.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        )}
      </div>
      <Tableau gabarit="grid-cols-[minmax(0,2.4fr)_110px_repeat(3,minmax(0,1fr))]" colonnes={["Étape", "Délai", "Envoyés", "Ouvertures", "Clics"]} vide="Aucune séquence encore."
        lignes={(seq?.etapes || []).map((e, i) => ({ cle: e.id, cellules: [`Email ${i + 1} · ${e.objet || "Sans objet"}`, delais[e.id] ? `${delais[e.id]} jour${delais[e.id] > 1 ? "s" : ""}` : "Immédiat", nombre(e.envoyes), pourcent(e.taux_ouverture), pourcent(e.taux_clic)] }))} />
      <p className="m-0 mt-6 text-[12px] text-ardoise">Les ouvertures se comptent par une image invisible, que certaines boîtes bloquent ou chargent d'office : un taux indicatif, les clics sont plus sûrs.</p>
    </div>
  );
}
