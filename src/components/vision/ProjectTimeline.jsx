import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useInView, useMotionValue, useSpring } from "framer-motion";
import { GlowingEffect } from "@/components/ui/glowing-effect";


// Hook pour animer les chiffres
function useCountUp(end, isInView, duration = 2) {
  const [value, setValue] = useState(0);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { duration: duration * 1000, bounce: 0 });

  useEffect(() => {
    if (isInView) {
      motionValue.set(end);
    }
  }, [end, isInView, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      setValue(Math.round(latest));
    });
    return unsubscribe;
  }, [springValue]);

  return value;
}

function IndividualProjectChart({ donneesProjet }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const chartRef = useRef(null);
  
  const data = donneesProjet.patrimoine.map((pat, i) => ({
    annee: i + 1,
    patrimoine: pat,
    cashflow: donneesProjet.cashflow[i],
    capital_restant: donneesProjet.capital_restant[i]
  }));

  const maxPatrimoine = Math.max(...data.map(d => d.patrimoine));
  const minPatrimoine = Math.min(...data.map(d => d.patrimoine));
  const maxCashflow = Math.max(...data.map(d => d.cashflow));
  const minCashflow = Math.min(...data.map(d => d.cashflow));

  const chartHeight = 180;
  const chartWidth = 400;
  const padding = { top: 20, bottom: 30, left: 5, right: 5 };
  
  // Afficher par défaut l'année 30
  const defaultIndex = Math.min(29, data.length - 1);
  const displayIndex = hoveredIndex !== null ? hoveredIndex : defaultIndex;

  const getYPatrimoine = (value) => {
    const range = maxPatrimoine - minPatrimoine;
    const normalized = (value - minPatrimoine) / range;
    return chartHeight - padding.bottom - normalized * (chartHeight - padding.top - padding.bottom);
  };

  const getYCashflow = (value) => {
    const range = maxCashflow - minCashflow;
    const normalized = (value - minCashflow) / range;
    return chartHeight - padding.bottom - normalized * (chartHeight - padding.top - padding.bottom);
  };

  const getX = (index) => {
    return padding.left + (index / (data.length - 1)) * (chartWidth - padding.left - padding.right);
  };

  const generatePath = (dataKey, yGetter) => {
    const points = data.map((d, i) => ({ x: getX(i), y: yGetter(d[dataKey]) }));
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const tension = 0.35;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  };

  const handleMouseMove = (e) => {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const relativeX = (x / rect.width) * chartWidth;
    let closestIndex = 0;
    let closestDist = Number.POSITIVE_INFINITY;
    data.forEach((_, i) => {
      const dist = Math.abs(getX(i) - relativeX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    });
    setHoveredIndex(closestIndex);
  };

  const formatValue = (value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M€`;
    return `${Math.round(value / 1000)}K€`;
  };

  return (
    <div className="space-y-4">
      {/* Patrimoine Chart */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Évolution du patrimoine</p>
        <svg
          ref={chartRef}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-32"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* Patrimoine line */}
          <path
            d={generatePath('patrimoine', getYPatrimoine)}
            fill="none"
            stroke="#33d6c0"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Capital restant line (dashed) */}
          <path
            d={generatePath('capital_restant', getYPatrimoine)}
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5 3"
          />
          
          {/* Years labels */}
          {data.map((d, i) => {
            if (i % 5 === 0 || i === data.length - 1) {
              return (
                <text
                  key={i}
                  x={getX(i)}
                  y={chartHeight - 10}
                  textAnchor="middle"
                  className="text-[10px] fill-gray-500"
                >
                  An {d.annee}
                </text>
              );
            }
            return null;
          })}
          
          {/* Active point */}
          <>
            <circle
              cx={getX(displayIndex)}
              cy={getYPatrimoine(data[displayIndex].patrimoine)}
              r="5"
              fill="#33d6c0"
            />
            <circle
              cx={getX(displayIndex)}
              cy={getYPatrimoine(data[displayIndex].capital_restant)}
              r="5"
              fill="#ef4444"
            />
          </>
        </svg>
        <div className="text-sm space-y-1 mt-2">
          <p className="text-[#f4be7e]">Patrimoine: {formatValue(data[displayIndex].patrimoine)}</p>
          <p className="text-red-400">Dette: {formatValue(data[displayIndex].capital_restant)}</p>
        </div>
      </div>

      {/* Cashflow Chart */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Cashflow annuel</p>
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-32"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <path
            d={generatePath('cashflow', getYCashflow)}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Years labels */}
          {data.map((d, i) => {
            if (i % 5 === 0 || i === data.length - 1) {
              return (
                <text
                  key={i}
                  x={getX(i)}
                  y={chartHeight - 10}
                  textAnchor="middle"
                  className="text-[10px] fill-gray-500"
                >
                  An {d.annee}
                </text>
              );
            }
            return null;
          })}
          
          {/* Active point */}
          <circle
            cx={getX(displayIndex)}
            cy={getYCashflow(data[displayIndex].cashflow)}
            r="5"
            fill="#3b82f6"
          />
        </svg>
        <p className={`text-sm mt-2 ${data[displayIndex].cashflow >= 0 ? 'text-[#5ee7d4]' : 'text-red-400'}`}>
          An {data[displayIndex].annee}: {formatValue(data[displayIndex].cashflow)}
        </p>
      </div>
    </div>
  );
}

export function ProjectTimeline({ projets, strategiesData, typeStrategie, frequence, chartData, revenusMensuels }) {
  const [selectedYear, setSelectedYear] = useState(19);
  const statsRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true, margin: "-100px" });

  const selectedData = chartData?.[selectedYear];

  const animatedPatrimoine = useCountUp(selectedData?.patrimoine || 0, statsInView, 2.5);
  const animatedCashflow = useCountUp(selectedData?.cashflow || 0, statsInView, 2.5);
  const animatedCashflowMensuel = useCountUp(selectedData ? selectedData.cashflow / 12 : 0, statsInView, 2.5);

  if (!projets || projets.length === 0 || !chartData) return null;
  
  const formatValue = (value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M€`;
    return `${Math.round(value / 1000)}K€`;
  };

  // Calculer l'année où on atteint les revenus mensuels souhaités
  const targetYear = revenusMensuels ? chartData.findIndex(data => {
    const cashflowMensuel = data.cashflow / 12;
    return cashflowMensuel >= parseInt(revenusMensuels);
  }) : -1;

  // Calculer l'apport total
  const apportData = {
    "200": 35100, "300": 52500, "400": 69900, "500": 87300,
    "700": 122100, "1000": 174300, "1200": 209100
  };
  const apportTotal = projets.reduce((sum, p) => sum + apportData[p.taille], 0);

  // Trouver l'année de récupération de l'apport (patrimoine >= apport)
  const apportRecupYear = chartData.findIndex(data => data.patrimoine >= apportTotal);

  // Trouver l'année où dette croise patrimoine (dette <= patrimoine)
  const crossoverYear = chartData.findIndex(data => data.capitalRestant <= data.patrimoine);

  // Trouver l'année où la dette est totalement remboursée
  const debtFullyPaidYear = chartData.findIndex(data => data.capitalRestant === 0);

  // Créer les jalons importants
  const milestones = [];
  
  projets.forEach((p, idx) => {
    const annee = idx * frequence + 1;
    if (annee <= 30) {
      milestones.push({
        annee,
        type: 'projet',
        label: `Projet ${idx + 1}`,
        montant: p.taille >= 1000 ? `${p.taille / 1000}M€` : `${p.taille}K€`,
        color: '#f4be7e'
      });
    }
  });

  if (apportRecupYear >= 0 && apportRecupYear <= 30) {
    milestones.push({
      annee: apportRecupYear,
      type: 'apport',
      label: 'Apport récupéré',
      montant: formatValue(apportTotal),
      color: '#33d6c0'
    });
  }

  if (targetYear >= 0 && targetYear <= 30) {
    milestones.push({
      annee: targetYear,
      type: 'objectif',
      label: 'Objectif atteint',
      montant: `${parseInt(revenusMensuels).toLocaleString('fr-FR')}€/mois`,
      color: '#8b5cf6'
    });
  }

  if (crossoverYear >= 0 && crossoverYear <= 30) {
    milestones.push({
      annee: crossoverYear,
      type: 'equilibre',
      label: 'Équilibre dette/patrimoine',
      color: '#3b82f6'
    });
  }

  if (debtFullyPaidYear >= 0 && debtFullyPaidYear <= 30) {
    milestones.push({
      annee: debtFullyPaidYear,
      type: 'dette_zero',
      label: 'Dette remboursée',
      color: '#33d6c0'
    });
  }

  milestones.sort((a, b) => a.annee - b.annee);

  return (
    <div>
      <h3 className="text-2xl text-white font-geist font-semibold mb-8">Votre parcours d'investissement</h3>
      
      <div className="grid lg:grid-cols-[300px_1fr] gap-8">
        {/* Timeline verticale minimaliste */}
        <div className="relative">
          {/* Ligne verticale */}
          <div className="absolute left-6 top-0 bottom-0 w-[2px] bg-white/10"></div>
          
          {/* Progress bar */}
          <motion.div 
            className="absolute left-6 top-0 w-[2px] bg-gradient-to-b from-[#33d6c0] to-[#5ee7d4]"
            initial={{ height: 0 }}
            animate={{ height: `${(selectedYear / 30) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />

          {/* Points des années */}
          <div className="space-y-8 relative">
            {Array.from({ length: 31 }).map((_, annee) => {
              const isSelected = annee === selectedYear;
              const milestone = milestones.find(m => m.annee === annee);
              const isPassed = annee <= selectedYear;
              const isDecade = annee % 10 === 0;
              
              if (!milestone && !isDecade && !isSelected) return null;

              return (
                <motion.div 
                  key={annee}
                  className="flex items-center gap-4 cursor-pointer group"
                  onClick={() => setSelectedYear(annee)}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: annee * 0.02 }}
                >
                  {/* Point */}
                  <div className="relative flex-shrink-0">
                    {isSelected ? (
                      <div className="w-12 h-12 rounded-full bg-[#33d6c0] border-4 border-black flex items-center justify-center">
                        <span className="text-white text-sm font-bold">{annee}</span>
                      </div>
                    ) : milestone ? (
                      <div 
                        className="w-10 h-10 rounded-full border-4 border-black flex items-center justify-center"
                        style={{ backgroundColor: milestone.color }}
                      >
                        <span className="text-white text-xs font-bold">{annee}</span>
                      </div>
                    ) : (
                      <div className={`w-8 h-8 rounded-full border-2 border-black flex items-center justify-center ${isPassed ? 'bg-white/20' : 'bg-white/5'}`}>
                        <span className="text-white/60 text-xs">{annee}</span>
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  {milestone && (
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{milestone.label}</p>
                      {milestone.montant && (
                        <p className="text-white/60 text-xs">{milestone.montant}</p>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Indicateurs clés */}
        <AnimatePresence mode="wait">
          {selectedData && (
            <motion.div
              ref={statsRef}
              key={selectedYear}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              {/* Année sélectionnée */}
              <div className="mb-6">
                <p className="text-white/60 text-sm mb-1">Année sélectionnée</p>
                <h4 className="text-4xl font-bold text-white">Année {selectedData.annee}</h4>
              </div>

              {/* Patrimoine */}
              <div className="p-6 bg-white/5 rounded-md border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white/60 text-sm uppercase tracking-wider">Patrimoine net</p>
                  <div className="w-2 h-2 rounded-full bg-[#33d6c0]"></div>
                </div>
                <p className="text-3xl font-bold text-[#33d6c0]">{formatValue(animatedPatrimoine)}</p>
              </div>

              {/* Cashflow annuel */}
              <div className="p-6 bg-white/5 rounded-md border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white/60 text-sm uppercase tracking-wider">Cashflow annuel</p>
                  <div className={`w-2 h-2 rounded-full ${selectedData.cashflow >= 0 ? 'bg-[#33d6c0]' : 'bg-[#ef4444]'}`}></div>
                </div>
                <p className={`text-3xl font-bold ${selectedData.cashflow >= 0 ? 'text-[#33d6c0]' : 'text-[#ef4444]'}`}>
                  {formatValue(animatedCashflow)}
                </p>
              </div>

              {/* Cashflow mensuel */}
              <div className="p-6 bg-white/5 rounded-md border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white/60 text-sm uppercase tracking-wider">Cashflow mensuel</p>
                  <div className={`w-2 h-2 rounded-full ${selectedData.cashflow >= 0 ? 'bg-[#33d6c0]' : 'bg-[#ef4444]'}`}></div>
                </div>
                <p className={`text-3xl font-bold ${selectedData.cashflow >= 0 ? 'text-[#33d6c0]' : 'text-[#ef4444]'}`}>
                  {formatValue(animatedCashflowMensuel)}
                </p>
              </div>

              {/* Dette restante */}
              <div className="p-6 bg-white/5 rounded-md border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white/60 text-sm uppercase tracking-wider">Dette restante</p>
                  <div className="w-2 h-2 rounded-full bg-red-400"></div>
                </div>
                <p className="text-3xl font-bold text-red-400">
                  {formatValue(selectedData.capitalRestant || 0)}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}