import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import OngletsSuivi from "@/components/OngletsSuivi";
import { BarresHorizontales, Cadre, VisitesParJour, useCouleurs } from "@/components/monitoring/GraphesAppels";
import Chargement from "@/components/ui/Chargement";

// Suivi > Audience (14 oct. 2026, Jules : le tableau d'audience du site, « que
// pour les clients, donc ceux qui ne sont pas admin ») : les visites de la
// plateforme par les clients, les mandataires et les visiteurs des pages
// publiques ; l'équipe n'y compte jamais. Le pays vient du fuseau horaire du
// navigateur, pas de son adresse IP.

const PERIODES = [[7, "7 jours"], [30, "30 jours"], [90, "90 jours"]];
const dureeLisible = (s) => {
  if (!s) return "0 s";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m} min ${String(r).padStart(2, "0")} s` : `${r} s`;
};
const quand = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Chiffre({ titre, valeur, evolution }) {
  const sens = evolution == null ? null : evolution >= 0;
  return (
    <div className="bg-fond px-5 py-4">
      <div className="text-[12.5px] text-ardoise">{titre}</div>
      <div className="mt-1 text-[30px] font-light tracking-[-0.02em] text-encre tabular-nums">{valeur}</div>
      <div className={`mt-0.5 text-[12.5px] tabular-nums ${sens == null ? "text-brume" : sens ? "text-menthe" : "text-alerte"}`}>
        {evolution == null ? "pas de période précédente" : `${sens ? "+" : ""}${evolution} % sur la période précédente`}
      </div>
    </div>
  );
}

export default function SuiviAudience() {
  const [jours, setJours] = useState(30);
  const c = useCouleurs();
  const q = useQuery({ queryKey: ["audience", jours], queryFn: () => base44.request("GET", `/api/monitoring/audience?jours=${jours}`) });
  const a = q.data;
  const lignes = (l) => (l || []).slice(0, 12).map((x) => ({ nom: x.nom, valeur: x.n }));
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
      <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre">Suivi</h1>
      <OngletsSuivi className="mt-4 mb-6" />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[70ch] text-[13.5px] text-ardoise">Les clients, les mandataires et les visiteurs des pages publiques. L'équipe n'y compte pas, même sans être connectée.</p>
        <div className="flex gap-1 rounded-full bg-rail-actif p-1">
          {PERIODES.map(([n, mot]) => (
            <button key={n} type="button" onClick={() => setJours(n)} aria-pressed={jours === n}
              className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${jours === n ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={jours === n ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
      </div>
      {q.isLoading || !a ? <Chargement taille="grand" /> : (
        <div className="flex flex-col gap-5">
          <div className="grid gap-px overflow-hidden rounded-[14px] border border-trait bg-trait md:grid-cols-3">
            <Chiffre titre="Visites" valeur={a.totaux.visites} evolution={a.totaux.visites_evolution} />
            <Chiffre titre="Visiteurs uniques" valeur={a.totaux.visiteurs} evolution={a.totaux.visiteurs_evolution} />
            <Chiffre titre="Durée d'une visite" valeur={dureeLisible(a.totaux.duree_s)} evolution={a.totaux.duree_evolution} />
          </div>
          <VisitesParJour parJour={a.par_jour} c={c} />
          <div className="grid gap-5 md:grid-cols-2">
            <BarresHorizontales titre="Pages" lignes={lignes(a.pages)} c={c} aide="Le nombre de visites qui ont ouvert chaque page." />
            <BarresHorizontales titre="Qui" lignes={lignes(a.roles)} c={c} />
            <BarresHorizontales titre="Pays" lignes={lignes(a.pays)} c={c} aide="D'après le fuseau horaire du navigateur." />
            <BarresHorizontales titre="Provenance" lignes={lignes(a.provenances)} c={c} aide="Le site d'où vient la visite ; Direct : un lien tapé, un favori, un mail." />
            <BarresHorizontales titre="Système" lignes={lignes(a.os)} c={c} />
            <BarresHorizontales titre="Appareil" lignes={lignes(a.appareils)} c={c} />
          </div>
          <Cadre titre={`Connexions · ${a.connexions.total} (${a.connexions.personnes} personne${a.connexions.personnes > 1 ? "s" : ""})`}>
            {a.connexions.par_personne.length ? (
              <div className="border-y border-trait">
                {a.connexions.par_personne.map((x) => (
                  <div key={x.email} className="flex items-center justify-between gap-3 border-t border-trait py-2 text-[13px] first:border-t-0">
                    <span className="min-w-0 truncate text-encre">{x.email}<span className="text-ardoise"> · {x.role === "mandataire" ? "Mandataire" : "Client"}</span></span>
                    <span className="flex-none tabular-nums text-ardoise">{x.n} connexion{x.n > 1 ? "s" : ""} · dernière le {quand(x.derniere)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="m-0 text-[12.5px] text-brume">Aucune connexion de client ni de mandataire sur la période.</p>}
          </Cadre>
          <p className="m-0 text-[12px] text-brume">Mesurée depuis le 14 octobre 2026 : les visites d'avant n'ont pas ces détails.</p>
        </div>
      )}
    </div>
  );
}
