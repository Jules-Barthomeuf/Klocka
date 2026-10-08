import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Un calendrier du mois, intégré à la page (8 oct. 2026) : on voit la semaine
// et le jour qu'on choisit, au lieu d'un champ de date. Lundi en premier, les
// jours passés grisés et fermés, le week-end plus pâle, le jour choisi en
// menthe, aujourd'hui cerclé. `valeur` et `onChoisir` en AAAA-MM-JJ.

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS = ["L", "M", "M", "J", "V", "S", "D"];
const iso = (a, m, j) => `${a}-${String(m + 1).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
const aujourdhui = () => new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

export default function Calendrier({ valeur, onChoisir, min = aujourdhui(), label = "Choisir une date" }) {
  const depart = /^\d{4}-\d{2}-\d{2}$/.test(String(valeur || "")) ? valeur : min;
  const [vue, setVue] = useState(() => ({ a: Number(depart.slice(0, 4)), m: Number(depart.slice(5, 7)) - 1 }));
  const jour = aujourdhui();
  const premier = new Date(Date.UTC(vue.a, vue.m, 1)).getUTCDay(); // 0 = dimanche
  const decalage = (premier + 6) % 7;
  const nb = new Date(Date.UTC(vue.a, vue.m + 1, 0)).getUTCDate();
  const cases = [...Array(decalage).fill(null), ...Array.from({ length: nb }, (_, i) => i + 1)];
  const bouger = (d) => setVue((v) => { const m = v.m + d; return { a: v.a + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }; });
  const moisMin = min.slice(0, 7);
  const auPlusTot = iso(vue.a, vue.m, 1).slice(0, 7) <= moisMin;
  return (
    <div className="w-full max-w-[300px] select-none" role="group" aria-label={label}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => bouger(-1)} disabled={auPlusTot} aria-label="Mois précédent" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-[14px] text-encre">{MOIS[vue.m].charAt(0).toUpperCase() + MOIS[vue.m].slice(1)} {vue.a}</span>
        <button type="button" onClick={() => bouger(1)} aria-label="Mois suivant" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {JOURS.map((j, i) => <span key={i} className="pb-1 text-[11.5px] text-brume">{j}</span>)}
        {cases.map((j, i) => {
          if (!j) return <span key={`v${i}`} />;
          const d = iso(vue.a, vue.m, j);
          const passe = d < min;
          const choisi = d === valeur;
          const weekend = i % 7 >= 5;
          return (
            <button key={d} type="button" disabled={passe} onClick={() => onChoisir(d)} aria-pressed={choisi} aria-label={new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              className={`grid h-9 place-items-center rounded-full text-[13.5px] tabular-nums transition-colors disabled:cursor-default disabled:opacity-25 ${choisi ? "bg-menthe text-sur-menthe" : `${weekend ? "text-ardoise" : "text-encre"} hover:bg-relief`} ${d === jour && !choisi ? "ring-1 ring-inset ring-bord-vif" : ""}`}
              style={choisi ? undefined : { background: "transparent" }}>{j}</button>
          );
        })}
      </div>
    </div>
  );
}
