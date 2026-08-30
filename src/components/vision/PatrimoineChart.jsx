import React, { useState, useRef } from "react";
import { GlowingEffect } from "@/components/ui/glowing-effect";

export const PatrimoineChart = React.memo(function PatrimoineChart({ data }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const chartRef = useRef(null);
  
  // Set default hover to year 20 once data is loaded
  React.useEffect(() => {
    if (data && data.length >= 20 && hoveredIndex === null) {
      setHoveredIndex(19);
    }
  }, [data, hoveredIndex]);
  
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => Math.max(d.patrimoine, d.capitalRestant)));
  const minValue = Math.min(...data.map((d) => Math.min(d.patrimoine, d.capitalRestant)));
  const chartHeight = 280;
  const chartWidth = 500;
  const padding = { top: 40, bottom: 40, left: 70, right: 10 };
  
  // Générer les ticks pour l'axe Y
  const yTicks = [];
  const yRange = maxValue - minValue;
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    yTicks.push(minValue + (yRange * i / tickCount));
  }

  const getY = (value) => {
    const range = maxValue - minValue;
    const normalized = (value - minValue) / range;
    return chartHeight - padding.bottom - normalized * (chartHeight - padding.top - padding.bottom);
  };

  const getX = (index) => {
    return padding.left + (index / (data.length - 1)) * (chartWidth - padding.left - padding.right);
  };

  const generatePath = (dataKey) => {
    const points = data.map((d, i) => ({ x: getX(i), y: getY(d[dataKey]) }));
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

  const generateAreaPath = () => {
    const linePath = generatePath('patrimoine');
    const lastPoint = data.length - 1;
    return `${linePath} L ${getX(lastPoint)} ${chartHeight - padding.bottom} L ${getX(0)} ${chartHeight - padding.bottom} Z`;
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

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  const formatValue = (value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M€`;
    return `${(value / 1000).toFixed(0)}K€`;
  };

  const formatYAxis = (value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${Math.round(value / 1000)}K`;
    return value;
  };

  return (
    <div className="relative">
      <div className="relative overflow-hidden p-6">
        <div className="mb-4 h-[72px]">
          <p className="text-sm font-medium text-[#9298a6]">Évolution du patrimoine financier et immobilier</p>
          {hoveredIndex !== null && data[hoveredIndex] && (
            <div className="mt-1 flex items-baseline gap-4">
              <div>
                <span className="text-xs text-[#9298a6]">Patrimoine</span>
                <h2 className="text-3xl font-semibold text-[#96c0b8]">
                  {formatValue(data[hoveredIndex].patrimoine)}
                </h2>
              </div>
              <div>
                <span className="text-xs text-[#9298a6]">Dette</span>
                <h2 className="text-3xl font-semibold text-red-400">
                  {formatValue(data[hoveredIndex].capitalRestant)}
                </h2>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <svg
            ref={chartRef}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: "default" }}
          >
            <defs>
              <linearGradient id="patrimoineAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#96c0b8" stopOpacity="0.35" />
                <stop offset="50%" stopColor="#96c0b8" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#96c0b8" stopOpacity="0.02" />
              </linearGradient>
              <filter id="patrimoineGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Axe Y - Lignes horizontales et labels */}
            {yTicks.map((tick, i) => (
              <g key={`ytick-${i}`}>
                <line
                  x1={padding.left}
                  y1={getY(tick)}
                  x2={chartWidth - padding.right}
                  y2={getY(tick)}
                  stroke="#2c3139"
                  strokeWidth="1"
                  strokeDasharray="3 5"
                  opacity={0.3}
                />
                <text
                  x={padding.left - 10}
                  y={getY(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="#9298a6"
                  fontSize="10"
                  fontWeight="500"
                >
                  {formatYAxis(tick)}
                </text>
              </g>
            ))}

            {/* Vertical lines every 5 years */}
            {data.map((d, i) => {
              if (i % 5 === 0 || i === data.length - 1) {
                return (
                  <line
                    key={i}
                    x1={getX(i)}
                    y1={padding.top}
                    x2={getX(i)}
                    y2={chartHeight - padding.bottom}
                    stroke="#2c3139"
                    strokeWidth="1"
                    strokeDasharray="3 5"
                    opacity={hoveredIndex === i ? 0.8 : 0.3}
                  />
                );
              }
              return null;
            })}

            <path d={generateAreaPath()} fill="url(#patrimoineAreaGradient)" />

            <path
              d={generatePath('patrimoine')}
              fill="none"
              stroke="#96c0b8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <path
              d={generatePath('capitalRestant')}
              fill="none"
              stroke="#e8746a"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="8 4"
            />

            {hoveredIndex !== null && (
              <g>
                {/* Point patrimoine (vert) */}
                <circle
                  cx={getX(hoveredIndex)}
                  cy={getY(data[hoveredIndex].patrimoine)}
                  r="12"
                  fill="#262627"
                  opacity="0.5"
                />
                <circle
                  cx={getX(hoveredIndex)}
                  cy={getY(data[hoveredIndex].patrimoine)}
                  r="8"
                  fill="#262627"
                  stroke="#96c0b8"
                  strokeWidth="3"
                  filter="url(#patrimoineGlow)"
                />
                
                {/* Point capital restant (rouge) */}
                <circle
                  cx={getX(hoveredIndex)}
                  cy={getY(data[hoveredIndex].capitalRestant)}
                  r="12"
                  fill="#262627"
                  opacity="0.5"
                />
                <circle
                  cx={getX(hoveredIndex)}
                  cy={getY(data[hoveredIndex].capitalRestant)}
                  r="8"
                  fill="#262627"
                  stroke="#e8746a"
                  strokeWidth="3"
                  filter="url(#patrimoineGlow)"
                />
              </g>
            )}

            {/* Labels every 5 years */}
            {data.map((d, i) => {
              if (i % 5 === 0 || i === data.length - 1) {
                return (
                  <text
                    key={i}
                    x={getX(i)}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    fill="#9298a6"
                    fontSize="11"
                    fontWeight="500"
                  >
                    An {d.annee}
                  </text>
                );
              }
              return null;
            })}
          </svg>


        </div>
        </div>
        </div>
        );
        });