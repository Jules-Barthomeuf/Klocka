import React, { useState, useMemo } from "react";
import { ArrowUpDown } from "lucide-react";

// Niveaux de revalorisation du loyer (en % vs loyer initial HT HC).
const NIVEAUX = [-10, -5, 0, 5, 10, 15, 20];

function PMT(rate, nper, pv) {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
}

// Recalcul allégé des indicateurs clés en fonction d'un loyer initial donné.
// Le prix d'acquisition / crédit ne bougent pas : seul le loyer (et donc revenus + valeur de revente) varie.
function computeLoyer(params, loyerInitial) {
  const {
    prixBienFAI, apport: apportBase, prixBienNegocieRef,
    tauxDroitsEnregistrement, tauxFeesKlocka, feesKlockaType, tauxIncentiveKlocka,
    fraisDossierBancaire, coutCreationSociete, fraisCourtage,
    dureeCredit, tauxInteret, indexation,
    anneeRevente, tauxCommissionAgentRevente, rendementBrutAcheteur,
  } = params;

  const prixNegocie = prixBienNegocieRef || prixBienFAI || 0;
  const feesKlocka = feesKlockaType === "fixe" ? tauxFeesKlocka : prixNegocie * (tauxFeesKlocka / 100);
  const incentiveKlocka = (prixBienFAI - prixNegocie) * (tauxIncentiveKlocka / 100);
  const totalFraisKlocka = feesKlocka + incentiveKlocka;
  const droitsEnregistrement = prixNegocie * (tauxDroitsEnregistrement / 100);
  const fraisDivers = fraisDossierBancaire + coutCreationSociete + fraisCourtage;
  const prixRevient = prixNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers;

  const ratioApport = prixBienNegocieRef > 0 ? apportBase / prixBienNegocieRef : 0.15;
  const apport = Math.round(prixRevient * (ratioApport > 0 ? Math.min(ratioApport, 1) : 0.15));
  const montantEmprunt = Math.max(0, prixRevient - apport);
  const echeanceMensuelle = montantEmprunt > 0 ? Math.abs(PMT(tauxInteret / 100 / 12, dureeCredit * 12, montantEmprunt)) : 0;

  // Loyer indexé à l'année de revente
  let loyerRevente = loyerInitial;
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
  const rendementBrut = prixRevient > 0 ? (loyerInitial / prixRevient) * 100 : 0;
  const creationRichesse = prixVenteNet - capitalRestant - apport;
  const cashflowMensuel = loyerInitial / 12 - echeanceMensuelle;

  return {
    loyerInitial: Math.round(loyerInitial),
    loyerMensuel: Math.round(loyerInitial / 12),
    loyerRevente: Math.round(loyerRevente),
    rendementBrut: rendementBrut.toFixed(2),
    echeanceMensuelle: Math.round(echeanceMensuelle),
    cashflowMensuel: Math.round(cashflowMensuel),
    prixVenteNet: Math.round(prixVenteNet),
    margeBrute: Math.round(margeBrute),
    creationRichesse: Math.round(creationRichesse),
  };
}

function StatCell({ label, value, highlight, negative }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className={`text-sm tabular-nums ${negative ? "text-red-400" : highlight ? "text-[#2A9D8F]" : "text-white"}`}>{value}</span>
    </div>
  );
}

export default function SimLoyerRenego({ params, formatCurrency }) {
  const [niveau, setNiveau] = useState(0);
  const [customLoyer, setCustomLoyer] = useState("");

  const loyerRef = params.loyerInitialHTHC || 0;
  const scenarios = useMemo(
    () => NIVEAUX.map((n) => ({ niveau: n, loyer: loyerRef * (1 + n / 100), data: computeLoyer(params, loyerRef * (1 + n / 100)) })),
    [params, loyerRef]
  );

  const customActive = customLoyer !== "" && !isNaN(Number(customLoyer)) && Number(customLoyer) > 0;
  const customData = useMemo(
    () => (customActive ? computeLoyer(params, Number(customLoyer)) : null),
    [params, customLoyer, customActive]
  );

  const selected = customActive
    ? { niveau: "custom", data: customData }
    : scenarios.find((s) => s.niveau === niveau) || scenarios.find((s) => s.niveau === 0);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ArrowUpDown className="w-4 h-4 text-[#2A9D8F]" />
          <h3 className="text-sm text-white font-medium">Simuler une renégociation du loyer</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Effet d'une revalorisation (ou baisse) du loyer sur le rendement, le cash-flow et la valeur de revente.
        </p>
        <div className="flex flex-wrap gap-2">
          {scenarios.map((s) => (
            <button
              key={s.niveau}
              onClick={() => { setCustomLoyer(""); setNiveau(s.niveau); }}
              className={`flex flex-col items-center px-4 py-2.5 rounded-xl border transition-all duration-300 min-w-[96px] ${
                !customActive && niveau === s.niveau
                  ? "bg-[#2A9D8F]/15 border-[#2A9D8F]/50 text-white"
                  : "bg-[#141414] border-white/[0.08] text-gray-400 hover:border-white/[0.2]"
              }`}
            >
              <span className="text-base tabular-nums">{s.niveau > 0 ? "+" : ""}{s.niveau}%</span>
              <span className="text-[10px] text-gray-500 tabular-nums">{formatCurrency(s.data.loyerInitial)}/an</span>
            </button>
          ))}
          <div className={`flex flex-col justify-center px-4 py-2 rounded-xl border transition-all duration-300 min-w-[140px] ${customActive ? "bg-[#2A9D8F]/15 border-[#2A9D8F]/50" : "bg-[#141414] border-white/[0.08]"}`}>
            <span className="text-[10px] text-gray-500 mb-1">Loyer personnalisé /an</span>
            <input
              type="number"
              value={customLoyer}
              onChange={(e) => setCustomLoyer(e.target.value)}
              placeholder={formatCurrency(loyerRef)}
              className="sim-num-input bg-transparent text-white text-base tabular-nums w-full outline-none placeholder:text-gray-600"
            />
          </div>
        </div>
      </div>

      {/* Détail du scénario sélectionné */}
      <div key={selected.niveau} className="rounded-xl border border-white/[0.08] bg-[#0f0f0f] p-4 animate-in fade-in duration-300">
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-600 mb-3">
          {selected.niveau === "custom" ? "Loyer personnalisé" : `Loyer revalorisé · ${selected.niveau > 0 ? "+" : ""}${selected.niveau}%`}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCell label="Loyer annuel HT" value={formatCurrency(selected.data.loyerInitial)} highlight />
          <StatCell label="Loyer mensuel" value={formatCurrency(selected.data.loyerMensuel)} />
          <StatCell label="Rendement brut" value={`${selected.data.rendementBrut} %`} highlight />
          <StatCell label="Échéance / mois" value={formatCurrency(selected.data.echeanceMensuelle)} />
          <StatCell label="Cash-flow / mois" value={formatCurrency(selected.data.cashflowMensuel)} negative={selected.data.cashflowMensuel < 0} highlight={selected.data.cashflowMensuel >= 0} />
          <StatCell label={`Loyer an ${params.anneeRevente}`} value={formatCurrency(selected.data.loyerRevente)} />
          <StatCell label="Prix vente net" value={formatCurrency(selected.data.prixVenteNet)} />
          <StatCell label="Marge brute revente" value={formatCurrency(selected.data.margeBrute)} highlight />
        </div>
      </div>

      {/* Comparatif de tous les niveaux */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0f0f0f] overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/[0.08]">
              <th className="text-left font-normal px-3 py-2">Revalorisation</th>
              <th className="text-right font-normal px-3 py-2">Loyer / an</th>
              <th className="text-right font-normal px-3 py-2">Rdt brut</th>
              <th className="text-right font-normal px-3 py-2">Cash-flow/mois</th>
              <th className="text-right font-normal px-3 py-2">Prix vente net</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => {
              return (
                <tr
                  key={s.niveau}
                  onClick={() => setNiveau(s.niveau)}
                  className={`cursor-pointer border-b border-white/[0.04] transition-colors duration-200 ${niveau === s.niveau ? "bg-[#2A9D8F]/10" : "hover:bg-white/[0.03]"}`}
                >
                  <td className="px-3 py-2 text-white">{s.niveau > 0 ? "+" : ""}{s.niveau}%</td>
                  <td className="px-3 py-2 text-right text-gray-300 tabular-nums">{formatCurrency(s.data.loyerInitial)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 tabular-nums">{s.data.rendementBrut} %</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${s.data.cashflowMensuel < 0 ? "text-red-400" : "text-gray-300"}`}>{formatCurrency(s.data.cashflowMensuel)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 tabular-nums">{formatCurrency(s.data.prixVenteNet)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}