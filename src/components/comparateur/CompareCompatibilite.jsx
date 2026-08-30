import React, { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Sparkles, User, AlertTriangle, CheckCircle2 } from "lucide-react";

const profilConfig = {
  equilibriste: {
    label: "L'Équilibriste",
    icon: Target,
    color: "#8fa0f2",
    description: "Recherche un équilibre entre rendement et sécurité, privilégie les projets modérés avec un bon cashflow.",
    weights: {
      rendement: 0.25,
      securite: 0.30,
      cashflow: 0.25,
      budget: 0.20,
    },
    preferences: {
      rendementIdeal: [5, 8],
      cashflowPositif: true,
      villeReputee: false,
    }
  },
  risk_taker: {
    label: "Risk Taker",
    icon: TrendingUp,
    color: "#e8746a",
    description: "Privilégie le rendement maximal et la création de richesse, accepte plus de risque.",
    weights: {
      rendement: 0.40,
      securite: 0.10,
      cashflow: 0.15,
      budget: 0.35,
    },
    preferences: {
      rendementIdeal: [7, 15],
      cashflowPositif: false,
      villeReputee: false,
    }
  },
  collectionneur: {
    label: "Le Collectionneur",
    icon: Sparkles,
    color: "#A855F7",
    description: "Préfère des biens d'exception dans des emplacements premium, rendement modéré accepté.",
    weights: {
      rendement: 0.10,
      securite: 0.40,
      cashflow: 0.15,
      budget: 0.35,
    },
    preferences: {
      rendementIdeal: [3, 6],
      cashflowPositif: false,
      villeReputee: true,
    }
  },
  visionnaire: {
    label: "Le Visionnaire",
    icon: User,
    color: "#22C55E",
    description: "Investit sur le long terme, mise sur la plus-value et la création de richesse.",
    weights: {
      rendement: 0.20,
      securite: 0.20,
      cashflow: 0.10,
      budget: 0.50,
    },
    preferences: {
      rendementIdeal: [5, 10],
      cashflowPositif: false,
      villeReputee: false,
    }
  },
};

const PIE_COLORS = ["#e8746a", "#22C55E", "#a9c5b9", "#A855F7"];

function computeScore(metric, profil, budgetMax) {
  const config = profilConfig[profil];
  if (!config) return 0;

  const w = config.weights;
  const prefs = config.preferences;

  // 1. Score rendement (0–100) : proximité à l'intervalle idéal
  const rdt = metric.rendementLocatifNet || 0;
  const [rMin, rMax] = prefs.rendementIdeal;
  let scoreRendement = 0;
  if (rdt >= rMin && rdt <= rMax) {
    scoreRendement = 100;
  } else if (rdt < rMin) {
    scoreRendement = Math.max(0, 100 - (rMin - rdt) * 20);
  } else {
    // Au-dessus du max : pour le collectionneur c'est un malus, pour risk_taker c'est ok
    if (profil === "collectionneur") {
      scoreRendement = Math.max(0, 100 - (rdt - rMax) * 25);
    } else {
      scoreRendement = Math.max(0, 100 - (rdt - rMax) * 10);
    }
  }

  // 2. Score sécurité (0–100) : ancienneté locataire, bail restant, multiple fonds propres
  let scoreSecurite = 50; // base
  if (metric.ancienneteLocataire != null && metric.ancienneteLocataire > 0) {
    scoreSecurite += Math.min(25, metric.ancienneteLocataire * 5);
  }
  if (metric.echeanceBail) {
    const now = new Date();
    const echeance = new Date(metric.echeanceBail);
    const anneesRestantes = (echeance - now) / (365.25 * 24 * 3600 * 1000);
    if (anneesRestantes > 5) scoreSecurite += 25;
    else if (anneesRestantes > 2) scoreSecurite += 15;
    else scoreSecurite += 5;
  }
  scoreSecurite = Math.min(100, scoreSecurite);

  // 3. Score cashflow (0–100)
  let scoreCashflow = 50;
  const cfCumule = metric.cashFlowCumule || 0;
  const annees = metric.anneeRevente || 20;
  const cfMoyenAn = annees > 0 ? cfCumule / annees : 0;
  if (cfMoyenAn > 5000) scoreCashflow = 100;
  else if (cfMoyenAn > 2000) scoreCashflow = 80;
  else if (cfMoyenAn > 0) scoreCashflow = 60;
  else if (cfMoyenAn > -2000) scoreCashflow = 40;
  else scoreCashflow = 20;

  if (prefs.cashflowPositif && cfMoyenAn < 0) {
    scoreCashflow *= 0.5;
  }

  // 4. Score budget (0–100) : le projet respecte-t-il le budget max ?
  let scoreBudget = 100;
  if (budgetMax && budgetMax > 0) {
    const prix = metric.prixRevient || 0;
    if (prix <= budgetMax) {
      scoreBudget = 100;
    } else {
      const depassement = ((prix - budgetMax) / budgetMax) * 100;
      scoreBudget = Math.max(0, 100 - depassement * 2);
    }
  }

  // Score global pondéré
  const total = 
    scoreRendement * w.rendement +
    scoreSecurite * w.securite +
    scoreCashflow * w.cashflow +
    scoreBudget * w.budget;

  return {
    total: Math.round(total),
    details: {
      rendement: Math.round(scoreRendement),
      securite: Math.round(scoreSecurite),
      cashflow: Math.round(scoreCashflow),
      budget: Math.round(scoreBudget),
    }
  };
}

export default function CompareCompatibilite({ metrics, userProfil, budgetMax }) {
  const config = profilConfig[userProfil];

  const scores = useMemo(() => {
    if (!userProfil || !config) return [];
    return metrics.map((m) => ({
      titre: m.titre,
      ...computeScore(m, userProfil, budgetMax),
    }));
  }, [metrics, userProfil, budgetMax, config]);

  if (!userProfil || !config) {
    return (
      <div className="text-center py-16 bg-[#000000] rounded-md border border-[#1f2228]">
        <AlertTriangle className="w-10 h-10 text-[#a9c5b9]/50 mx-auto mb-4" />
        <p className="text-[#f2f3f5]/40 text-sm">Aucun profil investisseur n'est défini pour votre compte.</p>
        <p className="text-[#f2f3f5]/20 text-xs mt-1">Contactez votre conseiller pour le configurer.</p>
      </div>
    );
  }

  const totalAllScores = scores.reduce((s, sc) => s + sc.total, 0);
  const pieData = scores.map((sc, i) => ({
    name: sc.titre,
    value: sc.total,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  const Icon = config.icon;
  const bestIdx = scores.reduce((best, sc, i) => sc.total > (scores[best]?.total || 0) ? i : best, 0);

  return (
    <div className="space-y-6">
      {/* Profil header */}
      <div className="bg-[#000000] rounded-md border border-[#1f2228] p-6">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-12 h-12 rounded-md flex items-center justify-center" style={{ backgroundColor: config.color + "20" }}>
            <Icon className="w-6 h-6" style={{ color: config.color }} />
          </div>
          <div>
            <p className="text-[#f2f3f5]/40 text-[10px] uppercase tracking-[0.2em]">Votre profil investisseur</p>
            <h3 className="text-xl text-[#f2f3f5] font-light">{config.label}</h3>
          </div>
          {budgetMax > 0 && (
            <Badge className="ml-auto bg-[#f2f3f5]/5 text-[#f2f3f5]/60 border border-[#1f2228] text-xs">
              Budget max : {Math.round(budgetMax).toLocaleString("fr-FR")} €
            </Badge>
          )}
        </div>
        <p className="text-[#f2f3f5]/30 text-sm">{config.description}</p>

        {/* Pondérations */}
        <div className="flex gap-3 mt-4 flex-wrap">
          {[
            { key: "rendement", label: "Rendement" },
            { key: "securite", label: "Sécurité" },
            { key: "cashflow", label: "Cashflow" },
            { key: "budget", label: "Budget" },
          ].map(({ key, label }) => (
            <div key={key} className="px-3 py-1.5 rounded-lg bg-[#f2f3f5]/[0.03] border border-[#1f2228] text-xs">
              <span className="text-[#f2f3f5]/40">{label}</span>
              <span className="text-[#f2f3f5] ml-2 font-medium">{Math.round(config.weights[key] * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pie chart + détails */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="bg-[#000000] rounded-md border border-[#1f2228] p-6">
          <p className="text-[#f2f3f5]/40 text-xs uppercase tracking-[0.15em] mb-4">Compatibilité relative</p>
          <div className="relative">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={75}
                  outerRadius={110}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0];
                      const pct = totalAllScores > 0 ? ((d.value / totalAllScores) * 100).toFixed(1) : 0;
                      return (
                        <div className="bg-[#0c0d10] border border-[#22262d] rounded-lg p-3 text-[#f2f3f5] text-sm">
                          <p className="font-medium">{d.name}</p>
                          <p className="text-[#f2f3f5]/60">Score : {d.value}/100</p>
                          <p className="text-[#f2f3f5]/60">Part : {pct}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-2xl font-light text-[#f2f3f5]">{scores[bestIdx]?.total || 0}<span className="text-sm text-[#f2f3f5]/40">/100</span></p>
                <p className="text-[10px] text-[#f2f3f5]/30 uppercase tracking-wider">Meilleur score</p>
              </div>
            </div>
          </div>

          {/* Légende */}
          <div className="flex flex-wrap gap-3 mt-4 justify-center">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-[#f2f3f5]/50 text-xs">{d.name}</span>
                <span className="text-[#f2f3f5] text-xs font-medium">
                  {totalAllScores > 0 ? ((d.value / totalAllScores) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Détails par projet */}
        <div className="space-y-4">
          {scores.map((sc, i) => {
            const isBest = i === bestIdx;
            const color = PIE_COLORS[i % PIE_COLORS.length];
            return (
              <div
                key={i}
                className={`bg-[#000000] rounded-md border p-5 transition-all ${
                  isBest ? "border-[#8fa0f2]/50 ring-1 ring-[#8fa0f2]/20" : "border-[#1f2228]"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <h4 className="text-[#f2f3f5] font-light">{sc.titre}</h4>
                    {isBest && (
                      <Badge className="bg-[#8fa0f2]/20 text-[#8fa0f2] text-[10px] border-0">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Meilleur choix
                      </Badge>
                    )}
                  </div>
                  <span className="text-2xl font-light text-[#f2f3f5]">
                    {sc.total}<span className="text-sm text-[#f2f3f5]/30">/100</span>
                  </span>
                </div>

                {/* Barres de détail */}
                <div className="space-y-2.5">
                  {[
                    { key: "rendement", label: "Rendement" },
                    { key: "securite", label: "Sécurité" },
                    { key: "cashflow", label: "Cashflow" },
                    { key: "budget", label: "Budget" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[#f2f3f5]/40 text-[11px]">{label}</span>
                        <span className="text-[#f2f3f5]/60 text-[11px]">{sc.details[key]}/100</span>
                      </div>
                      <div className="h-1.5 bg-[#f2f3f5]/[0.04] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${sc.details[key]}%`,
                            backgroundColor: sc.details[key] >= 70 ? "#22C55E" : sc.details[key] >= 40 ? "#a9c5b9" : "#e8746a",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}