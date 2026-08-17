import React, { useState, useMemo } from "react";
import { TrendingDown } from "lucide-react";

// Négociation en % de baisse sur le prix négocié FAI.
// On recalcule un jeu d'indicateurs clés pour chaque niveau afin de comparer l'impact.
const NIVEAUX = [0, 2, 5, 8, 10, 12, 15];

function PMT(rate, nper, pv) {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
}

// Recalcul allégé des indicateurs clés en fonction d'un prix négocié donné.
// Reprend la même logique de coûts que la page principale (droits, fees, frais, crédit, revente).
function computeScenario(params, prixNegocie) {
  const {
    prixBienFAI, apport: apportBase, prixBienNegocieRef,
    tauxDroitsEnregistrement, tauxFeesKlocka, feesKlockaType, tauxIncentiveKlocka,
    fraisDossierBancaire, coutCreationSociete, fraisCourtage,
    dureeCredit, tauxInteret, loyerInitialHTHC, indexation,
    anneeRevente, tauxCommissionAgentRevente, rendementBrutAcheteur
  } = params;

  const feesKlocka = feesKlockaType === "fixe" ? tauxFeesKlocka : prixNegocie * (tauxFeesKlocka / 100);
  const incentiveKlocka = (prixBienFAI - prixNegocie) * (tauxIncentiveKlocka / 100);
  const totalFraisKlocka = feesKlocka + incentiveKlocka;
  const droitsEnregistrement = prixNegocie * (tauxDroitsEnregistrement / 100);
  const fraisDivers = fraisDossierBancaire + coutCreationSociete + fraisCourtage;
  const prixRevient = prixNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers;

  // On conserve le même ratio d'apport que le scénario de référence.
  const ratioApport = prixBienNegocieRef > 0 ? apportBase / prixBienNegocieRef : 0.15;
  const apport = Math.round(prixRevient * (ratioApport > 0 ? Math.min(ratioApport, 1) : 0.15));
  const montantEmprunt = Math.max(0, prixRevient - apport);
  const echeanceMensuelle = montantEmprunt > 0 ? Math.abs(PMT(tauxInteret / 100 / 12, dureeCredit * 12, montantEmprunt)) : 0;

  // Loyer à l'année de revente (indexé)
  let loyerRevente = loyerInitialHTHC;
  for (let a = 2; a <= anneeRevente; a++) loyerRevente = loyerRevente * (1 + indexation / 100);

  const prixVenteFAI = rendementBrutAcheteur > 0 ? loyerRevente / (rendementBrutAcheteur / 100) : 0;
  const commissionRevente = prixVenteFAI * (tauxCommissionAgentRevente / 100);
  const prixVenteNet = prixVenteFAI - commissionRevente;

  // Capital restant dû à l'année de revente
  let capitalRestant = montantEmprunt;
  const tauxMensuel = tauxInteret / 100 / 12;
  for (let m = 0; m < anneeRevente * 12 && capitalRestant > 0; m++) {
    const interet = capitalRestant * tauxMensuel;
    capitalRestant = Math.max(0, capitalRestant - (echeanceMensuelle - interet));
  }

  const margeBrute = prixVenteNet - prixRevient;
  const rendementBrut = prixRevient > 0 ? loyerInitialHTHC / prixRevient * 100 : 0;
  const patrimoineNet = prixVenteNet - capitalRestant;
  const creationRichesse = prixVenteNet - capitalRestant - apport;

  return {
    prixNegocie: Math.round(prixNegocie),
    prixRevient: Math.round(prixRevient),
    apport,
    montantEmprunt: Math.round(montantEmprunt),
    echeanceMensuelle: Math.round(echeanceMensuelle),
    rendementBrut: rendementBrut.toFixed(2),
    prixVenteNet: Math.round(prixVenteNet),
    margeBrute: Math.round(margeBrute),
    patrimoineNet: Math.round(patrimoineNet),
    creationRichesse: Math.round(creationRichesse)
  };
}

function StatCell({ label, value, highlight }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[hsl(var(--background))]">{label}</span>
      <span className={`text-sm tabular-nums ${highlight ? "text-[#33d6c0]" : "text-white"}`}>{value}</span>
    </div>);

}

export default function SimScenarios({ params, formatCurrency, selectedNiveau, onSelectNiveau }) {
  const [internalNiveau, setInternalNiveau] = useState(0);
  const [customPrix, setCustomPrix] = useState("");
  const niveau = selectedNiveau !== undefined ? selectedNiveau : internalNiveau;
  const setNiveau = (n) => {setInternalNiveau(n);onSelectNiveau?.(n);};

  const prixRef = params.prixBienNegocieRef || params.prixBienFAI || 0;
  const scenarios = useMemo(
    () => NIVEAUX.map((n) => ({ niveau: n, prix: prixRef * (1 - n / 100), data: computeScenario(params, prixRef * (1 - n / 100)) })),
    [params, prixRef]
  );

  const customActive = customPrix !== "" && !isNaN(Number(customPrix)) && Number(customPrix) > 0;
  const customData = useMemo(
    () => customActive ? computeScenario(params, Number(customPrix)) : null,
    [params, customPrix, customActive]
  );

  const selected = customActive ?
  { niveau: "custom", data: customData } :
  scenarios.find((s) => s.niveau === niveau) || scenarios[0];

  return (
    <div className="space-y-4">
      {/* Niveaux de négociation */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="w-4 h-4 text-[#33d6c0]" />
          <h3 className="text-sm text-white font-medium">Simuler une négociation</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {scenarios.map((s) =>
          <button
            key={s.niveau}
            onClick={() => {setCustomPrix("");setNiveau(s.niveau);}}
            className={`flex flex-col items-center px-4 py-2.5 rounded-md border transition-all duration-300 min-w-[96px] ${
            !customActive && niveau === s.niveau ?
            "bg-[#33d6c0]/15 border-[#33d6c0]/50 text-white" :
            "bg-[#141414] border-[#1c2725] text-gray-400 hover:border-white/[0.2]"}`
            }>
            
              <span className="text-base tabular-nums text-[hsl(var(--background))]">-{s.niveau}%</span>
              <span className="text-[10px] tabular-nums text-[hsl(var(--border))]">{formatCurrency(s.data.prixNegocie)}</span>
            </button>
          )}
          <div className={`flex flex-col justify-center px-4 py-2 rounded-md border transition-all duration-300 min-w-[140px] ${customActive ? "bg-[#33d6c0]/15 border-[#33d6c0]/50" : "bg-[#141414] border-[#1c2725]"}`}>
            <span className="text-[10px] text-gray-500 mb-1">Prix personnalisé</span>
            <input
              type="number"
              value={customPrix}
              onChange={(e) => setCustomPrix(e.target.value)}
              placeholder={formatCurrency(prixRef)}
              className="sim-num-input bg-transparent text-white text-base tabular-nums w-full outline-none placeholder:text-gray-600" />
            
          </div>
        </div>
      </div>

      {/* Détail du scénario sélectionné */}
      <div key={selected.niveau} className="rounded-md border border-[#1c2725] bg-[#0f0f0f] p-4 animate-in fade-in duration-300">
        <p className="text-[10px] uppercase tracking-[0.18em] mb-3 text-[hsl(var(--background))]">
          Scénario sélectionné · {selected.niveau === "custom" ? "Prix personnalisé" : `Négociation -${selected.niveau}%`}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCell label="Prix négocié" value={formatCurrency(selected.data.prixNegocie)} highlight />
          <StatCell label="Prix de revient" value={formatCurrency(selected.data.prixRevient)} />
          <StatCell label="Apport estimé" value={formatCurrency(selected.data.apport)} />
          <StatCell label="Montant emprunt" value={formatCurrency(selected.data.montantEmprunt)} />
          <StatCell label="Échéance / mois" value={formatCurrency(selected.data.echeanceMensuelle)} />
          <StatCell label="Rendement brut" value={`${selected.data.rendementBrut} %`} highlight />
          <StatCell label="Prix vente net" value={formatCurrency(selected.data.prixVenteNet)} />
          <StatCell label="Marge brute revente" value={formatCurrency(selected.data.margeBrute)} highlight />
        </div>
      </div>

      {/* Comparatif de tous les niveaux */}
      <div className="rounded-md border border-[#1c2725] bg-[#0f0f0f] overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs table-fixed">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[23%]" />
            <col className="w-[23%]" />
            <col className="w-[17%]" />
            <col className="w-[23%]" />
          </colgroup>
          <thead>
            <tr className="text-gray-500 border-b border-[#1c2725]">
              <th className="text-left font-normal px-3 py-2">Négociation</th>
              <th className="text-right font-normal px-3 py-2">Prix négocié</th>
              <th className="text-right font-normal px-3 py-2">Prix revient</th>
              <th className="text-right font-normal px-3 py-2">Rdt brut</th>
              <th className="text-right font-normal px-3 py-2">Marge brute</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => {
              return (
                <tr
                  key={s.niveau}
                  onClick={() => setNiveau(s.niveau)}
                  className={`cursor-pointer border-b border-[#131c1b] transition-colors duration-200 ${niveau === s.niveau ? "bg-[#33d6c0]/10" : "hover:bg-white/[0.03]"}`}>
                  
                  <td className="px-3 py-2 text-white">-{s.niveau}%</td>
                  <td className="px-3 py-2 text-right text-gray-300 tabular-nums">{formatCurrency(s.data.prixNegocie)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 tabular-nums">{formatCurrency(s.data.prixRevient)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 tabular-nums">{s.data.rendementBrut} %</td>
                  <td className="px-3 py-2 text-right text-gray-300 tabular-nums">{formatCurrency(s.data.margeBrute)}</td>
                </tr>);

            })}
          </tbody>
        </table>
      </div>
    </div>);

}